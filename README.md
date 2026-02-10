# Supertonic TTS API

FastAPI-based REST API for Supertonic Text-to-Speech synthesis with multilingual support.

## Features

- 🎵 **Text-to-Speech** - Convert text to natural-sounding speech
- 🌐 **Multilingual** - Supports English, Korean, Spanish, Portuguese, French
- 🎭 **Multiple Voices** - 10 voice styles (M1-M5, F1-F5)
- ⚡ **High Performance** - Fast synthesis with quality options
- 💾 **Cache Management** - Auto-cleanup of old audio files
- 🔄 **Flexible Output** - Save to file or get base64-encoded audio

## Requirements

- Python 3.8+
- supertonic (installed automatically)
- fastapi
- uvicorn

## Installation

```bash
pip install supertonic fastapi uvicorn requests
```

## Quick Start

### 1. Start the Server

```bash
python -m uvicorn src.server:app --host 0.0.0.0 --port 8000
```

Or use the run script:

```bash
python test_api.py
```

### 2. Use the API

**Health Check:**
```bash
curl http://localhost:8000/health
```

**List Voices:**
```bash
curl http://localhost:8000/voices
```

**Synthesize Audio (save to file):**
```bash
curl -X POST http://localhost:8000/synthesize \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Hello world! This is Supertonic TTS.",
    "voice": "M1",
    "language": "en",
    "save_to_file": true
  }'
```

**Synthesize Audio (get base64 data):**
```bash
curl -X POST http://localhost:8000/synthesize/bytes \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Hola mundo! Esta es Supertonic TTS.",
    "voice": "F1",
    "language": "es"
  }'
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | API information |
| GET | `/health` | Health check |
| GET | `/voices` | List available voices |
| GET | `/languages` | List supported languages |
| POST | `/validate` | Validate text before synthesis |
| POST | `/synthesize` | Synthesize audio (file mode) |
| POST | `/synthesize/bytes` | Synthesize audio (base64 mode) |
| GET | `/synthesize/file/{filename}` | Get saved audio file |
| GET | `/cache` | Get cache information |
| POST | `/cache/cleanup` | Trigger cache cleanup |
| GET | `/voices/{key}/info` | Get voice information |
| GET | `/examples/texts` | Get example texts |

## Request/Response Examples

### Synthesis Request (File Mode)

```json
POST /synthesize
{
  "text": "Hello world!",
  "voice": "M1",
  "language": "en",
  "speed": 1.0,
  "quality": "balanced",
  "save_to_file": true,
  "output_path": null
}
```

### Synthesis Response (File Mode)

```json
{
  "success": true,
  "message": "Audio synthesized successfully",
  "audio_path": "outputs/synthesize/tts_en_M1_abc123.wav",
  "duration": 4.12,
  "language": "en",
  "voice": "M1",
  "text_length": 12
}
```

### Synthesis Request (Bytes Mode)

```json
POST /synthesize/bytes
{
  "text": "Hello world!",
  "voice": "M1",
  "language": "en",
  "speed": 1.0,
  "quality": "balanced"
}
```

### Synthesis Response (Bytes Mode)

```json
{
  "success": true,
  "message": "Audio synthesized successfully",
  "duration": 4.12,
  "language": "en",
  "voice": "M1",
  "text_length": 12,
  "audio_format": "wav",
  "sample_rate": 44100,
  "audio_data": "UklGRi... (base64 encoded audio)"
}
```

## Python Client Example

```python
import requests
import base64

SERVER_URL = "http://localhost:8000"

def synthesize(text, voice="M1", language="en"):
    """Synthesize text and save to file."""
    response = requests.post(f"{SERVER_URL}/synthesize", json={
        "text": text,
        "voice": voice,
        "language": language,
        "save_to_file": True
    })
    return response.json()

def synthesize_bytes(text, voice="M1", language="en"):
    """Synthesize text and return base64 data."""
    response = requests.post(f"{SERVER_URL}/synthesize/bytes", json={
        "text": text,
        "voice": voice,
        "language": language
    })
    data = response.json()
    
    # Save base64 audio to file
    audio_bytes = base64.b64decode(data["audio_data"])
    with open("output.wav", "wb") as f:
        f.write(audio_bytes)
    
    return data

# Usage
result = synthesize("Hello world!", voice="M1", language="en")
print(f"Audio saved to: {result['audio_path']}")

synthesize_bytes("Hola mundo!", voice="F1", language="es")
```

## Configuration

### Cache Settings

Edit `src/server.py` to configure cache:

```python
CACHE_DIR = Path("outputs/synthesize")
CACHE_MAX_SIZE_MB = 100  # Max cache size in MB
CACHE_MAX_FILES = 50  # Max number of files
CACHE_MAX_AGE_HOURS = 24  # Max age in hours
```

### Default Synthesis Options

```python
class SynthesizeRequest:
    text: str = Field(..., min_length=1, max_length=10000)
    voice: str = "M1"  # M1-M5, F1-F5
    language: str = "en"  # en, ko, es, pt, fr
    speed: float = Field(1.0, ge=0.5, le=2.0)
    quality: str = "balanced"  # fast, balanced, high, ultra
    total_steps: int = None  # Auto-set by quality
    max_chunk_length: int = 300
    silence_duration: float = Field(0.3, ge=0.1, le=2.0)
    save_to_file: bool = True
    output_path: str = None
```

## Running Tests

```bash
# Run the test script (starts server, runs tests, stops server)
python test_api.py
```

## Project Structure

```
supertonic/
├── src/
│   ├── server.py       # FastAPI server with REST endpoints
│   └── core/           # Core module (enums, models, validation)
├── outputs/
│   └── synthesize/     # Audio cache directory
├── test_api.py         # Test script
├── README.md           # This file
└── requirements.txt     # Python dependencies
```

## Dependencies

- `supertonic>=1.1.0` - TTS library
- `fastapi>=0.100.0` - Web framework
- `uvicorn>=0.22.0` - ASGI server
- `requests>=2.31.0` - HTTP client
- `pydantic>=2.0` - Data validation

## License

MIT License

## References

- [Supertonic TTS](https://github.com/supertonic-ai/supertonic)
- [FastAPI Documentation](https://fastapi.tiangolo.com/)
