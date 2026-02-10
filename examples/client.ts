/**
 * Libp2p TTS Client Example (Type-Safe with mDNS Discovery)
 * Demonstrates how to call the TTS service via libp2p P2P networking
 *
 * This client connects directly to the server's libp2p node without using HTTP.
 * It supports automatic discovery via multicast DNS (mDNS) on the local network.
 *
 * Usage:
 *   - Start server with LIBP2P_ENABLED=true
 *   - Run this client; it will discover the server via mDNS.
 *   - Alternatively, set LIBP2P_SERVER to a specific multiaddr.
 *
 * Run with: bun run examples/client.ts
 */
// Define Language type (same as server)
type Language = 'en' | 'ko' | 'es' | 'pt' | 'fr';

// SynthesisOptions (same as server)
interface SynthesisOptions {
  rate?: string;
  volume?: string;
  pitch?: string;
}

// Protocol types
interface SynthesizeParams {
  text: string;
  voice?: string;
  filename?: string;
  options?: SynthesisOptions;
  language?: Language;
  writeToFile?: boolean;
}

interface SynthesizeMixedParams {
  taggedText: string;
  voice?: string;
  filename?: string;
  options?: SynthesisOptions;
  silenceDuration?: number;
  writeToFile?: boolean;
}

type TTSServiceMap = {
  synthesize: { params: SynthesizeParams; result: { savedPath: string | null; audioBase64: string; detectedLanguage: Language } };
  synthesizeMixed: { params: SynthesizeMixedParams; result: { savedPath: string | null; audioBase64: string } };
  getVoices: { params: Record<string, never>; result: { voices: string[] } };
  health: { params: Record<string, never>; result: { status: string; timestamp: string; libp2p: string } };
};

type TTSRequest<M extends keyof TTSServiceMap = keyof TTSServiceMap> = {
  method: M;
  params: TTSServiceMap[M]['params'];
};

type TTSResponse<T = any> = 
  | { success: true; result: T }
  | { success: false; error: string };

