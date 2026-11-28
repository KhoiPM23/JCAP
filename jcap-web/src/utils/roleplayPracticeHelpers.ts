import { sanitizeDisplayJapanese, containsJapanese } from './japaneseSanitizer.ts';
import type { LinguisticFeedbackDto, RoleplayMissionDto, RoleplaySessionDetailsDto } from '../types/roleplay.ts';

export interface DynamicStagePropItem {
  id: string;
  icon: string;
  labelJp: string;
  reading?: string;
  meaningVi: string;
  actionSentenceJp: string;
  isHighlight?: boolean;
}

const STAGE_THEME_FALLBACKS: Record<string, Array<{ icon: string; labelJp: string; meaningVi: string; actionSentenceJp: string }>> = {
  ramen: [
    { icon: '', labelJp: '麺を硬めで', meaningVi: 'Chọn mì sợi cứng', actionSentenceJp: 'すみません、麺を硬めでお願いします。' },
    { icon: '', labelJp: '味玉を追加', meaningVi: 'Thêm trứng lòng đào', actionSentenceJp: '味玉をトッピングでお願いします。' },
    { icon: '', labelJp: 'カードで支払う', meaningVi: 'Hỏi thanh toán thẻ', actionSentenceJp: 'カードで支払うことはできますか？' },
  ],
  konbini: [
    { icon: '', labelJp: '宅配便を送る', meaningVi: 'Gửi bưu phẩm', actionSentenceJp: 'すみません、宅配便をお願いします。' },
    { icon: '', labelJp: '午前の時間帯', meaningVi: 'Chọn khung giờ sáng', actionSentenceJp: '明日の午前中でお願いします。' },
    { icon: '', labelJp: 'コピー機の使い方', meaningVi: 'Hỏi cách dùng máy in', actionSentenceJp: 'マルチコピー機の使い方を教えていただけますか？' },
  ],
  train: [
    { icon: '', labelJp: '切符を買う', meaningVi: 'Mua vé tàu', actionSentenceJp: 'すみません、新宿までの切符をお願いします。' },
    { icon: '', labelJp: '乗り場を確認', meaningVi: 'Hỏi sân ga tàu chạy', actionSentenceJp: 'この電車は何番線から出ますか？' },
    { icon: '', labelJp: '次の発車時刻', meaningVi: 'Hỏi giờ tàu tiếp theo', actionSentenceJp: '次の電車は何時ですか？' },
  ],
  office: [
    { icon: '', labelJp: '自己紹介・経験', meaningVi: 'Chia sẻ kinh nghiệm', actionSentenceJp: 'これまでの経験についてお話しします。' },
    { icon: '', labelJp: 'シフトの希望', meaningVi: 'Nêu nguyện vọng ca làm', actionSentenceJp: '週に三日、夕方のシフトを希望しています。' },
    { icon: '', labelJp: '志望動機', meaningVi: 'Lý do ứng tuyển', actionSentenceJp: '御社のサービスに魅力を感じて応募いたしました。' },
  ],
  cafe: [
    { icon: '', labelJp: 'おすすめを聞く', meaningVi: 'Hỏi món gợi ý', actionSentenceJp: 'おすすめのメニューは何ですか？' },
    { icon: '', labelJp: 'ホットで注文', meaningVi: 'Gọi đồ uống nóng', actionSentenceJp: 'ホットコーヒーを一つお願いします。' },
    { icon: '', labelJp: 'お会計', meaningVi: 'Thanh toán hóa đơn', actionSentenceJp: 'すみません、お会計をお願いします。' },
  ],
  zen: [
    { icon: '', labelJp: '挨拶・お礼', meaningVi: 'Chào hỏi & Cảm ơn', actionSentenceJp: '本日はよろしくお願いいたします。' },
    { icon: '', labelJp: '予約の確認', meaningVi: 'Xác nhận đặt chỗ', actionSentenceJp: '予約したグエンと申します。' },
    { icon: '', labelJp: '質問する', meaningVi: 'Hỏi thêm thông tin', actionSentenceJp: '少しお伺いしてもよろしいでしょうか？' },
  ],
};

export interface ScenarioThemePalette {
  bgStyle: { backgroundColor: string };
  accentColor: string;
}

/**
 * Suy luận bảng màu bối cảnh Nhật Bản (Nippon Colors) cho phòng luyện tập dựa theo mã, tiêu đề và loại cảnh.
 */
