import { join } from 'path';
import { readFileSync } from 'fs';
import { discoverServer } from './discover.js';
import {
    HTTPClient,
    Libp2pClient,
    saveAudioFile,
    getClientConfig,
} from '../src/tts/client/index.js';
import {
    DEFAULTS,
    TTS_METHODS,
} from '../src/tts/constants.js';


// Import test texts from examples/text directory
const ENGLISH_TEXT = readFileSync(new URL('./text/english.txt', import.meta.url), 'utf-8')

const SPANISH_TEXT = readFileSync(new URL('./text/spanish.txt', import.meta.url), 'utf-8')


// ============================================================================
// Configuration
// ============================================================================

const config = getClientConfig();
const { serverUrl, libp2pServer, libp2pMode, outputDir } = config;

// ============================================================================
// Extended Libp2p Client with auto-discovery
// ============================================================================

class Libp2pClientWithDiscovery extends Libp2pClient {
    async connectWithDiscovery(): Promise<void> {
        if (libp2pServer) {
            await this.connect({ serverMultiaddr: libp2pServer });
        } else {
            await this.connect({ useMdnsDiscovery: true });
        }
    }
}

// ============================================================================
// Main
// ============================================================================

type TTSClient = InstanceType<typeof HTTPClient> | Libp2pClientWithDiscovery;

async function createClient(): Promise<TTSClient> {
    let finalServerUrl = serverUrl;

    // Auto-discovery logic: if using default localhost and not in P2P mode, try to find a remote server
    if (!libp2pMode && (serverUrl.includes('localhost') || serverUrl.includes('127.0.0.1'))) {
        try {
            console.log('🔍 Searching for a Supertonic server on the network...');
            const ip = await discoverServer(DEFAULTS.PORT);
            finalServerUrl = `http://${ip}:${DEFAULTS.PORT}`;
            console.log(`📡 Auto-detected server at: ${finalServerUrl}`);
        } catch {
            console.log('⚠️ No remote server discovered, falling back to local.');
        }
    }

    if (libp2pMode) {
        console.log('Mode: Libp2p P2P');
        const client = new Libp2pClientWithDiscovery();
        await client.connectWithDiscovery();
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
            text: ENGLISH_TEXT,
            voice: 'F1',
            filename: 'client_test_en',
            options: { rate: '0%' },
            writeToFile: false, // Server won't save, client will
        });
        console.log('   ✓ Synthesis complete!');
        console.log('   Detected language:', result1.detectedLanguage);
        console.log('   Audio size (base64):', result1.audioBase64.length, 'characters');

        // Save audio file locally
        const savedPath1 = saveAudioFile(result1.audioBase64, 'client_test_en', outputDir);
        console.log('   ✓ Saved locally to:', savedPath1);
        console.log('');

        console.log('[4] Synthesize Spanish Text:');
        const result2 = await client.call(TTS_METHODS.SYNTHESIZE, {
            text: SPANISH_TEXT,
            voice: 'M1',
            filename: 'client_test_es',
            options: { rate: '+10%' },
            language: 'es',
            writeToFile: false,
        });
        console.log('   ✓ Synthesis complete!');
        console.log('   Detected language:', result2.detectedLanguage);

        // Save audio file locally
        const savedPath2 = saveAudioFile(result2.audioBase64, 'client_test_es', outputDir);
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
        const savedPath3 = saveAudioFile(result3.audioBase64, 'client_test_mixed', outputDir);
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
        console.log(`Audio files saved to: ${join(process.cwd(), outputDir)}`);
        console.log('='.repeat(60));
    } catch (error: unknown) {
        const err = error as Error;
        console.error('\n❌ Error:', err);
    } finally {
        await client.close();
        console.log('\n✓ Client closed');
    }
}

if (import.meta.main){
    main().catch(console.error);
}
