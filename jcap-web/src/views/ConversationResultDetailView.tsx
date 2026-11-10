import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import {
  Link,
  useNavigate,
  useParams,
  useSearchParams, useLocation,
} from "react-router-dom";

import { roleplayResultService } from "../services/roleplayResultService";
import { roleplayService } from "../services/roleplayService";
import { flashcardService } from "../services/flashcardService";
import { scenarioService } from "../services/scenarioService";
import type { ScenarioListItem } from "../types/scenarioDetails";

import { useAuth } from "../contexts/AuthContext";

import { formatDateTime } from "../utils/dateUtils";

import type {
  RoleplayResultDetail,
  WeakVocabulary,
  WeakGrammar,
  RecommendedShadowingDialogue,
} from "../types/roleplayResult";

import { AudioWaveformPlayer } from "../components/common/AudioWaveformPlayer";
import { HanabiSparkleBurst } from "../components/roleplay/HanabiSparkleBurst";
import { OmikujiFortuneCard } from "../components/roleplay/OmikujiFortuneCard";

import { scenarioVoiceService } from "../services/scenarioVoiceService";

import { ukiyoSound } from "../utils/ukiyoSoundEngine";

import { sanitizeDisplayJapanese, cleanFuriganaHtml, cleanPedagogicMeaning } from "../utils/japaneseSanitizer";

import { PREFECTURES } from "../data/japanMap";
import {
  BarChartIcon,
  BookOpenIcon,
  BookmarkIcon,
  CheckIcon,
  ChevronRightIcon,
  CompassIcon,
  FlowerIcon,
  HeadphonesIcon,
  MicIcon,
  RotateCcwIcon,
  SparkIcon,
  SparklesIcon,
  TargetIcon,
  TrophyIcon,
  VolumeIcon,
} from "../components/common/Icons";
import { Icon } from "../components/jcap";

const CopyIcon: React.FC<{ className?: string }> = ({
  className = "w-3.5 h-3.5",
}) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
  </svg>
);

const PrinterIcon: React.FC<{ className?: string }> = ({
  className = "w-3.5 h-3.5",
}) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <polyline points="6 9 6 2 18 2 18 9" />
    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
    <rect width="12" height="8" x="6" y="14" />
  </svg>
);

const CheckCircleIcon: React.FC<{ className?: string }> = ({
  className = "w-4 h-4",
}) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);

const formatDate = (value: string) =>
  formatDateTime(value, { dateStyle: "long", timeStyle: "short" });

// sanitizeDisplayJapanese được nạp từ utils/japaneseSanitizer

const playJapaneseAudio = (text: string) => {
  void scenarioVoiceService.playAiSpeech(sanitizeDisplayJapanese(text), 2);
};

const getGaugeRank = (s: number) => {
  if (s >= 90) return { kanji: "極", title: "KIỆT XUẤT", color: "text-amber-300" };
  if (s >= 80) return { kanji: "優", title: "ƯU TÚ", color: "text-emerald-300" };
  if (s >= 70) return { kanji: "良", title: "KHÁ TỐT", color: "text-sky-300" };
  if (s >= 60) return { kanji: "可", title: "ĐẠT CHUẨN", color: "text-blue-200" };
  return { kanji: "研", title: "CẦN RÈN", color: "text-rose-300" };
};

const ScoreCard = ({
  label,
  score,
  accent,
  subtext,
  kanjiWatermark,
}: {
  label: string;
  score: number | string | null;
  accent: string;
  subtext?: string;
  kanjiWatermark?: string;
}) => {
  const isNumber = typeof score === 'number' && !isNaN(score) && score > 0;
  const [animatedWidth, setAnimatedWidth] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setAnimatedWidth(isNumber ? Math.min(Math.max(score as number, 0), 100) : 0);
    }, 150);
    return () => clearTimeout(timer);
  }, [score, isNumber]);

  return (
    <div className="group relative overflow-hidden flex flex-col justify-between rounded-2xl border border-stone-200/90 bg-white p-3.5 sm:p-4 shadow-xs transition-all duration-300 hover:-translate-y-0.5 hover:border-[var(--ai)]/50 hover:shadow-sm h-full min-h-[124px]">
      {kanjiWatermark && (
        <span className="absolute -right-1 -bottom-2 text-4xl font-serif font-black text-slate-100 select-none pointer-events-none group-hover:text-slate-200 transition-colors">
          {kanjiWatermark}
        </span>
      )}
      <div className="relative">
        <div className="flex items-center justify-between gap-1">
          <span className="text-[10px] sm:text-[11px] font-bold text-slate-500 uppercase tracking-wider font-sans truncate">
            {label}
          </span>
          <span className="text-[10px] font-mono font-semibold text-slate-400 shrink-0">
            {isNumber ? '/100' : 'Miễn trừ'}
          </span>
        </div>
        <div className="mt-1 flex items-baseline gap-1">
          <strong className="text-2xl font-black text-slate-900 font-sans tracking-tight leading-none font-mono">
            {isNumber ? score : '--'}
          </strong>
        </div>
        <p className="mt-1.5 text-[11px] font-medium text-slate-500 font-sans truncate leading-tight" title={subtext}>
          {subtext || "\u00A0"}
        </p>
      </div>
      <div className="pt-2 mt-auto relative">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 p-0.25 border border-slate-200/80 shadow-inner">
          <div
            className={`h-full rounded-full transition-all duration-1000 ease-out ${accent}`}
            style={{ width: `${animatedWidth}%` }}
          />
        </div>
      </div>
    </div>
  );
};

const AnimatedScoreGauge = ({ score }: { score: number }) => {
  const [displayScore, setDisplayScore] = useState(0);

  const [fillPercent, setFillPercent] = useState(0);

  const rankInfo = useMemo(() => getGaugeRank(score), [score]);

  useEffect(() => {
    const duration = 1600;

    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;

      const progress = Math.min(elapsed / duration, 1);

      // Smooth deceleration: fast initial burst then gentle glide
      const easeProgress = 1 - Math.pow(1 - progress, 4);

      setDisplayScore(Math.round(easeProgress * score));

      setFillPercent(easeProgress * score);

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }, [score]);

  const radius = 54;

  const circumference = 2 * Math.PI * radius;

  const strokeDashoffset = circumference - (fillPercent / 100) * circumference;

  return (
    <div className="relative grid h-36 w-36 sm:h-44 sm:w-44 place-items-center rounded-full p-2 select-none shrink-0">
      <div
        className="absolute inset-2 rounded-full opacity-35 blur-xl transition-all duration-700 pointer-events-none"

        style={{
          background:
            score >= 80
              ? "radial-gradient(circle, var(--score-good) 0%, var(--ai) 100%)"
              : "radial-gradient(circle, var(--score-mid) 0%, var(--score-low) 100%)",
        }}
      />

      <svg className="h-full w-full -rotate-90 transform" viewBox="0 0 128 128">
        <defs>
          <linearGradient
            id="scoreRingGrad"
            x1="0%"
            y1="0%"
            x2="100%"
            y2="100%"
          >
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="55%" stopColor="#34d399" />
            <stop offset="100%" stopColor="#fbbf24" />
          </linearGradient>
        </defs>

        <circle
          cx="64"

          cy="64"

          r={radius}

          stroke="rgba(255, 255, 255, 0.18)"

          strokeWidth="9"

          fill="none"
        />

        <circle
          cx="64"

          cy="64"

          r={radius}

          stroke="url(#scoreRingGrad)"

          strokeWidth="9"

          strokeLinecap="round"

          fill="none"

          style={{
            strokeDasharray: circumference,

            strokeDashoffset,

            transition: "stroke-dashoffset 0.05s linear",

            filter: "drop-shadow(0 0 10px rgba(56, 189, 248, 0.65))",
          }}
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-4xl sm:text-5xl font-black font-sans tracking-tight text-white drop-shadow-sm font-mono">
          {displayScore}
        </span>

        <span className={`text-[10px] sm:text-[11px] font-serif font-black tracking-widest uppercase mt-0.5 ${rankInfo.color}`}>
          Hạng {rankInfo.kanji} · {rankInfo.title}
        </span>
      </div>
    </div>
  );
};


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
    focusText: 'Chuẩn hóa Kính ngữ Desu/Masu & Tác phong đàm thoại công sở',
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

function buildAdaptiveRecommendations(
  result: RoleplayResultDetail,
  availableScenarios: ScenarioListItem[] = [],
): { items: SmartRecommendationItem[]; weaknessSummary: string } {
  const currentId = result.scenarioId || 0;
  const currentLevel = (result.jlptLevel || 'N5').toUpperCase();
  const fluency = result.fluencyScore ?? 85;
  const latency = result.averageResponseLatencySeconds ?? 2.2;
  const keigo = result.impressionScore ?? 80;
  const grammar = result.grammarScore ?? 80;
  const vocab = result.vocabularyScore ?? 80;
  const overall = result.overallScore ?? 80;

  let weaknessSummary = '';
  if (keigo < 75) {
    weaknessSummary = `Chỉ số Kính ngữ & Văn phong (${keigo}đ) cần củng cố thêm. Hệ thống ưu tiên đề xuất các tình huống giao tiếp chuẩn mực, luyện thể lịch sự Desu/Masu và tác phong công sở.`;
  } else if (fluency < 75 || latency > 2.8) {
    weaknessSummary = `Độ trôi chảy & Phản xạ (${latency.toFixed(1)}s/lượt) có độ trễ nhẹ. Đề xuất tình huống dịch vụ đời thường với nhịp đối đáp ngắn, dồn dập để tối ưu phản xạ tức thì.`;
  } else if (grammar < 75) {
    weaknessSummary = `Độ chính xác Ngữ pháp & Trợ từ (${grammar}đ) cần rèn luyện thêm. Đề xuất kịch bản trọng tâm vào liên kết câu, trợ từ vị trí và cấu trúc diễn đạt mạch lạc.`;
  } else if (vocab < 75) {
    weaknessSummary = `Vốn từ vựng chuyên đề (${vocab}đ) cần mở rộng. Đề xuất kịch bản bổ sung cụm từ thực tế phong phú để bạn diễn đạt tự nhiên hơn.`;
  } else if (overall >= 85) {
    weaknessSummary = `Bạn đã làm chủ xuất sắc kịch bản này (${overall}đ)! Hệ thống đề xuất các thử thách nâng cao để bứt phá giới hạn hội thoại tự chủ.`;
  } else {
    weaknessSummary = `Cân bằng 6 trục năng lực đối thoại: Đề xuất các tình huống thực tế tiếp theo giúp nâng cao toàn diện phản xạ và độ tự tin phát âm.`;
  }

  const realPool = (availableScenarios || []).filter((s) => s.id !== currentId);
  const items: SmartRecommendationItem[] = [];

  if (realPool.length > 0) {
    const sorted = [...realPool].sort((a, b) => {
      const aHas = a.supportedJLPTLevels?.includes(currentLevel) ? 1 : 0;
      const bHas = b.supportedJLPTLevels?.includes(currentLevel) ? 1 : 0;
      return bHas - aHas;
    });

    if (sorted[0]) {
      const s = sorted[0];
      items.push({
        id: s.id,
        title: s.title,
        level: s.supportedJLPTLevels?.[0] || currentLevel,
        supportedJLPTLevels: s.supportedJLPTLevels,
        topicName: s.topicName,
        thumbnail: s.thumbnail,
        description: s.description || 'Thực hành đối thoại 2 chiều cùng AI theo bối cảnh thực tế.',
        matchScore: 96,
        isTopPick: true,
        tag: 'Khuyên chọn',
        actionReason: result.passStatus
          ? `Nâng tầm phản xạ giao tiếp tự nhiên ở cấp độ ${s.supportedJLPTLevels?.[0] || currentLevel}.`
          : `Khắc phục trực tiếp các điểm yếu ngữ cảnh và phản xạ từ lượt luyện tập vừa rồi.`,
      });
    }

    if (sorted[1]) {
      const s = sorted[1];
      items.push({
        id: s.id,
        title: s.title,
        level: s.supportedJLPTLevels?.[0] || currentLevel,
        supportedJLPTLevels: s.supportedJLPTLevels,
        topicName: s.topicName,
        thumbnail: s.thumbnail,
        description: s.description || 'Rèn luyện phản xạ đối thoại đời thường.',
        matchScore: 89,
        isTopPick: false,
        tag: 'Tương thích',
        actionReason: 'Tình huống bổ trợ đắc lực giúp củng cố vốn từ và sự trôi chảy.',
      });
    }

    if (sorted[2]) {
      const s = sorted[2];
      items.push({
        id: s.id,
        title: s.title,
        level: s.supportedJLPTLevels?.[0] || currentLevel,
        supportedJLPTLevels: s.supportedJLPTLevels,
        topicName: s.topicName,
        thumbnail: s.thumbnail,
        description: s.description || 'Mở rộng ngữ cảnh giao tiếp sang chủ đề mới.',
        matchScore: 83,
        isTopPick: false,
        tag: 'Mở rộng',
        actionReason: 'Mở rộng vốn từ vựng thực tế và nâng cao độ tự chủ diễn đạt.',
      });
    }

    if (items.length > 0) {
      return { items, weaknessSummary };
    }
  }

  const fallbackPool = DEFAULT_SCENARIOS_CATALOG.filter((s) => s.id !== currentId);
  fallbackPool.slice(0, 3).forEach((s, idx) => {
    items.push({
      id: s.id,
      title: s.title,
      level: s.level,
      supportedJLPTLevels: s.supportedJLPTLevels,
      topicName: s.topicName,
      thumbnail: s.thumbnail,
      description: s.description,
      matchScore: idx === 0 ? 96 : idx === 1 ? 89 : 83,
      isTopPick: idx === 0,
      tag: idx === 0 ? 'Khuyên chọn' : idx === 1 ? 'Tương thích' : 'Mở rộng',
      actionReason: s.focusText,
    });
  });

  return { items, weaknessSummary };
}


const TARGET_VI_MAP: Record<string, string> = {
  'colleagues and supervisor': 'Đồng nghiệp & Cấp trên',
  'name and assigned department': 'Họ tên & Phòng ban phân công',
  'work commitment': 'Tinh thần học hỏi & Cầu tiến',
  'noodle hardness and soup flavor': 'Độ cứng mì & Hương vị nước dùng',
  'greeting and seat request': 'Chào hỏi & Vị trí ngồi',
  'order tonkotsu ramen': 'Gọi món mì Tonkotsu Ramen',
  'destination and train line': 'Điểm đến & Tuyến tàu',
  'ticket purchase': 'Mua vé tàu',
  'check-in and luggage': 'Nhận phòng & Gửi hành lý',
  'room amenities inquiry': 'Hỏi tiện ích phòng nghỉ',
  'warm bento and cutlery': 'Hâm nóng cơm & Xin thìa đũa',
  'payment method': 'Phương thức thanh toán',
  'symptoms explanation': 'Mô tả triệu chứng bệnh',
  'medicine dosage': 'Hướng dẫn uống thuốc',
};

const formatMissionTargetVi = (raw?: string | null): string => {
  if (!raw) return '';
  const lower = raw.trim().toLowerCase();
  return TARGET_VI_MAP[lower] || raw;
};

