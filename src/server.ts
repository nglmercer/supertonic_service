/**
 * HTTP Server Entry Point (with optional libp2p)
 * Starts the TTS service with HTTP API
 */

import { TTSService } from './tts/service.js';
import type { LanguageDetector, LanguageDetectionResult } from './tts/service.js';
import type { 
    Language, 
    SynthesisOptions, 
    TTSMethod,
    TTSRequest,
    TTSResponse,
    SynthesizeParams,
    SynthesizeMixedParams
} from './tts/types.js';
import type { Libp2p } from 'libp2p';
import type { PeerId } from '@libp2p/interface';
import { 
    ENV_VARS, 
    DEFAULTS, 
    ERROR_MESSAGES, 
    PROTOCOLS 
} from './tts/constants.js';

// Environment configuration
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
const HOST = process.env.HOST || '0.0.0.0';
const LIBP2P_PORT = process.env.LIBP2P_PORT ? parseInt(process.env.LIBP2P_PORT) : 9000;
const OUTPUT_DIR = process.env.TTS_OUTPUT_DIR || './output';
const DEFAULT_VOICE = process.env.TTS_DEFAULT_VOICE || 'F1';

// Optional libp2p support
let libp2pNode: Libp2p | null = null;

// Interface for the stream as used in the code (read/write/close)
interface NetworkStream {
    read(): Promise<Uint8Array | null>;
    write(data: Uint8Array | Buffer): Promise<void>;
    close(): void;
}

async function initLibp2p() {
    try {
        // Dynamic imports to avoid requiring packages if not enabled
        const { createLibp2p } = await import('libp2p');
        const { tcp } = await import('@libp2p/tcp');
        const { yamux } = await import('@chainsafe/libp2p-yamux');
        const { noise } = await import('@chainsafe/libp2p-noise');
        const { mdns } = await import('@libp2p/mdns');
        
        const node: Libp2p = await createLibp2p({
            addresses: {
                listen: [`/ip4/0.0.0.0/tcp/${LIBP2P_PORT}`]
            },
            transports: [tcp()],
            streamMuxers: [yamux()],
            connectionEncrypters: [noise()],
            peerDiscovery: [
                mdns({
                    interval: 1000, // Anunciarse cada 1 segundo
                })
            ],
        });

        node.addEventListener('peer:connect', (event: CustomEvent<PeerId>) => {
            console.log(`Connected to peer: ${event.detail.toString()}`);
        });

        node.addEventListener('peer:disconnect', (event: CustomEvent<PeerId>) => {
            console.log(`Disconnected from peer: ${event.detail.toString()}`);
        });

        await node.start();

        // Register TTS protocol handler for libp2p
        // @ts-ignore - Handler signature type mismatch with standard Libp2p but works with this implementation
        node.handle('/tts/1.0.0', async (stream: NetworkStream) => {
            try {
                // Read request: accumulate data until newline
                let buffer = Buffer.alloc(0);
                let requestText: string | null = null;
                while (true) {
                    const chunk = await stream.read();
                    if (chunk === null) break; // EOF
                    buffer = Buffer.concat([buffer, Buffer.from(chunk)]);
                    const newlineIndex = buffer.indexOf(10); // '\n'
                    if (newlineIndex !== -1) {
                        requestText = buffer.toString('utf8', 0, newlineIndex);
                        break;
                    }
                }
                if (!requestText) {
                    // No complete line received
                    await stream.write(Buffer.from(JSON.stringify({ success: false, error: 'Invalid request' }) + '\n'));
                    stream.close();
                    return;
                }

                let response: TTSResponse = { success: false, error: 'Unknown error' };
                try {
                    const request = JSON.parse(requestText) as TTSRequest;
                    switch (request.method) {
                        case 'synthesize': {
                            const params = request.params as SynthesizeParams;
                            const { text, voice = DEFAULT_VOICE, filename = 'output', options = {}, language, writeToFile = false } = params;
                            if (!text) throw new Error('Missing required parameter: text');
                            const result = await ttsService.synthesize(text, voice, filename, options, language, writeToFile);
                            response = {
                                success: true,
                                result: {
                                    savedPath: result.savedPath,
                                    audioBase64: result.fileBuffer.toString('base64'),
                                    detectedLanguage: result.detectedLanguage,
                                }
                            };
                            break;
                        }
                        case 'synthesizeMixed': {
                            const params = request.params as SynthesizeMixedParams;
                            const { taggedText, voice = DEFAULT_VOICE, filename = 'output', options = {}, silenceDuration = 0.3, writeToFile = false } = params;
                            if (!taggedText) throw new Error('Missing required parameter: taggedText');
                            const result = await ttsService.synthesizeMixed(taggedText, voice, filename, options, silenceDuration, writeToFile);
                            response = {
                                success: true,
                                result: {
                                    savedPath: result.savedPath,
                                    audioBase64: result.fileBuffer.toString('base64'),
                                }
                            };
                            break;
                        }
                        case 'getVoices': {
                            const voices = await ttsService.getVoices();
                            response = {
                                success: true,
                                result: { voices }
                            };
                            break;
                        }
                        case 'health': {
                            response = {
                                success: true,
                                result: {
                                    status: 'ok',
                                    timestamp: new Date().toISOString(),
                                    libp2p: 'enabled'
                                }
                            };
                            break;
                        }
                        default:
                            throw new Error(`Unknown method: ${(request as any).method}`);
                    }
                } catch (error: unknown) {
                    const errorMessage = error instanceof Error ? error.message : 'Internal Server Error';
                    response = {
                        success: false,
                        error: errorMessage
                    };
                }

                // Write response as JSON with newline
                const responseBuffer = Buffer.from(JSON.stringify(response) + '\n');
                await stream.write(responseBuffer);
                stream.close();
            } catch (error) {
                console.error('Error handling libp2p TTS protocol:', error);
            }
        });


        console.log('='.repeat(60));
        console.log('Libp2p node started');
        console.log(`Node ID: ${node.peerId.toString()}`);
        console.log('Listening on:');
        node.getMultiaddrs().forEach(ma => {
            const addr = ma.toString();
            if (addr.includes('127.0.0.1')) {
                console.log(`  - ${addr} (Local)`);
            } else {
                console.log(`  - ${addr} (Network - Use this for Discovery!)`);
            }
        });
        console.log('='.repeat(60));

        return node;
    } catch (error: unknown) {
        const err = error as Error & { code?: string };
        console.error('Failed to start libp2p node:', err.message);
        if (err.code === 'MODULE_NOT_FOUND') {
            console.log('Note: Install libp2p packages to enable P2P: bun add libp2p @libp2p/tcp @libp2p/yamux @chainsafe/libp2p-noise');
        }
        return null;
    }
}

