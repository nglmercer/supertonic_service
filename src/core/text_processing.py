"""
Text processing utilities for Supertonic API.
Handles language tagging, sanitization, and text manipulation.
"""

import re
from typing import Optional
from .enums import Language
from .constants import SUPPORTED_LANGUAGES


# ============== Language Tagging ==============

LANGUAGE_TAG_PATTERN = re.compile(r'^<([a-z]{2})>(.*?)</([a-z]{2})>$', re.DOTALL)


def has_language_tags(text: str) -> bool:
    """Check if text already has language tags."""
    return bool(LANGUAGE_TAG_PATTERN.match(text.strip()))


def extract_language_from_tags(text: str) -> Optional[str]:
    """Extract language code from language tags if present."""
    match = LANGUAGE_TAG_PATTERN.match(text.strip())
    if match:
        lang = match.group(1)
        closing_lang = match.group(3)
        if lang == closing_lang:
            return lang
    return None


def wrap_with_language_tags(text: str, lang: str) -> str:
    """
    Wrap text with language tags only if not already tagged.

    Example:
        wrap_with_language_tags("Hello", "en") -> "<en>Hello</en>"
        wrap_with_language_tags("<en>Hello</en>", "en") -> "<en>Hello</en>"

    Args:
        text: The text to wrap
        lang: Language code (e.g., "en", "ko", "es")

    Returns:
        Text wrapped in language tags
    """
    text = text.strip()

    # Check if already tagged with matching language
    if has_language_tags(text):
        extracted = extract_language_from_tags(text)
        if extracted == lang:
            return text

    # Remove existing tags if present
    text = strip_language_tags(text)

    return f"<{lang}>{text}</{lang}>"


def strip_language_tags(text: str) -> str:
    """Remove language tags from text."""
    match = LANGUAGE_TAG_PATTERN.match(text.strip())
    if match:
        return match.group(2).strip()
    return text


def wrap_text_multilingual(text: str, language: Language) -> str:
    """Wrap text with appropriate language tags."""
    return wrap_with_language_tags(text, language.value)


# ============== Text Sanitization ==============

CONTROL_CHARS_PATTERN = re.compile(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]')
NULL_CHAR_PATTERN = re.compile(r'\x00')
MULTIPLE_WHITESPACE_PATTERN = re.compile(r'\s+')


def sanitize_text(text: str, preserve_newlines: bool = True) -> str:
    """
    Sanitize input text by removing invalid characters.

    Args:
        text: Text to sanitize
        preserve_newlines: Whether to preserve newline characters

    Returns:
        Sanitized text
    """
    # Remove null characters
    text = text.replace('\x00', '')

    # Remove control characters
    text = CONTROL_CHARS_PATTERN.sub('', text)

    # Normalize whitespace (optional)
    # text = MULTIPLE_WHITESPACE_PATTERN.sub(' ', text)

    return text.strip()


def normalize_whitespace(text: str) -> str:
    """Normalize multiple whitespace characters to single space."""
    return MULTIPLE_WHITESPACE_PATTERN.sub(' ', text)


# ============== Text Chunking ==============

SENTENCE_ENDINGS = re.compile(r'[.!?]+\s*')
PARAGRAPH_SEPARATOR = re.compile(r'\n\s*\n')


def split_into_sentences(text: str) -> list[str]:
    """Split text into sentences."""
    sentences = SENTENCE_ENDINGS.split(text)
    # Filter empty strings and re-add the ending punctuation
    result = []
    for i, sentence in enumerate(sentences):
        if sentence.strip():
            # Find the ending
            match = SENTENCE_ENDINGS.search(text, len(sentence) if i == 0 else 0)
            ending = match.group(0) if match else ""
            result.append(sentence.strip() + ending)
    return result


