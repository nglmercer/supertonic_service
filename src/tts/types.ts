import type { TextToAudioOutput } from '@huggingface/transformers';

/**
 * Supported languages for Supertonic TTS
 */
export type Language = 'en' | 'ko' | 'es' | 'pt' | 'fr';

/**
 * Voice definitions mapping voice keys to binary file names
 */
export const VOICES = {
    F1: 'F1.bin',
    F2: 'F2.bin',
    F3: 'F3.bin',
    F4: 'F4.bin',
    F5: 'F5.bin',
    M1: 'M1.bin',
    M2: 'M2.bin',
    M3: 'M3.bin',
    M4: 'M4.bin',
    M5: 'M5.bin',
} as const;

/**
 * Voice keys available in Supertonic
 */
export type VoiceKey = keyof typeof VOICES;

/**
 * Extended audio output with additional methods
 */
export interface AudioOutput extends TextToAudioOutput {
    toWav(): Uint8Array;
    toBlob(): Blob;
    save(path: string): Promise<void>;
}

/**
 * Synthesis options for TTS
 */
export interface SynthesisOptions {
    rate?: string;
    volume?: string;
    pitch?: string;
}

// ============================================================================
// Shared API Types (used by both server and client)
// ============================================================================

/**
 * Parameters for synthesize endpoint
 */
export interface SynthesizeParams {
    text: string;
    voice?: VoiceKey;
    filename?: string;
    options?: SynthesisOptions;
    language?: Language;
    writeToFile?: boolean;
}

/**
 * Parameters for synthesize-mixed endpoint
 */
export interface SynthesizeMixedParams {
    taggedText: string;
    voice?: VoiceKey;
    filename?: string;
    options?: SynthesisOptions;
    silenceDuration?: number;
    writeToFile?: boolean;
}

/**
 * Empty parameters for getVoices and health endpoints
 */
export type EmptyParams = Record<string, never>;

/**
 * TTS Service method names
 */
export type TTSMethod = 'synthesize' | 'synthesizeMixed' | 'getVoices' | 'health';

/**
 * Result type for synthesize endpoint
 */
export interface SynthesizeResult {
    savedPath: string | null;
    audioBase64: string;
    detectedLanguage: Language;
}

/**
 * Result type for synthesize-mixed endpoint
 */
export interface SynthesizeMixedResult {
    savedPath: string | null;
    audioBase64: string;
}

/**
 * Result type for getVoices endpoint
 */
export interface GetVoicesResult {
    voices: VoiceKey[];
}

/**
 * Result type for health endpoint
 */
export interface HealthResult {
    status: 'ok' | 'error';
    timestamp: string;
    libp2p?: 'enabled' | 'disabled';
}

/**
 * Union of all TTS method results
 */
export type TTSResultMap = {
    synthesize: SynthesizeResult;
    synthesizeMixed: SynthesizeMixedResult;
    getVoices: GetVoicesResult;
    health: HealthResult;
};

/**
 * Union of all TTS method parameters
 */
export type TTSParamsMap = {
    synthesize: SynthesizeParams;
    synthesizeMixed: SynthesizeMixedParams;
    getVoices: EmptyParams;
    health: EmptyParams;
};

/**
 * Generic TTS request
 */
export interface TTSRequest<M extends TTSMethod = TTSMethod> {
    method: M;
    params: TTSParamsMap[M];
}

/**
 * Generic TTS response
 */
export type TTSResponse<M extends TTSMethod = TTSMethod> =
    | { success: true; result: TTSResultMap[M] }
    | { success: false; error: string };
