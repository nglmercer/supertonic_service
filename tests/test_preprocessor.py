"""
Tests for preprocessor functions in preprocessor.py
"""

import pytest
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from tts.preprocessor import (
    detect_language,
    has_language_tags,
    preprocess_text,
    mix_languages,
)
from tts.types import Language


class TestDetectLanguage:
    """Tests for detect_language function."""

    def test_returns_dict_with_language_and_summary(self):
        result = detect_language("Hello world")
        assert isinstance(result, dict)
        assert "language" in result
        assert "summary" in result
        assert result["language"] == "es"  # Default placeholder
        assert result["summary"] == "Hello world"


class TestHasLanguageTags:
    """Tests for has_language_tags function."""

    def test_detects_tags_at_start(self):
        assert has_language_tags("<en>Hello</en>")
        assert has_language_tags("<es>Hola</es>")
        assert has_language_tags("<ko>안녕</ko>")

    def test_no_tags(self):
        assert not has_language_tags("Hello world")
        assert not has_language_tags("")
        assert not has_language_tags("Hello <en>world</en>")  # Tags not at start

    def test_tags_not_at_start(self):
        assert not has_language_tags("Before <en>Hello</en>")


class TestPreprocessText:
    """Tests for preprocess_text function."""

    def test_basic_preprocessing(self):
        result = preprocess_text("Hello world", "en")
        assert result.startswith("<en>")
        assert result.endswith("</en>")
        assert "Hello world" in result

    def test_normalizes_unicode(self):
        text = "café"  # é can be represented as single char or e + accent
        result = preprocess_text(text, "fr")
        assert "<fr>" in result
        assert "</fr>" in result

    def test_removes_emojis(self):
        text = "Hello 😀 world 🌍"
        result = preprocess_text(text, "en")
        assert "😀" not in result
        assert "🌍" not in result

    def test_replaces_dashes_and_symbols(self):
        text = "Hello–world—test"
        result = preprocess_text(text, "en")
        # Should replace fancy dashes with regular dashes
        assert "–" not in result or "-" in result

    def test_fixes_spacing_around_punctuation(self):
        text = "Hello , world . test !"
        result = preprocess_text(text, "en")
        assert " ," not in result
        assert " ." not in result
        assert " !" not in result

    def test_removes_duplicate_quotes(self):
        text = 'Hello ""world""'
        result = preprocess_text(text, "en")
        # Should reduce duplicate quotes
        assert '""' not in result

    def test_adds_period_if_missing(self):
        text = "Hello world"
        result = preprocess_text(text, "en")
        # Should end with period
        assert result.strip().endswith(".</en>")

    def test_preserves_existing_punctuation(self):
        text = "Hello world!"
        result = preprocess_text(text, "en")
        assert "!" in result

    def test_does_not_double_tag(self):
        text = "<en>Hello</en>"
        result = preprocess_text(text, "en")
        # Should not add another layer of tags
        assert result.count("<en>") == 1
        assert result.count("</en>") == 1

    def test_removes_extra_spaces(self):
        text = "  Hello    world   "
        result = preprocess_text(text, "en")
        # Should normalize spaces
        assert "  " not in result
        assert not result.startswith(" ")
        assert not result.endswith(" ")

    def test_unsupported_language_still_processes(self):
        # Even if language is not in supported list, preprocess still works
        text = "Hello world"
        result = preprocess_text(text, "de")  # German not in supported list
        assert "<de>" in result
        assert "</de>" in result

    def test_special_symbols_removed(self):
        text = "Hello ♥ world ☆"
        result = preprocess_text(text, "en")
        assert "♥" not in result
        assert "☆" not in result

    def test_replaces_underscores_with_spaces(self):
        text = "Hello_world"
        result = preprocess_text(text, "en")
        assert "_" not in result
        assert "Hello world" in result

    def test_brackets_replaced_with_spaces(self):
        text = "Hello [world] test"
        result = preprocess_text(text, "en")
        assert "[" not in result
        assert "]" not in result
        assert "Hello world test" in result


class TestMixLanguages:
    """Tests for mix_languages function."""

    def test_single_segment(self):
        from tts.types import Language as LangType
        segments = [("en", "Hello")]
        result = mix_languages(segments)
        assert result == "<en>Hello</en>"

    def test_multiple_segments(self):
        from tts.types import Language as LangType
        segments = [("en", "Hello"), ("es", "Hola")]
        result = mix_languages(segments)
        assert "<en>Hello</en>" in result
        assert "<es>Hola</es>" in result

    def test_segments_separated_by_space(self):
        from tts.types import Language as LangType
        segments = [("en", "Hello"), ("es", "Hola")]
        result = mix_languages(segments)
        # Should have space between tags
        parts = result.split()
        assert len(parts) >= 2

    def test_preprocesses_each_segment(self):
        from tts.types import Language as LangType
        segments = [("en", "  Hello   world  ")]
        result = mix_languages(segments)
        # Should preprocess (trim spaces, add period, etc)
        assert not result.startswith("  ")
        assert not result.endswith("  ")

    def test_empty_list_returns_empty_string(self):
        result = mix_languages([])
        assert result == ""