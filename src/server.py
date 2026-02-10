"""
Supertonic TTS API Server

FastAPI-based REST API for Supertonic Text-to-Speech synthesis.
Provides OpenAPI/Swagger documentation at /docs.
"""

import os
import sys
import time
import glob
import base64
import tempfile
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
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
    get_voice_file,
    get_voice_url,
)

# Lazy import supertonic to avoid startup issues
_tts_instance = None

# Cache configuration
CACHE_DIR = Path("outputs/synthesize")
CACHE_MAX_SIZE_MB = 100  # Max cache size in MB
CACHE_MAX_FILES = 50  # Max number of files to keep
CACHE_MAX_AGE_HOURS = 24  # Max age of files in hours


def get_tts():
    """Get or create TTS instance."""
    global _tts_instance
    if _tts_instance is None:
        from supertonic import TTS
        _tts_instance = TTS()
    return _tts_instance


def cleanup_cache():
    """Clean up old cache files based on size and age limits."""
    try:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        
        # Get all wav files with their modified times
        files = []
        for f in CACHE_DIR.glob("*.wav"):
            stat = f.stat()
            files.append({
                "path": f,
                "mtime": datetime.fromtimestamp(stat.st_mtime),
                "size": stat.st_size
            })
        
        # Sort by modification time (oldest first)
        files.sort(key=lambda x: x["mtime"])
        
        # Calculate current size
        total_size = sum(f["size"] for f in files)
        total_size_mb = total_size / (1024 * 1024)
        
        # Remove old files if over limits
        files_to_remove = []
        
        # Check size limit
        if total_size_mb > CACHE_MAX_SIZE_MB:
            for f in files:
                if total_size_mb <= CACHE_MAX_SIZE_MB:
                    break
                total_size_mb -= f["size"] / (1024 * 1024)
                files_to_remove.append(f)
        
        # Check file count limit
        if len(files) - len(files_to_remove) > CACHE_MAX_FILES:
            remaining = CACHE_MAX_FILES
            for f in files:
                if remaining <= 0:
                    files_to_remove.append(f)
                else:
                    remaining -= 1
        
        # Check age limit
        cutoff = datetime.now() - timedelta(hours=CACHE_MAX_AGE_HOURS)
        for f in files:
            if f["mtime"] < cutoff:
                files_to_remove.append(f)
        
        # Remove files
        for f in files_to_remove:
            try:
                f["path"].unlink()
            except OSError:
                pass
        
        if files_to_remove:
            print(f"🧹 Cleaned up {len(files_to_remove)} old cache files")
            
    except Exception as e:
        print(f"⚠ Cache cleanup failed: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup/shutdown events."""
    # Startup
    print("🚀 Starting Supertonic TTS API Server...")
    print(f"📁 Cache config: max={CACHE_MAX_SIZE_MB}MB, max_files={CACHE_MAX_FILES}, max_age={CACHE_MAX_AGE_HOURS}h")
    
    # Initial cleanup
    cleanup_cache()
    
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
    version="1.1.0",
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
    save_to_file: bool = Field(default=True, description="Save audio to file and return path")
    output_path: Optional[str] = Field(default=None, description="Custom output path (relative or absolute)")


# ============== Response Models ==============


class SynthesisResponse(BaseModel):
    """Response model for synthesis endpoint (file mode)."""
    success: bool
    message: str
    audio_path: Optional[str] = None
    duration: Optional[float] = None
    language: str
    voice: str
    text_length: int


class AudioDataResponse(BaseModel):
    """Response model for synthesis endpoint (data mode)."""
    success: bool
    message: str
    duration: Optional[float] = None
    language: str
    voice: str
    text_length: int
    audio_format: str
    sample_rate: int
    audio_data: str  # Base64 encoded audio


class CacheInfoResponse(BaseModel):
    """Response model for cache info endpoint."""
    file_count: int
    total_size_mb: float
    max_size_mb: int
    max_files: int
    max_age_hours: int


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


def get_output_path(voice: str, language: str, custom_path: Optional[str] = None) -> Path:
    """Get output path for audio file."""
    if custom_path:
        path = Path(custom_path)
        # If relative, make it relative to CACHE_DIR
        if not path.is_absolute():
            path = CACHE_DIR / path
    else:
        # Generate filename
        import hashlib
        timestamp = int(time.time())
        text_hash = hashlib.md5(f"{timestamp}".encode()).hexdigest()[:8]
        path = CACHE_DIR / f"tts_{language}_{voice}_{text_hash}.wav"
    
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def get_cache_info() -> dict:
    """Get cache directory information."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    files = list(CACHE_DIR.glob("*.wav"))
    total_size = sum(f.stat().st_size for f in files)
    return {
        "file_count": len(files),
        "total_size_mb": total_size / (1024 * 1024),
        "max_size_mb": CACHE_MAX_SIZE_MB,
        "max_files": CACHE_MAX_FILES,
        "max_age_hours": CACHE_MAX_AGE_HOURS
    }


# ============== API Endpoints ==============


@app.get("/", tags=["Info"])
async def root():
    """Root endpoint with API information."""
    return {
        "name": "Supertonic TTS API",
        "version": "1.1.0",
        "docs": "/docs",
        "health": "/health",
        "endpoints": {
            "synthesize": "POST /synthesize",
            "synthesize_bytes": "POST /synthesize/bytes",
            "voices": "GET /voices",
            "languages": "GET /languages",
            "validate": "POST /validate",
            "cache": "GET /cache",
            "cache_cleanup": "POST /cache/cleanup",
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
async def synthesize(request: SynthesizeRequest, background_tasks: BackgroundTasks):
    """
    Synthesize text to speech.
    
    By default, saves audio to file and returns path. Set `save_to_file=false` 
    to use `/synthesize/bytes` for direct audio data.
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
        )
        
        if request.save_to_file:
            # Save to file
            output_path = get_output_path(request.voice.upper(), lang_value, request.output_path)
            tts.save_audio(wav, str(output_path))
            
            # Schedule cleanup
            background_tasks.add_task(cleanup_cache)
            
            return SynthesisResponse(
                success=True,
                message="Audio synthesized successfully",
                audio_path=str(output_path),
                duration=duration[0],
                language=lang_value,
                voice=request.voice.upper(),
                text_length=len(request.text)
            )
        else:
            # Let the user handle it - return basic info
            return SynthesisResponse(
                success=True,
                message="Audio synthesized successfully (use /synthesize/bytes for data)",
                duration=duration[0],
                language=lang_value,
                voice=request.voice.upper(),
                text_length=len(request.text)
            )
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Synthesis failed: {str(e)}")


