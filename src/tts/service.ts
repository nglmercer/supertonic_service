import { SupertonicTTS } from './supertonic-client.js';
import { VOICES, type VoiceKey, type Language, type SynthesisOptions } from './types.js';
import { detectLanguage as defaultDetectLanguageFromPreprocessor, preprocessText } from './preprocessor.js';
import { parseRateToSpeed, parseLanguageSegments, concatenateWavBuffers, createSilenceBuffer, validateVoice, isSupportedLanguage, detectLanguage } from './utils.js';
import { FileHandler } from './file-handler.js';

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
 * 
 * Uses Singleton pattern to ensure only one instance exists.
 */
export class TTSService {
    private static instance: TTSService | null = null;
    private supertonic: SupertonicTTS;
    private fileHandler: FileHandler;
    private languageDetector: LanguageDetector;

    /**
     * Private constructor to enforce singleton pattern
     * Use getInstance() instead of new TTSService()
     */
    private constructor(outputDir: string = './output', languageDetector?: LanguageDetector) {
        this.fileHandler = new FileHandler({ outputDir });
        this.supertonic = new SupertonicTTS('F1'); // Default voice: F1
        this.languageDetector = languageDetector || defaultDetectLanguageFromPreprocessor;
    }

    /**
     * Get the singleton instance of TTSService
     * @param outputDir - Directory to save generated audio files (only used on first call)
     * @param languageDetector - Optional custom language detector function (only used on first call)
     * @returns The singleton TTSService instance
     */
    static getInstance(outputDir: string = './output', languageDetector?: LanguageDetector): TTSService {
        if (TTSService.instance === null) {
            TTSService.instance = new TTSService(outputDir, languageDetector);
        }
        return TTSService.instance;
    }

    /**
     * Reset the singleton instance (useful for testing)
     */
    static resetInstance(): void {
        TTSService.instance = null;
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
     * @param filename Base filename for the output (only used if writeToFile is true)
     * @param options Synthesis options (rate, volume, pitch)
     * @param language Optional explicit language override (skips auto-detection if provided)
     * @param writeToFile Whether to save the audio to a file (default: false)
     * @returns Object with savedPath (null if not written), fileBuffer, and detectedLanguage
     */
    async synthesize(
        text: string,
        voice: string = 'F1',
        filename: string,
        options: SynthesisOptions = {},
        language?: Language,
        writeToFile: boolean = false
    ): Promise<{ savedPath: string | null; fileBuffer: Buffer; detectedLanguage: Language }> {
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
                detectedLang = await detectLanguage(detected);
                console.log(`[TTSService] Detected language: ${detectedLang}`, text);
                // Use summary for long text if available, otherwise original
                textToSpeak = text.length < 50 ? text : detectionResult.summary || text;
            }

            // Validate voice
            const voiceKey = validateVoice(voice) as VoiceKey;

            // Parse rate option to speed multiplier
            const speed = parseRateToSpeed(options.rate);

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

            // Optionally save to file
            let savedPath: string | null = null;
            if (writeToFile) {
                savedPath = await this.fileHandler.writeAudioFile(fileBuffer, filename);
            }

            return {
                savedPath,
                fileBuffer: fileBuffer,
                detectedLanguage: detectedLang
            };
        } catch (error) {
            console.error('[TTSService] Error synthesizing speech:', error);
            throw error;
        }
    }

    /**
     * Synthesize mixed-language text by processing each language segment separately
     * Text must be tagged with language markers: "<en>Hello</en> <es>Hola</es>"
     * Each segment is synthesized independently and then concatenated with silence.
     *
     * @param taggedText Text with embedded language tags (e.g., "<en>text</en> <es>text</es>")
     * @param voice Voice identifier (F1-F5, M1-M5)
     * @param filename Base filename for the output (only used if writeToFile is true)
     * @param options Synthesis options (rate, volume, pitch)
     * @param silenceDuration Duration of silence between segments (default: 0.3 seconds)
     * @param writeToFile Whether to save the audio to a file (default: false)
     * @returns Object with savedPath (null if not written) and combined fileBuffer
     */
    async synthesizeMixed(
        taggedText: string,
        voice: string = 'F1',
        filename: string,
        options: SynthesisOptions = {},
        silenceDuration: number = 0.3,
        writeToFile: boolean = false
    ): Promise<{ savedPath: string | null; fileBuffer: Buffer }> {
        try {
            // Validate voice
            const voiceKey = validateVoice(voice) as VoiceKey;

            // Parse rate option to speed multiplier
            const speed = parseRateToSpeed(options.rate);

            // Parse tagged text into segments
            const segments = parseLanguageSegments(taggedText);
            if (segments.length === 0) {
                throw new Error('No valid language segments found in text');
            }

            // Synthesize each segment separately
            const audioBuffers: Buffer[] = [];
            for (let i = 0; i < segments.length; i++) {
                const { lang, text } = segments[i]!;

                // Preprocess text for this language
                const processedText = preprocessText(text, lang);

                // Generate audio for this segment
                const audio = await this.supertonic.speak(
                    processedText,
                    voiceKey,
                    {
                        speed: speed,
                        num_inference_steps: 5
                    }
                );

                // Convert to buffer
                const wavBuffer = Buffer.from(audio.toWav());
                audioBuffers.push(wavBuffer);

                // Add silence between segments (except after last segment)
                if (i < segments.length - 1) {
                    // Extract sample rate from the wav buffer (offset 24) to ensure compatibility
                    const sampleRate = wavBuffer.readUInt32LE(24);
                    const silenceBuffer = createSilenceBuffer(silenceDuration, sampleRate);
                    audioBuffers.push(silenceBuffer);
                }
            }

            // Concatenate all buffers (skip headers after first)
            const combinedBuffer = concatenateWavBuffers(audioBuffers);

            // Optionally save to file
            let savedPath: string | null = null;
            if (writeToFile) {
                savedPath = await this.fileHandler.writeAudioFile(combinedBuffer, filename);
            }

            return {
                savedPath,
                fileBuffer: combinedBuffer
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
}
