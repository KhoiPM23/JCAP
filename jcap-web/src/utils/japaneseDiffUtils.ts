/**
 * Japanese Diff & Content Match Utility
 * Chuẩn hóa văn bản tiếng Nhật chuyên biệt và phân tích đối chiếu theo Token & Ngữ âm:
 * - Chuẩn hóa NFKC, loại bỏ dấu câu, khoảng trắng
 * - Tokenization thông minh dựa trên ranh giới ngữ nghĩa và từ điển phát âm
 * - Diff Highlighting: Phân biệt từ đúng (correct), từ nói sai/nhầm trợ từ (mismatched), từ nói thiếu (missing)
 * - Phát hiện đặc trưng âm học tiếng Nhật: Trường âm (chouon), Âm ngắt (sokuon), Trợ từ (particles)
 * - Bảo toàn trường âm (おばさん vs おばあさん) và âm ngắt (きて vs きって), không over-normalize
 * - Tính Content Match Score (0 - 100) và Completion Rate (0 - 100)
 */

export interface JapaneseDiffToken {
  text: string;
  status: 'correct' | 'mismatched' | 'missing';
  spokenPart?: string;
  errorType?: 'chouon' | 'sokuon' | 'particle' | 'word';
}

export interface JapaneseSpeechComparisonResult {
  contentMatchScore: number; // 0 - 100
  completionRate: number; // Tỷ lệ đã nói / câu chuẩn (0 - 100)
  tier: 'green' | 'yellow' | 'red';
  feedback: string;
  diffTokens: JapaneseDiffToken[];
  cleanTarget: string;
  cleanSpoken: string;
  detectedErrors?: {
    hasChouonError?: boolean;
    hasSokuonError?: boolean;
    hasParticleError?: boolean;
  };
}

/**
 * Chuyển đổi Katakana thành Hiragana để so khớp đồng âm từ mượn
 */
export function katakanaToHiragana(str: string): string {
  if (!str) return '';
  return str.replace(/[\u30a1-\u30f4]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60)
  );
}

/**
 * Chuẩn hóa Unicode NFKC và loại bỏ khoảng trắng, dấu câu tiếng Nhật
 */
export function normalizeJapaneseText(str: string): string {
  if (!str) return '';
  return str
    .normalize('NFKC')
    .replace(/[\s\u3000。、！？!?.,\-_~—「」『』()（）]/g, '');
}

/**
 * Từ điển các biến thể chữ viết đồng âm thực tế (Kanji <-> Hiragana <-> Số đếm)
 * CHỈ chứa các từ tương đương âm đọc 100% trong bối cảnh Shadowing bài học.
 * TUYỆT ĐỐI KHÔNG gộp các từ khác âm (như おばさん vs おばあさん hay お願いします vs お願いいたします).
 */
export const VERIFIED_READING_EQUIVALENTS: Record<string, string[]> = {
  '一人': ['ひとり', '1人'],
  'ひとり': ['一人', '1人'],
  '1人': ['一人', 'ひとり'],
  '二人': ['ふたり', '2人'],
  'ふたり': ['二人', '2人'],
  '2人': ['二人', 'ふたり'],
  '三人': ['さんにん', '3人'],
  'さんにん': ['三人', '3人'],
  '3人': ['三人', 'さんにん'],
  '四人': ['よにん', '4人'],
  'よにん': ['四人', '4人'],
  '4人': ['四人', 'よにん'],
  'カウンター': ['かうんたー'],
  'かうんたー': ['カウンター'],
  '席': ['せき'],
  'せき': ['席'],
  '私': ['わたし'],
  'わたし': ['私'],
  '僕': ['ぼく'],
  'ぼく': ['僕'],
  '何': ['なに', 'なん'],
  '店': ['みせ'],
  'みせ': ['店'],
  '水': ['みず'],
  'みず': ['水'],
  '円': ['えん'],
  'えん': ['円'],
  'お願いします': ['おねがいします'],
  'おねがいします': ['お願いします'],
  'お願い': ['おねがい'],
  'おねがい': ['お願い'],
  'ください': ['下さい'],
  '下さい': ['ください'],
  'ありがとうございます': ['有難うございます'],
  '有難うございます': ['ありがとうございます'],
  '今日': ['きょう'],
  'きょう': ['今日'],
  '学校': ['がっこう'],
  'がっこう': ['学校'],
  '行きます': ['いきます'],
  'いきます': ['行きます'],
};

