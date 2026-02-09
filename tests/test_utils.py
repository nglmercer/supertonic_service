"""
Tests for utility functions in utils.py
"""

import pytest
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from tts.utils import (
    parse_rate_to_speed,
    sanitize_filename,
    is_supported_language,
    detect_language,
    parse_language_segments,
    concatenate_wav_buffers,
    create_silence_buffer,
    validate_voice,
    chunk_text,
)


class TestParseRateToSpeed:
    """Tests for parse_rate_to_speed function."""

    def test_default_returns_one(self):
        assert parse_rate_to_speed() == 1.0
        assert parse_rate_to_speed(None) == 1.0

    def test_zero_percent(self):
        assert parse_rate_to_speed('0%') == 1.0

    def test_positive_rates(self):
        assert parse_rate_to_speed('+10%') == pytest.approx(1.1)
        assert parse_rate_to_speed('+50%') == pytest.approx(1.5)
        assert parse_rate_to_speed('+100%') == pytest.approx(2.0)

    def test_negative_rates(self):
        assert parse_rate_to_speed('-10%') == pytest.approx(0.9)
        assert parse_rate_to_speed('-50%') == pytest.approx(0.5)
        assert parse_rate_to_speed('-99%') == pytest.approx(0.01)

    def test_invalid_format_returns_one(self):
        assert parse_rate_to_speed('invalid') == 1.0
        assert parse_rate_to_speed('10') == 1.0
        assert parse_rate_to_speed('%') == 1.0

    def test_edge_cases(self):
        assert parse_rate_to_speed('+0%') == 1.0
        assert parse_rate_to_speed('-0%') == 1.0


class TestSanitizeFilename:
    """Tests for sanitize_filename function."""

    def test_simple_filename(self):
        assert sanitize_filename('hello') == 'hello'

    def test_replaces_special_chars(self):
        assert sanitize_filename('hello world!') == 'hello_world_'
        assert sanitize_filename('file-name.txt') == 'file_name_txt'
        assert sanitize_filename('test@#$%') == 'test_____'

    def test_truncates_to_50_chars(self):
        long_name = 'a' * 100
        result = sanitize_filename(long_name)
        assert len(result) == 50
        assert result == 'a' * 50

    def test_empty_string(self):
        assert sanitize_filename('') == ''


class TestIsSupportedLanguage:
    """Tests for is_supported_language function."""

    def test_supported_languages(self):
        assert is_supported_language('en')
        assert is_supported_language('ko')
        assert is_supported_language('es')
        assert is_supported_language('pt')
        assert is_supported_language('fr')

    def test_unsupported_languages(self):
        assert not is_supported_language('de')
        assert not is_supported_language('it')
        assert not is_supported_language('zh')
        assert not is_supported_language('ja')


class TestDetectLanguage:
    """Tests for detect_language function."""

    def test_valid_language_passthrough(self):
        assert detect_language('en') == 'en'
        assert detect_language('es') == 'es'

    def test_invalid_defaults_to_es(self):
        assert detect_language('de') == 'es'
        assert detect_language('') == 'es'
        assert detect_language('invalid') == 'es'

    def test_default_parameter(self):
        assert detect_language() == 'es'


class TestParseLanguageSegments:
    """Tests for parse_language_segments function."""

    def test_single_segment(self):
        text = "<en>Hello world</en>"
        segments = parse_language_segments(text)
        assert len(segments) == 1
        assert segments[0] == ('en', 'Hello world')

    def test_multiple_segments(self):
        text = "<en>Hello</en> <es>Hola</es> <fr>Bonjour</fr>"
        segments = parse_language_segments(text)
        assert len(segments) == 3
        assert segments[0] == ('en', 'Hello')
        assert segments[1] == ('es', 'Hola')
        assert segments[2] == ('fr', 'Bonjour')

    def test_whitespace_trimming(self):
        text = "<en>  Hello   world  </en>"
        segments = parse_language_segments(text)
        assert len(segments) == 1
        assert segments[0] == ('en', 'Hello   world')

    def test_empty_segments_ignored(self):
        text = "<en></en> <es>Hola</es>"
        segments = parse_language_segments(text)
        assert len(segments) == 1
        assert segments[0] == ('es', 'Hola')

    def test_no_segments(self):
        text = "Hello world"
        segments = parse_language_segments(text)
        assert len(segments) == 0

    def test_mismatched_tags(self):
        text = "<en>Hello</es>"
        segments = parse_language_segments(text)
        assert len(segments) == 0