@app.post("/synthesize/bytes", tags=["Synthesis"])
async def synthesize_bytes(request: SynthesizeRequest):
    """
    Synthesize text and return audio as base64-encoded data.
    
    Returns JSON with base64-encoded audio for direct use in applications.
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
        )
        
        # Convert to base64 (save to temp file first for proper WAV format)
        import tempfile
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp_path = tmp.name
        
        tts.save_audio(wav, tmp_path)
        
        with open(tmp_path, 'rb') as f:
            audio_bytes = f.read()
        
        import os
        os.unlink(tmp_path)
        
        audio_data = base64.b64encode(audio_bytes).decode('utf-8')
        
        return AudioDataResponse(
            success=True,
            message="Audio synthesized successfully",
            duration=duration[0],
            language=lang_value,
            voice=request.voice.upper(),
            text_length=len(request.text),
            audio_format="wav",
            sample_rate=44100,
            audio_data=audio_data
        )
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Synthesis failed: {str(e)}")


@app.get("/synthesize/file/{filename}", tags=["Synthesis"])
async def get_audio_file(filename: str):
    """Get a previously generated audio file."""
    file_path = CACHE_DIR / filename
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    
    if not str(file_path).endswith('.wav'):
        raise HTTPException(status_code=400, detail="Only WAV files are supported")
    
    return FileResponse(
        file_path,
        media_type="audio/wav",
        filename=filename
    )


@app.get("/cache", response_model=CacheInfoResponse, tags=["Cache"])
async def get_cache_info_endpoint():
    """Get cache directory information."""
    return CacheInfoResponse(**get_cache_info())


@app.post("/cache/cleanup", tags=["Cache"])
async def cleanup_cache_endpoint(background_tasks: BackgroundTasks):
    """Manually trigger cache cleanup."""
    cleanup_cache()
    return {"message": "Cache cleanup completed", **get_cache_info()}


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
    CACHE_DIR.mkdir(exist_ok=True)
    
    uvicorn.run(
        "src.server:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
