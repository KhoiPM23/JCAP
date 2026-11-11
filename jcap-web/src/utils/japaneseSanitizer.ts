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
 * Khử sạch triệt để các đuôi trợ động từ và trợ từ tiếng Nhật, ngăn ngừa từ khóa bị dính đuôi cụt (vd: いくらです -> いくら)
 */
export function stripJapaneseEndings(word: string): string {
  if (!word) return '';
  let clean = word.trim();
  if (
    clean === 'お願いします' ||
    clean === 'おねがいします' ||
    clean === 'ください' ||
    clean === 'すみません' ||
    clean === 'ありがとう'
  ) {
    return clean;
  }
  let prev = '';
  while (clean !== prev && clean.length > 1) {
    prev = clean;
    clean = clean
      .replace(
        /(でしょうか|ですか|でした|ました|ません|です|ます|だ|か|ね|よ|を|に|は|が|で|と|の|へ|から|まで)$/,
        ''
      )
      .trim();
  }
  if (clean === 'お願いし') return 'お願いします';
  return clean;
}

/**
 * Trích xuất từ khóa tiếng Nhật (Katakana, Kanji compound, từ để hỏi, từ vựng nội dung)
 * phục vụ Giàn giáo Cấp 1 (Tier 1: Keywords) khi BE không truyền sẵn keywords.
 */
export function extractJapaneseKeywords(sentence?: string | null): string[] {
  if (!sentence) return [];
  const clean = sanitizeDisplayJapanese(sentence);

  // 1. Nhận diện các từ vựng cụm cố định chuẩn (Standard lexical match - longest first)
  const standardLexicon = [
    '豚骨ラーメン', 'とんこつラーメン', 'ラーメン', 'カウンター席', 'テーブル席',
    '味濃いめ', '濃いめ', '辛め', 'かため',
    'おすすめ', 'いくら', 'お水', '水', 'メニュー',
    'どこ', 'いつ', 'だれ', 'どれ', 'どちら', '何名', '何人', '何',
    '一つ', '二つ', '三つ', '1つ', '2つ', '一人', '二人', '1人', '2人',
    'お願いします', 'おねがいします', 'ください', 'すみません', 'ありがとう'
  ];

  const detectedKeywords: string[] = [];
  let masked = clean;

  for (const lex of standardLexicon) {
    if (masked.includes(lex)) {
      detectedKeywords.push(lex);
      masked = masked.replace(new RegExp(lex, 'g'), ' ');
    }
  }

  // 2. Khớp từ Katakana (>= 2 ký tự) hoặc Kanji hợp thức trong phần còn lại
  const kanjiMatches = (masked.match(/[\u30A0-\u30FF]{2,}|[\u4E00-\u9FAF]{1,4}(?:[\u3040-\u309F]{1,2})?/g) || [])
    .map((word) => stripJapaneseEndings(word))
    .filter((word) => word.length >= 1 && word !== 'お' && word !== 'し');

  const allWords = [...detectedKeywords, ...kanjiMatches]
    .map((w) => stripJapaneseEndings(w))
    .filter((w) => w.length >= 1 && w !== 'お' && w !== 'し');

  if (allWords.length === 0) {
    const fallback = stripJapaneseEndings(clean.replace(/[。？！?!.,\s]/g, ''));
    return [fallback || 'お願いします'];
  }

  // Loại bỏ trùng lặp và lấy tối đa 4 từ khóa
  return Array.from(new Set(allWords)).slice(0, 4);
}

/**
 * Tạo mẫu câu điền khuyết / Khung ngữ pháp (Grammar Frame Scaffolding):
 * Thay thế từ khóa trọng tâm bằng [ ______ ] để người học tư duy,
 * luôn bảo toàn bộ khung ngữ pháp (đuôi câu ですか, お願いします) chứ không đục lỗ mù quáng.
 */
