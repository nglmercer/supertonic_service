/**
 * Moleculer TTS Service
 * Exposes the Supertonic TTS functionality as a microservice
 */

import { Service, ServiceBroker, Context } from 'moleculer';
import { TTSService } from '../tts/service.js';
import type { LanguageDetector, LanguageDetectionResult } from '../tts/service.js';
import type { Language, SynthesisOptions } from '../tts/types.js';

/**
 * Request schemas for TTS service actions
 */
interface SynthesizeParams {
    text: string;
    voice?: string;
    filename: string;
    options?: SynthesisOptions;
    language?: Language;
    writeToFile?: boolean;
}

interface SynthesizeMixedParams {
    taggedText: string;
    voice?: string;
    filename: string;
    options?: SynthesisOptions;
    silenceDuration?: number;
    writeToFile?: boolean;
}

/**
 * TTS Moleculer Service
 * Provides actions for text-to-speech synthesis
 */
export default class TTSMoleculerService extends Service {
    private tts: TTSService | null = null;

    constructor(broker: ServiceBroker) {
        super(broker);

        this.parseServiceSchema({
            name: 'tts',
            
            /**
             * Service settings
             */
            settings: {
                outputDir: process.env.TTS_OUTPUT_DIR || './output',
                defaultVoice: process.env.TTS_DEFAULT_VOICE || 'F1',
                defaultRate: process.env.TTS_DEFAULT_RATE || '0%',
            },

            /**
             * Service metadata
             */
            metadata: {
                description: 'Text-to-Speech service using Supertonic',
                version: '1.0.0',
            },

            /**
             * Service actions
             */
            actions: {
                /**
                 * Synthesize text to speech with automatic language detection
                 */
                synthesize: {
                    rest: {
                        method: 'POST',
                        path: '/synthesize',
                    },
                    params: {
                        text: { type: 'string', min: 1 },
                        voice: { type: 'string', optional: true, default: 'F1' },
                        filename: { type: 'string', optional: true, default: 'output' },
                        options: { 
                            type: 'object', 
                            optional: true, 
                            props: {
                                rate: { type: 'string', optional: true },
                                volume: { type: 'string', optional: true },
                                pitch: { type: 'string', optional: true },
                            }
                        },
                        language: { 
                            type: 'string', 
                            optional: true, 
                            enum: ['en', 'ko', 'es', 'pt', 'fr'] 
                        },
                        writeToFile: { type: 'boolean', optional: true, default: false },
                    },
                    handler: this.synthesize,
                },

                /**
                 * Synthesize mixed-language text
                 */
                synthesizeMixed: {
                    rest: {
                        method: 'POST',
                        path: '/synthesize-mixed',
                    },
                    params: {
                        taggedText: { type: 'string', min: 1 },
                        voice: { type: 'string', optional: true, default: 'F1' },
                        filename: { type: 'string', optional: true, default: 'output' },
                        options: { 
                            type: 'object', 
                            optional: true,
                            props: {
                                rate: { type: 'string', optional: true },
                                volume: { type: 'string', optional: true },
                                pitch: { type: 'string', optional: true },
                            }
                        },
                        silenceDuration: { type: 'number', optional: true, default: 0.3 },
                        writeToFile: { type: 'boolean', optional: true, default: false },
                    },
                    handler: this.synthesizeMixed,
                },

                /**
                 * Get available voices
                 */
                getVoices: {
                    rest: {
                        method: 'GET',
                        path: '/voices',
                    },
                    handler: this.getVoices,
                },

                /**
                 * Health check
                 */
                health: {
                    rest: {
                        method: 'GET',
                        path: '/health',
                    },
                    handler: this.health,
                },
            },

            /**
             * Service lifecycle hooks
             */
            created: this.created,
            started: this.started,
            stopped: this.stopped,
        });
    }

    /**
     * Service created hook
     */
    created() {
        this.logger.info('TTS service created');
    }

    /**
     * Service started hook - initialize TTS service
     */
    async started() {
        this.logger.info('Initializing TTS service...');
        
        // Optional: Set up custom language detector
        const customDetector: LanguageDetector = async (text: string): Promise<LanguageDetectionResult> => {
            // Simple heuristic language detection
            if (/[가-힣]/.test(text)) {
                return { language: 'ko', summary: text };
            } else if (/[ñáéíóúü]/i.test(text)) {
                return { language: 'es', summary: text };
            } else if (/[àâäéèêëïîôùûüÿç]/i.test(text)) {
                return { language: 'fr', summary: text };
            } else if (/[ãõáéíóúâêîôû]/i.test(text)) {
                return { language: 'pt', summary: text };
            }
            return { language: 'en', summary: text };
        };

        this.tts = TTSService.getInstance(this.settings.outputDir, customDetector);
        this.logger.info('TTS service initialized successfully');
    }

    /**
     * Service stopped hook
     */
    async stopped() {
        this.logger.info('TTS service stopped');
        TTSService.resetInstance();
    }

    /**
     * Synthesize action handler
     */
    async synthesize(ctx: Context<SynthesizeParams>) {
        const { text, voice, filename, options, language, writeToFile } = ctx.params;

        this.logger.info(`Synthesizing text: "${text.substring(0, 50)}..." with voice: ${voice}`);

        try {
            const result = await this.tts!.synthesize(
                text,
                voice || this.settings.defaultVoice,
                filename || 'output',
                options || {},
                language,
                writeToFile ?? false
            );

            return {
                success: true,
                savedPath: result.savedPath,
                // Return audio as base64 for transport over the wire
                audioBase64: result.fileBuffer.toString('base64'),
                detectedLanguage: result.detectedLanguage,
            };
        } catch (error) {
            this.logger.error('Synthesis failed:', error);
            throw error;
        }
    }

    /**
     * Synthesize mixed-language action handler
     */
    async synthesizeMixed(ctx: Context<SynthesizeMixedParams>) {
        const { taggedText, voice, filename, options, silenceDuration, writeToFile } = ctx.params;

        this.logger.info(`Synthesizing mixed-language text with voice: ${voice}`);

        try {
            const result = await this.tts!.synthesizeMixed(
                taggedText,
                voice || this.settings.defaultVoice,
                filename || 'output',
                options || {},
                silenceDuration ?? 0.3,
                writeToFile ?? false
            );

            return {
                success: true,
                savedPath: result.savedPath,
                audioBase64: result.fileBuffer.toString('base64'),
            };
        } catch (error) {
            this.logger.error('Mixed-language synthesis failed:', error);
            throw error;
        }
    }

    /**
     * Get available voices action handler
     */
    async getVoices(): Promise<{ voices: string[] }> {
        const voices = await this.tts!.getVoices();
        return { voices };
    }

    /**
     * Health check action handler
     */
    health(): { status: string; timestamp: string } {
        return {
            status: 'ok',
            timestamp: new Date().toISOString(),
        };
    }
}
