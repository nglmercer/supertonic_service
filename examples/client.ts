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
 *     - Start server with LIBP2P_ENABLED=true
 *     - LIBP2P_SERVER=/ip4/127.0.0.1/tcp/9000/p2p/<peer-id> bun run examples/client.ts
 *     - Or for mDNS discovery: LIBP2P_MODE=true bun run examples/client.ts
 *
 * Run with: bun run examples/client.ts
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

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
  health: { params: Record<string, never>; result: { status: string; timestamp: string; libp2p?: string } };
};

type TTSRequest<M extends keyof TTSServiceMap = keyof TTSServiceMap> = {
  method: M;
  params: TTSServiceMap[M]['params'];
};

type TTSResponse<T = any> = 
  | { success: true; result: T }
  | { success: false; error: string };

// Configuration
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';
const LIBP2P_SERVER = process.env.LIBP2P_SERVER;
const LIBP2P_MODE = process.env.LIBP2P_MODE === 'true' || !!LIBP2P_SERVER;
const OUTPUT_DIR = process.env.OUTPUT_DIR || './output';

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
// HTTP Client Implementation
// ============================================================================

class HTTPClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async call<M extends keyof TTSServiceMap>(
    method: M, 
    params: TTSServiceMap[M]['params']
  ): Promise<TTSServiceMap[M]['result']> {
    let endpoint: string;
    let body: any;

    switch (method) {
      case 'synthesize':
        endpoint = '/api/tts/synthesize';
        body = params;
        break;
      case 'synthesizeMixed':
        endpoint = '/api/tts/synthesize-mixed';
        body = params;
        break;
      case 'getVoices':
        endpoint = '/api/tts/voices';
        break;
      case 'health':
        endpoint = '/api/tts/health';
        break;
      default:
        throw new Error(`Unknown method: ${method}`);
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: method === 'getVoices' || method === 'health' ? 'GET' : 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: method === 'getVoices' || method === 'health' ? undefined : JSON.stringify(params),
    });

    const data = await response.json() as any;

    if (!response.ok || data.success === false) {
      throw new Error(data.error?.message || data.error || `HTTP ${response.status}`);
    }

    // Handle different response formats
    if (method === 'getVoices') {
      return { voices: data.voices || data } as TTSServiceMap[M]['result'];
    }
    if (method === 'health') {
      return data as TTSServiceMap[M]['result'];
    }
    
    return data as TTSServiceMap[M]['result'];
  }

  async close() {
    // No cleanup needed for HTTP
  }
}

// ============================================================================
// Libp2p Client Implementation
// ============================================================================

class Libp2pClient {
  private node: any;
  private serverMultiaddr: any;

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
        const discovered = await new Promise<any>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('mDNS discovery timeout after 15s')), 15000);
          
          this.node.addEventListener('peer:discovery', (event: any) => {
            const peer = event.detail;
            console.log(`Discovered peer via mDNS: ${peer.id.toString()}`);
            if (peer.multiaddrs && peer.multiaddrs.length > 0) {
              clearTimeout(timeout);
              resolve(peer);
            }
          });
        });
        
        this.serverMultiaddr = discovered.multiaddrs[0];
        console.log(`Using discovered server: ${this.serverMultiaddr}`);
      } catch (error: any) {
        await this.node.stop();
        throw new Error(`Discovery failed: ${error.message}`);
      }
    }

    // Connect to server
    console.log(`Connecting to server: ${this.serverMultiaddr}`);
    await this.node.dial(this.serverMultiaddr);
    console.log('Connected to server');
  }

  async call<M extends keyof TTSServiceMap>(
    method: M, 
    params: TTSServiceMap[M]['params']
  ): Promise<TTSServiceMap[M]['result']> {
    const stream = await this.node.newStream(this.serverMultiaddr, ['/tts/1.0.0']);
    
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
        const newlineIndex = buffer.indexOf(10);
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

  async close() {
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
  if (LIBP2P_MODE) {
    console.log('Mode: Libp2p P2P');
    const client = new Libp2pClient();
    await client.connect();
    return client;
  } else {
    console.log(`Mode: HTTP (${SERVER_URL})`);
    return new HTTPClient(SERVER_URL);
  }
}

async function main() {
  console.log('============================================================');
  console.log('Supertonic TTS Client');
  console.log('============================================================\n');

  let client: TTSClient;
  
  try {
    client = await createClient();
  } catch (error: any) {
    console.error('Failed to connect:', error.message);
    process.exit(1);
  }

  try {
    // Examples
    console.log('\n[1] Health Check:');
    const health = await client.call('health', {});
    console.log('   Response:', health);
    console.log('');

    console.log('[2] Get Available Voices:');
    const voices = await client.call('getVoices', {});
    console.log('   Available voices:', voices.voices.join(', '));
    console.log('');

    console.log('[3] Synthesize English Text:');
    const result1 = await client.call('synthesize', {
      text: 'Hello, this is a test of the TTS service.',
      voice: 'F1',
      filename: 'client_test_en',
      options: { rate: '0%' },
      writeToFile: false  // Server won't save, client will
    });
    console.log('   ✓ Synthesis complete!');
    console.log('   Detected language:', result1.detectedLanguage);
    console.log('   Audio size (base64):', result1.audioBase64.length, 'characters');
    
    // Save audio file locally
    const savedPath1 = saveAudioFile(result1.audioBase64, 'client_test_en');
    console.log('   ✓ Saved locally to:', savedPath1);
    console.log('');

    console.log('[4] Synthesize Spanish Text:');
    const result2 = await client.call('synthesize', {
      text: 'Hola, este es un ejemplo en español.',
      voice: 'M1',
      filename: 'client_test_es',
      options: { rate: '+10%' },
      language: 'es',
      writeToFile: false
    });
    console.log('   ✓ Synthesis complete!');
    console.log('   Detected language:', result2.detectedLanguage);
    
    // Save audio file locally
    const savedPath2 = saveAudioFile(result2.audioBase64, 'client_test_es');
    console.log('   ✓ Saved locally to:', savedPath2);
    console.log('');

    console.log('[5] Synthesize Mixed-Language Text:');
    const mixedText = '<en>Hello and welcome</en><es>Bienvenidos a todos</es><en>Thank you</en>';
    const result3 = await client.call('synthesizeMixed', {
      taggedText: mixedText,
      voice: 'F2',
      filename: 'client_test_mixed',
      options: { rate: '0%' },
      silenceDuration: 0.5,
      writeToFile: false
    });
    console.log('   ✓ Synthesis complete!');
    console.log('   Audio size (base64):', result3.audioBase64.length, 'characters');
    
    // Save audio file locally
    const savedPath3 = saveAudioFile(result3.audioBase64, 'client_test_mixed');
    console.log('   ✓ Saved locally to:', savedPath3);
    console.log('');

    console.log('[6] Error Handling Example:');
    try {
      await client.call('synthesize', {
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
    console.log(`Audio files saved to: ${join(process.cwd(), OUTPUT_DIR)}`);
    console.log('='.repeat(60));

  } catch (error) {
    console.error('\n❌ Error:', error);
  } finally {
    await client.close();
    console.log('\n✓ Client closed');
  }
}

main().catch(console.error);
