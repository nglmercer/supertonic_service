import type { Language } from './types.js';

/**
 * Custom middleware for language detection (placeholder for future implementation)
 * Currently returns a fixed language and the original text as summary
 */
export function detectLanguage(txt: string): { language: string; summary: string } {
    // this is a custom middleware for preprocess text
    // not implemented yet
    return {
        language: 'es',
        summary: txt,
    };
}

/**
 * Check if text already contains language tags
 */
function hasLanguageTags(text: string): boolean {
    return /^<([a-z]{2})>/.test(text);
}

/**
 * Preprocess and normalize text for TTS synthesis
 * Cleans text, removes emojis, normalizes punctuation, and wraps with language tags
 *
 * @param text - Input text to preprocess. Can be plain text or already tagged with language markers
 * @param lang - Language code to use for tagging (ignored if text already has tags)
 */
export function preprocessText(text: string, lang: Language): string {
    // TODO: Need advanced normalizer for better performance
    text = text.normalize('NFKD');

    // Remove emojis (wide Unicode range)
    const emojiPattern = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}]+/gu;
    text = text.replace(emojiPattern, '');

    // Replace various dashes and symbols
    const replacements = {
        '–': '-',
        '‑': '-',
        '—': '-',
        '_': ' ',
        '\u201C': '"',  // left double quote "
        '\u201D': '"',  // right double quote "
        '\u2018': "'",  // left single quote '
        '\u2019': "'",  // right single quote '
        '´': "'",
        '`': "'",
        '[': ' ',
        ']': ' ',
        '|': ' ',
        '/': ' ',
        '#': ' ',
        '→': ' ',
        '←': ' ',
    };
    for (const [k, v] of Object.entries(replacements)) {
        text = text.replaceAll(k, v);
    }

    // Remove special symbols
    text = text.replace(/[♥☆♡©\\]/g, '');

    // Fix spacing around punctuation
    text = text.replace(/ ,/g, ',');
    text = text.replace(/ \./g, '.');
    text = text.replace(/ !/g, '!');
    text = text.replace(/ \?/g, '?');
    text = text.replace(/ ;/g, ';');
    text = text.replace(/ :/g, ':');
    text = text.replace(/ '/g, "'");

    // Remove duplicate quotes
    while (text.includes('""')) {
        text = text.replace('""', '"');
    }
    while (text.includes("''")) {
        text = text.replace("''", "'");
    }
    while (text.includes('``')) {
        text = text.replace('``', '`');
    }

    // Remove extra spaces
    text = text.replace(/\s+/g, ' ').trim();

    // If text doesn't end with punctuation, quotes, or closing brackets, add a period
    if (!/[.!?;:,'\"')\]}…。」』】〉》›»]$/.test(text)) {
        text += '.';
    }

    // Wrap text with language tags only if not already tagged
    if (!hasLanguageTags(text)) {
        text = `<${lang}>` + text + `</${lang}>`;
    }

    return text;
}

/**
 * Utility to create mixed-language text by combining segments with different languages
 * Example: mixLanguages([{lang: 'en', text: 'Hello'}, {lang: 'es', text: 'Hola'}])
 * Returns: "<en>Hello</en> <es>Hola</es>"
 */
export function mixLanguages(segments: Array<{ lang: Language; text: string }>): string {
    return segments
        .map(seg => `<${seg.lang}>${preprocessText(seg.text, seg.lang)}</${seg.lang}>`)
        .join(' ');
}
