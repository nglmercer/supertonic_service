"""
Enumerations for Supertonic API.
"""

from enum import Enum


# ============== Language Types ==============

class Language(str, Enum):
    """Supported languages for Supertonic TTS."""
    ENGLISH = "en"
    KOREAN = "ko"
    SPANISH = "es"
    PORTUGUESE = "pt"
    FRENCH = "fr"

    @classmethod
    def values(cls) -> list[str]:
        return [member.value for member in cls]

    @classmethod
    def supported(cls) -> list[str]:
        """Return list of supported language codes."""
        return ["en", "ko", "es", "pt", "fr"]


# ============== Voice Definitions ==============

class Voice(str, Enum):
    """Available voices for Supertonic TTS."""
    F1 = "F1.bin"
    F2 = "F2.bin"
    F3 = "F3.bin"
    F4 = "F4.bin"
    F5 = "F5.bin"
    M1 = "M1.bin"
    M2 = "M2.bin"
    M3 = "M3.bin"
    M4 = "M4.bin"
    M5 = "M5.bin"

    @classmethod
    def keys(cls) -> list[str]:
        """Return list of voice keys."""
        return [member.name for member in cls]

    @classmethod
    def from_key(cls, key: str) -> "Voice":
        """Get Voice enum from key string."""
        key = key.upper().strip()
        for voice in cls:
            if voice.name == key:
                return voice
        raise ValueError(f"Unknown voice key: {key}. Available: {cls.keys()}")

    @property
    def key(self) -> str:
        """Return the voice key (e.g., 'M1')."""
        return self.name


# ============== Audio Format Enums ==============

class AudioFormat(str, Enum):
    """Supported audio output formats."""
    WAV = "wav"
    MP3 = "mp3"
    OGG = "ogg"
    FLAC = "flac"

    @classmethod
    def values(cls) -> list[str]:
        return [member.value for member in cls]


# ============== Sample Rate Enums ==============

class SampleRate(int, Enum):
    """Supported audio sample rates."""
    RATE_16000 = 16000
    RATE_22050 = 22050
    RATE_44100 = 44100
    RATE_48000 = 48000


# ============== Quality Level Enums ==============

class QualityLevel(str, Enum):
    """Quality levels for TTS synthesis."""
    FAST = "fast"
    BALANCED = "balanced"
    HIGH = "high"
    ULTRA = "ultra"

    @classmethod
    def steps(cls) -> dict[str, int]:
        return {
            cls.FAST.value: 3,
            cls.BALANCED.value: 5,
            cls.HIGH.value: 10,
            cls.ULTRA.value: 15,
        }

    @classmethod
    def get_steps(cls, level: str) -> int:
        """Get step count for a quality level."""
        return cls.steps().get(level.lower(), 5)


# ============== Speed Preset Enums ==============

class SpeedPreset(str, Enum):
    """Speed presets for TTS synthesis."""
    SLOW = "slow"
    NORMAL = "normal"
    FAST = "fast"
    ULTRA_FAST = "ultra_fast"

    @classmethod
    def values(cls) -> dict[str, float]:
        return {
            cls.SLOW.value: 0.7,
            cls.NORMAL.value: 1.0,
            cls.FAST.value: 1.5,
            cls.ULTRA_FAST.value: 2.0,
        }

    @classmethod
    def get_speed(cls, preset: str) -> float:
        """Get speed multiplier for a preset."""
        return cls.values().get(preset.lower(), 1.0)


__all__ = [
    'Language',
    'Voice',
    'AudioFormat',
    'SampleRate',
    'QualityLevel',
    'SpeedPreset',
]
