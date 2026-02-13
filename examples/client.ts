/**
 * TTS Client Example (HTTP and Libp2p support)
 * Demonstrates how to call the TTS service via HTTP or libp2p P2P networking
 *
 * Usage:
 *   HTTP mode (default): Connects to HTTP server
 *     bun run examples/client.ts
 *     SERVER_URL=http://localhost:3000 bun run examples/client.ts
 *
 *   Libp2p mode: Connects directly to server's libp2p node
 *     - LIBP2P_SERVER=/ip4/127.0.0.1/tcp/9000/p2p/<peer-id> bun run examples/client.ts
 *     - Or for mDNS discovery: LIBP2P_MODE=true bun run examples/client.ts
 *
 * Run with: bun run examples/client.ts
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { discoverServer } from './discover.ts';
import {
    ENV_VARS,
    DEFAULTS,
    API_ENDPOINTS,
    TTS_METHODS,
    PROTOCOLS,
    ERROR_MESSAGES,
    CONTENT_TYPES,
} from '../src/tts/constants.js';

// Import shared types from the server
import type {
    TTSMethod,
    TTSParamsMap,
    TTSResultMap,
    TTSResponse,
    VoiceKey,
} from '../src/tts/types.js';
import type { Libp2p } from 'libp2p';
import type { PeerInfo } from '@libp2p/interface';
import { multiaddr } from '@multiformats/multiaddr';
// ============================================================================
// Audio File Helper
// ============================================================================

function saveAudioFile(base64Data: string, filename: string): string {
    // Ensure output directory exists
    if (!existsSync(OUTPUT_DIR)) {
        mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    // Decode base64 to buffer
    const buffer = Buffer.from(base64Data, 'base64');

    // Generate unique filename with timestamp
    const timestamp = Date.now();
    const fullPath = join(OUTPUT_DIR, `${filename}_${timestamp}.wav`);

    // Write file
    writeFileSync(fullPath, buffer);

    return fullPath;
}

// ============================================================================
// Configuration - using constants
// ============================================================================

const SERVER_URL = process.env[ENV_VARS.SERVER_URL] || DEFAULTS.DEFAULT_SERVER_URL;
const LIBP2P_SERVER = process.env[ENV_VARS.LIBP2P_SERVER];
const LIBP2P_MODE = process.env[ENV_VARS.LIBP2P_MODE] === 'true' || LIBP2P_SERVER !== undefined;
const OUTPUT_DIR = process.env[ENV_VARS.OUTPUT_DIR] || DEFAULTS.DEFAULT_CLIENT_OUTPUT_DIR;

// ============================================================================
// HTTP Client Implementation
// ============================================================================

class HTTPClient {
    private baseUrl: string;

    constructor(baseUrl: string) {
        this.baseUrl = baseUrl;
    }

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

    async close(): Promise<void> {
        // No cleanup needed for HTTP
    }
}

// ============================================================================
// Libp2p Client Implementation
// ============================================================================

class Libp2pClient {
    private node: Libp2p | null = null;
    private serverMultiaddr: string | null = null;

    async connect(): Promise<void> {
        // Dynamic imports
        const { createLibp2p } = await import('libp2p');
        const { tcp } = await import('@libp2p/tcp');
        const { yamux } = await import('@chainsafe/libp2p-yamux');
        const { noise } = await import('@chainsafe/libp2p-noise');
        const { mdns } = await import('@libp2p/mdns');

        if (LIBP2P_SERVER) {
            // Direct connection mode
            this.node = await createLibp2p({
                transports: [tcp()],
                streamMuxers: [yamux()],
                connectionEncrypters: [noise()],
            });
            await this.node.start();
            console.log('Client libp2p node started');
            console.log('Node ID:', this.node.peerId.toString());
            this.serverMultiaddr = LIBP2P_SERVER;
            console.log(`Using LIBP2P_SERVER: ${this.serverMultiaddr}`);
        } else {
            // mDNS discovery mode
            console.log('No LIBP2P_SERVER set, starting mDNS discovery...');

            this.node = await createLibp2p({
                transports: [tcp()],
                streamMuxers: [yamux()],
                connectionEncrypters: [noise()],
                peerDiscovery: [mdns()],
            });

            await this.node.start();
            console.log('Client libp2p node started');
            console.log('Node ID:', this.node.peerId.toString());

            // Wait for peer discovery via mDNS
            try {
                const discovered = await this.waitForPeerDiscovery();
                const discoveredAddr = discovered.multiaddrs[0];
                this.serverMultiaddr = discoveredAddr !== undefined ? discoveredAddr.toString() : null;
                console.log(`Using discovered server: ${this.serverMultiaddr}`);
            } catch (error: unknown) {
                const err = error as Error;
                await this.node?.stop();
                throw new Error(`Discovery failed: ${err.message}`);
            }
        }

        // Connect to server
        if (!this.serverMultiaddr) {
            throw new Error('No server multiaddr available');
        }
        
        console.log(`Connecting to server: ${this.serverMultiaddr}`);
        await this.node.dial(multiaddr(this.serverMultiaddr));
        console.log('Connected to server');
    }

    private waitForPeerDiscovery(): Promise<PeerInfo> {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(
                () => reject(new Error(ERROR_MESSAGES.DISCOVERY_TIMEOUT)),
                DEFAULTS.DISCOVERY_TIMEOUT
            );

            const handlePeerDiscovery = (event: CustomEvent<PeerInfo>) => {
                const peer = event.detail;
                console.log(`Discovered peer via mDNS: ${peer.id.toString()}`);
                if (peer.multiaddrs && peer.multiaddrs.length > 0) {
                    clearTimeout(timeout);
                    this.node?.removeEventListener('peer:discovery', handlePeerDiscovery);
                    resolve(peer);
                }
            };

            this.node?.addEventListener('peer:discovery', handlePeerDiscovery);
        });
    }

    async call<M extends TTSMethod>(
        method: M,
        params: TTSParamsMap[M]
    ): Promise<TTSResultMap[M]> {
        if (!this.node || !this.serverMultiaddr) {
            throw new Error('Libp2p node not connected');
        }

        const stream = await this.node.dialProtocol(multiaddr(this.serverMultiaddr), [PROTOCOLS.TTS]);

        try {
            // Send request
            const request = JSON.stringify({ method, params }) + '\n';
            await stream.write(Buffer.from(request));

            // Read response: accumulate until newline
            let buffer = Buffer.alloc(0);
            let responseText: string | null = null;

            while (true) {
                const chunk = await stream.read();
                if (chunk === null) break;
                buffer = Buffer.concat([buffer, Buffer.from(chunk)]);
                const newlineIndex = buffer.indexOf(10); // newline character
                if (newlineIndex !== -1) {
                    responseText = buffer.toString('utf8', 0, newlineIndex);
                    break;
                }
            }

            if (!responseText) {
                throw new Error(ERROR_MESSAGES.NO_RESPONSE);
            }

            const response = JSON.parse(responseText) as TTSResponse<M>;

            if (response.success) {
                return response.result;
            } else {
                throw new Error(response.error);
            }
        } finally {
            stream.close();
        }
    }

    async close(): Promise<void> {
        if (this.node) {
            await this.node.stop();
            console.log('Client libp2p node stopped');
        }
    }
}

// ============================================================================
// Main
// ============================================================================

type TTSClient = HTTPClient | Libp2pClient;

async function createClient(): Promise<TTSClient> {
    let finalServerUrl = SERVER_URL;

    // Auto-discovery logic: if using default localhost and not in P2P mode, try to find a remote server
    if (!LIBP2P_MODE && (SERVER_URL.includes('localhost') || SERVER_URL.includes('127.0.0.1'))) {
        try {
            console.log('🔍 Searching for a Supertonic server on the network...');
            const ip = await discoverServer(DEFAULTS.PORT);
            finalServerUrl = `http://${ip}:${DEFAULTS.PORT}`;
            console.log(`📡 Auto-detected server at: ${finalServerUrl}`);
        } catch {
            console.log('⚠️ No remote server discovered, falling back to local.');
        }
    }

    if (LIBP2P_MODE) {
        console.log('Mode: Libp2p P2P');
        const client = new Libp2pClient();
        await client.connect();
        return client;
    } else {
        console.log(`🚀 Mode: HTTP (${finalServerUrl})`);
        return new HTTPClient(finalServerUrl);
    }
}

async function main(): Promise<void> {
    console.log('============================================================');
    console.log('Supertonic TTS Client');
    console.log('============================================================\n');

    let client: TTSClient;

    try {
        client = await createClient();
    } catch (error: unknown) {
        const err = error as Error;
        console.error('Failed to connect:', err.message);
        process.exit(1);
    }

    try {
        // Examples
        console.log('\n[1] Health Check:');
        const health = await client.call(TTS_METHODS.HEALTH, {});
        console.log('   Response:', health);
        console.log('');

        console.log('[2] Get Available Voices:');
        const voices = await client.call(TTS_METHODS.GET_VOICES, {});
        console.log('   Available voices:', voices.voices.join(', '));
        console.log('');

        console.log('[3] Synthesize English Text:');
        const result1 = await client.call(TTS_METHODS.SYNTHESIZE, {
            text: 'Hello, this is a test of the TTS service.',
            voice: 'F1',
            filename: 'client_test_en',
            options: { rate: '0%' },
            writeToFile: false, // Server won't save, client will
        });
        console.log('   ✓ Synthesis complete!');
        console.log('   Detected language:', result1.detectedLanguage);
        console.log('   Audio size (base64):', result1.audioBase64.length, 'characters');

        // Save audio file locally
        const savedPath1 = saveAudioFile(result1.audioBase64, 'client_test_en');
        console.log('   ✓ Saved locally to:', savedPath1);
        console.log('');

        console.log('[4] Synthesize Spanish Text:');
        const result2 = await client.call(TTS_METHODS.SYNTHESIZE, {
            text: 'Hola, este es un ejemplo en español.',
            voice: 'M1',
            filename: 'client_test_es',
            options: { rate: '+10%' },
            language: 'es',
            writeToFile: false,
        });
        console.log('   ✓ Synthesis complete!');
        console.log('   Detected language:', result2.detectedLanguage);

        // Save audio file locally
        const savedPath2 = saveAudioFile(result2.audioBase64, 'client_test_es');
        console.log('   ✓ Saved locally to:', savedPath2);
        console.log('');

        console.log('[5] Synthesize Mixed-Language Text:');
        const mixedText = '<en>Hello and welcome</en><es>Bienvenidos a todos</es><en>Thank you</en>';
        const result3 = await client.call(TTS_METHODS.SYNTHESIZE_MIXED, {
            taggedText: mixedText,
            voice: 'F2',
            filename: 'client_test_mixed',
            options: { rate: '0%' },
            silenceDuration: DEFAULTS.DEFAULT_SILENCE_DURATION_MIXED,
            writeToFile: false,
        });
        console.log('   ✓ Synthesis complete!');
        console.log('   Audio size (base64):', result3.audioBase64.length, 'characters');

        // Save audio file locally
        const savedPath3 = saveAudioFile(result3.audioBase64, 'client_test_mixed');
        console.log('   ✓ Saved locally to:', savedPath3);
        console.log('');

        console.log('[6] Error Handling Example:');
        try {
            await client.call(TTS_METHODS.SYNTHESIZE, {
                text: '',
                voice: 'F1',
                filename: 'error_test',
            });
        } catch (error: unknown) {
            const err = error as Error;
            console.log('   Expected error caught:', err.message);
        }
        console.log('');

        console.log('='.repeat(60));
        console.log('EXAMPLES COMPLETED SUCCESSFULLY!');
        console.log(`Audio files saved to: ${join(process.cwd(), OUTPUT_DIR)}`);
        console.log('='.repeat(60));
    } catch (error: unknown) {
        const err = error as Error;
        console.error('\n❌ Error:', err);
    } finally {
        await client.close();
        console.log('\n✓ Client closed');
    }
}

main().catch(console.error);
