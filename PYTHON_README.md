# Supertonic TTS - Python Implementation

This directory contains a pure Python implementation of the Supertonic TTS microservice, mirroring the TypeScript/JavaScript version but with Python-specific optimizations and lazy loading of heavy dependencies.

## 📦 Project Structure

```
src/tts/
├── __init__.py          # Barrel exports with lazy loading for heavy dependencies
├── types.py             # Type definitions and data classes
├── constants.py         # Constants (SUPPORTED_LANGUAGES, BASE_URL, VOICES)
├── utils.py             # Utility functions (rate parsing, WAV manipulation, etc.)
├── preprocessor.py      # Text preprocessing and language detection
├── file_handler.py      # Async file I/O with anyio fallback
├── supertonic_client.py # ONNX TTS client (lazy-loads numpy/onnxruntime)
└── service.py           # High-level TTSService with singleton pattern

tests/
├── conftest.py          # Pytest fixtures
├── test_utils.py        # Tests for utils module
├── test_preprocessor.py # Tests for preprocessor module
├── test_file_handler.py # Tests for file handler module
└── test_service.py      # Tests for TTSService

demo.py                  # Comprehensive demo script
pyproject.toml          # Python package configuration
```

## ✨ Features

- **Core utilities without heavy dependencies**: All text preprocessing, WAV manipulation, and file handling work without requiring numpy or onnxruntime
- **Lazy dependency loading**: ONNX models and numpy are only imported when actually needed for synthesis
- **Optional async support**: Uses anyio for async file I/O, with automatic fallback to synchronous operations
- **Singleton service pattern**: TTSService ensures only one instance exists (like the JS version)
- **Custom language detection**: Pluggable language detector interface
- **Mixed-language synthesis**: Support for multiple languages in a single audio file
- **Comprehensive tests**: Test coverage for all core functionality

## 🚀 Quick Start

### Installation

```bash
# Install with pip (include dev dependencies for testing)
pip install -e ".[dev]"

# Or install core dependencies only
pip install -e .
```

### Basic Usage

```python
import asyncio
from tts import TTSService, mix_languages

async def main():
    # Get singleton instance
    tts = TTSService.get_instance('./output')
    
    # Synthesize text (auto-detects language)
    result = await tts.synthesize(
        text="Hello, this is a test.",
        voice="F1",
        filename="test",
        write_to_file=True
    )
    
    print(f"Saved to: {result.saved_path}")
    print(f"Detected language: {result.detected_language}")
    
    # Mixed-language synthesis
    mixed_text = mix_languages([
        ('en', 'Hello'),
        ('es', 'Hola'),
        ('fr', 'Bonjour')
    ])
    
    mixed_result = await tts.synthesize_mixed(
        mixed_text,
        voice="M1",
        filename="mixed",
        write_to_file=True
    )
    
    print(f"Mixed audio saved to: {mixed_result.saved_path}")

asyncio.run(main())
```

### Using Custom Language Detector

```python
def my_detector(text: str) -> dict:
    # Your custom logic (call external API, use different library, etc.)
    if any(c in 'ñáéíóú' for c in text):
        return {"language": "es", "summary": text[:50]}
    return {"language": "en", "summary": text[:50]}

tts = TTSService.get_instance('./output', language_detector=my_detector)
```

### Direct ONNX Client Usage

```python
from tts import SupertonicTTS, AudioOutput

async def synthesize():
    client = SupertonicTTS("F1")
    audio = await client.speak(
        text="<en>Hello world</en>",
        voice_key="F1",
        options={"speed": 1.0, "num_inference_steps": 5}
    )
    
    # Get WAV bytes
    wav_bytes = audio.to_wav()
    
    # Save to file
    audio.save("output.wav")
```

## 🧪 Testing

The test suite covers all core functionality without requiring ONNX models:

```bash
# Run all tests
pytest tests/

# Run specific test files
pytest tests/test_utils.py -v
pytest tests/test_preprocessor.py -v
pytest tests/test_file_handler.py -v
pytest tests/test_service.py -v

# Run with coverage
pytest tests/ --cov=src/tts --cov-report=html
```

**Note**: Tests for `SupertonicTTS` and full integration require actual ONNX models and are not included in the core test suite.

## 📋 Requirements

### Core Dependencies
- `numpy>=1.24.0` - Required for actual synthesis (lazy-loaded)
- `onnxruntime>=1.15.0` - Required for actual synthesis (lazy-loaded)
- `soundfile>=0.12.1` - For audio file I/O
- `anyio>=4.0.0` - For async file operations (optional fallback to sync)

### Development Dependencies
- `pytest>=7.0.0` - Test framework
- `pytest-asyncio>=0.21.0` - Async test support
- `pytest-mock>=3.10.0` - Mocking support

## 🔧 Module Documentation

### `types.py`
Type definitions mirroring the TypeScript implementation:
- `Language` - Literal type for supported languages
- `VOICES` - Voice name mapping
- `VoiceKey` - Literal type for voice identifiers
- `SynthesisOptions`, `SynthesisResult`, `MixedSynthesisResult`
- `LanguageDetectionResult`, `Style`, `TTSConfig`

### `constants.py`
- `BASE_URL` - HuggingFace voice embeddings URL
- `SUPPORTED_LANGUAGES` - List of supported language codes

### `utils.py`
Core utilities:
- `parse_rate_to_speed(rate: str) -> float` - Convert "+10%" to 1.1
- `sanitize_filename(filename: str) -> str` - Filesystem-safe names
- `is_supported_language(lang: str) -> bool`
- `detect_language(lang: str) -> Language` - Fallback to 'es' if unsupported
- `parse_language_segments(tagged_text: str) -> List[Tuple[Language, str]]`
- `concatenate_wav_buffers(buffers: List[bytes]) -> bytes`
- `create_silence_buffer(duration: float, sample_rate: int) -> bytes`
- `validate_voice(voice: str) -> str`
- `chunk_text(text: str, max_len: int) -> List[str]`

