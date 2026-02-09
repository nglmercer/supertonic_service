"""
Pytest configuration and fixtures for Supertonic TTS tests.
"""

import pytest
import tempfile
import os
from pathlib import Path


@pytest.fixture
def temp_dir():
    """Create a temporary directory for tests."""
    with tempfile.TemporaryDirectory() as tmpdir:
        yield Path(tmpdir)


@pytest.fixture
def temp_output_dir(temp_dir):
    """Create a temporary output directory."""
    output_dir = temp_dir / "output"
    output_dir.mkdir()
    return output_dir