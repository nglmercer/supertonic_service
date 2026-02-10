"""
Validation utilities for Supertonic API.
"""

import re
from typing import Optional, Tuple, Union
from .enums import Language, Voice, QualityLevel, SpeedPreset
from .constants import SUPPORTED_LANGUAGES, APIConfig


# ============== Language Validation ==============

def validate_language(lang: Union[str, Language]) -> Language:
    """Validate and return language enum from string."""
    if isinstance(lang, Language):
        return lang
    lang = lang.lower().strip()
    for language in Language:
        if language.value == lang:
            return language
    raise ValueError(
        f"Unsupported language: {lang}. Supported: {SUPPORTED_LANGUAGES}"
    )


def is_language_supported(lang: str) -> bool:
    """Check if a language is supported."""
    try:
        validate_language(lang)
        return True
    except ValueError:
        return False


# ============== Voice Validation ==============

def validate_voice(voice_key: Union[str, Voice]) -> Voice:
    """Validate and return voice enum from string key."""
    if isinstance(voice_key, Voice):
        return voice_key
    return Voice.from_key(voice_key)


def is_voice_available(voice_key: str) -> bool:
    """Check if a voice is available."""
    try:
        validate_voice(voice_key)
        return True
    except ValueError:
        return False


def get_voice_file(voice_key: str) -> str:
    """Get the binary filename for a voice key."""
    voice = validate_voice(voice_key)
    return voice.value


def get_voice_url(voice_key: str) -> str:
    """Get the full URL for a voice file."""
    from .constants import BASE_URL
    filename = get_voice_file(voice_key)
    return f"{BASE_URL}{filename}"


# ============== Parameter Validation ==============

def validate_rate(rate: Union[str, float, int]) -> str:
    """Validate rate parameter."""
    try:
        rate_float = float(rate)
        if rate_float < 0.5 or rate_float > 2.0:
            raise ValueError(
                f"Rate must be between {APIConfig.MIN_RATE} and {APIConfig.MAX_RATE}"
            )
        return str(rate_float)
    except (TypeError, ValueError) as e:
        raise ValueError(f"Invalid rate: {e}")


def validate_volume(volume: Union[str, float, int]) -> str:
    """Validate volume parameter."""
    try:
        volume_float = float(volume)
        if volume_float < 0.0 or volume_float > 2.0:
            raise ValueError(
                f"Volume must be between {APIConfig.MIN_VOLUME} and {APIConfig.MAX_VOLUME}"
            )
        return str(volume_float)
    except (TypeError, ValueError) as e:
        raise ValueError(f"Invalid volume: {e}")


def validate_pitch(pitch: Union[str, float, int]) -> str:
    """Validate pitch parameter."""
    try:
        pitch_float = float(pitch)
        if pitch_float < 0.5 or pitch_float > 2.0:
            raise ValueError(
                f"Pitch must be between {APIConfig.MIN_PITCH} and {APIConfig.MAX_PITCH}"
            )
        return str(pitch_float)
    except (TypeError, ValueError) as e:
        raise ValueError(f"Invalid pitch: {e}")


def validate_total_steps(steps: Optional[int]) -> Optional[int]:
    """Validate total steps parameter."""
    if steps is None:
        return None
    valid_steps = [3, 5, 10, 15]
    if steps not in valid_steps:
        raise ValueError(
            f"Total steps must be one of: {valid_steps}. Got: {steps}"
        )
    return steps


def validate_quality(quality: str) -> str:
    """Validate quality level string."""
    valid_qualities = list(QualityLevel.steps().keys())
    if quality.lower() not in valid_qualities:
        raise ValueError(
            f"Quality must be one of: {valid_qualities}. Got: {quality}"
        )
    return quality.lower()


def validate_max_chunk_length(length: Optional[int]) -> Optional[int]:
    """Validate max chunk length parameter."""
    if length is None:
        return None
    if length < APIConfig.MIN_CHUNK_LENGTH or length > APIConfig.MAX_CHUNK_LENGTH:
        raise ValueError(
            f"Max chunk length must be between {APIConfig.MIN_CHUNK_LENGTH} "
            f"and {APIConfig.MAX_CHUNK_LENGTH}. Got: {length}"
        )
    return length


