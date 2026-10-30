/**
 * ADVERSARIAL EMPIRICAL STRESS TEST HARNESS FOR FE-03 PHONETIC, AUDIO, AND TEXT UTILITIES
 * Executed via Node.js v22 with native TypeScript type-stripping
 */

import { countJapaneseMora } from '../src/utils/moraPhonetics.ts';
import {
  sanitizeDisplayJapanese,
  containsJapanese,
  extractJapaneseKeywords,
  deriveJapaneseCloze,
} from '../src/utils/japaneseSanitizer.ts';
import { detectScenarioTheme, ukiyoSound } from '../src/utils/ukiyoSoundEngine.ts';

// ANSI terminal formatting
const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

let totalTests = 0;
let passedTests = 0;
let edgeCaseAnomalies = 0;
const anomalies: string[] = [];

function assert(condition: boolean, testName: string, actual?: any, expected?: any) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ${GREEN}✓${RESET} ${testName}`);
  } else {
    edgeCaseAnomalies++;
    const msg = `[EDGE CASE ANOMALY] ${testName} -> Expected: ${JSON.stringify(expected)}, Actual: ${JSON.stringify(actual)}`;
    anomalies.push(msg);
    console.log(`  ${RED}✗ ${msg}${RESET}`);
  }
}

console.log(`${BOLD}${CYAN}================================================================${RESET}`);
console.log(`${BOLD}${CYAN}   JCAP FE-03 ADVERSARIAL EMPIRICAL VERIFICATION HARNESS   ${RESET}`);
console.log(`${BOLD}${CYAN}================================================================${RESET}\n`);

// ============================================================================
// SUITE 1: moraPhonetics.ts & countJapaneseMora
// ============================================================================
console.log(`${BOLD}--- 1. Testing moraPhonetics.ts (countJapaneseMora) ---${RESET}`);

// 1.1 Digraphs with small kana (しゃ, きゅ, ちょ, etc.)
assert(countJapaneseMora('しゃ') === 1, 'Digraph しゃ should be 1 mora', countJapaneseMora('しゃ'), 1);
assert(countJapaneseMora('きゅ') === 1, 'Digraph きゅ should be 1 mora', countJapaneseMora('きゅ'), 1);
assert(countJapaneseMora('ちょ') === 1, 'Digraph ちょ should be 1 mora', countJapaneseMora('ちょ'), 1);
assert(countJapaneseMora('しゃしん') === 3, 'しゃしん (写真) should be 3 moras (しゃ=1, し=1, ん=1)', countJapaneseMora('しゃしん'), 3);
assert(countJapaneseMora('きょうしつ') === 4, 'きょうしつ (教室) should be 4 moras (きょ=1, う=1, し=1, つ=1)', countJapaneseMora('きょうしつ'), 4);
assert(countJapaneseMora('とうきょう') === 4, 'とうきょう (東京) should be 4 moras (と=1, う=1, きょ=1, う=1)', countJapaneseMora('とうきょう'), 4);
assert(countJapaneseMora('ぎゅうにゅう') === 4, 'ぎゅうにゅう (牛乳) should be 4 moras (ぎゅ=1, う=1, にゅ=1, う=1)', countJapaneseMora('ぎゅうにゅう'), 4);
assert(countJapaneseMora('びょういん') === 4, 'びょういん (病院) should be 4 moras (びょ=1, う=1, い=1, ん=1)', countJapaneseMora('びょういん'), 4);
assert(countJapaneseMora('チョコレート') === 5, 'チョコレート should be 5 moras (ちょ=1, コ=1, レ=1, ー=1, ト=1)', countJapaneseMora('チョコレート'), 5);

// 1.2 Sokuon geminate consonants (っ / ッ)
assert(countJapaneseMora('きって') === 3, 'Sokuon きって should be 3 moras (き=1, っ=1, て=1)', countJapaneseMora('きって'), 3);
assert(countJapaneseMora('コップ') === 3, 'Sokuon Katakana コップ should be 3 moras (コ=1, ッ=1, プ=1)', countJapaneseMora('コップ'), 3);
assert(countJapaneseMora('がっこう') === 4, 'がっこう (学校) should be 4 moras (が=1, っ=1, こ=1, う=1)', countJapaneseMora('がっこう'), 4);
assert(countJapaneseMora('トラック') === 4, 'トラック should be 4 moras (ト=1, ラ=1, ッ=1, ク=1)', countJapaneseMora('トラック'), 4);
assert(countJapaneseMora('ちょっと') === 3, 'ちょっと should be 3 moras (ちょ=1, っ=1, と=1)', countJapaneseMora('ちょっと'), 3);
assert(countJapaneseMora('っ') === 1, 'Lone sokuon っ should be 1 mora', countJapaneseMora('っ'), 1);
assert(countJapaneseMora('ッ') === 1, 'Lone sokuon ッ should be 1 mora', countJapaneseMora('ッ'), 1);

// 1.3 Chouonpu long vowels (ー)
assert(countJapaneseMora('ラーメン') === 4, 'Chouonpu ラーメン should be 4 moras (ラ=1, ー=1, メ=1, ン=1)', countJapaneseMora('ラーメン'), 4);
assert(countJapaneseMora('コーヒー') === 4, 'Chouonpu コーヒー should be 4 moras (コ=1, ー=1, ヒ=1, ー=1)', countJapaneseMora('コーヒー'), 4);
assert(countJapaneseMora('スキー') === 3, 'Chouonpu スキー should be 3 moras (ス=1, キ=1, ー=1)', countJapaneseMora('スキー'), 3);
assert(countJapaneseMora('スーパー') === 4, 'Chouonpu スーパー should be 4 moras (ス=1, ー=1, パ=1, ー=1)', countJapaneseMora('スーパー'), 4);
assert(countJapaneseMora('ー') === 1, 'Lone chouonpu ー should be 1 mora', countJapaneseMora('ー'), 1);

// 1.4 Lone small vowels & small kana
assert(countJapaneseMora('ぁ') === 1, 'Lone small ぁ returns Math.max(1, 0) = 1 mora', countJapaneseMora('ぁ'), 1);
assert(countJapaneseMora('ぃ') === 1, 'Lone small ぃ returns Math.max(1, 0) = 1 mora', countJapaneseMora('ぃ'), 1);
assert(countJapaneseMora('ぁぃ') === 1, 'Dual small ぁぃ returns Math.max(1, 0) = 1 mora', countJapaneseMora('ぁぃ'), 1);
assert(countJapaneseMora('あぁ') === 1, 'Preceded small vowel: あ + ぁ returns 1 mora (あ=1, ぁ=0)', countJapaneseMora('あぁ'), 1);
assert(countJapaneseMora('おぉ') === 1, 'Preceded small vowel: お + ぉ returns 1 mora (お=1, ぉ=0)', countJapaneseMora('おぉ'), 1);
assert(countJapaneseMora('ファ') === 1, 'Foreign katakana combination ファ returns 1 mora (フ=1, ァ=0)', countJapaneseMora('ファ'), 1);
assert(countJapaneseMora('ウィ') === 1, 'Foreign katakana combination ウィ returns 1 mora (ウ=1, ィ=0)', countJapaneseMora('ウィ'), 1);
assert(countJapaneseMora('チェ') === 1, 'Foreign katakana combination チェ returns 1 mora (チ=1, ェ=0)', countJapaneseMora('チェ'), 1);

// 1.5 Mixed punctuation & Whitespace
assert(countJapaneseMora('') === 0, 'Empty string returns 0', countJapaneseMora(''), 0);
assert(countJapaneseMora('   ') === 0, 'Whitespace string returns 0', countJapaneseMora('   '), 0);
assert(countJapaneseMora('\u3000\u3000') === 0, 'Ideographic full-width whitespace returns 0', countJapaneseMora('\u3000\u3000'), 0);
assert(countJapaneseMora('、。！？') === 0, 'Japanese punctuation only returns 0', countJapaneseMora('、。！？'), 0);
assert(countJapaneseMora('「はい、そうです。」') === 6, 'Quoted speech 「はい、そうです。」 counts 6 moras', countJapaneseMora('「はい、そうです。」'), 6);
assert(countJapaneseMora('こんにちは！元気ですか？') === 12, 'Mixed punctuation greeting counts 12 moras (5 + 4[genki] + 3[desuka])', countJapaneseMora('こんにちは！元気ですか？'), 12);

// Check punctuation not in clean regex:
const colonPunct = countJapaneseMora(':;');
console.log(`  ${YELLOW}ℹ Behavior on unlisted Latin punctuation (":;"): returns ${colonPunct} (due to Math.max(1, 0))${RESET}`);

// 1.6 Romanized & Kanji text
assert(countJapaneseMora('東京') === 4, 'Kanji 東京 returns 4 moras (2 kanji * 2)', countJapaneseMora('東京'), 4);
assert(countJapaneseMora('富士山') === 6, 'Kanji 富士山 returns 6 moras (3 kanji * 2)', countJapaneseMora('富士山'), 6);
assert(countJapaneseMora('日本語を勉強します') === 14, 'Mixed kanji and kana 日本語を勉強します returns 14 moras', countJapaneseMora('日本語を勉強します'), 14);
assert(countJapaneseMora('hello') === 1, 'Pure Latin "hello" returns Math.max(1, 0) = 1 mora', countJapaneseMora('hello'), 1);
assert(countJapaneseMora('JCAPのテスト') === 4, 'Mixed Latin and Japanese JCAPのテスト counts 4 Japanese moras (JCAP=0, の=1, テ=1, ス=1, ト=1)', countJapaneseMora('JCAPのテスト'), 4);

console.log('');

// ============================================================================
// SUITE 2: japaneseSanitizer.ts
// ============================================================================
console.log(`${BOLD}--- 2. Testing japaneseSanitizer.ts ---${RESET}`);

// 2.1 Basic preservation and cleaning
assert(
  sanitizeDisplayJapanese('本当にありがとうございます。') === '本当にありがとうございます。',
  'Preserves clean Japanese sentence intact',
  sanitizeDisplayJapanese('本当にありがとうございます。'),
  '本当にありがとうございます。'
);
assert(
  sanitizeDisplayJapanese('いらっしゃいませ。(Kính chào quý khách)') === 'いらっしゃいませ。',
  'Strips half-width parenthesized Vietnamese translation',
  sanitizeDisplayJapanese('いらっしゃいませ。(Kính chào quý khách)'),
  'いらっしゃいませ。'
);
assert(
  sanitizeDisplayJapanese('いらっしゃいませ。（Kính chào quý khách）') === 'いらっしゃいませ。',
  'Strips full-width parenthesized Vietnamese translation',
  sanitizeDisplayJapanese('いらっしゃいませ。（Kính chào quý khách）'),
  'いらっしゃいませ。'
);

// 2.2 Parentheses edge cases
assert(
  sanitizeDisplayJapanese('こんにちは（Xin chào bạn）世界') === 'こんにちは世界',
  'Strips parenthesized Vietnamese in middle of sentence',
  sanitizeDisplayJapanese('こんにちは（Xin chào bạn）世界'),
  'こんにちは世界'
);
const nestedParenTest = sanitizeDisplayJapanese('こんにちは (xin chào (chào buổi sáng)) です');
console.log(`  ${YELLOW}ℹ Nested half-width parentheses result: "${nestedParenTest}" (leaves outer dangling ")")${RESET}`);

const unclosedParenTest = sanitizeDisplayJapanese('こんにちは (xin chào bạn');
console.log(`  ${YELLOW}ℹ Unclosed parenthesis result: "${unclosedParenTest}"${RESET}`);

// 2.3 Mixed Vietnamese-Japanese code-switching & trailing leakage
assert(
  sanitizeDisplayJapanese('本当にありがとうございます。 cháu thật là một người tốt bụng. Cháu hãy đi cẩn thận nhé.') ===
    '本当にありがとうございます。',
  'Strips trailing Vietnamese commentary with pronoun "cháu"',
  sanitizeDisplayJapanese('本当にありがとうございます。 cháu thật là một người tốt bụng. Cháu hãy đi cẩn thận nhé.'),
  '本当にありがとうございます。'
);

assert(
  sanitizeDisplayJapanese('ありがとうございます cháu tốt bụng') === 'ありがとうございます。',
  'Strips unpunctuated trailing Vietnamese and appends terminal Japanese period',
  sanitizeDisplayJapanese('ありがとうございます cháu tốt bụng'),
  'ありがとうございます。'
);

assert(
  sanitizeDisplayJapanese('すごいですね！ cháu làm tốt lắm') === 'すごいですね！',
  'Preserves terminal exclamation mark ！ without appending unnecessary period',
  sanitizeDisplayJapanese('すごいですね！ cháu làm tốt lắm'),
  'すごいですね！'
);

assert(
  sanitizeDisplayJapanese('どうですか？ bạn thấy sao') === 'どうですか？',
  'Preserves terminal question mark ？ without appending unnecessary period',
  sanitizeDisplayJapanese('どうですか？ bạn thấy sao'),
  'どうですか？'
);

assert(
  sanitizeDisplayJapanese('ありがとう、、 cháu ngoan') === 'ありがとう。',
  'Cleans trailing Japanese commas before adding period',
  sanitizeDisplayJapanese('ありがとう、、 cháu ngoan'),
  'ありがとう。'
);

// Empirical test of Vietnamese keywords ending with ASCII vs accented vowels:
console.log(`  ${YELLOW}ℹ Evaluating regex boundary \\b behavior across Vietnamese pronoun keywords:${RESET}`);
const asciiEndingKeywords = ['cháu', 'bác', 'ông', 'anh', 'em', 'bạn', 'tôi', 'mình', 'thật', 'tốt', 'người'];
let asciiPassed = true;
for (const kw of asciiEndingKeywords) {
  const res = sanitizeDisplayJapanese(`こんにちは ${kw} khỏe không`);
  if (res !== 'こんにちは。') {
    asciiPassed = false;
  }
}
assert(asciiPassed, 'All Vietnamese words ending in ASCII characters (cháu, bác, ông, bạn, tôi, ...) truncate cleanly', asciiPassed, true);

const accentedEndingKeywords = ['cụ', 'bà', 'chị', 'nhé', 'về'];
const accentedLeakageResults: Record<string, string> = {};
for (const kw of accentedEndingKeywords) {
  accentedLeakageResults[kw] = sanitizeDisplayJapanese(`こんにちは ${kw} khỏe không`);
}
console.log(`  ${YELLOW}ℹ Words ending in non-ASCII accented vowels (\\b failure in JS RegExp):${RESET}`);
for (const [kw, res] of Object.entries(accentedLeakageResults)) {
  console.log(`    - Keyword "${kw}": "${res}" (leading consonant retained due to \\b non-ASCII boundary)`);
}

// Full-width vs half-width spaces
assert(
  sanitizeDisplayJapanese('　ラーメン　美味しい　') === 'ラーメン　美味しい',
  'Trims full-width and half-width whitespace correctly',
  sanitizeDisplayJapanese('　ラーメン　美味しい　'),
  'ラーメン　美味しい'
);

// 2.4 Helper functions: containsJapanese, extractJapaneseKeywords, deriveJapaneseCloze
assert(containsJapanese('すし') === true, 'containsJapanese returns true for hiragana', containsJapanese('すし'), true);
assert(containsJapanese('ラーメン') === true, 'containsJapanese returns true for katakana', containsJapanese('ラーメン'), true);
assert(containsJapanese('寿司') === true, 'containsJapanese returns true for kanji', containsJapanese('寿司'), true);
assert(containsJapanese('Hello world') === false, 'containsJapanese returns false for English', containsJapanese('Hello world'), false);
assert(containsJapanese('Xin chào bạn') === false, 'containsJapanese returns false for Vietnamese', containsJapanese('Xin chào bạn'), false);
assert(containsJapanese('') === false, 'containsJapanese returns false for empty string', containsJapanese(''), false);
assert(containsJapanese(null) === false, 'containsJapanese returns false for null', containsJapanese(null), false);

const extractedKeywords = extractJapaneseKeywords('スープには具体的に何が入っていますか');
assert(extractedKeywords.length > 0 && extractedKeywords.includes('スープ'), 'extractJapaneseKeywords extracts Katakana "スープ"', extractedKeywords, ['スープ']);
assert(extractedKeywords.some(k => k.includes('具体')), 'extractJapaneseKeywords extracts Kanji compound "具体"', extractedKeywords, true);

const fallbackKeywords = extractJapaneseKeywords('ありがとうございます');
assert(fallbackKeywords.length > 0, 'extractJapaneseKeywords handles pure hiragana without crashing', fallbackKeywords.length > 0, true);

const cloze1 = deriveJapaneseCloze('スープには具体的に何が入っていますか', 'スープ');
assert(cloze1.includes('[ ______ ]') && !cloze1.includes('スープ'), 'deriveJapaneseCloze replaces explicit target keyword with blank', cloze1.includes('スープ'), false);

const clozeAuto = deriveJapaneseCloze('スープには具体的に何が入っていますか');
assert(clozeAuto.includes('[ ______ ]'), 'deriveJapaneseCloze auto-selects keyword and generates blank', clozeAuto.includes('[ ______ ]'), true);

const clozeEmpty = deriveJapaneseCloze('');
assert(clozeEmpty === '[ ______ ]', 'deriveJapaneseCloze handles empty string gracefully', clozeEmpty, '[ ______ ]');

console.log('');

// ============================================================================
// SUITE 3: ukiyoSoundEngine.ts & Web Audio API Singleton Verification
// ============================================================================
console.log(`${BOLD}--- 3. Testing ukiyoSoundEngine.ts (AudioContext Singleton) ---${RESET}`);

// 3.1 Scenario theme detection
assert(detectScenarioTheme('Mua vé tàu Shinkansen', 'Nhân viên') === 'train', 'Detects train theme', detectScenarioTheme('Mua vé tàu Shinkansen', 'Nhân viên'), 'train');
assert(detectScenarioTheme('Phỏng vấn xin việc', 'Yamada') === 'office', 'Detects office theme', detectScenarioTheme('Phỏng vấn xin việc', 'Yamada'), 'office');
assert(detectScenarioTheme('Mua sắm Konbini', 'Thu ngân') === 'konbini', 'Detects konbini theme', detectScenarioTheme('Mua sắm Konbini', 'Thu ngân'), 'konbini');
assert(detectScenarioTheme('Trà đạo truyền thống', 'Thầy trà') === 'zen', 'Detects zen theme', detectScenarioTheme('Trà đạo truyền thống', 'Thầy trà'), 'zen');
assert(detectScenarioTheme('Cà phê sáng', 'Barista') === 'cafe', 'Detects cafe theme', detectScenarioTheme('Cà phê sáng', 'Barista'), 'cafe');
assert(detectScenarioTheme('Ăn mì ramen', 'Đầu bếp') === 'ramen', 'Detects ramen theme', detectScenarioTheme('Ăn mì ramen', 'Đầu bếp'), 'ramen');
assert(detectScenarioTheme('', '') === 'ramen', 'Defaults to ramen theme', detectScenarioTheme('', ''), 'ramen');

// 3.2 Web Audio API Singleton Verification (Chrome 6-context limit)
console.log(`  ${YELLOW}ℹ Simulating browser AudioContext environment to stress-test context creation...${RESET}`);

let audioContextConstructCount = 0;

class MockAudioContext {
  currentTime = 0;
  sampleRate = 44100;
  state = 'running';
  destination = {};

  constructor() {
    audioContextConstructCount++;
  }

  resume() {
    this.state = 'running';
    return Promise.resolve();
  }

  createOscillator() {
    return {
      type: 'sine',
      frequency: {
        setValueAtTime: () => {},
        exponentialRampToValueAtTime: () => {},
      },
      connect: () => {},
      start: () => {},
      stop: () => {},
    };
  }

  createGain() {
    return {
      gain: {
        setValueAtTime: () => {},
        exponentialRampToValueAtTime: () => {},
        linearRampToValueAtTime: () => {},
      },
      connect: () => {},
    };
  }

  createBuffer(channels: number, length: number, sampleRate: number) {
    const data = new Float32Array(length);
    return {
      getChannelData: () => data,
    };
  }

  createBufferSource() {
    return {
      buffer: null,
      loop: false,
      connect: () => {},
      start: () => {},
      stop: () => {},
    };
  }

  createBiquadFilter() {
    return {
      type: 'lowpass',
      frequency: {
        setValueAtTime: () => {},
      },
      Q: {
        setValueAtTime: () => {},
      },
      connect: () => {},
    };
  }
}

// Attach mock AudioContext to globalThis.window
(globalThis as any).window = {
  AudioContext: MockAudioContext,
};

// Stress call all sound methods multiple times
const REPETITION = 25;
for (let i = 0; i < REPETITION; i++) {
  ukiyoSound.playTaikoThud();
  ukiyoSound.playWoodblockSnap();
  ukiyoSound.playMigotoChime();
  ukiyoSound.playPaperRustle();
  ukiyoSound.playSubtleTap();
}

ukiyoSound.startAmbientSound('train');
ukiyoSound.startAmbientSound('ramen');
ukiyoSound.startAmbientSound('office');
ukiyoSound.stopAmbientSound();

assert(
  audioContextConstructCount === 1,
  `AudioContext singleton verified: constructed exactly ${audioContextConstructCount} time(s) across ${REPETITION * 5 + 3} sound triggers (Chrome allows max 6)`,
  audioContextConstructCount,
  1
);

// Mute verification
ukiyoSound.setMuted(true);
assert(ukiyoSound.getIsMuted() === true, 'Mute state is active', ukiyoSound.getIsMuted(), true);
const constructCountBeforeMutedPlays = audioContextConstructCount;
ukiyoSound.playTaikoThud();
ukiyoSound.playMigotoChime();
assert(
  audioContextConstructCount === constructCountBeforeMutedPlays,
  'When muted, sound engine does not trigger or create audio nodes',
  audioContextConstructCount,
  constructCountBeforeMutedPlays
);
ukiyoSound.setMuted(false);

// Clean up mock window
delete (globalThis as any).window;

// SSR verification (window === undefined)
let ssrThrew = false;
try {
  ukiyoSound.playTaikoThud();
  ukiyoSound.playWoodblockSnap();
  ukiyoSound.playMigotoChime();
} catch (e) {
  ssrThrew = true;
}
assert(!ssrThrew, 'SSR safe: sound methods safely no-op when window is undefined', ssrThrew, false);

console.log('');
console.log(`${BOLD}${CYAN}================================================================${RESET}`);
console.log(`${BOLD}SUMMARY: Total Tests: ${totalTests} | ${GREEN}Passed: ${passedTests}${RESET} | ${edgeCaseAnomalies > 0 ? `${YELLOW}Anomalies: ${edgeCaseAnomalies}${RESET}` : `${GREEN}Anomalies: 0${RESET}`}`);
console.log(`${BOLD}${CYAN}================================================================${RESET}`);

if (edgeCaseAnomalies > 0) {
  console.log(`\n${YELLOW}Edge Case Anomalies Documented:${RESET}`);
  anomalies.forEach(a => console.log(`  - ${a}`));
}

console.log(`\n${GREEN}${BOLD}EMPIRICAL HARNESS RUN COMPLETE.${RESET}\n`);
