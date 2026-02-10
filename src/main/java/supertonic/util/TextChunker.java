package supertonic.util;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.regex.Pattern;

/**
 * Utility for chunking long text into manageable segments
 */
public final class TextChunker {
    private static final int MAX_CHUNK_LENGTH = 300;
    private static final String[] ABBREVIATIONS = {
        "Dr.", "Mr.", "Mrs.", "Ms.", "Prof.", "Sr.", "Jr.",
        "St.", "Ave.", "Rd.", "Blvd.", "Dept.", "Inc.", "Ltd.",
        "Co.", "Corp.", "etc.", "vs.", "i.e.", "e.g.", "Ph.D."
    };
    
    private TextChunker() {} // Prevent instantiation
    
    /**
     * Chunk text into smaller segments based on paragraphs and sentences
     */
    public static List<String> chunkText(String text, int maxLen) {
        if (maxLen == 0) {
            maxLen = MAX_CHUNK_LENGTH;
        }
        
        text = text.trim();
        if (text.isEmpty()) {
            return Arrays.asList("");
        }
        
        // Split by paragraphs
        String[] paragraphs = text.split("\\n\\s*\\n");
        List<String> chunks = new ArrayList<>();
        
        for (String para : paragraphs) {
            para = para.trim();
            if (para.isEmpty()) {
                continue;
            }
            
            if (para.length() <= maxLen) {
                chunks.add(para);
                continue;
            }
            
            // Split by sentences
            List<String> sentences = splitSentences(para);
            StringBuilder current = new StringBuilder();
            int currentLen = 0;
            
            for (String sentence : sentences) {
                sentence = sentence.trim();
                if (sentence.isEmpty()) {
                    continue;
                }
                
                int sentenceLen = sentence.length();
                if (sentenceLen > maxLen) {
                    if (current.length() > 0) {
                        chunks.add(current.toString().trim());
                        current.setLength(0);
                        currentLen = 0;
                    }
                    
                    // Split by comma
                    String[] parts = sentence.split(",");
                    for (String part : parts) {
                        part = part.trim();
                        if (part.isEmpty()) {
                            continue;
                        }
                        
                        int partLen = part.length();
                        if (partLen > maxLen) {
                            // Split by space
                            String[] words = part.split("\\s+");
                            StringBuilder wordChunk = new StringBuilder();
                            int wordChunkLen = 0;
                            
                            for (String word : words) {
                                int wordLen = word.length();
                                if (wordChunkLen + wordLen + 1 > maxLen && wordChunk.length() > 0) {
                                    chunks.add(wordChunk.toString().trim());
                                    wordChunk.setLength(0);
                                    wordChunkLen = 0;
                                }
                                
                                if (wordChunk.length() > 0) {
                                    wordChunk.append(" ");
                                    wordChunkLen++;
                                }
                                wordChunk.append(word);
                                wordChunkLen += wordLen;
                            }
                            
                            if (wordChunk.length() > 0) {
                                chunks.add(wordChunk.toString().trim());
                            }
                        } else {
                            if (currentLen + partLen + 1 > maxLen && current.length() > 0) {
                                chunks.add(current.toString().trim());
                                current.setLength(0);
                                currentLen = 0;
                            }
                            
                            if (current.length() > 0) {
                                current.append(", ");
                                currentLen += 2;
                            }
                            current.append(part);
                            currentLen += partLen;
                        }
                    }
                    continue;
                }
                
                if (currentLen + sentenceLen + 1 > maxLen && current.length() > 0) {
                    chunks.add(current.toString().trim());
                    current.setLength(0);
                    currentLen = 0;
                }
                
                if (current.length() > 0) {
                    current.append(" ");
                    currentLen++;
                }
                current.append(sentence);
                currentLen += sentenceLen;
            }
            
            if (current.length() > 0) {
                chunks.add(current.toString().trim());
            }
        }
        
        if (chunks.isEmpty()) {
            return Arrays.asList("");
        }
        
        return chunks;
    }
    
    /**
     * Split text into sentences, avoiding common abbreviations
     */
    private static List<String> splitSentences(String text) {
        StringBuilder abbrevPattern = new StringBuilder();
        for (int i = 0; i < ABBREVIATIONS.length; i++) {
            if (i > 0) abbrevPattern.append("|");
            abbrevPattern.append(Pattern.quote(ABBREVIATIONS[i]));
        }
        
        String patternStr = "(?<!(?:" + abbrevPattern.toString() + "))(?<=[.!?])\\s+";
        Pattern pattern = Pattern.compile(patternStr);
        return Arrays.asList(pattern.split(text));
    }
}
