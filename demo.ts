/**
 * Comprehensive demo script for Supertonic TTS
 * Demonstrates various usage patterns:
 * - Auto language detection
 * - Explicit language specification
 * - Mixed-language synthesis (multiple languages in one audio)
 * - Different voices and rate options
 *
 * Run with: bun run demo.ts
 */

import { TTSService } from './src/tts/service.js';
import { VOICES, mixLanguages, preprocessText } from './src/tts/index.js';
import type { Language } from './src/tts/types.js';

async function main() {
    try {
        // Create TTS service with output directory (singleton)
        const tts = TTSService.getInstance('./output');

        console.log('='.repeat(60));
        console.log('SUPERTONIC TTS DEMO');
        console.log('='.repeat(60));
        console.log('\nAvailable voices:', Object.keys(VOICES));
        console.log('Supported languages:', ['en', 'ko', 'es', 'pt', 'fr']);
        console.log('\n' + '-'.repeat(60));

        // ============================================
        // Example 1: Auto language detection (English)
        // ============================================
        console.log('\n[1] Auto-detecting English text:');
        const text1 = "Hello, this is a test of the Supertonic TTS system. It works great!";
        const result1 = await tts.synthesize(
            text1,
            'F1',           // voice: Female 1
            'auto_english', // filename base
            { rate: '0%' }  // normal speed
        );
        console.log(`   ✓ Saved to: ${result1.savedPath}`);
        console.log(`   Language: ${result1.detectedLanguage}`);

        // ============================================
        // Example 2: Explicit Spanish language
        // ============================================
        console.log('\n[2] Explicit Spanish text:');
        const text2 = "Hola, este es un ejemplo en español. ¡Funciona muy bien!";
        const result2 = await tts.synthesize(
            text2,
            'M1',           // voice: Male 1
            'explicit_spanish',
            { rate: '+10%' }, // 10% faster
            'es'             // explicit language override
        );
        console.log(`   ✓ Saved to: ${result2.savedPath}`);
        console.log(`   Language: ${result2.detectedLanguage} (explicit)`);

        // ============================================
        // Example 3: Explicit Korean language
        // ============================================
        console.log('\n[3] Explicit Korean text:');
        const text3 = "안녕하세요, 슈퍼토닉 TTS 시스템 테스트입니다.";
        const result3 = await tts.synthesize(
            text3,
            'F2',           // voice: Female 2
            'explicit_korean',
            { rate: '-5%' }, // 5% slower
            'ko'             // Korean
        );
        console.log(`   ✓ Saved to: ${result3.savedPath}`);
        console.log(`   Language: ${result3.detectedLanguage} (explicit)`);

        // ============================================
        // Example 4: Mixed-language synthesis
        // ============================================
        console.log('\n[4] Mixed-language text (English + Spanish):');
        const mixedText = mixLanguages([
            { lang: 'en', text: 'Hello, welcome to' },
            { lang: 'es', text: 'nuestro sistema de TTS' },
            { lang: 'en', text: 'Have a nice day!' }
        ]);
        console.log(`   Mixed text: ${mixedText.replace(/<[^>]+>/g, '')}`); // Strip tags for display

        const result4 = await tts.synthesizeMixed(
            mixedText,
            'F3',           // voice: Female 3
            'mixed_languages'
        );
        console.log(`   ✓ Saved to: ${result4.savedPath}`);

        // ============================================
        // Example 5: Custom language detector middleware
        // ============================================
        console.log('\n[5] Using custom language detector:');
        // Create a custom detector (could call external API like Google Translate, etc.)
        const customDetector = async (text: string) => {
            console.log(`   [Custom detector] Analyzing: "${text.substring(0, 30)}..."`);
            // Simple heuristic: detect language based on character ranges
            if (/[가-힣]/.test(text)) {
                return { language: 'ko', summary: text };
            } else if (/[ñáéíóúü]/.test(text)) {
                return { language: 'es', summary: text };
            } else {
                return { language: 'en', summary: text };
            }
        };

        // Get TTS service with custom detector (singleton with custom config on first call)
        const customTts = TTSService.getInstance('./output', customDetector);

        const customText = "Hola, this is a mixed text with español and English.";
        const customResult = await customTts.synthesize(
            customText,
            'M2',
            'custom_detector_example'
        );
        console.log(`   ✓ Saved to: ${customResult.savedPath}`);
        console.log(`   Detected language: ${customResult.detectedLanguage}`);

        // ============================================
        // Example 6: Using utility functions directly
        // ============================================
        console.log('\n[6] Using preprocessor utilities directly:');

        const rawText = "  Hello   world!  ";
        const processed = preprocessText(rawText, 'en');
        console.log(`   Raw: "${rawText}"`);
        console.log(`   Processed: "${processed.replace(/<[^>]+>/g, '')}"`); // Strip tags

        // ============================================
        // Summary
        // ============================================
        console.log('\n' + '='.repeat(60));
        console.log('DEMO COMPLETE!');
        console.log('Generated files are in the ./output directory');
        console.log('='.repeat(60));

    } catch (error) {
        console.error('\n❌ Error in demo:', error);
        process.exit(1);
    }
}

main();
