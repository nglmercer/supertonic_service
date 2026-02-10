package supertonic.model;

/**
 * Configuration classes for TTS models
 */
public class Config {
    public AEConfig ae;
    public TTLConfig ttl;
    
    public static class AEConfig {
        public int sampleRate;
        public int baseChunkSize;
    }
    
    public static class TTLConfig {
        public int chunkCompressFactor;
        public int latentDim;
    }
}
