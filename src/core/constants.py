"""
Constants and configuration for Supertonic API.
"""

from .enums import Language, Voice


# ============== API Constants ==============

# Base URL for HuggingFace Supertonic voice embeddings
BASE_URL = "https://huggingface.co/onnx-community/Supertonic-TTS-2-ONNX/resolve/main/voices/"

# Supported languages array
SUPPORTED_LANGUAGES: list[str] = ["en", "ko", "es", "pt", "fr"]

# Voice mappings (key -> filename)
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


# ============== Configuration ==============

class APIConfig:
    """API configuration constants."""
    # Text limits
    MAX_TEXT_LENGTH = 5000
    MIN_TEXT_LENGTH = 1

    # Audio parameters
    MIN_RATE = "0.5"
    MAX_RATE = "2.0"
    MIN_VOLUME = "0.0"
    MAX_VOLUME = "2.0"
    MIN_PITCH = "0.5"
    MAX_PITCH = "2.0"

    # Quality settings
    QUALITY_FAST = 3
    QUALITY_BALANCED = 5
    QUALITY_HIGH = 10
    QUALITY_ULTRA = 15

    # Chunking settings
    DEFAULT_MAX_CHUNK_LENGTH = 300
    MIN_CHUNK_LENGTH = 50
    MAX_CHUNK_LENGTH = 1000
    DEFAULT_SILENCE_DURATION = 0.3
    MIN_SILENCE_DURATION = 0.1
    MAX_SILENCE_DURATION = 2.0

    # Defaults
    DEFAULT_LANGUAGE = Language.ENGLISH
    DEFAULT_VOICE = "M1"
    DEFAULT_RATE = "1.0"
    DEFAULT_VOLUME = "1.0"
    DEFAULT_PITCH = "1.0"
    DEFAULT_QUALITY = "balanced"
    DEFAULT_TOTAL_STEPS = 5

    # Thread settings
    DEFAULT_INTRA_OP_THREADS = None  # Auto-detect
    DEFAULT_INTER_OP_THREADS = None  # Auto-detect

    # Voice cache
    VOICE_CACHE_DIR = "~/.cache/supertonic/models"


class ExampleTexts:
    """Example texts for different languages."""
    ENGLISH = "Welcome to Supertonic! This is an English text-to-speech synthesis."
    KOREAN = "안녕하세요! 수퍼토닉에 오신 것을 환영합니다. 한국어 음성 합성입니다."
    SPANISH = "¡Bienvenido a Supertonic! Esta es una síntesis de voz en español."
    PORTUGUESE = "Bem-vindo ao Supertonic! Esta é uma síntese de voz em português."
    FRENCH = "Bienvenue sur Supertonic! Ceci est une synthèse vocale en français."

    @classmethod
    def get_example(cls, lang: str) -> str:
        """Get example text for a language."""
        examples = {
            "en": cls.ENGLISH,
            "ko": cls.KOREAN,
            "es": cls.SPANISH,
            "pt": cls.PORTUGUESE,
            "fr": cls.FRENCH,
        }
        return examples.get(lang.lower(), cls.ENGLISH)


class OutputPaths:
    """Default output paths."""
    BASE_OUTPUT = "outputs"
    TEST1 = "outputs/test1"
    TEST2 = "outputs/test2"
    TEST3 = "outputs/test3"
    TEST4 = "outputs/test4"
    TEST5 = "outputs/test5"
    TEST6 = "outputs/test6"
    TEST7 = "outputs/test7"
    TEST8 = "outputs/test8"
    TEST9 = "outputs/test9"


# ============== Voice Info ==============

VOICE_INFO = {
    "M1": {"gender": "male", "type": "neutral"},
    "M2": {"gender": "male", "type": "expressive"},
    "M3": {"gender": "male", "type": "deep"},
    "M4": {"gender": "male", "type": "soft"},
    "M5": {"gender": "male", "type": "energetic"},
    "F1": {"gender": "female", "type": "neutral"},
    "F2": {"gender": "female", "type": "expressive"},
    "F3": {"gender": "female", "type": "soft"},
    "F4": {"gender": "female", "type": "bright"},
    "F5": {"gender": "female", "type": "warm"},
}


def get_voice_info(voice_key: str) -> dict:
    """Get metadata for a voice."""
    return VOICE_INFO.get(voice_key.upper(), {"gender": "unknown", "type": "unknown"})


__all__ = [
    'BASE_URL',
    'SUPPORTED_LANGUAGES',
    'VOICES',
    'APIConfig',
    'ExampleTexts',
    'OutputPaths',
    'VOICE_INFO',
    'get_voice_info',
]
