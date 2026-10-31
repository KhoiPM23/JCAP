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

  // Danh sách các câu ảo giác Whisper kinh điển khi micro thu khoảng lặng hoặc lặp prompt mồi
  const hallucinations = [
    'ご視聴ありがとうございました',
    '視聴ありがとうございました',
    'チャンネル登録',
    'おやすみなさい',
    '高評価',
    'Subtitles by',
    'Thank you for watching',
    '日常会話の日本語',
    '日常会話',
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

/**
 * Chuẩn hóa câu tiếng Nhật tinh khiết cho VOICEVOX Engine:
 * - Bỏ triệt để các thẻ <ruby>, <rt>...</rt>, và mọi tag HTML
 * - Bỏ các chú thích tiếng Việt trong ngoặc
 * Giúp VOICEVOX đọc đúng ngữ điệu tự nhiên, không đọc chữ cái HTML tiếng Anh r-u-b-y
 */
export function cleanJapaneseForTts(text?: string | null): string {
  if (!text) return '';
  // 1. Bỏ phần đọc bên trong <rt>...</rt>
  let clean = text.replace(/<rt[^>]*>.*?<\/rt>/gi, '');
  // 2. Bỏ tất cả thẻ HTML còn lại (<ruby>, </ruby>, <p>, v.v.)
  clean = clean.replace(/<[^>]+>/g, '');
  // 3. Bỏ cú pháp {kanji|furigana} nếu có
  clean = clean.replace(/\{([^|}]+)\|[^}]+\}/g, '$1');
  // 4. Bỏ chú thích tiếng Việt và khoảng trắng thừa
  clean = sanitizeDisplayJapanese(clean).trim();
  return clean;
}

/**
 * Tự động tạo thẻ <ruby><rt> cho các từ tiếng Nhật thông dụng nếu backend chưa kịp gắn furigana.
 * Đảm bảo 100% người học N5/N4 luôn đọc được cách phát âm trên giàn giáo gợi ý và phòng luyện.
 */
