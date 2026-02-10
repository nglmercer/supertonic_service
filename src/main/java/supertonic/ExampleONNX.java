package supertonic;

import supertonic.model.*;
import supertonic.inference.TextToSpeech;
import supertonic.util.ModelLoader;
import supertonic.util.AudioUtils;

import ai.onnxruntime.OrtEnvironment;
import ai.onnxruntime.OrtException;

import java.io.File;
import java.util.List;

/**
 * TTS Inference Example with ONNX Runtime (Java)
 * 
 * This is the refactored, modularized version of ExampleONNX.
 * The code has been organized into proper packages for better maintainability.
 */
public class ExampleONNX {
    
    /**
     * Main entry point for TTS inference
     */
    public static void main(String[] args) {
        try {
            System.out.println("=== TTS Inference with ONNX Runtime (Java) ===\n");
            
            // 1. Parse and validate arguments
            CommandLineArgs parsedArgs = CommandLineArgs.parse(args);
            parsedArgs.validate();
            
            int totalStep = parsedArgs.totalStep;
            float speed = parsedArgs.speed;
            int nTest = parsedArgs.nTest;
            String saveDir = parsedArgs.saveDir;
            List<String> voiceStylePaths = parsedArgs.voiceStyle;
            List<String> textList = parsedArgs.text;
            List<String> langList = parsedArgs.lang;
            boolean batch = parsedArgs.batch;
            int bsz = voiceStylePaths.size();
            
            // 2. Initialize ONNX environment
            OrtEnvironment env = OrtEnvironment.getEnvironment();
            
            // 3. Load TTS components
            TextToSpeech tts = ModelLoader.loadTextToSpeech(
                parsedArgs.onnxDir, parsedArgs.useGpu, env);
            
            // 4. Load voice styles
            Style style = ModelLoader.loadVoiceStyle(voiceStylePaths, true, env);
            
            // 5. Create output directory
            File saveDirFile = new File(saveDir);
            if (!saveDirFile.exists()) {
                saveDirFile.mkdirs();
            }
            
            // 6. Run synthesis
            runSynthesis(tts, style, textList, langList, saveDir, bsz, 
                        totalStep, speed, nTest, batch, env);
            
            // 7. Cleanup
            style.close();
            tts.close();
            
            System.out.println("\n=== Synthesis completed successfully! ===");
            
        } catch (Exception e) {
            System.err.println("Error during inference: " + e.getMessage());
            e.printStackTrace();
            System.exit(1);
        }
    }
    
    /**
     * Run the synthesis loop for all test cases
     */
    private static void runSynthesis(TextToSpeech tts, Style style, 
                                     List<String> textList, List<String> langList,
                                     String saveDir, int bsz, int totalStep,
                                     float speed, int nTest, boolean batch,
                                     OrtEnvironment env) throws OrtException, java.io.IOException {
        for (int n = 0; n < nTest; n++) {
            System.out.println("\n[" + (n + 1) + "/" + nTest + "] Starting synthesis...");
            
            final OrtEnvironment finalEnv = env;
            
            Result ttsResult = AudioUtils.timer("Generating speech from text", () -> {
                try {
                    if (batch) {
                        return tts.infer(textList, langList, style, totalStep, speed, finalEnv);
                    } else {
                        return tts.synthesize(textList.get(0), langList.get(0), style, 
                                            totalStep, speed, 0.3f, finalEnv);
                    }
                } catch (Exception e) {
                    throw new RuntimeException(e);
                }
            });
            
            float[] wav = ttsResult.wav;
            float[] duration = ttsResult.duration;
            
            // Save outputs
            for (int i = 0; i < bsz; i++) {
                String fname = AudioUtils.sanitizeFilename(textList.get(i), 20) + "_" + (n + 1) + ".wav";
                float[] wavOut;
                
                if (batch) {
                    int wavLen = wav.length / bsz;
                    int actualLen = (int) (tts.sampleRate * duration[i]);
                    wavOut = new float[actualLen];
                    System.arraycopy(wav, i * wavLen, wavOut, 0, Math.min(actualLen, wavLen));
                } else {
                    int actualLen = (int) (tts.sampleRate * duration[0]);
                    wavOut = new float[Math.min(actualLen, wav.length)];
                    System.arraycopy(wav, 0, wavOut, 0, wavOut.length);
                }
                
                String outputPath = saveDir + "/" + fname;
                AudioUtils.writeWavFile(outputPath, wavOut, tts.sampleRate);
                System.out.println("Saved: " + outputPath);
            }
        }
    }
}
