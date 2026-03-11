/**
 * TTS Client Module
 * Modular client implementations for HTTP and Libp2p communication
 */

// Client implementations
export { HTTPClient } from './http-client.js';
export { Libp2pClient } from './libp2p-client.js';

// Utilities
export { saveAudioFile, getClientConfig } from './utils.js';
export type { ClientConfig, TTSClientInterface } from './utils.js';

// Re-export types from parent module
export type {
    TTSMethod,
    TTSParamsMap,
    TTSResultMap,
    TTSResponse,
    VoiceKey,
} from '../types.js';