def split_into_chunks(
    text: str,
    max_length: int = 300,
    preserve_sentences: bool = True,
) -> list[str]:
    """
    Split text into manageable chunks.

    Args:
        text: Text to split
        max_length: Maximum chunk length
        preserve_sentences: Whether to try to split at sentence boundaries

    Returns:
        List of text chunks
    """
    if len(text) <= max_length:
        return [text.strip()] if text.strip() else []

    chunks = []
    current_chunk = ""

    if preserve_sentences:
        sentences = split_into_sentences(text)
        for sentence in sentences:
            if len(current_chunk) + len(sentence) + 1 <= max_length:
                current_chunk += (" " if current_chunk else "") + sentence
            else:
                if current_chunk:
                    chunks.append(current_chunk.strip())
                # Start new chunk with sentence
                if len(sentence) <= max_length:
                    current_chunk = sentence
                else:
                    # Sentence too long, split by words
                    words = sentence.split()
                    current_chunk = ""
                    for word in words:
                        if len(current_chunk) + len(word) + 1 <= max_length:
                            current_chunk += (" " if current_chunk else "") + word
                        else:
                            if current_chunk:
                                chunks.append(current_chunk.strip())
                            current_chunk = word
    else:
        words = text.split()
        for word in words:
            if len(current_chunk) + len(word) + 1 <= max_length:
                current_chunk += (" " if current_chunk else "") + word
            else:
                chunks.append(current_chunk.strip())
                current_chunk = word

    if current_chunk:
        chunks.append(current_chunk.strip())

    return chunks


# ============== Character Validation ==============

def get_unsupported_characters(text: str) -> set:
    """Identify unsupported characters in text."""
    # Basic ASCII + extended Latin + common punctuation
    supported_pattern = re.compile(r'^[\x20-\x7E\xA0-\xFF\s]+$')
    unsupported = set()
    for char in text:
        if char == '\x00':
            continue  # Skip null
        if not supported_pattern.match(char) and char not in '\n\t':
            unsupported.add(char)
    return unsupported


def count_characters(text: str) -> dict:
    """Count character statistics."""
    return {
        "total": len(text),
        "letters": len(re.findall(r'[A-Za-z]', text)),
        "numbers": len(re.findall(r'[0-9]', text)),
        "spaces": len(re.findall(r'\s', text)),
        "punctuation": len(re.findall(r'[^\w\s]', text)),
    }


# ============== Language-Specific Processing ==============

LANGUAGE_TEXT_LENGTH_GUIDELINES = {
    "en": {"max_length": 5000, "recommended_chunk": 300},
    "ko": {"max_length": 5000, "recommended_chunk": 300},
    "es": {"max_length": 5000, "recommended_chunk": 300},
    "pt": {"max_length": 5000, "recommended_chunk": 300},
    "fr": {"max_length": 5000, "recommended_chunk": 300},
}


def get_language_guidelines(lang: str) -> dict:
    """Get text processing guidelines for a language."""
    return LANGUAGE_TEXT_LENGTH_GUIDELINES.get(
        lang.lower(),
        {"max_length": 5000, "recommended_chunk": 300}
    )


def prepare_text_for_synthesis(
    text: str,
    language: Language,
    wrap_tags: bool = True,
) -> str:
    """
    Prepare text for TTS synthesis.

    Args:
        text: Input text
        language: Target language
        wrap_tags: Whether to wrap with language tags

    Returns:
        Processed text ready for synthesis
    """
    # Sanitize
    text = sanitize_text(text)

    # Wrap with language tags if requested
    if wrap_tags:
        text = wrap_with_language_tags(text, language.value)

    return text


__all__ = [
    'has_language_tags',
    'extract_language_from_tags',
    'wrap_with_language_tags',
    'strip_language_tags',
    'wrap_text_multilingual',
    'sanitize_text',
    'normalize_whitespace',
    'split_into_sentences',
    'split_into_chunks',
    'get_unsupported_characters',
    'count_characters',
    'get_language_guidelines',
    'prepare_text_for_synthesis',
]