export function deriveJapaneseCloze(sentence?: string | null, targetKeyword?: string): string {
  if (!sentence) return 'これは [ ______ ] ですか。';
  const clean = sanitizeDisplayJapanese(sentence);

  if (clean.includes('いくら') || clean.includes('値段')) {
    return 'これは [ ______ ] ですか。';
  }
  if (clean.includes('おすすめ')) {
    return '[ ______ ] は何ですか。';
  }
  if (clean.includes('何名') || clean.includes('1人') || clean.includes('一人') || clean.includes('2人') || clean.includes('二人')) {
    return '[ ______ ] 人です。';
  }
  if (clean.includes('お願いします') || clean.includes('おねがいします') || clean.includes('ください')) {
    if (clean.includes('ラーメン')) {
      return '[ ______ ] を一つお願いします。';
    }
    return '[ ______ ] をお願いします。';
  }

  const keywords = extractJapaneseKeywords(clean);
  const rawKw =
    targetKeyword && clean.includes(targetKeyword)
      ? targetKeyword
      : keywords.length > 0
      ? keywords[0]
      : null;

  let keywordToBlank = rawKw;
  if (keywordToBlank && keywordToBlank !== 'お願いします' && keywordToBlank !== 'おねがいします') {
    const stripped = stripJapaneseEndings(keywordToBlank);
    if (stripped.length >= 1 && clean.includes(stripped)) {
      keywordToBlank = stripped;
    }
  }

  if (keywordToBlank && clean.includes(keywordToBlank)) {
    const result = clean.replace(keywordToBlank, ' [ ______ ] ');
    let finalCloze = result.replace(/\s+/g, ' ').trim();
    
    // Bảo toàn khung ngữ pháp đầy đủ - chống tình trạng đục lỗ cụt thành "[ ______ ] か。"
    const normalized = finalCloze.replace(/[\s\.,?!。、？！]/g, '');
    if (normalized === '[______]か' || normalized === '[______]ですか' || normalized === '[______]') {
      return 'これは [ ______ ] ですか。';
    }
    return finalCloze;
  }

  if (clean.length > 6) {
    const midStart = Math.floor(clean.length * 0.3);
    const midEnd = Math.floor(clean.length * 0.65);
    return (clean.slice(0, midStart) + ' [ ______ ] ' + clean.slice(midEnd)).trim();
  }

  return 'これは [ ______ ] ですか。';
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
      const withPunctuation = (sanitized.endsWith('。') || sanitized.endsWith('！') || sanitized.endsWith('？') || sanitized.endsWith('!'))
        ? sanitized
        : sanitized + '。';
      return withPunctuation.replace(JAPANESE_SPACE_REGEX, '');
    }
  }

  return withoutParen.replace(JAPANESE_SPACE_REGEX, '');
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

  // Ảo giác lặp Katakana vô nghĩa của Whisper khi gặp khoảng lặng hoặc nhiễu âm (VD: アアアア, トットットッ, ニャニャニャ)
  if (/^([ァ-ヴー]{1,4})\1{2,}$/.test(trimmed) || /([ァ-ヴー]{1,3})\1{3,}/.test(trimmed)) {
    return true;
  }

  // Ảo giác chuỗi Katakana vô nghĩa đơn độc khi người học ngập ngừng hoặc thở dài
  if (/^[ァ-ヴー]{5,}$/.test(trimmed)) {
    const validCommonWords = [
      'ラーメン', 'コーヒー', 'ビール', 'ホテル', 'メニュー', 'トイレ',
      'コンビニ', 'サービス', 'チケット', 'アルバイト', 'タクシー', 'エアコン'
    ];
    if (!validCommonWords.some((w) => trimmed.includes(w))) {
      return true;
    }
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
  // 1. Bỏ phần đọc bên trong <rt>...</rt> và ngoặc <rp>...</rp>
  let clean = text.replace(/<r[tp][^>]*>.*?<\/r[tp]>/gi, '');
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
/**
 * Tự động tạo thẻ <ruby><rt> cho các từ tiếng Nhật thông dụng nếu backend chưa kịp gắn furigana.
 * Đảm bảo 100% người học N5/N4 luôn đọc được cách phát âm trên giàn giáo gợi ý và phòng luyện.
 * Tích hợp từ vựng mục tiêu từ kịch bản để tạo ruby tự động chính xác cho cả câu người học.
 */
export function generateClientFuriganaHtml(
  text: string,
  customVocabs?: Array<{ word?: string; reading?: string; subtext?: string }>
): string {
  if (!text) return '';
  if (text.includes('<ruby>') && text.includes('</ruby>')) return cleanFuriganaHtml(text);

  const dict: [string, string][] = [
    // Cụm từ dài
    ['はじめまして', 'はじめまして'],
    ['よろしくお願いします', 'よろしくお<ruby>願<rt>ねが</rt></ruby>いします'],
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
    ['分かりました', '<ruby>分<rt>わ</rt></ruby>かりました'],
    ['分かります', '<ruby>分<rt>わ</rt></ruby>かります'],
    ['分かりません', '<ruby>分<rt>わ</rt></ruby>かりません'],
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
    ['曲がります', '<ruby>曲<rt>ま</rt></ruby>がります'],
    ['降ります', '<ruby>降<rt>お</rt></ruby>ります'],
    ['乗ります', '<ruby>乗<rt>の</rt></ruby>ります'],
    ['使います', '<ruby>使<rt>つか</rt></ruby>います'],
    ['買います', '<ruby>買<rt>か</rt></ruby>います'],
    ['払います', '<ruby>払<rt>はら</rt></ruby>います'],

    // Danh từ / Tính từ 2 chữ Hán
    // Từ vựng bối cảnh Quán ăn / Ramen / Cà phê
    ['豆乳', '<ruby>豆乳<rt>とうにゅう</rt></ruby>'],
    ['甘さ控えめ', '<ruby>甘<rt>あま</rt></ruby>さ<ruby>控<rt>ひか</rt></ruby>えめ'],
    ['抹茶', '<ruby>抹茶<rt>まっちゃ</rt></ruby>'],
    ['固さ', '<ruby>固<rt>かた</rt></ruby>さ'],
    ['固め', '<ruby>固<rt>かた</rt></ruby>め'],
    ['麺', '<ruby>麺<rt>めん</rt></ruby>'],
    ['濃さ', '<ruby>濃<rt>こ</rt></ruby>さ'],
    ['濃いめ', '<ruby>濃<rt>こ</rt></ruby>いめ'],
    ['薄め', '<ruby>薄<rt>うす</rt></ruby>め'],
    ['大盛り', '<ruby>大盛<rt>おおも</rt></ruby>り'],
    ['並盛り', '<ruby>並盛<rt>なみも</rt></ruby>り'],
    ['替玉', '<ruby>替玉<rt>かえだま</rt></ruby>'],
    ['味玉', '<ruby>味玉<rt>あじたま</rt></ruby>'],
    ['油', '<ruby>油<rt>あぶら</rt></ruby>'],
    ['普通', '<ruby>普通<rt>ふつう</rt></ruby>'],
    ['辛さ', '<ruby>辛<rt>から</rt></ruby>さ'],
    ['少なめ', '<ruby>少<rt>すく</rt></ruby>なめ'],
    ['多め', '<ruby>多<rt>おお</rt></ruby>め'],
    ['温め', '<ruby>温<rt>あたた</rt></ruby>め'],
    ['お湯', 'お<ruby>湯<rt>ゆ</rt></ruby>'],
    ['氷', '<ruby>氷<rt>こおり</rt></ruby>'],
    ['水', '<ruby>水<rt>みず</rt></ruby>'],
    ['お茶', 'お<ruby>茶<rt>ちゃ</rt></ruby>'],
    ['砂糖', '<ruby>砂糖<rt>さとう</rt></ruby>'],
    ['牛乳', '<ruby>牛乳<rt>ぎゅうにゅう</rt></ruby>'],
    ['料理', '<ruby>料理<rt>りょうり</rt></ruby>'],
    ['定食', '<ruby>定食<rt>ていしょく</rt></ruby>'],
    ['現金', '<ruby>現金<rt>げんきん</rt></ruby>'],
    ['支払', '<ruby>支払<rt>しはら</rt></ruby>'],
    ['持ち帰り', '<ruby>持<rt>も</rt></ruby>ち<ruby>帰<rt>かえ</rt></ruby>り'],
    ['店内', '<ruby>店内<rt>てんない</rt></ruby>'],
    ['袋', '<ruby>袋<rt>ふくろ</rt></ruby>'],
    ['全部', '<ruby>全部<rt>ぜんぶ</rt></ruby>'],
    ['一緒', '<ruby>一緒<rt>いっしょ</rt></ruby>'],
    ['別々', '<ruby>別々<rt>べつべつ</rt></ruby>'],
    ['結構', '<ruby>結構<rt>けっこう</rt></ruby>'],
    ['変更', '<ruby>変更<rt>へんこう</rt></ruby>'],
    ['確認', '<ruby>確認<rt>かくにん</rt></ruby>'],
    ['報告', '<ruby>報告<rt>ほうこく</rt></ruby>'],
    ['連絡', '<ruby>連絡<rt>れんらく</rt></ruby>'],
    ['相談', '<ruby>相談<rt>そうだん</rt></ruby>'],

    // Ga tàu / Giao thông / Di chuyển
    ['横断歩道', '<ruby>横断歩道<rt>おうだんほどう</rt></ruby>'],
    ['信号', '<ruby>信号<rt>しんごう</rt></ruby>'],
    ['角', '<ruby>角<rt>かど</rt></ruby>'],
    ['右', '<ruby>右<rt>みぎ</rt></ruby>'],
    ['左', '<ruby>左<rt>ひだり</rt></ruby>'],
    ['切符', '<ruby>切符<rt>きっぷ</rt></ruby>'],
    ['番線', '<ruby>番線<rt>ばんせん</rt></ruby>'],
    ['改札', '<ruby>改札<rt>かいさつ</rt></ruby>'],
    ['出口', '<ruby>出口<rt>でぐち</rt></ruby>'],
    ['入口', '<ruby>入口<rt>いりぐち</rt></ruby>'],
    ['電車', '<ruby>電車<rt>でんしゃ</rt></ruby>'],
    ['新幹線', '<ruby>新幹線<rt>しんかんせん</rt></ruby>'],
    ['空港', '<ruby>空港<rt>くうこう</rt></ruby>'],
    ['飛行機', '<ruby>飛行機<rt>ひこうき</rt></ruby>'],
    ['荷物', '<ruby>荷物<rt>にもつ</rt></ruby>'],
    ['時間', '<ruby>時間<rt>じかん</rt></ruby>'],

    // Khách sạn / Sinh hoạt
    ['部屋', '<ruby>部屋<rt>へや</rt></ruby>'],
    ['鍵', '<ruby>鍵<rt>かぎ</rt></ruby>'],
    ['予約', '<ruby>予約<rt>よやく</rt></ruby>'],
    ['温泉', '<ruby>温泉<rt>おんせん</rt></ruby>'],
    ['名前', '<ruby>名前<rt>なまえ</rt></ruby>'],
    ['住所', '<ruby>住所<rt>じゅうしょ</rt></ruby>'],
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
    ['分', '<ruby>分<rt>わ</rt></ruby>'],
    ['来', '<ruby>来<rt>き</rt></ruby>'],
    ['行', '<ruby>行<rt>い</rt></ruby>'],
    ['見', '<ruby>見<rt>み</rt></ruby>'],
    ['聞', '<ruby>聞<rt>き</rt></ruby>'],
    ['食', '<ruby>食<rt>た</rt></ruby>'],
    ['飲', '<ruby>飲<rt>の</rt></ruby>'],
    ['話', '<ruby>話<rt>はな</rt></ruby>'],
    ['待', '<ruby>待<rt>ま</rt></ruby>'],
    ['持', '<ruby>持<rt>も</rt></ruby>'],
    ['買', '<ruby>買<rt>か</rt></ruby>'],
    ['使', '<ruby>使<rt>つか</rt></ruby>'],
    ['頼', '<ruby>頼<rt>たの</rt></ruby>'],
    ['渡', '<ruby>渡<rt>わた</rt></ruby>'],
    ['曲', '<ruby>曲<rt>ま</rt></ruby>'],
    ['降', '<ruby>降<rt>お</rt></ruby>'],
    ['乗', '<ruby>乗<rt>の</rt></ruby>']
  ];

  // Nạp từ vựng mục tiêu động từ kịch bản
  if (Array.isArray(customVocabs)) {
    for (const v of customVocabs) {
      const w = v.word?.trim();
      const r = (v.reading || v.subtext)?.trim();
      if (w && r && /[\u4E00-\u9FAF]/.test(w) && w !== r) {
        dict.push([w, `<ruby>${w}<rt>${r}</rt></ruby>`]);
      }
    }
  }

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

  return cleanFuriganaHtml(result);
}

const RUBY_TAG_REGEX = /<ruby[^>]*>(?:<rp>.*?<\/rp>)?(.*?)(?:<rp>.*?<\/rp>)?<rt[^>]*>(.*?)<\/rt>(?:<rp>.*?<\/rp>)?<\/ruby>/gi;
const JAPANESE_SPACE_REGEX = /(?<=[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\u3001\u3002\uFF01\uFF1F!?,>\uFF09\)])[\s\u3000]+(?=[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\u3001\u3002\uFF01\uFF1F!?,<\uFF08\(])/g;

/**
 * Làm sạch thẻ <ruby> phát sinh từ AI:
 * - Đưa trợ từ, hiragana, dấu câu ra ngoài thẻ ruby (vd: <ruby>は海老<rt>えび</rt></ruby> -> は<ruby>海老<rt>えび</rt></ruby>)
 * - Đưa okurigana ra ngoài thẻ ruby (vd: <ruby>使われ<rt>つかわれ</rt></ruby> -> <ruby>使<rt>つか</rt></ruby>われ)
 * - Gỡ thẻ ruby nếu chữ gốc hoàn toàn là kana (vd: <ruby>が<rt>が</rt></ruby> -> が)
 * - Loại bỏ khoảng trắng thừa giữa các ký tự tiếng Nhật và thẻ ruby
 */
export function cleanFuriganaHtml(html?: string | null): string {
  if (!html) return '';

  let cleaned = html
    .replace(/>[\s\u3000]+</g, '><')
    .replace(/<ruby[^>]*>[\s\u3000]+/gi, '<ruby>')
    .replace(/<rt[^>]*>[\s\u3000]+/gi, '<rt>')
    .replace(/[\s\u3000]+<\/rt>/gi, '</rt>')
    .replace(/[\s\u3000]+<\/ruby>/gi, '</ruby>')
    .replace(/<\/ruby>[\s\u3000]+(?=[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF<])/gi, '</ruby>')
    .replace(/(?<=[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF>])[\s\u3000]+<ruby/gi, '<ruby')
    .replace(JAPANESE_SPACE_REGEX, '');

  cleaned = cleaned.replace(RUBY_TAG_REGEX, (_, rawBase, rawRt) => {
    let baseText = (rawBase || '').trim();
    let rtText = (rawRt || '').trim();

    if (!baseText) return '';
    if (!rtText) return baseText;

    if (!/[\u4E00-\u9FAF]/.test(baseText)) {
      return baseText;
    }

    let prefix = '';
    const leadingMatch = baseText.match(/^([^\u4E00-\u9FAF]+)([\u4E00-\u9FAF].*)$/);
    if (leadingMatch) {
      prefix = leadingMatch[1];
      baseText = leadingMatch[2];
    }

    let suffix = '';
    while (
      baseText.length > 0 &&
      rtText.length > 0 &&
      !/[\u4E00-\u9FAF]/.test(baseText[baseText.length - 1]) &&
      baseText[baseText.length - 1] === rtText[rtText.length - 1]
    ) {
      suffix = baseText[baseText.length - 1] + suffix;
      baseText = baseText.slice(0, -1);
      rtText = rtText.slice(0, -1);
    }

    const trailingMatch = baseText.match(/^(.*?[\u4E00-\u9FAF])([^\u4E00-\u9FAF]+)$/);
    if (trailingMatch) {
      baseText = trailingMatch[1];
      suffix = trailingMatch[2] + suffix;
    }

    return `${prefix}<ruby>${baseText}<rt>${rtText}</rt></ruby>${suffix}`;
  });

  // Quét triệt để lần cuối loại bỏ khoảng trắng rò rỉ giữa các ký tự tiếng Nhật và ruby
  cleaned = cleaned.replace(/(?<=[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\u3001\u3002\uFF01\uFF1F!?,>\uFF09\)])[\s\u3000]+(?=[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\u3001\u3002\uFF01\uFF1F!?,<\uFF08\(])/g, '');
  return cleaned;
}

/**
 * Làm sạch giải nghĩa từ vựng/ngữ pháp, loại bỏ các ký hiệu rườm rà như [N + ...], (Romaji), mã ngữ pháp...
 */
export function cleanPedagogicMeaning(raw?: string | null): string {
  if (!raw) return '';
  let str = raw.trim();
  str = str.replace(/\[.*?\]/g, '').trim();
  if (str.includes('•')) {
    str = str.split('•')[0].trim();
  }
  str = str.replace(/\([A-Za-z\s-]+\)/g, '').trim();
  str = str.replace(/[\(（](?:Nghi vấn|Mẫu gọi|Lịch sự|Khiêm nhường|Trình bày|Từ chối|Dùng khi|Yêu cầu).*?[\)）]/g, '').trim();
  str = str.replace(/[\(（][^\)）]*$/g, '').trim();
  str = str.replace(/^[\(（]+/, '').replace(/[\)）]+$/, '').trim();
  return str.replace(/\s{2,}/g, ' ');
}
