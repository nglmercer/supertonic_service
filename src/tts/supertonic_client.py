"""
Supertonic TTS Client using ONNX models.
This is a Python implementation that mirrors the JS @huggingface/transformers client.
"""

from __future__ import annotations

import asyncio
import os
from pathlib import Path
from typing import Optional, Any, Dict, TYPE_CHECKING
import json

# Type checking imports
if TYPE_CHECKING:
    import numpy as np
    import onnxruntime as ort
    from .types import VoiceKey, Style, TTSConfig
else:
    # Lazy imports for heavy dependencies - these will only be imported when needed
    np = None
    ort = None

def _ensure_deps():
    """Ensure heavy dependencies are available."""
    global np, ort
    if np is None:
        import numpy as np
    if ort is None:
        import onnxruntime as ort

from .constants import BASE_URL, VOICES
from .utils import chunk_text
from .asset_manager import get_asset_manager


class SupertonicTTS:
    """
    Internal client for Supertonic TTS using ONNX models.
    Implements lazy initialization of the pipeline.
    """

    def __init__(self, default_voice: str = "F1", onnx_dir: Optional[str] = None, voice_styles_dir: Optional[str] = None):
        """
        Initialize SupertonicTTS client.

        Args:
            default_voice: Default voice key (F1-F5, M1-M5)
            onnx_dir: Custom directory for ONNX models (None = use auto-download)
            voice_styles_dir: Custom directory for voice styles (None = use auto-download)
        """
        self.default_voice = default_voice
        self.base_url = BASE_URL
        self._pipeline_initialized = False
        self.config: Optional[Any] = None
        self.text_processor: Optional[Any] = None
        self.dp_ort: Optional[Any] = None
        self.text_enc_ort: Optional[Any] = None
        self.vector_est_ort: Optional[Any] = None
        self.vocoder_ort: Optional[Any] = None
        self.sample_rate: int = 24000  # Default, will be updated from config
        self.base_chunk_size: int = 50
        self.chunk_compress_factor: int = 2
        self.ldim: int = 128
        self.onnx_dir = onnx_dir
        self.voice_styles_dir = voice_styles_dir
        self.asset_manager = get_asset_manager()

    async def _initialize_pipeline(self):
        """
        Initialize the TTS pipeline by loading ONNX models.
        This should be called before first use.
        """
        if self._pipeline_initialized:
            return

        # Ensure ONNX assets are available (download if missing)
        if self.onnx_dir is None:
            onnx_path = self.asset_manager.ensure_onnx_assets()
        else:
            onnx_path = Path(self.onnx_dir)
            # Even if custom dir, ensure it has required files
            onnx_path = self.asset_manager.ensure_onnx_assets(onnx_path)

        # Load configuration
        cfg_path = onnx_path / "tts.json"
        if not cfg_path.exists():
            raise FileNotFoundError(f"Configuration file not found: {cfg_path}")
        
        with open(cfg_path, "r") as f:
            cfgs = json.load(f)
        self.config = TTSConfig.from_dict(cfgs)
        self.sample_rate = self.config.ae_sample_rate
        self.base_chunk_size = self.config.ae_base_chunk_size
        self.chunk_compress_factor = self.config.ttl_chunk_compress_factor
        self.ldim = self.config.ttl_latent_dim

        # Ensure dependencies
        _ensure_deps()

        # Set up ONNX Runtime session options
        opts = ort.SessionOptions()
        providers = ["CPUExecutionProvider"]

        # Load ONNX models
        self.dp_ort = self._load_onnx(onnx_path / "duration_predictor.onnx", opts, providers)
        self.text_enc_ort = self._load_onnx(onnx_path / "text_encoder.onnx", opts, providers)
        self.vector_est_ort = self._load_onnx(onnx_path / "vector_estimator.onnx", opts, providers)
        self.vocoder_ort = self._load_onnx(onnx_path / "vocoder.onnx", opts, providers)

        # Load text processor (UnicodeProcessor)
        self.text_processor = self._load_text_processor(onnx_path)

        self._pipeline_initialized = True

    def _load_onnx(self, onnx_path: Path, opts: Any, providers: list[str]) -> Any:
        """Load an ONNX model."""
        return ort.InferenceSession(str(onnx_path), sess_options=opts, providers=providers)

    def _load_text_processor(self, onnx_dir: Path):
        """Load the Unicode processor."""
        unicode_indexer_path = onnx_dir / "unicode_indexer.json"
        if not unicode_indexer_path.exists():
            raise FileNotFoundError(f"Unicode indexer not found: {unicode_indexer_path}")
        return UnicodeProcessor(str(unicode_indexer_path))

    def _sample_noisy_latent(self, duration: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
        """
        Sample noisy latent vector for diffusion process.

        Args:
            duration: Duration predictions [bsz]

        Returns:
            Tuple of (noisy_latent, latent_mask)
        """
        bsz = len(duration)
        wav_len_max = duration.max() * self.sample_rate
        wav_lengths = (duration * self.sample_rate).astype(np.int64)
        chunk_size = self.base_chunk_size * self.chunk_compress_factor
        latent_len = ((wav_len_max + chunk_size - 1) / chunk_size).astype(np.int32)
        latent_dim = self.ldim * self.chunk_compress_factor
        noisy_latent = np.random.randn(bsz, latent_dim, latent_len).astype(np.float32)
        latent_mask = self._get_latent_mask(wav_lengths, self.base_chunk_size, self.chunk_compress_factor)
        noisy_latent = noisy_latent * latent_mask
        return noisy_latent, latent_mask

    def _get_latent_mask(
        self, wav_lengths: np.ndarray, base_chunk_size: int, chunk_compress_factor: int
    ) -> np.ndarray:
        """Get mask for latent space."""
        latent_size = base_chunk_size * chunk_compress_factor
        latent_lengths = (wav_lengths + latent_size - 1) // latent_size
        return self._length_to_mask(latent_lengths)

    def _length_to_mask(self, lengths: np.ndarray, max_len: Optional[int] = None) -> np.ndarray:
        """Convert lengths to binary mask."""
        max_len = max_len or lengths.max()
        ids = np.arange(0, max_len)
        mask = (ids < np.expand_dims(lengths, axis=1)).astype(np.float32)
        return mask.reshape(-1, 1, max_len)

    def _infer(
        self,
        text_list: List[str],
        lang_list: List[str],
        style: Style,
        total_step: int,
        speed: float = 1.05,
    ) -> Tuple[np.ndarray, np.ndarray]:
        """
        Run inference for batch of texts.

        Args:
            text_list: List of texts to synthesize
            lang_list: List of language codes
            style: Voice style vectors
            total_step: Number of diffusion steps
            speed: Speed multiplier

        Returns:
            Tuple of (wav, durations)
        """
        assert len(text_list) == style.ttl.shape[0], "Number of texts must match number of style vectors"
        bsz = len(text_list)

        # Process text
        text_ids, text_mask = self.text_processor(text_list, lang_list)

        # Predict durations
        dur_onnx, *_ = self.dp_ort.run(
            None, {"text_ids": text_ids, "style_dp": style.dp, "text_mask": text_mask}
        )
        dur_onnx = dur_onnx / speed

        # Encode text
        text_emb_onnx, *_ = self.text_enc_ort.run(
            None,
            {"text_ids": text_ids, "style_ttl": style.ttl, "text_mask": text_mask},
        )

        # Sample initial latent
        xt, latent_mask = self._sample_noisy_latent(dur_onnx)

        # Run diffusion steps
        total_step_np = np.array([total_step] * bsz, dtype=np.float32)
        for step in range(total_step):
            current_step = np.array([step] * bsz, dtype=np.float32)
            xt, *_ = self.vector_est_ort.run(
                None,
                {
                    "noisy_latent": xt,
                    "text_emb": text_emb_onnx,
                    "style_ttl": style.ttl,
                    "text_mask": text_mask,
                    "latent_mask": latent_mask,
                    "current_step": current_step,
                    "total_step": total_step_np,
                },
            )

        # Generate audio from final latent
        wav, *_ = self.vocoder_ort.run(None, {"latent": xt})
        return wav, dur_onnx

    async def speak(
        self,
        text: str,
        voice_key: str,
        options: Dict[str, Any] = {},
    ) -> "AudioOutput":
        """
        Generate audio from text.

        Args:
            text: Text to synthesize (with language tags)
            voice_key: Voice identifier (F1-F5, M1-M5)
            options: Dict with 'speed' (float) and 'num_inference_steps' (int)

        Returns:
            AudioOutput object with toWav() method
        """
        if not self._pipeline_initialized:
            await self._initialize_pipeline()

        speed = options.get("speed", 1.0)
        num_inference_steps = options.get("num_inference_steps", 5)

        # Get voice style path - check custom dir or use asset manager
        if self.voice_styles_dir is not None:
            voice_path = Path(self.voice_styles_dir) / VOICES[voice_key].replace('.bin', '.json')
            if not voice_path.exists():
                raise FileNotFoundError(f"Voice style not found: {voice_path}")
        else:
            # Use asset manager to ensure voice style exists
            voice_path = self.asset_manager.ensure_voice_style(voice_key)

        # Load style
        with open(voice_path, "r") as f:
            style_data = json.load(f)
        style = Style.from_dict(style_data)

        # Parse text with language tags (should already be preprocessed)
        import re
        lang_pattern = re.compile(r'<([a-z]{2})>([^<]*)</\1>')
        segments = []
        for match in lang_pattern.finditer(text):
            lang = match.group(1)
            seg_text = match.group(2).strip()
            if seg_text:
                segments.append((lang, seg_text))

        if not segments:
            raise ValueError("No valid language segments found in text")

        # Synthesize each segment
        audio_buffers = []
        for lang, seg_text in segments:
            # For simplicity, we'll generate per segment
            wav, dur = self._infer([text], [lang], style, num_inference_steps, speed)
            audio_buffers.append(wav[0])

        # Concatenate if multiple segments
        if len(audio_buffers) > 1:
            from .utils import concatenate_wav_buffers
            # Convert numpy arrays to WAV bytes
            wav_buffers = []
            for wav_data in audio_buffers:
                wav_bytes = self._array_to_wav(wav_data, self.sample_rate)
                wav_buffers.append(wav_bytes)
            final_wav_bytes = concatenate_wav_buffers(wav_buffers)
        else:
            final_wav_bytes = self._array_to_wav(audio_buffers[0], self.sample_rate)

        return AudioOutput(final_wav_bytes, self.sample_rate)

    def _array_to_wav(self, wav_array: np.ndarray, sample_rate: int) -> bytes:
        """Convert numpy audio array to WAV bytes."""
        import struct

        # Ensure mono and 1D
        if wav_array.ndim > 1:
            wav_array = wav_array.mean(axis=1) if wav_array.shape[1] > 1 else wav_array[0]

        # Normalize and convert to 16-bit
        wav_array = np.clip(wav_array, -1.0, 1.0)
        wav_int16 = (wav_array * 32767).astype(np.int16)

        # Create WAV buffer
        data_size = len(wav_int16) * 2
        buffer = bytearray(44 + data_size)

        # WAV header
        buffer[0:4] = b'RIFF'
        struct.pack_into('<I', buffer, 4, 36 + data_size)
        buffer[8:12] = b'WAVE'
        buffer[12:16] = b'fmt '
        struct.pack_into('<I', buffer, 16, 16)
        struct.pack_into('<H', buffer, 20, 1)  # PCM
        struct.pack_into('<H', buffer, 22, 1)  # Mono
        struct.pack_into('<I', buffer, 24, sample_rate)
        struct.pack_into('<I', buffer, 28, sample_rate * 2)  # Byte rate
        struct.pack_into('<H', buffer, 32, 2)  # Block align
        struct.pack_into('<H', buffer, 34, 16)  # Bits per sample
        buffer[36:40] = b'data'
        struct.pack_into('<I', buffer, 40, data_size)

        # Write audio data
        offset = 44
        for sample in wav_int16:
            struct.pack_into('<h', buffer, offset, int(sample))
            offset += 2

        return bytes(buffer)

    def get_available_voices(self) -> list[str]:
        """Get available voice keys."""
        return list(VOICES.keys())


class AudioOutput:
    """Wrapper for audio output with convenience methods."""

    def __init__(self, wav_bytes: bytes, sample_rate: int):
        self._wav_bytes = wav_bytes
        self.sample_rate = sample_rate

    def to_wav(self) -> bytes:
        """Get WAV bytes."""
        return self._wav_bytes

    def to_blob(self) -> bytes:
        """Get audio as blob (alias for to_wav)."""
        return self._wav_bytes

    def save(self, path: str) -> None:
        """Save audio to file."""
        with open(path, 'wb') as f:
            f.write(self._wav_bytes)


class UnicodeProcessor:
    """Text processor that converts text to unicode indices."""

    def __init__(self, unicode_indexer_path: str):
        with open(unicode_indexer_path, "r") as f:
            self.indexer = json.load(f)

    def __call__(self, text_list: list[str], lang_list: list[str]) -> Tuple[np.ndarray, np.ndarray]:
        """
        Process text list to indices and mask.

        Args:
            text_list: List of preprocessed texts (with tags)
            lang_list: List of language codes

        Returns:
            Tuple of (text_ids, text_mask)
        """
        # In the ONNX version, text already includes tags
        text_ids_lengths = np.array([len(text) for text in text_list], dtype=np.int64)
        max_len = text_ids_lengths.max()
        text_ids = np.zeros((len(text_list), max_len), dtype=np.int64)

        for i, text in enumerate(text_list):
            unicode_vals = np.array([ord(char) for char in text], dtype=np.uint16)
            text_ids[i, :len(unicode_vals)] = np.array(
                [self.indexer.get(str(val), 0) for val in unicode_vals], dtype=np.int64
            )

        text_mask = self._get_text_mask(text_ids_lengths)
        return text_ids, text_mask

    def _get_text_mask(self, text_ids_lengths: np.ndarray) -> np.ndarray:
        """Get mask for text sequence."""
        max_len = text_ids_lengths.max()
        ids = np.arange(0, max_len)
        mask = (ids < np.expand_dims(text_ids_lengths, axis=1)).astype(np.float32)
        return mask.reshape(-1, 1, max_len)