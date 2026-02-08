import type { TextToAudioOutput, TextToAudioPipelineOptions } from '@huggingface/transformers';

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