export const ConversationResultDetailView: React.FC = () => {
  const navigate = useNavigate();
  const { resultId } = useParams();

  const [searchParams] = useSearchParams();
  const location = useLocation();

  const rawReturnUrl = searchParams.get("return");

  const returnUrl =
    rawReturnUrl &&
    rawReturnUrl.startsWith("/") &&
    !rawReturnUrl.startsWith("//")
      ? rawReturnUrl
      : null;

  const { user } = useAuth();

  const isAdmin = user?.role?.toLowerCase() === "admin";

  const parsedResultId = Number(resultId);

  const [result, setResult] = useState<RoleplayResultDetail | null>(null);

  const [isLoading, setIsLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);

  const [copyToast, setCopyToast] = useState(false);

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [savedVocabIds, setSavedVocabIds] = useState<Set<number>>(new Set());
  // Per-turn translation & furigana reveals for conversation transcript
  const [revealedTranscriptTranslationIds, setRevealedTranscriptTranslationIds] = useState<Set<number | string>>(() => new Set());
  const [hiddenTranscriptFuriIds, setHiddenTranscriptFuriIds] = useState<Set<number | string>>(() => new Set());

  const toggleAllTranscriptTranslations = () => {
    ukiyoSound.playSubtleTap();
    if (!result?.messages) return;
    setRevealedTranscriptTranslationIds((prev) => {
      if (prev.size >= Math.ceil(result.messages.length / 2)) {
        return new Set();
      }
      return new Set(result.messages.map((m, idx) => m.id || idx));
    });
  };

  const toggleAllTranscriptFurigana = () => {
    ukiyoSound.playSubtleTap();
    if (!result?.messages) return;
    setHiddenTranscriptFuriIds((prev) => {
      if (prev.size === 0) {
        return new Set(result.messages.map((m, idx) => m.id || idx));
      }
      return new Set();
    });
  };
  const [isAllSaved, setIsAllSaved] = useState(false);
  const [isStartingBlind, setIsStartingBlind] = useState(false);
  const [availableScenarios, setAvailableScenarios] = useState<ScenarioListItem[]>([]);

  const handleSaveAllToFlashcards = async () => {
    const vocabs = result?.targetVocabularies || [];
    const grammars = result?.targetGrammars || [];
    if (vocabs.length === 0 && grammars.length === 0) return;

    try {
      // 1. Lưu vào Database thông qua API Backend Bookmark của Hoàng
      const promises: Promise<any>[] = [];
      for (const v of vocabs) {
        if (v.id) {
          promises.push(flashcardService.toggleBookmark('Vocabulary', v.id));
        }
      }
      for (const g of grammars) {
        if (g.id) {
          promises.push(flashcardService.toggleBookmark('Grammar', g.id));
        }
      }
      if (promises.length > 0) {
        await Promise.allSettled(promises);
      }

      // 2. Dự phòng lưu LocalStorage
      const existing = JSON.parse(
        localStorage.getItem("jcap_saved_flashcards") || "[]",
      );
      const newItems = [
        ...vocabs.map((v) => ({
          type: "vocab",
          word: v.word,
          reading: v.reading,
          meaning: v.meaning,
          addedAt: new Date().toISOString(),
        })),
        ...grammars.map((g) => ({
          type: "grammar",
          pattern: g.pattern,
          meaning: g.meaning,
          exampleSentence: g.exampleSentence,
          addedAt: new Date().toISOString(),
        })),
      ];
      localStorage.setItem(
        "jcap_saved_flashcards",
        JSON.stringify([...existing, ...newItems]),
      );

      const newSavedVocabIds = new Set(savedVocabIds);
      vocabs.forEach((v) => newSavedVocabIds.add(v.id));
      setSavedVocabIds(newSavedVocabIds);
      setIsAllSaved(true);
      ukiyoSound.playMigotoChime();
      setToastMessage(
        `Đã lưu ${vocabs.length + grammars.length} từ vựng & ngữ pháp vào Kho Thẻ Cá Nhân (Database)!`,
      );
      setTimeout(() => setToastMessage(null), 3500);
    } catch (err) {
      console.error("Error saving flashcards:", err);
    }
  };

  const handleSaveSingleVocab = async (vocab: any) => {
    try {
      const isCurrentlySaved = savedVocabIds.has(vocab.id);
      if (vocab.id) {
        await flashcardService.toggleBookmark('Vocabulary', vocab.id);
      }
      setSavedVocabIds((prev) => {
        const next = new Set(prev);
        if (isCurrentlySaved) next.delete(vocab.id);
        else next.add(vocab.id);
        return next;
      });
      if (!isCurrentlySaved) {
        ukiyoSound.playMigotoChime();
        setToastMessage(`Đã thêm "${vocab.word}" vào Kho Thẻ Cá Nhân (Bookmark)!`);
      } else {
        ukiyoSound.playSubtleTap();
        setToastMessage(`Đã bỏ lưu "${vocab.word}" khỏi Flashcard.`);
      }
      setTimeout(() => setToastMessage(null), 2500);
    } catch (err) {
      console.error("Error toggling single vocab:", err);
    }
  };

  const handleStartBlindRetake = async () => {
    if (!result?.scenarioId) return;
    setIsStartingBlind(true);
    try {
      const res = await roleplayService.startSession(
        result.scenarioId,
        result.jlptLevel || "N5",
        true,
      );
      const targetSessionId = res.data?.sessionId || res.data?.id;
      if (res.success && targetSessionId) {
        navigate(`/scenarios/practice/${targetSessionId}?mode=blind`);
      } else {
        navigate(`/scenarios/${result.scenarioId}?mode=blind`);
      }
    } catch {
      navigate(`/scenarios/${result.scenarioId}?mode=blind`);
    } finally {
      setIsStartingBlind(false);
    }
  };

  const [savedWeakVocabIds, setSavedWeakVocabIds] = useState<Set<number>>(new Set());
  const [savedWeakGrammarIds, setSavedWeakGrammarIds] = useState<Set<number>>(new Set());
  const [isAllWeakSaved, setIsAllWeakSaved] = useState<boolean>(false);

  const handleToggleWeakVocabBookmark = async (vocab: WeakVocabulary) => {
    try {
      const isCurrentlySaved = savedWeakVocabIds.has(vocab.id);
      if (vocab.id) {
        await flashcardService.toggleBookmark('Vocabulary', vocab.id);
      }
      setSavedWeakVocabIds((prev) => {
        const next = new Set(prev);
        if (isCurrentlySaved) next.delete(vocab.id);
        else next.add(vocab.id);
        return next;
      });

      const existing = JSON.parse(
        localStorage.getItem("jcap_saved_flashcards") || "[]",
      );
      if (!isCurrentlySaved) {
        const item = {
          type: "vocab",
          id: vocab.id,
          word: vocab.word,
          reading: vocab.reading,
          meaning: vocab.meaning,
          reason: vocab.reason,
          addedAt: new Date().toISOString(),
        };
        localStorage.setItem(
          "jcap_saved_flashcards",
          JSON.stringify([...existing, item]),
        );
        ukiyoSound.playMigotoChime();
        setToastMessage(`Đã thêm "${vocab.word}" vào Thẻ Flashcard FSRS!`);
      } else {
        const filtered = existing.filter(
          (i: any) =>
            !(i.type === "vocab" && (i.id === vocab.id || i.word === vocab.word)),
        );
        localStorage.setItem("jcap_saved_flashcards", JSON.stringify(filtered));
        ukiyoSound.playSubtleTap();
        setToastMessage(`Đã bỏ lưu "${vocab.word}" khỏi Flashcard.`);
      }
      setTimeout(() => setToastMessage(null), 2500);
    } catch (err) {
      console.error("Error toggling weak vocab bookmark:", err);
    }
  };

  const handleToggleWeakGrammarBookmark = async (grammar: WeakGrammar) => {
    try {
      const isCurrentlySaved = savedWeakGrammarIds.has(grammar.id);
      if (grammar.id) {
        await flashcardService.toggleBookmark('Grammar', grammar.id);
      }
      setSavedWeakGrammarIds((prev) => {
        const next = new Set(prev);
        if (isCurrentlySaved) next.delete(grammar.id);
        else next.add(grammar.id);
        return next;
      });

      const existing = JSON.parse(
        localStorage.getItem("jcap_saved_flashcards") || "[]",
      );
      if (!isCurrentlySaved) {
        const item = {
          type: "grammar",
          id: grammar.id,
          pattern: grammar.pattern,
          meaning: grammar.meaning,
          exampleSentence: grammar.exampleSentence,
          reason: grammar.reason,
          addedAt: new Date().toISOString(),
        };
        localStorage.setItem(
          "jcap_saved_flashcards",
          JSON.stringify([...existing, item]),
        );
        ukiyoSound.playMigotoChime();
        setToastMessage(
          `Đã thêm mẫu ngữ pháp "${grammar.pattern}" vào Thẻ Flashcard FSRS!`,
        );
      } else {
        const filtered = existing.filter(
          (i: any) =>
            !(
              i.type === "grammar" &&
              (i.id === grammar.id || i.pattern === grammar.pattern)
            ),
        );
        localStorage.setItem("jcap_saved_flashcards", JSON.stringify(filtered));
        ukiyoSound.playSubtleTap();
        setToastMessage(`Đã bỏ lưu "${grammar.pattern}" khỏi Flashcard.`);
      }
      setTimeout(() => setToastMessage(null), 2500);
    } catch (err) {
      console.error("Error toggling weak grammar bookmark:", err);
    }
  };

  const handleSaveAllWeakPointsToFlashcards = async () => {
    const weakVocabs = result?.weakVocabularies || [];
    const weakGrammars = result?.weakGrammars || [];
    const totalCount = weakVocabs.length + weakGrammars.length;
    if (totalCount === 0) return;

    try {
      const promises: Promise<any>[] = [];
      for (const v of weakVocabs) {
        if (v.id) promises.push(flashcardService.toggleBookmark('Vocabulary', v.id));
      }
      for (const g of weakGrammars) {
        if (g.id) promises.push(flashcardService.toggleBookmark('Grammar', g.id));
      }
      if (promises.length > 0) {
        await Promise.allSettled(promises);
      }

      const existing = JSON.parse(
        localStorage.getItem("jcap_saved_flashcards") || "[]",
      );
      const newItems = [
        ...weakVocabs.map((v) => ({
          type: "vocab",
          id: v.id,
          word: v.word,
          reading: v.reading,
          meaning: v.meaning,
          reason: v.reason,
          addedAt: new Date().toISOString(),
        })),
        ...weakGrammars.map((g) => ({
          type: "grammar",
          id: g.id,
          pattern: g.pattern,
          meaning: g.meaning,
          exampleSentence: g.exampleSentence,
          reason: g.reason,
          addedAt: new Date().toISOString(),
        })),
      ];
      localStorage.setItem(
        "jcap_saved_flashcards",
        JSON.stringify([...existing, ...newItems]),
      );

      const nextVocabIds = new Set(savedWeakVocabIds);
      weakVocabs.forEach((v) => nextVocabIds.add(v.id));
      setSavedWeakVocabIds(nextVocabIds);

      const nextGrammarIds = new Set(savedWeakGrammarIds);
      weakGrammars.forEach((g) => nextGrammarIds.add(g.id));
      setSavedWeakGrammarIds(nextGrammarIds);

      setIsAllWeakSaved(true);
      ukiyoSound.playMigotoChime();
      setToastMessage(
        `Đã lưu toàn bộ ${totalCount} điểm yếu vào Flashcards (FSRS)!`,
      );
      setTimeout(() => setToastMessage(null), 3500);
    } catch (err) {
      console.error("Error saving all weak points:", err);
    }
  };

  const [isTranscriptOpen, setIsTranscriptOpen] = useState(false);
  const [isBreakdownOpen, setIsBreakdownOpen] = useState(false);
  const [expandedTurnIds, setExpandedTurnIds] = useState<Set<number>>(new Set());
  const [turnFilter, setTurnFilter] = useState<'all' | 'good' | 'warning'>('all');
  const [showCelebrationHanabi, setShowCelebrationHanabi] = useState(false);

  // Chỉ kích hoạt hiệu ứng chúc mừng KHI VỪA HOÀN TẤT PHIÊN (justCompleted) VÀ ĐẠT ĐIỂM CAO (>= 80đ)
  const isJustCompleted = searchParams.get('justCompleted') === 'true' || (location.state as any)?.justCompleted === true;
  useEffect(() => {
    if (result && isJustCompleted && result.passStatus && (result.overallScore >= 80 || result.attemptComparison?.isPersonalBest)) {
      setShowCelebrationHanabi(true);
      const timer = setTimeout(() => setShowCelebrationHanabi(false), 2800);
      return () => clearTimeout(timer);
    }
  }, [result?.overallScore, result?.attemptComparison?.isPersonalBest, isJustCompleted, result?.passStatus]);

  const turnCounts = useMemo(() => {
    if (!result?.messages) return { total: 0, good: 0, warning: 0 };
    const userMessages = result.messages.filter((m) => m.sender.toLowerCase() === 'user');
    let good = 0;
    let warning = 0;
    userMessages.forEach((m) => {
      const status = (m.linguisticFeedback?.quickStatus || m.linguisticFeedback?.status || 'good').toLowerCase();
      if (status === 'warning' || status === 'error') {
        warning++;
      } else {
        good++;
      }
    });
    return {
      total: userMessages.length,
      good,
      warning,
    };
  }, [result?.messages]);

  const handleSetTurnFilter = (filter: 'all' | 'good' | 'warning') => {
    ukiyoSound.playWoodblockSnap();
    setTurnFilter(filter);
    // Luôn giữ mặc định thu gọn để giao diện tinh tế, người học chủ động mở từng lượt
    setExpandedTurnIds(new Set());
  };

  const toggleTurnExpansion = (turnId: number) => {
    ukiyoSound.playSubtleTap();
    setExpandedTurnIds((prev) => {
      const next = new Set(prev);
      if (next.has(turnId)) {
        next.delete(turnId);
      } else {
        next.add(turnId);
      }
      return next;
    });
  };

  const handleExpandAllTurns = () => {
    ukiyoSound.playSubtleTap();
    if (!result?.messages) return;
    const allTurnIds = result.messages.map((m, idx) => m.id || idx);
    setExpandedTurnIds(new Set(allTurnIds));
  };

  const handleCollapseAllTurns = () => {
    ukiyoSound.playSubtleTap();
    setExpandedTurnIds(new Set());
  };

  const [copiedMessageId, setCopiedMessageId] = useState<number | null>(null);

  const [copiedAlternativeId, setCopiedAlternativeId] = useState<number | null>(
    null,
  );

  const [playingSampleMsgId, setPlayingSampleMsgId] = useState<number | null>(
    null,
  );

  const handlePlaySample = (msgId: number, text: string) => {
    if (playingSampleMsgId === msgId) {
      scenarioVoiceService.stopAllAudio();

      setPlayingSampleMsgId(null);

      return;
    }

    setPlayingSampleMsgId(msgId);

    void scenarioVoiceService.playAiSpeech(
      text,

      2, // Shikoku Metan Tokyo standard

      () => setPlayingSampleMsgId(null),

      1.0,

      () => setPlayingSampleMsgId(msgId),
    );
  };

  const handleSeekSample = (
    msgId: number,
    text: string,
    ratio: number,
    time: number,
  ) => {
    setPlayingSampleMsgId(msgId);

    scenarioVoiceService.seekAiSpeech(
      text,

      ratio,

      time,

      2,

      () => setPlayingSampleMsgId(null),

      1.0,

      () => setPlayingSampleMsgId(msgId),
    );
  };

  const handleCopyText = (text: string, id: number, isAlt = false) => {
    void navigator.clipboard.writeText(text);

    if (isAlt) {
      setCopiedAlternativeId(id);

      setTimeout(() => setCopiedAlternativeId(null), 2000);
    } else {
      setCopiedMessageId(id);

      setTimeout(() => setCopiedMessageId(null), 2000);
    }

    setToastMessage(
      `Đã sao chép: "${text.length > 30 ? text.slice(0, 30) + "..." : text}"`,
    );

    setTimeout(() => setToastMessage(null), 2500);
  };

  const handleSaveToFlashcards = () => {
    if (!result) return;

    const itemsToSave: Array<{
      word: string;
      meaning: string;
      context: string;
    }> = [];

    // Lấy từ vựng mục tiêu của kịch bản

    result.targetVocabularies?.forEach((v) => {
      itemsToSave.push({
        word: v.word,
        meaning: v.meaning,
        context: result.scenarioTitle,
      });
    });

    // Lấy các câu bản xứ tự nhiên từ lượt nói của user

    result.messages?.forEach((m) => {
      if (
        m.sender.toLowerCase() === "user" &&
        m.linguisticFeedback?.naturalAlternative
      ) {
        itemsToSave.push({
          word: m.linguisticFeedback.naturalAlternative,

          meaning: m.vietnameseMeaning || "Diễn đạt tự nhiên bản xứ",

          context: result.scenarioTitle,
        });
      }
    });

    const existing = JSON.parse(
      localStorage.getItem("jcap_roleplay_flashcards") || "[]",
    );

    const merged = [
      ...existing,
      ...itemsToSave.filter(
        (item) => !existing.some((e: any) => e.word === item.word),
      ),
    ];

    localStorage.setItem("jcap_roleplay_flashcards", JSON.stringify(merged));

    ukiyoSound.playMigotoChime();

    setToastMessage(
      `Đã lưu ${itemsToSave.length} từ vựng & câu chuẩn vào Sổ tay Flashcard!`,
    );

    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleCopySummary = async () => {
    if (!result) return;

    const text = [
      `KẾT QUẢ LUYỆN HỘI THOẠI JCAP`,

      `Kịch bản: ${result.scenarioTitle} (JLPT ${result.jlptLevel})`,

      `Tổng điểm: ${result.overallScore}/100 - ${result.passStatus ? "ĐẠT" : "CHƯA ĐẠT"}`,

      `• Ngữ pháp: ${result.grammarScore}/100`,

      `• Từ vựng: ${result.vocabularyScore}/100`,

      `• Kính ngữ & Văn phong: ${result.impressionScore}/100`,

      typeof result.fluencyScore === "number"
        ? `• Độ trôi chảy & Phản xạ: ${result.fluencyScore}/100`
        : "",

      typeof result.speechConfidenceScore === "number"
        ? `• Độ tự tin & Rõ ràng: ${result.speechConfidenceScore}/100`
        : "",

      `• Nhiệm vụ hoàn thành: ${result.completedMissions.length} mục tiêu`,

      result.generalFeedbackText
        ? `\nNhận xét tổng quan:\n${result.generalFeedbackText}`
        : "",
    ]

      .filter(Boolean)

      .join("\n");

    try {
      await navigator.clipboard.writeText(text);

      setCopyToast(true);

      setTimeout(() => setCopyToast(false), 3000);
    } catch {
      // fallback
    }
  };

  const handlePrint = () => {
    window.print();
  };

  useEffect(() => {
    let isCurrent = true;

    const loadResult = async () => {
      setIsLoading(true);

      setResult(null);

      setError(null);

      if (!Number.isInteger(parsedResultId) || parsedResultId <= 0) {
        setError("Mã kết quả không hợp lệ.");

        setIsLoading(false);

        return;
      }

      const response = await roleplayResultService.getDetail(parsedResultId);

      if (!isCurrent) return;

      if (!response.success || !response.data) {
        setError(response.message || "Không thể tải kết quả luyện tập.");
      } else {
        setResult(response.data);
        ukiyoSound.playTaikoThud();

        // Nạp thêm danh sách kịch bản từ hệ thống để tăng độ phong phú đề xuất
        void scenarioService.getScenarios().then((res) => {
          if (res.success && res.data) setAvailableScenarios(res.data);
        }).catch(() => {});

        // Tải trước ngầm các câu thoại mẫu chuẩn Tokyo vào IndexedDB/RAM để bấm là phát ngay

        const userMsgs =
          response.data.messages?.filter(
            (m) => m.sender?.toLowerCase() === "user",
          ) || [];

        setTimeout(() => {
          userMsgs.slice(0, 5).forEach((msg) => {
            const text =
              msg.linguisticFeedback?.naturalAlternative || msg.japaneseText;

            if (text) void scenarioVoiceService.prefetchAudio(text, 2);
          });
        }, 800);
      }

      setIsLoading(false);
    };

    void loadResult();

    return () => {
      isCurrent = false;

      scenarioVoiceService.stopAllAudio();
    };
  }, [parsedResultId]);

  if (
    isLoading ||
    (result &&
      result.id !== parsedResultId &&
      result.roleplaySessionId !== parsedResultId)
  ) {
    return (
      <div className="mx-auto max-w-5xl space-y-5 py-6">
        <div className="rounded-[28px] border border-[var(--line)] bg-[var(--paper-50)] p-8 text-center shadow-xs flex flex-col items-center justify-center">
          <div className="h-12 w-12 rounded-full border-3 border-[var(--line)] border-t-[var(--ai)] animate-spin mb-4" />
          <h2 className="text-base font-bold text-[var(--sumi)] font-sans">
            Đang tải bản khắc kết quả hội thoại...
          </h2>
          <p className="text-xs text-[var(--sumi-muted)] mt-1">
            Hệ thống đang đồng bộ dữ liệu đánh giá và chỉ số phản xạ
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((item) => (
            <div
              key={item}
              className="h-28 animate-pulse rounded-2xl bg-white border border-stone-200/60"
            />
          ))}
        </div>
      </div>
    );
  }

  if (error || !result) {
    return (
      <div className="mx-auto max-w-2xl rounded-[28px] border border-red-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-2xl font-black text-[var(--sumi)]">
          Không thể mở kết quả
        </h1>

        <p className="mt-3 text-sm leading-6 text-red-700">{error}</p>

        <Link
          to={isAdmin ? "/admin/scenarios" : "/roleplay/results"}

          className="mt-6 inline-flex rounded-xl bg-[var(--sumi)] px-5 py-2.5 text-sm font-bold text-white"
        >
          {isAdmin ? "Quay lại Quản lý kịch bản" : "Quay lại lịch sử"}
        </Link>
      </div>
    );
  }

  return (
    <section className="mx-auto w-full max-w-5xl pb-10">
      {/* Toast Notification */}

      {typeof document !== 'undefined' && (copyToast || toastMessage) && createPortal(
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-2.5 rounded-2xl border border-emerald-400/90 bg-[#071A44]/95 backdrop-blur-md px-5 py-3 text-xs font-bold text-white shadow-2xl animate-fade-in pointer-events-auto">
          <span className="text-emerald-400 text-sm">{toastMessage ? "●" : "✓"}</span>
          <span>{toastMessage || "Đã sao chép báo cáo kết quả vào bộ nhớ tạm!"}</span>
        </div>,
        document.body
      )}

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Link
          to={returnUrl || (isAdmin ? "/admin/scenarios" : "/roleplay/results")}

          className="inline-flex items-center gap-1.5 rounded-2xl border border-[var(--line)] bg-[var(--paper-50)] px-3.5 py-2 text-xs font-bold text-[var(--sumi-muted)] transition hover:text-[var(--ai)] hover:border-[var(--line-strong)] hover:bg-white active:scale-95 shadow-2xs"
        >
          <span>←</span>

          <span>
            {returnUrl
              ? "Quay lại Bản đồ Khám phá"
              : isAdmin
                ? "Quay lại Quản lý kịch bản"
                : "Quay lại lịch sử"}
          </span>
        </Link>

        <div className="flex items-center gap-2">
          <button
            type="button"

            onClick={handleCopySummary}

            className="inline-flex items-center gap-1.5 rounded-2xl border border-[var(--line)] bg-[var(--paper-50)] px-3.5 py-2 text-xs font-bold text-[var(--sumi)] shadow-2xs transition hover:bg-white hover:border-[var(--line-strong)] active:scale-95"

            title="Sao chép tóm tắt kết quả vào bộ nhớ tạm"
          >
            <CopyIcon className="w-3.5 h-3.5" />
            <span>Sao chép tóm tắt</span>
          </button>

          <button
            type="button"

            onClick={handlePrint}

            className="inline-flex items-center gap-1.5 rounded-2xl border border-[var(--line)] bg-[var(--paper-50)] px-3.5 py-2 text-xs font-bold text-[var(--sumi)] shadow-2xs transition hover:bg-white hover:border-[var(--line-strong)] active:scale-95"

            title="In hoặc Lưu báo cáo dưới dạng PDF"
          >
            <PrinterIcon className="w-3.5 h-3.5" />
            <span>In / PDF</span>
          </button>

          <Link
            to="/profile#radar-map"
            className="inline-flex items-center gap-1.5 rounded-2xl border border-[var(--ai)]/30 bg-[var(--ai-soft)] px-3.5 py-2 text-xs font-bold text-[var(--ai)] shadow-2xs transition hover:bg-[var(--ai)] hover:text-white active:scale-95 cursor-pointer"
            title="Xem Bản đồ Năng lực 6 Trục (Learner Intelligence Profile)"
          >
            <BarChartIcon className="w-3.5 h-3.5" />
            <span>Hồ sơ năng lực</span>
          </Link>
        </div>
      </div>

      <div
        key={result.id}
        data-theme="phong-luyen"
        className="rounded-[32px] bg-[var(--paper-100)] p-4 sm:p-7 border border-[var(--line)] shadow-sm relative overflow-hidden"
      >
        {showCelebrationHanabi && typeof document !== 'undefined' && createPortal(
          <HanabiSparkleBurst
            text={result.attemptComparison?.isPersonalBest ? "Kỷ lục mới · 見事！" : "見事 · Xuất sắc！"}
            onComplete={() => setShowCelebrationHanabi(false)}
          />,
          document.body
        )}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-[var(--sumi-muted)]">
          <div className="flex items-center gap-2">
            <span className="font-serif text-base font-black text-[var(--ai)]">
              JCAP
            </span>

            <span className="px-2.5 py-0.5 rounded-full bg-[var(--ai-soft)] text-[var(--ai)] text-[10px] font-bold uppercase tracking-wide border border-[var(--ai)]/20">
              Phòng Luyện
            </span>
          </div>

          <span className="font-mono text-[11px] text-[var(--sumi-faint)]">
            Kết quả #{result.id} · Thời gian Việt Nam (UTC+7)
          </span>
        </div>

        {/* HERO BANNER: THẨM MỸ CHIẾN TÍCH GAME NHẬT BẢN (RPG DEBRIEF SCREEN) */}
        <header className="relative overflow-hidden rounded-[32px] bg-gradient-to-br from-[#0F172A] via-[#1E293B] to-[#1E3A8A] px-7 py-8 text-white shadow-xl md:px-10 md:py-10 border border-slate-700/60">
          {/* Lớp nền sóng Seigaiha Nhật Bản */}
          <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_center,#38BDF8_2px,transparent_3px)] bg-[size:24px_24px] pointer-events-none" />

          <div className="absolute right-0 top-0 h-full w-2/3 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.22),transparent_65%)] pointer-events-none" />
          <div className="absolute -left-10 -bottom-10 h-44 w-44 rounded-full bg-indigo-500/15 blur-2xl pointer-events-none" />

          <div className="relative grid gap-8 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-sky-200 border border-white/20 backdrop-blur-xs font-mono shadow-2xs">
                  JLPT {result.jlptLevel}
                </span>

                <span
                  className={`rounded-full px-3 py-1 text-xs font-bold ${
                    result.passStatus
                      ? "bg-emerald-500/25 text-emerald-200 border border-emerald-400/40"
                      : "bg-red-500/20 text-red-200 border border-red-400/30"
                  }`}
                >
                  <span className="font-serif">合格</span>{" "}
                  <span className="font-sans">
                    {result.passStatus ? "ĐẠT" : "CHƯA ĐẠT"}
                  </span>
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-300 font-mono">
                  Bản Khắc Chiến Tích Hội Thoại · 戦績刻印
                </p>
              </div>

              <h1 className="mt-2 break-words text-3xl font-black tracking-tight md:text-4xl font-sans text-white">
                {result.scenarioTitle}
              </h1>

              {/* Danh sách Huy hiệu Năng lực Thực chiến (Competency Badges) */}
              {result.competencyBadges && result.competencyBadges.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {result.competencyBadges.map((badge, bIdx) => (
                    <span
                      key={bIdx}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-white/10 text-amber-200 border border-amber-300/30 backdrop-blur-xs shadow-xs"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                      <span>{badge}</span>
                    </span>
                  ))}
                </div>
              )}

              <p className="mt-3.5 text-xs sm:text-sm text-slate-300 font-sans font-medium">
                Hoàn thành {formatDate(result.completedAt).startsWith("lúc") ? formatDate(result.completedAt) : `lúc ${formatDate(result.completedAt)}`}
              </p>
            </div>

            {/* Cụm Dấu Triện Hanko Slam & Vòng Điểm Số RPG */}
            <div className="flex items-center justify-center md:justify-end gap-5">
              {/* Dấu Triện Đỏ Slam (Hanko Ink Stamp Landing) */}
              <div className="hidden sm:block shrink-0 select-none">
                {result.passStatus ? (
                  <div
                    className="w-20 h-20 sm:w-24 sm:h-24 rounded-full border-3 border-dashed border-rose-500 bg-rose-950/70 p-1 flex flex-col items-center justify-center text-rose-300 shadow-xl rotate-[-6deg] animate-stamp-slam"
                    title="Dấu triện hội thoại: Đạt chuẩn (合格)"
                  >
                    <div className="w-full h-full rounded-full border border-rose-400/80 flex flex-col items-center justify-center">
                      <span className="text-xs sm:text-sm font-serif font-black tracking-widest text-rose-200">合格</span>
                      <span className="text-[8px] sm:text-[9px] font-sans font-black tracking-wider text-rose-300 uppercase">PASSED</span>
                    </div>
                  </div>
                ) : (
                  <div
                    className="w-20 h-20 sm:w-24 sm:h-24 rounded-full border-3 border-dashed border-stone-500 bg-stone-900/80 p-1 flex flex-col items-center justify-center text-stone-300 shadow-xl rotate-[4deg] animate-stamp-slam"
                    title="Dấu triện tu luyện: Cần rèn thêm (未達)"
                  >
                    <div className="w-full h-full rounded-full border border-stone-400/80 flex flex-col items-center justify-center">
                      <span className="text-xs sm:text-sm font-serif font-black tracking-widest text-stone-200">未達</span>
                      <span className="text-[8px] sm:text-[9px] font-sans font-bold tracking-wider text-stone-400 uppercase">RETRY</span>
                    </div>
                  </div>
                )}
              </div>

              <AnimatedScoreGauge score={result.overallScore} />
            </div>
          </div>
        </header>

        {/* Điều hướng Bản đồ Khám phá (khi kịch bản liên kết với địa danh) */}
        {(returnUrl || result.exploreSpotId) && (
          <div className="mt-6 rounded-2xl border border-stone-200/90 bg-white p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
                <CompassIcon className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-md bg-stone-100 text-stone-700 text-[10px] font-bold uppercase tracking-wide">
                    Bản đồ Khám phá
                  </span>
                  {result.awardedEkiStampName && (
                    <span className="text-xs font-semibold text-indigo-700">
                      {result.awardedEkiStampName}
                    </span>
                  )}
                </div>
                <p className="text-xs text-stone-500 mt-1">
                  Kịch bản hội thoại này liên kết với địa danh thực tế trên lộ trình khám phá văn hóa Nhật Bản.
                </p>
              </div>
            </div>

            <div className="shrink-0 w-full sm:w-auto">
              <Link
                to={
                  returnUrl ||
                  (result.explorePrefectureId
                    ? `/explore?tinh=${PREFECTURES.find((p) => p.id === result.explorePrefectureId)?.slug || ""}&dd=${result.exploreSpotId ?? 1}&hoc=1`
                    : "/explore")
                }
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-black active:scale-95 text-white font-bold text-xs shadow-xs transition cursor-pointer"
              >
                <CompassIcon className="w-3.5 h-3.5" />
                <span>Quay lại Bản đồ</span>
                <span>→</span>
              </Link>
            </div>
          </div>
        )}

        {/* 6 BẢN KHẮC NĂNG LỰC ĐỐI THOẠI (6 COMPETENCY INSCRIBED PLAQUES) */}
        <div className="mt-6 grid gap-3.5 grid-cols-2 md:grid-cols-3 lg:grid-cols-6 items-stretch">
          <ScoreCard
            label="Ngữ pháp"
            score={result.grammarScore}
            accent="bg-[var(--ai)]"
            kanjiWatermark="文"
            subtext={
              result.grammarScore >= 80
                ? "Đúng trợ từ & thể"
                : "Lưu ý trợ từ"
            }
          />

          <ScoreCard
            label="Từ vựng"
            score={result.vocabularyScore}
            accent="bg-[var(--score-good)]"
            kanjiWatermark="語"
            subtext={
              result.vocabularyScore >= 80
                ? "Từ phong phú"
                : "Mở rộng vốn từ"
            }
          />

          <ScoreCard
            label="Văn phong & Kính ngữ"
            score={result.impressionScore}
            accent="bg-amber-500"
            kanjiWatermark="礼"
            subtext={
              result.impressionScore >= 80
                ? "Lịch sự, chuẩn mực"
                : "Cần trau chuốt thể văn"
            }
          />

          <ScoreCard
            label="Phản xạ"
            score={!result.speechConfidenceScore ? null : (result.fluencyScore ?? 85)}
            accent="bg-[var(--nami)]"
            kanjiWatermark="速"
            subtext={
              !result.speechConfidenceScore
                ? "Gõ phím (Miễn trừ)"
                : (result.averageResponseLatencySeconds
                    ? `~${result.averageResponseLatencySeconds.toFixed(1)}s · Nhanh`
                    : "Nhịp đối đáp ổn định")
            }
          />

          <ScoreCard
            label="Độ rõ âm"
            score={!result.speechConfidenceScore ? null : result.speechConfidenceScore}
            accent="bg-teal-600"
            kanjiWatermark="声"
            subtext={
              !result.speechConfidenceScore
                ? "Gõ phím (Không chấm phát âm)"
                : (result.averageSpeechPace
                    ? (result.averageSpeechPace < 2.5
                        ? "Chậm rãi, rõ chữ"
                        : result.averageSpeechPace <= 5.0
                        ? "Tự nhiên, vừa vặn"
                        : "Nhanh nhẹn, lưu loát")
                    : "Phát âm rõ ràng")
            }
          />

          <ScoreCard
            label="Tự chủ"
            score={result.autonomyScore ?? 100}
            accent="bg-indigo-600"
            kanjiWatermark="自"
            subtext={
              (result.autonomyScore ?? 100) >= 95
                ? "Độc lập hoàn toàn"
                : "Dùng gợi ý ZPD"
            }
          />
        </div>

        {/* Thanh chỉ số đồng bộ với Bản đồ Năng lực */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--line)] bg-[var(--paper-50)] px-4 py-2.5 text-xs text-[var(--sumi-muted)] shadow-2xs">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Chỉ số 6 trục năng lực đối thoại vừa được ghi nhận và đồng bộ vào <strong>Bản đồ Năng lực (Radar Trí tuệ)</strong> của bạn.</span>
          </div>
          <Link
            to="/profile#radar-map"
            className="inline-flex items-center gap-1 text-[var(--ai)] hover:text-[var(--ai-hover)] font-bold transition hover:underline"
          >
            <span>Xem Hồ sơ Năng lực</span>
            <span>➔</span>
          </Link>
        </div>

        {/* MINH BẠCH CÁCH TÍNH ĐIỂM TỔNG (SCORE BREAKDOWN & TRANSPARENCY ACCORDION) */}
        <div className="mt-6 overflow-hidden rounded-3xl border border-[var(--line)] bg-white/95 p-4 sm:p-5 shadow-xs font-sans transition-all">
          <button
            id="score-breakdown-toggle"
            type="button"
            onClick={() => setIsBreakdownOpen((prev) => !prev)}
            className="w-full flex flex-wrap items-center justify-between gap-3 text-left cursor-pointer group"
          >
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[var(--ai)] border border-blue-200 shadow-2xs group-hover:bg-blue-100 transition">
                <BarChartIcon className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-[var(--sumi)] font-sans">
                    Minh bạch cách tính điểm tổng (Score Breakdown)
                  </h3>
                  <span className="text-[10px] text-[var(--ai)] font-bold bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                    {isBreakdownOpen ? 'Thu gọn ▲' : 'Xem chi tiết ▼'}
                  </span>
                </div>
                <p className="text-[11px] text-[var(--sumi-faint)]">
                  Quy tắc tính điểm chuẩn: 40% Nhiệm vụ + 30% Ngôn ngữ & Văn phong + 20% Độ trôi chảy & Phản xạ + 10% Tự chủ
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 ml-auto">
              <span className="text-xs font-semibold text-slate-500">
                Tổng kết:
              </span>
              <span className="px-3 py-1 rounded-xl bg-[var(--ai-soft)] text-[var(--ai)] font-extrabold text-sm border border-[var(--ai)]/20 font-mono">
                {result.overallScore}/100
              </span>
            </div>
          </button>

          {isBreakdownOpen && (
            <div className="mt-3 pt-3 border-t border-[var(--line)] divide-y divide-stone-100 animate-slide-up">
              {result.scoreBreakdown?.adjustments &&
              result.scoreBreakdown.adjustments.length > 0
                ? result.scoreBreakdown.adjustments.map((adj, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between py-2.5 text-xs"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
                        <span className="font-bold text-slate-800 min-w-[200px]">
                          {adj.category}
                        </span>
                        <span className="text-slate-500 text-[11px]">
                          {adj.description}
                        </span>
                      </div>
                      <span
                        className={`shrink-0 font-bold font-mono text-xs px-2.5 py-0.5 rounded-lg border ${
                          adj.category?.includes("Khóa trần") || adj.category?.includes("Chưa đạt")
                            ? "bg-amber-50 text-amber-850 border-amber-300"
                            : adj.deltaPoints > 0
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : adj.deltaPoints < 0
                                ? "bg-rose-50 text-rose-700 border-rose-200"
                                : "bg-slate-50 text-slate-600 border-slate-200"
                        }`}
                      >
                        {adj.category?.includes("Khóa trần") || adj.category?.includes("Chưa đạt")
                          ? `Điều chỉnh ${adj.deltaPoints}đ`
                          : adj.deltaPoints > 0
                            ? `+${adj.deltaPoints}đ`
                            : adj.deltaPoints < 0
                              ? `${adj.deltaPoints}đ`
                              : "0đ"}
                      </span>
                    </div>
                  ))
                : [
                    {
                      cat: "Nhiệm vụ kịch bản (50%)",
                      desc: `${result.completedMissions?.length || 0}/${result.allMissions?.length || result.completedMissions?.length || 1} mục tiêu hoàn thành`,
                      pts: Math.round(
                        ((result.completedMissions?.length || 0) /
                          Math.max(
                            1,
                            result.allMissions?.length ||
                              result.completedMissions?.length ||
                              1,
                          )) *
                          50,
                      ),
                    },
                    {
                      cat: "Ngữ pháp & Cấu trúc (20%)",
                      desc: `Độ chính xác thể, chia động từ và trợ từ (${result.grammarScore}/100)`,
                      pts: Math.round(result.grammarScore * 0.2),
                    },
                    {
                      cat: "Vốn từ vựng (20%)",
                      desc: `Sử dụng đúng từ ngữ chủ đề và phản xạ từ vựng (${result.vocabularyScore}/100)`,
                      pts: Math.round(result.vocabularyScore * 0.2),
                    },
                    {
                      cat: "Kính ngữ & Văn phong (10%)",
                      desc: `Văn phong giao tiếp phù hợp bối cảnh (${result.impressionScore}/100)`,
                      pts: Math.round(result.impressionScore * 0.1),
                    },
                    {
                      cat: "Độ tự chủ giao tiếp (Autonomy)",
                      desc:
                        (result.autonomyScore ?? 100) >= 95
                          ? "Tự chủ 100% (Phản xạ độc lập, không dựa dẫm câu gợi ý)"
                          : `Điểm tự chủ ${result.autonomyScore ?? 100}/100 (Có mở xem mẫu câu hoặc hỗ trợ bản dịch)`,
                      pts:
                        (result.autonomyScore ?? 100) >= 95
                          ? 0
                          : -Math.round(
                              (100 - (result.autonomyScore ?? 100)) / 10,
                            ),
                    },
                  ].map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between py-2.5 text-xs"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
                        <span className="font-bold text-slate-800 min-w-[200px]">
                          {item.cat}
                        </span>
                        <span className="text-slate-500 text-[11px]">
                          {item.desc}
                        </span>
                      </div>
                      <span
                        className={`shrink-0 font-bold font-mono text-xs px-2.5 py-0.5 rounded-lg border ${
                          item.pts > 0
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : item.pts < 0
                              ? "bg-rose-50 text-rose-700 border-rose-200"
                              : "bg-slate-50 text-slate-600 border-slate-200"
                        }`}
                      >
                        {item.pts > 0
                          ? `+${item.pts}đ`
                          : item.pts < 0
                            ? `${item.pts}đ`
                            : "0đ"}
                      </span>
                    </div>
                  ))}
            </div>
          )}
        </div>

        {/* BENTO-BOX 3-COLUMN GAMIFICATION & PROGRESSION ROW (Wabi-Sabi / Ma 間) */}
        {(() => {
          const attempt = result.attemptComparison || {
            attemptNumber: 1,
            overallScore: result.overallScore,
            scoreDelta: 0,
            isPersonalBest: false,
            previousOverallScore: undefined,
            progressSummary:
              result.overallScore >= 80
                ? "Phong độ rất tốt! Bạn đã hoàn thành các mục tiêu hội thoại với ngữ điệu tự nhiên."
                : "Hoàn thành kịch bản! Hãy tiếp tục luyện tập để cải thiện sự lưu loát và phản xạ tự nhiên.",
          };

          return (
            <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4 font-sans items-stretch">
              {/* Tile 1: Tiến độ kịch bản (Attempt) */}
              <div className="flex flex-col justify-between rounded-3xl border border-[var(--line)] bg-white/95 p-5 shadow-xs transition hover:border-[var(--ai)]/40 hover:shadow-sm">
                <div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-tr from-[var(--ai)] to-[var(--nami)] text-white shadow-2xs">
                        <BarChartIcon className="w-4 h-4 text-white" />
                      </div>
                      <h3 className="text-xs font-bold text-[var(--sumi)] font-sans">Tiến độ kịch bản</h3>
                    </div>
                    <span className="rounded-full bg-[var(--ai-soft)] px-2.5 py-0.5 text-[10px] font-bold text-[var(--ai)] border border-[var(--ai)]/20 font-mono">
                      Lần #{attempt.attemptNumber}
                    </span>
                  </div>

                  <div className="bg-[var(--paper-100)] rounded-2xl p-3 border border-[var(--line)]/60 mb-2.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[11px] font-medium text-[var(--sumi-faint)]">Điểm phiên này:</span>
                      <strong className="text-sm font-black text-[var(--sumi)] font-mono">{attempt.overallScore}đ</strong>
                    </div>
                    {attempt.previousOverallScore !== undefined && attempt.previousOverallScore !== null && (
                      <div className="flex items-center justify-between text-xs mt-1 pt-1 border-t border-[var(--line)]/40">
                        <span className="text-[10px] text-[var(--sumi-faint)]">Lần trước: {attempt.previousOverallScore}đ</span>
                        <span className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.2 text-[10px] font-bold font-mono ${
                          attempt.scoreDelta > 0 ? 'bg-emerald-100 text-emerald-800' : attempt.scoreDelta === 0 ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'
                        }`}>
                          {attempt.scoreDelta > 0 ? `▲ +${attempt.scoreDelta}đ` : attempt.scoreDelta === 0 ? '― 0đ' : `▼ ${attempt.scoreDelta}đ`}
                        </span>
                      </div>
                    )}
                    {attempt.isPersonalBest && (
                      <div className="mt-1.5 flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-100/80 px-2 py-0.5 rounded-md border border-amber-200">
                        <TrophyIcon className="w-3 h-3 text-amber-600" /> Kỷ lục cá nhân mới!
                      </div>
                    )}
                  </div>

                  <p className="text-[11px] text-[var(--sumi-muted)] font-sans leading-relaxed line-clamp-2">
                    {attempt.progressSummary}
                  </p>
                </div>
                <div className="pt-2 border-t border-[var(--line)]/50 mt-2 flex items-center justify-end">
                  <span className="text-[10px] text-[var(--sumi-faint)] font-mono">Phiên #{attempt.attemptNumber}</span>
                </div>
              </div>

              {/* Tile 2: Quẻ Vận Omikuji Shinto Truyền Thống & Lời Sấm Sư Phạm */}
              <OmikujiFortuneCard
                score={result.overallScore}
                scenarioTitle={result.scenarioTitle}
                className="h-full"
              />

              {/* Tile 3: Mức độ hòa hợp & Ấn tượng đối thoại từ nhân vật */}
              <div className="flex flex-col justify-between rounded-3xl border border-indigo-200/80 bg-gradient-to-br from-indigo-50/50 via-white to-sky-50/40 p-5 shadow-xs transition hover:border-indigo-300 hover:shadow-sm">
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2 min-w-0 max-w-[calc(100%-80px)]">
                      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 to-sky-500 text-white text-base shadow-2xs shrink-0">
                        <CheckCircleIcon className="w-4 h-4 text-white" />
                      </div>
                      <div className="min-w-0 truncate">
                        <h3 className="text-xs font-bold text-indigo-950 font-sans truncate">
                          Ấn tượng đối thoại
                        </h3>
                        <p className="text-[10px] text-indigo-700/80 truncate">
                          {result.aiPersona || 'Đối tác hội thoại'}
                        </p>
                      </div>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold shrink-0 whitespace-nowrap ${
                      result.overallScore >= 80
                        ? 'bg-emerald-100 text-emerald-800'
                        : result.overallScore >= 60
                        ? 'bg-sky-100 text-sky-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}>
                      {result.overallScore >= 80 ? 'Thiện cảm cao' : result.overallScore >= 60 ? 'Thuận lợi' : 'Cần trau chuốt'}
                    </span>
                  </div>

                  <div className="mb-2">
                    <span className="inline-block rounded-full bg-indigo-100 text-indigo-900 px-2.5 py-0.5 text-[11px] font-bold border border-indigo-200 mb-1">
                      {result.npcRelationshipTitle || (
                        result.overallScore >= 80
                          ? 'Giao tiếp chuẩn mực · Lịch thiệp'
                          : result.overallScore >= 60
                          ? 'Đàm thoại trôi chảy · Hiểu ý'
                          : 'Đôi chỗ ngập ngừng · Cần rèn thêm'
                      )}
                    </span>
                    <p className="text-[11px] text-[var(--sumi)] font-medium leading-relaxed">
                      {(() => {
                        const persona = (result.aiPersona || '').toLowerCase();
                        if (persona.includes('quán') || persona.includes('店員') || persona.includes('nhân viên')) {
                          return result.overallScore >= 75
                            ? 'Nhân viên phục vụ rất hài lòng với cách gọi món nhanh nhẹn và đúng quy tắc của bạn.'
                            : 'Nhân viên cơ bản đã hiểu ý bạn, hãy chú ý nói rõ trợ từ và số lượng hơn nhé.';
                        }
                        if (persona.includes('ga') || persona.includes('駅員')) {
                          return result.overallScore >= 75
                            ? 'Nhân viên nhà ga nắm bắt yêu cầu tức thì, hướng dẫn lộ trình thuận lợi.'
                            : 'Nhân viên nhà ga cần hỏi lại một số thông tin để xác nhận đúng tuyến tàu.';
                        }
                        if (persona.includes('phỏng vấn') || persona.includes('面接') || persona.includes('quản lý')) {
                          return result.overallScore >= 75
                            ? 'Người phỏng vấn đánh giá cao thái độ lễ độ, dùng từ khiêm nhường chuẩn mực.'
                            : 'Cần chú ý duy trì thể lịch sự Desu/Masu và tự tin mở rộng ý trả lời hơn.';
                        }
                        return 'Đối phương cảm thấy cuộc trò chuyện diễn ra tự nhiên, hiểu rõ thông điệp bạn truyền tải.';
                      })()}
                    </p>
                  </div>
                </div>

                <div className="pt-2 border-t border-indigo-100">
                  <div className="flex items-center justify-between text-[10px] text-indigo-800 font-medium mb-1">
                    <span>Độ hòa hợp & thông suốt (Rapport)</span>
                    <span className="font-extrabold font-mono text-indigo-950">
                      {Math.min(100, (result.npcAffinityScore || Math.round(result.overallScore * 0.95)))}%
                    </span>
                  </div>
                  <div className="w-full h-2 bg-indigo-100 rounded-full overflow-hidden p-0.5 border border-indigo-200">
                    <div
                      className="h-full bg-gradient-to-r from-indigo-500 to-teal-500 rounded-full transition-all duration-1000 ease-out"
                      style={{ width: `${Math.min(100, (result.npcAffinityScore || Math.round(result.overallScore * 0.95)))}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Structured AI Feedback Section */}

        {(() => {
          const rawText = result.generalFeedbackText || "";

          // Regex extract các phần phản hồi đã được chuẩn hóa

          const strengthsMatch = rawText.match(
            /Điểm làm tốt:\s*([^.]+(?:\.[^.]+)*?)(?=\s*(?:Điểm cần cải thiện:|Cách diễn đạt tự nhiên hơn:|Nhận xét theo lượt:|Độ trôi chảy & Phát âm:|$))/i,
          );

          const improvementsMatch = rawText.match(
            /Điểm cần cải thiện:\s*([^.]+(?:\.[^.]+)*?)(?=\s*(?:Cách diễn đạt tự nhiên hơn:|Nhận xét theo lượt:|Điểm làm tốt:|Độ trôi chảy & Phát âm:|$))/i,
          );

          const naturalAltMatch = rawText.match(
            /Cách diễn đạt tự nhiên hơn:\s*([^.]+(?:\.[^.]+)*?)(?=\s*(?:Nhận xét theo lượt:|Điểm làm tốt:|Điểm cần cải thiện:|Độ trôi chảy & Phát âm:|$))/i,
          );

          const turnsMatch = rawText.match(
            /Nhận xét theo lượt:\s*([^.]+(?:\.[^.]+)*?)(?=\s*(?:Điểm làm tốt:|Điểm cần cải thiện:|Cách diễn đạt tự nhiên hơn:|Độ trôi chảy & Phát âm:|$))/i,
          );

          const deliveryMatch = rawText.match(
            /Độ trôi chảy & Phát âm:\s*([^.]+(?:\.[^.]+)*?)(?=\s*(?:Điểm làm tốt:|Điểm cần cải thiện:|Cách diễn đạt tự nhiên hơn:|Nhận xét theo lượt:|$))/i,
          );

          const strengthsText = strengthsMatch
            ? strengthsMatch[1].trim()
            : null;

          const improvementsText = improvementsMatch
            ? improvementsMatch[1].trim()
            : null;

          const naturalAltText = naturalAltMatch
            ? naturalAltMatch[1].trim()
            : null;

          const turnsText = turnsMatch ? turnsMatch[1].trim() : null;

          const deliveryText = deliveryMatch ? deliveryMatch[1].trim() : null;

          // Phần text nhận xét tổng quát (câu đầu tiên trước các tiêu đề phân loại)

          const firstSection =
            rawText
              .split(
                /(?:Nhận xét theo lượt:|Điểm làm tốt:|Điểm cần cải thiện:|Cách diễn đạt tự nhiên hơn:|Độ trôi chảy & Phát âm:)/i,
              )[0]
              ?.trim() || rawText;

          return (
            <div className="mt-6 grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
              <div className="space-y-5">
                {/* Tổng quan */}

                <article className="rounded-3xl border border-[var(--line)] bg-[var(--paper-50)]/90 backdrop-blur-xs p-6 sm:p-7 shadow-xs">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--ai)] font-sans">
                    <SparkIcon className="w-4 h-4 text-[var(--ai)]" />
                    <span>Đánh giá từ AI Persona</span>
                  </div>

                  <h2 className="mt-2 text-xl sm:text-2xl font-black text-[var(--sumi)] font-sans">
                    Nhận xét tổng quan
                  </h2>

                  <p className="mt-3 text-sm sm:text-base leading-relaxed text-[var(--sumi-muted)] whitespace-pre-wrap break-words font-sans">
                    {firstSection}
                  </p>

                  {/* Nhận xét theo từng lượt nói (nếu có) */}

                  {turnsText && (
                    <div className="mt-4 rounded-2xl border border-[var(--ai)]/20 bg-[var(--ai-soft)]/50 p-3.5 text-xs text-[var(--sumi)]">
                      <div className="font-bold text-[var(--ai)] flex items-center gap-1.5 mb-1 font-sans">
                        <span>Chi tiết các lượt nói</span>
                      </div>

                      <p className="leading-relaxed text-[var(--sumi-muted)] font-sans">
                        {turnsText}
                      </p>
                    </div>
                  )}
                </article>

                {/* Điểm làm tốt & Điểm cần cải thiện (2 cột hoặc thẻ) */}

                {(strengthsText || improvementsText) && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {strengthsText && (
                      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5 shadow-xs">
                        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-800 font-sans">
                          <span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-500 text-white text-[10px]">
                            ✓
                          </span>

                          <span>Điểm làm tốt</span>
                        </div>

                        <p className="mt-2.5 text-xs sm:text-sm leading-relaxed text-emerald-950 font-medium break-words font-sans">
                          {strengthsText}
                        </p>
                      </div>
                    )}

                    {improvementsText && (
                      <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-5 shadow-xs">
                        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-800 font-sans">
                          <span className="grid h-5 w-5 place-items-center rounded-full bg-amber-500 text-white text-[10px]">
                            !
                          </span>

                          <span>Cần cải thiện</span>
                        </div>

                        <p className="mt-2.5 text-xs sm:text-sm leading-relaxed text-amber-950 font-medium break-words font-sans">
                          {improvementsText}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Đánh giá Độ trôi chảy & Phát âm */}

                {deliveryText && (
                  <div className="rounded-2xl border border-purple-200 bg-purple-50/60 p-5 shadow-xs">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-purple-800 font-sans">
                      <span>Độ trôi chảy & Phát âm</span>
                    </div>

                    <p className="mt-2.5 text-xs sm:text-sm leading-relaxed text-purple-950 font-medium break-words font-sans">
                      {deliveryText}
                    </p>
                  </div>
                )}

                {/* Gợi ý diễn đạt tự nhiên hơn (Native Phrasing Recommendation) */}

                {naturalAltText &&
                  (() => {
                    const alternatives = naturalAltText

                      .split(" | ")

                      .map((item) => item.trim())

                      .filter(Boolean);

                    return (
                      <div className="rounded-3xl border border-[var(--ai)]/30 bg-gradient-to-r from-blue-50/80 to-indigo-50/60 p-5 shadow-xs">
                        <div className="flex items-center justify-between gap-2 mb-3">
                          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--ai)] font-sans">
                            <span>Cách nói tự nhiên của người bản xứ</span>
                          </div>

                          <span className="text-[11px] font-semibold text-[var(--sumi-muted)] font-mono">
                            {alternatives.length} gợi ý diễn đạt
                          </span>
                        </div>

                        <div className="space-y-2.5">
                          {alternatives.map((alt, idx) => (
                            <div
                              key={idx}

                              className="group flex items-center justify-between gap-3 rounded-2xl border border-blue-100/70 bg-white/95 p-3.5 shadow-2xs transition hover:border-[var(--ai)]/40 hover:bg-white"
                            >
                              <p className="text-sm sm:text-base font-bold text-[var(--sumi)] leading-relaxed break-words font-jp">
                                {alt}
                              </p>

                              <button
                                type="button"
                                onClick={() => playJapaneseAudio(alt)}
                                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--paper-100)] text-xs text-[var(--ai)] transition hover:bg-[var(--ai)] hover:text-white active:scale-95 cursor-pointer"
                                title="Nghe phát âm bản xứ"
                                aria-label="Nghe phát âm bản xứ"
                              >
                                <svg className="w-3.5 h-3.5 text-current" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                                </svg>
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                <p className="text-[11px] leading-5 text-[var(--sumi-faint)] italic">
                  * Nhận xét AI chỉ nhằm hỗ trợ học tập, rèn luyện phản xạ và
                  không thay thế kết quả thi chứng chỉ JLPT chính thức.
                </p>
              </div>

              {/* Aside: Nhiệm vụ kịch bản (Đầy đủ cả Đạt & Chưa đạt) */}

              <aside className="h-fit rounded-3xl border border-[var(--line)] bg-[var(--paper-50)]/90 backdrop-blur-xs p-6 sm:p-7 shadow-xs">
                <p className="text-xs font-bold uppercase tracking-wider text-[var(--ai)] font-sans">
                  Nhiệm vụ kịch bản
                </p>

                <div className="mt-2 flex items-baseline justify-between">
                  <h2 className="text-2xl font-black text-[var(--sumi)] font-mono">
                    {result.allMissions && result.allMissions.length > 0
                      ? `${result.completedMissions.length} / ${result.allMissions.length}`
                      : `${result.completedMissions.length}`}{" "}
                    mục tiêu
                  </h2>

                  <span
                    className={`text-xs font-bold font-sans ${
                      result.passStatus ? "text-emerald-600" : "text-amber-600"
                    }`}
                  >
                    {result.passStatus
                      ? "✓ Hoàn thành xuất sắc"
                      : "Chưa hoàn tất hết"}
                  </span>
                </div>

                {/* Thanh tiến độ */}

                {result.allMissions && result.allMissions.length > 0 && (
                  <div className="mt-3">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--paper-200)]">
                      <div
                        className="h-full bg-gradient-to-r from-[var(--ai)] to-[var(--nami)] transition-all duration-500 rounded-full"

                        style={{
                          width: `${Math.round(
                            (result.completedMissions.length /
                              result.allMissions.length) *
                              100,
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                )}

                <ul className="mt-5 space-y-3">
                  {result.allMissions && result.allMissions.length > 0 ? (
                    result.allMissions.map((mission) => (
                      <li
                        key={mission.missionId}

                        className={`flex gap-3 rounded-2xl p-3.5 text-xs sm:text-sm font-semibold border transition ${
                          mission.isCompleted
                            ? "bg-emerald-50/70 text-emerald-900 border-emerald-200 shadow-2xs"
                            : "bg-white text-[var(--sumi-muted)] border-[var(--line)]"
                        }`}
                      >
                        <span
                          className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold ${
                            mission.isCompleted
                              ? "bg-emerald-500 text-white"
                              : "bg-[var(--paper-200)] text-[var(--sumi-faint)]"
                          }`}
                        >
                          {mission.isCompleted ? "✓" : mission.order}
                        </span>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1">
                            <span className="min-w-0 break-words leading-relaxed">
                              {mission.content}
                            </span>

                            <span
                              className={`shrink-0 text-[10px] font-bold ${
                                mission.isCompleted
                                  ? "text-emerald-700"
                                  : "text-[var(--sumi-faint)]"
                              }`}
                            >
                              {mission.isCompleted ? "Đã đạt" : "Chưa đạt"}
                            </span>
                          </div>


                        </div>
                      </li>
                    ))
                  ) : result.completedMissions.length > 0 ? (
                    result.completedMissions.map((mission) => (
                      <li
                        key={mission.missionId}

                        className="flex gap-3 rounded-2xl bg-emerald-50/70 p-3.5 text-xs sm:text-sm font-semibold text-emerald-900 border border-emerald-200 shadow-2xs"
                      >
                        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-500 text-[10px] text-white">
                          ✓
                        </span>

                        <span className="min-w-0 break-words leading-relaxed">
                          {mission.title}
                        </span>
                      </li>
                    ))
                  ) : (
                    <li className="rounded-2xl bg-white p-4 text-xs sm:text-sm leading-relaxed text-[var(--sumi-faint)] border border-[var(--line)]">
                      Phiên này chưa ghi nhận nhiệm vụ hoàn thành.
                    </li>
                  )}
                </ul>
              </aside>
            </div>
          );
        })()}

        {/* ============================================================ */}

        {/* LỘ TRÌNH CỦNG CỐ THÍCH ỨNG (ADAPTIVE REINFORCEMENT PATH)     */}
        {/* ============================================================ */}
        {result && (
          Boolean(result.weakVocabularies?.length) ||
          Boolean(result.weakGrammars?.length) ||
          Boolean(result.recommendedShadowingDialogues?.length) ||
          (Array.isArray(result.weakVocabularies) && Array.isArray(result.weakGrammars))
        ) && (() => {
          const weakVocabs = result.weakVocabularies || [];
          const weakGrammars = result.weakGrammars || [];
          const recommendedShadowing = result.recommendedShadowingDialogues || [];
          const totalWeakCount = weakVocabs.length + weakGrammars.length;

          return (
            <section className="mt-6 rounded-3xl border border-[var(--line)] bg-[var(--paper-50)]/90 backdrop-blur-xs p-6 sm:p-7 shadow-xs">
              {/* Header */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[var(--line)] pb-5">
                <div className="flex items-start gap-3.5">
                  <div className="w-11 h-11 rounded-2xl bg-[var(--ai-soft)] text-[var(--ai)] border border-[var(--ai)]/20 flex items-center justify-center shrink-0 shadow-2xs">
                    <SparklesIcon className="w-5 h-5 text-[var(--ai)]" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--ai)] font-sans">
                        Lộ trình củng cố thích ứng
                      </span>
                      <span className="text-xs font-serif text-[var(--sumi-muted)] tracking-wide">
                        適応型補強ルート · Adaptive Reinforcement Path
                      </span>
                    </div>
                    <h3 className="text-base sm:text-lg font-bold text-[var(--sumi)] font-sans mt-0.5">
                      Trọng tâm cần rèn luyện & Bài đối ứng Shadowing
                    </h3>
                    <p className="mt-1 text-xs text-[var(--sumi-muted)] leading-relaxed max-w-2xl font-sans">
                      Thuật toán AI tự động nhận diện từ vựng ngập ngừng, mẫu câu chưa hoàn chỉnh từ dữ liệu đối thoại thực tế và kết nối bài luyện Shadowing phù hợp.
                    </p>
                  </div>
                </div>

                {/* Batch Action: Lưu toàn bộ điểm yếu vào Flashcards */}
                {totalWeakCount > 0 && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={handleSaveAllWeakPointsToFlashcards}
                      disabled={isAllWeakSaved}
                      className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all duration-200 active:scale-95 shadow-2xs cursor-pointer font-sans ${
                        isAllWeakSaved
                          ? "bg-emerald-600 text-white"
                          : "border border-[var(--ai)]/30 bg-[var(--ai-soft)] text-[var(--ai)] hover:bg-[var(--ai)] hover:text-white"
                      }`}
                    >
                      {isAllWeakSaved ? (
                        <>
                          <CheckIcon className="w-3.5 h-3.5" />
                          <span>Đã lưu tất cả vào Flashcards</span>
                        </>
                      ) : (
                        <>
                          <BookmarkIcon className="w-3.5 h-3.5" />
                          <span>Lưu toàn bộ điểm yếu ({totalWeakCount}) vào Flashcards (FSRS)</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>

              {/* Bento-Box 2 Columns */}
              <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Column 1: Weak Vocab & Grammar Grid (60% ~ lg:col-span-7) */}
                <div className="lg:col-span-7 space-y-6">
                  {totalWeakCount === 0 ? (
                    /* Empty State: Wabi-Sabi Card with Hanko Seal 見事 */
                    <div className="rounded-2xl border border-emerald-200/80 bg-gradient-to-r from-emerald-50/70 via-white to-teal-50/40 p-6 sm:p-8 text-center flex flex-col items-center justify-center">
                      <div className="w-14 h-14 rounded-2xl border-2 border-[var(--shu)] bg-[var(--shu-soft)] text-[var(--shu)] font-serif font-black text-xl mx-auto flex items-center justify-center shadow-xs select-none mb-3">
                        見事
                      </div>
                      <span className="text-[11px] font-serif text-[var(--sumi-muted)] tracking-widest block">
                        完璧な表現力 · Perfect Execution
                      </span>
                      <h4 className="text-sm sm:text-base font-bold text-[var(--sumi)] font-sans mt-1">
                        Xuất sắc! Không phát hiện điểm yếu từ vựng hoặc ngữ pháp
                      </h4>
                      <p className="mt-2 text-xs text-[var(--sumi-muted)] leading-relaxed max-w-md font-sans">
                        Bạn đã vận dụng chuẩn xác và tự nhiên toàn bộ từ vựng và cấu trúc ngữ pháp mục tiêu trong phiên đối thoại này. Hệ thống đề xuất các bài luyện Shadowing đối ứng để bạn tiếp tục mài giũa phản xạ và ngữ điệu tự nhiên.
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* Weak Vocabularies */}
                      {weakVocabs.length > 0 && (
                        <div>
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="text-xs font-bold text-[var(--sumi)] uppercase tracking-wider font-sans flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                              Từ vựng cần củng cố ({weakVocabs.length})
                            </h4>
                            <span className="text-[11px] font-serif text-[var(--sumi-faint)]">
                              要復習単語
                            </span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {weakVocabs.map((vocab) => {
                              const isSaved = savedWeakVocabIds.has(vocab.id);
                              const isNeedsPractice =
                                vocab.status === "NeedsPractice" ||
                                vocab.masteryScore <= 50;
                              return (
                                <div
                                  key={vocab.id}
                                  className="rounded-2xl border border-[var(--line)] bg-white p-3.5 shadow-2xs hover:border-[var(--ai)]/30 transition-all flex flex-col justify-between"
                                >
                                  <div>
                                    <div className="flex items-start justify-between gap-2">
                                      <div>
                                        {vocab.reading ? (
                                          <ruby className="font-bold text-[var(--sumi)] font-jp text-base leading-snug">
                                            {vocab.word}
                                            <rt className="text-[10px] text-[var(--ai)] font-medium select-none block">
                                              {vocab.reading}
                                            </rt>
                                          </ruby>
                                        ) : (
                                          <span className="font-bold text-[var(--sumi)] font-jp text-base leading-snug">
                                            {vocab.word}
                                          </span>
                                        )}
                                      </div>
                                      <span
                                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold shrink-0 font-sans ${
                                          isNeedsPractice
                                            ? "border border-amber-200/80 bg-amber-50 text-amber-900"
                                            : "border border-stone-200 bg-stone-100 text-stone-700"
                                        }`}
                                      >
                                        {isNeedsPractice
                                          ? `Cần ôn tập (${vocab.masteryScore}đ)`
                                          : `Chưa vận dụng (${vocab.masteryScore}đ)`}
                                      </span>
                                    </div>
                                    <p className="mt-1 text-xs font-medium text-[var(--sumi-muted)] font-sans">
                                      {cleanPedagogicMeaning(vocab.meaning)}
                                    </p>
                                    {vocab.reason && (
                                      <p className="mt-1 text-[11px] text-[var(--sumi-faint)] italic font-sans leading-tight">
                                        {vocab.reason}
                                      </p>
                                    )}
                                  </div>
                                  <div className="mt-3 pt-2.5 border-t border-[var(--line)]/60 flex items-center justify-between gap-2">
                                    <button
                                      type="button"
                                      onClick={() => playJapaneseAudio(vocab.word)}
                                      className="inline-flex h-7 px-2.5 items-center gap-1 rounded-xl border border-[var(--line)] bg-[var(--paper-100)] text-xs text-[var(--ai)] transition hover:bg-[var(--ai)] hover:text-white active:scale-95 cursor-pointer font-sans"
                                      title={`Nghe phát âm ${vocab.word}`}
                                      aria-label={`Nghe phát âm ${vocab.word}`}
                                    >
                                      <VolumeIcon className="w-3 h-3 text-current" />
                                      <span className="text-[11px] font-semibold">Phát âm</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleToggleWeakVocabBookmark(vocab)}
                                      className={`inline-flex h-7 px-2.5 items-center gap-1 rounded-xl border text-xs font-semibold transition active:scale-95 cursor-pointer font-sans ${
                                        isSaved
                                          ? "border-emerald-300 bg-emerald-50 text-emerald-700 shadow-2xs"
                                          : "border-[var(--line)] bg-[var(--paper-100)] text-[var(--sumi-muted)] hover:bg-white hover:text-[var(--ai)] hover:border-[var(--ai)]/40"
                                      }`}
                                      title="Lưu từ vựng vào Flashcard FSRS"
                                    >
                                      {isSaved ? (
                                        <>
                                          <CheckIcon className="w-3 h-3 text-emerald-600" />
                                          <span className="text-[11px]">Đã lưu</span>
                                        </>
                                      ) : (
                                        <>
                                          <BookmarkIcon className="w-3 h-3" />
                                          <span className="text-[11px]">Lưu Flashcard</span>
                                        </>
                                      )}
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Weak Grammars */}
                      {weakGrammars.length > 0 && (
                        <div>
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="text-xs font-bold text-[var(--sumi)] uppercase tracking-wider font-sans flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                              Cấu trúc ngữ pháp cần lưu ý ({weakGrammars.length})
                            </h4>
                            <span className="text-[11px] font-serif text-[var(--sumi-faint)]">
                              要復習文法
                            </span>
                          </div>
                          <div className="space-y-3">
                            {weakGrammars.map((grammar) => {
                              const isSaved = savedWeakGrammarIds.has(grammar.id);
                              const isNeedsPractice =
                                grammar.status === "NeedsPractice" ||
                                grammar.masteryScore <= 50;
                              return (
                                <div
                                  key={grammar.id}
                                  className="rounded-2xl border border-[var(--line)] bg-white p-4 shadow-2xs hover:border-[var(--ai)]/30 transition-all"
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div>
                                      <span className="font-bold text-[var(--ai)] text-sm font-mono block">
                                        {grammar.pattern}
                                      </span>
                                      <p className="text-xs font-medium text-[var(--sumi-muted)] font-sans mt-0.5">
                                        {cleanPedagogicMeaning(grammar.meaning)}
                                      </p>
                                    </div>
                                    <span
                                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold shrink-0 font-sans ${
                                        isNeedsPractice
                                          ? "border border-amber-200/80 bg-amber-50 text-amber-900"
                                          : "border border-stone-200 bg-stone-100 text-stone-700"
                                      }`}
                                    >
                                      {isNeedsPractice
                                        ? `Cần ôn tập (${grammar.masteryScore}đ)`
                                        : `Chưa vận dụng (${grammar.masteryScore}đ)`}
                                    </span>
                                  </div>
                                  {grammar.exampleSentence && (
                                    <div className="mt-2.5 rounded-xl border-l-2 border-[var(--ai)]/40 bg-[var(--paper-100)]/60 px-3 py-2 text-xs text-[var(--sumi)] font-jp">
                                      <span className="text-[10px] font-bold text-[var(--sumi-faint)] block mb-0.5 font-sans">
                                        Ví dụ mẫu:
                                      </span>
                                      <span>{grammar.exampleSentence}</span>
                                    </div>
                                  )}
                                  {grammar.reason && (
                                    <p className="mt-2 text-[11px] text-[var(--sumi-faint)] italic font-sans leading-tight">
                                      {grammar.reason}
                                    </p>
                                  )}
                                  <div className="mt-3 pt-2.5 border-t border-[var(--line)]/60 flex items-center justify-between gap-2">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        playJapaneseAudio(
                                          grammar.exampleSentence || grammar.pattern,
                                        )
                                      }
                                      className="inline-flex h-7 px-2.5 items-center gap-1 rounded-xl border border-[var(--line)] bg-[var(--paper-100)] text-xs text-[var(--ai)] transition hover:bg-[var(--ai)] hover:text-white active:scale-95 cursor-pointer font-sans"
                                      title="Nghe câu mẫu ngữ pháp"
                                    >
                                      <VolumeIcon className="w-3 h-3 text-current" />
                                      <span className="text-[11px] font-semibold">Nghe câu mẫu</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleToggleWeakGrammarBookmark(grammar)}
                                      className={`inline-flex h-7 px-2.5 items-center gap-1 rounded-xl border text-xs font-semibold transition active:scale-95 cursor-pointer font-sans ${
                                        isSaved
                                          ? "border-emerald-300 bg-emerald-50 text-emerald-700 shadow-2xs"
                                          : "border-[var(--line)] bg-[var(--paper-100)] text-[var(--sumi-muted)] hover:bg-white hover:text-[var(--ai)] hover:border-[var(--ai)]/40"
                                      }`}
                                      title="Lưu ngữ pháp vào Flashcard FSRS"
                                    >
                                      {isSaved ? (
                                        <>
                                          <CheckIcon className="w-3 h-3 text-emerald-600" />
                                          <span className="text-[11px]">Đã lưu</span>
                                        </>
                                      ) : (
                                        <>
                                          <BookmarkIcon className="w-3 h-3" />
                                          <span className="text-[11px]">Lưu Flashcard</span>
                                        </>
                                      )}
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Column 2: Recommended Shadowing Dialogues (40% ~ lg:col-span-5) */}
                <div className="lg:col-span-5 space-y-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-bold text-[var(--sumi)] uppercase tracking-wider font-sans flex items-center gap-1.5">
                      <HeadphonesIcon className="w-3.5 h-3.5 text-[var(--ai)]" />
                      Bài luyện Shadowing đối ứng ({recommendedShadowing.length})
                    </h4>
                    <span className="text-[11px] font-serif text-[var(--sumi-faint)]">
                      連動シャドーイング
                    </span>
                  </div>

                  {recommendedShadowing.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-[var(--line)] p-6 text-center text-xs text-[var(--sumi-muted)] font-sans">
                      <p>Chưa có bài luyện Shadowing đối ứng cho phiên này.</p>
                      <div className="mt-3">
                        <Link
                          to="/shadowing"
                          className="inline-flex items-center gap-1 text-[var(--ai)] font-semibold hover:underline"
                        >
                          <BookOpenIcon className="w-3.5 h-3.5" />
                          <span>Khám phá thư viện Shadowing</span>
                        </Link>
                      </div>
                    </div>
                  ) : (
                    recommendedShadowing.map((dialogue) => (
                      <div
                        key={dialogue.id}
                        className="rounded-2xl border border-[var(--line)] bg-gradient-to-b from-white to-[var(--paper-100)]/40 p-5 shadow-2xs hover:shadow-md hover:border-[var(--ai)]/40 transition-all duration-300 group"
                      >
                        <div className="flex items-center justify-between gap-2 flex-wrap mb-2.5">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-black font-mono bg-emerald-50 text-emerald-800 border border-emerald-200">
                              JLPT {dialogue.jlptLevel || "N5"}
                            </span>
                            <span className="text-[11px] font-medium text-[var(--sumi-faint)] font-mono">
                              {dialogue.sentencesCount} câu thoại
                            </span>
                          </div>
                          <span className="inline-flex items-center gap-1 bg-[var(--ai-soft)] text-[var(--ai)] border border-[var(--ai)]/20 px-2.5 py-0.5 rounded-full text-xs font-bold font-mono">
                            <TargetIcon className="w-3 h-3 text-[var(--ai)]" />
                            {dialogue.score}% tương thích
                          </span>
                        </div>

                        <h4 className="text-sm sm:text-base font-bold text-[var(--sumi)] font-sans group-hover:text-[var(--ai)] transition">
                          {dialogue.title}
                        </h4>

                        {dialogue.matchReason && (
                          <div className="mt-2.5 bg-[var(--paper-100)] p-2.5 rounded-xl border border-[var(--line)]/60 text-[11px] text-[var(--sumi-muted)] flex items-start gap-1.5 leading-relaxed font-sans">
                            <CompassIcon className="w-3.5 h-3.5 text-[var(--ai)] shrink-0 mt-0.5" />
                            <span>{dialogue.matchReason}</span>
                          </div>
                        )}

                        <div className="mt-4 flex items-center gap-2">
                          <Link
                            to={`/shadowing/practice/${dialogue.id}?return=${encodeURIComponent(location.pathname)}`}
                            className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--ai)] hover:bg-[var(--ai-hover)] text-white px-4 py-2.5 text-xs font-bold transition active:scale-95 shadow-sm group-hover:shadow-md cursor-pointer font-sans"
                          >
                            <HeadphonesIcon className="w-3.5 h-3.5 text-white" />
                            <span>Luyện Shadowing ngay</span>
                            <ChevronRightIcon className="w-3.5 h-3.5 text-white/80 transition-transform group-hover:translate-x-0.5" />
                          </Link>
                          <Link
                            to={`/shadowing/${dialogue.id}`}
                            className="inline-flex items-center justify-center rounded-xl border border-[var(--line)] bg-white hover:bg-[var(--paper-100)] text-[var(--sumi-muted)] hover:text-[var(--ai)] px-3 py-2.5 text-xs font-semibold transition active:scale-95 shadow-2xs font-sans"
                            title="Xem chi tiết bài đọc"
                          >
                            <BookOpenIcon className="w-3.5 h-3.5" />
                          </Link>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </section>
          );
        })()}

        {/* ============================================================ */}

        {/* CONVERSATION TRANSCRIPT REVIEW (XEM LẠI ĐỐI THOẠI CHI TIẾT)  */}

        {/* ============================================================ */}

        {result.messages && result.messages.length > 0 && (
          <section className="mt-6 rounded-3xl border border-[var(--line)] bg-[var(--paper-50)]/90 backdrop-blur-xs p-6 sm:p-7 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] pb-4">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--ai)] font-sans">
                <span>Chi tiết toàn bộ đoạn hội thoại</span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-[var(--sumi-faint)] font-mono mr-1">
                  {result.messages.length} lượt thoại
                </span>

                {isTranscriptOpen && (
                  <div className="flex items-center gap-1.5 border-r border-[var(--line)] pr-2">
                    <button
                      type="button"
                      onClick={handleExpandAllTurns}
                      className="rounded-lg border border-[var(--line)] bg-white px-2 py-0.5 text-[11px] font-semibold text-[var(--sumi-muted)] hover:text-[var(--ai)] hover:border-[var(--ai)] active:scale-95 transition font-sans cursor-pointer shadow-2xs"
                      title="Mở toàn bộ đánh giá ngôn ngữ chi tiết của tất cả các câu"
                    >
                      Mở tất cả đánh giá
                    </button>
                    <button
                      type="button"
                      onClick={handleCollapseAllTurns}
                      className="rounded-lg border border-[var(--line)] bg-white px-2 py-0.5 text-[11px] font-semibold text-[var(--sumi-muted)] hover:text-[var(--ai)] hover:border-[var(--ai)] active:scale-95 transition font-sans cursor-pointer shadow-2xs"
                      title="Thu gọn đánh giá về dạng danh sách tinh giản mặc định"
                    >
                      Thu gọn tất cả
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setIsTranscriptOpen(!isTranscriptOpen)}
                  className="rounded-xl border border-[var(--line)] bg-white px-3 py-1 text-xs font-semibold text-[var(--sumi-muted)] hover:bg-[var(--paper-100)] active:scale-95 transition shadow-2xs font-sans cursor-pointer"
                >
                  {isTranscriptOpen ? "Thu gọn đoạn thoại ▲" : "Mở rộng đoạn thoại ▼"}
                </button>
              </div>
            </div>

            {isTranscriptOpen && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)]/60 pb-3">
                <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-[var(--paper-100)] border border-[var(--line)] font-sans">
                  <button
                    type="button"
                    onClick={() => handleSetTurnFilter('all')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition active:scale-95 cursor-pointer ${
                      turnFilter === 'all'
                        ? 'bg-white text-[var(--sumi)] shadow-2xs border border-[var(--line)]'
                        : 'text-[var(--sumi-muted)] hover:text-[var(--sumi)]'
                    }`}
                  >
                    <span>Tất cả</span>
                    <span className="px-1.5 py-0.2 rounded-md bg-[var(--paper-200)] text-[10px] font-mono">
                      {turnCounts.total}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSetTurnFilter('good')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition active:scale-95 cursor-pointer ${
                      turnFilter === 'good'
                        ? 'bg-emerald-500 text-white shadow-2xs'
                        : 'text-emerald-700 hover:bg-emerald-50'
                    }`}
                  >
                    <span>✓ Đạt chuẩn</span>
                    <span className={`px-1.5 py-0.2 rounded-md text-[10px] font-mono ${turnFilter === 'good' ? 'bg-emerald-600 text-white' : 'bg-emerald-100 text-emerald-800'}`}>
                      {turnCounts.good}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSetTurnFilter('warning')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition active:scale-95 cursor-pointer ${
                      turnFilter === 'warning'
                        ? 'bg-amber-500 text-white shadow-2xs'
                        : 'text-amber-800 hover:bg-amber-50'
                    }`}
                  >
                    <span>⚠ Cần lưu ý</span>
                    <span className={`px-1.5 py-0.2 rounded-md text-[10px] font-mono ${turnFilter === 'warning' ? 'bg-amber-600 text-white' : 'bg-amber-100 text-amber-900'}`}>
                      {turnCounts.warning}
                    </span>
                  </button>
                </div>

                <p className="text-[11px] text-[var(--sumi-faint)] italic font-sans hidden sm:block">
                  {turnFilter === 'warning'
                    ? 'Đang lọc các lượt nói có lỗi hoặc điểm cần cải thiện'
                    : turnFilter === 'good'
                      ? 'Đang hiển thị các câu nói đạt chuẩn tự nhiên'
                      : 'Hiển thị trọn vẹn toàn bộ các lượt đối thoại'}
                </p>
              </div>
            )}

            {isTranscriptOpen && (
              <div className="mt-5 space-y-4">
                {result.messages
                  .filter((msg, index, all) => {
                    if (turnFilter === 'all') return true;
                    const isUser = msg.sender.toLowerCase() === 'user';
                    const feedback = msg.linguisticFeedback;
                    const status = (feedback?.quickStatus || feedback?.status || 'good').toLowerCase();
                    const isWarning = status === 'warning' || status === 'error';
                    const isGood = status === 'good' || status === 'success';

                    if (isUser) {
                      return turnFilter === 'warning' ? isWarning : isGood;
                    }
                    // Nếu là AI message: hiển thị nếu câu user đứng trước nó thỏa mãn bộ lọc
                    const prevMsg = all[index - 1];
                    if (prevMsg && prevMsg.sender.toLowerCase() === 'user') {
                      const pStatus = (prevMsg.linguisticFeedback?.quickStatus || prevMsg.linguisticFeedback?.status || 'good').toLowerCase();
                      return turnFilter === 'warning' ? (pStatus === 'warning' || pStatus === 'error') : (pStatus === 'good' || pStatus === 'success');
                    }
                    return false;
                  })
                  .map((msg, index) => {
                  const isUser = msg.sender.toLowerCase() === "user";

                  const feedback = msg.linguisticFeedback;

                  const status =
                    feedback?.quickStatus || feedback?.status || "good";

                  return (
                    <div
                      key={msg.id || index}

                      className={`flex items-start gap-3 rounded-2xl p-4 transition ${
                        isUser
                          ? "border border-[var(--line)] bg-white shadow-2xs"
                          : "border border-[var(--line)] bg-[var(--ai-soft)]/40 shadow-2xs"
                      }`}
                    >
                      {/* Avatar Icon */}

                      <div
                        className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl text-xs font-bold text-white shadow-xs font-sans ${
                          isUser ? "bg-[var(--sumi)]" : "bg-[var(--ai)]"
                        }`}
                      >
                        {isUser ? "Bạn" : "AI"}
                      </div>

                      {/* Content */}

                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-bold text-[var(--sumi)] font-sans leading-none flex items-center">
                              {isUser ? `Lượt #${Math.floor(index / 2) + 1} · Bạn nói` : "AI phản hồi"}
                            </span>

                            {isUser && feedback && (
                              <span
                                className={`inline-flex items-center leading-none rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                  status.toLowerCase() === "success" ||
                                  status.toLowerCase() === "good"
                                    ? "bg-emerald-100 text-emerald-800 border border-emerald-300/60"
                                    : status.toLowerCase() === "warning"
                                      ? "bg-amber-100 text-amber-800 border border-amber-300/60"
                                      : "bg-red-100 text-red-800 border border-red-300/60"
                                }`}
                              >
                                {status.toLowerCase() === "success" ||
                                status.toLowerCase() === "good"
                                  ? "✓ Rất tốt"
                                  : status.toLowerCase() === "warning"
                                    ? "! Cần chú ý"
                                    : "✕ Cần sửa"}
                              </span>
                            )}

                            {isUser && feedback?.speechDelivery?.turnAutonomyScore != null && feedback.speechDelivery.turnAutonomyScore < 95 && (
                              <span className="rounded-full px-1.5 py-0.2 text-[9px] font-bold bg-amber-300 text-amber-950 font-mono shadow-2xs">
                                {feedback.speechDelivery.turnAutonomyScore}đ Cấp {feedback.speechDelivery.turnAutonomyScore >= 85 ? '1' : feedback.speechDelivery.turnAutonomyScore >= 60 ? '2' : '3'}
                              </span>
                            )}

                            {isUser && feedback?.speechDelivery?.speechConfidence != null && (
                              <span className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-md bg-sky-50 text-sky-800 font-mono text-[10px] border border-sky-200">
                                {Math.round(feedback.speechDelivery.speechConfidence * (feedback.speechDelivery.speechConfidence <= 1 ? 100 : 1))}% rõ
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5">
                            {isUser && feedback && (
                              <button
                                type="button"
                                onClick={() => toggleTurnExpansion(msg.id || index)}
                                className={`inline-flex items-center gap-1 rounded-xl border px-2.5 py-1 text-[11px] font-bold transition active:scale-95 shadow-2xs font-sans cursor-pointer ${
                                  expandedTurnIds.has(msg.id || index)
                                    ? "border-[var(--ai)] bg-[var(--ai)] text-white shadow-xs"
                                    : "border-[var(--ai)]/40 bg-[var(--ai-soft)] text-[var(--ai)] hover:bg-[var(--ai)] hover:text-white"
                                }`}
                                title={expandedTurnIds.has(msg.id || index) ? "Thu gọn đánh giá chi tiết" : "Xem đánh giá chi tiết ngữ pháp, phát âm và câu bản xứ"}
                              >
                                <SparkIcon className="w-3.5 h-3.5 text-amber-500" />
                                <span>{expandedTurnIds.has(msg.id || index) ? "Thu gọn đánh giá ▲" : "Xem đánh giá ▼"}</span>
                              </button>
                            )}



                            {/* Nút dịch nghĩa từng câu */}
                            {msg.vietnameseMeaning && msg.vietnameseMeaning.trim() !== msg.japaneseText.trim() && (
                              <button
                                type="button"
                                onClick={() => {
                                  ukiyoSound.playSubtleTap();
                                  const key = msg.id || index;
                                  setRevealedTranscriptTranslationIds((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(key)) next.delete(key);
                                    else next.add(key);
                                    return next;
                                  });
                                }}
                                className={`inline-flex items-center gap-1 rounded-xl border px-2 py-1 text-[11px] font-semibold transition active:scale-95 cursor-pointer ${
                                  revealedTranscriptTranslationIds.has(msg.id || index)
                                    ? "border-[var(--ai)] bg-[var(--ai)] text-white shadow-2xs font-bold"
                                    : "border-[var(--line)] bg-[var(--paper-100)] text-[var(--sumi-muted)] hover:bg-white hover:text-[var(--ai)]"
                                }`}
                                title={revealedTranscriptTranslationIds.has(msg.id || index) ? "Ẩn dịch tiếng Việt câu này" : "Xem dịch tiếng Việt câu này"}
                              >
                                <span>{revealedTranscriptTranslationIds.has(msg.id || index) ? "Ẩn dịch" : "Dịch"}</span>
                              </button>
                            )}

                            {/* Nút bật/tắt furigana từng câu */}
                            <button
                              type="button"
                              onClick={() => {
                                ukiyoSound.playSubtleTap();
                                const key = msg.id || index;
                                setHiddenTranscriptFuriIds((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(key)) next.delete(key);
                                  else next.add(key);
                                  return next;
                                });
                              }}
                              className={`inline-flex items-center gap-1 rounded-xl border px-2 py-1 text-[11px] font-semibold transition active:scale-95 cursor-pointer ${
                                !hiddenTranscriptFuriIds.has(msg.id || index)
                                  ? "border-[var(--ai)]/50 bg-[var(--ai-soft)] text-[var(--ai)] font-bold shadow-2xs"
                                  : "border-[var(--line)] bg-[var(--paper-100)] text-[var(--sumi-muted)] hover:bg-white hover:text-[var(--ai)]"
                              }`}
                              title={!hiddenTranscriptFuriIds.has(msg.id || index) ? "Ẩn phiên âm Furigana câu này" : "Hiện phiên âm Furigana câu này"}
                            >
                              <span>{!hiddenTranscriptFuriIds.has(msg.id || index) ? "Ẩn Furi" : "Furi"}</span>
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                playJapaneseAudio(
                                  sanitizeDisplayJapanese(msg.japaneseText),
                                )
                              }
                              className="inline-flex items-center gap-1 rounded-xl border border-[var(--line)] bg-[var(--paper-100)] px-2 py-1 text-[11px] font-semibold text-[var(--ai)] transition hover:bg-[var(--ai)] hover:text-white active:scale-95"
                              title="Nghe phát âm câu này"
                            >
                              <span>Nghe</span>
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                handleCopyText(
                                  sanitizeDisplayJapanese(msg.japaneseText),
                                  msg.id,
                                  false,
                                )
                              }
                              className={`inline-flex items-center gap-1 rounded-xl border px-2 py-1 text-[11px] font-semibold transition active:scale-95 ${
                                copiedMessageId === msg.id
                                  ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                                  : "border-[var(--line)] bg-[var(--paper-100)] text-[var(--sumi-muted)] hover:bg-white hover:text-[var(--ai)]"
                              }`}
                              title="Sao chép câu này"
                            >
                              <span>
                                {copiedMessageId === msg.id ? "✓" : ""}
                              </span>
                              <span>
                                {copiedMessageId === msg.id
                                  ? "Đã chép"
                                  : "Chép"}
                              </span>
                            </button>
                          </div>
                        </div>

                        {/* Japanese Utterance (Khử sạch 100% tiếng Việt bị rò rỉ vào câu thoại tiếng Nhật & căn chỉnh Furigana chuẩn xác) */}

                        {msg.furiganaHtml && !hiddenTranscriptFuriIds.has(msg.id || index) ? (
                          <div
                            className="text-sm sm:text-base font-bold text-[var(--sumi)] leading-relaxed break-words font-jp tracking-normal"
                            dangerouslySetInnerHTML={{
                              __html: cleanFuriganaHtml(msg.furiganaHtml),
                            }}
                          />
                        ) : (
                          <p className="text-sm sm:text-base font-bold text-[var(--sumi)] leading-relaxed break-words font-jp tracking-normal">
                            {sanitizeDisplayJapanese(msg.japaneseText)}
                          </p>
                        )}

                        {/* Vietnamese Meaning (Chỉ mở khi bấm nút [Dịch] ở từng câu hoặc [Hiện tất cả dịch]) */}

                        {revealedTranscriptTranslationIds.has(msg.id || index) &&
                          msg.vietnameseMeaning &&
                          msg.vietnameseMeaning.trim() !==
                            msg.japaneseText.trim() && (
                            <div className="mt-1.5 p-2.5 rounded-xl bg-[var(--paper-100)] border border-[var(--line)]/70 text-xs text-[var(--sumi)] leading-relaxed italic animate-fade-in font-sans">
                              <span className="font-semibold not-italic text-[var(--sumi-faint)] mr-1">Dịch nghĩa:</span>
                              <span>{msg.vietnameseMeaning}</span>
                            </div>
                          )}

                        {/* User Feedback Detail (Thu gọn mặc định: chỉ mở khi học viên bấm [Xem đánh giá ▼]) */}

                        {isUser && feedback && expandedTurnIds.has(msg.id || index) && (
                          <div className="mt-3 rounded-2xl bg-[var(--paper-50)] p-4 border border-[var(--line)] text-xs space-y-2 shadow-xs animate-slide-up">
                            {feedback.summary && (
                              <p className="font-semibold text-[var(--sumi)]">
                                {feedback.summary}
                              </p>
                            )}

                            {feedback.speechDelivery && (
                              <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px]">
                                {feedback.speechDelivery.isTextInput ? (
                                  <span className="inline-flex items-center gap-1 rounded-lg bg-stone-100 px-2 py-0.5 font-medium text-stone-700 border border-stone-200">
                                    <Icon name="keyboard" size={13} />
                                    Nhập bàn phím
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-0.5 font-medium text-emerald-800 border border-emerald-200/60">
                                    <Icon name="mic" size={13} />
                                    Nói qua micro
                                  </span>
                                )}
                                {typeof feedback.speechDelivery
                                  .speechConfidence === "number" && (
                                  <span className="inline-flex items-center gap-1 rounded-lg bg-teal-50 px-2 py-0.5 font-semibold text-teal-800 border border-teal-200/60 font-mono">
                                    Tự tin:{" "}
                                    {Math.round(
                                      feedback.speechDelivery.speechConfidence *
                                        (feedback.speechDelivery
                                          .speechConfidence <= 1
                                          ? 100
                                          : 1),
                                    )}
                                    %
                                  </span>
                                )}

                                {typeof feedback.speechDelivery
                                  .responseLatencySeconds === "number" && (
                                  <span className="inline-flex items-center gap-1 rounded-lg bg-purple-50 px-2 py-0.5 font-semibold text-purple-800 border border-purple-200/60 font-mono">
                                    Phản xạ:{" "}
                                    {feedback.speechDelivery.responseLatencySeconds.toFixed(
                                      1,
                                    )}
                                    s
                                  </span>
                                )}

                                {typeof feedback.speechDelivery.speechPace ===
                                  "number" && (
                                  <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 font-semibold text-xs border ${
                                    feedback.speechDelivery.speechPace < 2.5
                                      ? "bg-sky-50 text-sky-800 border-sky-200"
                                      : feedback.speechDelivery.speechPace <= 5.0
                                      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                                      : "bg-purple-50 text-purple-800 border-purple-200"
                                  }`}>
                                    <span className="h-1.5 w-1.5 rounded-full bg-current" />
                                    {feedback.speechDelivery.speechPace < 2.5
                                      ? "Nhịp điệu: Chậm rãi"
                                      : feedback.speechDelivery.speechPace <= 5.0
                                      ? "Nhịp điệu: Tự nhiên"
                                      : "Nhịp điệu: Nhanh nhẹn"}
                                  </span>
                                )}
                              </div>
                            )}

                            {/* Linguistic Details Breakdown (Pedagogical Depth) */}
                            {feedback.details && feedback.details.length > 0 && (
                              <div className="space-y-1.5 pt-2 border-t border-[var(--line)]">
                                <span className="text-[10px] font-bold text-[var(--sumi-muted)] uppercase tracking-wider block">
                                  Phân tích ngôn ngữ chi tiết:
                                </span>
                                <div className="grid grid-cols-1 gap-1.5">
                                  {feedback.details.map((item, dIdx) => {
                                    const itemType = (item.type || 'success').toLowerCase();
                                    const isErr = itemType === 'error';
                                    const isWarn = itemType === 'warning';
                                    return (
                                      <div
                                        key={dIdx}
                                        className={`flex items-start gap-2 rounded-xl p-2.5 text-xs transition ${
                                          isErr
                                            ? 'bg-rose-50/90 border border-rose-200/80 text-rose-950'
                                            : isWarn
                                            ? 'bg-amber-50/90 border border-amber-200/80 text-amber-950'
                                            : 'bg-emerald-50/90 border border-emerald-200/80 text-emerald-950'
                                        }`}
                                      >
                                        <span
                                          className={`grid h-5 w-5 shrink-0 place-items-center rounded-lg text-[10px] font-bold ${
                                            isErr
                                              ? 'bg-rose-200 text-rose-800'
                                              : isWarn
                                              ? 'bg-amber-200 text-amber-800'
                                              : 'bg-emerald-200 text-emerald-800'
                                          }`}
                                        >
                                          {isErr ? '✕' : isWarn ? '⚠' : '✓'}
                                        </span>
                                        <div className="space-y-0.5 min-w-0">
                                          <span className="font-bold text-[11px] block text-[var(--sumi)]">
                                            {item.aspect ? `[${item.aspect}]` : 'Nhận xét'}
                                          </span>
                                          <p className="text-[11px] leading-relaxed text-[var(--sumi-muted)]">
                                            {item.comment}
                                          </p>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {/* Cultural Tip Card */}
                            {feedback.culturalTip && (
                              <div className="rounded-xl bg-amber-50/90 border border-amber-200/80 p-2.5 text-xs text-amber-950 flex items-start gap-2 shadow-2xs">
                                
                                <div className="min-w-0">
                                  <span className="font-bold text-[11px] block text-amber-950">
                                    Mẹo văn hóa bản xứ:
                                  </span>
                                  <p className="text-[11px] leading-relaxed text-amber-900/90">
                                    {feedback.culturalTip}
                                  </p>
                                </div>
                              </div>
                            )}

                            {/* Sumi Ink Stain Feedback */}
                            {feedback.sumiInk && feedback.sumiInk.hasStain && (
                              <div
                                className={`rounded-xl p-2.5 text-xs flex items-start gap-2 border shadow-2xs ${
                                  feedback.sumiInk.stainType === 'error'
                                    ? 'bg-rose-50/90 border-rose-200 text-rose-950'
                                    : 'bg-stone-100/90 border-stone-200 text-stone-900'
                                }`}
                              >
                                
                                <div className="min-w-0 space-y-0.5">
                                  <span className="font-bold text-[11px] block">
                                    Vết mực Sumi (Văn phong vai vế):
                                  </span>
                                  <p className="text-[11px] leading-relaxed">
                                    {feedback.sumiInk.message}
                                  </p>
                                  {feedback.sumiInk.suggestedAlternative && (
                                    <p className="text-[11px] font-jp font-bold text-emerald-800 pt-0.5">
                                      Gợi ý thay thế: {feedback.sumiInk.suggestedAlternative}
                                    </p>
                                  )}
                                </div>
                              </div>
                            )}

                            {feedback.naturalAlternative && (
                              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[var(--line)]">
                                <p className="text-emerald-800 font-bold text-xs font-jp">
                                  Diễn đạt bản xứ: {feedback.naturalAlternative}
                                </p>

                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"

                                    onClick={() =>
                                      playJapaneseAudio(
                                        feedback.naturalAlternative!,
                                      )
                                    }

                                    className="inline-flex items-center gap-1 rounded-xl border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-800 transition hover:bg-emerald-100 active:scale-95"

                                    title="Nghe phát âm chuẩn câu bản xứ"
                                  >
                                    <span>Nghe câu mẫu</span>
                                  </button>

                                  <button
                                    type="button"

                                    onClick={() =>
                                      handleCopyText(
                                        feedback.naturalAlternative!,
                                        msg.id,
                                        true,
                                      )
                                    }

                                    className={`inline-flex items-center gap-1 rounded-xl border px-2 py-1 text-[10px] font-bold transition active:scale-95 ${
                                      copiedAlternativeId === msg.id
                                        ? "border-emerald-500 bg-emerald-600 text-white"
                                        : "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                                    }`}

                                    title="Sao chép câu bản xứ vào bộ nhớ tạm"
                                  >
                                    <span>
                                      {copiedAlternativeId === msg.id
                                        ? "✓"
                                        : ""}
                                    </span>

                                    <span>
                                      {copiedAlternativeId === msg.id
                                        ? "Đã chép"
                                        : "Sao chép"}
                                    </span>
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Audio Waveform Player (Lưu trữ và phát lại trực quan đồng bộ: Chỉ hiện khi mở chi tiết) */}

                        {isUser && expandedTurnIds.has(msg.id || index) && (
                          <div className="mt-3 pt-2.5 border-t border-[var(--line)]/80 flex flex-wrap items-center gap-2.5">
                            {(msg.audioUrl || msg.userAudioUrl) && (
                              <AudioWaveformPlayer
                                audioUrl={msg.audioUrl || msg.userAudioUrl}

                                label="Bản thu của bạn"

                                variant="user"

                                compact

                                className="w-fit"
                              />
                            )}

                            <AudioWaveformPlayer
                              onPlayFallback={() =>
                                handlePlaySample(
                                  msg.id,
                                  feedback?.naturalAlternative ||
                                    msg.japaneseText,
                                )
                              }

                              onSeekFallback={(ratio, time) =>
                                handleSeekSample(
                                  msg.id,
                                  feedback?.naturalAlternative ||
                                    msg.japaneseText,
                                  ratio,
                                  time,
                                )
                              }

                              isFallbackPlaying={playingSampleMsgId === msg.id}

                              fallbackDuration={Math.max(
                                1.4,
                                Number(
                                  (
                                    (
                                      feedback?.naturalAlternative ||
                                      msg.japaneseText
                                    ).length * 0.22
                                  ).toFixed(1),
                                ),
                              )}

                              label="Mẫu bản xứ Tokyo"

                              variant="model"

                              compact

                              className="w-fit"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* ============================================================ */}
        {/* KHỐI 3 KỊCH BẢN THÍCH ỨNG THÔNG MINH (TOP 3 SMART PICKS)     */}
        {/* ============================================================ */}
        {(() => {
          const { items: recItems, weaknessSummary } = buildAdaptiveRecommendations(result, availableScenarios);
          return (
            <section className="mt-8 rounded-3xl border border-[var(--line)] bg-[var(--paper-50)]/95 backdrop-blur-xs p-6 sm:p-7 shadow-xs">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[var(--line)] pb-5">
                <div className="flex items-start gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[var(--ai)] to-teal-600 text-white flex items-center justify-center shrink-0 shadow-sm text-2xl select-none">
                    <CompassIcon className="w-4 h-4 text-rose-600" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-base font-bold text-[var(--sumi)] font-sans">
                        Lộ trình Kịch bản Thích ứng Tiếp theo
                      </h3>
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[var(--ai-soft)] text-[var(--ai)] border border-[var(--ai)]/20">
                        {result.passStatus ? 'Gợi ý nâng tầm phản xạ' : 'Luyện tập khắc phục điểm yếu'}
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs text-[var(--sumi-muted)] leading-relaxed max-w-2xl font-sans">
                      {weaknessSummary}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {result.scenarioId && (
                    <button
                      type="button"
                      onClick={handleStartBlindRetake}
                      disabled={isStartingBlind}
                      className="inline-flex items-center gap-1.5 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 px-4 py-2.5 text-xs font-bold text-white shadow-xs active:scale-95 transition cursor-pointer"
                      title="Thử thách phản xạ nhanh 10 giây (Blind Mode không gợi ý)"
                    >
                      <svg className="w-3.5 h-3.5 text-white shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                      </svg>
                      <span>{isStartingBlind ? "Đang mở phòng..." : "Thử thách Blind 10s"}</span>
                    </button>
                  )}
                  <Link
                    to="/profile#radar-map"
                    className="inline-flex items-center gap-1.5 rounded-2xl border border-[var(--line)] bg-white hover:bg-[var(--paper-100)] px-3.5 py-2.5 text-xs font-bold text-[var(--sumi)] shadow-2xs active:scale-95 transition cursor-pointer"
                  >
                    <svg className="w-3.5 h-3.5 text-[var(--sumi)] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="20" x2="18" y2="10" />
                      <line x1="12" y1="20" x2="12" y2="4" />
                      <line x1="6" y1="20" x2="6" y2="14" />
                    </svg>
                    <span>Bản đồ năng lực</span>
                  </Link>
                </div>
              </div>

              {/* LƯỚI 3 THẺ KỊCH BẢN ĐỀ XUẤT - BỐ CỤC ĐẲNG CẤP CHUẨN PRO UI/UX */}
              <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-5 items-stretch">
                {recItems.map((item) => (
                  <div
                    key={item.id}
                    className={`relative flex flex-col justify-between rounded-3xl p-5 sm:p-6 transition-all duration-300 h-full ${
                      item.isTopPick
                        ? "border-2 border-amber-400 bg-gradient-to-b from-amber-50/70 via-white to-amber-50/20 shadow-lg shadow-amber-500/10 ring-2 ring-amber-400/20"
                        : "border border-[var(--line)] bg-white hover:border-[var(--line-strong)] hover:shadow-md shadow-2xs"
                    }`}
                  >
                    <div className="flex flex-col flex-1">
                      {/* Top Row: Phân loại bên trái & Match Score bên phải trên 1 dòng chuẩn xác, không bao giờ gãy chữ */}
                      <div className="flex items-center justify-between gap-2 mb-4 pb-3 border-b border-[var(--line)]/60">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-extrabold whitespace-nowrap select-none shrink-0 ${
                            item.isTopPick
                              ? "bg-amber-100 text-amber-950 border border-amber-300 shadow-2xs"
                              : "bg-slate-100 text-slate-700 border border-slate-200"
                          }`}
                        >
                          <span>{item.tag}</span>
                        </span>

                        {/* Điểm Phù Hợp: Pill sang trọng, số to rõ ràng, không bao giờ ngắt dòng */}
                        <div
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold font-mono whitespace-nowrap select-none shrink-0 shadow-2xs ${
                            item.isTopPick
                              ? "bg-emerald-600 text-white shadow-emerald-500/20"
                              : "bg-sky-50 text-sky-800 border border-sky-300/80"
                          }`}
                          title={`Mức độ phù hợp với 6 trục năng lực: ${item.matchScore}%`}
                        >
                          
                          <span className="font-black text-sm tracking-tight leading-none">{item.matchScore}%</span>
                          <span className="text-[10px] font-medium opacity-90">phù hợp</span>
                        </div>
                      </div>

                      {/* Header Kịch bản: Bố cục Đỉnh cao với Thumbnail/Icon đồng bộ danh sách */}
                      <div className="flex items-start gap-3.5 mb-3">
                        <span className="inline-flex h-12 w-12 flex-none items-center justify-center overflow-hidden rounded-2xl bg-slate-100 border border-[var(--line)] text-ai shadow-2xs shrink-0">
                          {item.thumbnail ? (
                            <img src={item.thumbnail} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <svg className="w-6 h-6 text-indigo-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                            </svg>
                          )}
                        </span>

                        {/* Tiêu đề & Cấp độ JLPT xếp tầng khoa học y hệt ScenarioListView */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                            {(item.supportedJLPTLevels && item.supportedJLPTLevels.length > 0 ? item.supportedJLPTLevels : [item.level]).map((lv) => (
                              <span
                                key={lv}
                                className="px-2 py-0.5 rounded-md bg-[var(--ai-soft)] text-[var(--ai)] text-[10px] font-extrabold font-mono border border-[var(--ai)]/20 shadow-2xs uppercase tracking-wide"
                              >
                                JLPT {lv}
                              </span>
                            ))}
                            {item.topicName && (
                              <span className="text-[11px] font-medium text-[var(--sumi-muted)] truncate">
                                • {item.topicName}
                              </span>
                            )}
                          </div>
                          <h4 className="text-base font-bold text-[var(--sumi)] leading-snug line-clamp-2 min-h-[2.75rem] flex items-center">
                            {item.title}
                          </h4>
                        </div>
                      </div>

                      {/* Mô tả bối cảnh tình huống: 2 dòng tinh tế */}
                      <p className="text-xs text-[var(--sumi-muted)] leading-relaxed line-clamp-2 min-h-[2.4rem] mb-3.5 pl-0.5">
                        {item.description}
                      </p>

                      {/* Khối Trọng tâm rèn luyện: Nền thẻ dịu mắt, cân hàng đều đặn */}
                      <div className="rounded-2xl bg-[var(--paper-100)] p-3 border border-[var(--line)]/70 text-xs space-y-1 mb-4 flex-1 flex flex-col justify-center min-h-[4.75rem]">
                        <div className="font-bold text-[var(--sumi)] flex items-center gap-1.5 text-[11.5px]">
                          <TargetIcon className="w-3.5 h-3.5 text-rose-500" />
                          <span>Trọng tâm rèn luyện:</span>
                        </div>
                        <p className="text-[var(--sumi-muted)] leading-relaxed text-[11px] line-clamp-2">
                          {item.actionReason}
                        </p>
                      </div>
                    </div>

                    {/* Bộ 3 nút bấm sâu: Cân hàng tuyệt đối ở đáy */}
                    <div className="pt-3.5 border-t border-[var(--line)]/80 space-y-2 mt-auto">
                      <Link
                        to={`/scenarios/${item.id}`}
                        className={`w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition active:scale-95 shadow-sm ${
                          item.isTopPick
                            ? "bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-700 hover:from-emerald-700 hover:to-teal-800 text-white shadow-emerald-600/20"
                            : "bg-[var(--ai)] hover:bg-[var(--ai-hover)] text-white"
                        }`}
                      >
                        <span>Vào kịch bản này</span>
                        <span className="text-sm">➔</span>
                      </Link>


                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })()}

        {/* Thanh điều hướng tinh gọn chuẩn Pro UI */}
        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-6">
          <div className="flex flex-wrap items-center gap-2.5">
            {result.scenarioId && (
              <Link
                to={`/scenarios/${result.scenarioId}`}
                className="rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition active:scale-95"
              >
                Luyện lại kịch bản này
              </Link>
            )}
            <Link
              to="/flashcards"
              className="rounded-xl border border-amber-300 bg-amber-50/90 hover:bg-amber-100 px-4 py-2.5 text-xs font-bold text-amber-900 shadow-2xs transition active:scale-95"
            >
              Ôn tập kho Flashcards
            </Link>
            <Link
              to="/profile#radar-map"
              className="rounded-xl border border-[var(--ai)]/30 bg-[var(--ai-soft)] hover:bg-[var(--ai)] hover:text-white px-4 py-2.5 text-xs font-bold text-[var(--ai)] shadow-2xs transition active:scale-95 flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="20" x2="18" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" />
              </svg>
              <span>Bản đồ Năng lực</span>
            </Link>
            <Link
              to="/scenarios"
              className="rounded-xl bg-[var(--ai)] hover:bg-[var(--ai-hover)] px-4 py-2.5 text-xs font-bold text-white shadow-xs transition active:scale-95"
            >
              Khám phá kịch bản khác
            </Link>
          </div>
          <div className="flex items-center gap-2">
            {returnUrl && (
              <Link
                to={returnUrl}
                className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100 transition active:scale-95 shadow-2xs flex items-center gap-1"
              >
                <CompassIcon className="w-3.5 h-3.5" />
                <span>Quay lại Bản đồ</span>
              </Link>
            )}
            <Link
              to="/roleplay/results"
              className="rounded-xl border border-[var(--line)] bg-[var(--paper-50)] hover:bg-white px-4 py-2.5 text-xs font-bold text-[var(--sumi-muted)] hover:text-[var(--sumi)] transition active:scale-95"
            >
              Xem toàn bộ lịch sử
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
};
