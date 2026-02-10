package supertonic.model;

/**
 * TTS result holder containing audio waveform and duration
 */
public class Result {
    public final float[] wav;
    public final float[] duration;
    
    public Result(float[] wav, float[] duration) {
        this.wav = wav;
        this.duration = duration;
    }
}
