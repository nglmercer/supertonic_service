package supertonic.processor;

import supertonic.model.Languages;

import java.text.Normalizer;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Unicode text processor for TTS preprocessing
 */
public class TextProcessor {
    private final long[] indexer;
    
    public TextProcessor(String unicodeIndexerJsonPath) throws Exception {
        this.indexer = loadJsonLongArray(unicodeIndexerJsonPath);
    }
    
    /**
     * Process a list of texts with their languages
     */
    public TextProcessResult process(List<String> textList, List<String> langList) {
        List<String> processedTexts = new ArrayList<>();
        for (int i = 0; i < textList.size(); i++) {
            processedTexts.add(preprocessText(textList.get(i), langList.get(i)));
        }
        
        // Convert texts to unicode values first
        List<int[]> allUnicodeVals = new ArrayList<>();
        for (String text : processedTexts) {
            allUnicodeVals.add(textToUnicodeValues(text));
        }
        
        int[] textIdsLengths = new int[processedTexts.size()];
        int maxLen = 0;
        for (int i = 0; i < allUnicodeVals.size(); i++) {
            textIdsLengths[i] = allUnicodeVals.get(i).length;
            maxLen = Math.max(maxLen, textIdsLengths[i]);
        }
        
        long[][] textIds = new long[processedTexts.size()][maxLen];
        for (int i = 0; i < allUnicodeVals.size(); i++) {
            int[] unicodeVals = allUnicodeVals.get(i);
            for (int j = 0; j < unicodeVals.length; j++) {
                textIds[i][j] = indexer[unicodeVals[j]];
            }
        }
        
        float[][][] textMask = getTextMask(textIdsLengths);
        return new TextProcessResult(textIds, textMask);
    }
    
    private String removeEmojis(String text) {
        StringBuilder result = new StringBuilder();
        for (int i = 0; i < text.length(); i++) {
            int codePoint;
            if (Character.isHighSurrogate(text.charAt(i)) && i + 1 < text.length() && Character.isLowSurrogate(text.charAt(i + 1))) {
                codePoint = Character.codePointAt(text, i);
                i++; // Skip the low surrogate
            } else {
                codePoint = text.charAt(i);
            }
            
            // Check if code point is in emoji ranges
            boolean isEmoji = (codePoint >= 0x1F600 && codePoint <= 0x1F64F) ||
                              (codePoint >= 0x1F300 && codePoint <= 0x1F5FF) ||
                              (codePoint >= 0x1F680 && codePoint <= 0x1F6FF) ||
                              (codePoint >= 0x1F700 && codePoint <= 0x1F77F) ||
                              (codePoint >= 0x1F780 && codePoint <= 0x1F7FF) ||
                              (codePoint >= 0x1F800 && codePoint <= 0x1F8FF) ||
                              (codePoint >= 0x1F900 && codePoint <= 0x1F9FF) ||
                              (codePoint >= 0x1FA00 && codePoint <= 0x1FA6F) ||
                              (codePoint >= 0x1FA70 && codePoint <= 0x1FAFF) ||
                              (codePoint >= 0x2600 && codePoint <= 0x26FF) ||
                              (codePoint >= 0x2700 && codePoint <= 0x27BF) ||
                              (codePoint >= 0x1F1E6 && codePoint <= 0x1F1FF);
            
            if (!isEmoji) {
                if (codePoint > 0xFFFF) {
                    result.append(Character.toChars(codePoint));
                } else {
                    result.append((char) codePoint);
                }
            }
        }
        return result.toString();
    }
    
    private String preprocessText(String text, String lang) {
        text = Normalizer.normalize(text, Normalizer.Form.NFKD);
        text = removeEmojis(text);
        
        Map<String, String> replacements = new HashMap<>();
        replacements.put("–", "-");
        replacements.put("‑", "-");
        replacements.put("—", "-");
        replacements.put("_", " ");
        replacements.put("\u201C", "\"");
        replacements.put("\u201D", "\"");
        replacements.put("\u2018", "'");
        replacements.put("\u2019", "'");
        replacements.put("´", "'");
        replacements.put("`", "'");
        replacements.put("[", " ");
        replacements.put("]", " ");
        replacements.put("|", " ");
        replacements.put("/", " ");
        replacements.put("#", " ");
        replacements.put("→", " ");
        replacements.put("←", " ");
        
        for (Map.Entry<String, String> entry : replacements.entrySet()) {
            text = text.replace(entry.getKey(), entry.getValue());
        }
        
        text = text.replaceAll("[♥☆♡©\\\\]", "");
        
        Map<String, String> exprReplacements = new HashMap<>();
        exprReplacements.put("@", " at ");
        exprReplacements.put("e.g.,", "for example, ");
        exprReplacements.put("i.e.,", "that is, ");
        
        for (Map.Entry<String, String> entry : exprReplacements.entrySet()) {
            text = text.replace(entry.getKey(), entry.getValue());
        }
        
        text = text.replaceAll(" ,", ",");
        text = text.replaceAll(" \\.", ".");
        text = text.replaceAll(" !", "!");
        text = text.replaceAll(" \\?", "?");
        text = text.replaceAll(" ;", ";");
        text = text.replaceAll(" :", ":");
        text = text.replaceAll(" '", "'");
        
        while (text.contains("\"\"")) {
            text = text.replace("\"\"", "\"");
        }
        while (text.contains("''")) {
            text = text.replace("''", "'");
        }
        while (text.contains("``")) {
            text = text.replace("``", "`");
        }
        
        text = text.replaceAll("\\s+", " ").trim();
        
        if (!text.matches(".*[.!?;:,'\"\\u201C\\u201D\\u2018\\u2019)\\]}…。」』】〉》›»]$")) {
            text += ".";
        }
        
        if (!Languages.isValid(lang)) {
            throw new IllegalArgumentException("Invalid language: " + lang + ". Available: " + Languages.AVAILABLE);
        }
        
        text = "<" + lang + ">" + text + "</" + lang + ">";
        
        return text;
    }
    
    private int[] textToUnicodeValues(String text) {
        return text.codePoints().toArray();
    }
    
    private float[][][] getTextMask(int[] lengths) {
        int bsz = lengths.length;
        int maxLen = 0;
        for (int len : lengths) {
            maxLen = Math.max(maxLen, len);
        }
        
        float[][][] mask = new float[bsz][1][maxLen];
        for (int i = 0; i < bsz; i++) {
            for (int j = 0; j < maxLen; j++) {
                mask[i][0][j] = j < lengths[i] ? 1.0f : 0.0f;
            }
        }
        return mask;
    }
    
    private long[] loadJsonLongArray(String filePath) throws Exception {
        // Simplified JSON parsing - in production use Jackson
        String content = new String(java.nio.file.Files.readAllBytes(
            java.nio.file.Paths.get(filePath)));
        String[] parts = content.replaceAll("[\\[\\]]", "").split(",");
        long[] result = new long[parts.length];
        for (int i = 0; i < parts.length; i++) {
            result[i] = Long.parseLong(parts[i].trim());
        }
        return result;
    }
    
    public static class TextProcessResult {
        public final long[][] textIds;
        public final float[][][] textMask;
        
        public TextProcessResult(long[][] textIds, float[][][] textMask) {
            this.textIds = textIds;
            this.textMask = textMask;
        }
    }
}
