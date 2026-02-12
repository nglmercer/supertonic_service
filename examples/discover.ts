/**
 * Supertonic Service Discovery
 * Finds instances of Supertonic running on the local network using mDNS
 */

import { createLibp2p } from "libp2p";
import { tcp } from "@libp2p/tcp";
import { yamux } from "@chainsafe/libp2p-yamux";
import { noise } from "@chainsafe/libp2p-noise";
import { mdns } from "@libp2p/mdns";

async function main() {
  console.log("============================================================");
  console.log("Supertonic Discovery Tool");
  console.log("Searching for servers on the local network...");
  console.log("============================================================\n");

  const node = await createLibp2p({
    transports: [tcp()],
    streamMuxers: [yamux()],
    connectionEncrypters: [noise()],
    peerDiscovery: [mdns()],
  });

  await node.start();
  console.log("Local discovery node started. Waiting for peers...\n");

  node.addEventListener("peer:discovery", (event: any) => {
    const peer = event.detail;
    console.log("------------------------------------------------------------");
    console.log(`📡 Discovered Peer!`);
    console.log(`ID: ${peer.id.toString()}`);

    if (peer.multiaddrs && peer.multiaddrs.length > 0) {
      console.log("Addresses:");
      peer.multiaddrs.forEach((addr: any) => {
        const addrStr = addr.toString();
        process.stdout.write(`  - ${addrStr}`);

        // Extract IP if possible
        const ipMatch = addrStr.match(/\/ip4\/([0-9.]+)/);
        if (ipMatch && ipMatch[1] !== "127.0.0.1") {
          process.stdout.write(`  <-- PROBABLE IP: ${ipMatch[1]}`);
        }
        process.stdout.write("\n");
      });

      console.log("\nTo use this server with the client:");
      const firstExternalAddr = peer.multiaddrs.find(
        (a: any) => !a.toString().includes("127.0.0.1"),
      );
      const ip = firstExternalAddr
        ? firstExternalAddr.toString().match(/\/ip4\/([0-9.]+)/)?.[1]
        : "localhost";

      console.log(
        `HTTP Mode: SERVER_URL=http://${ip}:3000 bun run examples/client.ts`,
      );
      console.log(`P2P Mode:  LIBP2P_MODE=true bun run examples/client.ts`);
    }
    console.log(
      "------------------------------------------------------------\n",
    );
  });

  // Keep running for a while
  console.log("(Press Ctrl+C to stop discovery)\n");

  process.on("SIGINT", async () => {
    await node.stop();
    process.exit(0);
  });
}

main().catch(console.error);
