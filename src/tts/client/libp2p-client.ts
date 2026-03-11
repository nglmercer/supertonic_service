/**
 * Libp2p Client for TTS Service
 * Provides P2P-based communication with the TTS server via libp2p
 */

import type { Libp2p } from 'libp2p';
import type { PeerInfo } from '@libp2p/interface';
import { multiaddr } from '@multiformats/multiaddr';

import {
    DEFAULTS,
    ERROR_MESSAGES,
    PROTOCOLS,
} from '../constants.js';

import type {
    TTSMethod,
    TTSParamsMap,
    TTSResultMap,
    TTSResponse,
} from '../types.js';

export interface Libp2pClientConfig {
    serverMultiaddr?: string;
    useMdnsDiscovery?: boolean;
}

/**
 * Libp2p Client implementation for calling TTS service via P2P networking
 */
export class Libp2pClient {
    private node: Libp2p | null = null;
    private serverMultiaddr: string | null = null;

    /**
     * Connect to the TTS server via libp2p
     */
    async connect(config: Libp2pClientConfig = {}): Promise<void> {
        const { serverMultiaddr, useMdnsDiscovery } = config;

        // Dynamic imports for libp2p modules
        const { createLibp2p } = await import('libp2p');
        const { tcp } = await import('@libp2p/tcp');
        const { yamux } = await import('@chainsafe/libp2p-yamux');
        const { noise } = await import('@chainsafe/libp2p-noise');
        const { mdns } = await import('@libp2p/mdns');

        if (serverMultiaddr) {
            // Direct connection mode
            this.node = await createLibp2p({
                transports: [tcp()],
                streamMuxers: [yamux()],
                connectionEncrypters: [noise()],
            });
            await this.node.start();
            console.log('Client libp2p node started');
            console.log('Node ID:', this.node.peerId.toString());
            this.serverMultiaddr = serverMultiaddr;
            console.log(`Using LIBP2P_SERVER: ${this.serverMultiaddr}`);
        } else if (useMdnsDiscovery) {
            // mDNS discovery mode
            console.log('Starting mDNS discovery...');

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
        } else {
            throw new Error('Either serverMultiaddr or useMdnsDiscovery must be provided');
        }

        // Connect to server
        if (!this.serverMultiaddr) {
            throw new Error('No server multiaddr available');
        }
        
        console.log(`Connecting to server: ${this.serverMultiaddr}`);
        await this.node.dial(multiaddr(this.serverMultiaddr));
        console.log('Connected to server');
    }

    /**
     * Wait for peer discovery via mDNS
     */
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

    /**
     * Call a TTS method via libp2p
     */
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
            stream.send(new TextEncoder().encode(request));

            // Read response: accumulate until newline
            let buffer = Buffer.alloc(0);
            let responseText: string | null = null;

            for await (const chunk of stream) {
                buffer = Buffer.concat([buffer, Buffer.from(chunk.subarray())]);
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
            await stream.close();
        }
    }

    /**
     * Close the libp2p connection
     */
    async close(): Promise<void> {
        if (this.node) {
            await this.node.stop();
            console.log('Client libp2p node stopped');
        }
    }

    /**
     * Check if the client is connected
     */
    isConnected(): boolean {
        return this.node !== null && this.serverMultiaddr !== null;
    }

    /**
     * Get the node's peer ID
     */
    getPeerId(): string | null {
        return this.node?.peerId.toString() ?? null;
    }
}
