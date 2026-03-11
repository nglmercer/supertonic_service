import { processTTSRequest } from '../tts/processor.js';
import { libp2pNode } from '../p2p/node.js';

const DEFAULT_VOICE = process.env.TTS_DEFAULT_VOICE || 'F1';

export async function handleHttpRequest(req: Request): Promise<Response> {
    const url = new URL(req.url, `http://${req.headers.get('host')}`);
    const method = req.method;
    
    // Default CORS headers
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle CORS preflight
    if (method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    let body: any = null;

    if (method !== 'GET') {
        try {
            body = await req.json();
        } catch {
            return new Response(JSON.stringify({
                success: false,
                error: { code: 400, message: 'Invalid JSON body' }
            }), { 
                status: 400, 
                headers: { 'Content-Type': 'application/json' } 
            });
        }
    }

    try {
        if (method === 'POST' && url.pathname === '/api/tts/synthesize') {
            const { text, voice = DEFAULT_VOICE, filename = 'output', options = {}, language, writeToFile = false } = body;
            
            const response = await processTTSRequest({
                method: 'synthesize',
                params: { text, voice, filename, options, language, writeToFile }
            });

            return new Response(JSON.stringify(response), { 
                status: 200, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            });
        }

        if (method === 'POST' && url.pathname === '/api/tts/synthesize-mixed') {
            const { taggedText, voice = DEFAULT_VOICE, filename = 'output', options = {}, silenceDuration = 0.3, writeToFile = false } = body;
            
            const response = await processTTSRequest({
                method: 'synthesizeMixed',
                params: { taggedText, voice, filename, options, silenceDuration, writeToFile }
            });

            return new Response(JSON.stringify(response), { 
                status: 200, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            });
        }

        if (method === 'GET' && url.pathname === '/api/tts/voices') {
            const response = await processTTSRequest({ method: 'getVoices', params: {} });
            return new Response(JSON.stringify(response), { 
                status: 200, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            });
        }

        if (method === 'GET' && (url.pathname === '/api/tts/health' || url.pathname === '/api/health' || url.pathname === '/health')) {
            const response = await processTTSRequest({ method: 'health', params: {} });
            if (response.success && 'status' in response.result) {
                response.result.libp2p = libp2pNode ? 'enabled' : 'disabled';
            }
            return new Response(JSON.stringify(response), { 
                status: 200, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            });
        }

        return new Response(JSON.stringify({
            success: false,
            error: { code: 404, message: 'Not Found' }
        }), { 
            status: 404, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
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
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
    }
}
