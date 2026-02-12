package supertonic.inference;

import supertonic.model.*;
import supertonic.processor.TextProcessor;
import supertonic.util.TextChunker;
import ai.onnxruntime.*;

import java.util.*;
import java.nio.FloatBuffer;
import java.nio.LongBuffer;

/**
 * Text-to-Speech inference class using ONNX Runtime
 * 
 * Uses 3 ONNX models:
 * - text_encoder: Encodes text tokens to embeddings
 * - latent_denoiser: Denoises latent representations (diffusion model)
 * - voice_decoder: Decodes latent representations to audio
 * 
 * Memory optimized version with proper resource management.
 */
public class TextToSpeech implements AutoCloseable {
    private final Config config;
    private final TextProcessor textProcessor;
    private final OrtSession textEncSession;
    private final OrtSession latentDenoiserSession;
    private final OrtSession voiceDecoderSession;
    
    public final int sampleRate;
    private final int baseChunkSize;
    private final int chunkCompress;
    private final int ldim;
    
    public TextToSpeech(Config config, TextProcessor textProcessor,
                        OrtSession textEncSession, OrtSession latentDenoiserSession,
                        OrtSession voiceDecoderSession) {
        this.config = config;
        this.textProcessor = textProcessor;
        this.textEncSession = textEncSession;
        this.latentDenoiserSession = latentDenoiserSession;
        this.voiceDecoderSession = voiceDecoderSession;
        this.sampleRate = config.ae.sampleRate;
        this.baseChunkSize = config.ae.baseChunkSize;
        this.chunkCompress = config.ttl.chunkCompressFactor;
        this.ldim = config.ttl.latentDim;
    }
    
    /**
     * Main inference method for batch processing
     * Memory optimized: all tensors are properly closed in finally blocks
     */
    public Result infer(List<String> textList, List<String> langList, Style style, 
                        int totalStep, float speed, OrtEnvironment env) throws Exception {
        int bsz = textList.size();
        
        // Process text
        TextProcessor.TextProcessResult textResult = textProcessor.process(textList, langList);
        long[][] textIds = textResult.textIds;
        long[][] textMask = textResult.textMask;
        
        OnnxTensor textIdsTensor = null;
        OnnxTensor textMaskTensor = null;
        OrtSession.Result textEncResult = null;
        OnnxTensor textEmbTensor = null;
        OnnxTensor totalStepTensor = null;
        OnnxTensor finalLatentTensor = null;
        OrtSession.Result decoderResult = null;
        
        try {
            // Create tensors
            textIdsTensor = createLongTensor(textIds, env);
            textMaskTensor = createLongTensor(textMask, env);
            
            // Text encoding
            Map<String, OnnxTensor> textEncInputs = new HashMap<>();
            textEncInputs.put("input_ids", textIdsTensor);
            textEncInputs.put("attention_mask", textMaskTensor);
            textEncInputs.put("style", style.ttlTensor);
            
            textEncResult = textEncSession.run(textEncInputs);
            
            // Get text embeddings from encoder - clone to keep reference after closing result
            textEmbTensor = (OnnxTensor) textEncResult.get(0);
            
            // Estimate duration from text mask
            float[] duration = new float[bsz];
            for (int i = 0; i < bsz; i++) {
                int len = 0;
                for (int j = 0; j < textMask[i].length; j++) {
                    if (textMask[i][j] > 0) len++;
                }
                duration[i] = len / speed;
            }
            
            // Sample noisy latent
            NoisyLatentResult noisyLatentResult = sampleNoisyLatent(duration);
            float[][][] xt = noisyLatentResult.noisyLatent;
            long[][] latentMask = noisyLatentResult.latentMask;
            
            // Prepare constant tensor for diffusion
            float[] totalStepArray = new float[bsz];
            Arrays.fill(totalStepArray, (float) totalStep);
            totalStepTensor = OnnxTensor.createTensor(env, FloatBuffer.wrap(totalStepArray), new long[]{bsz});
            
            // Denoising loop (diffusion process) - memory optimized
            xt = runDenoisingLoop(xt, textEmbTensor, latentMask, textMask, style, 
                                  totalStepTensor, totalStep, bsz, env);
            
            // Voice decoder - convert latent to audio
            finalLatentTensor = createFloatTensor(xt, env);
            Map<String, OnnxTensor> decoderInputs = new HashMap<>();
            decoderInputs.put("latent", finalLatentTensor);
            
            decoderResult = voiceDecoderSession.run(decoderInputs);
            float[][] wavBatch = (float[][]) decoderResult.get(0).getValue();
            
            // Flatten audio using pre-calculated size
            float[] wav = flattenAudio(wavBatch);
            
            // Clear references to help GC
            xt = null;
            wavBatch = null;
            noisyLatentResult = null;
            
            return new Result(wav, duration);
            
        } finally {
            // Close all tensors in reverse order of creation
            closeQuietly(decoderResult);
            closeQuietly(finalLatentTensor);
            closeQuietly(totalStepTensor);
            closeQuietly(textEncResult);
            // Note: textEmbTensor is part of textEncResult, don't close separately
            closeQuietly(textMaskTensor);
            closeQuietly(textIdsTensor);
        }
    }
    
