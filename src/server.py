"""
Supertonic TTS API Server

FastAPI-based REST API for Supertonic Text-to-Speech synthesis.
Provides OpenAPI/Swagger documentation at /docs.
"""

import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, Query, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field

# Add src to path
sys.path.insert(0, str(Path(__file__).parent))

from src.core import (
    Language,
    Voice,
    validate_language,
    validate_voice,
    wrap_with_language_tags,
    ExampleTexts,
    OutputPaths,
    get_voice_file,
    get_voice_url,
)

# Lazy import supertonic to avoid startup issues
_tts_instance = None


def get_tts():
    """Get or create TTS instance."""
    global _tts_instance
    if _tts_instance is None:
        from supertonic import TTS
        _tts_instance = TTS()
    return _tts_instance


@asynccontextmanager
async def lifespan(app: FastAPI):
    """ lifespan context manager for startup/shutdown events."""
    # Startup
    print("🚀 Starting Supertonic TTS API Server...")
    try:
        tts = get_tts()
        print(f"✓ TTS initialized with voices: {tts.voice_style_names}")
    except Exception as e:
        print(f"⚠ TTS initialization deferred: {e}")
    yield
    # Shutdown
    print("👋 Shutting down Supertonic TTS API Server...")


# Create FastAPI app
app = FastAPI(
    title="Supertonic TTS API",
    description="REST API for Supertonic Text-to-Speech synthesis with multilingual support.",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============== Request Models ==============


class SynthesizeRequest(BaseModel):
    """Request model for text-to-speech synthesis."""
    text: str = Field(..., min_length=1, max_length=10000, description="Text to synthesize")
    voice: str = Field(default="M1", description="Voice key (M1-M5, F1-F5)")
    language: str = Field(default="en", description="Language code (en, ko, es, pt, fr)")
    speed: float = Field(default=1.0, ge=0.5, le=2.0, description="Speech speed (0.5x - 2.0x)")
    quality: str = Field(default="balanced", description="Quality level (fast, balanced, high, ultra)")
    total_steps: Optional[int] = Field(default=None, description="Synthesis steps (3, 5, 10, 15)")
    max_chunk_length: Optional[int] = Field(default=300, description="Max chunk length for long text")
    silence_duration: float = Field(default=0.3, ge=0.1, le=2.0, description="Silence between chunks")
    verbose: bool = Field(default=False, description="Enable verbose logging")


class VoiceStyleRequest(BaseModel):
    """Request model for custom voice style."""
    style_data: dict = Field(..., description="Voice style parameters")


# ============== Response Models ==============


class SynthesisResponse(BaseModel):
    """Response model for synthesis endpoint."""
    success: bool
    message: str
    audio_path: Optional[str] = None
    duration: Optional[float] = None
    language: str
    voice: str
    text_length: int


class VoiceListResponse(BaseModel):
    """Response model for voice list endpoint."""
    voices: list[str]
    count: int


class HealthResponse(BaseModel):
    """Response model for health check."""
    status: str
    tts_ready: bool
    voices_available: list[str]


class ValidationResponse(BaseModel):
    """Response model for text validation."""
    valid: bool
    text_length: int
    chunk_count: int
    supported_chars: int
    unsupported_chars: list[str] = []


# ============== Helper Functions ==============


def validate_and_prepare_text(text: str, language: str) -> tuple[str, str]:
    """Validate language and prepare text with language tags."""
    lang = validate_language(language)
    tagged_text = wrap_with_language_tags(text, lang.value)
    return tagged_text, lang.value


# ============== API Endpoints ==============


@app.get("/", tags=["Info"])
async def root():
    """Root endpoint with API information."""
    return {
        "name": "Supertonic TTS API",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/health",
        "endpoints": {
            "synthesize": "POST /synthesize",
            "synthesize_file": "POST /synthesize/file",
            "voices": "GET /voices",
            "languages": "GET /languages",
            "validate": "POST /validate",
            "health": "GET /health",
        }
    }


@app.get("/health", response_model=HealthResponse, tags=["System"])
async def health_check():
    """Check API health status."""
    try:
        tts = get_tts()
        return HealthResponse(
            status="healthy",
            tts_ready=True,
            voices_available=tts.voice_style_names
        )
    except Exception as e:
        return HealthResponse(
            status="unhealthy",
            tts_ready=False,
            voices_available=[]
        )


@app.get("/voices", response_model=VoiceListResponse, tags=["Voices"])
async def list_voices():
    """List all available voice styles."""
    tts = get_tts()
    return VoiceListResponse(
        voices=tts.voice_style_names,
        count=len(tts.voice_style_names)
    )


@app.get("/languages", tags=["Languages"])
async def list_languages():
    """List all supported languages."""
    return {
        "languages": [lang.value for lang in Language],
        "supported": ["en", "ko", "es", "pt", "fr"],
        "count": len(Language)
    }


@app.post("/validate", response_model=ValidationResponse, tags=["Validation"])
async def validate_text(request: SynthesizeRequest):
    """Validate text for synthesis without generating audio."""
    tagged_text, lang_value = validate_and_prepare_text(request.text, request.language)
    
    # Simple validation
    unsupported_chars = [c for c in request.text if ord(c) > 127]
    
    # Estimate chunk count
    chunk_count = max(1, len(tagged_text) // request.max_chunk_length)
    
    return ValidationResponse(
        valid=len(unsupported_chars) == 0,
        text_length=len(request.text),
        chunk_count=chunk_count,
        supported_chars=len(request.text) - len(unsupported_chars),
        unsupported_chars=unsupported_chars[:10]  # Return first 10
    )


@app.post("/synthesize", response_model=SynthesisResponse, tags=["Synthesis"])
async def synthesize(request: SynthesizeRequest):
    """
    Synthesize text to speech.
    
    Returns JSON with audio file path. Audio files are saved to outputs/synthesize/.
    """
    try:
        # Validate inputs
        validate_voice(request.voice)
        validate_language(request.language)
        
        # Prepare text
        tagged_text, lang_value = validate_and_prepare_text(request.text, request.language)
        
        # Get TTS instance
        tts = get_tts()
        style = tts.get_voice_style(request.voice.upper())
        
        # Determine quality steps
        quality_steps = {
            "fast": 3,
            "balanced": 5,
            "high": 10,
            "ultra": 15
        }
        steps = request.total_steps or quality_steps.get(request.quality, 5)
        
        # Synthesize
        wav, duration = tts.synthesize(
            tagged_text,
            voice_style=style,
            lang=lang_value,
            speed=request.speed,
            total_steps=steps,
            max_chunk_length=request.max_chunk_length,
            silence_duration=request.silence_duration,
            verbose=request.verbose
        )
        
        # Create output directory
        output_dir = Path("outputs/synthesize")
        output_dir.mkdir(parents=True, exist_ok=True)
        
        # Generate filename
        import hashlib
        text_hash = hashlib.md5(request.text.encode()).hexdigest()[:8]
        output_path = output_dir / f"tts_{lang_value}_{request.voice}_{text_hash}.wav"
        
        # Save audio
        tts.save_audio(wav, str(output_path))
        
        return SynthesisResponse(
            success=True,
            message="Audio synthesized successfully",
            audio_path=str(output_path),
            duration=duration[0],
            language=lang_value,
            voice=request.voice.upper(),
            text_length=len(request.text)
        )
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Synthesis failed: {str(e)}")


@app.post("/synthesize/file", tags=["Synthesis"])
async def synthesize_file(
    text: str = Query(..., min_length=1, max_length=10000, description="Text to synthesize"),
    voice: str = Query(default="M1", description="Voice key"),
    language: str = Query(default="en", description="Language code"),
    speed: float = Query(default=1.0, ge=0.5, le=2.0),
    quality: str = Query(default="balanced"),
):
    """
    Synthesize text to speech and return audio file directly.
    
    Returns: audio/wav file
    """
    try:
        # Validate inputs
        validate_voice(voice)
        validate_language(language)
        
        # Prepare text
        tagged_text, lang_value = validate_and_prepare_text(text, language)
        
        # Get TTS instance
        tts = get_tts()
        style = tts.get_voice_style(voice.upper())
        
        # Determine quality steps
        quality_steps = {"fast": 3, "balanced": 5, "high": 10, "ultra": 15}
        steps = quality_steps.get(quality, 5)
        
        # Synthesize
        wav, duration = tts.synthesize(
            tagged_text,
            voice_style=style,
            lang=lang_value,
            speed=speed,
            total_steps=steps,
        )
        
        # Save to temp file
        import tempfile
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tts.save_audio(wav, tmp.name)
            
            return FileResponse(
                tmp.name,
                media_type="audio/wav",
                filename=f"supertonic_{lang_value}_{voice}.wav"
            )
            
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Synthesis failed: {str(e)}")


@app.get("/examples/texts", tags=["Examples"])
async def get_example_texts():
    """Get example texts for each language."""
    return {
        "texts": {
            "en": ExampleTexts.ENGLISH,
            "ko": ExampleTexts.KOREAN,
            "es": ExampleTexts.SPANISH,
            "pt": ExampleTexts.PORTUGUESE,
            "fr": ExampleTexts.FRENCH,
        }
    }


@app.get("/voices/{voice_key}/info", tags=["Voices"])
async def get_voice_info(voice_key: str):
    """Get information about a specific voice."""
    try:
        voice = Voice.from_key(voice_key.upper())
        file = get_voice_file(voice_key.upper())
        url = get_voice_url(voice_key.upper())
        
        return {
            "key": voice_key.upper(),
            "file": file,
            "url": url,
            "gender": "male" if voice_key.upper().startswith("M") else "female",
            "number": voice_key.upper()[1:],
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ============== Run Server ==============


if __name__ == "__main__":
    import uvicorn
    
    # Ensure outputs directory exists
    Path("outputs").mkdir(exist_ok=True)
    
    uvicorn.run(
        "src.server:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
