/**
 * Supertonic Service Discovery Utility
 * Exports a function to find a server and return its IP address
 */

import { createLibp2p } from "libp2p";
import { tcp } from "@libp2p/tcp";
import { yamux } from "@chainsafe/libp2p-yamux";
import { noise } from "@chainsafe/libp2p-noise";
import { mdns } from "@libp2p/mdns";

/**
 * Searches for a Supertonic server on the local network
 * @param timeoutMs How long to search before giving up (default 10s)
 * @returns The IP address of the discovered server
 */
export async function discoverServer(timeoutMs: number = 10000): Promise<string> {
  const node = await createLibp2p({
    transports: [tcp()],
    streamMuxers: [yamux()],
    connectionEncrypters: [noise()],
    peerDiscovery: [
      mdns({
        interval: 1000,
      })
    ],
  });

  await node.start();

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(async () => {
      await node.stop();
      reject(new Error("Discovery timeout: No server found on the network"));
    }, timeoutMs);

    node.addEventListener("peer:discovery", async (event: any) => {
      const peer = event.detail;
      
      if (peer.multiaddrs && peer.multiaddrs.length > 0) {
        for (const addr of peer.multiaddrs) {
          const addrStr = addr.toString();
          const ipMatch = addrStr.match(/\/ip4\/([0-9.]+)/);
          
          // Ignoramos localhost (127.0.0.1) para obtener la IP de la red
          if (ipMatch && ipMatch[1] !== "127.0.0.1") {
            const foundIp = ipMatch[1];
            clearTimeout(timeout);
            await node.stop();
            resolve(foundIp);
            return;
          }
        }
      }
    });
  });
}

// Permitir seguir usándolo como script independiente
if (import.meta.main) {
  console.log("Searching for server...");
  discoverServer()
    .then(ip => console.log(`\n✅ Found server at: ${ip}`))
    .catch(err => console.error(`\n❌ ${err.message}`));
}