export function generateClientFuriganaHtml(text: string): string {
  if (!text) return '';
  if (text.includes('<ruby>') && text.includes('</ruby>')) return text;

  const dict: [string, string][] = [
    // Cụm từ dài
    ['はじめまして', 'はじめまして'],
    ['お願いします', 'お<ruby>願<rt>ねが</rt></ruby>いします'],
    ['お手伝い', 'お<ruby>手伝<rt>てつだ</rt></ruby>い'],
    ['少々お待ち', '<ruby>少々<rt>しょうしょう</rt></ruby>お<ruby>待<rt>ま</rt></ruby>ち'],
    ['志望動機', '<ruby>志望動機<rt>しぼうどうき</rt></ruby>'],
    ['自己紹介', '<ruby>自己紹介<rt>じこしょうかい</rt></ruby>'],
    ['電話番号', '<ruby>電話番号<rt>でんわばんごう</rt></ruby>'],
    ['営業時間', '<ruby>営業時間<rt>えいぎょうじかん</rt></ruby>'],
    ['何名様', '<ruby>何名様<rt>なんめいさま</rt></ruby>'],
    ['領収書', '<ruby>領収書<rt>りょうしゅうしょ</rt></ruby>'],
    ['改札口', '<ruby>改札口<rt>かいさつぐち</rt></ruby>'],
    ['履歴書', '<ruby>履歴書<rt>りれきしょ</rt></ruby>'],
    ['交差点', '<ruby>交差点<rt>こうさてん</rt></ruby>'],
    ['処方箋', '<ruby>処方箋<rt>しょほうせん</rt></ruby>'],
    ['向こう側', '<ruby>向<rt>む</rt></ruby>こう<ruby>側<rt>がわ</rt></ruby>'],

    // Động từ thông dụng & cụm ngữ pháp N5/N4
    ['来ました', '<ruby>来<rt>き</rt></ruby>ました'],
    ['行きます', '<ruby>行<rt>い</rt></ruby>きます'],
    ['食べます', '<ruby>食<rt>た</rt></ruby>べます'],
    ['飲みます', '<ruby>飲<rt>の</rt></ruby>みます'],
    ['話します', '<ruby>話<rt>はな</rt></ruby>します'],
    ['聞きます', '<ruby>聞<rt>き</rt></ruby>きます'],
    ['見ます', '<ruby>見<rt>み</rt></ruby>ます'],
    ['待ちます', '<ruby>待<rt>ま</rt></ruby>ちます'],
    ['渡ります', '<ruby>渡<rt>わた</rt></ruby>ります'],
    ['座ります', '<ruby>座<rt>すわ</rt></ruby>ります'],

    // Danh từ / Tính từ 2 chữ Hán
    ['大丈夫', '<ruby>大丈夫<rt>だいじょうぶ</rt></ruby>'],
    ['会計', '<ruby>会計<rt>かいけい</rt></ruby>'],
    ['注文', '<ruby>注文<rt>ちゅうもん</rt></ruby>'],
    ['豚骨', '<ruby>豚骨<rt>とんこつ</rt></ruby>'],
    ['醤油', '<ruby>醤油<rt>しょうゆ</rt></ruby>'],
    ['店員', '<ruby>店員<rt>てんいん</rt></ruby>'],
    ['面接', '<ruby>面接<rt>めんせつ</rt></ruby>'],
    ['担当', '<ruby>担当<rt>たんとう</rt></ruby>'],
    ['応募', '<ruby>応募<rt>おうぼ</rt></ruby>'],
    ['日本語', '<ruby>日本語<rt>にほんご</rt></ruby>'],
    ['英語', '<ruby>英語<rt>えいご</rt></ruby>'],
    ['学生', '<ruby>学生<rt>がくせい</rt></ruby>'],
    ['先生', '<ruby>先生<rt>せんせい</rt></ruby>'],
    ['会社', '<ruby>会社<rt>かいしゃ</rt></ruby>'],
    ['仕事', '<ruby>仕事<rt>しごと</rt></ruby>'],
    ['病院', '<ruby>病院<rt>びょういん</rt></ruby>'],
    ['薬局', '<ruby>薬局<rt>やっきょく</rt></ruby>'],
    ['今日', '<ruby>今日<rt>きょう</rt></ruby>'],
    ['明日', '<ruby>明日<rt>あした</rt></ruby>'],
    ['昨日', '<ruby>昨日<rt>きのう</rt></ruby>'],
    ['毎日', '<ruby>毎日<rt>まいにち</rt></ruby>'],

    // Chữ đơn lẻ
    ['私', '<ruby>私<rt>わたし</rt></ruby>'],
    ['僕', '<ruby>僕<rt>ぼく</rt></ruby>'],
    ['駅', '<ruby>駅<rt>えき</rt></ruby>'],
    ['道', '<ruby>道<rt>みち</rt></ruby>'],
    ['熱', '<ruby>熱<rt>ねつ</rt></ruby>'],
    ['薬', '<ruby>薬<rt>くすり</rt></ruby>'],
    ['頭', '<ruby>頭<rt>あたま</rt></ruby>'],
    ['喉', '<ruby>喉<rt>のど</rt></ruby>'],
    ['足', '<ruby>足<rt>あし</rt></ruby>'],
    ['痛', '<ruby>痛<rt>いた</rt></ruby>'],
    ['何', '<ruby>何<rt>なに</rt></ruby>'],
    ['願', '<ruby>願<rt>ねが</rt></ruby>'],
    ['来', '<ruby>来<rt>き</rt></ruby>'],
    ['行', '<ruby>行<rt>い</rt></ruby>'],
    ['見', '<ruby>見<rt>み</rt></ruby>'],
    ['聞', '<ruby>聞<rt>き</rt></ruby>'],
    ['食', '<ruby>食<rt>た</rt></ruby>'],
    ['飲', '<ruby>飲<rt>の</rt></ruby>'],
    ['話', '<ruby>話<rt>はな</rt></ruby>']
  ];

  dict.sort((a, b) => b[0].length - a[0].length);

  let result = text;
  const placeholders: Record<string, string> = {};

  dict.forEach(([word, ruby], idx) => {
    if (result.includes(word)) {
      const token = `__CLIENT_RUBY_${idx}__`;
      placeholders[token] = ruby;
      result = result.replaceAll(word, token);
    }
  });

  Object.entries(placeholders).forEach(([token, ruby]) => {
    result = result.replaceAll(token, ruby);
  });

  return result;
}

