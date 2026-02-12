import { SUPPORTED_LANGUAGES } from './constants.js';
import type { Language } from './types.js';

/**
 * Parse rate string (e.g., '0%', '-10%', '+20%') to speed multiplier
 */
export function parseRateToSpeed(rate?: string): number {
    if (!rate) return 1.0;

    const match = rate.match(/([+-]?)(\d+)%/);
    if (!match) return 1.0;

    const sign = match[1] === '-' ? -1 : 1;
    const value = parseInt(match[2]!, 10);

    // Convert percentage to speed multiplier
    return 1.0 + (sign * value / 100);
}

/**
 * Sanitize filename for filesystem
 */
export function sanitizeFilename(filename: string): string {
    return filename
        .replace(/[^a-zA-Z0-9]/g, '_')
        .substring(0, 50);
}

/**
 * Check if language is supported
 */
export function isSupportedLanguage(lang: string): lang is Language {
    return (SUPPORTED_LANGUAGES as string[]).includes(lang);
}

/**
 * Detect language, defaulting to 'es' if unsupported
 */
export async function detectLanguage(lang: string = 'es'): Promise<Language> {
    return isSupportedLanguage(lang) ? lang : 'es';
}

/**
 * Parse tagged text into array of {lang, text} segments
 * Expected format: "<en>Hello</en> <es>Hola</es>"
 */
export function parseLanguageSegments(taggedText: string): Array<{ lang: Language; text: string }> {
    const segments: Array<{ lang: Language; text: string }> = [];
    const tagPattern = /<([a-z]{2})>([^<]*)<\/\1>/g;
    let match;

    while ((match = tagPattern.exec(taggedText)) !== null) {
        const lang = match[1] as Language;
        const textContent = match[2];
        if (textContent) {
            const trimmed = textContent.trim();
            if (trimmed) {
                segments.push({ lang, text: trimmed });
            }
        }
    }

    return segments;
}

/**
 * Find the data chunk in a WAV buffer
 */
function findDataChunk(buffer: Buffer): { offset: number; size: number } {
    let offset = 12; // Skip RIFF header
    while (offset < buffer.length - 8) {
        const chunkId = buffer.toString('ascii', offset, offset + 4);
        const chunkSize = buffer.readUInt32LE(offset + 4);
        
        if (chunkId === 'data') {
            return { offset: offset + 8, size: chunkSize };
        }
        
        offset += 8 + chunkSize;
    }
    throw new Error('No data chunk found in WAV buffer');
}

/**
 * Concatenate multiple WAV buffers into one
 * Skips headers of subsequent files and concatenates audio data
 */
export function concatenateWavBuffers(buffers: Buffer[]): Buffer {
    if (buffers.length === 0) return Buffer.alloc(0);
    if (buffers.length === 1) return buffers[0]!;

    // Parse first WAV to get format info
    const firstBuffer = buffers[0]!;
    const audioFormat = firstBuffer.readUInt16LE(20);
    const channels = firstBuffer.readUInt16LE(22);
    const sampleRate = firstBuffer.readUInt32LE(24);
    const byteRate = firstBuffer.readUInt32LE(28);
    const blockAlign = firstBuffer.readUInt16LE(32);
    const bitsPerSample = firstBuffer.readUInt16LE(34);

    // Calculate total data size and validate chunks
    let totalDataSize = 0;
    const dataChunks: { offset: number; size: number }[] = [];

    for (const buffer of buffers) {
        try {
            const chunk = findDataChunk(buffer);
            dataChunks.push(chunk);
            totalDataSize += chunk.size;
        } catch (e) {
            console.warn('Skipping invalid WAV buffer during concatenation');
        }
    }

    // Create combined buffer
    const headerSize = 44;
    const totalSize = headerSize + totalDataSize;
    const combined = Buffer.alloc(totalSize);

    // Write header
    combined.write('RIFF', 0);
    combined.writeUInt32LE(36 + totalDataSize, 4);
    combined.write('WAVE', 8);
    combined.write('fmt ', 12);
    combined.writeUInt32LE(16, 16); // Subchunk1Size
    combined.writeUInt16LE(audioFormat, 20); // AudioFormat
    combined.writeUInt16LE(channels, 22);
    combined.writeUInt32LE(sampleRate, 24);
    combined.writeUInt32LE(byteRate, 28);
    combined.writeUInt16LE(blockAlign, 32);
    combined.writeUInt16LE(bitsPerSample, 34);
    combined.write('data', 36);
    combined.writeUInt32LE(totalDataSize, 40);

    // Concatenate audio data
    let currentOffset = headerSize;
    for (let i = 0; i < buffers.length; i++) {
        if (i >= dataChunks.length) break;
        const buffer = buffers[i]!;
        const { offset: dataStart, size: dataSize } = dataChunks[i]!;
        
        buffer.copy(combined, currentOffset, dataStart, dataStart + dataSize);
        currentOffset += dataSize;
    }

    return combined;
}

/**
 * Create silence buffer for WAV concatenation
 */
export function createSilenceBuffer(durationSeconds: number, sampleRate: number = 24000): Buffer {
    const silenceSamples = Math.floor(durationSeconds * sampleRate);
    const silenceBuffer = Buffer.alloc(44 + silenceSamples * 2);
    
    // Create minimal WAV header for silence
    silenceBuffer.write('RIFF', 0);
    silenceBuffer.writeUInt32LE(36 + silenceSamples * 2, 4);
    silenceBuffer.write('WAVE', 8);
    silenceBuffer.write('fmt ', 12);
    silenceBuffer.writeUInt32LE(16, 16);
    silenceBuffer.writeUInt16LE(1, 20); // PCM
    silenceBuffer.writeUInt16LE(1, 22); // Mono
    silenceBuffer.writeUInt32LE(sampleRate, 24); // Sample rate
    silenceBuffer.writeUInt32LE(sampleRate * 2, 28); // Byte rate
    silenceBuffer.writeUInt16LE(2, 32); // Block align
    silenceBuffer.writeUInt16LE(16, 34); // Bits per sample
    silenceBuffer.write('data', 36);
    silenceBuffer.writeUInt32LE(silenceSamples * 2, 40);
    
    return silenceBuffer;
}

/**
 * Validate voice key, return default if invalid
 */
export function validateVoice(voice: string): string {
    const validVoices = ['F1', 'F2', 'F3', 'F4', 'F5', 'M1', 'M2', 'M3', 'M4', 'M5'];
    if (validVoices.includes(voice)) {
        return voice;
    }
    return 'F1'; // Default voice
}