class TestConcatenateWavBuffers:
    """Tests for concatenate_wav_buffers function."""

    def create_simple_wav(self, duration_samples: int, sample_rate: int = 24000) -> bytes:
        """Helper to create a simple WAV buffer with silence."""
        import struct
        data_size = duration_samples * 2  # 16-bit
        buffer = bytearray(44 + data_size)
        
        buffer[0:4] = b'RIFF'
        struct.pack_into('<I', buffer, 4, 36 + data_size)
        buffer[8:12] = b'WAVE'
        buffer[12:16] = b'fmt '
        struct.pack_into('<I', buffer, 16, 16)
        struct.pack_into('<H', buffer, 22, 1)  # Mono
        struct.pack_into('<I', buffer, 24, sample_rate)
        struct.pack_into('<I', buffer, 28, sample_rate * 2)
        struct.pack_into('<H', buffer, 32, 2)
        struct.pack_into('<H', buffer, 34, 16)
        buffer[36:40] = b'data'
        struct.pack_into('<I', buffer, 40, data_size)
        
        # Write silence samples
        offset = 44
        for _ in range(duration_samples):
            struct.pack_into('<h', buffer, offset, 0)
            offset += 2
            
        return bytes(buffer)

    def test_empty_list(self):
        result = concatenate_wav_buffers([])
        assert result == b''

    def test_single_buffer(self):
        wav = self.create_simple_wav(100)
        result = concatenate_wav_buffers([wav])
        assert result == wav

    def test_two_buffers(self):
        wav1 = self.create_simple_wav(100)
        wav2 = self.create_simple_wav(200)
        result = concatenate_wav_buffers([wav1, wav2])
        
        # Check header
        assert result[0:4] == b'RIFF'
        assert result[8:12] == b'WAVE'
        
        # Check data size (100 + 200 = 300 samples * 2 bytes = 600 bytes)
        data_size = int.from_bytes(result[40:44], 'little')
        assert data_size == 600

    def test_multiple_buffers(self):
        wav1 = self.create_simple_wav(100)
        wav2 = self.create_simple_wav(150)
        wav3 = self.create_simple_wav(250)
        result = concatenate_wav_buffers([wav1, wav2, wav3])
        
        data_size = int.from_bytes(result[40:44], 'little')
        assert data_size == (100 + 150 + 250) * 2


class TestCreateSilenceBuffer:
    """Tests for create_silence_buffer function."""

    def test_creates_valid_wav_header(self):
        buffer = create_silence_buffer(1.0, 24000)
        assert buffer[0:4] == b'RIFF'
        assert buffer[8:12] == b'WAVE'
        assert buffer[12:16] == b'fmt '

    def test_correct_duration(self):
        sample_rate = 24000
        duration = 1.5
        buffer = create_silence_buffer(duration, sample_rate)
        
        # Calculate expected samples
        samples = int(duration * sample_rate)
        data_size = int.from_bytes(buffer[40:44], 'little')
        assert data_size == samples * 2

    def test_default_sample_rate(self):
        buffer = create_silence_buffer(0.5)
        sample_rate = int.from_bytes(buffer[24:28], 'little')
        assert sample_rate == 24000

    def test_mono_16bit(self):
        buffer = create_silence_buffer(1.0)
        channels = int.from_bytes(buffer[22:24], 'little')
        bits_per_sample = int.from_bytes(buffer[34:36], 'little')
        assert channels == 1
        assert bits_per_sample == 16


class TestValidateVoice:
    """Tests for validate_voice function."""

    def test_valid_voices(self):
        valid_voices = ['F1', 'F2', 'F3', 'F4', 'F5', 'M1', 'M2', 'M3', 'M4', 'M5']
        for voice in valid_voices:
            assert validate_voice(voice) == voice

    def test_invalid_voice_returns_default(self):
        assert validate_voice('X1') == 'F1'
        assert validate_voice('invalid') == 'F1'
        assert validate_voice('') == 'F1'

    def test_case_sensitivity(self):
        assert validate_voice('f1') == 'F1'  # Lowercase should return default
        assert validate_voice('F1') == 'F1'


class TestChunkText:
    """Tests for chunk_text function."""

    def test_short_text_no_chunking(self):
        text = "Hello world"
        chunks = chunk_text(text, max_len=100)
        assert chunks == ["Hello world"]

    def test_single_sentence(self):
        text = "Hello world."
        chunks = chunk_text(text, max_len=20)
        assert chunks == ["Hello world."]

    def test_multiple_sentences_single_chunk(self):
        text = "Hello world. How are you? I'm fine."
        chunks = chunk_text(text, max_len=100)
        assert len(chunks) == 1
        assert "Hello world." in chunks[0]

    def test_long_text_chunks_by_sentence(self):
        text = "This is a long sentence that should be chunked. " * 10
        chunks = chunk_text(text, max_len=100)
        # Should produce multiple chunks
        assert len(chunks) > 1
        # Each chunk should not exceed max_len significantly
        for chunk in chunks:
            assert len(chunk) <= 120  # Allow some flexibility

    def test_paragraph_chunking(self):
        text = "First paragraph.\n\nSecond paragraph."
        chunks = chunk_text(text, max_len=50)
        assert len(chunks) == 2

    def test_whitespace_trimming(self):
        text = "  Hello   world.  " * 5
        chunks = chunk_text(text, max_len=100)
        for chunk in chunks:
            assert not chunk.startswith(' ')
            assert not chunk.endswith(' ')

    def test_empty_text(self):
        assert chunk_text("") == []
        assert chunk_text("   ") == []

    def test_abbreviations_preserved(self):
        text = "Mr. Smith went to Dr. Jones. They met on Main St."
        chunks = chunk_text(text, max_len=100)
        # Should not split at "Mr." or "Dr." or "St."
        full_text = ' '.join(chunks)
        assert "Mr." in full_text
        assert "Dr." in full_text
        assert "St." in full_text