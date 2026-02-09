"""
Tests for FileHandler class in file_handler.py
"""

import pytest
import asyncio
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from tts.file_handler import FileHandler


class TestFileHandler:
    """Tests for FileHandler class."""

    @pytest.mark.asyncio
    async def test_initializes_output_directory(self, temp_dir):
        output_dir = temp_dir / "test_output"
        handler = FileHandler(str(output_dir))
        assert output_dir.exists()
        assert output_dir.is_dir()

    @pytest.mark.asyncio
    async def test_writes_audio_file(self, temp_dir):
        output_dir = temp_dir / "test_output"
        handler = FileHandler(str(output_dir))
        
        # Create test audio data (simple WAV header + minimal data)
        wav_data = b'RIFF\x24\x00\x00\x00WAVEfmt \x10\x00\x00\x00\x01\x00\x01\x00\x44\xac\x00\x00\x88\x58\x01\x00\x02\x00\x10\x00data\x00\x00\x00\x00'
        
        filename = "test_audio"
        saved_path = await handler.write_audio_file(wav_data, filename)
        
        saved_file = Path(saved_path)
        assert saved_file.exists()
        assert saved_file.suffix == '.wav'
        assert filename in saved_path
        
        # Verify content
        with open(saved_file, 'rb') as f:
            content = f.read()
            assert content == wav_data

    @pytest.mark.asyncio
    async def test_sanitizes_filename(self, temp_dir):
        output_dir = temp_dir / "test_output"
        handler = FileHandler(str(output_dir))
        
        # Use filename with special characters
        filename = "test@audio#file"
        saved_path = await handler.write_audio_file(b'test', filename)
        
        saved_file = Path(saved_path)
        # Filename should be sanitized (no special chars)
        assert '@' not in saved_path
        assert '#' not in saved_path
        # Should contain sanitized version
        assert "test_audio_file" in saved_path

    @pytest.mark.asyncio
    async def test_adds_timestamp_to_filename(self, temp_dir):
        output_dir = temp_dir / "test_output"
        handler = FileHandler(str(output_dir))
        
        # Write same filename twice
        wav_data = b'test data'
        path1 = await handler.write_audio_file(wav_data, "test")
        await asyncio.sleep(0.01)  # Small delay to ensure different timestamp
        path2 = await handler.write_audio_file(wav_data, "test")
        
        # Paths should be different due to timestamp
        assert path1 != path2
        
        # Both files should exist
        assert Path(path1).exists()
        assert Path(path2).exists()

    def test_get_output_dir(self, temp_dir):
        output_dir = temp_dir / "test_output"
        handler = FileHandler(str(output_dir))
        assert handler.get_output_dir() == str(output_dir)

    def test_directory_exists(self, temp_dir):
        output_dir = temp_dir / "test_output"
        handler = FileHandler(str(output_dir))
        assert handler.directory_exists() is True
        
        # Non-existent directory
        nonexistent = temp_dir / "nonexistent"
        handler2 = FileHandler(str(nonexistent))
        # Directory should be created
        assert handler2.directory_exists() is True

    @pytest.mark.asyncio
    async def test_creates_nested_directories(self, temp_dir):
        # Test with deeply nested path
        nested_dir = temp_dir / "a" / "b" / "c" / "d"
        handler = FileHandler(str(nested_dir))
        assert nested_dir.exists()
        assert nested_dir.is_dir()
        
        # Should be able to write file
        wav_data = b'test'
        path = await handler.write_audio_file(wav_data, "test")
        assert Path(path).exists()