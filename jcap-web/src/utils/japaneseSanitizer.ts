/**
 * Tiện ích làm sạch câu thoại tiếng Nhật (Japanese Utterance Sanitizer)
 * Loại bỏ triệt để mọi phần rò rỉ tiếng Việt, chú thích Latin, hoặc rò rỉ dịch nghĩa
 * bảo đảm câu thoại hiển thị và phát âm luôn 100% tiếng Nhật chuẩn mực.
 */

/**
 * Kiểm tra chuỗi có chứa ký tự tiếng Nhật (Hiragana, Katakana, Kanji) hay không.
 */
export function containsJapanese(text?: string | null): boolean {
  if (!text) return false;
  return /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(text);
}

/**
 * Trích xuất từ khóa tiếng Nhật (Katakana, Kanji compound, từ vựng nội dung)
 * phục vụ Giàn giáo Cấp 1 (Tier 1: Keywords) khi BE không truyền sẵn keywords.
 */
export function extractJapaneseKeywords(sentence?: string | null): string[] {
  if (!sentence) return [];
  const clean = sanitizeDisplayJapanese(sentence);
  // Khớp từ Katakana (e.g. スープ, ラーメン) hoặc từ Kanji (e.g. 具体的, 注文, アレルギー)
  const matches = clean.match(/[\u30A0-\u30FF]{2,}|[\u4E00-\u9FAF]+[\u3040-\u309F]*/g);
  if (!matches || matches.length === 0) {
    return [clean.slice(0, Math.min(clean.length, 5)) || 'お願いします'];
  }
  // Loại bỏ trùng lặp và lấy tối đa 4 từ khóa
  return Array.from(new Set(matches)).slice(0, 4);
}

/**
 * Tạo mẫu câu điền khuyết (Cloze Test) thông minh:
 * Thay thế một từ khóa trọng tâm bằng [ ______ ] để người học tư duy từ cần điền.
 */
export function deriveJapaneseCloze(sentence?: string | null, targetKeyword?: string): string {
  if (!sentence) return '[ ______ ]';
  const clean = sanitizeDisplayJapanese(sentence);
  if (targetKeyword && clean.includes(targetKeyword)) {
    return clean.replace(targetKeyword, ' [ ______ ] ');
  }

  const keywords = extractJapaneseKeywords(clean);
  if (keywords.length > 0) {
    const chosen = keywords[keywords.length > 1 ? 1 : 0]; // Chọn từ khóa giữa câu
    if (chosen && clean.includes(chosen)) {
      return clean.replace(chosen, ' [ ______ ] ');
    }
  }

  if (clean.length > 6) {
    const midStart = Math.floor(clean.length * 0.35);
    const midEnd = Math.floor(clean.length * 0.7);
    return clean.slice(0, midStart) + ' [ ______ ] ' + clean.slice(midEnd);
  }

  return clean + ' [ ______ ]';
}

export function sanitizeDisplayJapanese(text: string): string {
  if (!text) return '';
  const trimmed = text.trim();

  // 1. Loại bỏ chú thích tiếng Việt trong ngoặc đơn (cả ngoặc nửa góc và toàn góc)
  // Ví dụ: "本当にありがとうございます。(Cháu hãy đi cẩn thận nhé)" -> "本当にありがとうございます。"
  const withoutParen = trimmed.replace(
    /[\(（][^\)）]*[a-zA-ZàáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđÀÁẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬÈÉẺẼẸÊẾỀỂỄỆÌÍỈĨỊÒÓỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÙÚỦŨỤƯỨỪỬỮỰỲÝỶỸỴĐ][^\)）]*[\)）]/g,
    ''
  ).trim();

  // 2. Phát hiện tiếng Việt bị nối đuôi sau câu tiếng Nhật
  // Ví dụ: "本当にありがとうございます。 cháu thật là một người tốt bụng. Cháu hãy đi cẩn thận nhé."
  const viMatch = withoutParen.match(
    /[àáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđÀÁẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬÈÉẺẼẸÊẾỀỂỄỆÌÍỈĨỊÒÓỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÙÚỦŨỤƯỨỪỬỮỰỲÝỶỸỴĐ]|\b(cháu|cụ|bác|ông|bà|anh|chi|chị|em|bạn|tôi|mình|thật|tốt|bụng|cẩn|thận|nhé|đi|về|nhiều|lắm|người|cảm|ơn|xin|chào|dịch|nghĩa|rất|hãy)\b/i
  );

  if (viMatch && viMatch.index !== undefined && viMatch.index > 0) {
    const cleanPrefix = withoutParen.slice(0, viMatch.index).trim();
    if (/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(cleanPrefix)) {
      const sanitized = cleanPrefix.replace(/[,、\s]+$/, '');
      return sanitized.endsWith('。') || sanitized.endsWith('！') || sanitized.endsWith('？') || sanitized.endsWith('!')
        ? sanitized
        : sanitized + '。';
    }
  }

  return withoutParen;
}

/**
 * Phát hiện ảo giác Whisper (Whisper Hallucination Filter) khi âm thanh yên lặng hoặc lẫn tạp âm
 */
export function isWhisperHallucination(text?: string | null): boolean {
  if (!text) return true;
  const trimmed = text.trim();
  if (trimmed.length === 0) return true;

  // Danh sách các câu ảo giác Whisper kinh điển khi micro thu khoảng lặng
  const hallucinations = [
    'ご視聴ありがとうございました',
    '視聴ありがとうございました',
    'チャンネル登録',
    'おやすみなさい',
    '高評価',
    'Subtitles by',
    'Thank you for watching',
    '...',
    '。。。',
  ];

  if (hallucinations.some((h) => trimmed.includes(h))) {
    return true;
  }

  // Nếu chỉ toàn dấu chấm, dấu phẩy, khoảng trắng
  if (/^[.\s,，。…、・!?！？]+$/.test(trimmed)) {
    return true;
  }

  return false;
}