async function main() {
  // Dynamic imports to avoid requiring packages if not used
  const { createLibp2p } = await import('libp2p');
  const { tcp } = await import('@libp2p/tcp');
  const { yamux } = await import('@chainsafe/libp2p-yamux');
  const { noise } = await import('@chainsafe/libp2p-noise');
  const { mdns } = await import('@libp2p/mdns');

  // Resolve server address: use env var or mDNS discovery
  const envAddr = process.env.LIBP2P_SERVER;
  let serverMultiaddr: any;
  let node: any;

  if (envAddr) {
    // Create libp2p node without mDNS when using direct address
    node = await createLibp2p({
      transports: [tcp()],
      streamMuxers: [yamux()],
      connectionEncrypters: [noise()],
    });
    await node.start();
    console.log('Client libp2p node started');
    console.log('Node ID:', node.peerId.toString());
    serverMultiaddr = envAddr;
    console.log(`Using LIBP2P_SERVER: ${serverMultiaddr}`);
  } else {
    // Create libp2p node with mDNS peer discovery
    console.log('No LIBP2P_SERVER set, starting mDNS discovery...');
    
    node = await createLibp2p({
      transports: [tcp()],
      streamMuxers: [yamux()],
      connectionEncrypters: [noise()],
      peerDiscovery: [mdns()],
    });

    // Start the node BEFORE waiting for discovery events
    await node.start();
    console.log('Client libp2p node started');
    console.log('Node ID:', node.peerId.toString());

    // Wait for peer discovery via mDNS
    try {
      const discovered = await new Promise<any>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('mDNS discovery timeout after 15s')), 15000);
        
        node.addEventListener('peer:discovery', (event: any) => {
          const peer = event.detail;
          console.log(`Discovered peer via mDNS: ${peer.id.toString()}`);
          // Check if peer has addresses
          if (peer.multiaddrs && peer.multiaddrs.length > 0) {
            clearTimeout(timeout);
            resolve(peer);
          }
        });
      });
      
      serverMultiaddr = discovered.multiaddrs[0];
      console.log(`Using discovered server: ${serverMultiaddr}`);
    } catch (error: any) {
      console.error('Discovery failed:', error.message);
      await node.stop();
      process.exit(1);
    }
  }

  try {
    console.log(`Connecting to server: ${serverMultiaddr}`);
    await node.dial(serverMultiaddr as any);
    console.log('Connected to server');

    // Typed helper function
    async function callTTSService<M extends keyof TTSServiceMap>(method: M, params: TTSServiceMap[M]['params']): Promise<TTSServiceMap[M]['result']> {
      const stream = await node.newStream(serverMultiaddr as any, ['/tts/1.0.0']);
      try {
        // Send request
        const request = JSON.stringify({ method, params }) + '\n';
        await stream.write(Buffer.from(request));

        // Read response: accumulate until newline
        let buffer = Buffer.alloc(0);
        let responseText: string | null = null;
        while (true) {
          const chunk = await stream.read();
          if (chunk === null) break; // EOF
          buffer = Buffer.concat([buffer, Buffer.from(chunk)]);
          const newlineIndex = buffer.indexOf(10); // '\n'
          if (newlineIndex !== -1) {
            responseText = buffer.toString('utf8', 0, newlineIndex);
            break;
          }
        }
        if (!responseText) {
          throw new Error('No response from server');
        }
        const response = JSON.parse(responseText) as TTSResponse<TTSServiceMap[M]['result']>;
        if (response.success) {
          return response.result;
        } else {
          throw new Error(response.error);
        }
      } finally {
        stream.close();
      }
    }

    // Examples
    console.log('\n[1] Health Check:');
    const health = await callTTSService('health', {});
    console.log('   Response:', health);
    console.log('');

    console.log('[2] Get Available Voices:');
    const voices = await callTTSService('getVoices', {});
    console.log('   Available voices:', voices.voices.join(', '));
    console.log('');

    console.log('[3] Synthesize English Text:');
    const result1 = await callTTSService('synthesize', {
      text: 'Hello, this is a test of the Libp2p TTS service.',
      voice: 'F1',
      filename: 'libp2p_test_en',
      options: { rate: '0%' },
      writeToFile: true
    });
    console.log('   ✓ Success!');
    console.log('   Saved to:', result1.savedPath);
    console.log('   Detected language:', result1.detectedLanguage);
    console.log('   Audio size (base64):', result1.audioBase64.length, 'characters');
    console.log('');

    console.log('[4] Synthesize Spanish Text:');
    const result2 = await callTTSService('synthesize', {
      text: 'Hola, este es un ejemplo en español usando Libp2p.',
      voice: 'M1',
      filename: 'libp2p_test_es',
      options: { rate: '+10%' },
      language: 'es',
      writeToFile: true
    });
    console.log('   ✓ Success!');
    console.log('   Saved to:', result2.savedPath);
    console.log('   Detected language:', result2.detectedLanguage);
    console.log('');

    console.log('[5] Synthesize Mixed-Language Text:');
    const mixedText = '<en>Hello and welcome</en><es>Bienvenidos a todos</es><en>Thank you</en>';
    const result3 = await callTTSService('synthesizeMixed', {
      taggedText: mixedText,
      voice: 'F2',
      filename: 'libp2p_test_mixed',
      options: { rate: '0%' },
      silenceDuration: 0.5,
      writeToFile: true
    });
    console.log('   ✓ Success!');
    console.log('   Saved to:', result3.savedPath);
    console.log('   Audio size (base64):', result3.audioBase64.length, 'characters');
    console.log('');

    console.log('[6] Using Context and Metadata:');
    console.log('   (Not supported in this simple protocol)');
    console.log('');

    console.log('[7] Error Handling Example:');
    try {
      await callTTSService('synthesize', {
        text: '',
        voice: 'F1',
        filename: 'error_test'
      });
    } catch (error: any) {
      console.log('   Expected error caught:', error.message);
    }
    console.log('');

    console.log('='.repeat(60));
    console.log('EXAMPLES COMPLETED SUCCESSFULLY!');
    console.log('Generated files are in the ./output directory (on server)');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('\n❌ Error:', error);
  } finally {
    await node.stop();
    console.log('\n✓ Client libp2p node stopped');
  }
}

main().catch(console.error);
