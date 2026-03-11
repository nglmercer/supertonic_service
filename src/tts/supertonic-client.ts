import { pipeline, type TextToAudioOutput, type TextToAudioPipelineOptions, type PretrainedModelOptions, env } from '@huggingface/transformers';
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


// Type alias for the specific pipeline we are using
type TextToSpeechPipeline = Awaited<ReturnType<typeof pipeline>>;

/**
 * Internal client for Supertonic TTS using HuggingFace Transformers
 * Implements singleton pattern for the pipeline to avoid reinitialization
 */
class SupertonicTTS {
    private static classInstance: SupertonicTTS | null = null;
    private static instance: TextToSpeechPipeline | null = null;
    
    // Default configuration for the pipeline initialization
    private static pipelineConfig: PretrainedModelOptions = {
        device: 'cpu',
        session_options: {
            intraOpNumThreads: Number(process.env.ORT_NUM_THREADS) || defaultThreads,
            // interOpNumThreads: 1,
            // executionMode: 'sequential',
            // graphOptimizationLevel: 'all',
        }
    };
    
    private readonly baseUrl: string;
    private defaultVoiceUrl: string;
    private options: Partial<TextToAudioPipelineOptions>;

    /**
     * Private constructor for singleton pattern
     */
    private constructor(defaultVoice: VoiceKey = 'F1', pipelineConfig: PretrainedModelOptions = SupertonicTTS.pipelineConfig) {
        this.baseUrl = BASE_URL;
        this.defaultVoiceUrl = `${this.baseUrl}${VOICES[defaultVoice]}`;
        this.options = {
            num_inference_steps: 5,
            speed: 1.0,
        };
        SupertonicTTS.setPipelineConfig(pipelineConfig);
    }

    /**
     * Get the singleton instance of SupertonicTTS
     */
    public static getInstance(defaultVoice: VoiceKey = 'F1'): SupertonicTTS {
        if (!SupertonicTTS.classInstance) {
            SupertonicTTS.classInstance = new SupertonicTTS(defaultVoice);
        }
        return SupertonicTTS.classInstance;
    }
    
    /**
     * Set global pipeline initialization configuration
     * @param config Partial configuration for the pipeline() call
     */
    public static setPipelineConfig(config: PretrainedModelOptions): void {
        SupertonicTTS.pipelineConfig = {
            ...SupertonicTTS.pipelineConfig,
            ...config,
            session_options: {
                ...SupertonicTTS.pipelineConfig.session_options,
                ...(config.session_options || {})
            }
        };
    }

    /**
     * Get current pipeline initialization configuration
     */
    public static getPipelineConfig(): PretrainedModelOptions {
        return { ...SupertonicTTS.pipelineConfig };
    }

    /**
     * Set configuration for all synthesis calls
     * @param options Partial pipeline options (speed, num_inference_steps, etc.)
     */
    public setConfig(options: Partial<TextToAudioPipelineOptions>): void {
        this.options = { ...this.options, ...options };
    }

    /**
     * Get current persistent configuration
     */
    public getConfig(): Partial<TextToAudioPipelineOptions> {
        return { ...this.options };
    }

    /**
     * Set the default voice (default is 'F1')
     */
    public setDefaultVoice(voiceKey: VoiceKey): void {
        this.defaultVoiceUrl = `${this.baseUrl}${VOICES[voiceKey]}`;
    }

    /**
     * Initialize the TTS pipeline (singleton)
     */
    private async getPipeline(): Promise<TextToSpeechPipeline> {
        if (!SupertonicTTS.instance) {
            SupertonicTTS.instance = await pipeline(
                'text-to-speech', 
                'onnx-community/Supertonic-TTS-2-ONNX', 
                {
                    device: 'cpu',
                    ...SupertonicTTS.pipelineConfig,
                }
            );
        }
        return SupertonicTTS.instance;
    }

    /**
     * Generate audio from text
     * @param text The text to synthesize
     * @param voiceKey Specific voice to use (optional, uses default if not provided)
     * @param customOptions Specific options for this call (merges with global config)
     */
    public async speak(
        text: string,
        voiceKey?: VoiceKey,
        customOptions: Partial<TextToAudioPipelineOptions> = {}
    ): Promise<AudioOutput> {
        const tts = await this.getPipeline();

        const voiceUrl = voiceKey ? `${this.baseUrl}${VOICES[voiceKey]}` : this.defaultVoiceUrl;

        const combinedOptions: TextToAudioPipelineOptions = {
            speaker_embeddings: voiceUrl,
            ...this.options,
            ...customOptions
        };

        const result = await tts(text, combinedOptions);
        return result as AudioOutput;
    }

    /**
     * Get list of all available voice keys
     */
    public getAvailableVoices(): VoiceKey[] {
        return Object.keys(VOICES) as VoiceKey[];
    }
}

export { SupertonicTTS };
