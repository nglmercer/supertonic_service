"""
Tests for TTSService class in service.py
"""

import pytest
import asyncio
import sys
from pathlib import Path
from unittest.mock import Mock, patch, AsyncMock

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from tts.service import TTSService
from tts.types import SynthesisResult, MixedSynthesisResult, SynthesisOptions


class TestTTSService:
    """Tests for TTSService class."""

    @pytest.fixture(autouse=True)
    def reset_singleton(self):
        """Reset singleton before each test."""
        TTSService.reset_instance()
        yield
        TTSService.reset_instance()

    @pytest.mark.asyncio
    async def test_get_instance_returns_singleton(self):
        instance1 = TTSService.get_instance("./output")
        instance2 = TTSService.get_instance("./output")
        assert instance1 is instance2

    @pytest.mark.asyncio
    async def test_reset_instance_allows_new_instance(self):
        instance1 = TTSService.get_instance("./output")
        TTSService.reset_instance()
        instance2 = TTSService.get_instance("./output")
        assert instance1 is not instance2

    @pytest.mark.asyncio
    async def test_custom_language_detector(self):
        def custom_detector(text):
            return {"language": "en", "summary": text}
        
        service = TTSService.get_instance("./output", language_detector=custom_detector)
        assert service.language_detector == custom_detector

    @pytest.mark.asyncio
    async def test_set_language_detector(self):
        service = TTSService.get_instance("./output")
        def new_detector(text):
            return {"language": "ko", "summary": text}
        
        service.set_language_detector(new_detector)
        assert service.language_detector == new_detector

    @pytest.mark.asyncio
    async def test_synthesize_with_explicit_language(self, temp_dir):
        service = TTSService.get_instance(str(temp_dir))
        
        # Mock the supertonic client
        with patch.object(service.supertonic, 'speak', new_callable=AsyncMock) as mock_speak:
            mock_audio = Mock()
            mock_audio.to_wav.return_value = b'fake_wav_data'
            mock_speak.return_value = mock_audio
            
            # Mock file handler
            with patch.object(service.file_handler, 'write_audio_file', new_callable=AsyncMock) as mock_write:
                mock_write.return_value = str(temp_dir / "test.wav")
                
                result = await service.synthesize(
                    text="Hello world",
                    voice="F1",
                    filename="test",
                    language="en",
                    write_to_file=True
                )
                
                assert isinstance(result, SynthesisResult)
                assert result.detected_language == "en"
                assert result.file_buffer == b'fake_wav_data'
                assert result.saved_path is not None

    @pytest.mark.asyncio
    async def test_synthesize_with_auto_detection(self, temp_dir):
        service = TTSService.get_instance(str(temp_dir))
        
        # Custom detector that returns specific language
        def custom_detector(text):
            return {"language": "es", "summary": text}
        
        service.set_language_detector(custom_detector)
        
        with patch.object(service.supertonic, 'speak', new_callable=AsyncMock) as mock_speak:
            mock_audio = Mock()
            mock_audio.to_wav.return_value = b'fake_wav_data'
            mock_speak.return_value = mock_audio
            
            result = await service.synthesize(
                text="Hola mundo",
                voice="M2"
            )
            
            assert result.detected_language == "es"
            mock_speak.assert_called_once()

    @pytest.mark.asyncio
    async def test_synthesize_validates_voice(self, temp_dir):
        service = TTSService.get_instance(str(temp_dir))
        
        with patch.object(service.supertonic, 'speak', new_callable=AsyncMock) as mock_speak:
            mock_audio = Mock()
            mock_audio.to_wav.return_value = b'fake_wav_data'
            mock_speak.return_value = mock_audio
            
            # Invalid voice should default to F1
            result = await service.synthesize("Hello", voice="X99")
            
            # The mock should still be called with valid voice (F1)
            assert mock_speak.called

    @pytest.mark.asyncio
    async def test_synthesize_handles_rate_option(self, temp_dir):
        service = TTSService.get_instance(str(temp_dir))
        
        with patch.object(service.supertonic, 'speak', new_callable=AsyncMock) as mock_speak:
            mock_audio = Mock()
            mock_audio.to_wav.return_value = b'fake_wav_data'
            mock_speak.return_value = mock_audio
            
            await service.synthesize(
                text="Hello",
                options=SynthesisOptions(rate="+50%")
            )
            
            # Check that speed was passed correctly (1.5x)
            call_kwargs = mock_speak.call_args[1]
            assert call_kwargs['options']['speed'] == pytest.approx(1.5)

    @pytest.mark.asyncio
    async def test_synthesize_mixed(self, temp_dir):
        service = TTSService.get_instance(str(temp_dir))
        
        with patch.object(service.supertonic, 'speak', new_callable=AsyncMock) as mock_speak:
            mock_audio = Mock()
            mock_audio.to_wav.return_value = b'fake_wav_data_segment'
            mock_speak.return_value = mock_audio
            
            with patch.object(service.file_handler, 'write_audio_file', new_callable=AsyncMock) as mock_write:
                mock_write.return_value = str(temp_dir / "mixed.wav")
                
                result = await service.synthesize_mixed(
                    tagged_text="<en>Hello</en> <es>Hola</es>",
                    voice="F1",
                    filename="mixed_test",
                    write_to_file=True
                )
                
                assert isinstance(result, MixedSynthesisResult)
                # Should have been called twice (once per segment)
                assert mock_speak.call_count == 2
                # File should be written
                assert result.saved_path is not None

    @pytest.mark.asyncio
    async def test_synthesize_mixed_with_silence(self, temp_dir):
        service = TTSService.get_instance(str(temp_dir))
        
        with patch.object(service.supertonic, 'speak', new_callable=AsyncMock) as mock_speak:
            mock_audio = Mock()
            mock_audio.to_wav.return_value = b'fake_wav'
            mock_speak.return_value = mock_audio
            
            await service.synthesize_mixed(
                tagged_text="<en>Hello</en> <es>Hola</es>",
                silence_duration=0.5
            )
            
            # Should be called for both segments
            assert mock_speak.call_count == 2

    @pytest.mark.asyncio
    async def test_synthesize_mixed_raises_on_no_segments(self):
        service = TTSService.get_instance("./output")
        
        with pytest.raises(ValueError, match="No valid language segments"):
            await service.synthesize_mixed(tagged_text="Hello world")

    @pytest.mark.asyncio
    async def test_get_voices(self):
        service = TTSService.get_instance("./output")
        
        with patch.object(service.supertonic, 'get_available_voices', return_value=['F1', 'F2', 'M1']):
            voices = await service.get_voices()
            assert voices == ['F1', 'F2', 'M1']

    @pytest.mark.asyncio
    async def test_health(self):
        service = TTSService.get_instance("./output")
        result = await service.health()
        assert result["status"] == "healthy"
        assert result["service"] == "supertonic-tts"

    @pytest.mark.asyncio
    async def test_synthesize_raises_on_error(self):
        service = TTSService.get_instance("./output")
        
        # Mock supertonic to raise an error
        with patch.object(service.supertonic, 'speak', side_effect=Exception("TTS error")):
            with pytest.raises(Exception, match="TTS error"):
                await service.synthesize("Hello world")