// Initialize TTS service
let ttsService: TTSService;

function initTTSService() {
    const customDetector: LanguageDetector = async (text: string): Promise<LanguageDetectionResult> => {
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

    ttsService = TTSService.getInstance(OUTPUT_DIR, customDetector);
    console.log('TTS service initialized');
}

// HTTP request handler
export async function handleRequest(req: Request): Promise<Response> {
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
            if (!text) throw new Error('Missing required parameter: text');

            const result = await ttsService.synthesize(text, voice, filename, options, language, writeToFile);

            return new Response(JSON.stringify({
                success: true,
                savedPath: result.savedPath,
                audioBase64: result.fileBuffer.toString('base64'),
                detectedLanguage: result.detectedLanguage,
            }), { 
                status: 200, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            });
        }

        if (method === 'POST' && url.pathname === '/api/tts/synthesize-mixed') {
            const { taggedText, voice = DEFAULT_VOICE, filename = 'output', options = {}, silenceDuration = 0.3, writeToFile = false } = body;
            if (!taggedText) throw new Error('Missing required parameter: taggedText');

            const result = await ttsService.synthesizeMixed(taggedText, voice, filename, options, silenceDuration, writeToFile);

            return new Response(JSON.stringify({
                success: true,
                savedPath: result.savedPath,
                audioBase64: result.fileBuffer.toString('base64'),
            }), { 
                status: 200, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            });
        }

        if (method === 'GET' && url.pathname === '/api/tts/voices') {
            const voices = await ttsService.getVoices();
            return new Response(JSON.stringify({ voices }), { 
                status: 200, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            });
        }

        if (method === 'GET' && (url.pathname === '/api/tts/health' || url.pathname === '/api/health' || url.pathname === '/health')) {
            return new Response(JSON.stringify({
                status: 'ok',
                timestamp: new Date().toISOString(),
                libp2p: libp2pNode ? 'enabled' : 'disabled'
            }), { 
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

async function main() {
    // Skip main execution when running tests
    if (process.env.NODE_ENV === 'test' || process.env.BUN_ENV === 'test') {
        return;
    }
    
    console.log('='.repeat(60));
    console.log('Supertonic TTS Service Starting...');
    console.log('='.repeat(60));

    // Initialize TTS service first (before libp2p) to ensure it's ready for P2P requests
    initTTSService();

    // Start libp2p node for discovery and P2P communication
    libp2pNode = await initLibp2p();

    const server = Bun.serve({
        port: PORT,
        hostname: HOST,
        fetch: handleRequest,
    });

    console.log('='.repeat(60));
    console.log('Supertonic TTS Service Started');
    console.log('='.repeat(60));
    console.log(`HTTP Server listening on http://${HOST}:${PORT}`);
    
    // Get local IP for convenience
    const { networkInterfaces } = await import('os');
    const nets = networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]!) {
            if (net.family === 'IPv4' && !net.internal) {
                console.log(`Network IP: http://${net.address}:${PORT}`);
            }
        }
    }
    
    console.log('');
    console.log('Available REST API Endpoints:');
    console.log(`  POST /api/tts/synthesize`);
    console.log(`  POST /api/tts/synthesize-mixed`);
    console.log(`  GET  /api/tts/voices`);
    console.log(`  GET  /api/tts/health`);
    console.log('='.repeat(60));

    process.on('SIGINT', async () => {
        console.log('Received SIGINT, shutting down gracefully...');
        server.stop();
        if (libp2pNode) await libp2pNode.stop();
        console.log('Services stopped successfully');
        process.exit(0);
    });

    process.on('SIGTERM', async () => {
        console.log('Received SIGTERM, shutting down gracefully...');
        server.stop();
        if (libp2pNode) await libp2pNode.stop();
        console.log('Services stopped successfully');
        process.exit(0);
    });

    process.on('uncaughtException', (err) => {
        console.error('Uncaught Exception:', err);
        process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
        console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    });
}

main().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
});