def validate_silence_duration(duration: Optional[float]) -> Optional[float]:
    """Validate silence duration parameter."""
    if duration is None:
        return None
    if duration < APIConfig.MIN_SILENCE_DURATION or duration > APIConfig.MAX_SILENCE_DURATION:
        raise ValueError(
            f"Silence duration must be between {APIConfig.MIN_SILENCE_DURATION} "
            f"and {APIConfig.MAX_SILENCE_DURATION}. Got: {duration}"
        )
    return float(duration)


def validate_speed_preset(preset: str) -> float:
    """Get speed from preset name."""
    return SpeedPreset.get_speed(preset)


# ============== Text Validation ==============

def validate_text_length(text: str, max_length: int = APIConfig.MAX_TEXT_LENGTH) -> Tuple[bool, str]:
    """Validate text length and return (is_valid, message)."""
    if not text:
        return False, "Text cannot be empty"
    if len(text) > max_length:
        return False, f"Text exceeds maximum length of {max_length} characters"
    return True, "Valid"


def sanitize_text(text: str) -> str:
    """Sanitize input text by removing invalid characters."""
    # Remove null characters
    text = text.replace('\x00', '')
    # Remove control characters except newlines and tabs
    text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', text)
    return text.strip()


# ============== Comprehensive Validation ==============

class ValidationResult:
    """Result of comprehensive validation."""

    def __init__(
        self,
        is_valid: bool,
        text: Optional[str] = None,
        voice: Optional[str] = None,
        language: Optional[str] = None,
        rate: Optional[str] = None,
        volume: Optional[str] = None,
        pitch: Optional[str] = None,
        errors: Optional[list[str]] = None,
        warnings: Optional[list[str]] = None,
    ):
        self.is_valid = is_valid
        self.text = text
        self.voice = voice
        self.language = language
        self.rate = rate
        self.volume = volume
        self.pitch = pitch
        self.errors = errors or []
        self.warnings = warnings or []

    def to_dict(self) -> dict:
        return {
            "is_valid": self.is_valid,
            "text": self.text,
            "voice": self.voice,
            "language": self.language,
            "rate": self.rate,
            "volume": self.volume,
            "pitch": self.pitch,
            "errors": self.errors,
            "warnings": self.warnings,
        }


def validate_tts_request(
    text: str,
    voice: str,
    language: str,
    rate: Optional[str] = None,
    volume: Optional[str] = None,
    pitch: Optional[str] = None,
) -> ValidationResult:
    """
    Comprehensive validation of TTS request parameters.

    Returns:
        ValidationResult with validation status and any errors/warnings.
    """
    errors = []
    warnings = []

    # Validate text
    is_valid_text, text_msg = validate_text_length(text)
    if not is_valid_text:
        errors.append(text_msg)
    text = sanitize_text(text)

    # Validate voice
    try:
        voice = validate_voice(voice)
    except ValueError as e:
        errors.append(str(e))

    # Validate language
    try:
        language = validate_language(language)
    except ValueError as e:
        errors.append(str(e))

    # Validate rate
    if rate is not None:
        try:
            rate = validate_rate(rate)
        except ValueError as e:
            errors.append(str(e))
    else:
        rate = APIConfig.DEFAULT_RATE

    # Validate volume
    if volume is not None:
        try:
            volume = validate_volume(volume)
        except ValueError as e:
            errors.append(str(e))
    else:
        volume = APIConfig.DEFAULT_VOLUME

    # Validate pitch
    if pitch is not None:
        try:
            pitch = validate_pitch(pitch)
        except ValueError as e:
            errors.append(str(e))
    else:
        pitch = APIConfig.DEFAULT_PITCH

    # Add warnings for unusual values
    if float(rate) < 0.7:
        warnings.append("Rate below 0.7 may sound unnatural")
    if float(rate) > 1.5:
        warnings.append("Rate above 1.5 may be difficult to understand")
    if float(volume) > 1.5:
        warnings.append("Volume above 1.5 may cause clipping")

    return ValidationResult(
        is_valid=len(errors) == 0,
        text=text,
        voice=str(voice.key) if isinstance(voice, Voice) else voice,
        language=str(language.value) if isinstance(language, Language) else language,
        rate=rate,
        volume=volume,
        pitch=pitch,
        errors=errors,
        warnings=warnings,
    )


__all__ = [
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
]
