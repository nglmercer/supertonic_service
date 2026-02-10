package supertonic;

import java.util.Arrays;
import java.util.List;

/**
 * Command line arguments parser for TTS example
 */
public class CommandLineArgs {
    public boolean useGpu = false;
    public String onnxDir = "assets/onnx";
    public int totalStep = 5;
    public float speed = 1.05f;
    public int nTest = 4;
    public List<String> voiceStyle = Arrays.asList("assets/voice_styles/M1.json");
    public List<String> text = Arrays.asList(
        "This morning, I took a walk in the park, and the sound of the birds and the breeze was so pleasant that I stopped for a long time just to listen."
    );
    public List<String> lang = Arrays.asList("en");
    public String saveDir = "results";
    public boolean batch = false;
    
    /**
     * Parse command line arguments
     */
    public static CommandLineArgs parse(String[] args) {
        CommandLineArgs result = new CommandLineArgs();
        
        for (int i = 0; i < args.length; i++) {
            switch (args[i]) {
                case "--use-gpu":
                    result.useGpu = true;
                    break;
                case "--onnx-dir":
                    if (i + 1 < args.length) result.onnxDir = args[++i];
                    break;
                case "--total-step":
                    if (i + 1 < args.length) result.totalStep = Integer.parseInt(args[++i]);
                    break;
                case "--speed":
                    if (i + 1 < args.length) result.speed = Float.parseFloat(args[++i]);
                    break;
                case "--n-test":
                    if (i + 1 < args.length) result.nTest = Integer.parseInt(args[++i]);
                    break;
                case "--voice-style":
                    if (i + 1 < args.length) {
                        result.voiceStyle = Arrays.asList(args[++i].split(","));
                    }
                    break;
                case "--text":
                    if (i + 1 < args.length) {
                        result.text = Arrays.asList(args[++i].split("\\|"));
                    }
                    break;
                case "--lang":
                    if (i + 1 < args.length) {
                        result.lang = Arrays.asList(args[++i].split(","));
                    }
                    break;
                case "--save-dir":
                    if (i + 1 < args.length) result.saveDir = args[++i];
                    break;
                case "--batch":
                    result.batch = true;
                    break;
            }
        }
        
        return result;
    }
    
    /**
     * Validate arguments
     */
    public void validate() {
        if (batch) {
            if (voiceStyle.size() != text.size()) {
                throw new RuntimeException("Number of voice styles (" + voiceStyle.size() + 
                    ") must match number of texts (" + text.size() + ")");
            }
            if (lang.size() != text.size()) {
                throw new RuntimeException("Number of languages (" + lang.size() + 
                    ") must match number of texts (" + text.size() + ")");
            }
        }
    }
}
