package supertonic.processor;

import supertonic.model.Languages;

import java.text.Normalizer;
import java.util.*;
import java.nio.file.Files;
import java.nio.file.Paths;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Unicode text processor for TTS preprocessing
 */
public class TextProcessor {
    private final Map<Integer, Long> vocabMap; // unicode codepoint -> token id
    private final long unkToken;
    
    public TextProcessor(String tokenizerJsonPath) throws Exception {
        ObjectMapper mapper = new ObjectMapper();
        JsonNode root = mapper.readTree(Files.readAllBytes(Paths.get(tokenizerJsonPath)));
        
        // Parse vocab from HuggingFace tokenizer format
        this.vocabMap = new HashMap<>();
        JsonNode vocabNode = root.get("model").get("vocab");
        
        Iterator<Map.Entry<String, JsonNode>> fields = vocabNode.fields();
        while (fields.hasNext()) {
            Map.Entry<String, JsonNode> entry = fields.next();
            String token = entry.getKey();
            long tokenId = entry.getValue().asLong();
            
            // Map each character in the token to its ID
            // For single-character tokens (which is typical for character-level tokenizers)
            if (token.length() == 1) {
                vocabMap.put((int) token.charAt(0), tokenId);
            } else {
                // For multi-character tokens, map the first codepoint
                int codePoint = token.codePointAt(0);
                vocabMap.put(codePoint, tokenId);
            }
        }
        
        // UNK token is typically the vocab size or a specific token
        this.unkToken = vocabMap.size();
        
        System.out.println("Loaded tokenizer with " + vocabMap.size() + " tokens");
    }
    
    /**
     * Process a list of texts with their languages
     */
    public TextProcessResult process(List<String> textList, List<String> langList) {
        List<String> processedTexts = new ArrayList<>();
        for (int i = 0; i < textList.size(); i++) {
            processedTexts.add(preprocessText(textList.get(i), langList.get(i)));
        }
        
        // Convert texts to token IDs
        List<long[]> allTokenIds = new ArrayList<>();
        int[] textIdsLengths = new int[processedTexts.size()];
        int maxLen = 0;
        
        for (int i = 0; i < processedTexts.size(); i++) {
            long[] tokenIds = textToTokenIds(processedTexts.get(i));
            allTokenIds.add(tokenIds);
            textIdsLengths[i] = tokenIds.length;
            maxLen = Math.max(maxLen, tokenIds.length);
        }
        
        // Pad to max length
        long[][] textIds = new long[processedTexts.size()][maxLen];
        for (int i = 0; i < allTokenIds.size(); i++) {
            long[] tokenIds = allTokenIds.get(i);
            for (int j = 0; j < tokenIds.length; j++) {
                textIds[i][j] = tokenIds[j];
            }
            // Pad with 0s (or could use unkToken)
            for (int j = tokenIds.length; j < maxLen; j++) {
                textIds[i][j] = 0;
            }
        }
        
        long[][] textMask = getTextMask(textIdsLengths);
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
    
    private long[] textToTokenIds(String text) {
        // Convert text to token IDs using the vocabulary
        int[] codePoints = text.codePoints().toArray();
        long[] tokenIds = new long[codePoints.length];
        
        for (int i = 0; i < codePoints.length; i++) {
            Long tokenId = vocabMap.get(codePoints[i]);
            if (tokenId != null) {
                tokenIds[i] = tokenId;
            } else {
                // Use UNK token for unknown characters
                tokenIds[i] = unkToken;
            }
        }
        
        return tokenIds;
    }
    
    private long[][] getTextMask(int[] lengths) {
        int bsz = lengths.length;
        int maxLen = 0;
        for (int len : lengths) {
            maxLen = Math.max(maxLen, len);
        }
        
        long[][] mask = new long[bsz][maxLen];
        for (int i = 0; i < bsz; i++) {
            for (int j = 0; j < maxLen; j++) {
                mask[i][j] = j < lengths[i] ? 1L : 0L;
            }
        }
        return mask;
    }
    
    public static class TextProcessResult {
        public final long[][] textIds;
        public final long[][] textMask;
        
        public TextProcessResult(long[][] textIds, long[][] textMask) {
            this.textIds = textIds;
            this.textMask = textMask;
        }
    }
}
