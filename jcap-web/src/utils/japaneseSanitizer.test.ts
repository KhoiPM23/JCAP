import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeDisplayJapanese,
  containsJapanese,
  extractJapaneseKeywords,
  deriveJapaneseCloze,
  isWhisperHallucination,
  cleanFuriganaHtml,
  cleanPedagogicMeaning,
} from './japaneseSanitizer.ts';

describe('japaneseSanitizer', () => {
  it('should preserve clean Japanese utterances', () => {
    const input = '本当にありがとうございます。';
    assert.equal(sanitizeDisplayJapanese(input), '本当にありがとうございます。');

    // Robust ruby stripping tests: HTML5 unclosed rt, html entities, and {base|reading}
    assert.equal(sanitizeDisplayJapanese('<ruby>切符<rt>きっぷ</ruby>を買います'), '切符を買います');
    assert.equal(sanitizeDisplayJapanese('&lt;ruby&gt;面接&lt;rt&gt;めんせつ&lt;/rt&gt;&lt;/ruby&gt;です。'), '面接です。');
    assert.equal(sanitizeDisplayJapanese('{温|あたた}める'), '温める');
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
  it('cleanFuriganaHtml should sanitize invalid ruby tags and strip spaces between Japanese characters', () => {
    const rawAiOutput = 'すみません、実 <ruby>は海老<rt>えび</rt></ruby> <ruby>や蟹<rt>かに</rt></ruby> などの<ruby>甲殻類<rt>こうかくるい</rt></ruby> が、スープに<ruby>海鮮<rt>かいせん</rt></ruby> ダシは<ruby>使<rt>つか</rt></ruby> われていますか？';
    const cleaned = cleanFuriganaHtml(rawAiOutput);
    assert.equal(
      cleaned,
      'すみません、実は<ruby>海老<rt>えび</rt></ruby>や<ruby>蟹<rt>かに</rt></ruby>などの<ruby>甲殻類<rt>こうかくるい</rt></ruby>が、スープに<ruby>海鮮<rt>かいせん</rt></ruby>ダシは<ruby>使<rt>つか</rt></ruby>われていますか？'
    );
  });

  it('cleanFuriganaHtml should extract leading particle out of ruby tag', () => {
    const raw = '<ruby>は海老<rt>えび</rt></ruby>';
    assert.equal(cleanFuriganaHtml(raw), 'は<ruby>海老<rt>えび</rt></ruby>');
  });

  it('cleanFuriganaHtml should extract okurigana suffix matching rt', () => {
    const raw = '<ruby>使われ<rt>つかわれ</rt></ruby>';
    assert.equal(cleanFuriganaHtml(raw), '<ruby>使<rt>つか</rt></ruby>われ');
  });

  it('cleanFuriganaHtml should unwrap ruby if base contains only kana', () => {
    const raw = '<ruby>が<rt>が</rt></ruby>';
    assert.equal(cleanFuriganaHtml(raw), 'が');
  });

  it('cleanPedagogicMeaning should prune complex grammar formulas and romaji notes', () => {
    const rawGrammar = 'Tôi bị dị ứng với... nên là... [N + アレルギーがあるのですが] (Trình bày lý do y tế tế nhị trước khi yêu cầu)';
    assert.equal(cleanPedagogicMeaning(rawGrammar), 'Tôi bị dị ứng với... nên là...');

    const rawVocab = 'Tính tiền / Thanh toán hóa đơn (Okaikei) • N5 [Danh từ] • お会計をお願いします';
    assert.equal(cleanPedagogicMeaning(rawVocab), 'Tính tiền / Thanh toán hóa đơn');

    const rawRequest = 'Xin vui lòng hâm nóng... giúp tôi [N + を温めてください] (Yêu cầu nhân viên hâm nóng đồ ăn)';
    assert.equal(cleanPedagogicMeaning(rawRequest), 'Xin vui lòng hâm nóng... giúp tôi');
  });
});