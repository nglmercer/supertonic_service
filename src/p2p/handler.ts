import type { NetworkStream } from './node.js';
import { processTTSRequest } from '../tts/processor.js';
import type { TTSRequest, TTSResponse } from '../tts/types.js';

export async function p2pProtocolHandler(stream: NetworkStream) {
    try {
        // Read request: accumulate data until newline
        let buffer = Buffer.alloc(0);
        let requestText: string | null = null;
        
        while (true) {
            const chunk = await stream.read();
            if (chunk === null) break; // EOF
            
            buffer = Buffer.concat([buffer, Buffer.from(chunk)]);
            const newlineIndex = buffer.indexOf(10); // '\n'
            
            if (newlineIndex !== -1) {
                requestText = buffer.toString('utf8', 0, newlineIndex);
                break;
            }
        }
        
        if (!requestText) {
            await stream.write(Buffer.from(JSON.stringify({ success: false, error: 'Invalid request' }) + '\n'));
            stream.close();
            return;
        }

        try {
            const request = JSON.parse(requestText) as TTSRequest;
            const response = await processTTSRequest(request);
            
            // Add libp2p status if health check
            if (request.method === 'health' && response.success && 'status' in response.result) {
                response.result.libp2p = 'enabled';
            }

            // Write response as JSON with newline
            const responseBuffer = Buffer.from(JSON.stringify(response) + '\n');
            await stream.write(responseBuffer);
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Internal Server Error';
            const errorResponse: TTSResponse = {
                success: false,
                error: errorMessage
            };
            await stream.write(Buffer.from(JSON.stringify(errorResponse) + '\n'));
        } finally {
            stream.close();
        }
    } catch (error) {
        console.error('Error handling libp2p TTS protocol:', error);
    }
}
