import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeDisplayJapanese,
  containsJapanese,
  extractJapaneseKeywords,
  deriveJapaneseCloze,
  isWhisperHallucination,
  cleanFuriganaHtml,
  alignFuriganaWithOriginal,
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

  it('cleanFuriganaHtml (#193) should normalize HTML5 unclosed <rt> and encoded ruby tags', () => {
    assert.equal(
      cleanFuriganaHtml('<ruby>切符<rt>きっぷ</ruby>を買います'),
      '<ruby>切符<rt>きっぷ</rt></ruby>を買います'
    );
    assert.equal(
      cleanFuriganaHtml('&lt;ruby&gt;面接&lt;rt&gt;めんせつ&lt;/rt&gt;&lt;/ruby&gt;です。'),
      '<ruby>面接<rt>めんせつ</rt></ruby>です。'
    );
  });

  it('cleanFuriganaHtml (#193) should reject non-kana <rt> content and strip unsafe HTML / XSS payloads', () => {
    // Kanji or Vietnamese or Latin inside <rt> must be unwrapped to plain base text
    assert.equal(cleanFuriganaHtml('<ruby>切符<rt>切符</rt></ruby>'), '切符');
    assert.equal(cleanFuriganaHtml('<ruby>切符<rt>vé tàu</rt></ruby>'), '切符');
    assert.equal(cleanFuriganaHtml('<ruby>切符<rt><script>alert(1)</script></rt></ruby>'), '切符');
    assert.equal(cleanFuriganaHtml('<ruby>切符<rt><img src=x onerror=alert(1)>きっぷ</rt></ruby>'), '切符');

    // Arbitrary unsafe HTML tags outside ruby must be stripped, stray < / > escaped
    assert.equal(
      cleanFuriganaHtml('<img src=x onerror=alert(1)><ruby>駅<rt>えき</rt></ruby><script>alert(1)</script>'),
      '<ruby>駅<rt>えき</rt></ruby>'
    );
    assert.equal(
      cleanFuriganaHtml('3 < 5 <ruby>駅<rt>えき</rt></ruby>'),
      '3 &lt; 5 <ruby>駅<rt>えき</rt></ruby>'
    );
  });

  it('alignFuriganaWithOriginal (#193) should prevent Kanji injection on Hiragana input and preserve valid ruby on Kanji input', () => {
    // Hiragana-only original must never receive Kanji from AI furiganaHtml
    assert.equal(
      alignFuriganaWithOriginal('<ruby>切符<rt>きっぷ</rt></ruby>を<ruby>買<rt>か</rt></ruby>います', 'きっぷをかいます'),
      'きっぷをかいます'
    );

    // Kanji mismatch or dropped characters regenerate clean furigana aligned with originalText
    const aligned = alignFuriganaWithOriginal(
      '<ruby>切符<rt>きっぷ</rt></ruby>をかいます<script>alert(1)</script>',
      '切符を買います'
    );
    assert.equal(aligned.includes('<script>'), false);
    assert.ok(aligned.includes('<ruby>切符<rt>きっぷ</rt></ruby>'));
    assert.ok(aligned.includes('<ruby>買<rt>か</rt></ruby>います'));
  });

  it('cleanFuriganaHtml & alignFuriganaWithOriginal (#193) should block unclosed <img XSS inside ruby rawBase and echoed originalText', () => {
    const xssPayload = '<ruby>駅<img src=x onerror=alert(1) alt="東京<rt>えき</rt></ruby>';
    const cleaned = cleanFuriganaHtml(xssPayload);
    assert.equal(cleaned.includes('<img'), false);
    assert.equal(cleaned.includes('onerror='), false);
    assert.equal(cleaned.includes('<ruby>'), false);

    // Empty originalText fallback must also be XSS-free
    const alignedEmpty = alignFuriganaWithOriginal(xssPayload, '');
    assert.equal(alignedEmpty.includes('<img'), false);
    assert.equal(alignedEmpty.includes('onerror='), false);

    // Echoed originalText containing unclosed <img tag must never emit live HTML
    const echoedOriginal = '駅<img src=x onerror=alert(1) alt="東京';
    const alignedEchoed = alignFuriganaWithOriginal(xssPayload, echoedOriginal);
    assert.equal(alignedEchoed.includes('<img'), false);
    assert.equal(alignedEchoed.includes('onerror='), false);

    // Non-kanji originalText with literal < or unclosed <img must be stripped/escaped
    const alignedKanaXss = alignFuriganaWithOriginal('<ruby>切符<rt>きっぷ</rt></ruby>', 'きっぷ<img src=x onerror=alert(1)');
    assert.equal(alignedKanaXss.includes('<img'), false);
    assert.equal(alignedKanaXss.includes('onerror='), false);
    assert.equal(alignFuriganaWithOriginal('<ruby>切符<rt>きっぷ</rt></ruby>', '3 < 5 きっぷ'), '3 &lt; 5 きっぷ');
  });
});