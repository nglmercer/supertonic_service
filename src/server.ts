/**
 * HTTP Server Entry Point (with optional libp2p)
 * Starts the TTS service with HTTP API
 * Libp2p P2P networking is optional and only enabled if LIBP2P_ENABLED=true
 */

import { TTSService } from './tts/service.js';
import type { LanguageDetector, LanguageDetectionResult } from './tts/service.js';
import type { Language, SynthesisOptions } from './tts/types.js';

// Environment configuration
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
const HOST = process.env.HOST || '0.0.0.0';
const LIBP2P_ENABLED = process.env.LIBP2P_ENABLED === 'true';
const LIBP2P_PORT = process.env.LIBP2P_PORT ? parseInt(process.env.LIBP2P_PORT) : 9000;
const OUTPUT_DIR = process.env.TTS_OUTPUT_DIR || './output';
const DEFAULT_VOICE = process.env.TTS_DEFAULT_VOICE || 'F1';

// Optional libp2p support
let libp2pNode: any = null;

async function initLibp2p() {
    if (!LIBP2P_ENABLED) {
        console.log('Libp2p disabled (set LIBP2P_ENABLED=true to enable)');
        return null;
    }

    try {
        // Dynamic imports to avoid requiring packages if not enabled
        const { createLibp2p } = await import('libp2p');
        const { tcp } = await import('@libp2p/tcp');
        const { yamux } = await import('@chainsafe/libp2p-yamux');
        const { noise } = await import('@chainsafe/libp2p-noise');
        const node = await createLibp2p({
            addresses: {
                listen: [`/ip4/0.0.0.0/tcp/${LIBP2P_PORT}`]
            },
            transports: [tcp()],
            streamMuxers: [yamux()],
            connectionEncrypters: [noise()],
        });

        node.addEventListener('peer:connect', (event: any) => {
            console.log(`Connected to peer: ${event.detail.remotePeer.toString()}`);
        });

        node.addEventListener('peer:disconnect', (event: any) => {
            console.log(`Disconnected from peer: ${event.detail.remotePeer.toString()}`);
        });

        await node.start();

        console.log('='.repeat(60));
        console.log('Libp2p node started');
        console.log(`Listening on port ${LIBP2P_PORT}`);
        console.log(`Node ID: ${node.peerId.toString()}`);
        console.log('='.repeat(60));

        return node;
    } catch (error: any) {
        console.error('Failed to start libp2p node:', error.message);
        if (error.code === 'MODULE_NOT_FOUND') {
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
async function handleRequest(req: Request): Promise<Response> {
    const url = new URL(req.url, `http://${req.headers.get('host')}`);
    const method = req.method;
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
                headers: { 'Content-Type': 'application/json' } 
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
                headers: { 'Content-Type': 'application/json' } 
            });
        }

        if (method === 'GET' && url.pathname === '/api/tts/voices') {
            const voices = await ttsService.getVoices();
            return new Response(JSON.stringify({ voices }), { 
                status: 200, 
                headers: { 'Content-Type': 'application/json' } 
            });
        }

        if (method === 'GET' && (url.pathname === '/api/tts/health' || url.pathname === '/api/health' || url.pathname === '/health')) {
            return new Response(JSON.stringify({
                status: 'ok',
                timestamp: new Date().toISOString(),
                libp2p: libp2pNode ? 'enabled' : 'disabled'
            }), { 
                status: 200, 
                headers: { 'Content-Type': 'application/json' } 
            });
        }

        return new Response(JSON.stringify({
            success: false,
            error: { code: 404, message: 'Not Found' }
        }), { 
            status: 404, 
            headers: { 'Content-Type': 'application/json' } 
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
            headers: { 'Content-Type': 'application/json' } 
        });
    }
}

async function main() {
    console.log('='.repeat(60));
    console.log('Supertonic TTS Service Starting...');
    console.log('='.repeat(60));

    if (LIBP2P_ENABLED) {
        libp2pNode = await initLibp2p();
    } else {
        console.log('Libp2p disabled (set LIBP2P_ENABLED=true to enable P2P networking)');
    }

    initTTSService();

    const server = Bun.serve({
        port: PORT,
        hostname: HOST,
        fetch: handleRequest,
    });

    console.log('='.repeat(60));
    console.log('Supertonic TTS Service Started');
    console.log('='.repeat(60));
    console.log(`HTTP Server listening on http://${HOST}:${PORT}`);
    console.log('');
    console.log('Available REST API Endpoints:');
    console.log(`  POST http://localhost:${PORT}/api/tts/synthesize`);
    console.log(`  POST http://localhost:${PORT}/api/tts/synthesize-mixed`);
    console.log(`  GET  http://localhost:${PORT}/api/tts/voices`);
    console.log(`  GET  http://localhost:${PORT}/api/tts/health`);
    console.log(`  GET  http://${HOST}:${PORT}/health`);
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