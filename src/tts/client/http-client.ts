/**
 * HTTP Client for TTS Service
 * Provides HTTP-based communication with the TTS server
 */

import {
    API_ENDPOINTS,
    CONTENT_TYPES,
    TTS_METHODS,
} from '../constants.js';

import type {
    TTSMethod,
    TTSParamsMap,
    TTSResultMap,
    TTSResponse,
} from '../types.js';

/**
 * HTTP Client implementation for calling TTS service endpoints
 */
export class HTTPClient {
    private baseUrl: string;

    constructor(baseUrl: string) {
        this.baseUrl = baseUrl;
    }

    /**
     * Call a TTS method via HTTP
     */
    async call<M extends TTSMethod>(
        method: M,
        params: TTSParamsMap[M]
    ): Promise<TTSResultMap[M]> {
        let endpoint: string;
        const isGetRequest = method === TTS_METHODS.GET_VOICES || method === TTS_METHODS.HEALTH;

        switch (method) {
            case TTS_METHODS.SYNTHESIZE:
                endpoint = API_ENDPOINTS.SYNTHESIZE;
                break;
            case TTS_METHODS.SYNTHESIZE_MIXED:
                endpoint = API_ENDPOINTS.SYNTHESIZE_MIXED;
                break;
            case TTS_METHODS.GET_VOICES:
                endpoint = API_ENDPOINTS.VOICES;
                break;
            case TTS_METHODS.HEALTH:
                endpoint = API_ENDPOINTS.HEALTH;
                break;
            default:
                // Exhaustiveness check
                const exhaustiveCheck: never = method;
                throw new Error(`Unknown method: ${exhaustiveCheck}`);
        }

        const response = await fetch(`${this.baseUrl}${endpoint}`, {
            method: isGetRequest ? 'GET' : 'POST',
            headers: {
                'Content-Type': CONTENT_TYPES.JSON,
            },
            body: isGetRequest ? undefined : JSON.stringify(params),
        });

        const data = await response.json() as TTSResponse<M>;

        if (!response.ok || data.success === false) {
            const errorMessage = data.success === false 
                ? data.error 
                : `HTTP ${response.status}`;
            throw new Error(errorMessage);
        }

        return data.result;
    }

    /**
     * Close the client (no-op for HTTP)
     */
    async close(): Promise<void> {
        // No cleanup needed for HTTP
    }

    /**
     * Get the base URL
     */
    getBaseUrl(): string {
        return this.baseUrl;
    }
}
