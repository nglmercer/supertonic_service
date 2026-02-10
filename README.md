# Supertonic TTS Service

Text-to-Speech microservice with HTTP API and optional libp2p P2P networking.

## Quick Start

```bash
bun install
bun start
```

Server runs at `http://localhost:3000`

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/tts/synthesize` | Synthesize text to speech |
| POST | `/api/tts/synthesize-mixed` | Synthesize mixed-language text |
| GET | `/api/tts/voices` | List available voices |
| GET | `/api/tts/health` | Health check |

### POST `/api/tts/synthesize`

```json
{
  "text": "Hello world",
  "voice": "F1",
  "options": { "rate": "0%" }
}
```

Response:
```json
{
  "success": true,
  "audioBase64": "...",
  "detectedLanguage": "en",
  "savedPath": null
}
```

### POST `/api/tts/synthesize-mixed`

```json
{
  "taggedText": "<en>Hello</en><es>Hola</es>",
  "voice": "F1",
  "silenceDuration": 0.3
}
```

## Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `text` | string | required | Text to synthesize |
| `voice` | string | `F1` | Voice: `F1-F5`, `M1-M5` |
| `language` | string | auto | `en`, `ko`, `es`, `pt`, `fr` |
| `options.rate` | string | `0%` | Speed: `-50%` to `100%` |
| `writeToFile` | boolean | `false` | Save to server output dir |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `HOST` | `0.0.0.0` | Server host |
| `TTS_OUTPUT_DIR` | `./output` | Audio output directory |
| `LIBP2P_ENABLED` | `false` | Enable P2P networking |

## Client Usage

```bash
# Run the example client
bun run client

# Custom server URL
SERVER_URL=http://localhost:3000 bun run client
```

The client saves audio files locally from the base64 response.

## Docker

```bash
docker build -t supertonic .
docker run -p 3000:3000 supertonic
```

Multi-platform (x86_64 and ARM64) supported.

## Build

```bash
# Standalone binary (x86_64 only)
bun run build

# Docker (recommended for ARM64)
bun run build:docker
```

> **Note**: ARM64 standalone binaries have native module compatibility issues. Use Docker for ARM64 deployment.

## License

MIT
