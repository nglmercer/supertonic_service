"""
Core module for Supertonic API parameter enums and validations.
Provides type-safe enums and validation utilities for the REST API.

This module is now a backward-compatible wrapper around the core package.
For new code, consider using the modular core package:
    from src.core import Language, Voice, validate_language
"""

# Re-export everything from the modular core package for backward compatibility

from .core.enums import (
    Language,
    Voice,
    AudioFormat,
    SampleRate,
    QualityLevel,
    SpeedPreset,
)

from .core.models import (
    SynthesisOptions,
    ChunkOptions,
    AudioOutput,
    TTSRequest,
    VoiceStyleRequest,
    TTSResponse,
    HealthResponse,
    VoiceListResponse,
    ValidationResponse,
)

from .core.constants import (
    BASE_URL,
    SUPPORTED_LANGUAGES,
    VOICES,
    APIConfig,
    ExampleTexts,
    OutputPaths,
    VOICE_INFO,
    get_voice_info,
)

from .core.validation import (
    validate_language,
    is_language_supported,
    validate_voice,
    is_voice_available,
    get_voice_file,
    get_voice_url,
    validate_rate,
    validate_volume,
    validate_pitch,
    validate_total_steps,
    validate_quality,
    validate_max_chunk_length,
    validate_silence_duration,
    validate_speed_preset,
    validate_text_length,
    sanitize_text,
    ValidationResult,
    validate_tts_request,
)

from .core.text_processing import (
    has_language_tags,
    extract_language_from_tags,
    wrap_with_language_tags,
    strip_language_tags,
    wrap_text_multilingual,
    normalize_whitespace,
    split_into_sentences,
    split_into_chunks,
    get_unsupported_characters,
    count_characters,
    get_language_guidelines,
    prepare_text_for_synthesis,
)


__version__ = "1.0.0"

__all__ = [
    # Version
    '__version__',
    # Enums
    'Language',
    'Voice',
    'AudioFormat',
    'SampleRate',
    'QualityLevel',
    'SpeedPreset',
    # Models
    'SynthesisOptions',
    'ChunkOptions',
    'AudioOutput',
    'TTSRequest',
    'VoiceStyleRequest',
    'TTSResponse',
    'HealthResponse',
    'VoiceListResponse',
    'ValidationResponse',
    # Constants
    'BASE_URL',
    'SUPPORTED_LANGUAGES',
    'VOICES',
    'APIConfig',
    'ExampleTexts',
    'OutputPaths',
    'VOICE_INFO',
    'get_voice_info',
    # Validation
    'validate_language',
    'is_language_supported',
    'validate_voice',
    'is_voice_available',
    'get_voice_file',
    'get_voice_url',
    'validate_rate',
    'validate_volume',
    'validate_pitch',
    'validate_total_steps',
    'validate_quality',
    'validate_max_chunk_length',
    'validate_silence_duration',
    'validate_speed_preset',
    'validate_text_length',
    'sanitize_text',
    'ValidationResult',
    'validate_tts_request',
    # Text Processing
    'has_language_tags',
    'extract_language_from_tags',
    'wrap_with_language_tags',
    'strip_language_tags',
    'wrap_text_multilingual',
    'normalize_whitespace',
    'split_into_sentences',
    'split_into_chunks',
    'get_unsupported_characters',
    'count_characters',
    'get_language_guidelines',
    'prepare_text_for_synthesis',
]
