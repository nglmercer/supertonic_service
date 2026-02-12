import { pipeline, type TextToAudioOutput, type TextToAudioPipelineOptions, env } from '@huggingface/transformers';
import * as os from 'os';
import * as path from 'path';
import { VOICES, type VoiceKey, type AudioOutput } from './types.js';
import { BASE_URL } from './constants.js';

// Set local cache directory to avoid conflicts and fix corruption issues
env.cacheDir = path.resolve(process.cwd(), '.cache');
env.allowLocalModels = false; // Force checking remote/cache

// Configure ONNX Runtime to use explicit thread count
// This prevents pthread_setaffinity_np errors on some devices
// Must be set before loading any ONNX models
const numCpus = os.cpus().length;
const defaultThreads = Math.min(numCpus, 4); // Limit to 4 threads max for stability
if (!process.env.ORT_NUM_THREADS) {
    process.env.ORT_NUM_THREADS = String(defaultThreads);
}

/**
 * Internal client for Supertonic TTS using HuggingFace Transformers
 * Implements singleton pattern for the pipeline to avoid reinitialization
 */
class SupertonicTTS {
    private static instance: any = null;
    private readonly baseUrl: string;
    private defaultVoice: string;

    constructor(defaultVoice: VoiceKey = 'F1') {
        this.baseUrl = BASE_URL;
        this.defaultVoice = `${this.baseUrl}${VOICES[defaultVoice]}`;
    }

    /**
     * Initialize the TTS pipeline (singleton)
     */
    private async getPipeline() {
        if (!SupertonicTTS.instance) {
            SupertonicTTS.instance = await pipeline('text-to-speech', 'onnx-community/Supertonic-TTS-2-ONNX', {
                device: 'cpu',
                session_options: {
                    intraOpNumThreads: Number(process.env.ORT_NUM_THREADS) || 1,
                    interOpNumThreads: 1,
                    executionMode: 'sequential',
                }
            });
        }
        return SupertonicTTS.instance;
    }

    /**
     * Generate audio from text
     */
    public async speak(
        text: string,
        voiceKey?: VoiceKey,
        customOptions: Partial<TextToAudioPipelineOptions> = {}
    ): Promise<AudioOutput> {
        const tts = await this.getPipeline();

        const voiceUrl = voiceKey ? `${this.baseUrl}${VOICES[voiceKey]}` : this.defaultVoice;

        const options: TextToAudioPipelineOptions = {
            speaker_embeddings: voiceUrl,
            num_inference_steps: 5,
            speed: 1.0,
            ...customOptions
        };

        const result = await tts(text, options);
        return result as AudioOutput;
    }

    /**
     * Get available voice keys
     */
    public getAvailableVoices(): VoiceKey[] {
        return Object.keys(VOICES) as VoiceKey[];
    }
}

export { SupertonicTTS };
