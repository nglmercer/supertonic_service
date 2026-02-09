"""
Type definitions for Supertonic TTS Python implementation.
"""

from dataclasses import dataclass
from typing import Literal, Tuple, Optional, Any, Dict

# Supported languages for Supertonic TTS
Language = Literal["en", "ko", "es", "pt", "fr"]

# Voice definitions mapping voice keys to binary file names
VOICES = {
    "F1": "F1.bin",
    "F2": "F2.bin",
    "F3": "F3.bin",
    "F4": "F4.bin",
    "F5": "F5.bin",
    "M1": "M1.bin",
    "M2": "M2.bin",
    "M3": "M3.bin",
    "M4": "M4.bin",
    "M5": "M5.bin",
}

VoiceKey = Literal["F1", "F2", "F3", "F4", "F5", "M1", "M2", "M3", "M4", "M5"]


@dataclass
class SynthesisOptions:
    """Synthesis options for TTS"""
    rate: Optional[str] = None
    volume: Optional[str] = None
    pitch: Optional[str] = None


@dataclass
class SynthesisResult:
    """Result of TTS synthesis"""
    saved_path: Optional[str]
    file_buffer: bytes
    detected_language: Language


@dataclass
class MixedSynthesisResult:
    """Result of mixed-language TTS synthesis"""
    saved_path: Optional[str]
    file_buffer: bytes


@dataclass
class LanguageDetectionResult:
    """Result of language detection"""
    language: str
    summary: Optional[str] = None


# Type for custom language detector function
LanguageDetector = Any  # Callable[[str], LanguageDetectionResult | Awaitable[LanguageDetectionResult]]


@dataclass
class Style:
    """Voice style vectors for TTS"""
    ttl: Any  # np.ndarray - style_ttl_onnx
    dp: Any   # np.ndarray - style_dp_onnx

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Style":
        """Create Style from dictionary with ttl and dp data"""
        import numpy as np
        ttl_data = np.array(data["style_ttl"]["data"], dtype=np.float32).flatten()
        ttl_dims = data["style_ttl"]["dims"]
        ttl_reshaped = ttl_data.reshape(ttl_dims[1], ttl_dims[2])

        dp_data = np.array(data["style_dp"]["data"], dtype=np.float32).flatten()
        dp_dims = data["style_dp"]["dims"]
        dp_reshaped = dp_data.reshape(dp_dims[1], dp_dims[2])

        return cls(ttl=ttl_reshaped, dp=dp_reshaped)


@dataclass
class TTSConfig:
    """Configuration for TTS model"""
    # Audio encoder config
    ae_sample_rate: int
    ae_base_chunk_size: int
    
    # TTL config
    ttl_chunk_compress_factor: int
    ttl_latent_dim: int

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "TTSConfig":
        """Create TTSConfig from dictionary"""
        return cls(
            ae_sample_rate=data["ae"]["sample_rate"],
            ae_base_chunk_size=data["ae"]["base_chunk_size"],
            ttl_chunk_compress_factor=data["ttl"]["chunk_compress_factor"],
            ttl_latent_dim=data["ttl"]["latent_dim"],
        )