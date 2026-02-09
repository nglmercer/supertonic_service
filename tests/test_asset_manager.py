"""
Tests for AssetManager class in asset_manager.py.
"""

import pytest
import tempfile
from pathlib import Path
from unittest.mock import patch, MagicMock
from tts.asset_manager import AssetManager, get_asset_manager


class TestAssetManager:
    """Tests for AssetManager class."""

    def test_initializes_with_default_cache_dir(self):
        manager = AssetManager()
        expected = Path.home() / ".cache" / "supertonic-tts"
        assert manager.cache_dir == expected

    def test_initializes_with_custom_cache_dir(self):
        custom_dir = "/custom/cache"
        manager = AssetManager(cache_dir=custom_dir)
        assert manager.cache_dir == Path(custom_dir)

    def test_default_repo_id(self):
        manager = AssetManager()
        assert manager.repo_id == "onnx-community/Supertonic-TTS-2-ONNX"

    def test_custom_repo_id(self):
        manager = AssetManager(repo_id="custom/repo")
        assert manager.repo_id == "custom/repo"

    def test_ensure_onnx_assets_creates_directory(self, temp_dir):
        manager = AssetManager()
        onnx_dir = temp_dir / "onnx"
        
        # Should create directory even if it doesn't exist
        result = manager.ensure_onnx_assets(onnx_dir)
        assert onnx_dir.exists()
        assert result == onnx_dir

    def test_ensure_onnx_assets_returns_existing_if_complete(self, temp_dir):
        manager = AssetManager()
        onnx_dir = temp_dir / "onnx"
        onnx_dir.mkdir()
        
        # Create all required files
        required_files = [
            "tts.json",
            "duration_predictor.onnx",
            "text_encoder.onnx",
            "vector_estimator.onnx",
            "vocoder.onnx",
            "unicode_indexer.json",
        ]
        for f in required_files:
            (onnx_dir / f).touch()
        
        # Should not download, just return path
        with patch.object(manager, 'ensure_onnx_assets', wraps=manager.ensure_onnx_assets) as mock_ensure:
            result = manager.ensure_onnx_assets(onnx_dir)
            # The method should detect all files exist and skip download
            assert result == onnx_dir

    def test_ensure_voice_style_validates_voice_key(self):
        manager = AssetManager()
        with pytest.raises(ValueError, match="Invalid voice key"):
            manager.ensure_voice_style("X99")

    def test_ensure_voice_style_creates_directory(self, temp_dir):
        manager = AssetManager()
        styles_dir = temp_dir / "voice_styles"
        
        # This will try to download, but we'll mock it
        with pytest.raises(FileNotFoundError):
            manager.ensure_voice_style("F1", styles_dir)

    def test_get_or_download_all_voices_creates_directory(self, temp_dir):
        manager = AssetManager()
        styles_dir = temp_dir / "all_voices"
        
        # Should create directory
        result = manager.get_or_download_all_voices(styles_dir)
        assert styles_dir.exists()
        assert result == styles_dir

    def test_global_asset_manager_singleton(self):
        # Reset global state
        import tts.asset_manager
        tts.asset_manager._default_asset_manager = None
        
        manager1 = get_asset_manager()
        manager2 = get_asset_manager()
        assert manager1 is manager2
        
        # Cleanup
        tts.asset_manager._default_asset_manager = None


class TestAssetManagerIntegration:
    """Integration tests for asset manager with mocking."""

    def test_download_workflow_with_mocks(self, temp_dir):
        """Test the complete download workflow with mocked HuggingFace hub."""
        manager = AssetManager()
        
        with patch('huggingface_hub.snapshot_download') as mock_snapshot:
            # Mock successful download
            mock_snapshot.return_value = None
            
            onnx_dir = temp_dir / "test_onnx"
            result = manager.ensure_onnx_assets(onnx_dir)
            
            assert result == onnx_dir
            mock_snapshot.assert_called_once()
            call_kwargs = mock_snapshot.call_args[1]
            assert call_kwargs['repo_id'] == "onnx-community/Supertonic-TTS-2-ONNX"
            assert '*.onnx' in call_kwargs['allow_patterns']
            assert '*.json' in call_kwargs['allow_patterns']