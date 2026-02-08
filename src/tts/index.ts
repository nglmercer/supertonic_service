// Barrel export for TTS module
// Re-export all public types, constants, and classes

export * from './types.js';
export * from './constants.js';
export * from './preprocessor.js';
// Explicitly re-export utils to avoid naming conflicts
export { parseRateToSpeed, sanitizeFilename, parseLanguageSegments, concatenateWavBuffers, createSilenceBuffer, validateVoice } from './utils.js';
export { FileHandler } from './file-handler.js';
export { SupertonicTTS } from './supertonic-client.js';
export { TTSService, type LanguageDetectionResult, type LanguageDetector } from './service.js';
