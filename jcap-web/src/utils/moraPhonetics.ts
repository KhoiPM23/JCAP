/**
 * Helper tính toán Mora chuẩn ngữ âm tiếng Nhật (Tokyo Pitch Accent & Rhythm)
 */
export const countJapaneseMora = (text: string): number => {
  if (!text) return 0;
  const clean = text.replace(/[\s\u3000\u3001\u3002,.!?！？、。]/g, '');
  if (!clean) return 0;
  let moras = 0;
  for (let i = 0; i < clean.length; i++) {
    const char = clean[i];
    // Âm ghép nhỏ (ゃ, ゅ, ょ, ゎ...) không tạo thành mora độc lập
    if (/[ぁぃぅぇぉゃゅょゎァィゥェォャュョヮ]/.test(char)) continue;
    // Kanji thường tương đương 2 moras
    if (/[\u4e00-\u9faf]/.test(char)) {
      moras += 2;
      continue;
    }
    // Hiragana / Katakana / Trường âm ー
    if (/[\u3040-\u309f\u30a0-\u30ffー]/.test(char)) {
      moras += 1;
      continue;
    }
  }
  return Math.max(1, moras);
};
