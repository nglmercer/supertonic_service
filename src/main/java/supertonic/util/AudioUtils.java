package supertonic.util;

import javax.sound.sampled.*;
import java.io.*;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;

/**
 * Utility class for audio file operations
 */
public final class AudioUtils {
    
    private AudioUtils() {} // Prevent instantiation
    
    /**
     * Write WAV file from audio data
     */
    public static void writeWavFile(String filename, float[] audioData, int sampleRate) throws IOException {
        byte[] bytes = new byte[audioData.length * 2];
        ByteBuffer buffer = ByteBuffer.wrap(bytes);
        buffer.order(ByteOrder.LITTLE_ENDIAN);
        
        for (float sample : audioData) {
            short val = (short) Math.max(-32768, Math.min(32767, sample * 32767));
            buffer.putShort(val);
        }
        
        ByteArrayInputStream bais = new ByteArrayInputStream(bytes);
        AudioFormat format = new AudioFormat(sampleRate, 16, 1, true, false);
        AudioInputStream ais = new AudioInputStream(bais, format, audioData.length);
        AudioSystem.write(ais, AudioFileFormat.Type.WAVE, new File(filename));
    }
    
    /**
     * Sanitize filename (supports Unicode characters)
     */
    public static String sanitizeFilename(String text, int maxLen) {
        int[] codePoints = text.codePoints().limit(maxLen).toArray();
        StringBuilder result = new StringBuilder();
        for (int codePoint : codePoints) {
            if (Character.isLetterOrDigit(codePoint)) {
                result.appendCodePoint(codePoint);
            } else {
                result.append('_');
            }
        }
        return result.toString();
    }
    
    /**
     * Timer utility for measuring execution time
     */
    public static <T> T timer(String name, java.util.function.Supplier<T> fn) {
        long start = System.currentTimeMillis();
        System.out.println(name + "...");
        T result = fn.get();
        long elapsed = System.currentTimeMillis() - start;
        System.out.printf("  -> %s completed in %.2f sec\n", name, elapsed / 1000.0);
        return result;
    }
}
