import * as fs from 'fs';
import * as path from 'path';
import { sanitizeFilename } from './utils.js';

export interface FileHandlerOptions {
    outputDir: string;
}

/**
 * FileHandler - Handles audio file writing operations
 */
export class FileHandler {
    private outputDir: string;

    constructor(options: FileHandlerOptions) {
        this.outputDir = options.outputDir;
        
        // Ensure output directory exists
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }
    }

    /**
     * Write audio buffer to file
     * @param fileBuffer Audio buffer to write
     * @param filename Base filename for the output
     * @returns Full path to the saved file
     */
    async writeAudioFile(fileBuffer: Buffer, filename: string): Promise<string> {
        const safeFilename = sanitizeFilename(filename);
        const timestamp = Date.now();
        const outputPath = path.join(this.outputDir, `${safeFilename}_${timestamp}.wav`);
        
        await fs.promises.writeFile(outputPath, fileBuffer);
        
        return outputPath;
    }

    /**
     * Get the output directory path
     */
    getOutputDir(): string {
        return this.outputDir;
    }

    /**
     * Check if output directory exists
     */
    directoryExists(): boolean {
        return fs.existsSync(this.outputDir);
    }
}