    /**
     * Run the denoising loop with proper memory management
     */
    private float[][][] runDenoisingLoop(float[][][] xt, OnnxTensor textEmbTensor,
                                         long[][] latentMask, long[][] textMask,
                                         Style style, OnnxTensor totalStepTensor,
                                         int totalStep, int bsz, OrtEnvironment env) throws Exception {
        
        OnnxTensor currentStepTensor = null;
        OnnxTensor noisyLatentTensor = null;
        OnnxTensor latentMaskTensor = null;
        OnnxTensor textMaskTensor2 = null;
        OrtSession.Result denoiserResult = null;
        
        try {
            // Pre-create reusable mask tensors outside loop if dimensions don't change
            latentMaskTensor = createLongTensor2D(latentMask, env);
            textMaskTensor2 = createLongTensor(textMask, env);
            
            float[] currentStepArray = new float[bsz];
            
            for (int step = 0; step < totalStep; step++) {
                // Reuse array instead of creating new one each iteration
                Arrays.fill(currentStepArray, (float) step);
                currentStepTensor = OnnxTensor.createTensor(env, FloatBuffer.wrap(currentStepArray), new long[]{bsz});
                noisyLatentTensor = createFloatTensor(xt, env);
                
                Map<String, OnnxTensor> denoiserInputs = new HashMap<>();
                denoiserInputs.put("noisy_latents", noisyLatentTensor);
                denoiserInputs.put("encoder_outputs", textEmbTensor);
                denoiserInputs.put("latent_mask", latentMaskTensor);
                denoiserInputs.put("attention_mask", textMaskTensor2);
                denoiserInputs.put("timestep", currentStepTensor);
                denoiserInputs.put("num_inference_steps", totalStepTensor);
                denoiserInputs.put("style", style.ttlTensor);
                
                denoiserResult = latentDenoiserSession.run(denoiserInputs);
                float[][][] denoised = (float[][][]) denoiserResult.get(0).getValue();
                
                // Update xt reference
                xt = denoised;
                
                // Close tensors immediately after use
                currentStepTensor.close();
                currentStepTensor = null;
                noisyLatentTensor.close();
                noisyLatentTensor = null;
                denoiserResult.close();
                denoiserResult = null;
                
                // Suggest GC periodically during long denoising loops
                if (step % 10 == 0) {
                    System.gc();
                }
            }
            
            return xt;
            
        } finally {
            // Clean up any remaining resources
            closeQuietly(denoiserResult);
            closeQuietly(noisyLatentTensor);
            closeQuietly(currentStepTensor);
            closeQuietly(textMaskTensor2);
            closeQuietly(latentMaskTensor);
        }
    }
    
