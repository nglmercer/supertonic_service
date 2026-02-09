"""
Utility functions for Supertonic TTS Python implementation.
"""

import re
import struct
from typing import List, Tuple, Optional
from .constants import SUPPORTED_LANGUAGES
from .types import Language


def parse_rate_to_speed(rate: Optional[str] = None) -> float:
    """Parse rate string (e.g., '0%', '-10%', '+20%') to speed multiplier."""
    if not rate:
        return 1.0

    match = re.match(r'([+-]?)(\d+)%', rate)
    if not match:
        return 1.0

    sign = -1 if match.group(1) == '-' else 1
    value = int(match.group(2))

    # Convert percentage to speed multiplier
    return 1.0 + (sign * value / 100)


def sanitize_filename(filename: str) -> str:
    """Sanitize filename for filesystem."""
    return re.sub(r'[^a-zA-Z0-9]', '_', filename)[:50]


def is_supported_language(lang: str) -> bool:
    """Check if language is supported."""
    return lang in SUPPORTED_LANGUAGES


def detect_language(lang: str = 'es') -> Language:
    """Detect language, defaulting to 'es' if unsupported."""
    return lang if is_supported_language(lang) else 'es'


def parse_language_segments(tagged_text: str) -> List[Tuple[Language, str]]:
    """
    Parse tagged text into array of (language, text) segments.
    Expected format: "<en>Hello</en> <es>Hola</es>"
    """
    segments = []
    tag_pattern = re.compile(r'<([a-z]{2})>([^<]*)</\1>')
    
    for match in tag_pattern.finditer(tagged_text):
        lang = match.group(1)
        text_content = match.group(2).strip()
        if text_content:
            segments.append((lang, text_content))
    
    return segments


def concatenate_wav_buffers(buffers: List[bytes]) -> bytes:
    """Concatenate multiple WAV buffers into one."""
    if not buffers:
        return b''
    if len(buffers) == 1:
        return buffers[0]

    # Parse first WAV to get format info
    first_buffer = buffers[0]
    sample_rate = struct.unpack('<I', first_buffer[24:28])[0]
    bits_per_sample = struct.unpack('<H', first_buffer[34:36])[0]
    channels = struct.unpack('<H', first_buffer[22:24])[0]
    block_align = channels * bits_per_sample // 8
    byte_rate = sample_rate * block_align

    # Calculate total data size
    total_data_size = 0
    for buffer in buffers:
        data_size = struct.unpack('<I', buffer[40:44])[0]
        total_data_size += data_size

    # Create combined buffer
    header_size = 44
    total_size = header_size + total_data_size
    combined = bytearray(total_size)

    # Write header
    combined[0:4] = b'RIFF'
    struct.pack_into('<I', combined, 4, 36 + total_data_size)
    combined[8:12] = b'WAVE'
    combined[12:16] = b'fmt '
    struct.pack_into('<I', combined, 16, 16)
    struct.pack_into('<H', combined, 22, channels)
    struct.pack_into('<I', combined, 24, sample_rate)
    struct.pack_into('<I', combined, 28, byte_rate)
    struct.pack_into('<H', combined, 32, block_align)
    struct.pack_into('<H', combined, 34, bits_per_sample)
    combined[36:40] = b'data'
    struct.pack_into('<I', combined, 40, total_data_size)

    # Concatenate audio data
    offset = header_size
    for buffer in buffers:
        data_size = struct.unpack('<I', buffer[40:44])[0]
        data_start = 44
        combined[offset:offset + data_size] = buffer[data_start:data_start + data_size]
        offset += data_size

    return bytes(combined)


def create_silence_buffer(duration_seconds: float, sample_rate: int = 24000) -> bytes:
    """Create silence buffer for WAV concatenation."""
    silence_samples = int(duration_seconds * sample_rate)
    buffer_size = 44 + silence_samples * 2  # 16-bit mono
    buffer = bytearray(buffer_size)
    
    # Create minimal WAV header for silence
    buffer[0:4] = b'RIFF'
    struct.pack_into('<I', buffer, 4, 36 + silence_samples * 2)
    buffer[8:12] = b'WAVE'
    buffer[12:16] = b'fmt '
    struct.pack_into('<I', buffer, 16, 16)
    struct.pack_into('<H', buffer, 20, 1)  # PCM format
    struct.pack_into('<H', buffer, 22, 1)  # Mono
    struct.pack_into('<I', buffer, 24, sample_rate)
    struct.pack_into('<I', buffer, 28, sample_rate * 2)  # Byte rate
    struct.pack_into('<H', buffer, 32, 2)  # Block align
    struct.pack_into('<H', buffer, 34, 16)  # Bits per sample
    buffer[36:40] = b'data'
    struct.pack_into('<I', buffer, 40, silence_samples * 2)
    
    return bytes(buffer)


def validate_voice(voice: str) -> str:
    """Validate voice key, return default if invalid."""
    valid_voices = ['F1', 'F2', 'F3', 'F4', 'F5', 'M1', 'M2', 'M3', 'M4', 'M5']
    return voice if voice in valid_voices else 'F1'


def chunk_text(text: str, max_len: int = 300) -> List[str]:
    """
    Split text into chunks by paragraphs and sentences.

    Args:
        text: Input text to chunk
        max_len: Maximum length of each chunk (default: 300)

    Returns:
        List of text chunks
    """
    import re

    # Split by paragraph (two or more newlines)
    paragraphs = [p.strip() for p in re.split(r'\n\s*\n+', text.strip()) if p.strip()]

    chunks = []

    for paragraph in paragraphs:
        paragraph = paragraph.strip()
        if not paragraph:
            continue

        # Split by sentence boundaries
        pattern = r'(?<!Mr\.)(?<!Mrs\.)(?<!Ms\.)(?<!Dr\.)(?<!Prof\.)(?<!Sr\.)(?<!Jr\.)(?<!Ph\.D\.)(?<!etc\.)(?<!e\.g\.)(?<!i\.e\.)(?<!vs\.)(?<!Inc\.)(?<!Ltd\.)(?<!Co\.)(?<!Corp\.)(?<!St\.)(?<!Ave\.)(?<!Blvd\.)(?<!\b[A-Z]\.)(?<=[.!?])\s+'
        sentences = re.split(pattern, paragraph)

        current_chunk = ""

        for sentence in sentences:
            if len(current_chunk) + len(sentence) + 1 <= max_len:
                current_chunk += (" " if current_chunk else "") + sentence
            else:
                if current_chunk:
                    chunks.append(current_chunk.strip())
                current_chunk = sentence

        if current_chunk:
            chunks.append(current_chunk.strip())

    return chunks