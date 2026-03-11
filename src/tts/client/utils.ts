/**
 * Client Utilities
 * Shared utilities for TTS client operations
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

import { DEFAULTS, ENV_VARS } from '../constants.js';

/**
 * Save base64-encoded audio data to a file
 * @param base64Data - Base64 encoded audio data
 * @param filename - Base filename (without extension)
 * @param outputDir - Output directory (defaults to DEFAULT_CLIENT_OUTPUT_DIR)
 * @returns Full path to the saved file
 */
export function saveAudioFile(
    base64Data: string, 
    filename: string, 
    outputDir?: string
): string {
    const dir = outputDir || process.env[ENV_VARS.OUTPUT_DIR] || DEFAULTS.DEFAULT_CLIENT_OUTPUT_DIR;

    // Ensure output directory exists
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }

    // Decode base64 to buffer
    const buffer = Buffer.from(base64Data, 'base64');

    // Generate unique filename with timestamp
    const timestamp = Date.now();
    const fullPath = join(dir, `${filename}_${timestamp}.wav`);

    // Write file
    writeFileSync(fullPath, buffer);

    return fullPath;
}

/**
 * Get client configuration from environment variables
 */
export interface ClientConfig {
    serverUrl: string;
    libp2pServer: string | undefined;
    libp2pMode: boolean;
    outputDir: string;
}

export function getClientConfig(): ClientConfig {
    return {
        serverUrl: process.env[ENV_VARS.SERVER_URL] || DEFAULTS.DEFAULT_SERVER_URL,
        libp2pServer: process.env[ENV_VARS.LIBP2P_SERVER],
        libp2pMode: process.env[ENV_VARS.LIBP2P_MODE] === 'true' || process.env[ENV_VARS.LIBP2P_SERVER] !== undefined,
        outputDir: process.env[ENV_VARS.OUTPUT_DIR] || DEFAULTS.DEFAULT_CLIENT_OUTPUT_DIR,
    };
}

/**
 * Generic client interface that both HTTP and Libp2p clients implement
 */
export interface TTSClientInterface {
    call<M extends string>(
        method: M,
        params: unknown
    ): Promise<unknown>;
    close(): Promise<void>;
}
