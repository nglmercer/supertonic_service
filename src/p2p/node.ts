import type { Libp2p } from 'libp2p';
import type { PeerId } from '@libp2p/interface';

const LIBP2P_PORT = process.env.LIBP2P_PORT ? parseInt(process.env.LIBP2P_PORT) : 9001;

export let libp2pNode: Libp2p | null = null;

// Interface for the stream as used in the code (read/write/close)
export interface NetworkStream {
    read(): Promise<Uint8Array | null>;
    write(data: Uint8Array | Buffer): Promise<void>;
    close(): void;
}

export async function initLibp2p(protocolHandler: (stream: NetworkStream) => Promise<void>) {
    try {
        // Dynamic imports for optional peer-to-peer functionality
        const { createLibp2p } = await import('libp2p');
        const { tcp } = await import('@libp2p/tcp');
        const { yamux } = await import('@chainsafe/libp2p-yamux');
        const { noise } = await import('@chainsafe/libp2p-noise');
        const { mdns } = await import('@libp2p/mdns');
        
        libp2pNode = await createLibp2p({
            addresses: {
                listen: [`/ip4/0.0.0.0/tcp/${LIBP2P_PORT}`]
            },
            transports: [tcp()],
            streamMuxers: [yamux()],
            connectionEncrypters: [noise()],
            peerDiscovery: [
                mdns({
                    interval: 1000, 
                })
            ],
        });

        libp2pNode.addEventListener('peer:connect', (event: CustomEvent<PeerId>) => {
            console.log(`Connected to peer: ${event.detail.toString()}`);
        });

        libp2pNode.addEventListener('peer:disconnect', (event: CustomEvent<PeerId>) => {
            console.log(`Disconnected from peer: ${event.detail.toString()}`);
        });

        await libp2pNode.start();

        // Register TTS protocol handler
        // @ts-ignore - libp2p type flexibility
        libp2pNode.handle('/tts/1.0.0', protocolHandler);

        console.log('='.repeat(60));
        console.log('Libp2p node started');
        console.log(`Node ID: ${libp2pNode.peerId.toString()}`);
        console.log('Listening on:');
        libp2pNode.getMultiaddrs().forEach(ma => {
            const addr = ma.toString();
            if (addr.includes('127.0.0.1')) {
                console.log(`  - ${addr} (Local)`);
            } else {
                console.log(`  - ${addr} (Network - Discovery ready)`);
            }
        });
        console.log('='.repeat(60));

        return libp2pNode;
    } catch (error: unknown) {
        const err = error as Error & { code?: string };
        console.error('Failed to start libp2p node:', err.message);
        if (err.code === 'MODULE_NOT_FOUND') {
            console.log('Note: Install libp2p packages to enable P2P: bun add libp2p @libp2p/tcp @libp2p/yamux @chainsafe/libp2p-noise');
        }
        return null;
    }
}

export async function stopLibp2p() {
    if (libp2pNode) {
        await libp2pNode.stop();
        libp2pNode = null;
    }
}
