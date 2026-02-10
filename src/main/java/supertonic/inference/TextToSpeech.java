package supertonic.inference;

import supertonic.model.*;
import supertonic.processor.TextProcessor;
import supertonic.util.TextChunker;
import ai.onnxruntime.*;

import java.util.*;

/**
 * Text-to-Speech inference class using ONNX Runtime
 */
public class TextToSpeech implements AutoCloseable {
    private final Config config;
    private final TextProcessor textProcessor;
    private final OrtSession dpSession;
    private final OrtSession textEncSession;
    private final OrtSession vectorEstSession;
    private final OrtSession vocoderSession;
    
    public final int sampleRate;
    private final int baseChunkSize;
    private final int chunkCompress;
    private final int ldim;
    
    public TextToSpeech(Config config, TextProcessor textProcessor,
                        OrtSession dpSession, OrtSession textEncSession,
                        OrtSession vectorEstSession, OrtSession vocoderSession) {
        this.config = config;
        this.textProcessor = textProcessor;
        this.dpSession = dpSession;
        this.textEncSession = textEncSession;
        this.vectorEstSession = vectorEstSession;
        this.vocoderSession = vocoderSession;
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
        float[][][] textMask = textResult.textMask;
        
        // Create tensors
        OnnxTensor textIdsTensor = createLongTensor(textIds, env);
        OnnxTensor textMaskTensor = createFloatTensor(textMask, env);
        
        // Duration prediction
        Map<String, OnnxTensor> dpInputs = new HashMap<>();
        dpInputs.put("text_ids", textIdsTensor);
        dpInputs.put("style_dp", style.dpTensor);
        dpInputs.put("text_mask", textMaskTensor);
        
        OrtSession.Result dpResult = dpSession.run(dpInputs);
        float[] duration = getFloatArray(dpResult, 0);
        
        // Apply speed factor
        for (int i = 0; i < duration.length; i++) {
            duration[i] /= speed;
        }
        
        // Text encoding
        Map<String, OnnxTensor> textEncInputs = new HashMap<>();
        textEncInputs.put("text_ids", textIdsTensor);
        textEncInputs.put("style_ttl", style.ttlTensor);
        textEncInputs.put("text_mask", textMaskTensor);
        
        OrtSession.Result textEncResult = textEncSession.run(textEncInputs);
        OnnxTensor textEmbTensor = (OnnxTensor) textEncResult.get(0);
        
        // Sample noisy latent
        NoisyLatentResult noisyLatentResult = sampleNoisyLatent(duration);
        float[][][] xt = noisyLatentResult.noisyLatent;
        float[][][] latentMask = noisyLatentResult.latentMask;
        
        // Prepare constant tensors
        float[] totalStepArray = new float[bsz];
        Arrays.fill(totalStepArray, (float) totalStep);
        OnnxTensor totalStepTensor = OnnxTensor.createTensor(env, totalStepArray);
        
        // Denoising loop
        for (int step = 0; step < totalStep; step++) {
            float[] currentStepArray = new float[bsz];
            Arrays.fill(currentStepArray, (float) step);
            OnnxTensor currentStepTensor = OnnxTensor.createTensor(env, currentStepArray);
            OnnxTensor noisyLatentTensor = createFloatTensor(xt, env);
            OnnxTensor latentMaskTensor = createFloatTensor(latentMask, env);
            OnnxTensor textMaskTensor2 = createFloatTensor(textMask, env);
            
            Map<String, OnnxTensor> vectorEstInputs = new HashMap<>();
            vectorEstInputs.put("noisy_latent", noisyLatentTensor);
            vectorEstInputs.put("text_emb", textEmbTensor);
            vectorEstInputs.put("style_ttl", style.ttlTensor);
            vectorEstInputs.put("latent_mask", latentMaskTensor);
            vectorEstInputs.put("text_mask", textMaskTensor2);
            vectorEstInputs.put("current_step", currentStepTensor);
            vectorEstInputs.put("total_step", totalStepTensor);
            
            OrtSession.Result vectorEstResult = vectorEstSession.run(vectorEstInputs);
            float[][][] denoised = (float[][][]) vectorEstResult.get(0).getValue();
            
            xt = denoised;
            
            currentStepTensor.close();
            noisyLatentTensor.close();
            latentMaskTensor.close();
            textMaskTensor2.close();
            vectorEstResult.close();
        }
        
        // Vocoder
        OnnxTensor finalLatentTensor = createFloatTensor(xt, env);
        Map<String, OnnxTensor> vocoderInputs = new HashMap<>();
        vocoderInputs.put("latent", finalLatentTensor);
        
        OrtSession.Result vocoderResult = vocoderSession.run(vocoderInputs);
        float[][] wavBatch = (float[][]) vocoderResult.get(0).getValue();
        
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
        dpResult.close();
        textEncResult.close();
        totalStepTensor.close();
        finalLatentTensor.close();
        vocoderResult.close();
        
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
        
        long wavLenMax = (long) (maxDur * sampleRate);
        long[] wavLengths = new long[bsz];
        for (int i = 0; i < bsz; i++) {
            wavLengths[i] = (long) (duration[i] * sampleRate);
        }
        
        int chunkSize = baseChunkSize * chunkCompress;
        int latentLen = (int) ((wavLenMax + chunkSize - 1) / chunkSize);
        int latentDim = ldim * chunkCompress;
        
        Random rng = new Random();
        float[][][] noisyLatent = new float[bsz][latentDim][latentLen];
        for (int b = 0; b < bsz; b++) {
            for (int d = 0; d < latentDim; d++) {
                for (int t = 0; t < latentLen; t++) {
                    double u1 = Math.max(1e-10, rng.nextDouble());
                    double u2 = rng.nextDouble();
                    noisyLatent[b][d][t] = (float) (Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2));
                }
            }
        }
        
        float[][][] latentMask = getLatentMask(wavLengths);
        
        for (int b = 0; b < bsz; b++) {
            for (int d = 0; d < latentDim; d++) {
                for (int t = 0; t < latentLen; t++) {
                    noisyLatent[b][d][t] *= latentMask[b][0][t];
                }
            }
        }
        
        return new NoisyLatentResult(noisyLatent, latentMask);
    }
    
    private float[][][] getLatentMask(long[] wavLengths) {
        long baseChunkSizeVal = baseChunkSize;
        long chunkCompressFactor = chunkCompress;
        long latentSize = baseChunkSizeVal * chunkCompressFactor;
        
        long[] latentLengths = new long[wavLengths.length];
        long maxLen = 0;
        for (int i = 0; i < wavLengths.length; i++) {
            latentLengths[i] = (wavLengths[i] + latentSize - 1) / latentSize;
            maxLen = Math.max(maxLen, latentLengths[i]);
        }
        
        float[][][] mask = new float[wavLengths.length][1][(int) maxLen];
        for (int i = 0; i < wavLengths.length; i++) {
            for (int j = 0; j < maxLen; j++) {
                mask[i][0][j] = j < latentLengths[i] ? 1.0f : 0.0f;
            }
        }
        return mask;
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
    
    private float[] getFloatArray(OrtSession.Result result, int index) throws OrtException {
        Object value = result.get(index).getValue();
        if (value instanceof float[][]) {
            return ((float[][]) value)[0];
        }
        return (float[]) value;
    }
    
    @Override
    public void close() throws Exception {
        if (dpSession != null) dpSession.close();
        if (textEncSession != null) textEncSession.close();
        if (vectorEstSession != null) vectorEstSession.close();
        if (vocoderSession != null) vocoderSession.close();
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
