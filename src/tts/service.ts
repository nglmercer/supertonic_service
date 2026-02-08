import * as fs from 'fs';
import * as path from 'path';
import { SupertonicTTS } from './supertonic-client.js';
import { VOICES, type VoiceKey, type Language, type SynthesisOptions, type AudioOutput } from './types.js';
import { SUPPORTED_LANGUAGES } from './constants.js';
import { detectLanguage as defaultDetectLanguage, preprocessText } from './preprocessor.js';

/**
 * Language detection result interface
 */
export interface LanguageDetectionResult {
    language: string;
    summary?: string;
}

/**
 * Language detector function type
 * Users can provide their own implementation (e.g., calling an external API, using a different library)
 */
export type LanguageDetector = (text: string) => Promise<LanguageDetectionResult> | LanguageDetectionResult;

/**
 * TTSService - Main Text-to-Speech service
 * Orchestrates language detection, text preprocessing, and audio generation
 */
export class TTSService {
    private supertonic: SupertonicTTS;
    private outputDir: string;
    private languageDetector: LanguageDetector;

    /**
     * Create a TTSService instance
     * @param outputDir - Directory to save generated audio files
     * @param languageDetector - Optional custom language detector function. If not provided, uses the default simple detector
     */
    constructor(outputDir: string = './output', languageDetector?: LanguageDetector) {
        this.outputDir = outputDir;
        this.supertonic = new SupertonicTTS('F1'); // Default voice: F1
        this.languageDetector = languageDetector || defaultDetectLanguage;

        // Ensure output directory exists
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }
    }

    /**
     * Set a custom language detector at runtime
     * @param detector - Language detector function
     */
    setLanguageDetector(detector: LanguageDetector): void {
        this.languageDetector = detector;
    }

    /**
     * Synthesize text to speech with automatic language detection
     * @param text Text to synthesize (plain text or pre-tagged with language markers)
     * @param voice Voice identifier (F1-F5, M1-M5)
     * @param filename Base filename for the output
     * @param options Synthesis options (rate, volume, pitch)
     * @param language Optional explicit language override (skips auto-detection if provided)
     * @returns Object with savedPath, fileBuffer, and detectedLanguage
     */
    async synthesize(
        text: string,
        voice: string = 'F1',
        filename: string,
        options: SynthesisOptions = {},
        language?: Language
    ): Promise<{ savedPath: string; fileBuffer: Buffer; detectedLanguage: Language }> {
        try {
            // Determine language: use explicit override, custom detector, or default auto-detection
            let detectedLang: Language;
            let textToSpeak: string;

            if (language) {
                // Use explicitly provided language
                detectedLang = language;
                textToSpeak = text;
                console.log(`[TTSService] Using explicit language: ${detectedLang}`, text);
            } else {
                // Use custom or default language detector
                const detectionResult = await this.languageDetector(text);
                const detected = detectionResult.language;
                detectedLang = await this.detectLanguage(detected);
                console.log(`[TTSService] Detected language: ${detectedLang}`, text);
                // Use summary for long text if available, otherwise original
                textToSpeak = text.length < 50 ? text : detectionResult.summary || text;
            }

            // Validate voice
            const voiceKey = this.validateVoice(voice);

            // Parse rate option to speed multiplier
            const speed = this.parseRateToSpeed(options.rate);

            // Generate audio
            const audio = await this.supertonic.speak(
                preprocessText(textToSpeak, detectedLang),
                voiceKey,
                {
                    speed: speed,
                    num_inference_steps: 5
                }
            );

            // Convert to WAV buffer
            const wavBuffer = audio.toWav();
            const fileBuffer = Buffer.from(wavBuffer);

            // Save to file
            const safeFilename = this.sanitizeFilename(filename);
            const timestamp = Date.now();
            const outputPath = path.join(this.outputDir, `${safeFilename}_${timestamp}.wav`);

            await fs.promises.writeFile(outputPath, fileBuffer);

            return {
                savedPath: outputPath,
                fileBuffer: fileBuffer,
                detectedLanguage: detectedLang
            };
        } catch (error) {
            console.error('[TTSService] Error synthesizing speech:', error);
            throw error;
        }
    }

    /**
     * Synthesize mixed-language text (text already tagged with language markers)
     * Use this for sentences that contain multiple languages
     * Example: "<en>Hello</en> <es>Hola</es>"
     *
     * @param taggedText Text with embedded language tags (e.g., "<en>text</en> <es>text</es>")
     * @param voice Voice identifier (F1-F5, M1-M5)
     * @param filename Base filename for the output
     * @param options Synthesis options (rate, volume, pitch)
     * @returns Object with savedPath and fileBuffer
     */
    async synthesizeMixed(
        taggedText: string,
        voice: string = 'F1',
        filename: string,
        options: SynthesisOptions = {}
    ): Promise<{ savedPath: string; fileBuffer: Buffer }> {
        try {
            // Validate voice
            const voiceKey = this.validateVoice(voice);

            // Parse rate option to speed multiplier
            const speed = this.parseRateToSpeed(options.rate);

            // The text already contains language tags, so preprocessText will preserve them
            // and only clean the text within tags
            const processedText = preprocessText(taggedText, 'en'); // lang param ignored if already tagged

            // Generate audio
            const audio = await this.supertonic.speak(
                processedText,
                voiceKey,
                {
                    speed: speed,
                    num_inference_steps: 5
                }
            );

            // Convert to WAV buffer
            const wavBuffer = audio.toWav();
            const fileBuffer = Buffer.from(wavBuffer);

            // Save to file
            const safeFilename = this.sanitizeFilename(filename);
            const timestamp = Date.now();
            const outputPath = path.join(this.outputDir, `${safeFilename}_${timestamp}.wav`);

            await fs.promises.writeFile(outputPath, fileBuffer);

            return {
                savedPath: outputPath,
                fileBuffer: fileBuffer
            };
        } catch (error) {
            console.error('[TTSService] Error synthesizing mixed-language speech:', error);
            throw error;
        }
    }

    /**
     * Get available voices
     * @returns Array of voice identifiers (F1-F5, M1-M5)
     */
    async getVoices(): Promise<string[]> {
        return Object.keys(VOICES);
    }

    /**
     * Validate voice key, return default if invalid
     */
    private validateVoice(voice: string): VoiceKey {
        if (voice in VOICES) {
            return voice as VoiceKey;
        }
        return 'F1'; // Default voice
    }

    /**
     * Parse rate string (e.g., '0%', '-10%', '+20%') to speed multiplier
     */
    private parseRateToSpeed(rate?: string): number {
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
    private sanitizeFilename(filename: string): string {
        return filename
            .replace(/[^a-zA-Z0-9]/g, '_')
            .substring(0, 50);
    }

    /**
     * Check if language is supported
     */
    private isSupportedLanguage(lang: string): lang is Language {
        return (SUPPORTED_LANGUAGES as string[]).includes(lang);
    }

    /**
     * Detect language, defaulting to 'es' if unsupported
     */
    private async detectLanguage(lang: string = 'es'): Promise<Language> {
        return this.isSupportedLanguage(lang) ? lang : 'es';
    }
}