/**
 * Chuyển một chuỗi tiếng Nhật về dạng đọc Hiragana chuẩn tắc
 */
export function toCanonicalHiragana(text: string): string {
  let str = normalizeJapaneseText(text);
  // Thay thế Katakana sang Hiragana
  str = katakanaToHiragana(str);

  // Sắp xếp các từ khóa theo độ dài giảm dần để ưu tiên từ dài trước
  const keys = Object.keys(VERIFIED_READING_EQUIVALENTS).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    if (str.includes(k)) {
      const primaryReading = VERIFIED_READING_EQUIVALENTS[k][0];
      // Chỉ thay nếu reading là chữ Hiragana
      if (/^[\u3040-\u309f]+$/.test(primaryReading)) {
        str = str.split(k).join(primaryReading);
      }
    }
  }
  return str;
}

/**
 * Tách một câu tiếng Nhật thành danh sách các token hiển thị logic
 */
export function tokenizeJapaneseSentence(targetText: string): { text: string; reading: string }[] {
  const clean = normalizeJapaneseText(targetText);
  if (!clean) return [];

  // Tìm các cụm từ trong từ điển trước (longest match first)
  const dictKeys = Object.keys(VERIFIED_READING_EQUIVALENTS).sort((a, b) => b.length - a.length);

  const tokens: { text: string; reading: string }[] = [];
  let remaining = clean;

  while (remaining.length > 0) {
    // 1. Kiểm tra từ điển
    let matchedKey: string | null = null;
    for (const key of dictKeys) {
      if (remaining.startsWith(key)) {
        matchedKey = key;
        break;
      }
    }

    if (matchedKey) {
      const reading = VERIFIED_READING_EQUIVALENTS[matchedKey].find((r) => /^[\u3040-\u309f]+$/.test(r)) || katakanaToHiragana(matchedKey);
      tokens.push({ text: matchedKey, reading });
      remaining = remaining.slice(matchedKey.length);
      continue;
    }

    // 2. Tách Katakana loanwords (có thể có trường âm ー)
    const katakanaMatch = remaining.match(/^[\u30a1-\u30f4ー]+/);
    if (katakanaMatch) {
      const kata = katakanaMatch[0];
      tokens.push({ text: kata, reading: katakanaToHiragana(kata) });
      remaining = remaining.slice(kata.length);
      continue;
    }

    // 3. Tách Kanji words
    const kanjiMatch = remaining.match(/^[\p{Script=Han}]+/u);
    if (kanjiMatch) {
      const kanji = kanjiMatch[0];
      tokens.push({ text: kanji, reading: toCanonicalHiragana(kanji) });
      remaining = remaining.slice(kanji.length);
      continue;
    }

    // 4. Trợ từ hoặc cụm Hiragana
    const commonParticles = ['は', 'が', 'を', 'に', 'へ', 'で', 'と', 'も', 'の', 'か', 'ね', 'よ'];
    if (commonParticles.includes(remaining[0])) {
      tokens.push({ text: remaining[0], reading: remaining[0] });
      remaining = remaining.slice(1);
      continue;
    }

    // 5. Cụm Hiragana thông thường (tách đến trợ từ tiếp theo hoặc Kanji/Katakana tiếp theo)
    const hiraganaMatch = remaining.match(/^[\u3040-\u309f]+/);
    if (hiraganaMatch) {
      let hira = hiraganaMatch[0];
      // Nếu cụm Hiragana dài kết thúc bằng trợ từ đơn
      if (hira.length > 2 && commonParticles.includes(hira[hira.length - 1])) {
        hira = hira.slice(0, -1);
      }
      tokens.push({ text: hira, reading: hira });
      remaining = remaining.slice(hira.length);
      continue;
    }

    // 6. Ký tự bất kỳ còn lại
    const single = remaining[0];
    tokens.push({ text: single, reading: single });
    remaining = remaining.slice(1);
  }

  return tokens;
}

