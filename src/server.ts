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
import { 
    ENV_VARS, 
    DEFAULTS, 
    ERROR_MESSAGES, 
    PROTOCOLS 
} from './tts/constants.js';
import { initTTSService } from './tts/init.js';
import { handleHttpRequest as handleRequest } from './http/handler.js';
import { initLibp2p, libp2pNode } from './p2p/node.js';
import { p2pProtocolHandler } from './p2p/handler.js';
import { ROUTES } from './http/routes.js';
const PORT = process.env.PORT ? parseInt(process.env.PORT) : DEFAULTS.PORT;
const HOST = process.env.HOST || DEFAULTS.HOST;
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
    await initLibp2p(p2pProtocolHandler);

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
    ROUTES.forEach(route => {
        console.log(`  ${route.method.padEnd(5)} ${route.path.padEnd(30)} - ${route.description}`);
    });
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