    /**
     * Single text synthesis with automatic chunking
     * Memory optimized: uses primitive float arrays and pre-calculated sizes
     */
    public Result synthesize(String text, String lang, Style style, 
                            int totalStep, float speed, float silenceDuration, 
                            OrtEnvironment env) throws Exception {
        int maxLen = lang.equals("ko") ? 120 : 300;
        List<String> chunks = TextChunker.chunkText(text, maxLen);
        
        // Pre-calculate total size to avoid ArrayList boxing overhead
        // First pass: estimate total samples needed
        int estimatedSamples = estimateTotalSamples(chunks, lang, speed, silenceDuration);
        
        // Use pre-allocated float array with growth buffer
        float[] wavConcat = new float[estimatedSamples];
        int currentPos = 0;
        float totalDuration = 0.0f;
        int silenceSamples = (int) (silenceDuration * sampleRate);
        
        for (int i = 0; i < chunks.size(); i++) {
            // Force GC between chunks to free memory from previous inference
            if (i > 0) {
                System.gc();
                Thread.sleep(10); // Brief pause to allow GC to run
            }
            
            Result result = infer(Arrays.asList(chunks.get(i)), Arrays.asList(lang), 
                                 style, totalStep, speed, env);
            
            try {
                float dur = result.duration[0];
                int wavLen = Math.min((int) (sampleRate * dur), result.wav.length);
                
                // Ensure array has enough capacity
                int neededSize = currentPos + wavLen;
                if (i > 0) {
                    neededSize += silenceSamples;
                }
                
                if (neededSize > wavConcat.length) {
                    wavConcat = growArray(wavConcat, neededSize);
                }
                
                // Add silence between chunks (not before first chunk)
                if (i > 0) {
                    // Silence is already zeros in Java, just advance position
                    currentPos += silenceSamples;
                    totalDuration += silenceDuration;
                }
                
                // Copy audio data
                System.arraycopy(result.wav, 0, wavConcat, currentPos, wavLen);
                currentPos += wavLen;
                totalDuration += dur;
                
            } finally {
                // Clear result reference to help GC
                result = null;
            }
        }
        
        // Trim array to actual size
        float[] finalWav = new float[currentPos];
        System.arraycopy(wavConcat, 0, finalWav, 0, currentPos);
        
        return new Result(finalWav, new float[]{totalDuration});
    }
    
    /**
     * Estimate total samples needed for pre-allocation
     */
    private int estimateTotalSamples(List<String> chunks, String lang, float speed, float silenceDuration) {
        // Rough estimate: ~100 samples per character at normal speed
        int samplesPerChar = (int) (sampleRate * 0.1f / speed);
        int totalChars = 0;
        for (String chunk : chunks) {
            totalChars += chunk.length();
        }
        int silenceSamples = (int) (silenceDuration * sampleRate) * (chunks.size() - 1);
        return totalChars * samplesPerChar + silenceSamples + sampleRate; // Add 1 second buffer
    }
    
    /**
     * Grow array capacity when needed
     */
    private float[] growArray(float[] original, int minSize) {
        int newSize = Math.max(minSize, (int) (original.length * 1.5f));
        float[] grown = new float[newSize];
        System.arraycopy(original, 0, grown, 0, original.length);
        return grown;
    }
    
    /**
     * Flatten 2D audio batch to 1D array efficiently
     */
    private float[] flattenAudio(float[][] wavBatch) {
        int totalSamples = 0;
        for (float[] w : wavBatch) {
            totalSamples += w.length;
        }
        
        float[] wav = new float[totalSamples];
        int offset = 0;
        for (float[] w : wavBatch) {
            System.arraycopy(w, 0, wav, offset, w.length);
            offset += w.length;
        }
        return wav;
    }
    
