package supertonic.model;

import ai.onnxruntime.OnnxTensor;

/**
 * Style holder class containing ONNX tensors for voice style
 */
public class Style {
    public final OnnxTensor ttlTensor;
    public final OnnxTensor dpTensor;
    
    public Style(OnnxTensor ttlTensor, OnnxTensor dpTensor) {
        this.ttlTensor = ttlTensor;
        this.dpTensor = dpTensor;
    }
    
    public void close() throws Exception {
        if (ttlTensor != null) ttlTensor.close();
        if (dpTensor != null) dpTensor.close();
    }
}