### `preprocessor.py`
Text preprocessing:
- `detect_language(txt: str) -> dict` - Placeholder for language detection
- `has_language_tags(text: str) -> bool`
- `preprocess_text(text: str, lang: Language) -> str` - Full normalization pipeline
- `mix_languages(segments: List[Tuple[Language, str]]) -> str`

### `file_handler.py`
Async file operations:
- `FileHandler(output_dir: str)` - Initialize with output directory
- `async write_audio_file(file_buffer: bytes, filename: str) -> str`
- `get_output_dir() -> str`
- `directory_exists() -> bool`

### `supertonic_client.py`
ONNX-based TTS client:
- `SupertonicTTS(default_voice: str = "F1")`
- `async speak(text: str, voice_key: VoiceKey, options: dict) -> AudioOutput`
- `get_available_voices() -> list[VoiceKey]`
- `AudioOutput` - Wrapper with `to_wav()`, `to_blob()`, `save(path)`
- `UnicodeProcessor` - Text to unicode indices converter

**Note**: Heavy dependencies (numpy, onnxruntime) are lazy-loaded only when `_initialize_pipeline()` is called.

### `service.py`
High-level service with singleton pattern:
- `TTSService.get_instance(output_dir, language_detector) -> TTSService`
- `TTSService.reset_instance()`
- `async synthesize(text, voice, filename, options, language, write_to_file) -> SynthesisResult`
- `async synthesize_mixed(tagged_text, voice, filename, options, silence_duration, write_to_file) -> MixedSynthesisResult`
- `async get_voices() -> list[str]`
- `async health() -> dict`

## 🔄 Comparison with TypeScript Version

| Feature | TypeScript | Python |
|---------|-----------|--------|
| Text Processing | ✅ Identical | ✅ Identical |
| WAV Concatenation | ✅ | ✅ |
| Singleton Pattern | ✅ | ✅ |
| Async I/O | ✅ (fs.promises) | ✅ (anyio + sync fallback) |
| Lazy Dependencies | N/A | ✅ (numpy, onnxruntime) |
| Language Detection | Custom middleware | Custom middleware |
| Mixed-Language | ✅ | ✅ |
| Service Layer | ✅ | ✅ |
| ONNX Client | HuggingFace Transformers | Direct ONNX Runtime |

## 📝 Differences from JS Implementation

1. **Lazy imports**: Heavy dependencies (numpy, onnxruntime) are only loaded when needed
2. **Optional anyio**: Falls back to synchronous file operations if anyio is not installed
3. **Module-level `__getattr__`**: For lazy loading of `SupertonicTTS` and `TTSService` in `__init__.py`
4. **TYPE_CHECKING guard**: Type hints don't require heavy deps at import time
5. **Python 3.9+**: Uses `from __future__ import annotations` to avoid forward reference issues

## 🎯 Demo Script

Run the comprehensive demo:

```bash
python demo.py
```

This demonstrates:
1. Auto language detection
2. Explicit language specification
3. Mixed-language synthesis
4. Custom language detector
5. Direct utility usage

**Note**: The demo requires ONNX models to be present in `assets/onnx/` and voice styles in `assets/voice_styles/`. Without these, it will fail when trying to initialize the pipeline.

## 🏗️ Design Decisions

### Why lazy loading?
The TypeScript version uses `@huggingface/transformers` which is always available. In Python, numpy and onnxruntime are heavy dependencies that may not be needed for all use cases (e.g., if you only use the preprocessor and utils). Our implementation defers these imports until actual synthesis.

### Why TYPE_CHECKING?
To provide proper type hints without forcing the runtime to import modules that aren't needed yet. This allows `from tts.utils import parse_rate_to_speed` to work even if numpy is not installed.

### Why anyio fallback?
anyio provides excellent async file I/O, but we don't want it to be a hard requirement for basic functionality. The fallback ensures the module works in minimal environments.

## 🧩 Extending the Implementation

### Custom Preprocessor

```python
from tts.preprocessor import preprocess_text

def my_preprocess(text: str, lang: str) -> str:
    # Custom logic before standard preprocessing
    text = text.upper()
    return preprocess_text(text, lang)

tts.set_preprocessor(my_preprocess)  # Would need to add this method
```

### Custom File Handler

```python
from tts.file_handler import FileHandler

class S3FileHandler(FileHandler):
    async def write_audio_file(self, file_buffer: bytes, filename: str) -> str:
        # Upload to S3 instead of local filesystem
        s3_key = f"tts/{filename}.wav"
        await upload_to_s3(file_buffer, s3_key)
        return f"s3://bucket/{s3_key}"

# Inject into service
tts = TTSService.get_instance(file_handler=S3FileHandler('./output'))
```

## 📊 Test Coverage

The test suite covers:
- ✅ Rate parsing (parse_rate_to_speed)
- ✅ Filename sanitization
- ✅ Language validation
- ✅ Text chunking
- ✅ WAV buffer concatenation
- ✅ Silence buffer creation
- ✅ Voice validation
- ✅ Text preprocessing (all edge cases)
- ✅ Language segment parsing
- ✅ FileHandler operations
- ✅ TTSService singleton pattern
- ✅ Custom language detector injection
- ✅ Synthesis options handling

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## 📄 License

MIT

## 🙏 Acknowledgments

This Python implementation is a port of the original TypeScript Supertonic TTS microservice. Thanks to all contributors to the original project.