    private NoisyLatentResult sampleNoisyLatent(float[] duration) {
        int bsz = duration.length;
        float maxDur = 0;
        for (float d : duration) {
            maxDur = Math.max(maxDur, d);
        }
        
        int latentLen = (int) (maxDur * sampleRate / chunkCompress);
        latentLen = Math.max(latentLen, 1);
        
        // The model expects latent dimension of 144 (not 24 from config)
        int latentDim = 144;
        
        // Initialize with random noise using direct allocation
        Random rand = new Random();
        float[][][] noisyLatent = new float[bsz][latentDim][latentLen];
        for (int i = 0; i < bsz; i++) {
            for (int j = 0; j < latentDim; j++) {
                for (int k = 0; k < latentLen; k++) {
                    noisyLatent[i][j][k] = (float) (rand.nextGaussian() * 0.5);
                }
            }
        }
        
        // Create latent mask
        long[][] latentMask = new long[bsz][latentLen];
        for (int i = 0; i < bsz; i++) {
            int len = Math.min((int) (duration[i] * sampleRate / chunkCompress), latentLen);
            for (int j = 0; j < latentLen; j++) {
                latentMask[i][j] = j < len ? 1L : 0L;
            }
        }
        
        return new NoisyLatentResult(noisyLatent, latentMask);
    }
    
    private OnnxTensor createFloatTensor(float[][][] array, OrtEnvironment env) throws OrtException {
        int dim0 = array.length;
        int dim1 = array[0].length;
        int dim2 = array[0][0].length;
        
        float[] flat = new float[dim0 * dim1 * dim2];
        int idx = 0;
        for (int i = 0; i < dim0; i++) {
            for (int j = 0; j < dim1; j++) {
                for (int k = 0; k < dim2; k++) {
                    flat[idx++] = array[i][j][k];
                }
            }
        }
        
        long[] shape = {dim0, dim1, dim2};
        return OnnxTensor.createTensor(env, FloatBuffer.wrap(flat), shape);
    }
    
    private OnnxTensor createLongTensor(long[][] array, OrtEnvironment env) throws OrtException {
        int dim0 = array.length;
        int dim1 = array[0].length;
        
        long[] flat = new long[dim0 * dim1];
        int idx = 0;
        for (int i = 0; i < dim0; i++) {
            for (int j = 0; j < dim1; j++) {
                flat[idx++] = array[i][j];
            }
        }
        
        long[] shape = {dim0, dim1};
        return OnnxTensor.createTensor(env, LongBuffer.wrap(flat), shape);
    }
    
    private OnnxTensor createLongTensor2D(long[][] array, OrtEnvironment env) throws OrtException {
        int dim0 = array.length;
        int dim1 = array[0].length;
        
        long[] flat = new long[dim0 * dim1];
        int idx = 0;
        for (int i = 0; i < dim0; i++) {
            for (int j = 0; j < dim1; j++) {
                flat[idx++] = array[i][j];
            }
        }
        
        long[] shape = {dim0, dim1};
        return OnnxTensor.createTensor(env, LongBuffer.wrap(flat), shape);
    }
    
    /**
     * Close a resource quietly (without throwing exceptions)
     */
    private void closeQuietly(AutoCloseable resource) {
        if (resource != null) {
            try {
                resource.close();
            } catch (Exception e) {
                // Log but don't throw
                System.err.println("Warning: Error closing resource: " + e.getMessage());
            }
        }
    }
    
    @Override
    public void close() throws Exception {
        closeQuietly(textEncSession);
        closeQuietly(latentDenoiserSession);
        closeQuietly(voiceDecoderSession);
    }
    
    private static class NoisyLatentResult {
        final float[][][] noisyLatent;
        final long[][] latentMask;
        
        NoisyLatentResult(float[][][] noisyLatent, long[][] latentMask) {
            this.noisyLatent = noisyLatent;
            this.latentMask = latentMask;
        }
    }
}
