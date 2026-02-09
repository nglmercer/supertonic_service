# Supertonic TTS Python implementation
# Barrel export - re-export all public types, constants, and classes

# First, export types and constants (no heavy dependencies)
from .types import (
    Language,
    VOICES,
    VoiceKey,
    SynthesisOptions,
    SynthesisResult,
    MixedSynthesisResult,
    LanguageDetectionResult,
    Style,
    TTSConfig,
)
from .constants import BASE_URL, SUPPORTED_LANGUAGES

# Export preprocessor and utils (lightweight modules)
from .preprocessor import (
    detect_language,
    has_language_tags,
    preprocess_text,
    mix_languages,
)
from .utils import (
    parse_rate_to_speed,
    sanitize_filename,
    is_supported_language,
    detect_language as detect_language_util,
    parse_language_segments,
    concatenate_wav_buffers,
    create_silence_buffer,
    validate_voice,
    chunk_text,
)

# FileHandler is lightweight with optional anyio
from .file_handler import FileHandler

# Asset manager for automatic downloads
from .asset_manager import AssetManager, get_asset_manager

# The following modules have heavy dependencies (onnxruntime, numpy)
# They are imported lazily when needed. Users can import them directly:
# from supertonic_tts.supertonic_client import SupertonicTTS, AudioOutput, UnicodeProcessor
# from supertonic_tts.service import TTSService

__all__ = [
    # Types
    "Language",
    "VOICES",
    "VoiceKey",
    "SynthesisOptions",
    "SynthesisResult",
    "MixedSynthesisResult",
    "LanguageDetectionResult",
    "Style",
    "TTSConfig",
    # Constants
    "BASE_URL",
    "SUPPORTED_LANGUAGES",
    # Preprocessor
    "detect_language",
    "has_language_tags",
    "preprocess_text",
    "mix_languages",
    # Utils
    "parse_rate_to_speed",
    "sanitize_filename",
    "is_supported_language",
    "detect_language_util",
    "parse_language_segments",
    "concatenate_wav_buffers",
    "create_silence_buffer",
    "validate_voice",
    "chunk_text",
    # File handler
    "FileHandler",
    # Asset manager
    "AssetManager",
    "get_asset_manager",
]

# Optional modules with heavy dependencies - lazy import pattern
def __getattr__(name):
    if name == "SupertonicTTS" or name == "AudioOutput" or name == "UnicodeProcessor":
        from .supertonic_client import SupertonicTTS, AudioOutput, UnicodeProcessor
        if name == "SupertonicTTS":
            return SupertonicTTS
        elif name == "AudioOutput":
            return AudioOutput
        else:
            return UnicodeProcessor
    elif name == "TTSService":
        from .service import TTSService
        return TTSService
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
