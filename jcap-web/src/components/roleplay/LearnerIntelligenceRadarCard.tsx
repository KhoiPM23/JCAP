import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { roleplayService } from '../../services/roleplayService';
import { roleplayResultService } from '../../services/roleplayResultService';
import { scenarioService } from '../../services/scenarioService';
import { flashcardService } from '../../services/flashcardService';
import { scenarioVoiceService } from '../../services/scenarioVoiceService';
import { cleanPedagogicMeaning } from '../../utils/japaneseSanitizer';
import { resolveMediaUrl, resolveApiUrl } from '../../utils/apiBase';
import { TargetIcon, BarChartIcon, SparkIcon, BookmarkIcon, ArrowRightIcon, VolumeIcon, CompassIcon } from '../common/Icons';
import type { LearnerIntelligenceProfileDto } from '../../types/roleplay';
import type { ScenarioListItem } from '../../types/scenarioDetails';
import type { AdaptiveContextSummary } from '../../utils/roleplayResultHelpers';

export interface LearnerIntelligenceRadarCardProps {
  onRefresh?: () => void;
  className?: string;
  onNavigateToScenario?: (scenarioId?: number, scenarioCode?: string) => void;
}

interface ParsedSkillItem {
  type: 'vocab' | 'grammar';
  japanese: string;
  vietnamese: string;
  raw: string;
}

const parseSkillItem = (raw: string): ParsedSkillItem => {
  const isGrammar = raw.startsWith('Ngữ pháp:') || raw.includes('～') || raw.includes('〜');
  const clean = raw.replace(/^(Từ vựng:|Ngữ pháp:)\s*/i, '').trim();
  const firstParenIdx = clean.search(/[\(（]/);
  if (firstParenIdx > 0) {
    const japanese = clean.slice(0, firstParenIdx).trim();
    const rawMeaning = clean
      .slice(firstParenIdx + 1)
      .replace(/[\)）]+\s*$/, '')
      .replace(/[\(（][^\)）]*[\)）]?/g, '')
      .trim();
    const cleanedMeaning = cleanPedagogicMeaning(rawMeaning);
    return {
      type: isGrammar ? 'grammar' : 'vocab',
      japanese,
      vietnamese: cleanedMeaning || (isGrammar ? 'Cấu trúc ngữ pháp thực chiến trong hội thoại' : 'Từ vựng trọng tâm đã vận dụng trong hội thoại'),
      raw,
    };
  }
  return {
    type: isGrammar ? 'grammar' : 'vocab',
    japanese: clean,
    vietnamese: isGrammar ? 'Cấu trúc ngữ pháp thực chiến trong hội thoại' : 'Từ vựng trọng tâm đã vận dụng trong hội thoại',
    raw,
  };
};

interface RadarAxisConfig {
  id: string;
  shortLabel: string;
  fullTitle: string;
  normalizedScore: number; // 0..100 for radar polygon & 10-segment bar
  displayValue: string;
  unitLabel: string;
  statusLabel: string;
  statusText: string;
  scopeBadge: string;
  diagnosticDetail: string;
  drillMethod: string;
  topicCode: string;
  topicName: string;
  accentColor: string;
  badgeClass: string;
}

const getSkillStatusTheme = (score: number) => {
  if (score >= 75) {
    return {
      hex: '#059669',
      badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
      statusLabel: 'Đạt',
    };
  }
  if (score >= 50) {
    return {
      hex: '#D97706',
      badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
      statusLabel: 'Trung bình',
    };
  }
  return {
    hex: '#DC2626',
    badgeClass: 'bg-rose-50 text-rose-800 border-rose-200',
    statusLabel: 'Chưa đạt',
  };
};

const getMasteryRank = (score: number) => {
  if (score >= 90) return { title: 'Xuất sắc', sub: 'Làm chủ phản xạ', shortTag: 'Tốt' };
  if (score >= 80) return { title: 'Thành thạo', sub: 'Đối đáp trôi chảy', shortTag: 'Đạt' };
  if (score >= 70) return { title: 'Khá tốt', sub: 'Vững vàng thực chiến', shortTag: 'Đạt' };
  if (score >= 60) return { title: 'Đạt chuẩn', sub: 'Đang tiến bộ đều', shortTag: 'Đạt' };
  return { title: 'Chưa đạt', sub: 'Cần luyện thêm nền tảng', shortTag: 'Cần ôn' };
};

