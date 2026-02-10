package supertonic.model;

import java.util.Arrays;
import java.util.List;

/**
 * Available languages for multilingual TTS
 */
public final class Languages {
    public static final List<String> AVAILABLE = Arrays.asList("en", "ko", "es", "pt", "fr");
    
    private Languages() {} // Prevent instantiation
    
    public static boolean isValid(String lang) {
        return AVAILABLE.contains(lang);
    }
}