export function getScenarioThemePalette(
  scenarioCode?: string,
  title?: string,
  sceneType?: string
): ScenarioThemePalette {
  const code = (scenarioCode || '').toLowerCase();
  const scene = (sceneType || '').toLowerCase();
  const titleLower = (title || '').toLowerCase();

  // 1. Ẩm thực (Ramen, ăn uống, nhà hàng): 薄黄茶 (Usucha)
  if (
    code.includes('ramen') || code.includes('food') ||
    scene.includes('ramen') || scene.includes('food') || scene.includes('restaurant') ||
    titleLower.includes('ramen') || titleLower.includes('ăn') || titleLower.includes('quán')
  ) {
    return {
      bgStyle: { backgroundColor: '#FCF9F4' },
      accentColor: '#b45309',
    };
  }

  // 2. Di chuyển (Ga tàu, sân bay, vé): 浅葱 (Asagi)
  if (
    code.includes('station') || code.includes('train') || code.includes('travel') ||
    scene.includes('station') || scene.includes('airport') ||
    titleLower.includes('ga') || titleLower.includes('tàu') || titleLower.includes('bay')
  ) {
    return {
      bgStyle: { backgroundColor: '#F4F8FC' },
      accentColor: '#0284c7',
    };
  }

  // 3. Công sở (Phỏng vấn, công việc): 藍染 (Aizome)
  if (
    code.includes('baito') || code.includes('work') || code.includes('interview') ||
    scene.includes('interview') || scene.includes('office') ||
    titleLower.includes('phỏng vấn') || titleLower.includes('công sở') || titleLower.includes('baito')
  ) {
    return {
      bgStyle: { backgroundColor: '#F5F6FA' },
      accentColor: '#4f46e5',
    };
  }

  // 4. Mua sắm (Konbini, chợ, tính tiền): 鴇色 (Toki-iro)
  if (
    code.includes('konbini') || code.includes('shop') ||
    scene.includes('konbini') || scene.includes('shop') ||
    titleLower.includes('mua') || titleLower.includes('tiện lợi')
  ) {
    return {
      bgStyle: { backgroundColor: '#FDF8F6' },
      accentColor: '#e11d48',
    };
  }

  // 5. Đời sống / Mặc định: 若葉 (Wakaba)
  return {
    bgStyle: { backgroundColor: '#F6F9F7' },
    accentColor: '#059669',
  };
}

/**
 * Helper an toàn lấy trạng thái đánh giá (tránh lỗi khi quickStatus/status null hoặc undefined).
 */
export function getFeedbackStatus(feedback?: LinguisticFeedbackDto | null): string {
  if (!feedback) return 'good';
  const s = feedback.quickStatus || feedback.status || 'good';
  return s.toLowerCase();
}

/**
 * Suy luận ký tự Kanji đại diện gọn cho ngữ cảnh của từng thẻ gợi ý nhanh.
 */
export function inferStagePropIcon(jp: string, vi: string, theme: string): string {
  const combined = `${jp} ${vi}`.toLowerCase();
  if (/カード|現金|支払|会計|円|いくら|thẻ|tiền|thanh toán|giá/.test(combined)) return '金';
  if (/味玉|玉子|卵|トッピング|チャーシュー|ねぎ|trứng|topping|thêm/.test(combined)) return '具';
  if (/麺|ラーメン|スープ|硬|濃|うどん|そば|mì|nước dùng|sợi|món/.test(combined)) return '麺';
  if (/コーヒー|水|お茶|抹茶|ビール|ドリンク|nước|trà|cà phê|uống/.test(combined)) return '飲';
  if (/切符|駅|電車|新幹線|ホーム|乗|改札|空港|vé|tàu|ga|sân bay|chuyến/.test(combined)) return '切';
  if (/荷物|宅配便|スーツケース|送|箱|hành lý|bưu phẩm|gửi hàng|gói hàng/.test(combined)) return '荷';
  if (/時間|時|明日|今日|予約|シフト|午前|午後|giờ|hẹn|lịch|ca làm/.test(combined)) return '時';
  if (/仕事|面接|経験|志望|御社|会社|バイト|phỏng vấn|công ty|kinh nghiệm|ứng tuyển/.test(combined)) return '職';
  if (/薬|痛|熱|病院|アレルギー|症状|thuốc|đau|dị ứng|bệnh|khám/.test(combined)) return '薬';
  if (/コピー|マルチ|チケット|袋|温め|弁当|máy in|túi|hâm nóng|cơm hộp/.test(combined)) return '店';
  if (/部屋|チェックイン|鍵|温泉|予約|phòng|khách sạn|suối nước nóng/.test(combined)) return '宿';
  if (theme === 'cafe') return '珈';
  return '';
}

/**
 * Tạo câu giao tiếp tự nhiên hoàn chỉnh từ từ khóa trọng tâm theo bối cảnh kịch bản.
 */
