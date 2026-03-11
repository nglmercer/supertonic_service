import { processTTSRequest } from '../tts/processor.js';
import { libp2pNode } from '../p2p/node.js';
import { CORS_HEADERS, CONTENT_TYPES, HTTP_METHODS } from '../tts/constants.js';
import { getRouteByPath } from './routes.js';

const DEFAULT_VOICE = process.env.TTS_DEFAULT_VOICE || 'F1';

export async function handleHttpRequest(req: Request): Promise<Response> {
    const url = new URL(req.url, `http://${req.headers.get('host')}`);
    const method = req.method;
    
    // Default CORS headers
    const corsHeaders = {
        'Access-Control-Allow-Origin': CORS_HEADERS.ALLOW_ORIGIN,
        'Access-Control-Allow-Methods': CORS_HEADERS.ALLOW_METHODS,
        'Access-Control-Allow-Headers': CORS_HEADERS.ALLOW_HEADERS,
    };

    // Handle CORS preflight
    if (method === HTTP_METHODS.OPTIONS) {
        return new Response(null, { headers: corsHeaders });
    }

    // Lookup route in registry
    const route = getRouteByPath(url.pathname, method);
    if (!route) {
        return new Response(JSON.stringify({
            success: false,
            error: { code: 404, message: 'Not Found' }
        }), { 
            status: 404, 
            headers: { ...corsHeaders, 'Content-Type': CONTENT_TYPES.JSON } 
        });
    }

    let body: any = null;
    if (method !== HTTP_METHODS.GET) {
        try {
            body = await req.json();
        } catch {
            return new Response(JSON.stringify({
                success: false,
                error: { code: 400, message: 'Invalid JSON body' }
            }), { 
                status: 400, 
                headers: { ...corsHeaders, 'Content-Type': CONTENT_TYPES.JSON } 
            });
        }
    }

    try {
        const { ttsMethod } = route;
        if (!ttsMethod) throw new Error('Route has no associated TTS method');

        let params: any = {};
        if (ttsMethod === 'synthesize') {
            const { text, voice = DEFAULT_VOICE, filename = 'output', options = {}, language, writeToFile = false } = body;
            params = { text, voice, filename, options, language, writeToFile };
        } else if (ttsMethod === 'synthesizeMixed') {
            const { taggedText, voice = DEFAULT_VOICE, filename = 'output', options = {}, silenceDuration = 0.3, writeToFile = false } = body;
            params = { taggedText, voice, filename, options, silenceDuration, writeToFile };
        } else if (ttsMethod === 'getVoices' || ttsMethod === 'health') {
            params = {};
        }

        const response = await processTTSRequest({ method: ttsMethod, params });

        // Add libp2p status if health check
        if (ttsMethod === 'health' && response.success && 'status' in response.result) {
            response.result.libp2p = libp2pNode ? 'enabled' : 'disabled';
        }

        return new Response(JSON.stringify(response), { 
            status: 200, 
            headers: { ...corsHeaders, 'Content-Type': CONTENT_TYPES.JSON } 
        });

    } catch (error: any) {
        console.error(`Error handling ${method} ${url.pathname}:`, error);
        return new Response(JSON.stringify({
            success: false,
            error: {
                code: 500,
                message: error.message || 'Internal Server Error',
                type: 'SERVER_ERROR'
            }
        }), { 
            status: 500, 
            headers: { ...corsHeaders, 'Content-Type': CONTENT_TYPES.JSON } 
        });
    }
}

