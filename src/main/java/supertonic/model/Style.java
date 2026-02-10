package supertonic.model;

import ai.onnxruntime.OnnxTensor;
import ai.onnxruntime.OrtEnvironment;
import ai.onnxruntime.OrtException;

import java.nio.FloatBuffer;

/**
 * Style holder class containing ONNX tensors for voice style
 * For the new Supertonic-TTS-2-ONNX model, styles are optional
 */
public class Style implements AutoCloseable {
    public final OnnxTensor ttlTensor;
    public final OnnxTensor dpTensor;
    
    public Style(OnnxTensor ttlTensor, OnnxTensor dpTensor) {
        this.ttlTensor = ttlTensor;
        this.dpTensor = dpTensor;
    }
    
    /**
     * Create a default neutral style
     * The text_encoder expects style shape [batch, 101, 128]
     */
    public static Style createDefault(OrtEnvironment env, int batchSize, int styleDim) throws OrtException {
        // Create neutral style tensors with zeros
        // Shape: [batch, 101, 128] based on model requirements
        int styleLen = 101;
        int ttlSize = batchSize * styleLen * styleDim;
        float[] ttlFlat = new float[ttlSize];
        
        int dpSize = batchSize * styleLen * styleDim;
        float[] dpFlat = new float[dpSize];
        
        long[] ttlShape = {batchSize, styleLen, styleDim};
        long[] dpShape = {batchSize, styleLen, styleDim};
        
        OnnxTensor ttlTensor = OnnxTensor.createTensor(env, FloatBuffer.wrap(ttlFlat), ttlShape);
        OnnxTensor dpTensor = OnnxTensor.createTensor(env, FloatBuffer.wrap(dpFlat), dpShape);
        
        return new Style(ttlTensor, dpTensor);
    }
    
    public void close() throws Exception {
        if (ttlTensor != null) ttlTensor.close();
        if (dpTensor != null) dpTensor.close();
    }
}
