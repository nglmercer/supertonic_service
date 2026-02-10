package supertonic.util;

import supertonic.model.*;
import supertonic.processor.TextProcessor;
import supertonic.inference.TextToSpeech;
import ai.onnxruntime.*;

import java.io.File;
import java.io.IOException;
import java.nio.FloatBuffer;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Utility class for loading TTS models and voice styles
 */
public final class ModelLoader {
    
    private ModelLoader() {} // Prevent instantiation
    
    /**
     * Load TTS components from ONNX directory
     */
    public static TextToSpeech loadTextToSpeech(String onnxDir, boolean useGpu, OrtEnvironment env) 
            throws IOException, OrtException {
        if (useGpu) {
            throw new RuntimeException("GPU mode is not supported yet");
        }
        System.out.println("Using CPU for inference\n");
        
        // Load config
        Config config = loadConfig(onnxDir);
        
        // Create session options
        OrtSession.SessionOptions opts = new OrtSession.SessionOptions();
        
        // Load models
        OrtSession dpSession = env.createSession(onnxDir + "/duration_predictor.onnx", opts);
        OrtSession textEncSession = env.createSession(onnxDir + "/text_encoder.onnx", opts);
        OrtSession vectorEstSession = env.createSession(onnxDir + "/vector_estimator.onnx", opts);
        OrtSession vocoderSession = env.createSession(onnxDir + "/vocoder.onnx", opts);
        
        // Load text processor
        TextProcessor textProcessor;
        try {
            textProcessor = new TextProcessor(onnxDir + "/unicode_indexer.json");
        } catch (Exception e) {
            throw new IOException("Failed to create TextProcessor", e);
        }
        
        return new TextToSpeech(config, textProcessor, dpSession, textEncSession, 
                               vectorEstSession, vocoderSession);
    }
    
    /**
     * Load voice style from JSON files
     */
    public static Style loadVoiceStyle(java.util.List<String> voiceStylePaths, boolean verbose, OrtEnvironment env) 
            throws IOException, OrtException {
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
    
    private static Config loadConfig(String onnxDir) throws IOException {
        ObjectMapper mapper = new ObjectMapper();
        JsonNode root = mapper.readTree(new File(onnxDir + "/tts.json"));
        
        Config config = new Config();
        config.ae = new Config.AEConfig();
        config.ae.sampleRate = root.get("ae").get("sample_rate").asInt();
        config.ae.baseChunkSize = root.get("ae").get("base_chunk_size").asInt();
        
        config.ttl = new Config.TTLConfig();
        config.ttl.chunkCompressFactor = root.get("ttl").get("chunk_compress_factor").asInt();
        config.ttl.latentDim = root.get("ttl").get("latent_dim").asInt();
        
        return config;
    }
}
