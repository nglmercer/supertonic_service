import type { Language } from './types.js';

/**
 * Base URL for HuggingFace Supertonic voice embeddings
 */
export const BASE_URL = 'https://huggingface.co/onnx-community/Supertonic-TTS-2-ONNX/resolve/main/voices/';

/**
 * Supported languages array
 */
export const SUPPORTED_LANGUAGES: Language[] = ["en", "ko", "es", "pt", "fr"];
