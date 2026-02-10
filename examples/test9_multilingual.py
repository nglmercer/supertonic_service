"""
Example 9: Multilingual Synthesis (with Core Module)

Demonstrates Supertonic-2's multilingual support using the core module.
Supported languages: English (en), Korean (ko), Spanish (es), Portuguese (pt), French (fr)
"""

import os
import sys

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.core import (
    Language,
    Voice,
    wrap_with_language_tags,
    validate_language,
    get_voice_file,
    get_voice_url,
    ExampleTexts,
    OutputPaths,
)

# Import supertonic for actual TTS
from supertonic import TTS


os.makedirs(OutputPaths.TEST9, exist_ok=True)

tts = TTS()
style = tts.get_voice_style("M1")

# Multilingual examples using core module utilities
examples = [
    (Language.ENGLISH, ExampleTexts.ENGLISH),
    (Language.KOREAN, ExampleTexts.KOREAN),
    (Language.SPANISH, ExampleTexts.SPANISH),
    (Language.PORTUGUESE, ExampleTexts.PORTUGUESE),
    (Language.FRENCH, ExampleTexts.FRENCH),
]

print("🌐 Multilingual TTS Examples (with Core Module)\n")
print("=" * 60)
print(f"Voice: M1 ({get_voice_file('M1')})")
print(f"Voice URL: {get_voice_url('M1')}")
print("=" * 60)

for lang, text in examples:
    # Wrap text with language tags using core utility
    tagged_text = wrap_with_language_tags(text, lang.value)

    wav, duration = tts.synthesize(tagged_text, voice_style=style, lang=lang.value)
    output_path = f"{OutputPaths.TEST9}/multilingual_{lang.value}.wav"
    tts.save_audio(wav, output_path)

    print(f"[{lang.value.upper()}] {duration[0]:.2f}s → {output_path}")
    print(f"     Tagged: {tagged_text[:60]}{'...' if len(tagged_text) > 60 else ''}")
    print()

print("=" * 60)
print("✅ All multilingual examples generated successfully!")

# Demonstrate validation utilities
print("\n📋 Core Module Validation Demo:")
print("-" * 40)

# Validate languages
for lang_code in ["en", "ko", "es", "pt", "fr", "de"]:
    try:
        lang = validate_language(lang_code)
        print(f"✓ Language '{lang_code}' validated: {lang.value}")
    except ValueError as e:
        print(f"✗ Language '{lang_code}' failed: {e}")

# Validate voices
for voice_key in ["M1", "F2", "M10"]:
    try:
        voice = Voice.from_key(voice_key)
        print(f"✓ Voice '{voice_key}' validated: {voice.value}")
    except ValueError as e:
        print(f"✗ Voice '{voice_key}' failed: {e}")
