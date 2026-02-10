# Supertonic TTS API

FastAPI-based REST API for Supertonic Text-to-Speech synthesis with multilingual support.

## Features

- 🎵 **Text-to-Speech** - Convert text to natural-sounding speech
- 🌐 **Multilingual** - Supports English, Korean, Spanish, Portuguese, French
- 🎭 **Multiple Voices** - 10 voice styles (M1-M5, F1-F5)
- ⚡ **High Performance** - Fast synthesis with quality options
- 💾 **Cache Management** - Auto-cleanup of old audio files
- 🔄 **Flexible Output** - Save to file or get base64-encoded audio
- 🐳 **Docker Ready** - Deploy anywhere with Docker

## Quick Start

### Option 1: Docker (Recommended)

```bash
# Pull and run
docker run -p 8000:8000 ghcr.io/yourusername/supertonic-tts-api:latest

# Or build locally
docker build -t supertonic-api .
docker run -p 8000:8000 supertonic-api
```

### Option 2: Python

```bash
# Install dependencies
pip install -r requirements.txt

# Start server
python -m uvicorn src.server:app --host 0.0.0.0 --port 8000
```

### Option 3: Run Tests

```bash
python test_api.py
```

## Usage Examples

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
    "text": "Hello world!",
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
    "text": "Hola mundo!",
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
| GET | `/cache` | Get cache information |
| POST | `/cache/cleanup` | Trigger cache cleanup |

## Python Client

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
```

## Configuration

### Cache Settings (src/server.py)

```python
CACHE_DIR = Path("outputs/synthesize")
CACHE_MAX_SIZE_MB = 100  # Max cache size in MB
CACHE_MAX_FILES = 50     # Max number of files
CACHE_MAX_AGE_HOURS = 24 # Max age in hours
```

## Docker Configuration

### Build Image
```bash
docker build -t supertonic-api .
```

### Run Container
```bash
docker run -p 8000:8000 \
  -v $(pwd)/outputs:/app/outputs \
  supertonic-api
```

### Environment Variables
| Variable | Description | Default |
|----------|-------------|---------|
| PORT | Server port | 8000 |

## CI/CD

GitHub Actions workflow automatically:
1. Builds and tests on every push/PR
2. Pushes to GitHub Container Registry on tags
3. Creates releases on version tags

**Image Tags:**
- `latest` - Latest stable version
- `v1.1.0`, `v1.1` - Specific version tags
- `sha-abc123` - Commit-based tags

## Project Structure

```
supertonic/
├── src/
│   ├── server.py       # FastAPI server
│   └── core/           # Core module
├── outputs/
│   └── synthesize/     # Audio cache
├── test_api.py         # Test script
├── Dockerfile          # Docker image
├── requirements.txt    # Python deps
└── README.md
```

## Dependencies

- `supertonic>=1.1.0` - TTS library
- `fastapi>=0.100.0` - Web framework
- `uvicorn>=0.22.0` - ASGI server
- `requests>=2.31.0` - HTTP client

## License

MIT License

## References

- [Supertonic TTS](https://github.com/supertonic-ai/supertonic)
- [FastAPI Documentation](https://fastapi.tiangolo.com/)
