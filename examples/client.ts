/**
 * Moleculer Client Example
 * Demonstrates how to call the TTS microservice from another service/client
 * 
 * This example shows TWO modes:
 * 1. Standalone mode - Loads the TTS service directly (for testing)
 * 2. Client mode - Connects to a running server via transporter
 * 
 * Run with: bun run examples/client.ts
 */

import { ServiceBroker } from 'moleculer';
import TTSService from '../src/services/tts.service.js';

// Configuration: Set to true to connect to a running server
// Set to false to load the TTS service directly (standalone mode)
const CONNECT_TO_SERVER = false;

// Create broker configuration
const brokerConfig = {
    namespace: 'supertonic',
    nodeID: `client-${process.pid}`,
    
    // Use NATS transporter to connect to remote server
    // Set to null for standalone mode (services loaded locally)
    transporter: process.env.TRANSPORTER || null,
    
    logger: {
        type: 'Console',
        options: { level: 'info' }
    }
};

// Create the broker
const broker = new ServiceBroker(brokerConfig);

// In standalone mode, load the TTS service directly
if (!CONNECT_TO_SERVER) {
    broker.createService(TTSService);
    console.log('📦 Running in STANDALONE mode (TTS service loaded locally)');
} else {
    console.log('🌐 Running in CLIENT mode (connecting to remote server)');
    console.log('   Make sure the server is running: bun start');
    if (!process.env.TRANSPORTER) {
        console.log('   ⚠️  Set TRANSPORTER env var for remote connection (e.g., TRANSPORTER=nats://localhost:4222)');
    }
}

async function main() {
    console.log('='.repeat(60));
    console.log('MOLECULER TTS CLIENT EXAMPLE');
    console.log('='.repeat(60));

    // Start the broker
    await broker.start();
    console.log('\n✓ Client broker started\n');

    try {
        // ============================================
        // Example 1: Health Check
        // ============================================
        console.log('[1] Health Check:');
        const health = await broker.call('tts.health') as { status: string; timestamp: string };
        console.log('   Response:', health);
        console.log('');

        // ============================================
        // Example 2: Get Available Voices
        // ============================================
        console.log('[2] Get Available Voices:');
        const voices = await broker.call('tts.getVoices') as { voices: string[] };
        console.log('   Available voices:', voices.voices.join(', '));
        console.log('');

        // ============================================
        // Example 3: Synthesize Text (English)
        // ============================================
        console.log('[3] Synthesize English Text:');
        const result1 = await broker.call('tts.synthesize', {
            text: 'Hello, this is a test of the Moleculer TTS service.',
            voice: 'F1',
            filename: 'moleculer_test_en',
            options: { rate: '0%' },
            writeToFile: true
        }) as { success: boolean; savedPath: string | null; audioBase64: string; detectedLanguage: string };
        
        console.log('   ✓ Success!');
        console.log('   Saved to:', result1.savedPath);
        console.log('   Detected language:', result1.detectedLanguage);
        console.log('   Audio size (base64):', result1.audioBase64.length, 'characters');
        console.log('');

        // ============================================
        // Example 4: Synthesize Text (Spanish)
        // ============================================
        console.log('[4] Synthesize Spanish Text:');
        const result2 = await broker.call('tts.synthesize', {
            text: 'Hola, este es un ejemplo en español usando Moleculer.',
            voice: 'M1',
            filename: 'moleculer_test_es',
            options: { rate: '+10%' },
            language: 'es',  // Explicit language
            writeToFile: true
        }) as { success: boolean; savedPath: string | null; audioBase64: string; detectedLanguage: string };
        
        console.log('   ✓ Success!');
        console.log('   Saved to:', result2.savedPath);
        console.log('   Detected language:', result2.detectedLanguage);
        console.log('');

        // ============================================
        // Example 5: Synthesize Mixed-Language Text
        // ============================================
        console.log('[5] Synthesize Mixed-Language Text:');
        const mixedText = '<en>Hello and welcome</en><es>Bienvenidos a todos</es><en>Thank you</en>';
        const result3 = await broker.call('tts.synthesizeMixed', {
            taggedText: mixedText,
            voice: 'F2',
            filename: 'moleculer_test_mixed',
            options: { rate: '0%' },
            silenceDuration: 0.5,
            writeToFile: true
        }) as { success: boolean; savedPath: string | null; audioBase64: string };
        
        console.log('   ✓ Success!');
        console.log('   Saved to:', result3.savedPath);
        console.log('   Audio size (base64):', result3.audioBase64.length, 'characters');
        console.log('');

        // ============================================
        // Example 6: Using Context and Metadata
        // ============================================
        console.log('[6] Using Context and Metadata:');
        const result4 = await broker.call(
            'tts.synthesize',
            {
                text: 'Context example with metadata',
                voice: 'F3',
                filename: 'moleculer_test_context'
            },
            {
                meta: {
                    userId: 'user-123',
                    requestId: 'req-456'
                },
                timeout: 60000 // 60 second timeout
            }
        ) as { success: boolean; detectedLanguage: string };
        
        console.log('   ✓ Success with context!');
        console.log('   Detected language:', result4.detectedLanguage);
        console.log('');

        // ============================================
        // Example 7: Error Handling
        // ============================================
        console.log('[7] Error Handling Example:');
        try {
            await broker.call('tts.synthesize', {
                text: '', // Empty text should fail
                voice: 'F1',
                filename: 'error_test'
            });
        } catch (error: any) {
            console.log('   Expected error caught:', error.message || error.type);
        }
        console.log('');

        // ============================================
        // Example 8: Event-based Communication
        // ============================================
        console.log('[8] Event-based Communication:');
        console.log('   In Moleculer, events are handled via services.');
        console.log('   To listen for events, create a service with event handlers:');
        console.log('');
        console.log('   broker.createService({');
        console.log('       name: "listener",');
        console.log('       events: {');
        console.log('           "tts.synthesis.started"(payload) {');
        console.log('               this.logger.info("Synthesis started:", payload);');
        console.log('           },');
        console.log('           "tts.synthesis.completed"(payload) {');
        console.log('               this.logger.info("Synthesis completed:", payload);');
        console.log('           }');
        console.log('       }');
        console.log('   });');
        console.log('');

        // ============================================
        // Summary
        // ============================================
        console.log('='.repeat(60));
        console.log('EXAMPLES COMPLETED SUCCESSFULLY!');
        console.log('Generated files are in the ./output directory');
        console.log('='.repeat(60));

    } catch (error) {
        console.error('\n❌ Error:', error);
    } finally {
        // Stop the broker
        await broker.stop();
        console.log('\n✓ Client broker stopped');
    }
}

// Run the examples
main().catch(console.error);
