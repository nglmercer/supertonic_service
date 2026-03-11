import type { 
    TTSRequest, 
    TTSResponse, 
    SynthesizeParams, 
    SynthesizeMixedParams 
} from './types.js';
import { getTTSService } from './init.js';

const DEFAULT_VOICE = process.env.TTS_DEFAULT_VOICE || 'F1';

export async function processTTSRequest(request: TTSRequest): Promise<TTSResponse> {
    const ttsService = getTTSService();
    
    try {
        switch (request.method) {
            case 'synthesize': {
                const params = request.params as SynthesizeParams;
                const { text, voice = DEFAULT_VOICE, filename = 'output', options = {}, language, writeToFile = false } = params;
                if (!text) throw new Error('Missing required parameter: text');
                
                const result = await ttsService.synthesize(text, voice, filename, options, language, writeToFile);
                
                return {
                    success: true,
                    result: {
                        savedPath: result.savedPath,
                        audioBase64: result.fileBuffer.toString('base64'),
                        detectedLanguage: result.detectedLanguage,
                    }
                };
            }
            case 'synthesizeMixed': {
                const params = request.params as SynthesizeMixedParams;
                const { taggedText, voice = DEFAULT_VOICE, filename = 'output', options = {}, silenceDuration = 0.3, writeToFile = false } = params;
                if (!taggedText) throw new Error('Missing required parameter: taggedText');
                
                const result = await ttsService.synthesizeMixed(taggedText, voice, filename, options, silenceDuration, writeToFile);
                
                return {
                    success: true,
                    result: {
                        savedPath: result.savedPath,
                        audioBase64: result.fileBuffer.toString('base64'),
                    }
                };
            }
            case 'getVoices': {
                const voices = await ttsService.getVoices();
                return {
                    success: true,
                    result: { voices }
                };
            }
            case 'health': {
                return {
                    success: true,
                    result: {
                        status: 'ok',
                        timestamp: new Date().toISOString(),
                    }
                };
            }
            default:
                throw new Error(`Unknown method: ${(request as any).method}`);
        }
    } catch (error: any) {
        return {
            success: false,
            error: error.message || 'Internal Server Error'
        };
    }
}
