import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeDisplayJapanese,
  containsJapanese,
  extractJapaneseKeywords,
  deriveJapaneseCloze,
  isWhisperHallucination,
} from './japaneseSanitizer.ts';

describe('japaneseSanitizer', () => {
  it('should preserve clean Japanese utterances', () => {
    const input = '本当にありがとうございます。';
    assert.equal(sanitizeDisplayJapanese(input), '本当にありがとうございます。');
  });

  it('should remove trailing leaked Vietnamese speech', () => {
    const input = '本当にありがとうございます。 cháu thật là một người tốt bụng. Cháu hãy đi cẩn thận nhé.';
    assert.equal(sanitizeDisplayJapanese(input), '本当にありがとうございます。');
  });

  it('should remove parenthesized Vietnamese meaning', () => {
    const input = 'いらっしゃいませ。(Kính chào quý khách)';
    assert.equal(sanitizeDisplayJapanese(input), 'いらっしゃいませ。');
  });

  it('should add terminal period if missing when truncated', () => {
    const input = 'ありがとうございます cháu tốt bụng';
    assert.equal(sanitizeDisplayJapanese(input), 'ありがとうございます。');
  });

  it('should return empty string for null or empty input', () => {
    assert.equal(sanitizeDisplayJapanese(''), '');
  });

  it('containsJapanese should correctly identify Japanese vs non-Japanese strings', () => {
    assert.equal(containsJapanese('スープには何が入っていますか'), true);
    assert.equal(containsJapanese('ラーメン'), true);
    assert.equal(containsJapanese('Soup broth ingredients'), false);
    assert.equal(containsJapanese('Explain seafood allergy'), false);
    assert.equal(containsJapanese(''), false);
    assert.equal(containsJapanese(null), false);
  });

  it('extractJapaneseKeywords should extract meaningful Katakana and Kanji keywords', () => {
    const sentence = 'スープには具体的に何が入っていますか';
    const keywords = extractJapaneseKeywords(sentence);
    assert.ok(keywords.includes('スープ'));
    assert.ok(keywords.some((k) => k.includes('具体') || k.includes('何') || k.includes('入')));
  });

  it('deriveJapaneseCloze should create a template with blank placeholder', () => {
    const sentence = 'スープには具体的に何が入っていますか';
    const cloze = deriveJapaneseCloze(sentence);
    assert.ok(cloze.includes('[ ______ ]'));
  });
  it('isWhisperHallucination should catch YouTube subtitle and silent hallucinations', () => {
    assert.equal(isWhisperHallucination('ご視聴ありがとうございました'), true);
    assert.equal(isWhisperHallucination('チャンネル登録お願いします'), true);
    assert.equal(isWhisperHallucination('...'), true);
    assert.equal(isWhisperHallucination(''), true);
    assert.equal(isWhisperHallucination('ラーメンを一つお願いします'), false);
  });
});