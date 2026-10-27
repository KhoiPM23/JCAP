// Tìm biểu tượng và gợi ý biểu tượng theo tên mốc (bộ chọn biểu tượng trong trình soạn mốc của admin).
// Mỗi biểu tượng được tìm theo: tên Việt, tên Nhật, id (tiếng Anh/romaji) và từ khoá phụ trong pictogramKeywords.

import { JCAP_ICONS, PICTOGRAMS, SCENE_PICTOGRAM_GROUPS, type Pictogram } from '../../data/japanPictograms.ts';
import { PICTOGRAM_KEYWORDS } from '../../data/pictogramKeywords.ts';

/** Mọi biểu tượng admin chọn được: riêng của JCAP, tình huống, rồi theo tỉnh */
export const ALL_ICONS: Pictogram[] = [...JCAP_ICONS, ...SCENE_PICTOGRAM_GROUPS.flatMap((g) => g.items), ...Object.values(PICTOGRAMS)];

const JP = /[぀-ヿ㐀-鿿]/;
const KANJI = /[㐀-鿿]/;

const toHiragana = (s: string) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

/** Chữ thường, giữ dấu tiếng Việt, katakana thành hiragana, ký tự không phải chữ/số thành khoảng trắng */
const keep = (s: string) =>
  toHiragana(s.normalize('NFC').toLowerCase())
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/** Như keep nhưng bỏ dấu tiếng Việt (gõ không dấu vẫn tìm được). Chỉ bỏ dấu Latin, không đụng dakuten của kana. */
const loose = (s: string) =>
  keep(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .normalize('NFC');

interface Term {
  /** Dạng giữ dấu */
  k: string;
  /** Dạng bỏ dấu */
  l: string;
  jp: boolean;
  /** Lấy từ tên biểu tượng (khớp tên thì đáng tin hơn khớp từ khoá phụ) */
  name: boolean;
}

function termsOf(p: Pictogram): Term[] {
  const sources = [
    { text: p.nameVi, name: true },
    { text: p.nameJp, name: true },
    { text: p.id.slice(2).replace(/[-_]/g, ' '), name: false },
    ...(PICTOGRAM_KEYWORDS[p.id] ?? '').split(',').map((text) => ({ text, name: false })),
  ];
  const out: Term[] = [];
  const seen = new Set<string>();
  const add = (t: Term) => {
    if (t.k && !seen.has(t.k)) {
      seen.add(t.k);
      out.push(t);
    }
  };
  for (const { text, name } of sources) {
    // Phần trong ngoặc là tên khác của cùng nơi (vd. 鹿苑寺（金閣寺）): tách thành từ riêng
    for (const piece of text.split(/[()（）·・、]/)) {
      const k = keep(piece);
      if (!k) continue;
      if (JP.test(k)) for (const w of k.split(' ')) add({ k: w, l: w, jp: true, name });
      else add({ k, l: loose(piece), jp: false, name });
    }
  }
  return out;
}

const INDEX = ALL_ICONS.map((icon) => ({ icon, terms: termsOf(icon) }));

/**
 * Biểu tượng hợp với tên mốc, khớp nhiều và khớp từ dài xếp trước.
 * Từ Latin phải khớp nguyên từ (có dấu; từ ≥ 4 chữ cái thì không dấu cũng được) để "dù" không khớp "du lịch".
 * Từ tiếng Nhật một chữ kanji (湖, 滝...) hoặc kana ngắn (えき) chỉ khớp khi đứng cuối một từ của tên (河口湖,
 * しんじゅくえき), để "うち" không khớp giữa "とうちゃく".
 */
export function suggestIconsForName(names: string[], limit = 12): Pictogram[] {
  const text = names.filter(Boolean).join(' ');
  const k = ` ${keep(text)} `;
  const l = ` ${loose(text)} `;
  if (!k.trim()) return [];
  const jpWords = k.split(' ').filter((w) => JP.test(w));

  const scored: { icon: Pictogram; score: number; i: number }[] = [];
  INDEX.forEach(({ icon, terms }, i) => {
    let score = 0;
    for (const t of terms) {
      let s = 0;
      if (t.jp) {
        const short = t.k.length === 1 || (t.k.length === 2 && !KANJI.test(t.k));
        if (t.k.length === 1 && !KANJI.test(t.k)) s = 0;
        else if (short ? jpWords.some((w) => w.endsWith(t.k)) : k.includes(t.k)) s = t.k.length * 2;
      } else if (t.k.length >= 2 && k.includes(` ${t.k} `)) s = t.k.length;
      else if (t.l.length >= 4 && l.includes(` ${t.l} `)) s = t.l.length;
      score += t.name ? s * 2 : s;
    }
    if (score > 0) scored.push({ icon, score, i });
  });
  return scored
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, limit)
    .map((s) => s.icon);
}

/** Tìm theo chuỗi admin gõ: khớp nguyên từ, rồi khớp đầu từ, rồi chứa; khớp tên trước khớp từ khoá phụ */
export function searchIcons(query: string): Pictogram[] {
  const qk = keep(query);
  const ql = loose(query);
  if (!qk) return [];
  const hits: { icon: Pictogram; rank: number; i: number }[] = [];
  INDEX.forEach(({ icon, terms }, i) => {
    let rank = Infinity;
    for (const t of terms) {
      const s = t.jp ? t.k : t.l;
      const q = t.jp ? qk : ql;
      const r = s === q ? 0 : s.startsWith(q) || s.includes(` ${q}`) ? 1 : s.includes(q) ? 2 : Infinity;
      rank = Math.min(rank, r + (t.name ? 0 : 0.5));
    }
    if (rank < Infinity) hits.push({ icon, rank, i });
  });
  return hits.sort((a, b) => a.rank - b.rank || a.i - b.i).map((h) => h.icon);
}
