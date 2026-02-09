"""
Asset manager for automatic downloading of ONNX models and voice styles from HuggingFace.
"""

import json
import os
from pathlib import Path
from typing import Optional
from huggingface_hub import hf_hub_download, snapshot_download
import numpy as np
from .constants import VOICES
from .types import TTSConfig


class AssetManager:
    """Manages downloading and caching of Supertonic TTS assets."""

    def __init__(
        self,
        cache_dir: Optional[str] = None,
        repo_id: str = "onnx-community/Supertonic-TTS-2-ONNX"
    ):
        """
        Initialize AssetManager.

        Args:
            cache_dir: Directory to cache downloaded assets (default: ~/.cache/supertonic-tts)
            repo_id: HuggingFace repository ID
        """
        self.cache_dir = Path(cache_dir or os.path.expanduser("~/.cache/supertonic-tts"))
        self.repo_id = repo_id
        self._config_cache: Optional[TTSConfig] = None

    def ensure_onnx_assets(self, onnx_dir: Optional[Path] = None) -> Path:
        """
        Ensure ONNX models are available. Download if missing.

        Args:
            onnx_dir: Custom directory for ONNX models (if None, uses cache)

        Returns:
            Path to the ONNX directory
        """
        if onnx_dir is None:
            onnx_dir = self.cache_dir / "onnx"
        else:
            onnx_dir = Path(onnx_dir)

        onnx_dir.mkdir(parents=True, exist_ok=True)

        # Check if required files exist
        required_files = [
            "tts.json",
            "duration_predictor.onnx",
            "text_encoder.onnx",
            "vector_estimator.onnx",
            "vocoder.onnx",
            "unicode_indexer.json",
        ]

        # Check if all files exist
        all_exist = all((onnx_dir / f).exists() for f in required_files)

        if not all_exist:
            print(f"Downloading ONNX models from {self.repo_id}...")
            try:
                # Download all files from the repository
                snapshot_download(
                    repo_id=self.repo_id,
                    local_dir=str(onnx_dir),
                    local_files_only=False,
                    allow_patterns=[
                        "*.onnx",
                        "*.json",
                    ],
                )
                print(f"✓ Models downloaded to {onnx_dir}")
            except Exception as e:
                print(f"Failed to download models: {e}")
                raise

        # Cache the config
        if self._config_cache is None:
            cfg_path = onnx_dir / "tts.json"
            with open(cfg_path, "r") as f:
                cfgs = json.load(f)
            self._config_cache = TTSConfig.from_dict(cfgs)

        return onnx_dir

    def get_config(self) -> TTSConfig:
        """Get the TTS configuration, loading from cache if available."""
        if self._config_cache is None:
            onnx_dir = self.cache_dir / "onnx"
            if not onnx_dir.exists():
                raise FileNotFoundError("ONNX assets not initialized. Call ensure_onnx_assets() first.")
            cfg_path = onnx_dir / "tts.json"
            with open(cfg_path, "r") as f:
                cfgs = json.load(f)
            self._config_cache = TTSConfig.from_dict(cfgs)
        return self._config_cache

    def ensure_voice_style(self, voice_key: str, styles_dir: Optional[Path] = None) -> Path:
        """
        Ensure voice style file is available. Download if missing and convert from .bin if needed.

        Args:
            voice_key: Voice identifier (e.g., 'F1', 'M1')
            styles_dir: Directory for voice styles (if None, uses cache)

        Returns:
            Path to the voice style JSON file
        """
        if voice_key not in VOICES:
            raise ValueError(f"Invalid voice key: {voice_key}. Valid keys: {list(VOICES.keys())}")

        if styles_dir is None:
            styles_dir = self.cache_dir / "voice_styles"
        else:
            styles_dir = Path(styles_dir)

        styles_dir.mkdir(parents=True, exist_ok=True)

        voice_filename = VOICES[voice_key]
        voice_json = voice_filename.replace('.bin', '.json')
        voice_path = styles_dir / voice_json
        voice_bin_path = self.cache_dir / "voices_raw" / voice_filename

        # If JSON already exists, return it
        if voice_path.exists():
            return voice_path

        # Ensure .bin file exists (download if needed)
        if not voice_bin_path.exists():
            print(f"Downloading voice style {voice_key} from {self.repo_id}...")
            try:
                hf_hub_download(
                    repo_id=self.repo_id,
                    filename=f"voices/{voice_filename}",
                    local_dir=str(self.cache_dir / "voices_raw"),
                )
            except Exception as e:
                print(f"Failed to download voice style: {e}")
                raise

        # Convert .bin to JSON
        self._convert_voice_bin_to_json(voice_bin_path, voice_path, voice_key)

        return voice_path

    def _convert_voice_bin_to_json(self, bin_path: Path, json_path: Path, voice_key: str):
        """Convert binary voice embedding to JSON format."""
        # Get config to compute expected shapes
        config = self.get_config()
        latent_dim = config.ttl_latent_dim
        base_chunk_size = config.ae_base_chunk_size
        chunk_compress_factor = config.ttl_chunk_compress_factor

        # The .bin file contains concatenated style_ttl and style_dp
        # style_ttl: shape (latent_dim, base_chunk_size) but stored as float32 array
        # style_dp: shape (1, base_chunk_size) but stored as float32 array
        # Actually the model expects:
        # - style_ttl: [bsz, latent_dim, base_chunk_size]
        # - style_dp: [bsz, 1, base_chunk_size]
        # In the JSON, the shape is [1, latent_dim, base_chunk_size] and [1, 1, base_chunk_size]
        # So we need to reshape accordingly.

        # Load raw binary data
        data = np.fromfile(bin_path, dtype=np.float32)

        # Expected sizes
        ttl_size = latent_dim * base_chunk_size
        dp_size = 1 * base_chunk_size
        expected_size = ttl_size + dp_size

        if len(data) != expected_size:
            raise ValueError(
                f"Voice file {bin_path} has unexpected size {len(data)}. "
                f"Expected {expected_size} floats (latent_dim={latent_dim}, base_chunk_size={base_chunk_size})."
            )

        # Split data
        ttl_data = data[:ttl_size].reshape(1, latent_dim, base_chunk_size)
        dp_data = data[ttl_size:].reshape(1, 1, base_chunk_size)

        # Convert to lists for JSON serialization
        voice_json = {
            "style_ttl": {
                "dims": list(ttl_data.shape),
                "data": ttl_data.flatten().tolist()
            },
            "style_dp": {
                "dims": list(dp_data.shape),
                "data": dp_data.flatten().tolist()
            }
        }

        # Write JSON
        with open(json_path, "w") as f:
            json.dump(voice_json, f, indent=2)

        print(f"✓ Converted and saved voice style: {json_path}")

    def get_or_download_all_voices(self, styles_dir: Optional[Path] = None) -> Path:
        """
        Download all voice styles.

        Args:
            styles_dir: Directory for voice styles

        Returns:
            Path to the voice styles directory
        """
        if styles_dir is None:
            styles_dir = self.cache_dir / "voice_styles"
        else:
            styles_dir = Path(styles_dir)

        styles_dir.mkdir(parents=True, exist_ok=True)

        print(f"Downloading all voice styles from {self.repo_id}...")
        for voice_key in VOICES.keys():
            try:
                self.ensure_voice_style(voice_key, styles_dir)
            except Exception as e:
                print(f"Warning: Failed to download {voice_key}: {e}")

        return styles_dir


# Global asset manager instance
_default_asset_manager: Optional[AssetManager] = None


def get_asset_manager() -> AssetManager:
    """Get or create the default asset manager."""
    global _default_asset_manager
    if _default_asset_manager is None:
        _default_asset_manager = AssetManager()
    return _default_asset_manager