/**
 * Kiểm tra xem 2 token tiếng Nhật có tương đương về âm đọc hay không
 */
export function areJapaneseTokensPhoneticallyEquivalent(target: string, spoken: string): boolean {
  if (!target || !spoken) return false;
  if (target === spoken) return true;

  const hTarget = katakanaToHiragana(target);
  const hSpoken = katakanaToHiragana(spoken);
  if (hTarget === hSpoken) return true;

  const cTarget = toCanonicalHiragana(target);
  const cSpoken = toCanonicalHiragana(spoken);
  if (cTarget === cSpoken) return true;

  const equivalents = VERIFIED_READING_EQUIVALENTS[target];
  if (equivalents && equivalents.includes(spoken)) return true;

  const spokenEquivalents = VERIFIED_READING_EQUIVALENTS[spoken];
  if (spokenEquivalents && spokenEquivalents.includes(target)) return true;

  return false;
}

/**
 * Phát hiện lỗi âm học đặc trưng giữa 2 từ
 */
function detectPhoneticErrorType(target: string, spoken: string): 'chouon' | 'sokuon' | 'particle' | 'word' {
  const tKana = katakanaToHiragana(target);
  const sKana = katakanaToHiragana(spoken);

  const particles = ['は', 'が', 'を', 'に', 'へ', 'で', 'と', 'も', 'の', 'か', 'ね', 'よ'];
  if (particles.includes(target) || particles.includes(spoken)) {
    return 'particle';
  }

  // Âm ngắt (っ)
  const tHasSokuon = tKana.includes('っ');
  const sHasSokuon = sKana.includes('っ');
  if (tHasSokuon !== sHasSokuon && tKana.replace(/っ/g, '') === sKana.replace(/っ/g, '')) {
    return 'sokuon';
  }

  // Trường âm (chouon: あ, い, う, え, お, ー)
  const chouonRegex = /[あいうえおー]/g;
  const tWithoutChouon = tKana.replace(chouonRegex, '');
  const sWithoutChouon = sKana.replace(chouonRegex, '');
  if (tWithoutChouon === sWithoutChouon && tKana !== sKana) {
    return 'chouon';
  }

  return 'word';
}

/**
 * Thuật toán so khớp câu tiếng Nhật theo Token & Ngữ âm chuẩn xác
 */
