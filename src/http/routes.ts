import { API_ENDPOINTS, HTTP_METHODS, TTS_METHODS } from '../tts/constants.js';
import type { TTSMethod } from '../tts/types.js';

export interface RouteConfig {
    path: string;
    method: string;
    description: string;
    ttsMethod?: TTSMethod;
}

export const ROUTES: RouteConfig[] = [
    {
        path: API_ENDPOINTS.SYNTHESIZE,
        method: HTTP_METHODS.POST,
        description: 'Synthesize single-language text to audio',
        ttsMethod: 'synthesize'
    },
    {
        path: API_ENDPOINTS.SYNTHESIZE_MIXED,
        method: HTTP_METHODS.POST,
        description: 'Synthesize mixed-language text to audio',
        ttsMethod: 'synthesizeMixed'
    },
    {
        path: API_ENDPOINTS.VOICES,
        method: HTTP_METHODS.GET,
        description: 'Get list of available voices',
        ttsMethod: 'getVoices'
    },
    {
        path: API_ENDPOINTS.HEALTH,
        method: HTTP_METHODS.GET,
        description: 'Check service health (API route)',
        ttsMethod: 'health'
    },
    {
        path: API_ENDPOINTS.HEALTH_ALT,
        method: HTTP_METHODS.GET,
        description: 'Check service health (Alternate route)',
        ttsMethod: 'health'
    },
    {
        path: API_ENDPOINTS.HEALTH_ROOT,
        method: HTTP_METHODS.GET,
        description: 'Check service health (Root route)',
        ttsMethod: 'health'
    }
];

export function getRouteByPath(path: string, method: string): RouteConfig | undefined {
    return ROUTES.find(r => r.path === path && r.method === method);
}

export function getRoutesByMethod(method: string): RouteConfig[] {
    return ROUTES.filter(r => r.method === method);
}
