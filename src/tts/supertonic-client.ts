import { pipeline, type TextToAudioOutput, type TextToAudioPipelineOptions, env } from '@huggingface/transformers';
import * as path from 'path';
import { VOICES, type VoiceKey, type AudioOutput } from './types.js';
import { BASE_URL } from './constants.js';

// Set local cache directory to avoid conflicts and fix corruption issues
env.cacheDir = path.resolve(process.cwd(), '.cache');
env.allowLocalModels = false; // Force checking remote/cache

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
