import type { ScenarioListItem } from '../types/scenarioDetails';
import type { RoleplayResultDetail } from '../types/roleplayResult';

export interface SmartRecommendationItem {
  id: number;
  title: string;
  level: string;
  supportedJLPTLevels?: string[];
  topicName?: string | null;
  thumbnail?: string | null;
  description: string;
  matchScore: number;
  isTopPick: boolean;
  tag: string;
  actionReason: string;
}

export type AdaptiveContextSummary = {
  recommendedDifficulty?: string;
  recentTrend?: string;
  recommendedScenarios?: Array<{
    scenarioId: number;
    recommendedLevel: string;
    tier: 'Consolidate' | 'Core' | 'Stretch' | string;
    matchScore: number;
    predictedPassRate: number;
    reasonVi: string;
    isTopPick: boolean;
  }>;
  recommendedShadowings?: Array<{
    dialogueId: number;
    matchScore: number;
    reasonVi: string;
  }>;
  flashcardAdviceVi?: string | null;
  aiCoaching?: {
    sourceSessionId: number;
    generatedAtUtc: string;
    source: 'ai' | 'deterministic' | string;
    executiveDiagnosis?: string;
    axisInsights?: Record<string, { diagnosticVi?: string; drillMethodVi?: string }>;
    scenarioReasons?: Record<string, string>;
    shadowingReasons?: Record<string, string>;
    flashcardAdviceVi?: string | null;
    nextSessionFocus?: string | null;
  } | null;
};

const DEFAULT_SCENARIOS_CATALOG: Array<{
  id: number;
  title: string;
  level: string;
  supportedJLPTLevels: string[];
  topicName: string;
  description: string;
  thumbnail?: string;
  focusType: 'reflex' | 'keigo' | 'grammar' | 'vocab' | 'advanced';
  focusText: string;
}> = [
  {
    id: 1,
    title: 'Gọi món tại quán mì Ramen',
    level: 'N5',
    supportedJLPTLevels: ['N5', 'N4', 'N3'],
    topicName: 'Ẩm thực & Nhà hàng',
    description: 'Thực hành tùy chỉnh độ cứng của sợi mì, nước dùng đậm đà và thanh toán.',
    focusType: 'reflex',
    focusText: 'Rèn nhịp đối đáp tức thì & Phản xạ đời thường (< 2.0s)',
  },
  {
    id: 2,
    title: 'Phỏng vấn xin việc làm thêm (Baito)',
    level: 'N4',
    supportedJLPTLevels: ['N4', 'N3'],
    topicName: 'Công sở & Phỏng vấn',
    description: 'Ứng tuyển thu ngân/phục vụ, giới thiệu bản thân và lịch trình học.',
    focusType: 'keigo',
    focusText: 'Chuẩn hóa thể lịch sự (です・ます) và tác phong đàm thoại công sở',
  },
  {
    id: 3,
    title: 'Mua sắm tại Cửa hàng tiện lợi (Combini)',
    level: 'N5',
    supportedJLPTLevels: ['N5', 'N4'],
    topicName: 'Đời sống & Mua sắm',
    description: 'Hâm nóng đồ ăn bento, xin thêm thìa đũa và quét mã thanh toán ví điện tử.',
    focusType: 'vocab',
    focusText: 'Vốn từ vựng dịch vụ thiết yếu & Phản xạ câu ngắn',
  },
  {
    id: 4,
    title: 'Hỏi đường tại Ga Shinjuku',
    level: 'N5',
    supportedJLPTLevels: ['N5', 'N4'],
    topicName: 'Giao thông & Di chuyển',
    description: 'Tìm cổng soát vé Kaisatsuguchi, chuyển tuyến tàu Yamanote và hỏi nhân viên ga.',
    focusType: 'grammar',
    focusText: 'Củng cố trợ từ chỉ hướng に/へ/で & Thể nhờ vả ~Te kudasai',
  },
  {
    id: 5,
    title: 'Đặt và nhận phòng khách sạn tại Kyoto',
    level: 'N4',
    supportedJLPTLevels: ['N4', 'N3'],
    topicName: 'Du lịch & Dịch vụ',
    description: 'Check-in lễ tân, gửi hành lý trước giờ và hỏi tiện ích phòng nghỉ.',
    focusType: 'keigo',
    focusText: 'Giao tiếp dịch vụ trang nhã & Thể khả năng, khiêm nhường',
  },
];

