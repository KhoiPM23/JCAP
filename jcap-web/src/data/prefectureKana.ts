/**
 * Cách đọc (furigana) tên 47 tỉnh, theo mã JIS. Chỉ là cách đọc phần tên riêng; hậu tố 県/都/府 đọc riêng.
 * Dùng cho nhãn tên tỉnh trên bản đồ Khám phá khi bật furigana.
 */
const READING: Record<number, string> = {
  1: 'ほっかいどう', 2: 'あおもり', 3: 'いわて', 4: 'みやぎ', 5: 'あきた', 6: 'やまがた', 7: 'ふくしま',
  8: 'いばらき', 9: 'とちぎ', 10: 'ぐんま', 11: 'さいたま', 12: 'ちば', 13: 'とうきょう', 14: 'かながわ',
  15: 'にいがた', 16: 'とやま', 17: 'いしかわ', 18: 'ふくい', 19: 'やまなし', 20: 'ながの', 21: 'ぎふ',
  22: 'しずおか', 23: 'あいち', 24: 'みえ', 25: 'しが', 26: 'きょうと', 27: 'おおさか', 28: 'ひょうご',
  29: 'なら', 30: 'わかやま', 31: 'とっとり', 32: 'しまね', 33: 'おかやま', 34: 'ひろしま', 35: 'やまぐち',
  36: 'とくしま', 37: 'かがわ', 38: 'えひめ', 39: 'こうち', 40: 'ふくおか', 41: 'さが', 42: 'ながさき',
  43: 'くまもと', 44: 'おおいた', 45: 'みやざき', 46: 'かごしま', 47: 'おきなわ',
};

const SUFFIX: Record<string, string> = { 県: 'けん', 都: 'と', 府: 'ふ' };

/** Đoạn chữ của tên tỉnh: [chữ, cách đọc]. Không có dữ liệu thì trả nguyên tên (không furigana). */
export function prefectureFurigana(id: number, nameJp: string): [string, string][] | null {
  const reading = READING[id];
  if (!reading) return null;
  if (id === 1) return nameJp === '北海道' ? [['北海道', reading]] : null;
  const suffix = nameJp.slice(-1);
  if (!SUFFIX[suffix]) return null;
  return [
    [nameJp.slice(0, -1), reading],
    [suffix, SUFFIX[suffix]],
  ];
}
