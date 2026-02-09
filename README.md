# Supertonic TTS API

Text-to-Speech microservice using Supertonic ONNX models.

## Quick Start

```bash
bun install
bun run start
```

Server runs on `http://localhost:3000`

## Endpoints

### POST `/api/tts/synthesize`

Synthesize text to speech.

**Request:**
```json
{
  "text": "Hello world",
  "voice": "F1",
  "filename": "output",
  "language": "en",
  "writeToFile": false
}
```

**Response:**
```json
{
  "success": true,
  "audioBase64": "...",
  "detectedLanguage": "en"
}
```

### POST `/api/tts/synthesize-mixed`

Synthesize mixed-language text with language tags.

**Request:**
```json
{
  "taggedText": "<en>Hello</en> <es>Hola</es>",
  "voice": "F1",
  "silenceDuration": 0.3
}
```

### GET `/api/tts/voices`

List available voices.

### GET `/api/health`

Health check.

## Options

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `text` | string | required | Text to synthesize |
| `voice` | string | `F1` | Voice: `F1-F5`, `M1-M5` |
| `language` | string | auto | `en`, `ko`, `es`, `pt`, `fr` |
| `options.rate` | string | `0%` | Speed: `-50%` to `100%` |
| `writeToFile` | boolean | `false` | Save to output directory |

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `HOST` | `0.0.0.0` | Server host |
| `TTS_OUTPUT_DIR` | `./output` | Audio output directory |
