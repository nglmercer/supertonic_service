package supertonic.inference;

import supertonic.model.*;
import supertonic.processor.TextProcessor;
import supertonic.util.TextChunker;
import ai.onnxruntime.*;

import java.util.*;

/**
 * Text-to-Speech inference class using ONNX Runtime
 * 
 * Uses 3 ONNX models:
 * - text_encoder: Encodes text tokens to embeddings
 * - latent_denoiser: Denoises latent representations (diffusion model)
 * - voice_decoder: Decodes latent representations to audio
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
     */
    public Result infer(List<String> textList, List<String> langList, Style style, 
                        int totalStep, float speed, OrtEnvironment env) throws Exception {
        int bsz = textList.size();
        
        // Process text
        TextProcessor.TextProcessResult textResult = textProcessor.process(textList, langList);
        long[][] textIds = textResult.textIds;
        long[][] textMask = textResult.textMask;
        
        // Create tensors
        OnnxTensor textIdsTensor = createLongTensor(textIds, env);
        OnnxTensor textMaskTensor = createLongTensor(textMask, env);
        
        // Text encoding
        Map<String, OnnxTensor> textEncInputs = new HashMap<>();
        textEncInputs.put("input_ids", textIdsTensor);
        textEncInputs.put("attention_mask", textMaskTensor);
        textEncInputs.put("style", style.ttlTensor);  // Add style tensor
        
        OrtSession.Result textEncResult = textEncSession.run(textEncInputs);
        
        // Get text embeddings from encoder
        OnnxTensor textEmbTensor = (OnnxTensor) textEncResult.get(0);
        
        // Estimate duration from text mask
        float[] duration = new float[bsz];
        for (int i = 0; i < bsz; i++) {
            // Count non-zero mask values
            int len = 0;
            for (int j = 0; j < textMask[i].length; j++) {
                if (textMask[i][j] > 0) len++;
            }
            duration[i] = len / speed;
        }
        
        // Sample noisy latent
        NoisyLatentResult noisyLatentResult = sampleNoisyLatent(duration);
        float[][][] xt = noisyLatentResult.noisyLatent;
        float[][][] latentMask = noisyLatentResult.latentMask;
        
        // Prepare constant tensors for diffusion
        long[] totalStepArray = new long[bsz];
        Arrays.fill(totalStepArray, (long) totalStep);
        OnnxTensor totalStepTensor = OnnxTensor.createTensor(env, totalStepArray);
        
        // Denoising loop (diffusion process)
        for (int step = 0; step < totalStep; step++) {
            long[] currentStepArray = new long[bsz];
            Arrays.fill(currentStepArray, (long) step);
            OnnxTensor currentStepTensor = OnnxTensor.createTensor(env, currentStepArray);
            OnnxTensor noisyLatentTensor = createFloatTensor(xt, env);
            OnnxTensor latentMaskTensor = createFloatTensor(latentMask, env);
            OnnxTensor textMaskTensor2 = createLongTensor(textMask, env);
            
            Map<String, OnnxTensor> denoiserInputs = new HashMap<>();
            denoiserInputs.put("noisy_latents", noisyLatentTensor);
            denoiserInputs.put("encoder_outputs", textEmbTensor);
            denoiserInputs.put("latent_mask", latentMaskTensor);
            denoiserInputs.put("attention_mask", textMaskTensor2);
            denoiserInputs.put("timestep", currentStepTensor);
            denoiserInputs.put("num_inference_steps", totalStepTensor);
            denoiserInputs.put("style", style.ttlTensor);
            
            OrtSession.Result denoiserResult = latentDenoiserSession.run(denoiserInputs);
            float[][][] denoised = (float[][][]) denoiserResult.get(0).getValue();
            
            xt = denoised;
            
            currentStepTensor.close();
            noisyLatentTensor.close();
            latentMaskTensor.close();
            textMaskTensor2.close();
            denoiserResult.close();
        }
        
        // Voice decoder - convert latent to audio
        OnnxTensor finalLatentTensor = createFloatTensor(xt, env);
        Map<String, OnnxTensor> decoderInputs = new HashMap<>();
        decoderInputs.put("latent", finalLatentTensor);
        
        OrtSession.Result decoderResult = voiceDecoderSession.run(decoderInputs);
        float[][] wavBatch = (float[][]) decoderResult.get(0).getValue();
        
        // Flatten audio
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
        
        // Cleanup
        textIdsTensor.close();
        textMaskTensor.close();
        textEncResult.close();
        totalStepTensor.close();
        finalLatentTensor.close();
        decoderResult.close();
        
        return new Result(wav, duration);
    }
    
    /**
     * Single text synthesis with automatic chunking
     */
    public Result synthesize(String text, String lang, Style style, 
                            int totalStep, float speed, float silenceDuration, 
                            OrtEnvironment env) throws Exception {
        int maxLen = lang.equals("ko") ? 120 : 300;
        List<String> chunks = TextChunker.chunkText(text, maxLen);
        
        List<Float> wavCat = new ArrayList<>();
        float durCat = 0.0f;
        
        for (int i = 0; i < chunks.size(); i++) {
            Result result = infer(Arrays.asList(chunks.get(i)), Arrays.asList(lang), 
                                 style, totalStep, speed, env);
            
            float dur = result.duration[0];
            int wavLen = (int) (sampleRate * dur);
            float[] wavChunk = new float[wavLen];
            System.arraycopy(result.wav, 0, wavChunk, 0, Math.min(wavLen, result.wav.length));
            
            if (i == 0) {
                for (float val : wavChunk) {
                    wavCat.add(val);
                }
                durCat = dur;
            } else {
                int silenceLen = (int) (silenceDuration * sampleRate);
                for (int j = 0; j < silenceLen; j++) {
                    wavCat.add(0.0f);
                }
                for (float val : wavChunk) {
                    wavCat.add(val);
                }
                durCat += silenceDuration + dur;
            }
        }
        
        float[] wavArray = new float[wavCat.size()];
        for (int i = 0; i < wavCat.size(); i++) {
            wavArray[i] = wavCat.get(i);
        }
        
        return new Result(wavArray, new float[]{durCat});
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
        
        // Initialize with random noise
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
        float[][][] latentMask = new float[bsz][1][latentLen];
        for (int i = 0; i < bsz; i++) {
            int len = (int) (duration[i] * sampleRate / chunkCompress);
            len = Math.min(len, latentLen);
            for (int j = 0; j < latentLen; j++) {
                latentMask[i][0][j] = j < len ? 1.0f : 0.0f;
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
        return OnnxTensor.createTensor(env, java.nio.FloatBuffer.wrap(flat), shape);
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
        return OnnxTensor.createTensor(env, java.nio.LongBuffer.wrap(flat), shape);
    }
    
    private OnnxTensor createFloatTensorFromLong(long[][] array, OrtEnvironment env) throws OrtException {
        int dim0 = array.length;
        int dim1 = array[0].length;
        
        float[] flat = new float[dim0 * dim1];
        int idx = 0;
        for (int i = 0; i < dim0; i++) {
            for (int j = 0; j < dim1; j++) {
                flat[idx++] = (float) array[i][j];
            }
        }
        
        long[] shape = {dim0, dim1};
        return OnnxTensor.createTensor(env, java.nio.FloatBuffer.wrap(flat), shape);
    }
    
    private OnnxTensor createLongTensorFromFloat(float[][][] array, OrtEnvironment env) throws OrtException {
        int dim0 = array.length;
        int dim1 = array[0].length;
        int dim2 = array[0][0].length;
        
        long[] flat = new long[dim0 * dim1 * dim2];
        int idx = 0;
        for (int i = 0; i < dim0; i++) {
            for (int j = 0; j < dim1; j++) {
                for (int k = 0; k < dim2; k++) {
                    flat[idx++] = (long) array[i][j][k];
                }
            }
        }
        
        long[] shape = {dim0, dim1, dim2};
        return OnnxTensor.createTensor(env, java.nio.LongBuffer.wrap(flat), shape);
    }
    
    private float[] getFloatArray(OrtSession.Result result, int index) throws OrtException {
        Object value = result.get(index).getValue();
        if (value instanceof float[][]) {
            return ((float[][]) value)[0];
        }
        return (float[]) value;
    }
    
    @Override
    public void close() throws Exception {
        if (textEncSession != null) textEncSession.close();
        if (latentDenoiserSession != null) latentDenoiserSession.close();
        if (voiceDecoderSession != null) voiceDecoderSession.close();
    }
    
    private static class NoisyLatentResult {
        final float[][][] noisyLatent;
        final float[][][] latentMask;
        
        NoisyLatentResult(float[][][] noisyLatent, float[][][] latentMask) {
            this.noisyLatent = noisyLatent;
            this.latentMask = latentMask;
        }
    }
}