export const LearnerIntelligenceRadarCard: React.FC<LearnerIntelligenceRadarCardProps> = ({
  className = '',
  onNavigateToScenario,
}) => {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<LearnerIntelligenceProfileDto | null>(null);
  const [adaptiveContext, setAdaptiveContext] = useState<(AdaptiveContextSummary & {
    hotWeaknesses?: string[];
    chronicWeaknesses?: string[];
    recommendedScenarioIds?: number[];
  }) | null>(null);
  const [availableScenarios, setAvailableScenarios] = useState<ScenarioListItem[]>([]);
  const [completedScenarioIds, setCompletedScenarioIds] = useState<Set<number>>(new Set());
  const [completedScenarioTitles, setCompletedScenarioTitles] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState<number>(0);
  const [selectedAxisId, setSelectedAxisId] = useState<string | null>(null);
  const [deckFilter, setDeckFilter] = useState<'all' | 'due' | 'vocab' | 'grammar'>('all');
  const [deckPage, setDeckPage] = useState<number>(1);
  const DECK_PAGE_SIZE = 3;
  const [savedItems, setSavedItems] = useState<Set<string>>(new Set());
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  useEffect(() => {
    let isCurrent = true;

    // Đọc ngay từ localStorage "jcap_saved_flashcards" để các từ đã lưu lập tức sáng màu Bookmark
    const syncSavedFromStorage = () => {
      try {
        const rawLocal = localStorage.getItem('jcap_saved_flashcards');
        if (rawLocal) {
          const parsed = JSON.parse(rawLocal);
          if (Array.isArray(parsed)) {
            const loadedKeys = new Set<string>();
            parsed.forEach((it: any) => {
              const type = (it.type === 'grammar' || it.itemType === 'grammar' || it.pattern) ? 'grammar' : 'vocab';
              const word = it.word || it.pattern || it.frontText;
              if (word) loadedKeys.add(`${type}:${word}`);
            });
            setSavedItems(loadedKeys);
          }
        }
      } catch {}
    };
    syncSavedFromStorage();

    const handleBookmarksChanged = () => {
      syncSavedFromStorage();
    };
    window.addEventListener('jcap_bookmarks_updated', handleBookmarksChanged);

    const fetchProfileAndScenarios = async () => {
      setIsLoading(true);
      setError(null);

      // Tải song song danh sách kịch bản để đồng bộ thẻ đề xuất như trang Kết quả (loại bỏ dữ liệu test nội bộ)
      scenarioService.getScenarios().then((scnRes) => {
        if (isCurrent && scnRes.success && scnRes.data) {
          const cleanScenarios = scnRes.data.filter(
            (s) => !/master data|shared test/i.test(s.title || '')
          );
          setAvailableScenarios(cleanScenarios.length > 0 ? cleanScenarios : scnRes.data);
        }
      }).catch(() => {});

      // Tải song song ngữ cảnh thích ứng chuẩn (ngắn hạn + dài hạn) từ Core Adaptive Engine
      try {
        const token = localStorage.getItem('jcap_token');
        fetch(resolveApiUrl('/api/learner/adaptive-context'), {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((json) => {
            if (isCurrent && json?.success && json?.data) {
              setAdaptiveContext(json.data);
            }
          })
          .catch(() => {});
      } catch {
        // ignore
      }

      // Lấy lịch sử kết quả để biết kịch bản nào người học đã từng hoàn thành
      roleplayResultService.getHistory(1, 50).then((histRes) => {
        if (isCurrent && histRes.data?.items) {
          const ids = new Set<number>();
          const titles = new Set<string>();
          histRes.data.items.forEach((it: any) => {
            if (it.scenarioId) ids.add(Number(it.scenarioId));
            if (it.scenarioTitle) titles.add(String(it.scenarioTitle).trim().toLowerCase());
          });
          setCompletedScenarioIds(ids);
          setCompletedScenarioTitles(titles);
        }
      }).catch(() => {});

      // 1. Gọi API hồ sơ năng lực trực tiếp từ backend (tuyệt đối không bịa kết quả fallback khi lỗi)
      try {
        const res = await roleplayService.getIntelligenceProfile();
        if (!isCurrent) return;
        if (res.success && res.data) {
          setProfile(res.data);
        } else {
          setProfile(null);
          setError(res.message || 'Không thể tải dữ liệu năng lực cá nhân. Vui lòng thử lại.');
        }
      } catch (err: any) {
        if (!isCurrent) return;
        setProfile(null);
        setError(err?.message || 'Lỗi kết nối khi tải dữ liệu năng lực cá nhân.');
      } finally {
        if (isCurrent) setIsLoading(false);
      }
    };

    void fetchProfileAndScenarios();
    return () => {
      isCurrent = false;
      window.removeEventListener('jcap_bookmarks_updated', handleBookmarksChanged);
    };
  }, [retryNonce]);

  // Xây dựng cấu hình đa chiều kỹ năng đối thoại chuẩn xác và khách quan
  const radarAxes: RadarAxisConfig[] = useMemo(() => {
    if (!profile) return [];

    const reflex = Math.round(profile.speakingReflexIndex ?? 75);
    const styleScore = Math.round(profile.keigoCommandScore ?? 75);
    const particles = Math.round(profile.particleAccuracyRate ?? 80);
    const rawMora = Number((profile.averageMoraRate ?? 4.0).toFixed(1));
    const moraNorm = Math.max(18, Math.min(100, Math.round((rawMora / 6.0) * 100)));
    const confidence = Math.round(profile.communicativeConfidenceScore ?? 75);
    const autonomy = Math.max(0, 100 - Math.round(profile.hintDependencyRate ?? 20));

    const getReflexAssessment = (val: number) => {
      if (val >= 80) return 'Bật lời nhạy bén';
      if (val >= 65) return 'Phản hồi nhanh';
      if (val >= 50) return 'Nhịp suy nghĩ ổn';
      return 'Độ trễ khởi lời còn cao';
    };

    const getMoraAssessment = (mora: number) => {
      if (mora >= 5.5) return 'Lưu loát tự nhiên';
      if (mora >= 4.2) return 'Nhịp điệu đều đặn';
      if (mora >= 3.0) return 'Chậm rãi, rõ ràng';
      return 'Cần nối cụm từ mượt hơn';
    };

    const reflexTheme = getSkillStatusTheme(reflex);
    const styleTheme = getSkillStatusTheme(styleScore);
    const particleTheme = getSkillStatusTheme(particles);
    const moraTheme = getSkillStatusTheme(moraNorm);
    const confidenceTheme = getSkillStatusTheme(confidence);
    const autonomyTheme = getSkillStatusTheme(autonomy);

    const axisInsights = adaptiveContext?.aiCoaching?.axisInsights;
    const withAiInsight = (axisId: string, fallbackDiagnostic: string, fallbackDrill: string) => {
      const insight = axisInsights?.[axisId];
      return {
        diagnosticDetail: insight?.diagnosticVi?.trim() || fallbackDiagnostic,
        drillMethod: insight?.drillMethodVi?.trim() || fallbackDrill,
      };
    };

    const reflexInsight = withAiInsight(
      'reflex',
      reflex >= 75
        ? 'Bạn bắt nhịp câu hỏi rất nhanh, giữ luồng đối thoại tự nhiên.'
        : 'Thời gian từ lúc AI dứt lời đến khi bạn mở lời còn trễ. Hãy tập bật ngay từ khóa hoặc lời đáp ngắn.',
      'Luyện phản xạ nhanh tại quán ăn và cửa hàng.',
    );
    const styleInsight = withAiInsight(
      'style',
      styleScore >= 80
        ? 'Bạn chọn đúng thể lịch sự hoặc thân mật theo vai vế tình huống.'
        : 'Đôi lúc còn trộn lẫn thể ngắn và thể lịch sự trong cùng cuộc trò chuyện.',
      'Luyện chuyển đổi cách xưng hô và thể văn theo vai vế.',
    );
    const particleInsight = withAiInsight(
      'particle',
      particles >= 85
        ? 'Khung câu vững vàng, dùng chính xác các trợ từ cơ bản.'
        : 'Cần phân biệt rõ trợ từ に và で khi nói về địa điểm, phương tiện.',
      'Luyện hỏi đường và mua vé với nhiều trợ từ chỉ nơi chốn.',
    );
    const moraInsight = withAiInsight(
      'mora',
      rawMora >= 4.0
        ? 'Bạn giữ nhịp trường âm, âm ngắt ổn định, dễ nghe.'
        : 'Tốc độ nói còn ngắt quãng. Hãy luyện nối cụm từ thành một hơi liền mạch.',
      'Nghe mẫu rồi lặp lại theo nhịp câu đời thường.',
    );
    const confidenceInsight = withAiInsight(
      'confidence',
      confidence >= 75
        ? 'Hệ thống nhận diện giọng nói rõ ràng, âm lượng ổn định.'
        : 'Một số âm cuối câu còn nhỏ hoặc bị nuốt âm. Hãy giữ hơi đều tới cuối câu.',
      'Luyện đọc rõ tên món, số lượng và số tiền qua micro.',
    );
    const autonomyInsight = withAiInsight(
      'autonomy',
      autonomy >= 80
        ? 'Bạn tự diễn đạt tốt bằng vốn từ của mình, ít cần mở gợi ý.'
        : 'Vẫn còn mở gợi ý hoặc xem dịch sớm. Hãy thử tự ghép câu ngắn trước.',
      'Thử đối thoại không dùng gợi ý Cấp 2/3.',
    );

    return [
      {
        id: 'reflex',
        shortLabel: 'Phản xạ',
        fullTitle: 'Phản xạ khởi lời',
        normalizedScore: reflex,
        displayValue: `${reflex}`,
        unitLabel: '/100',
        statusLabel: reflexTheme.statusLabel,
        statusText: getReflexAssessment(reflex),
        scopeBadge: 'Tốc độ bật lời sau câu hỏi',
        diagnosticDetail: reflexInsight.diagnosticDetail,
        drillMethod: reflexInsight.drillMethod,
        topicCode: 'DINING',
        topicName: 'Ẩm thực',
        accentColor: reflexTheme.hex,
        badgeClass: reflexTheme.badgeClass,
      },
      {
        id: 'style',
        shortLabel: 'Văn phong',
        fullTitle: 'Thích ứng văn phong',
        normalizedScore: styleScore,
        displayValue: `${styleScore}`,
        unitLabel: '/100',
        statusLabel: styleTheme.statusLabel,
        statusText: styleScore >= 80 ? 'Đúng vai vế giao tiếp' : 'Cần đồng nhất thể văn',
        scopeBadge: 'Linh hoạt lịch sự / thân mật',
        diagnosticDetail: styleInsight.diagnosticDetail,
        drillMethod: styleInsight.drillMethod,
        topicCode: 'STUDY_WORK',
        topicName: 'Công sở',
        accentColor: styleTheme.hex,
        badgeClass: styleTheme.badgeClass,
      },
      {
        id: 'particle',
        shortLabel: 'Trợ từ',
        fullTitle: 'Độ chuẩn trợ từ',
        normalizedScore: particles,
        displayValue: `${particles}`,
        unitLabel: '%',
        statusLabel: particleTheme.statusLabel,
        statusText: particles >= 85 ? 'Chuẩn xác は, が, を, に, で' : 'Lưu ý trợ từ に, で, を',
        scopeBadge: 'Cấu trúc trợ từ trong câu',
        diagnosticDetail: particleInsight.diagnosticDetail,
        drillMethod: particleInsight.drillMethod,
        topicCode: 'TRANSPORT',
        topicName: 'Di chuyển',
        accentColor: particleTheme.hex,
        badgeClass: particleTheme.badgeClass,
      },
      {
        id: 'mora',
        shortLabel: 'Nhịp nói',
        fullTitle: 'Nhịp điệu phát âm',
        normalizedScore: moraNorm,
        displayValue: `${rawMora.toFixed(1)}`,
        unitLabel: ' âm/s',
        statusLabel: moraTheme.statusLabel,
        statusText: getMoraAssessment(rawMora),
        scopeBadge: 'Chuẩn giao tiếp: 4.0–6.0 âm/giây',
        diagnosticDetail: moraInsight.diagnosticDetail,
        drillMethod: moraInsight.drillMethod,
        topicCode: 'DAILY_LIFE',
        topicName: 'Đời sống',
        accentColor: moraTheme.hex,
        badgeClass: moraTheme.badgeClass,
      },
      {
        id: 'confidence',
        shortLabel: 'Phát âm',
        fullTitle: 'Độ rõ phát âm',
        normalizedScore: confidence,
        displayValue: `${confidence}`,
        unitLabel: '/100',
        statusLabel: confidenceTheme.statusLabel,
        statusText: confidence >= 75 ? 'Khẩu hình sáng, rõ âm' : 'Cần nói tròn vành rõ chữ',
        scopeBadge: 'Độ rõ khi nói qua micro',
        diagnosticDetail: confidenceInsight.diagnosticDetail,
        drillMethod: confidenceInsight.drillMethod,
        topicCode: 'SHOPPING',
        topicName: 'Mua sắm',
        accentColor: confidenceTheme.hex,
        badgeClass: confidenceTheme.badgeClass,
      },
      {
        id: 'autonomy',
        shortLabel: 'Tự chủ',
        fullTitle: 'Tự chủ đối đáp',
        normalizedScore: autonomy,
        displayValue: `${autonomy}`,
        unitLabel: '%',
        statusLabel: autonomyTheme.statusLabel,
        statusText: autonomy >= 80 ? 'Độc lập không cần gợi ý' : 'Cần giảm mở gợi ý',
        scopeBadge: 'Tỷ lệ tự lập câu không trợ giúp',
        diagnosticDetail: autonomyInsight.diagnosticDetail,
        drillMethod: autonomyInsight.drillMethod,
        topicCode: 'DINING',
        topicName: 'Tự chủ',
        accentColor: autonomyTheme.hex,
        badgeClass: autonomyTheme.badgeClass,
      },
    ];
  }, [profile, adaptiveContext?.aiCoaching]);

  // Mặc định chọn kỹ năng có điểm thấp nhất để người học thấy ngay điểm cần bứt phá
  const activeAxis = useMemo(() => {
    if (radarAxes.length === 0) return null;
    if (selectedAxisId) {
      const found = radarAxes.find((a) => a.id === selectedAxisId);
      if (found) return found;
    }
    const sorted = [...radarAxes].sort((a, b) => a.normalizedScore - b.normalizedScore);
    return sorted[0];
  }, [radarAxes, selectedAxisId]);

  // Tính toán tọa độ SVG cho Biểu đồ Lục giác (Hexagonal Radar Polygon)
  const radarGeometry = useMemo(() => {
    const cx = 175;
    const cy = 152;
    const maxR = 96;
    const levels = [0.25, 0.5, 0.75, 1.0];

    const getPoint = (index: number, ratio: number) => {
      const angleDeg = -90 + index * 60;
      const angleRad = (angleDeg * Math.PI) / 180;
      return {
        x: Number((cx + maxR * ratio * Math.cos(angleRad)).toFixed(1)),
        y: Number((cy + maxR * ratio * Math.sin(angleRad)).toFixed(1)),
      };
    };

    const gridPolygons = levels.map((lvl) => {
      const pts = [0, 1, 2, 3, 4, 5].map((i) => {
        const p = getPoint(i, lvl);
        return `${p.x},${p.y}`;
      });
      return pts.join(' ');
    });

    const benchmarkPolygon = [0, 1, 2, 3, 4, 5]
      .map((i) => {
        const p = getPoint(i, 0.8);
        return `${p.x},${p.y}`;
      })
      .join(' ');

    const dataPoints = radarAxes.map((axis, idx) => {
      const ratio = Math.max(0.15, Math.min(1.0, axis.normalizedScore / 100));
      const pt = getPoint(idx, ratio);
      const axisEnd = getPoint(idx, 1.0);
      const labelPt = getPoint(idx, 1.29);
      return {
        axis,
        idx,
        x: pt.x,
        y: pt.y,
        endX: axisEnd.x,
        endY: axisEnd.y,
        labelX: labelPt.x,
        labelY: labelPt.y,
      };
    });

    const learnerPolygon = dataPoints.map((d) => `${d.x},${d.y}`).join(' ');

    return {
      cx,
      cy,
      maxR,
      gridPolygons,
      benchmarkPolygon,
      dataPoints,
      learnerPolygon,
    };
  }, [radarAxes]);

  // Xây dựng Bộ 3 Kịch bản Đề xuất Thích ứng từ Core Adaptive Engine (ưu tiên RecommendedScenarios với điểm IRT+ZPD+FSRS thật từ Backend)
  const adaptiveRecommendations = useMemo(() => {
    if (!profile || availableScenarios.length === 0) return [];

    const shortCap = (text: string, maxLen = 68) => {
      const clean = text.replace(/\s+/g, ' ').trim();
      return clean.length > maxLen ? `${clean.slice(0, maxLen - 1).trimEnd()}…` : clean;
    };

    const backendRecs = adaptiveContext?.recommendedScenarios;
    if (backendRecs && backendRecs.length > 0) {
      const mapped = backendRecs
        .map((rec) => {
          const scn = availableScenarios.find((s) => s.id === rec.scenarioId);
          if (!scn) return null;

          const tierTag =
            rec.tier === 'Core'
              ? 'Đề xuất'
              : rec.tier === 'Consolidate'
              ? 'Củng cố'
              : 'Nâng cao';

          const fallbackLevel = rec.recommendedLevel || adaptiveContext?.recommendedDifficulty || 'N5';
          const supportedLevels = scn.supportedJLPTLevels?.length
            ? scn.supportedJLPTLevels
            : [fallbackLevel];

          return {
            id: scn.id,
            title: scn.title,
            description: shortCap(scn.description || '', 90),
            level: fallbackLevel,
            recommendedLevel: fallbackLevel,
            supportedJLPTLevels: supportedLevels,
            topicName: scn.topicName || 'Thực chiến',
            thumbnail: resolveMediaUrl((scn as any)?.thumbnailUrl || (scn as any)?.thumbnail),
            tag: `${tierTag} · ${fallbackLevel}`,
            matchScore: Math.round(rec.matchScore),
            actionReason: rec.reasonVi || `Phù hợp trình độ ${fallbackLevel}.`,
            isTopPick: Boolean(rec.isTopPick || rec.tier === 'Core'),
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);

      if (mapped.length > 0) {
        return mapped;
      }
    }

    const sortedWeakest = [...radarAxes].sort((a, b) => a.normalizedScore - b.normalizedScore);
    const primaryWeak = sortedWeakest[0];
    const secondaryWeak = sortedWeakest[1] || sortedWeakest[0];
    const strongest = sortedWeakest[sortedWeakest.length - 1] || sortedWeakest[0];

    const usedIds = new Set<number>();
    const pickScenario = (preferredId?: number, preferredTopic?: string): ScenarioListItem => {
      if (preferredId) {
        const byId = availableScenarios.find((s) => s.id === preferredId && !usedIds.has(s.id));
        if (byId) {
          usedIds.add(byId.id);
          return byId;
        }
      }
      if (preferredTopic) {
        const byTopic = availableScenarios.find((s) => s.topicCode === preferredTopic && !usedIds.has(s.id));
        if (byTopic) {
          usedIds.add(byTopic.id);
          return byTopic;
        }
      }
      const firstAvail = availableScenarios.find((s) => !usedIds.has(s.id)) || availableScenarios[0];
      if (firstAvail) usedIds.add(firstAvail.id);
      return firstAvail;
    };

    const adaptiveIds = adaptiveContext?.recommendedScenarioIds ?? [];
    const firstScn = pickScenario(adaptiveIds[0] ?? profile.nextRecommendedScenarioId, primaryWeak?.topicCode);
    const secondScn = pickScenario(adaptiveIds[1], secondaryWeak?.topicCode);
    const thirdScn = pickScenario(adaptiveIds[2], strongest?.topicCode);

    const sameMatch = Math.min(96, Math.max(82, Math.round(80 + (profile.communicativeConfidenceScore || 75) * 0.16)));
    const belowMatch = Math.min(sameMatch - 3, Math.max(68, Math.round(88 - (primaryWeak?.normalizedScore ?? 70) * 0.12)));
    const aboveMatch = Math.min(sameMatch - 5, Math.max(64, Math.round((strongest?.normalizedScore ?? 75) * 0.88)));

    const hotFocus = adaptiveContext?.hotWeaknesses?.[0];
    const chronicFocus = adaptiveContext?.chronicWeaknesses?.[0];
    const recDiff = adaptiveContext?.recommendedDifficulty || 'N5';
    const nextDiff = recDiff === 'N5' ? 'N4' : 'N3';

    const picks = [
      {
        id: secondScn.id,
        title: secondScn.title,
        description: shortCap(secondScn.description || '', 90),
        level: recDiff,
        recommendedLevel: recDiff,
        supportedJLPTLevels: secondScn.supportedJLPTLevels?.length ? secondScn.supportedJLPTLevels : [recDiff],
        topicName: secondScn.topicName || primaryWeak?.topicName || 'Nền tảng',
        thumbnail: resolveMediaUrl((secondScn as any)?.thumbnailUrl || (secondScn as any)?.thumbnail),
        tag: `Củng cố · ${recDiff}`,
        matchScore: belowMatch,
        actionReason: chronicFocus
          ? `Củng cố điểm hay vướng (${chronicFocus}) ở mức ${recDiff}.`
          : primaryWeak
          ? `Cải thiện ${primaryWeak.shortLabel.toLowerCase()} (hiện ${primaryWeak.displayValue}${primaryWeak.unitLabel}) qua mẫu câu ngắn.`
          : 'Ôn lại mẫu câu cốt lõi ở mức vừa sức.',
        isTopPick: false,
      },
      {
        id: firstScn.id,
        title: firstScn.title,
        description: shortCap(firstScn.description || '', 90),
        level: recDiff,
        recommendedLevel: recDiff,
        supportedJLPTLevels: firstScn.supportedJLPTLevels?.length ? firstScn.supportedJLPTLevels : [recDiff],
        topicName: firstScn.topicName || secondaryWeak?.topicName || 'Thực chiến',
        thumbnail: resolveMediaUrl((firstScn as any)?.thumbnailUrl || (firstScn as any)?.thumbnail),
        tag: `Đề xuất · ${recDiff}`,
        matchScore: sameMatch,
        actionReason: hotFocus
          ? `Ưu tiên luyện lại lỗi gần đây (${hotFocus}) đúng trình độ ${recDiff}.`
          : secondaryWeak
          ? `Cân bằng ${secondaryWeak.shortLabel.toLowerCase()} (${secondaryWeak.displayValue}${secondaryWeak.unitLabel}) theo đúng nhịp độ.`
          : 'Duy trì phản xạ đối đáp tự nhiên ở cấp độ hiện tại.',
        isTopPick: true,
      },
      {
        id: thirdScn.id,
        title: thirdScn.title,
        description: shortCap(thirdScn.description || '', 90),
        level: nextDiff,
        recommendedLevel: nextDiff,
        supportedJLPTLevels: thirdScn.supportedJLPTLevels?.length ? thirdScn.supportedJLPTLevels : [nextDiff],
        topicName: thirdScn.topicName || strongest?.topicName || 'Nâng cao',
        thumbnail: resolveMediaUrl((thirdScn as any)?.thumbnailUrl || (thirdScn as any)?.thumbnail),
        tag: `Nâng cao · ${nextDiff}`,
        matchScore: aboveMatch,
        actionReason: strongest
          ? `Phát huy ${strongest.shortLabel.toLowerCase()} (${strongest.displayValue}${strongest.unitLabel}) và hạn chế mở gợi ý.`
          : 'Thử thách nối câu dài hơn ở cấp độ cao hơn.',
        isTopPick: false,
      },
    ];

    return picks;
  }, [profile, radarAxes, availableScenarios, adaptiveContext]);

  // Danh sách từ vựng & ngữ pháp thực chiến: chỉ lấy từ DB FSRS thực tế và Bookmark người dùng
  const allDeckItems = useMemo(() => {
    const rawList: any[] = profile?.dueReviewItems ? [...profile.dueReviewItems] : [];

    // Bổ sung các thẻ học viên đã bookmark từ localStorage "jcap_saved_flashcards"
    try {
      const rawSaved = localStorage.getItem('jcap_saved_flashcards');
      if (rawSaved) {
        const parsedList = JSON.parse(rawSaved);
        if (Array.isArray(parsedList)) {
          parsedList.forEach((bm: any) => {
            const word = bm.word || bm.pattern || bm.frontText;
            if (word && !rawList.some((it) => it.skillName && it.skillName.includes(word))) {
              const isVocab = bm.type === 'vocab' || bm.word;
              rawList.unshift({
                skillCode: `SAVED_${Date.now()}_${word}`,
                skillName: isVocab ? `Từ vựng: ${word} (${bm.meaning || 'Đã lưu vào Flashcard'})` : `Ngữ pháp: ${word} (${bm.meaning || 'Đã lưu vào Flashcard'})`,
                category: isVocab ? 'Vocabulary' : 'Grammar',
                stability: 1.8,
                difficulty: 5.0,
                repetitions: 1,
                lapses: 0,
                isDueForReview: true,
                nextRecommendedReviewUtc: new Date().toISOString(),
              });
            }
          });
        }
      }
    } catch {}

    return rawList.map((item, idx) => {
      const parsed = parseSkillItem(item.skillName || '');
      // Tôn trọng lịch ôn FSRS từ Backend (chỉ fallback theo stability nếu trường isDueForReview bị thiếu)
      const isDue =
        typeof item.isDueForReview === 'boolean'
          ? item.isDueForReview
          : Boolean(
              (item.stability !== undefined && Number(item.stability) < 2.0) ||
              (item.lapses !== undefined && Number(item.lapses) > 0)
            );

      return {
        ...item,
        isDueForReview: isDue,
        idx,
        parsed,
      };
    });
  }, [profile?.dueReviewItems]);

  // Bộ lọc FSRS
  const filteredReviewItems = useMemo(() => {
    if (deckFilter === 'due') return allDeckItems.filter((m) => m.isDueForReview);
    if (deckFilter === 'vocab') return allDeckItems.filter((m) => m.parsed.type === 'vocab');
    if (deckFilter === 'grammar') return allDeckItems.filter((m) => m.parsed.type === 'grammar');
    return allDeckItems;
  }, [allDeckItems, deckFilter]);

  const deckStats = useMemo(() => {
    const dueCount = allDeckItems.filter((m) => m.isDueForReview).length;
    const vocabCount = allDeckItems.filter((m) => m.parsed.type === 'vocab').length;
    const grammarCount = allDeckItems.filter((m) => m.parsed.type === 'grammar').length;
    return {
      total: allDeckItems.length,
      dueCount,
      vocabCount,
      grammarCount,
    };
  }, [allDeckItems]);

  const handleBookmarkSkillItem = async (parsed: ParsedSkillItem, idx: number) => {
    const key = `${parsed.type}:${parsed.japanese}`;
    const isVocab = parsed.type === 'vocab';
    const wasSaved = savedItems.has(key);

    // Lưu ngay vào localStorage cache để đảm bảo vào Flashcard Bookmarks luôn thấy tức thì 100%
    try {
      const rawLocal = localStorage.getItem('jcap_saved_flashcards');
      let localList: any[] = [];
      try { localList = rawLocal ? JSON.parse(rawLocal) : []; } catch {}
      if (!Array.isArray(localList)) localList = [];
      const existsIndex = localList.findIndex((it: any) => (
        (it.word && it.word.trim().toLowerCase() === parsed.japanese.trim().toLowerCase()) ||
        (it.pattern && it.pattern.trim().toLowerCase() === parsed.japanese.trim().toLowerCase()) ||
        (it.frontText && it.frontText.trim().toLowerCase() === parsed.japanese.trim().toLowerCase())
      ));
      if (wasSaved && existsIndex >= 0) {
        localList.splice(existsIndex, 1);
      } else if (!wasSaved && existsIndex < 0) {
        localList.push({
          id: Date.now(),
          type: parsed.type,
          word: isVocab ? parsed.japanese : undefined,
          pattern: !isVocab ? parsed.japanese : undefined,
          meaning: parsed.vietnamese,
          jlptLevel: localStorage.getItem('jcap_level') || 'N5',
          savedAt: new Date().toISOString(),
        });
      }
      localStorage.setItem('jcap_saved_flashcards', JSON.stringify(localList));
    } catch {}

    setSavedItems((prev) => {
      const next = new Set(prev);
      if (wasSaved) next.delete(key);
      else next.add(key);
      return next;
    });

    window.dispatchEvent(new CustomEvent('jcap_bookmarks_updated'));
    window.dispatchEvent(new CustomEvent('jcap_profile_updated'));

    if (!wasSaved) {
      setToastMsg(`Đã đồng bộ 「${parsed.japanese}」 vào Kho Flashcard Đã Lưu!`);
    } else {
      setToastMsg(`Đã bỏ lưu 「${parsed.japanese}」 khỏi Flashcard.`);
    }
    setTimeout(() => setToastMsg(null), 2800);

    try {
      await flashcardService.toggleBookmark(
        isVocab ? 'Vocabulary' : 'Grammar',
        0,
        isVocab
          ? { word: parsed.japanese, meaning: parsed.vietnamese, jlptLevel: localStorage.getItem('jcap_level') || 'N5' }
          : { pattern: parsed.japanese, meaning: parsed.vietnamese, jlptLevel: localStorage.getItem('jcap_level') || 'N5' }
      );
    } catch {}
  };

  const handleTriggerAxisDrill = (axis: RadarAxisConfig) => {
    const matchedScn = availableScenarios.find((s) => s.topicCode === axis.topicCode);
    if (matchedScn) {
      navigate(`/scenarios/${matchedScn.id}`);
    } else if (profile?.nextRecommendedScenarioId) {
      navigate(`/scenarios/${profile.nextRecommendedScenarioId}`);
    } else if (onNavigateToScenario) {
      onNavigateToScenario(profile?.nextRecommendedScenarioId, profile?.nextRecommendedScenarioCode);
    } else {
      navigate(`/scenarios?topic=${axis.topicCode}`);
    }
  };

  if (isLoading) {
    return (
      <div className={`rounded-3xl border border-[var(--line)] bg-[var(--paper-50)] p-6 shadow-xs animate-pulse ${className}`}>
        <div className="h-28 w-full rounded-2xl bg-[var(--paper-200)] mb-6" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 h-80 rounded-2xl bg-[var(--paper-100)]" />
          <div className="lg:col-span-7 space-y-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-12 rounded-xl bg-[var(--paper-100)]" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`rounded-3xl border border-rose-200 bg-[var(--paper-50)] p-8 text-center shadow-xs ${className}`}>
        <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-3 border border-rose-200">
          <TargetIcon className="w-6 h-6 text-rose-600" />
        </div>
        <h4 className="text-base font-bold text-[var(--sumi)] mb-1">Không thể tải Năng lực cá nhân</h4>
        <p className="text-xs text-[var(--sumi-muted)] max-w-md mx-auto mb-4">
          {error}
        </p>
        <button
          type="button"
          onClick={() => setRetryNonce((n) => n + 1)}
          className="inline-flex items-center gap-2 rounded-xl bg-[var(--ai)] hover:bg-[var(--ai-hover)] px-4 py-2 text-xs font-bold text-white shadow-xs transition cursor-pointer"
        >
          Thử lại
        </button>
      </div>
    );
  }

  if (!profile || (profile.totalSessionsCompleted === 0 && profile.totalPracticeTurns === 0)) {
    return (
      <div className={`rounded-3xl border border-dashed border-[var(--line-strong)] bg-[var(--paper-50)] p-8 text-center ${className}`}>
        <div className="w-12 h-12 rounded-2xl bg-[var(--ai-soft)] text-[var(--ai)] flex items-center justify-center mx-auto mb-3">
          <TargetIcon className="w-6 h-6 text-[var(--ai)]" />
        </div>
        <h4 className="text-base font-bold text-[var(--sumi)] mb-1">Chưa có dữ liệu luyện hội thoại</h4>
        <p className="text-xs text-[var(--sumi-muted)] max-w-md mx-auto mb-4">
          Hoàn thành ít nhất một phiên hội thoại nhập vai để hệ thống phân tích phản xạ, độ chuẩn trợ từ và văn phong thực tế của bạn.
        </p>
        <Link
          to="/scenarios"
          className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--ai)] hover:bg-[var(--ai-hover)] px-4 py-2 text-xs font-bold text-white shadow-xs transition"
        >
          <span>Bắt đầu phiên hội thoại đầu tiên</span>
          <span aria-hidden="true">→</span>
        </Link>
      </div>
    );
  }

  const computedAxesAverage = radarAxes.length > 0
    ? Math.round(radarAxes.reduce((sum, a) => sum + a.normalizedScore, 0) / radarAxes.length)
    : Math.round(profile.communicativeProficiencyIndex || 0);
  const overallIndex = computedAxesAverage;
  const masteryRank = getMasteryRank(overallIndex);
  const overallTheme = getSkillStatusTheme(overallIndex);
  const derivedJlptLabel =
    profile.estimatedJlptLabel ||
    (overallIndex >= 80 && (profile.thetaEstimate ?? 0) >= 1.2
      ? 'N3 (Thành thạo)'
      : overallIndex >= 65
        ? 'N4 (Ổn định)'
        : 'N5 (Cơ bản)');
  const trendBadge =
    profile.proficiencyTrend === 'Improving'
      ? { text: 'Xu hướng: Tiến bộ', cls: 'bg-emerald-500/20 border-emerald-400/40 text-emerald-200' }
      : profile.proficiencyTrend === 'Declining'
        ? { text: 'Xu hướng: Đang giảm', cls: 'bg-rose-500/20 border-rose-400/40 text-rose-200' }
        : { text: 'Xu hướng: Ổn định', cls: 'bg-white/10 border-white/15 text-slate-200' };

  const cleanAlertSkill = (raw: string) => {
    if (!raw) return '';
    const cleaned = raw
      .replace(/\s*\([A-Z0-9_]+\)\s*/g, ' ')
      .replace(/^Quy tắc giao tiếp\s*[:\-]?\s*/i, '')
      .replace(/^(Từ vựng|Ngữ pháp)\s*:\s*/i, '')
      .replace(/_/g, ' ')
      .trim();
    if (!cleaned || /^quy tắc (giao tiếp|ngữ pháp)$/i.test(cleaned) || /^E\d+$/i.test(cleaned)) {
      return '';
    }
    return cleaned;
  };

  const fallbackRecurring = (profile.dueReviewItems || [])
    .filter((it) => (it.lapses ?? 0) >= 2)
    .map((it) => ({ item: it, label: cleanAlertSkill(parseSkillItem(it.skillName).japanese) }))
    .filter((entry) => entry.label.length > 0);
  const coachingAlerts =
    profile.coachingAlerts && profile.coachingAlerts.length > 0
      ? profile.coachingAlerts.slice(0, 2)
      : fallbackRecurring.length > 0
        ? [
            {
              severity: 'warning',
              title: `Lỗi hay gặp: ${fallbackRecurring[0].label} (${fallbackRecurring[0].item.lapses} lần)`,
              message: 'Bạn thường vướng phần này ở các phiên gần đây — hãy để ý tránh lặp lại trong phiên tới.',
            },
          ]
        : overallIndex < 50
          ? [
              {
                severity: 'warning',
                title: 'Nền tảng hội thoại cần củng cố',
                message: 'Điểm tổng hợp hiện chưa đạt chuẩn (dưới 50). Hãy luyện lại tình huống cơ bản kèm gợi ý Cấp 1.',
              },
            ]
          : [];

  const washiSealClass = overallIndex >= 75
    ? 'border-[#059669] text-[#059669] bg-emerald-50'
    : overallIndex >= 50
      ? 'border-[#D97706] text-[#B45309] bg-amber-50'
      : 'border-[#DC2626] text-[#DC2626] bg-rose-50';
  const ringRadius = 36;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringStrokeDashoffset = ringCircumference - (Math.min(100, Math.max(0, overallIndex)) / 100) * ringCircumference;

  const displayStrengths = radarAxes
    .filter((a) => a.normalizedScore >= 75)
    .sort((a, b) => b.normalizedScore - a.normalizedScore)
    .map((a) => `${a.fullTitle} (${a.displayValue}${a.unitLabel}): ${a.statusText}`);

  const displayTargetFocusAreas = radarAxes
    .filter((a) => a.normalizedScore < 75)
    .sort((a, b) => a.normalizedScore - b.normalizedScore)
    .slice(0, 3)
    .map((a) => `${a.fullTitle} (${a.displayValue}${a.unitLabel}): ${a.drillMethod}`);

  return (
    <div className={`relative rounded-[28px] border border-[var(--line)] bg-[var(--paper-50)] shadow-sm overflow-hidden font-sans ${className}`}>
      {/* Toast thông báo khi lưu thẻ từ Sơ đồ năng lực */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-2xl border border-emerald-400/80 bg-[var(--sumi)] px-4 py-3 text-xs font-bold text-white shadow-xl animate-fade-in">
          <span>{toastMsg}</span>
          <Link
            to="/flashcards/bookmarks?level=All&type=All"
            className="rounded-lg bg-emerald-500 px-2.5 py-1 text-[11px] font-extrabold text-slate-950 hover:bg-emerald-400 transition"
          >
            Xem ngay ➔
          </Link>
        </div>
      )}

      {/* ===================================================================== */}
      {/* 1. SUMI-INDIGO HEADER BANNER (TINH GỌN, THUẦN VIỆT)                    */}
      {/* ===================================================================== */}
      <div className="relative overflow-hidden bg-gradient-to-br from-[#0F172A] via-[#1E293B] to-[#1E3A8A] px-6 py-6 sm:px-8 sm:py-7 text-white border-b border-slate-700/60">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_center,#38BDF8_2px,transparent_3px)] bg-[size:24px_24px] pointer-events-none" />
        <div className="absolute right-0 top-0 h-full w-2/3 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.22),transparent_65%)] pointer-events-none" />
        <div className="absolute -left-10 -bottom-10 h-44 w-44 rounded-full bg-indigo-500/15 blur-2xl pointer-events-none" />

        <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-400/15 border border-sky-400/30 px-3 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-sky-200 font-mono">
                <span className="h-1.5 w-1.5 rounded-full bg-sky-400 animate-pulse" />
                <span>Thực lực hiện tại: {derivedJlptLabel}</span>
              </span>
              <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${trendBadge.cls}`}>
                {trendBadge.text}
              </span>
            </div>

            <h3 className="text-xl sm:text-2xl font-black tracking-tight text-white leading-snug">
              Năng lực Hội thoại Cá nhân
            </h3>

            <p className="text-xs sm:text-[13px] text-slate-200 leading-relaxed">
              Tổng hợp từ <strong className="text-white">{profile.totalPracticeTurns} lượt nói</strong> qua <strong className="text-white">{profile.totalSessionsCompleted} phiên hoàn thành</strong>.
            </p>
          </div>

          {/* Cụm trạng thái tổng hợp trên nền Washi tương phản cao */}
          <div className="flex items-center gap-4 self-start lg:self-center shrink-0 rounded-2xl bg-[#FAF6EE] text-[#172030] border border-white/30 px-4 py-3 shadow-lg">
            <div
              className={`flex h-14 w-14 items-center justify-center rounded-full border-2 p-1 select-none shrink-0 shadow-2xs ${washiSealClass}`}
              title={`Xếp loại hiện tại: ${masteryRank.title}`}
            >
              <div className="w-full h-full rounded-full border border-current/50 flex flex-col items-center justify-center px-1">
                <span className={`font-sans font-black uppercase tracking-tight text-center ${masteryRank.shortTag.includes(' ') ? 'text-[10px] leading-[1.15]' : 'text-xs leading-none'}`}>
                  {masteryRank.shortTag}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative h-20 w-20 flex items-center justify-center shrink-0">
                <svg className="h-20 w-20" viewBox="0 0 88 88">
                  <g transform="rotate(-90 44 44)">
                    <circle
                      cx="44"
                      cy="44"
                      r={ringRadius}
                      fill="none"
                      stroke="rgba(23,32,48,0.10)"
                      strokeWidth="6.5"
                    />
                    <circle
                      cx="44"
                      cy="44"
                      r={ringRadius}
                      fill="none"
                      stroke={overallTheme.hex}
                      strokeWidth="6.5"
                      strokeLinecap="round"
                      strokeDasharray={ringCircumference}
                      strokeDashoffset={ringStrokeDashoffset}
                    />
                  </g>
                  <text
                    x="44"
                    y="38"
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill="#172030"
                    fontSize="22"
                    fontWeight="900"
                    fontFamily="monospace"
                  >
                    {overallIndex}
                  </text>
                  <text
                    x="44"
                    y="53"
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill="#4E5B70"
                    fontSize="9.5"
                    fontWeight="700"
                    fontFamily="monospace"
                  >
                    /100
                  </text>
                </svg>
              </div>

              <div className="pr-1">
                <span className="text-[10px] font-bold uppercase tracking-wider block" style={{ color: overallTheme.hex }}>
                  Điểm tổng hợp
                </span>
                <span className="text-sm font-extrabold text-[#172030] block mt-0.5">
                  {masteryRank.title}
                </span>
                <span className="text-[11px] text-[#4E5B70] block mt-0.5">
                  {masteryRank.sub}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* 2. BODY CONTENT                                                       */}
      {/* ===================================================================== */}
      <div className="p-5 sm:p-7 space-y-6">
        {/* Nhận định tổng hợp thích ứng theo hành trình học */}
        {adaptiveContext?.aiCoaching?.executiveDiagnosis && (
          <div className="rounded-2xl border border-[var(--ai)]/25 bg-[var(--paper-100)]/90 px-4 py-3.5 flex items-start gap-3 shadow-2xs">
            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-[var(--ai-soft)] text-[var(--ai)] border border-[var(--ai)]/20">
              <SparkIcon className="w-3.5 h-3.5 text-[var(--ai)]" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--ai)] block">
                Nhận định năng lực cá nhân hóa
              </span>
              <p className="mt-0.5 text-xs sm:text-[13px] text-[var(--sumi)] leading-relaxed font-medium">
                {adaptiveContext.aiCoaching.executiveDiagnosis}
              </p>
            </div>
          </div>
        )}

        {/* Cảnh báo hành vi động: Fail liên tiếp / Lỗi lặp lại */}
        {coachingAlerts.length > 0 && (
          <div className={`grid gap-3 ${coachingAlerts.length > 1 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}>
            {coachingAlerts.map((alert, aIdx) => {
              const tone =
                alert.severity === 'danger'
                  ? 'border-rose-200 bg-rose-50/90 text-rose-950'
                  : alert.severity === 'positive'
                    ? 'border-emerald-200 bg-emerald-50/90 text-emerald-950'
                    : 'border-amber-200 bg-amber-50/90 text-amber-950';
              const dot =
                alert.severity === 'danger'
                  ? 'bg-rose-600'
                  : alert.severity === 'positive'
                    ? 'bg-emerald-600'
                    : 'bg-amber-600';
              return (
                <div
                  key={aIdx}
                  className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-xs shadow-2xs ${tone}`}
                >
                  <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} />
                  <div className="min-w-0">
                    <p className="font-extrabold leading-snug">{alert.title}</p>
                    <p className="mt-0.5 text-[11px] opacity-90 leading-relaxed">{alert.message}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {/* Khối 1: Biểu đồ Kỹ năng Đối thoại (5/12) + Bảng Đánh giá & Đối trọng Điểm mạnh/Yếu (7/12) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* CỘT TRÁI (5/12): BIỂU ĐỒ LỤC GIÁC TƯƠNG TÁC + HỘP TIÊU ĐIỂM ĐẶC HUẤN */}
          <div className="lg:col-span-5 flex flex-col gap-4 rounded-3xl border border-[var(--line)] bg-white p-5 shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)]/70 pb-3">
              <div className="min-w-0">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--ai)] block">
                  Biểu đồ kỹ năng
                </span>
                <h4 className="text-[13px] font-bold text-[var(--sumi)] mt-0.5 leading-snug">
                  Bấm đỉnh hoặc hàng để xem chi tiết
                </h4>
              </div>
              <div className="flex items-center gap-2.5 text-[10px] font-semibold text-[var(--sumi-muted)] shrink-0 whitespace-nowrap">
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm bg-sky-500/30 border border-sky-500 shrink-0" />
                  <span>Bạn</span>
                </span>
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                  <span className="inline-block w-3 border-b-2 border-dashed border-amber-500 shrink-0" />
                  <span>Chuẩn 80đ</span>
                </span>
              </div>
            </div>

            {/* Interactive SVG Hexagonal Radar */}
            <div className="relative mx-auto w-full max-w-[350px] aspect-[350/305] select-none">
              <svg viewBox="0 0 350 305" className="w-full h-full overflow-visible">
                <defs>
                  <radialGradient id="hexRadarFill" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#0284c7" stopOpacity="0.38" />
                    <stop offset="100%" stopColor="#1e3a8a" stopOpacity="0.16" />
                  </radialGradient>
                </defs>

                {/* 4 Vòng lục giác đồng tâm (25%, 50%, 75%, 100%) */}
                {radarGeometry.gridPolygons.map((pts, idx) => (
                  <polygon
                    key={idx}
                    points={pts}
                    fill={idx % 2 === 0 ? 'rgba(241,245,249,0.45)' : 'none'}
                    stroke="#cbd5e1"
                    strokeWidth={idx === 3 ? '1.25' : '0.85'}
                    strokeDasharray={idx < 3 ? '3 3' : undefined}
                  />
                ))}

                {/* Các tia xuyên tâm */}
                {radarGeometry.dataPoints.map((pt) => {
                  const isSelected = activeAxis?.id === pt.axis.id;
                  return (
                    <line
                      key={`axis-${pt.axis.id}`}
                      x1={radarGeometry.cx}
                      y1={radarGeometry.cy}
                      x2={pt.endX}
                      y2={pt.endY}
                      stroke={isSelected ? pt.axis.accentColor : '#cbd5e1'}
                      strokeWidth={isSelected ? '1.8' : '1'}
                    />
                  );
                })}

                {/* Đa giác chuẩn mục tiêu 80% */}
                <polygon
                  points={radarGeometry.benchmarkPolygon}
                  fill="none"
                  stroke="#f59e0b"
                  strokeWidth="1.2"
                  strokeDasharray="4 4"
                  opacity="0.75"
                />

                {/* Đa giác năng lực thực tế của người học */}
                {radarGeometry.learnerPolygon && (
                  <polygon
                    points={radarGeometry.learnerPolygon}
                    fill="url(#hexRadarFill)"
                    stroke="#1e40af"
                    strokeWidth="2.4"
                    strokeLinejoin="round"
                  />
                )}

                {/* Tâm lục giác */}
                <circle cx={radarGeometry.cx} cy={radarGeometry.cy} r="3" fill="#64748b" />

                {/* 6 Đỉnh tương tác & Nhãn Kanji + Điểm */}
                {radarGeometry.dataPoints.map((pt) => {
                  const isSelected = activeAxis?.id === pt.axis.id;
                  return (
                    <g
                      key={`node-${pt.axis.id}`}
                      className="cursor-pointer"
                      onClick={() => setSelectedAxisId(pt.axis.id)}
                    >
                      {/* Halo khi đang chọn */}
                      {isSelected && (
                        <circle
                          cx={pt.x}
                          cy={pt.y}
                          r="11"
                          fill={pt.axis.accentColor}
                          opacity="0.2"
                        />
                      )}

                      {/* Điểm nút trên đa giác - tô màu theo trạng thái Đạt / Trung bình / Chưa đạt */}
                      <circle
                        cx={pt.x}
                        cy={pt.y}
                        r={isSelected ? '6.5' : '5'}
                        fill={pt.axis.accentColor}
                        stroke="#ffffff"
                        strokeWidth="2"
                      />

                      {/* Nhãn bên ngoài đỉnh lục giác */}
                      <g transform={`translate(${pt.labelX}, ${pt.labelY})`}>
                        <rect
                          x="-44"
                          y="-17"
                          width="88"
                          height="34"
                          rx="9"
                          fill={isSelected ? '#0f172a' : '#ffffff'}
                          stroke={isSelected ? pt.axis.accentColor : '#e2e8f0'}
                          strokeWidth={isSelected ? '1.6' : '1'}
                        />
                        <text
                          x="0"
                          y="-3"
                          textAnchor="middle"
                          fontSize="10"
                          fontWeight="800"
                          fill={isSelected ? '#f8fafc' : '#1e293b'}
                        >
                          {pt.axis.shortLabel}
                        </text>
                        <text
                          x="0"
                          y="10"
                          textAnchor="middle"
                          fontSize="10"
                          fontWeight="700"
                          fill={isSelected ? '#f8fafc' : pt.axis.accentColor}
                        >
                          {pt.axis.displayValue}{pt.axis.unitLabel}
                        </text>
                      </g>
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* Hộp Tiêu Điểm Chẩn Đoán & Gợi ý Luyện Tập */}
            {activeAxis && (
              <div className="rounded-2xl border border-[var(--line)] bg-[var(--paper-100)]/85 p-4 space-y-2.5 transition-all">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="flex h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: activeAxis.accentColor }}
                    />
                    <div className="min-w-0">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--sumi-muted)] block">
                        Kỹ năng đang chọn · {activeAxis.statusLabel}
                      </span>
                      <h5 className="text-sm font-extrabold text-[var(--sumi)] leading-snug">
                        {activeAxis.fullTitle} ({activeAxis.displayValue}{activeAxis.unitLabel})
                      </h5>
                    </div>
                  </div>
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border shrink-0 ${activeAxis.badgeClass}`}>
                    {activeAxis.statusLabel}
                  </span>
                </div>

                <p className="text-xs text-[var(--sumi)] leading-relaxed">
                  {activeAxis.diagnosticDetail}
                </p>

                <div className="rounded-xl bg-white/90 border border-[var(--line)]/80 px-3 py-2 text-[11px] text-[var(--sumi-muted)]">
                  <strong className="text-[var(--sumi)]">Khắc phục: </strong>
                  <span>{activeAxis.drillMethod}</span>
                </div>

                <div className="pt-1 flex flex-wrap sm:flex-nowrap items-center justify-between gap-2">
                  <span className="text-[10px] font-semibold text-[var(--sumi-muted)] leading-snug min-w-0">
                    {activeAxis.scopeBadge}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleTriggerAxisDrill(activeAxis)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--ai)] hover:bg-[var(--ai-hover)] px-3.5 py-2 text-xs font-bold text-white shadow-2xs transition active:scale-95 cursor-pointer whitespace-nowrap shrink-0 ml-auto"
                  >
                    <span>Luyện tập kỹ năng này</span>
                    <ArrowRightIcon className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* CỘT PHẢI (7/12): BẢNG ĐÁNH GIÁ KỸ NĂNG ĐỐI THOẠI + ĐỐI TRỌNG ĐIỂM MẠNH / MỤC TIÊU */}
          <div className="lg:col-span-7 flex flex-col gap-5">
            {/* Bảng Đánh giá Kỹ năng (màu theo trạng thái Đạt / Trung bình / Chưa đạt) */}
            <div className="rounded-3xl border border-[var(--line)] bg-white p-5 shadow-2xs">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4 pb-3 border-b border-[var(--line)]/70">
                <div className="flex items-center gap-2">
                  <BarChartIcon className="w-4 h-4 text-[var(--ai)]" />
                  <h4 className="text-xs sm:text-sm font-extrabold uppercase tracking-wider text-[var(--sumi)]">
                    Đánh giá kỹ năng
                  </h4>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold text-[var(--sumi-muted)]">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-600" />
                    <span>Đạt (≥75)</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-amber-500" />
                    <span>Trung bình (50–74)</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-rose-600" />
                    <span>Chưa đạt (&lt;50)</span>
                  </span>
                </div>
              </div>

              <div className="divide-y divide-[var(--line)]/60">
                {radarAxes.map((axis) => {
                  const isSelected = activeAxis?.id === axis.id;
                  const filledSegments = Math.max(1, Math.min(10, Math.round(axis.normalizedScore / 10)));
                  const matchedScn = availableScenarios.find((s) => s.topicCode === axis.topicCode) || availableScenarios[0];
                  const hasTrainedBefore = matchedScn
                    ? completedScenarioIds.has(matchedScn.id) || completedScenarioTitles.has((matchedScn.title || '').trim().toLowerCase())
                    : false;
                  const drillActionText = hasTrainedBefore ? 'Luyện lại' : 'Luyện mới';
                  const scnLevel = matchedScn
                    ? (matchedScn.supportedJLPTLevels?.find((lv) => lv === 'N5' || lv === 'N4') || matchedScn.supportedJLPTLevels?.[0] || 'N5')
                    : 'N5';
                  const drillTooltip = matchedScn
                    ? `Gợi ý: ${matchedScn.title} (${scnLevel})`
                    : `Luyện tập ${axis.fullTitle}`;

                  return (
                    <div
                      key={axis.id}
                      onClick={() => setSelectedAxisId(axis.id)}
                      className={`group py-3.5 px-3.5 -mx-3 rounded-2xl transition-all cursor-pointer flex items-start gap-3 ${
                        isSelected
                          ? 'bg-[var(--ai-soft)]/55 ring-1 ring-[var(--ai)]/30 shadow-2xs'
                          : 'hover:bg-[var(--paper-100)]/70'
                      }`}
                    >
                      {/* Chỉ báo trạng thái theo màu Đạt / Trung bình / Chưa đạt */}
                      <div
                        className="mt-1.5 h-3 w-3 rounded-full shrink-0 ring-4"
                        style={{
                          backgroundColor: axis.accentColor,
                          boxShadow: `0 0 0 3px ${axis.accentColor}22`,
                        }}
                        aria-hidden="true"
                      />

                      <div className="flex-1 min-w-0 flex flex-col gap-2">
                        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs sm:text-[13px] font-extrabold text-[var(--sumi)] leading-snug">
                                {axis.fullTitle}
                              </span>
                              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${axis.badgeClass}`}>
                                {axis.statusLabel}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 shrink-0 ml-auto">
                            <div className="text-right whitespace-nowrap">
                              <span className="text-sm sm:text-base font-black font-mono" style={{ color: axis.accentColor }}>
                                {axis.displayValue}
                              </span>
                              <span className="text-[10px] font-semibold text-[var(--sumi-muted)] ml-1">
                                {axis.unitLabel}
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleTriggerAxisDrill(axis);
                              }}
                              className="inline-flex items-center gap-1 rounded-xl border border-[var(--line)] bg-white px-3 py-1.5 text-[11px] font-bold text-[var(--ai)] hover:border-[var(--ai)] hover:bg-[var(--ai)] hover:text-white transition shadow-2xs cursor-pointer whitespace-nowrap shrink-0"
                              title={drillTooltip}
                            >
                              <span>{drillActionText}</span>
                              <span>➔</span>
                            </button>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1 w-32 sm:w-44 shrink-0">
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((seg) => (
                              <span
                                key={seg}
                                className="h-2 flex-1 rounded-xs transition-all duration-300"
                                style={{
                                  backgroundColor: seg <= filledSegments ? axis.accentColor : '#e2e8f0',
                                  opacity: seg <= filledSegments ? 0.92 : 0.65,
                                }}
                              />
                            ))}
                          </div>
                          <p
                            className="text-[11px] font-semibold leading-snug min-w-0 flex-1 truncate"
                            style={{ color: axis.accentColor }}
                          >
                            {axis.statusText}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Tổng hợp Điểm mạnh & Cần cải thiện */}
            <div className="rounded-3xl border border-[var(--line)] bg-[var(--paper-50)]/70 p-5 shadow-2xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 divide-y md:divide-y-0 md:divide-x divide-[var(--line)]">
                {/* Cột Trái: Điểm mạnh */}
                <div className="md:pr-4">
                  <div className="flex items-center gap-2 mb-3">
                    <SparkIcon className="w-4 h-4 text-emerald-600 shrink-0" />
                    <h5 className="text-xs font-black text-[var(--sumi)] uppercase tracking-wider">
                      Điểm mạnh
                    </h5>
                  </div>
                  <div className="space-y-2 mt-2">
                    {displayStrengths.length > 0 ? (
                      displayStrengths.map((str, idx) => (
                        <div key={idx} className="flex items-start gap-2.5 text-xs font-medium text-[var(--sumi)] leading-relaxed">
                          <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-bold text-emerald-800">
                            ✓
                          </span>
                          <span>{str}</span>
                        </div>
                      ))
                    ) : profile.strengths && profile.strengths.length > 0 ? (
                      profile.strengths.map((str, idx) => (
                        <div key={idx} className="flex items-start gap-2.5 text-xs font-medium text-[var(--sumi)] leading-relaxed">
                          <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-bold text-emerald-800">
                            ✓
                          </span>
                          <span>{str}</span>
                        </div>
                      ))
                    ) : (
                      <span className="text-xs text-[var(--sumi-muted)] italic">
                        Chưa có kỹ năng đạt ngưỡng từ 75 điểm trở lên.
                      </span>
                    )}
                  </div>
                </div>

                {/* Cột Phải: Cần cải thiện */}
                <div className="pt-4 md:pt-0 md:pl-6">
                  <div className="flex items-center gap-2 mb-3">
                    <TargetIcon className="w-4 h-4 text-amber-600 shrink-0" />
                    <h5 className="text-xs font-black text-[var(--sumi)] uppercase tracking-wider">
                      Cần cải thiện
                    </h5>
                  </div>
                  <div className="space-y-2 mt-2">
                    {displayTargetFocusAreas.length > 0 ? (
                      displayTargetFocusAreas.map((foc, idx) => (
                        <div key={idx} className="flex items-start gap-2.5 text-xs font-medium text-[var(--sumi)] leading-relaxed">
                          <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[10px] font-bold text-amber-900">
                            {idx + 1}
                          </span>
                          <span>{foc}</span>
                        </div>
                      ))
                    ) : profile.targetFocusAreas && profile.targetFocusAreas.length > 0 ? (
                      profile.targetFocusAreas.map((foc, idx) => (
                        <div key={idx} className="flex items-start gap-2.5 text-xs font-medium text-[var(--sumi)] leading-relaxed">
                          <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[10px] font-bold text-amber-900">
                            {idx + 1}
                          </span>
                          <span>{foc}</span>
                        </div>
                      ))
                    ) : (
                      <span className="text-xs text-[var(--sumi-muted)] italic">
                        Các kỹ năng đều đạt chuẩn, hãy thử cấp độ cao hơn.
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Dải Băng Telemetry Chân Dung Thói Quen Đối Thoại (4 Chỉ số Hành vi Ngầm) */}
            <div className="rounded-2xl border border-[var(--line)] bg-[var(--paper-100)]/90 p-3.5 grid grid-cols-2 sm:grid-cols-4 gap-3 divide-y sm:divide-y-0 sm:divide-x divide-[var(--line)]">
              <div className="px-2 pt-1 sm:pt-0">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--sumi-muted)] whitespace-nowrap">
                  Văn phong
                </span>
                <p className="text-xs font-extrabold text-[var(--sumi)] mt-1 leading-snug">
                  {profile.preferredTone === 'Business_Keigo'
                    ? 'Kính ngữ trang trọng'
                    : profile.preferredTone === 'Casual_Friendly'
                    ? 'Thân mật tự nhiên'
                    : 'Thể lịch sự'}
                </p>
              </div>

              <div className="px-2 pt-2 sm:pt-0 sm:pl-3">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--sumi-muted)] whitespace-nowrap">
                  Cách đối đáp
                </span>
                <p className="text-xs font-extrabold text-[var(--sumi)] mt-1 leading-snug">
                  {profile.scaffoldTierPreference === 'Autonomous'
                    ? 'Tự chủ hoàn toàn'
                    : profile.scaffoldTierPreference === 'Tier1_Keywords'
                    ? 'Từ khóa gợi mở'
                    : profile.scaffoldTierPreference === 'Tier2_Cloze'
                    ? 'Khung câu gợi mở'
                    : 'Dựa theo mẫu câu'}
                </p>
              </div>

              <div className="px-2 pt-2 sm:pt-0 sm:pl-3">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-emerald-700 whitespace-nowrap">
                  Độ liền mạch
                </span>
                {profile.averageHesitationSeconds != null && profile.averageHesitationSeconds > 0 ? (
                  <p className="text-xs font-extrabold text-emerald-700 mt-1 leading-snug">
                    {`${Math.round(100 - (profile.hesitationRate ?? 0))}%`}
                    <span className="text-[10px] font-normal text-[var(--sumi-muted)] ml-1 whitespace-nowrap">
                      (nghỉ ~{Math.max(0.2, Math.min(30, Number(profile.averageHesitationSeconds))).toFixed(2)}s)
                    </span>
                  </p>
                ) : (
                  <p className="text-xs font-bold text-[var(--sumi-muted)] mt-1 leading-snug">
                    Chưa đo
                    <span className="text-[10px] font-normal text-[var(--sumi-faint)] ml-1 whitespace-nowrap">
                      (cần lượt nói micro)
                    </span>
                  </p>
                )}
              </div>

              <div className="px-2 pt-2 sm:pt-0 sm:pl-3">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--sumi-muted)] whitespace-nowrap">
                  Nhất quán thể
                </span>
                <p className="text-xs font-extrabold text-[var(--sumi)] mt-1 leading-snug">
                  {profile.toneConsistencyScore != null && profile.toneConsistencyScore > 0
                    ? `${Number(profile.toneConsistencyScore).toFixed(1)}%`
                    : '—'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ===================================================================== */}
        {/* 3. TỪ VỰNG & MẪU CÂU CẦN ÔN                                           */}
        {/* ===================================================================== */}
        {allDeckItems.length > 0 ? (
          <div className="pt-6 border-t border-[var(--line)]">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
              <div>
                <div className="flex items-start gap-2.5">
                  <BookmarkIcon className="w-4 h-4 text-[var(--ai)] mt-0.5 shrink-0" />
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-sm font-extrabold uppercase tracking-wider text-[var(--sumi)]">
                      Từ vựng &amp; Mẫu câu cần ôn
                    </h4>
                    <span className="rounded-full bg-[var(--ai-soft)] px-2.5 py-0.5 text-[11px] font-bold text-[var(--ai)] whitespace-nowrap">
                      {deckStats.total} mục
                    </span>
                  </div>
                </div>
                <p className="text-xs text-[var(--sumi-muted)] mt-1">
                  {adaptiveContext?.flashcardAdviceVi ||
                    adaptiveContext?.aiCoaching?.flashcardAdviceVi ||
                    'Tổng hợp từ hội thoại và các thẻ đã lưu.'}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <div className="inline-flex rounded-xl border border-[var(--line)] bg-[var(--paper-100)] p-1 text-[11px] font-bold">
                  {[
                    { key: 'all', label: `Tất cả (${deckStats.total})` },
                    { key: 'due', label: `Cần củng cố (${deckStats.dueCount})` },
                    { key: 'vocab', label: `Từ vựng (${deckStats.vocabCount})` },
                    { key: 'grammar', label: `Ngữ pháp (${deckStats.grammarCount})` },
                  ].map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => {
                        setDeckFilter(tab.key as any);
                        setDeckPage(1);
                      }}
                      className={`rounded-lg px-2.5 py-1 transition cursor-pointer ${
                        deckFilter === tab.key
                          ? 'bg-white text-[var(--ai)] shadow-2xs'
                          : 'text-[var(--sumi-muted)] hover:text-[var(--sumi)]'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <Link
                  to="/flashcards/bookmarks?level=All&type=All"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 px-3.5 py-2 text-xs font-extrabold text-white shadow-xs transition active:scale-95 cursor-pointer"
                >
                  <BookmarkIcon className="w-3.5 h-3.5 text-white" />
                  <span>Mở thẻ đã lưu</span>
                  <ArrowRightIcon className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>

            {filteredReviewItems.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[var(--line-strong)] bg-[var(--paper-100)]/60 px-4 py-5 text-center text-xs text-[var(--sumi-muted)]">
                Chưa có mục nào trong bộ lọc này — chọn <strong className="text-[var(--sumi)]">Tất cả</strong> để xem đầy đủ.
              </div>
            ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredReviewItems
                .slice((deckPage - 1) * DECK_PAGE_SIZE, deckPage * DECK_PAGE_SIZE)
                .map(({ idx, parsed, stability, repetitions, isDueForReview }) => {
                const itemKey = `${parsed.type}:${parsed.japanese}`;
                const isSaved = savedItems.has(itemKey);
                const stabilityVal = Number(stability) || (isDueForReview ? 1.4 : 3.5);
                const retentionDots = stabilityVal >= 6.0 ? 4 : stabilityVal >= 3.0 ? 3 : stabilityVal >= 1.5 ? 2 : 1;

                return (
                  <div
                    key={idx}
                    className={`group relative overflow-hidden rounded-2xl border bg-white p-4 transition-all duration-200 flex flex-col justify-between shadow-2xs hover:shadow-md ${
                      parsed.type === 'vocab'
                        ? 'border-l-4 border-l-sky-600 border-stone-200/90 hover:border-sky-400'
                        : 'border-l-4 border-l-indigo-600 border-stone-200/90 hover:border-indigo-400'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2.5 pb-2 border-b border-[var(--line)]/60">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wide ${
                            parsed.type === 'vocab'
                              ? 'bg-sky-50 text-sky-900 border border-sky-200'
                              : 'bg-indigo-50 text-indigo-900 border border-indigo-200'
                          }`}
                        >
                          <span>{parsed.type === 'vocab' ? 'Từ vựng' : 'Mẫu câu'}</span>
                        </span>

                        <div className="flex items-center gap-1.5">
                          <span className="flex items-center gap-0.5" title="Mức độ ghi nhớ">
                            {[1, 2, 3, 4].map((dot) => (
                              <span
                                key={dot}
                                className={`h-1.5 w-2.5 rounded-full ${
                                  dot <= retentionDots
                                    ? isDueForReview
                                      ? 'bg-amber-500'
                                      : 'bg-emerald-500'
                                    : 'bg-slate-200'
                                }`}
                              />
                            ))}
                          </span>
                          <span
                            className={`font-bold text-[10px] px-2 py-0.5 rounded-full ${
                              isDueForReview
                                ? 'bg-amber-100 text-amber-900 border border-amber-200'
                                : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            }`}
                          >
                            {isDueForReview ? 'Cần củng cố' : 'Nhớ vững'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-jp text-lg font-extrabold text-[var(--sumi)] leading-snug group-hover:text-[var(--ai)] transition break-words">
                            {parsed.japanese}
                          </p>
                          <p className="mt-1 text-xs font-medium text-[var(--sumi-muted)] leading-relaxed line-clamp-2 break-words">
                            {parsed.vietnamese}
                          </p>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              void scenarioVoiceService.playAiSpeech(parsed.japanese.replace(/[～〜]/g, ''), 2);
                            }}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--paper-50)] text-[var(--ai)] shadow-2xs transition hover:bg-[var(--ai)] hover:text-white active:scale-90 cursor-pointer"
                            title={`Nghe phát âm: ${parsed.japanese}`}
                            aria-label={`Nghe phát âm ${parsed.japanese}`}
                          >
                            <VolumeIcon className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => void handleBookmarkSkillItem(parsed, idx)}
                            className={`inline-flex h-8 w-8 items-center justify-center rounded-xl border text-xs font-bold transition active:scale-90 cursor-pointer ${
                              isSaved
                                ? 'border-amber-300 bg-amber-50 text-amber-700'
                                : 'border-[var(--line)] bg-[var(--paper-50)] text-[var(--sumi-muted)] hover:border-amber-300 hover:text-amber-700'
                            }`}
                            title={isSaved ? 'Đã lưu thẻ ôn tập' : 'Lưu vào thẻ ôn tập'}
                          >
                            <BookmarkIcon className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3.5 pt-2.5 border-t border-[var(--line)]/60 flex items-center justify-between text-[11px]">
                      <span className="text-[var(--sumi-muted)]">
                        Đã luyện: <strong className="text-[var(--sumi)]">{repetitions} lần</strong>
                      </span>
                      <Link
                        to="/flashcards/bookmarks"
                        className="text-[var(--ai)] font-extrabold hover:underline inline-flex items-center gap-1"
                        title="Mở bộ thẻ đã lưu để ôn tập"
                      >
                        <span>Ôn thẻ đã lưu</span>
                        <ArrowRightIcon className="w-3 h-3" />
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
            )}

            {filteredReviewItems.length > DECK_PAGE_SIZE && (
              <div className="mt-5 flex items-center justify-between border-t border-[var(--line)]/70 pt-4">
                <span className="text-xs text-[var(--sumi-muted)] font-medium">
                  Hiển thị {(deckPage - 1) * DECK_PAGE_SIZE + 1} - {Math.min(deckPage * DECK_PAGE_SIZE, filteredReviewItems.length)} / {filteredReviewItems.length} mục
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setDeckPage((prev) => Math.max(1, prev - 1))}
                    disabled={deckPage === 1}
                    className="inline-flex items-center gap-1 rounded-xl border border-[var(--line)] bg-white px-3 py-1.5 text-xs font-bold text-[var(--sumi)] hover:bg-[var(--paper-100)] disabled:opacity-40 disabled:pointer-events-none transition shadow-2xs cursor-pointer"
                  >
                    <span>← Trước</span>
                  </button>
                  <span className="px-2 text-xs font-bold font-mono text-[var(--sumi)]">
                    {deckPage} / {Math.ceil(filteredReviewItems.length / DECK_PAGE_SIZE)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setDeckPage((prev) => Math.min(Math.ceil(filteredReviewItems.length / DECK_PAGE_SIZE), prev + 1))}
                    disabled={deckPage >= Math.ceil(filteredReviewItems.length / DECK_PAGE_SIZE)}
                    className="inline-flex items-center gap-1 rounded-xl border border-[var(--line)] bg-white px-3 py-1.5 text-xs font-bold text-[var(--sumi)] hover:bg-[var(--paper-100)] disabled:opacity-40 disabled:pointer-events-none transition shadow-2xs cursor-pointer"
                  >
                    <span>Sau →</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="pt-6 border-t border-[var(--line)]">
            <div className="rounded-2xl border border-dashed border-[var(--line-strong)] bg-[var(--paper-100)]/60 p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-[var(--sumi)]">
                  Từ vựng &amp; Mẫu câu cần ôn
                </h4>
                <p className="text-xs text-[var(--sumi-muted)] mt-1">
                  Từ vựng và mẫu câu cần củng cố sau mỗi phiên sẽ tự động lưu tại đây.
                </p>
              </div>
              <Link
                to="/flashcards/bookmarks?level=All&type=All"
                className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-xs font-bold text-[var(--ai)] hover:bg-[var(--ai-soft)] transition shrink-0"
              >
                <BookmarkIcon className="w-3.5 h-3.5" />
                <span>Mở thẻ đã lưu</span>
              </Link>
            </div>
          </div>
        )}

        {/* ===================================================================== */}
        {/* 4. GỢI Ý LUYỆN TẬP TIẾP THEO (CHỐNG TRÀN & CỐ ĐỊNH CHIỀU CAO)         */}
        {/* ===================================================================== */}
        {adaptiveRecommendations.length > 0 && (
          <div className="pt-6 border-t border-[var(--line)]">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-2xl bg-[var(--ai)] text-white flex items-center justify-center shrink-0 shadow-xs">
                  <CompassIcon className="w-5 h-5 text-white" />
                </div>
                <div className="min-w-0">
                  <h4 className="text-base font-bold text-[var(--sumi)]">
                    Gợi ý luyện tập tiếp theo
                  </h4>
                  <p className="mt-0.5 text-xs text-[var(--sumi-muted)] leading-relaxed">
                    3 tình huống phù hợp với năng lực hiện tại.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <Link
                  to="/flashcards/bookmarks"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 px-3.5 py-2 text-xs font-bold text-amber-900 shadow-2xs transition active:scale-95"
                >
                  <BookmarkIcon className="w-3.5 h-3.5 text-amber-700" />
                  <span>Thẻ đã lưu</span>
                </Link>
                <Link
                  to="/shadowing"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50 hover:bg-teal-100 px-3.5 py-2 text-xs font-bold text-teal-800 shadow-2xs transition active:scale-95"
                >
                  <SparkIcon className="w-3.5 h-3.5 text-teal-700" />
                  <span>Luyện Shadowing</span>
                </Link>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-stretch">
              {adaptiveRecommendations.map((item) => (
                <div
                  key={item.id}
                  className={`relative overflow-hidden flex flex-col justify-between rounded-3xl p-5 transition-all duration-300 h-full ${
                    item.isTopPick
                      ? 'border-2 border-amber-400 bg-gradient-to-b from-amber-50/70 via-white to-amber-50/20 shadow-lg shadow-amber-500/10 ring-2 ring-amber-400/20'
                      : 'border border-[var(--line)] bg-white hover:border-[var(--line-strong)] hover:shadow-md shadow-2xs'
                  }`}
                >
                  <div className="flex flex-col flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-3.5 pb-2.5 border-b border-[var(--line)]/60">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold whitespace-nowrap select-none ${
                          item.isTopPick
                            ? 'bg-amber-100 text-amber-950 border border-amber-300'
                            : 'bg-slate-100 text-slate-700 border border-slate-200'
                        }`}
                      >
                        {item.tag}
                      </span>

                      <div
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold font-mono whitespace-nowrap select-none shrink-0 ${
                          item.isTopPick
                            ? 'bg-emerald-600 text-white'
                            : 'bg-sky-50 text-sky-800 border border-sky-200'
                        }`}
                        title={`Mức độ phù hợp: ${item.matchScore}%`}
                      >
                        <span className="font-black text-xs leading-none">{item.matchScore}%</span>
                        <span className="text-[10px] font-sans font-medium opacity-90">phù hợp</span>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 mb-3 min-w-0">
                      <span className="inline-flex h-11 w-11 flex-none items-center justify-center overflow-hidden rounded-2xl bg-slate-100 border border-[var(--line)] text-[var(--ai)] shadow-2xs shrink-0">
                        {item.thumbnail ? (
                          <img src={item.thumbnail} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <TargetIcon className="w-5 h-5 text-[var(--ai)]" />
                        )}
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                          <span className="px-1.5 py-0.5 rounded-md bg-[var(--ai-soft)] text-[var(--ai)] text-[10px] font-extrabold font-mono border border-[var(--ai)]/20 uppercase">
                            {item.recommendedLevel}
                          </span>
                          {item.topicName && (
                            <span className="text-[11px] font-medium text-[var(--sumi-muted)] truncate">
                              · {item.topicName}
                            </span>
                          )}
                        </div>
                        <h4 className="text-[15px] font-bold text-[var(--sumi)] leading-snug line-clamp-2 min-h-[2.6rem] break-words">
                          {item.title}
                        </h4>
                      </div>
                    </div>

                    <p className="text-xs text-[var(--sumi-muted)] leading-relaxed line-clamp-2 min-h-[2.3rem] break-words mb-3">
                      {item.description}
                    </p>

                    <div className="rounded-2xl bg-[var(--paper-100)] px-3 py-2.5 border border-[var(--line)]/70 text-xs mb-4 min-h-[3.6rem] flex flex-col justify-center min-w-0">
                      <p className="text-[var(--sumi-muted)] leading-snug text-[11px] line-clamp-2 break-words">
                        <strong className="text-[var(--sumi)]">Trọng tâm: </strong>
                        {item.actionReason}
                      </p>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-[var(--line)]/80 mt-auto">
                    <Link
                      to={`/scenarios/${item.id}?level=${encodeURIComponent(item.recommendedLevel)}`}
                      className={`w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition active:scale-95 shadow-sm ${
                        item.isTopPick
                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                          : 'bg-[var(--ai)] hover:bg-[var(--ai-hover)] text-white'
                      }`}
                    >
                      <span>Luyện tình huống này</span>
                      <span className="text-sm">➔</span>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Thống kê tổng gọn gàng */}
        <div className="flex flex-wrap items-center justify-end gap-3 pt-4 border-t border-[var(--line)] text-[11px] font-semibold text-[var(--sumi-muted)]">
          <span>Đã hoàn thành: <strong className="text-[var(--sumi)]">{profile.totalSessionsCompleted} phiên</strong></span>
          <span>•</span>
          <span>Tổng lượt nói: <strong className="text-[var(--sumi)]">{profile.totalPracticeTurns} lượt</strong></span>
        </div>
      </div>
    </div>
  );
};
