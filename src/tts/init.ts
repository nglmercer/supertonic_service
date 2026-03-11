import { TTSService } from './service.js';
import type { LanguageDetector, LanguageDetectionResult } from './service.js';

const OUTPUT_DIR = process.env.TTS_OUTPUT_DIR || './output';

export const customDetector: LanguageDetector = async (text: string): Promise<LanguageDetectionResult> => {
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

let ttsService: TTSService;

export function initTTSService(): TTSService {
    ttsService = TTSService.getInstance(OUTPUT_DIR, customDetector);
    console.log('TTS service initialized');
    return ttsService;
}

export function getTTSService(): TTSService {
    if (!ttsService) {
        return initTTSService();
    }
    return ttsService;
}
