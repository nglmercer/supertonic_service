"""
File handler for Supertonic TTS Python implementation.
"""

import os
from pathlib import Path
from typing import Optional
from .utils import sanitize_filename

# Try to import anyio for async support, fallback to sync operations
try:
    import anyio
    ANYIO_AVAILABLE = True
except ImportError:
    ANYIO_AVAILABLE = False


class FileHandler:
    """Handles audio file writing operations."""

    def __init__(self, output_dir: str = "./output"):
        self.output_dir = Path(output_dir)
        
        # Ensure output directory exists
        self.output_dir.mkdir(parents=True, exist_ok=True)

    async def write_audio_file(self, file_buffer: bytes, filename: str) -> str:
        """
        Write audio buffer to file.

        Args:
            file_buffer: Audio buffer to write
            filename: Base filename for the output

        Returns:
            Full path to the saved file
        """
        safe_filename = sanitize_filename(filename)
        timestamp = int(os.path.gettimeofday() * 1000000)  # Use high-precision timestamp
        output_path = self.output_dir / f"{safe_filename}_{timestamp}.wav"
        
        if ANYIO_AVAILABLE:
            # Write file asynchronously using anyio
            async with await anyio.open_file(output_path, 'wb') as f:
                await f.write(file_buffer)
        else:
            # Fallback to synchronous write
            with open(output_path, 'wb') as f:
                f.write(file_buffer)
        
        return str(output_path)

    def get_output_dir(self) -> str:
        """Get the output directory path."""
        return str(self.output_dir)

    def directory_exists(self) -> bool:
        """Check if output directory exists."""
        return self.output_dir.exists()
