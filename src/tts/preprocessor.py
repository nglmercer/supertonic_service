"""
Text preprocessing and language detection utilities for Supertonic TTS.
"""

import re
from typing import List, Tuple, Any
from unicodedata import normalize
from .types import Language
from .constants import SUPPORTED_LANGUAGES
from .utils import is_supported_language


def detect_language(txt: str) -> dict:
    """
    Custom middleware for language detection.
    Currently returns a fixed language and the original text as summary.
    This is a placeholder for future implementation.
    """
    return {
        "language": "es",
        "summary": txt,
    }


def has_language_tags(text: str) -> bool:
    """Check if text already contains language tags."""
    return bool(re.match(r'^<([a-z]{2})>', text))


def preprocess_text(text: str, lang: Language) -> str:
    """
    Preprocess and normalize text for TTS synthesis.
    Cleans text, removes emojis, normalizes punctuation, and wraps with language tags.

    Args:
        text: Input text to preprocess. Can be plain text or already tagged with language markers
        lang: Language code to use for tagging (ignored if text already has tags)

    Returns:
        Preprocessed text with language tags
    """
    # TODO: Need advanced normalizer for better performance
    text = normalize('NFKD', text)

    # Remove emojis (wide Unicode range)
    emoji_pattern = re.compile(
        '[\U0001f600-\U0001f64f'  # emoticons
        '\U0001f300-\U0001f5ff'  # symbols & pictographs
        '\U0001f680-\U0001f6ff'  # transport & map symbols
        '\U0001f700-\U0001f77f'
        '\U0001f780-\U0001f7ff'
        '\U0001f800-\U0001f8ff'
        '\U0001f900-\U0001f9ff'
        '\U0001fa00-\U0001fa6f'
        '\U0001fa70-\U0001faff'
        '\u2600-\u26ff'
        '\u2700-\u27bf'
        '\U0001f1e6-\U0001f1ff]+',
        flags=re.UNICODE,
    )
    text = emoji_pattern.sub('', text)

    # Replace various dashes and symbols
    replacements = {
        '–': '-',
        '‑': '-',
        '—': '-',
        '_': ' ',
        '\u201c': '"',  # left double quote "
        '\u201d': '"',  # right double quote "
        '\u2018': "'",  # left single quote '
        '\u2019': "'",  # right single quote '
        '´': "'",
        '`': "'",
        '[': ' ',
        ']': ' ',
        '|': ' ',
        '/': ' ',
        '#': ' ',
        '→': ' ',
        '←': ' ',
    }
    for k, v in replacements.items():
        text = text.replace(k, v)

    # Remove special symbols
    text = re.sub(r'[♥☆♡©\\]', '', text)

    # Fix spacing around punctuation
    text = re.sub(r' ,', ',', text)
    text = re.sub(r' \.', '.', text)
    text = re.sub(r' !', '!', text)
    text = re.sub(r' \?', '?', text)
    text = re.sub(r' ;', ';', text)
    text = re.sub(r' :', ':', text)
    text = re.sub(r" '", "'", text)

    # Remove duplicate quotes
    while '""' in text:
        text = text.replace('""', '"')
    while "''" in text:
        text = text.replace("''", "'")
    while "``" in text:
        text = text.replace("``", "`")

    # Remove extra spaces
    text = re.sub(r'\s+', ' ', text).strip()

    # If text doesn't end with punctuation, quotes, or closing brackets, add a period
    if not re.search(r'[.!?;:,\'"\')\]}…。」』】〉》›»]$', text):
        text += '.'

    # Wrap text with language tags only if not already tagged
    if not has_language_tags(text):
        text = f'<{lang}>' + text + f'</{lang}>'

    return text


def mix_languages(segments: List[Tuple[Language, str]]) -> str:
    """
    Utility to create mixed-language text by combining segments with different languages.
    
    Example: mix_languages([('en', 'Hello'), ('es', 'Hola')])
    Returns: "<en>Hello</en> <es>Hola</es>"
    """
    return ' '.join([f'<{lang}>{preprocess_text(text, lang)}</{lang}>' 
                     for lang, text in segments])