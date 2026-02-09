"""
Comprehensive demo script for Supertonic TTS Python implementation.
Demonstrates various usage patterns:
- Auto language detection
- Explicit language specification
- Mixed-language synthesis (multiple languages in one audio)
- Different voices and rate options

Run with: python demo.py

Note: This demo will automatically download ONNX models and voice styles from HuggingFace on first run.
"""

import asyncio
import sys
from pathlib import Path

# Add src to path for imports
sys.path.insert(0, str(Path(__file__).parent / "src"))

from tts import TTSService, mix_languages, preprocess_text, VOICES, get_asset_manager


async def main():
    try:
        print("=" * 60)
        print("SUPERTONIC TTS DEMO")
        print("=" * 60)
        print(f"\nAvailable voices: {list(VOICES.keys())}")
        print("Supported languages: ['en', 'ko', 'es', 'pt', 'fr']")
        print('\n' + '-' * 60)
        
        # Ensure output directory exists
        output_dir = Path('./output')
        output_dir.mkdir(exist_ok=True)
        
        # Initialize asset manager (downloads models on first run if needed)
        print("\n[Setup] Initializing asset manager...")
        asset_manager = get_asset_manager()
        print("  ✓ Asset manager ready")
        
        # Create TTS service with output directory (singleton)
        tts = TTSService.get_instance(str(output_dir))
        
        # ============================================
        # Example 1: Auto language detection (English)
        # ============================================
        print('\n[1] Auto-detecting English text:')
        text1 = "Hello, this is a test of the Supertonic TTS system. It works great!"
        result1 = await tts.synthesize(
            text1,
            'F1',           # voice: Female 1
            'auto_english', # filename base
            write_to_file=True
        )
        print(f'   ✓ Saved to: {result1.saved_path}')
        print(f'   Language: {result1.detected_language}')
        
        # ============================================
        # Example 2: Explicit Spanish language
        # ============================================
        print('\n[2] Explicit Spanish text:')
        text2 = "Hola, este es un ejemplo en español. ¡Funciona muy bien!"
        result2 = await tts.synthesize(
            text2,
            'M1',           # voice: Male 1
            'explicit_spanish',
            write_to_file=True
        )
        print(f'   ✓ Saved to: {result2.saved_path}')
        print(f'   Language: {result2.detected_language} (explicit)')
        
        # ============================================
        # Example 3: Explicit Korean language
        # ============================================
        print('\n[3] Explicit Korean text:')
        text3 = "안녕하세요, 슈퍼토닉 TTS 시스템 테스트입니다."
        result3 = await tts.synthesize(
            text3,
            'F2',           # voice: Female 2
            'explicit_korean',
            write_to_file=True
        )
        print(f'   ✓ Saved to: {result3.saved_path}')
        print(f'   Language: {result3.detected_language} (explicit)')
        
        # ============================================
        # Example 4: Mixed-language synthesis
        # ============================================
        print('\n[4] Mixed-language text (English + Spanish):')
        mixed_text = mix_languages([
            ('en', 'Hello, welcome to'),
            ('es', 'nuestro sistema de TTS'),
            ('en', 'Have a nice day!')
        ])
        print(f'   Mixed text: {mixed_text.replace("<en>", "").replace("</en>", "").replace("<es>", "").replace("</es>", "")}')
        
        result4 = await tts.synthesize_mixed(
            mixed_text,
            'F3',           # voice: Female 3
            'mixed_languages',
            write_to_file=True
        )
        print(f'   ✓ Saved to: {result4.saved_path}')
        
        # ============================================
        # Example 5: Custom language detector middleware
        # ============================================
        print('\n[5] Using custom language detector:')
        # Create a custom detector (could call external API like Google Translate, etc.)
        def custom_detector(text):
            print(f'   [Custom detector] Analyzing: "{text[:30]}..."')
            # Simple heuristic: detect language based on character ranges
            if any('\uac00' <= c <= '\ud7a3' for c in text):  # Korean range
                return {"language": "ko", "summary": text}
            elif any(c in 'ñáéíóúü' for c in text):
                return {"language": "es", "summary": text}
            else:
                return {"language": "en", "summary": text}
        
        # Get TTS service with custom detector (singleton with custom config on first call)
        TTSService.reset_instance()
        custom_tts = TTSService.get_instance('./output', language_detector=custom_detector)
        
        custom_text = "Hola, this is a mixed text with español and English."
        custom_result = await custom_tts.synthesize(
            custom_text,
            'M2',
            'custom_detector_example',
            write_to_file=True
        )
        print(f'   ✓ Saved to: {custom_result.saved_path}')
        print(f'   Detected language: {custom_result.detected_language}')
        
        # ============================================
        # Example 6: Using utility functions directly
        # ============================================
        print('\n[6] Using preprocessor utilities directly:')
        
        raw_text = "  Hello   world!  "
        processed = preprocess_text(raw_text, 'en')
        print(f'   Raw: "{raw_text}"')
        print(f'   Processed: "{processed.replace("<en>", "").replace("</en>", "")}"')
        
        # ============================================
        # Summary
        # ============================================
        print('\n' + '=' * 60)
        print('DEMO COMPLETE!')
        print('Generated files are in the ./output directory')
        print('=' * 60)
        
    except Exception as error:
        print(f'\n❌ Error in demo: {error}')
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == '__main__':
    asyncio.run(main())