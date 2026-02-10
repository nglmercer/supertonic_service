package supertonic.util;

import supertonic.model.*;
import supertonic.processor.TextProcessor;
import supertonic.inference.TextToSpeech;
import ai.onnxruntime.*;

import java.io.File;
import java.io.IOException;
import java.nio.FloatBuffer;
import java.util.List;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Utility class for loading TTS models and voice styles
 */
public final class ModelLoader {
    
    private static final int DEFAULT_STYLE_DIM = 128;
    
    private ModelLoader() {} // Prevent instantiation
    
    /**
     * Load TTS components, auto-downloading models if necessary
     */
    public static TextToSpeech loadTextToSpeech(String onnxDir, boolean useGpu, OrtEnvironment env) 
            throws IOException, OrtException {
        if (useGpu) {
            throw new RuntimeException("GPU mode is not supported yet");
        }
        System.out.println("Using CPU for inference\n");
        
        // Auto-download models if needed
        String cacheDir = ModelDownloader.ensureModelsExist(null);
        String modelDir = ModelDownloader.getOnnxDir(cacheDir);
        
        // Load config
        Config config = loadConfig(cacheDir);
        
        // Create session options
        OrtSession.SessionOptions opts = new OrtSession.SessionOptions();
        
        // Load models - using the new model names from cache
        OrtSession textEncSession = env.createSession(modelDir + "/text_encoder.onnx", opts);
        OrtSession latentDenoiserSession = env.createSession(modelDir + "/latent_denoiser.onnx", opts);
        OrtSession voiceDecoderSession = env.createSession(modelDir + "/voice_decoder.onnx", opts);
        
        // Load text processor with tokenizer
        TextProcessor textProcessor;
        try {
            String tokenizerPath = ModelDownloader.getTokenizerPath(cacheDir);
            textProcessor = new TextProcessor(tokenizerPath);
        } catch (Exception e) {
            throw new IOException("Failed to create TextProcessor", e);
        }
        
        return new TextToSpeech(config, textProcessor, textEncSession, latentDenoiserSession, 
                               voiceDecoderSession);
    }
    
    /**
     * Load voice style from JSON files, or create default style if files don't exist
     */
    public static Style loadVoiceStyle(List<String> voiceStylePaths, boolean verbose, OrtEnvironment env) 
            throws IOException, OrtException {
        // Check if any voice style files exist
        boolean hasStyleFiles = true;
        for (String path : voiceStylePaths) {
            if (!new File(path).exists()) {
                hasStyleFiles = false;
                break;
            }
        }
        
        if (!hasStyleFiles) {
            // Create default neutral style
            if (verbose) {
                System.out.println("Voice style files not found, using default neutral style\n");
            }
            return Style.createDefault(env, voiceStylePaths.size(), DEFAULT_STYLE_DIM);
        }
        
        // Load from files
        int bsz = voiceStylePaths.size();
        
        // Read first file to get dimensions
        ObjectMapper mapper = new ObjectMapper();
        JsonNode firstRoot = mapper.readTree(new File(voiceStylePaths.get(0)));
        
        long[] ttlDims = new long[3];
        for (int i = 0; i < 3; i++) {
            ttlDims[i] = firstRoot.get("style_ttl").get("dims").get(i).asLong();
        }
        long[] dpDims = new long[3];
        for (int i = 0; i < 3; i++) {
            dpDims[i] = firstRoot.get("style_dp").get("dims").get(i).asLong();
        }
        
        long ttlDim1 = ttlDims[1];
        long ttlDim2 = ttlDims[2];
        long dpDim1 = dpDims[1];
        long dpDim2 = dpDims[2];
        
        // Pre-allocate arrays
        int ttlSize = (int) (bsz * ttlDim1 * ttlDim2);
        int dpSize = (int) (bsz * dpDim1 * dpDim2);
        float[] ttlFlat = new float[ttlSize];
        float[] dpFlat = new float[dpSize];
        
        // Fill data
        for (int i = 0; i < bsz; i++) {
            JsonNode root = mapper.readTree(new File(voiceStylePaths.get(i)));
            
            int ttlOffset = (int) (i * ttlDim1 * ttlDim2);
            int idx = 0;
            JsonNode ttlData = root.get("style_ttl").get("data");
            for (JsonNode batch : ttlData) {
                for (JsonNode row : batch) {
                    for (JsonNode val : row) {
                        ttlFlat[ttlOffset + idx++] = (float) val.asDouble();
                    }
                }
            }
            
            int dpOffset = (int) (i * dpDim1 * dpDim2);
            idx = 0;
            JsonNode dpData = root.get("style_dp").get("data");
            for (JsonNode batch : dpData) {
                for (JsonNode row : batch) {
                    for (JsonNode val : row) {
                        dpFlat[dpOffset + idx++] = (float) val.asDouble();
                    }
                }
            }
        }
        
        long[] ttlShape = {bsz, ttlDim1, ttlDim2};
        long[] dpShape = {bsz, dpDim1, dpDim2};
        
        OnnxTensor ttlTensor = OnnxTensor.createTensor(env, FloatBuffer.wrap(ttlFlat), ttlShape);
        OnnxTensor dpTensor = OnnxTensor.createTensor(env, FloatBuffer.wrap(dpFlat), dpShape);
        
        if (verbose) {
            System.out.println("Loaded " + bsz + " voice styles\n");
        }
        
        return new Style(ttlTensor, dpTensor);
    }
    
    private static Config loadConfig(String cacheDir) throws IOException {
        ObjectMapper mapper = new ObjectMapper();
        String configPath = ModelDownloader.getConfigPath(cacheDir);
        JsonNode root = mapper.readTree(new File(configPath));
        
        Config config = new Config();
        config.ae = new Config.AEConfig();
        config.ae.sampleRate = root.get("sampling_rate").asInt();
        config.ae.baseChunkSize = root.get("base_chunk_size").asInt();
        
        config.ttl = new Config.TTLConfig();
        config.ttl.chunkCompressFactor = root.get("chunk_compress_factor").asInt();
        config.ttl.latentDim = root.get("latent_dim").asInt();
        
        return config;
    }
}
