/**
 * Cách gõ câu mẫu có furigana trong một ô nhập:
 *   観光[かんこう]です。       -> chữ Hán liền trước [ ] nhận cách đọc
 *   {東京駅|とうきょうえき}     -> chỉ rõ cả cụm (dùng khi cụm có cả kana, hoặc liền sau một chữ Hán khác)
 * Lưu xuống backend dạng đoạn: [{ text, reading? }].
 */

export interface SentenceSegment {
  text: string;
  reading?: string | null;
}

const KANJI = /[㐀-䶿一-鿿豈-﫿々〆〇ヵヶ]/;
const KANJI_RUN_AT_END = /[㐀-䶿一-鿿豈-﫿々〆〇ヵヶ]+$/;
const ALL_KANJI = /^[㐀-䶿一-鿿豈-﫿々〆〇ヵヶ]+$/;

export interface ParsedSentence {
  segments: SentenceSegment[];
  /** Chỗ gõ chưa đúng (để báo ngay dưới ô nhập) */
  problems: string[];
}

export function parseFurigana(input: string): ParsedSentence {
  const segments: SentenceSegment[] = [];
  const problems: string[] = [];
  let plain = '';

  const flushPlain = () => {
    if (plain) segments.push({ text: plain });
    plain = '';
  };
  const pushReading = (text: string, reading: string) => {
    flushPlain();
    segments.push({ text, reading });
  };

  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (ch === '{') {
      const end = input.indexOf('}', i);
      const body = end < 0 ? '' : input.slice(i + 1, end);
      const bar = body.indexOf('|');
      if (end < 0 || bar < 0) {
        problems.push('Thiếu "}" hoặc "|" trong {chữ|cách đọc}.');
        plain += ch;
        i++;
        continue;
      }
      const text = body.slice(0, bar).trim();
      const reading = body.slice(bar + 1).trim();
      if (!text || !reading) problems.push('{chữ|cách đọc} phải có cả chữ và cách đọc.');
      if (text && reading) pushReading(text, reading);
      else plain += text;
      i = end + 1;
      continue;
    }
    if (ch === '[') {
      const end = input.indexOf(']', i);
      if (end < 0) {
        problems.push('Thiếu "]" sau cách đọc.');
        plain += ch;
        i++;
        continue;
      }
      const reading = input.slice(i + 1, end).trim();
      const run = plain.match(KANJI_RUN_AT_END)?.[0];
      if (!run) {
        problems.push(`"[${reading}]" không đứng sau chữ Hán; dùng {chữ|cách đọc} cho cụm có kana.`);
      } else if (!reading) {
        problems.push('Cách đọc trong [ ] đang trống.');
      } else {
        plain = plain.slice(0, -run.length);
        pushReading(run, reading);
      }
      i = end + 1;
      continue;
    }
    plain += ch;
    i++;
  }
  flushPlain();
  return { segments, problems };
}

export function formatFurigana(segments: SentenceSegment[]): string {
  let out = '';
  for (const seg of segments) {
    if (!seg.reading) {
      out += seg.text;
      continue;
    }
    // Dạng gọn chỉ dùng được khi cả đoạn là chữ Hán và chữ ngay trước không phải chữ Hán (nếu không sẽ bị dính cụm)
    const prevIsKanji = out.length > 0 && KANJI.test(out[out.length - 1]);
    out += ALL_KANJI.test(seg.text) && !prevIsKanji ? `${seg.text}[${seg.reading}]` : `{${seg.text}|${seg.reading}}`;
  }
  return out;
}