export function compareJapaneseSpeechTokens(
  target: string,
  spoken: string
): JapaneseSpeechComparisonResult {
  const cleanTarget = normalizeJapaneseText(target);
  const cleanSpoken = normalizeJapaneseText(spoken);

  // Case 1: Chưa có giọng nói hoặc transcript rỗng
  if (!cleanSpoken) {
    return {
      contentMatchScore: 0,
      completionRate: 0,
      tier: 'red',
      feedback: 'Chưa phát hiện được câu thoại. Hãy bấm Micro và đọc to câu tiếng Nhật mẫu nhé.',
      diffTokens: [{ text: target, status: 'missing' }],
      cleanTarget,
      cleanSpoken,
    };
  }

  // Case 2: Khớp tuyệt đối (hoặc tương đương âm học toàn câu)
  const targetCanonical = toCanonicalHiragana(cleanTarget);
  const spokenCanonical = toCanonicalHiragana(cleanSpoken);

  if (cleanTarget === cleanSpoken || targetCanonical === spokenCanonical || areJapaneseTokensPhoneticallyEquivalent(cleanTarget, cleanSpoken)) {
    return {
      contentMatchScore: 100,
      completionRate: 100,
      tier: 'green',
      feedback: 'Hoàn hảo! Phát âm và nội dung câu khớp 100% so với câu mẫu bản xứ.',
      diffTokens: [{ text: target, status: 'correct' }],
      cleanTarget,
      cleanSpoken,
    };
  }

  // Case 3: Token-based Alignment
  const targetTokens = tokenizeJapaneseSentence(target);
  const spokenTokens = tokenizeJapaneseSentence(spoken);

  const m = targetTokens.length;
  const n = spokenTokens.length;

  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const isEq = areJapaneseTokensPhoneticallyEquivalent(targetTokens[i - 1].reading, spokenTokens[j - 1].reading);
      const cost = isEq ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }

  let i = m;
  let j = n;
  const alignedTokens: JapaneseDiffToken[] = [];
  let hasChouonError = false;
  let hasSokuonError = false;
  let hasParticleError = false;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && areJapaneseTokensPhoneticallyEquivalent(targetTokens[i - 1].reading, spokenTokens[j - 1].reading)) {
      alignedTokens.unshift({
        text: targetTokens[i - 1].text,
        status: 'correct',
        spokenPart: spokenTokens[j - 1].text,
      });
      i--;
      j--;
    } else if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + 1) {
      const errType = detectPhoneticErrorType(targetTokens[i - 1].reading, spokenTokens[j - 1].reading);
      if (errType === 'chouon') hasChouonError = true;
      if (errType === 'sokuon') hasSokuonError = true;
      if (errType === 'particle') hasParticleError = true;

      alignedTokens.unshift({
        text: targetTokens[i - 1].text,
        status: 'mismatched',
        spokenPart: spokenTokens[j - 1].text,
        errorType: errType,
      });
      i--;
      j--;
    } else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      alignedTokens.unshift({
        text: targetTokens[i - 1].text,
        status: 'missing',
      });
      i--;
    } else {
      j--;
    }
  }

  // Tính toán Content Match Score dựa trên tỷ lệ token đúng
  const correctCount = alignedTokens.filter((t) => t.status === 'correct').length;
  const totalTokens = Math.max(1, alignedTokens.length);
  const rawRatio = correctCount / totalTokens;
  const contentMatchScore = correctCount === 0 ? 0 : Math.min(100, Math.round(rawRatio * 100));
  const completionRate = Math.min(100, Math.round((cleanSpoken.length / Math.max(1, cleanTarget.length)) * 100));

  let tier: 'green' | 'yellow' | 'red' = 'green';
  if (contentMatchScore >= 80) tier = 'green';
  else if (contentMatchScore >= 60) tier = 'yellow';
  else tier = 'red';

  let feedback = '';
  if (tier === 'green') {
    feedback = 'Rất tốt! Bạn phát âm rõ ràng, khớp hầu hết câu từ và trợ từ mẫu.';
  } else if (tier === 'yellow') {
    if (hasChouonError) {
      feedback = 'Khá tốt! Lưu ý phân biệt trường âm (âm kéo dài) để tránh hiểu nhầm nghĩa từ.';
    } else if (hasSokuonError) {
      feedback = 'Khá tốt! Lưu ý ngắt nhịp đúng ở âm ngắt (っ) để câu nói tự nhiên hơn.';
    } else if (hasParticleError) {
      feedback = 'Khá tốt! Chú ý đọc chính xác các trợ từ (は, に, へ, で) theo câu mẫu.';
    } else {
      const mismatched = alignedTokens.find((t) => t.status === 'mismatched');
      const note = mismatched ? `Chú ý từ: "${mismatched.text}"` : '';
      feedback = `Khá tốt! Một số từ chưa thật chuẩn xác. ${note}`;
    }
  } else {
    feedback = 'Nội dung nói còn khác biệt nhiều so với câu mẫu. Hãy nghe lại audio mẫu và đọc chậm từng cụm.';
  }

  return {
    contentMatchScore,
    completionRate,
    tier,
    feedback,
    diffTokens: alignedTokens,
    cleanTarget,
    cleanSpoken,
    detectedErrors: {
      hasChouonError,
      hasSokuonError,
      hasParticleError,
    },
  };
}

