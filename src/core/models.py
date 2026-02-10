"""
Pydantic models for Supertonic API requests and responses.
"""

from typing import Optional
from pydantic import BaseModel, Field, validator
from .enums import Language, Voice, AudioFormat, SampleRate


# ============== Synthesis Options ==============

class SynthesisOptions(BaseModel):
    """Synthesis options for TTS."""
    rate: Optional[str] = Field(default="1.0", description="Speech rate")
    volume: Optional[str] = Field(default="1.0", description="Volume level")
    pitch: Optional[str] = Field(default="1.0", description="Pitch adjustment")

    class Config:
        json_schema_extra = {
            "example": {
                "rate": "1.0",
                "volume": "1.0",
                "pitch": "1.0"
            }
        }


class ChunkOptions(BaseModel):
    """Options for text chunking."""
    max_length: int = Field(default=300, description="Maximum chunk length")
    silence_duration: float = Field(default=0.3, description="Silence between chunks")


# ============== Audio Output Model ==============

class AudioOutput(BaseModel):
    """Extended audio output model."""
    data: bytes
    format: str = "wav"
    sample_rate: int = 44100
    duration: Optional[float] = None

    def to_wav(self) -> bytes:
        """Convert audio data to WAV format."""
        return self.data

    def to_blob(self) -> bytes:
        """Return audio data as blob-compatible bytes."""
        return self.data


# ============== Request Models ==============

class TTSRequest(BaseModel):
    """Request model for TTS synthesis."""
    text: str = Field(..., min_length=1, max_length=5000, description="Text to synthesize")
    voice: str = Field(default="M1", description="Voice key (e.g., M1, F1)")
    language: Language = Field(default=Language.ENGLISH, description="Language code")
    rate: Optional[str] = Field(default="1.0", description="Speech rate")
    volume: Optional[str] = Field(default="1.0", description="Volume level")
    pitch: Optional[str] = Field(default="1.0", description="Pitch adjustment")
    quality: Optional[str] = Field(default="balanced", description="Quality level (fast, balanced, high, ultra)")
    total_steps: Optional[int] = Field(default=None, description="Synthesis steps (3, 5, 10, 15)")
    max_chunk_length: Optional[int] = Field(default=None, description="Max chunk length for long text")
    silence_duration: Optional[float] = Field(default=None, description="Silence between chunks")
    verbose: bool = Field(default=False, description="Enable verbose output")

    @validator('text')
    def text_must_be_valid(cls, v):
        if not v.strip():
            raise ValueError('Text cannot be empty or whitespace only')
        v = v.replace('\x00', '')
        return v.strip()

    @validator('voice')
    def voice_must_be_valid(cls, v):
        v = v.upper().strip()
        valid_voices = Voice.keys()
        if v not in valid_voices:
            raise ValueError(f"Invalid voice: {v}. Available: {valid_voices}")
        return v

    @validator('rate')
    def rate_must_be_valid(cls, v):
        try:
            rate = float(v)
            if not 0.5 <= rate <= 2.0:
                raise ValueError('Rate must be between 0.5 and 2.0')
        except (TypeError, ValueError):
            raise ValueError('Rate must be a number between 0.5 and 2.0')
        return v

    @validator('volume')
    def volume_must_be_valid(cls, v):
        try:
            volume = float(v)
            if not 0.0 <= volume <= 2.0:
                raise ValueError('Volume must be between 0.0 and 2.0')
        except (TypeError, ValueError):
            raise ValueError('Volume must be a number between 0.0 and 2.0')
        return v

    @validator('pitch')
    def pitch_must_be_valid(cls, v):
        try:
            pitch = float(v)
            if not 0.5 <= pitch <= 2.0:
                raise ValueError('Pitch must be between 0.5 and 2.0')
        except (TypeError, ValueError):
            raise ValueError('Pitch must be a number between 0.5 and 2.0')
        return v

    class Config:
        json_schema_extra = {
            "example": {
                "text": "Hello, world!",
                "voice": "M1",
                "language": "en",
                "rate": "1.0",
                "volume": "1.0",
                "pitch": "1.0"
            }
        }


class VoiceStyleRequest(BaseModel):
    """Request model for custom voice style."""
    style_data: dict = Field(..., description="Voice style data dictionary")
    style_name: Optional[str] = Field(default=None, description="Optional style name")


# ============== Response Models ==============

class TTSResponse(BaseModel):
    """Response model for TTS synthesis."""
    success: bool
    audio_data: Optional[bytes] = None
    duration: Optional[float] = None
    format: Optional[str] = None
    sample_rate: Optional[int] = None
    chunks_processed: Optional[int] = None
    error: Optional[str] = None

    class Config:
        json_schema_extra = {
            "example": {
                "success": True,
                "duration": 2.5,
                "format": "wav",
                "sample_rate": 44100,
                "chunks_processed": 1
            }
        }


class HealthResponse(BaseModel):
    """Response model for health check."""
    status: str
    version: str
    timestamp: str
    supported_languages: list[str]
    available_voices: list[str]

    class Config:
        json_schema_extra = {
            "example": {
                "status": "healthy",
                "version": "1.0.0",
                "timestamp": "2024-01-01T00:00:00Z",
                "supported_languages": ["en", "ko", "es", "pt", "fr"],
                "available_voices": ["M1", "M2", "M3", "M4", "M5", "F1", "F2", "F3", "F4", "F5"]
            }
        }


class VoiceListResponse(BaseModel):
    """Response model for voice listing."""
    voices: list[str]
    count: int

    class Config:
        json_schema_extra = {
            "example": {
                "voices": ["M1", "M2", "M3", "M4", "M5", "F1", "F2", "F3", "F4", "F5"],
                "count": 10
            }
        }


class ValidationResponse(BaseModel):
    """Response model for text validation."""
    is_valid: bool
    text_length: int
    unsupported_chars: list[str]
    warnings: list[str]

    class Config:
        json_schema_extra = {
            "example": {
                "is_valid": True,
                "text_length": 100,
                "unsupported_chars": [],
                "warnings": []
            }
        }


__all__ = [
    'SynthesisOptions',
    'ChunkOptions',
    'AudioOutput',
    'TTSRequest',
    'VoiceStyleRequest',
    'TTSResponse',
    'HealthResponse',
    'VoiceListResponse',
    'ValidationResponse',
]