export function buildNaturalPhrase(
  word: string,
  options: {
    theme: string;
    targetGrammars?: Array<{ exampleSentence?: string | null }>;
  }
): string {
  const clean = sanitizeDisplayJapanese(word);
  if (!clean) return 'はい、お願いします。';
  if (clean.length > 9 || /[。！？ますですか]$/.test(clean)) {
    return clean.endsWith('。') || clean.endsWith('？') || clean.endsWith('！') ? clean : `${clean}。`;
  }
  const matchingGrammar = options.targetGrammars?.find(
    (g) => g.exampleSentence && g.exampleSentence.includes(clean) && containsJapanese(g.exampleSentence)
  );
  if (matchingGrammar?.exampleSentence) {
    return sanitizeDisplayJapanese(matchingGrammar.exampleSentence);
  }
  if (options.theme === 'office') {
    return `${clean}についてお話しします。`;
  }
  if (options.theme === 'train') {
    return `すみません、${clean}はどこですか？`;
  }
  return `すみません、${clean}をお願いします。`;
}

/**
 * Tự động sinh Gợi ý Ngôn ngữ Bối cảnh (Contextual Prompts) thích ứng theo nhiệm vụ và kho từ vựng/ngữ pháp kịch bản.
 */
export function buildDynamicStageProps(
  session: Pick<RoleplaySessionDetailsDto, 'targetVocabularies' | 'targetGrammars'>,
  activeMission: RoleplayMissionDto | null | undefined,
  theme: string
): DynamicStagePropItem[] {
  const phraseOpts = { theme, targetGrammars: session.targetGrammars };
  const propsList: DynamicStagePropItem[] = [];
  const seenJp = new Set<string>();

  if (activeMission) {
    const missionJpMatches = (`${activeMission.content} ${activeMission.target || ''}`).match(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]{2,}/g);
    if (missionJpMatches) {
      for (const kw of missionJpMatches.slice(0, 2)) {
        if (!seenJp.has(kw)) {
          seenJp.add(kw);
          propsList.push({
            id: `mission-kw-${kw}`,
            icon: '',
            labelJp: kw,
            meaningVi: activeMission.content.length > 28 ? activeMission.content.slice(0, 28) + '…' : activeMission.content,
            actionSentenceJp: buildNaturalPhrase(kw, phraseOpts),
            isHighlight: true,
          });
        }
      }
    }
  }

  if (session.targetVocabularies && session.targetVocabularies.length > 0) {
    for (const v of session.targetVocabularies) {
      const cleanWord = sanitizeDisplayJapanese(v.word);
      if (cleanWord && containsJapanese(cleanWord) && !seenJp.has(cleanWord) && propsList.length < 4) {
        seenJp.add(cleanWord);
        propsList.push({
          id: `vocab-${v.id || cleanWord}`,
          icon: inferStagePropIcon(cleanWord, v.meaning || '', theme),
          labelJp: cleanWord,
          reading: v.reading,
          meaningVi: v.meaning || 'Từ vựng trọng tâm',
          actionSentenceJp: buildNaturalPhrase(cleanWord, phraseOpts),
        });
      }
    }
  }

  if (session.targetGrammars && session.targetGrammars.length > 0 && propsList.length < 4) {
    for (const g of session.targetGrammars) {
      const cleanPattern = sanitizeDisplayJapanese(g.pattern.replace(/[〜~]/g, '').trim());
      const example = g.exampleSentence && containsJapanese(g.exampleSentence)
        ? sanitizeDisplayJapanese(g.exampleSentence)
        : buildNaturalPhrase(cleanPattern, phraseOpts);
      if (cleanPattern && containsJapanese(cleanPattern) && !seenJp.has(cleanPattern) && propsList.length < 4) {
        seenJp.add(cleanPattern);
        propsList.push({
          id: `grammar-${g.id || cleanPattern}`,
          icon: '',
          labelJp: g.pattern,
          meaningVi: g.meaning || 'Mẫu câu mục tiêu',
          actionSentenceJp: example,
        });
      }
    }
  }

  if (propsList.length < 3) {
    const fbList = STAGE_THEME_FALLBACKS[theme] || STAGE_THEME_FALLBACKS.zen;
    for (const fb of fbList) {
      if (!seenJp.has(fb.labelJp) && propsList.length < 4) {
        seenJp.add(fb.labelJp);
        propsList.push({
          id: `fb-${fb.labelJp}`,
          ...fb,
        });
      }
    }
  }

  propsList.push({
    id: 'coping-repeat',
    icon: '',
    labelJp: 'もう一度お願いします',
    meaningVi: 'Nhờ nhắc lại lịch sự',
    actionSentenceJp: 'すみません、もう一度ゆっくりお願いできますか？',
  });

  return propsList.slice(0, 5);
}
