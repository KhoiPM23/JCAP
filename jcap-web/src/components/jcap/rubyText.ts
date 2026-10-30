/** Một đoạn câu tiếng Nhật: chuỗi thường, hoặc chữ kèm cách đọc (furigana) */
export type RubySegment = string | { base: string; reading: string };

const RUBY = /\{([^|}]+)\|([^}]+)\}/g;

/** Tách cú pháp {漢字|かんじ} thành các đoạn để vẽ <ruby>. Chuỗi không có cú pháp thì giữ nguyên */
export function parseRuby(text: string): RubySegment[] {
  const out: RubySegment[] = [];
  let last = 0;
  for (const m of text.matchAll(RUBY)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    out.push({ base: m[1], reading: m[2] });
    last = at + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
