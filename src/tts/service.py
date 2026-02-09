"""
TTSService - Main Text-to-Speech service for Python implementation.
Orchestrates language detection, text preprocessing, and audio generation.
"""

import asyncio
from typing import Optional, Callable, Awaitable, Union
from .types import Language, LanguageDetector, SynthesisResult, MixedSynthesisResult, SynthesisOptions, VoiceKey, Style
from .preprocessor import detect_language as default_detect_language, preprocess_text, mix_languages, has_language_tags
from .utils import parse_rate_to_speed, parse_language_segments, concatenate_wav_buffers, create_silence_buffer, validate_voice, detect_language as util_detect_language
from .file_handler import FileHandler
from .supertonic_client import SupertonicTTS, AudioOutput


class TTSService:
    """
    Main Text-to-Speech service.
    Orchestrates language detection, text preprocessing, and audio generation.
    Implements singleton pattern to ensure only one instance exists.
    """
    _instance: Optional['TTSService'] = None

    def __init__(self, output_dir: str = "./output", language_detector: Optional[Callable] = None):
        """
        Initialize TTSService.

        Args:
            output_dir: Directory to save generated audio files
            language_detector: Optional custom language detector function
        """
        self.file_handler = FileHandler(output_dir)
        self.supertonic = SupertonicTTS()
        self.language_detector = language_detector or default_detect_language
        self._initialized = False

    @classmethod
    def get_instance(cls, output_dir: str = "./output", language_detector: Optional[Callable] = None) -> 'TTSService':
        """
        Get the singleton instance of TTSService.

        Args:
            output_dir: Directory to save generated audio files (only used on first call)
            language_detector: Optional custom language detector function (only used on first call)

        Returns:
            The singleton TTSService instance
        """
        if cls._instance is None:
            cls._instance = cls(output_dir, language_detector)
        return cls._instance

    @classmethod
    def reset_instance(cls) -> None:
        """Reset the singleton instance (useful for testing)."""
        cls._instance = None

    def set_language_detector(self, detector: Callable) -> None:
        """
        Set a custom language detector at runtime.

        Args:
            detector: Language detector function that takes text and returns LanguageDetectionResult-like dict
        """
        self.language_detector = detector

    async def _ensure_initialized(self) -> None:
        """Ensure the TTS pipeline is initialized."""
        if not self._initialized:
            await self.supertonic._initialize_pipeline()
            self._initialized = True

    async def synthesize(
        self,
        text: str,
        voice: str = 'F1',
        filename: str = "output",
        options: SynthesisOptions = None,
        language: Optional[Language] = None,
        write_to_file: bool = False
    ) -> SynthesisResult:
        """
        Synthesize text to speech with automatic language detection.

        Args:
            text: Text to synthesize (plain text or pre-tagged with language markers)
            voice: Voice identifier (F1-F5, M1-M5)
            filename: Base filename for the output (only used if write_to_file is true)
            options: Synthesis options (rate, volume, pitch)
            language: Optional explicit language override (skips auto-detection if provided)
            write_to_file: Whether to save the audio to a file (default: False)

        Returns:
            SynthesisResult with saved_path (None if not written), file_buffer, and detected_language
        """
        try:
            await self._ensure_initialized()

            # Determine language: use explicit override, custom detector, or default auto-detection
            if language:
                detected_lang = language
                text_to_speak = text
            else:
                detection_result = self.language_detector(text)
                detected = detection_result.get('language', 'es')
                detected_lang = util_detect_language(detected)
                text_to_speak = text if len(text) < 50 else detection_result.get('summary', text)

            # Validate voice
            voice_key = validate_voice(voice)

            # Parse rate option to speed multiplier
            speed = parse_rate_to_speed(options.rate if options else None)

            # Generate audio
            processed_text = preprocess_text(text_to_speak, detected_lang)
            audio = await self.supertonic.speak(
                processed_text,
                voice_key,
                {
                    'speed': speed,
                    'num_inference_steps': 5
                }
            )

            # Convert to buffer
            file_buffer = audio.to_wav()

            # Optionally save to file
            saved_path = None
            if write_to_file:
                saved_path = await self.file_handler.write_audio_file(file_buffer, filename)

            return SynthesisResult(
                saved_path=saved_path,
                file_buffer=file_buffer,
                detected_language=detected_lang
            )

        except Exception as error:
            raise error

    async def synthesize_mixed(
        self,
        tagged_text: str,
        voice: str = 'F1',
        filename: str = "output",
        options: SynthesisOptions = None,
        silence_duration: float = 0.3,
        write_to_file: bool = False
    ) -> MixedSynthesisResult:
        """
        Synthesize mixed-language text by processing each language segment separately.
        Text must be tagged with language markers: "<en>Hello</en> <es>Hello</es>"

        Args:
            tagged_text: Text with embedded language tags
            voice: Voice identifier (F1-F5, M1-M5)
            filename: Base filename for the output (only used if write_to_file is true)
            options: Synthesis options (rate, volume, pitch)
            silence_duration: Duration of silence between segments (default: 0.3 seconds)
            write_to_file: Whether to save the audio to a file (default: False)

        Returns:
            MixedSynthesisResult with saved_path (None if not written) and combined file_buffer
        """
        try:
            await self._ensure_initialized()

            # Validate voice
            voice_key = validate_voice(voice)

            # Parse rate option to speed multiplier
            speed = parse_rate_to_speed(options.rate if options else None)

            # Parse tagged text into segments
            segments = parse_language_segments(tagged_text)
            if not segments:
                raise ValueError('No valid language segments found in text')

            # Synthesize each segment separately
            audio_buffers = []
            for lang, text in segments:
                # Preprocess text for this language
                processed_text = preprocess_text(text, lang)

                # Generate audio for this segment
                audio = await self.supertonic.speak(
                    processed_text,
                    voice_key,
                    {
                        'speed': speed,
                        'num_inference_steps': 5
                    }
                )
                audio_buffers.append(audio.to_wav())

                # Add silence between segments (except after last segment)
                if segments.index((lang, text)) < len(segments) - 1:
                    silence_buffer = create_silence_buffer(silence_duration)
                    audio_buffers.append(silence_buffer)

            # Concatenate all buffers
            combined_buffer = concatenate_wav_buffers(audio_buffers)

            # Optionally save to file
            saved_path = None
            if write_to_file:
                saved_path = await self.file_handler.write_audio_file(combined_buffer, filename)

            return MixedSynthesisResult(
                saved_path=saved_path,
                file_buffer=combined_buffer
            )

        except Exception as error:
            raise error

    async def get_voices(self) -> list[str]:
        """Get available voices."""
        return self.supertonic.get_available_voices()

    async def health(self) -> dict:
        """Health check."""
        return {"status": "healthy", "service": "supertonic-tts"}