export function buildAdaptiveRecommendations(
  result: RoleplayResultDetail,
  availableScenarios: ScenarioListItem[] = [],
  adaptiveContext: AdaptiveContextSummary | null = null,
): { items: SmartRecommendationItem[]; weaknessSummary: string } {
  const currentId = result.scenarioId || 0;
  const currentLevel = (result.jlptLevel || 'N5').toUpperCase().trim();
  const levelOrder = ['N5', 'N4', 'N3', 'N2', 'N1'];
  const currentIdx = Math.max(0, levelOrder.indexOf(currentLevel));
  const belowLevel = currentIdx > 0 ? levelOrder[currentIdx - 1] : 'N5';
  const sameLevel = levelOrder[currentIdx] || 'N5';
  const aboveLevel = currentIdx < levelOrder.length - 1 ? levelOrder[currentIdx + 1] : 'N1';

  const userMessages = (result.messages || []).filter(
    (m) => (m.sender || '').toLowerCase() === 'user'
  );
  const avgUtteranceLen =
    userMessages.length > 0
      ? Math.round(
          userMessages.reduce((acc, m) => acc + (m.japaneseText?.trim().length || 0), 0) /
            userMessages.length
        )
      : 0;
  const totalTargetVocab = result.targetVocabularies?.length || 0;
  const usedTargetVocab = (result.targetVocabularies || []).filter((v) =>
    userMessages.some(
      (m) =>
        (v.word && m.japaneseText?.includes(v.word)) ||
        (v.reading && m.japaneseText?.includes(v.reading))
    )
  ).length;
  const vocabCoverageRatio = totalTargetVocab > 0 ? usedTargetVocab / totalTargetVocab : 1;
  const overall = result.overallScore ?? 80;

  const recommendedTier: 'below' | 'same' | 'above' =
    overall >= 82 && vocabCoverageRatio >= 0.5 && avgUtteranceLen >= 9
      ? 'above'
      : overall < 68 || (totalTargetVocab > 0 && usedTargetVocab === 0) || avgUtteranceLen < 6
        ? 'below'
        : 'same';

  const vocabDesc =
    totalTargetVocab > 0
      ? `đã vận dụng ${usedTargetVocab}/${totalTargetVocab} từ vựng mục tiêu`
      : `đạt ${overall}/100 điểm tổng kết`;

  const tierRecommendationLabel =
    recommendedTier === 'above'
      ? `mức Nâng cao (${aboveLevel})`
      : recommendedTier === 'below'
        ? `mức Củng cố (${belowLevel})`
        : `cùng cấp ${sameLevel}`;

  const weaknessSummary = `Bạn ${vocabDesc} (~${Math.max(1, avgUtteranceLen)} ký tự/lượt). Hệ thống gợi ý ưu tiên ${tierRecommendationLabel}.`;

  const trimCardCopy = (text: string, maxLen = 88) => {
    const c = text.replace(/\s+/g, ' ').trim();
    return c.length > maxLen ? `${c.slice(0, maxLen - 1).trimEnd()}…` : c;
  };

  const aiExecutiveDiagnosis = adaptiveContext?.aiCoaching?.executiveDiagnosis?.trim();

  const backendRecs = adaptiveContext?.recommendedScenarios;
  if (backendRecs && backendRecs.length > 0) {
    const mapped = backendRecs
      .map((rec): SmartRecommendationItem | null => {
        const scn =
          availableScenarios.find((s) => s.id === rec.scenarioId) ||
          (availableScenarios.length === 0
            ? DEFAULT_SCENARIOS_CATALOG.find((d) => d.id === rec.scenarioId)
            : undefined);
        if (!scn) return null;

        const level = rec.recommendedLevel || sameLevel;
        const supportedLevels = scn.supportedJLPTLevels?.length
          ? scn.supportedJLPTLevels
          : [level];
        const tierLabel =
          rec.tier === 'Core'
            ? 'Đề xuất'
            : rec.tier === 'Consolidate'
            ? 'Củng cố'
            : 'Nâng cao';

        return {
          id: scn.id,
          title: scn.title,
          level,
          supportedJLPTLevels: supportedLevels,
          topicName: scn.topicName,
          thumbnail: (scn as any).thumbnailUrl || (scn as any).thumbnail,
          description: trimCardCopy(
            scn.description || 'Luyện tập tình huống thực chiến theo năng lực hiện tại.',
          ),
          matchScore: Math.round(rec.matchScore),
          isTopPick: Boolean(rec.isTopPick || rec.tier === 'Core'),
          tag: `${tierLabel} · ${level}`,
          actionReason:
            rec.reasonVi ||
            `Phù hợp trình độ ${level} theo hồ sơ năng lực thực chiến.`,
        };
      })
      .filter((item): item is SmartRecommendationItem => item !== null);

    if (mapped.length > 0) {
      return {
        items: mapped,
        weaknessSummary:
          aiExecutiveDiagnosis ||
          `Bạn ${vocabDesc} (~${Math.max(1, avgUtteranceLen)} ký tự/lượt). Hệ thống đề xuất ưu tiên trình độ ${adaptiveContext?.recommendedDifficulty || sameLevel}.`,
      };
    }
  }

  const cleanPool = (availableScenarios || []).filter(
    (s) =>
      s.id !== currentId &&
      !s.title?.toLowerCase().includes('master data') &&
      !s.title?.toLowerCase().includes('shared test')
  );
  const pool =
    cleanPool.length >= 3
      ? cleanPool
      : [
          ...cleanPool,
          ...DEFAULT_SCENARIOS_CATALOG.filter(
            (d) => d.id !== currentId && !cleanPool.some((c) => c.id === d.id)
          ),
        ];

  const usedScenarioIds = new Set<number>();
  const pickForLevel = (targetLv: string) => {
    const match =
      pool.find(
        (s) => !usedScenarioIds.has(s.id) && s.supportedJLPTLevels?.includes(targetLv)
      ) ||
      pool.find((s) => !usedScenarioIds.has(s.id)) ||
      DEFAULT_SCENARIOS_CATALOG[0];
    usedScenarioIds.add(match.id);
    return match;
  };

  const belowScn = pickForLevel(belowLevel);
  const sameScn = pickForLevel(sameLevel);
  const aboveScn = pickForLevel(aboveLevel);

  const vocabPct = Math.round(vocabCoverageRatio * 100);
  const belowMatch = recommendedTier === 'below'
    ? Math.min(97, Math.max(84, Math.round(100 - overall * 0.12)))
    : Math.min(88, Math.max(68, Math.round(82 - (overall - 70) * 0.25)));
  const sameMatch = recommendedTier === 'same'
    ? Math.min(97, Math.max(85, Math.round(80 + overall * 0.16)))
    : Math.min(91, Math.max(74, Math.round(76 + vocabPct * 0.14)));
  const aboveMatch = recommendedTier === 'above'
    ? Math.min(97, Math.max(86, Math.round(75 + overall * 0.22)))
    : Math.min(88, Math.max(60, Math.round(overall * 0.9)));

  const items: SmartRecommendationItem[] = [
    {
      id: belowScn.id,
      title: belowScn.title,
      level: belowLevel,
      supportedJLPTLevels: [belowLevel],
      topicName: belowScn.topicName,
      thumbnail: (belowScn as any).thumbnail,
      description: trimCardCopy(
        belowScn.description || 'Củng cố mẫu câu cốt lõi và trợ từ ở nhịp vừa sức.',
      ),
      matchScore: belowMatch,
      isTopPick: recommendedTier === 'below',
      tag: `Củng cố · ${belowLevel}`,
      actionReason: `Ôn câu ngắn gọn, chắc trợ từ (${usedTargetVocab}/${totalTargetVocab} từ vựng).`,
    },
    {
      id: sameScn.id,
      title: sameScn.title,
      level: sameLevel,
      supportedJLPTLevels: [sameLevel],
      topicName: sameScn.topicName,
      thumbnail: (sameScn as any).thumbnail,
      description: trimCardCopy(
        sameScn.description || 'Mở rộng vốn từ và diễn đạt tự nhiên ở cấp độ hiện tại.',
      ),
      matchScore: sameMatch,
      isTopPick: recommendedTier === 'same',
      tag: `Đề xuất · ${sameLevel}`,
      actionReason: `Luyện đúng cấp ${sameLevel} (~${Math.max(10, avgUtteranceLen)} ký tự/lượt).`,
    },
    {
      id: aboveScn.id,
      title: aboveScn.title,
      level: aboveLevel,
      supportedJLPTLevels: [aboveLevel],
      topicName: aboveScn.topicName,
      thumbnail: (aboveScn as any).thumbnail,
      description: trimCardCopy(
        aboveScn.description || 'Thử thách câu dài hơn và phản xạ nhanh không cần gợi ý.',
      ),
      matchScore: aboveMatch,
      isTopPick: recommendedTier === 'above',
      tag: `Nâng cao · ${aboveLevel}`,
      actionReason: `Thử thách cấp ${aboveLevel} với câu ghép và ít mở gợi ý.`,
    },
  ];

  return { items, weaknessSummary };
}
