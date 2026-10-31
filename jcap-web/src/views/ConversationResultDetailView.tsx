import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";

import { roleplayResultService } from "../services/roleplayResultService";
import { roleplayService } from "../services/roleplayService";
import { flashcardService } from "../services/flashcardService";
import { scenarioService } from "../services/scenarioService";
import type { ScenarioListItem } from "../types/scenarioDetails";

import { useAuth } from "../contexts/AuthContext";

import { formatDateTime } from "../utils/dateUtils";

import type { RoleplayResultDetail } from "../types/roleplayResult";

import { AudioWaveformPlayer } from "../components/common/AudioWaveformPlayer";

import { scenarioVoiceService } from "../services/scenarioVoiceService";

import { ukiyoSound } from "../utils/ukiyoSoundEngine";

import { sanitizeDisplayJapanese } from "../utils/japaneseSanitizer";

import { PREFECTURES } from "../data/japanMap";
import {
  BarChartIcon,
  BookmarkIcon,
  CompassIcon,
  SparkIcon,
  TargetIcon,
  TrophyIcon,
} from "../components/common/Icons";

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

const formatDate = (value: string) =>
  formatDateTime(value, { dateStyle: "long", timeStyle: "short" });

// sanitizeDisplayJapanese được nạp từ utils/japaneseSanitizer

const playJapaneseAudio = (text: string) => {
  void scenarioVoiceService.playAiSpeech(sanitizeDisplayJapanese(text), 2);
};

const ScoreCard = ({
  label,
  score,
  accent,
  subtext,
}: {
  label: string;
  score: number;
  accent: string;
  subtext?: string;
}) => {
  const [animatedWidth, setAnimatedWidth] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setAnimatedWidth(Math.min(Math.max(score, 0), 100));
    }, 150);
    return () => clearTimeout(timer);
  }, [score]);

  return (
    <div className="group flex flex-col justify-between rounded-2xl border border-stone-200/80 bg-white p-4 sm:p-5 shadow-xs transition-all duration-300 hover:border-blue-300 hover:shadow-md h-full min-h-[142px]">
      <div>
        <div className="mb-2 flex items-start justify-between gap-2 h-10">
          <span className="text-[11px] sm:text-xs font-bold text-slate-700 font-sans line-clamp-2 leading-tight flex-1 normal-case">
            {label}
          </span>
          <strong className="text-2xl font-black text-slate-800 font-sans shrink-0 leading-none">
            {score}
          </strong>
        </div>
        <p className="text-[11px] font-medium text-slate-400 font-sans h-4 leading-4 truncate">
          {subtext || "\u00A0"}
        </p>
      </div>
      <div className="pt-3 mt-auto">
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200/80 p-0.5 border border-slate-300/60 shadow-inner">
          <div
            className={`h-full rounded-full transition-all duration-1000 ease-out shadow-xs ${accent}`}
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
    <div className="relative grid h-36 w-36 sm:h-40 sm:w-40 place-items-center rounded-full p-2 select-none shrink-0">
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
        <span className="text-4xl font-black font-sans tracking-tight text-white drop-shadow-sm">
          {displayScore}
        </span>

        <span className="text-[11px] font-bold uppercase tracking-wider text-sky-200/90 font-sans mt-0.5">
          Tổng điểm
        </span>
      </div>
    </div>
  );
};


export interface SmartRecommendationItem {
  id: number;
  title: string;
  level: string;
  description: string;
  matchScore: number;
  isTopPick: boolean;
  tag: string;
  icon: string;
  weaknessFocus: string;
  actionReason: string;
}

const DEFAULT_SCENARIOS_CATALOG: Array<{
  id: number;
  title: string;
  level: string;
  description: string;
  icon: string;
  focusType: 'reflex' | 'keigo' | 'grammar' | 'vocab' | 'advanced';
  focusText: string;
}> = [
  {
    id: 1,
    title: 'Gọi món tại quán mì Ramen',
    level: 'N4',
    description: 'Thực hành tùy chỉnh độ cứng của sợi mì, nước dùng đậm đà và thanh toán thẻ.',
    icon: '🍜',
    focusType: 'reflex',
    focusText: 'Rèn nhịp đối đáp tức thì & Phản xạ đời thường (< 2.0s)',
  },
  {
    id: 2,
    title: 'Phỏng vấn xin việc làm thêm (Baito)',
    level: 'N4',
    description: 'Ứng tuyển thu ngân/phục vụ, giới thiệu bản thân và lịch trình học.',
    icon: '💼',
    focusType: 'keigo',
    focusText: 'Chuẩn hóa Kính ngữ Desu/Masu & Tác phong đàm thoại công sở',
  },
  {
    id: 3,
    title: 'Mua sắm tại Cửa hàng tiện lợi (Combini)',
    level: 'N5',
    description: 'Hâm nóng đồ ăn bento, xin thêm thìa đũa và quét mã thanh toán ví điện tử.',
    icon: '🏪',
    focusType: 'vocab',
    focusText: 'Vốn từ vựng dịch vụ thiết yếu & Phản xạ câu ngắn',
  },
  {
    id: 4,
    title: 'Hỏi đường tại Ga Shinjuku',
    level: 'N5',
    description: 'Tìm cổng soát vé Kaisatsuguchi, chuyển tuyến tàu Yamanote và hỏi nhân viên.',
    icon: '🗺️',
    focusType: 'grammar',
    focusText: 'Củng cố trợ từ chỉ hướng に/へ/で & Thể nhờ vả ~Te kudasai',
  },
  {
    id: 5,
    title: 'Đặt và nhận phòng khách sạn tại Kyoto',
    level: 'N4',
    description: 'Check-in lễ tân, gửi hành lý trước giờ và hỏi tiện ích phòng nghỉ.',
    icon: '🏨',
    focusType: 'keigo',
    focusText: 'Giao tiếp dịch vụ trang nhã & Thể khả năng, khiêm nhường',
  },
  {
    id: 6,
    title: 'Khám bệnh tại Bệnh viện Nhật Bản',
    level: 'N3',
    description: 'Mô tả triệu chứng đau họng, sốt nhẹ và tiếp nhận hướng dẫn uống thuốc.',
    icon: '🏥',
    focusType: 'grammar',
    focusText: 'Cấu trúc giải thích nguyên nhân ~node/kara & Từ vựng y tế',
  },
  {
    id: 7,
    title: 'Đổi trả hàng tại Trung tâm thương mại',
    level: 'N3',
    description: 'Trình bày lý do đổi cỡ áo, xuất trình hóa đơn và thương lượng lịch sự.',
    icon: '🏬',
    focusType: 'advanced',
    focusText: 'Đàm thoại thương lượng phức hợp & Khiêm nhường ngữ thương mại',
  },
];

function buildAdaptiveRecommendations(
  result: RoleplayResultDetail,
  availableScenarios: ScenarioListItem[] = [],
): { items: SmartRecommendationItem[]; weaknessSummary: string } {
  const currentId = result.scenarioId || 0;
  const fluency = result.fluencyScore ?? 85;
  const latency = result.averageResponseLatencySeconds ?? 2.2;
  const keigo = result.impressionScore ?? 80;
  const grammar = result.grammarScore ?? 80;
  const vocab = result.vocabularyScore ?? 80;
  const overall = result.overallScore ?? 80;

  // Xác định điểm yếu nổi cộm nhất
  let weaknessType: 'keigo' | 'reflex' | 'grammar' | 'vocab' | 'advanced' = 'advanced';
  let weaknessSummary = '';

  if (keigo < 75) {
    weaknessType = 'keigo';
    weaknessSummary = `Chỉ số Kính ngữ & Văn phong (${keigo}đ) cần củng cố thêm. Hệ thống ưu tiên đề xuất các tình huống giao tiếp chuẩn mực, luyện thể lịch sự Desu/Masu và tác phong công sở.`;
  } else if (fluency < 75 || latency > 2.8) {
    weaknessType = 'reflex';
    weaknessSummary = `Độ trôi chảy & Phản xạ (${latency.toFixed(1)}s/lượt) có độ trễ nhẹ. Đề xuất tình huống dịch vụ đời thường với nhịp đối đáp ngắn, dồn dập để tối ưu phản xạ tức thì.`;
  } else if (grammar < 75) {
    weaknessType = 'grammar';
    weaknessSummary = `Độ chính xác Ngữ pháp & Trợ từ (${grammar}đ) cần rèn luyện thêm. Đề xuất kịch bản trọng tâm vào liên kết câu, trợ từ vị trí và cấu trúc diễn đạt mạch lạc.`;
  } else if (vocab < 75) {
    weaknessType = 'vocab';
    weaknessSummary = `Vốn từ vựng chuyên đề (${vocab}đ) cần mở rộng. Đề xuất kịch bản bổ sung cụm từ thực tế phong phú để bạn diễn đạt tự nhiên hơn.`;
  } else if (overall >= 85) {
    weaknessType = 'advanced';
    weaknessSummary = `Bạn đã làm chủ xuất sắc kịch bản này (${overall}đ)! Hệ thống đề xuất các thử thách nâng cao (JLPT N4/N3) để bứt phá giới hạn hội thoại tự chủ.`;
  } else {
    weaknessType = 'reflex';
    weaknessSummary = `Cân bằng 6 trục năng lực đối thoại: Đề xuất các tình huống thực tế tiếp theo giúp nâng cao toàn diện phản xạ và độ tự tin phát âm.`;
  }

  // Kết hợp catalog mặc định với scenarios lấy được từ DB (nếu có)
  const pool = DEFAULT_SCENARIOS_CATALOG.filter((s) => s.id !== currentId);

  // Phân loại: Danh sách khớp điểm yếu nhất (ưu tiên hàng đầu)
  const primaryCandidates = pool.filter((s) => s.focusType === weaknessType);
  const secondaryCandidates = pool.filter((s) => s.focusType !== weaknessType);

  const selectedList = [...primaryCandidates, ...secondaryCandidates];

  const items: SmartRecommendationItem[] = [];

  // Card 1: Top Pick (Khuyên chọn hàng đầu)
  if (selectedList[0]) {
    const s = selectedList[0];
    items.push({
      id: s.id,
      title: s.title,
      level: s.level,
      description: s.description,
      matchScore: 96,
      isTopPick: true,
      tag: '🌟 Khuyên chọn',
      icon: s.icon,
      weaknessFocus: s.focusText,
      actionReason: `Trọng tâm: ${s.focusText}. Khắc phục trực tiếp điểm yếu lớn nhất từ lượt vừa rồi.`,
    });
  }

  // Card 2: Lựa chọn mở rộng 1
  if (selectedList[1]) {
    const s = selectedList[1];
    items.push({
      id: s.id,
      title: s.title,
      level: s.level,
      description: s.description,
      matchScore: 89,
      isTopPick: false,
      tag: '✨ Tương thích',
      icon: s.icon,
      weaknessFocus: s.focusText,
      actionReason: `Củng cố: ${s.focusText}. Tình huống thực tế bổ trợ rất tốt cho cấp độ hiện tại.`,
    });
  }

  // Card 3: Lựa chọn mở rộng 2
  if (selectedList[2]) {
    const s = selectedList[2];
    items.push({
      id: s.id,
      title: s.title,
      level: s.level,
      description: s.description,
      matchScore: 83,
      isTopPick: false,
      tag: '🎯 Mở rộng',
      icon: s.icon,
      weaknessFocus: s.focusText,
      actionReason: `Mở rộng: ${s.focusText}. Thích hợp luyện đàm thoại đa bối cảnh.`,
    });
  }

  return { items, weaknessSummary };
}

export const ConversationResultDetailView: React.FC = () => {
  const navigate = useNavigate();
  const { resultId } = useParams();

  const [searchParams] = useSearchParams();

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
        `🎉 Đã lưu ${vocabs.length + grammars.length} từ vựng & ngữ pháp vào Kho Thẻ Cá Nhân (Database)!`,
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
        setToastMessage(`✨ Đã thêm "${vocab.word}" vào Kho Thẻ Cá Nhân (Bookmark)!`);
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

  const [isTranscriptOpen, setIsTranscriptOpen] = useState(false);

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
          <span className="text-emerald-400 text-sm">{toastMessage ? "✨" : "✓"}</span>
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
            <span>📊</span>
            <span>Hồ sơ năng lực</span>
          </Link>
        </div>
      </div>

      <div
        key={result.id}
        data-theme="phong-luyen"
        className="rounded-[32px] bg-[var(--paper-100)] p-4 sm:p-7 border border-[var(--line)] shadow-sm"
      >
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

        <header className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[var(--sumi)] via-[var(--sumi)] to-[var(--ai)] px-7 py-8 text-white shadow-xl md:px-10 md:py-10 border border-[var(--line)]/40">
          <div className="absolute right-0 top-0 h-full w-2/3 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.25),transparent_65%)] pointer-events-none" />

          <div className="absolute -left-10 -bottom-10 h-40 w-40 rounded-full bg-indigo-500/10 blur-2xl pointer-events-none" />

          <div className="relative grid gap-8 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-sky-200 border border-white/15 backdrop-blur-xs font-mono">
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

              <p className="text-xs font-bold uppercase tracking-wider text-sky-300 font-sans">
                Bản Khắc Kết Quả Hội Thoại
              </p>

              <h1 className="mt-2.5 break-words text-3xl font-black tracking-tight md:text-4xl font-sans text-white">
                {result.scenarioTitle}
              </h1>

              <p className="mt-3 text-xs sm:text-sm text-slate-300 font-sans font-medium">
                Hoàn thành lúc {formatDate(result.completedAt)}
              </p>
            </div>

            <AnimatedScoreGauge score={result.overallScore} />
          </div>
        </header>

        {/* Thẻ Con Dấu Eki-Stamp Hanko Son Đỏ kết nối Bản Đồ Khám Phá Explore Map */}

        {result.awardedEkiStampName && (
          <div className="mt-6 rounded-3xl border-2 border-red-200/90 bg-gradient-to-r from-red-50/80 via-white to-amber-50/60 p-5 md:p-6 shadow-sm flex flex-col md:flex-row items-center justify-between gap-5 relative overflow-hidden">
            <div className="flex items-center gap-4 text-left w-full md:w-auto">
              {/* Con dấu son Hanko truyền thống Nhật Bản */}

              <div className="relative shrink-0 flex items-center justify-center">
                <div className="w-16 h-16 md:w-20 md:h-20 rounded-full border-3 border-dashed border-red-600/90 bg-red-100/70 flex flex-col items-center justify-center text-red-700 shadow-md rotate-[-4deg] p-1 select-none">
                  <div className="w-full h-full rounded-full border border-red-500/80 flex flex-col items-center justify-center">
                    <span className="text-[8px] md:text-[9px] font-bold tracking-widest uppercase">
                      駅印 · HANKO
                    </span>

                    <span className="text-base md:text-xl font-extrabold font-serif my-0.5 tracking-wider">
                      見事
                    </span>

                    <span className="text-[7px] md:text-[8px] font-bold uppercase tracking-wider">
                      合格
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full bg-red-100 text-red-700 text-[10px] font-extrabold uppercase tracking-wide">
                    Eki-Stamp Đã Khắc
                  </span>

                  <span className="text-xs text-slate-400">•</span>

                  <span className="text-xs font-semibold text-slate-600">
                    Bản đồ Hành trình Khám phá
                  </span>
                </div>

                <h3 className="text-lg md:text-xl font-extrabold text-[var(--sumi)] mt-1 font-sans">
                  {result.awardedEkiStampName}
                </h3>

                <p className="text-xs text-slate-500 mt-0.5">
                  Bạn đã hoàn thành xuất sắc kịch bản hội thoại gắn với địa danh
                  này. Con dấu son đỏ đã được ghi nhận vào bản đồ hành trình!
                </p>
              </div>
            </div>

            <div className="shrink-0 w-full md:w-auto">
              <Link
                to={
                  returnUrl ||
                  (result.explorePrefectureId
                    ? `/explore?tinh=${PREFECTURES.find((p) => p.id === result.explorePrefectureId)?.slug || ""}&dd=${result.exploreSpotId ?? 1}&hoc=1`
                    : "/explore")
                }

                className="w-full md:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-red-600 hover:bg-red-700 active:scale-95 text-white font-bold text-xs shadow-md shadow-red-500/20 transition cursor-pointer"
              >
                <CompassIcon className="w-4 h-4" />
                <span>Quay lại mốc trên Bản đồ Khám phá</span>

                <span>→</span>
              </Link>
            </div>
          </div>
        )}

        {/* Thử Thách Con Dấu Eki-Stamp khi chưa đạt nhưng kịch bản gắn liền với Explore Spot */}

        {!result.passStatus && result.exploreSpotId && (
          <div className="mt-6 rounded-3xl border border-amber-200/90 bg-gradient-to-r from-amber-50/80 via-white to-orange-50/60 p-5 md:p-6 shadow-sm flex flex-col md:flex-row items-center justify-between gap-5 relative overflow-hidden">
            <div className="flex items-center gap-4 text-left w-full md:w-auto">
              <div className="w-14 h-14 md:w-16 md:h-16 rounded-full border-2 border-dashed border-amber-500/80 bg-amber-100/60 flex items-center justify-center text-amber-700 text-xl font-bold shrink-0">
                <span>⛩️</span>
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-extrabold uppercase tracking-wide">
                    Địa Danh Explore Map
                  </span>

                  <span className="text-xs text-slate-400">•</span>

                  <span className="text-xs font-semibold text-slate-600">
                    Thử thách Con Dấu Son
                  </span>
                </div>

                <h3 className="text-base md:text-lg font-bold text-[var(--sumi)] mt-1 font-sans">
                  Chinh phục con dấu Eki-stamp địa danh
                </h3>

                <p className="text-xs text-slate-500 mt-0.5">
                  Kịch bản này gắn với một địa danh trên Bản đồ Khám phá. Hãy
                  tiếp tục luyện tập để đạt điểm đỗ và khắc con dấu son đỏ vào
                  sổ hành trình!
                </p>
              </div>
            </div>

            <div className="shrink-0 w-full md:w-auto flex gap-2">
              <Link
                to={
                  returnUrl ||
                  (result.explorePrefectureId
                    ? `/explore?tinh=${PREFECTURES.find((p) => p.id === result.explorePrefectureId)?.slug || ""}&dd=${result.exploreSpotId}&hoc=1`
                    : "/explore")
                }

                className="w-full md:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-amber-300 bg-white hover:bg-amber-50 text-amber-900 font-bold text-xs transition cursor-pointer"
              >
                <CompassIcon className="w-3.5 h-3.5" />
                <span>Xem trên bản đồ</span>
              </Link>
            </div>
          </div>
        )}

        <div className="mt-6 grid gap-3.5 grid-cols-2 md:grid-cols-3 lg:grid-cols-6 items-stretch">
          <ScoreCard
            label="Ngữ pháp & Cấu trúc"
            score={result.grammarScore}
            accent="bg-[var(--ai)]"
            subtext={
              result.grammarScore >= 80
                ? "Đúng cấu trúc & trợ từ"
                : "Cần lưu ý trợ từ & thể"
            }
          />

          <ScoreCard
            label="Vốn từ vựng"
            score={result.vocabularyScore}
            accent="bg-[var(--score-good)]"
            subtext={
              result.vocabularyScore >= 80
                ? "Từ ngữ đúng chủ đề"
                : "Cần mở rộng vốn từ"
            }
          />

          <ScoreCard
            label="Kính ngữ & Văn phong"
            score={result.impressionScore}
            accent="bg-amber-500"
            subtext={
              result.impressionScore >= 80
                ? "Lịch sự, tự nhiên"
                : "Cần chú ý thể Teinei"
            }
          />

          <ScoreCard
            label="Độ trôi chảy & Phản xạ"

            score={result.fluencyScore ?? 85}

            accent="bg-[var(--nami)]"

            subtext={
              result.averageResponseLatencySeconds
                ? `Phản xạ ~${result.averageResponseLatencySeconds.toFixed(1)}s/lượt`
                : "Nhịp đối đáp ổn định"
            }
          />

          <ScoreCard
            label="Độ tự tin & Rõ ràng"

            score={result.speechConfidenceScore ?? 90}

            accent="bg-teal-600"

            subtext={
              result.averageSpeechPace
                ? `Tốc độ ~${result.averageSpeechPace.toFixed(1)} ký tự/s`
                : "Phát âm rõ ràng"
            }
          />

          <ScoreCard
            label="Độ tự chủ giao tiếp"

            score={result.autonomyScore ?? 100}

            accent="bg-indigo-600"

            subtext={
              (result.autonomyScore ?? 100) >= 95
                ? "Phản xạ độc lập 100%"
                : "Có dùng giàn giáo gợi ý"
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

        {/* MINH BẠCH CÁCH TÍNH ĐIỂM TỔNG (SCORE BREAKDOWN & TRANSPARENCY CARD) */}

        <div className="mt-6 overflow-hidden rounded-3xl border border-[var(--line)] bg-white/95 p-5 shadow-xs font-sans">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] pb-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[var(--ai)] border border-blue-200 shadow-2xs">
                <BarChartIcon className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[var(--sumi)] font-sans">
                  Minh bạch cách tính điểm tổng (Score Breakdown)
                </h3>

                <p className="text-[11px] text-[var(--sumi-faint)]">
                  Quy tắc tính điểm theo trọng số chuẩn: 50% Nhiệm vụ + 20% Ngữ
                  pháp + 20% Từ vựng + 10% Văn phong & Tự chủ
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500">
                Điểm tổng kết:
              </span>

              <span className="px-3 py-1 rounded-xl bg-[var(--ai-soft)] text-[var(--ai)] font-extrabold text-sm border border-[var(--ai)]/20 font-mono">
                {result.overallScore}/100
              </span>
            </div>
          </div>

          {/* Breakdown Items List */}

          <div className="mt-3 divide-y divide-stone-100">
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
                        adj.deltaPoints > 0
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : adj.deltaPoints < 0
                            ? "bg-rose-50 text-rose-700 border-rose-200"
                            : "bg-slate-50 text-slate-600 border-slate-200"
                      }`}
                    >
                      {adj.deltaPoints > 0
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
        </div>

        {/* Attempt Progression & Historical Comparison Card (Direction 4) */}

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
            <div className="mt-6 overflow-hidden rounded-3xl border border-[var(--line)] bg-[var(--paper-50)]/90 backdrop-blur-xs p-5 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-tr from-[var(--ai)] to-[var(--nami)] text-white shadow-xs">
                    <BarChartIcon className="w-5 h-5 text-white" />
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-[var(--sumi)] font-sans">
                        Tiến độ qua các lần luyện tập kịch bản
                      </h3>

                      <span className="rounded-full bg-[var(--ai-soft)] px-2.5 py-0.5 text-[11px] font-bold text-[var(--ai)] border border-[var(--ai)]/20 font-mono">
                        Lần #{attempt.attemptNumber}
                      </span>
                    </div>

                    <p className="mt-0.5 text-xs text-[var(--sumi-muted)] font-sans">
                      {attempt.progressSummary}
                    </p>
                  </div>
                </div>

                {/* Score Delta Badge */}

                {attempt.previousOverallScore !== undefined &&
                attempt.previousOverallScore !== null ? (
                  <div className="flex items-center gap-4 bg-white rounded-2xl px-4 py-2 border border-[var(--line)] shadow-2xs">
                    <div className="text-right">
                      <span className="block text-[10px] font-bold uppercase text-[var(--sumi-faint)] font-sans">
                        Lần trước
                      </span>

                      <span className="text-sm font-bold text-[var(--sumi-muted)] font-mono">
                        {attempt.previousOverallScore} điểm
                      </span>
                      {attempt.isPersonalBest && (
                        <span className="mt-1 inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-800 border border-amber-200 font-sans">
                          <TrophyIcon className="w-3 h-3" /> Kỷ lục cá nhân
                        </span>
                      )}
                    </div>

                    <div className="h-7 w-px bg-[var(--line)]" />

                    <div className="text-right">
                      <span className="block text-[10px] font-bold uppercase text-[var(--sumi-faint)] font-sans">
                        Hiện tại
                      </span>

                      <span className="text-sm font-black text-[var(--sumi)] font-mono">
                        {attempt.overallScore} điểm
                      </span>
                    </div>

                    <div className="h-7 w-px bg-[var(--line)]" />

                    <div className="text-right">
                      <span className="block text-[10px] font-bold uppercase text-[var(--sumi-faint)] font-sans">
                        Thay đổi
                      </span>

                      <span
                        className={`inline-flex items-center gap-0.5 rounded-xl px-2.5 py-1 text-xs font-black font-mono ${
                          attempt.scoreDelta > 0
                            ? "bg-emerald-100 text-emerald-800"
                            : attempt.scoreDelta === 0
                              ? "bg-blue-100 text-blue-800"
                              : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {attempt.scoreDelta > 0 && "▲ +"}
                        {attempt.scoreDelta === 0 && "― "}
                        {attempt.scoreDelta < 0 && "▼ "}
                        {attempt.scoreDelta !== 0 && attempt.scoreDelta}
                        {attempt.scoreDelta === 0 && "0"} điểm
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 rounded-2xl bg-white border border-[var(--line)] px-3.5 py-2 text-xs font-semibold text-[var(--ai)] shadow-2xs">
                    <TargetIcon className="w-3.5 h-3.5 text-[var(--ai)]" />

                    <span>
                      Điểm khởi đầu:{" "}
                      <strong className="font-bold text-[var(--ai)] font-mono">
                        {attempt.overallScore}/100
                      </strong>
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* Omikuji Variable Reward & Flashcard Integration Card */}

        <div className="mt-6 rounded-3xl border border-[var(--line)] bg-[var(--paper-50)]/90 backdrop-blur-xs p-5 shadow-xs flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-rose-600 to-amber-500 text-white flex items-center justify-center text-2xl shadow-xs">
              <TrophyIcon className="w-6 h-6 text-white" />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-rose-800 font-sans">
                  Quẻ Vận Omikuji Sau Phiên
                </span>

                <span className="rounded-full bg-rose-100/80 border border-rose-300 px-2.5 py-0.5 text-xs font-bold text-rose-700 font-sans">
                  <span className="font-serif font-black">
                    {result.overallScore >= 85
                      ? "大吉"
                      : result.overallScore >= 70
                        ? "中吉"
                        : "吉"}
                  </span>{" "}
                  {result.overallScore >= 85
                    ? "(Đại Cát) +15 EXP"
                    : result.overallScore >= 70
                      ? "(Trung Cát) +10 EXP"
                      : "(Cát) +5 EXP"}
                </span>
              </div>

              <p className="text-xs text-[var(--sumi)] font-medium mt-1">
                <span className="font-serif font-bold">継続は力なり</span>{" "}
                (Keizoku wa chikara nari) — Kiên trì đối thoại mỗi ngày là chìa
                khóa phản xạ!
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"

              onClick={handleSaveToFlashcards}

              className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:from-emerald-700 hover:to-teal-700 transition active:scale-95 cursor-pointer"

              title="Lưu các từ vựng mục tiêu và câu diễn đạt bản xứ vào Sổ tay ôn tập"
            >
              <span>Lưu vào Sổ tay Flashcard</span>
            </button>

            <div
              className="w-10 h-10 rounded-full border-2 border-dashed border-red-500 bg-red-50 flex items-center justify-center text-red-600 font-serif font-black text-xs select-none shadow-xs rotate-[-8deg]"
              title="Con dấu Eki-stamp hoàn thành phiên"
            >
              済
            </div>
          </div>
        </div>

        
        {/* M5: NPC Affinity & Relationship Progression Card */}
        <div className="mt-6 rounded-3xl border border-rose-200 bg-gradient-to-br from-rose-50/70 via-white to-pink-50/50 p-5 shadow-xs font-sans">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-rose-500 to-pink-400 text-white flex items-center justify-center text-2xl shadow-xs">
                🌸
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold uppercase tracking-wider text-rose-800">
                    Mối quan hệ nhân vật
                  </span>
                  <span className="rounded-full bg-rose-100 text-rose-800 px-2.5 py-0.5 text-xs font-bold border border-rose-200">
                    {result.npcRelationshipTitle || (result.overallScore >= 80 ? 'Thân thiết sâu sắc 🤝' : 'Người quen thân thuộc ✨')}
                  </span>
                  <span className="rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-[10px] font-bold">
                    +10 Điểm thân thiết 🔥
                  </span>
                </div>
                <p className="text-xs text-[var(--sumi)] font-medium mt-1">
                  Đối thoại cùng: <strong className="font-semibold text-rose-950">{result.aiPersona || 'Nhân vật AI'}</strong> — Cuộc hội thoại hoàn thành giúp nhân vật ghi nhớ và thấu hiểu bạn sâu sắc hơn!
                </p>
              </div>
            </div>

            {/* Affinity Progress Visualizer */}
            <div className="flex items-center gap-3 bg-white/90 rounded-2xl px-4 py-2.5 border border-rose-200 shadow-2xs">
              <div className="text-right">
                <span className="text-[10px] text-rose-700 font-medium block">Mức độ gắn kết</span>
                <span className="text-sm font-extrabold text-rose-950 font-mono">
                  {Math.min(100, (result.npcAffinityScore || 20))}%
                </span>
              </div>
              <div className="w-24 h-2.5 bg-rose-100 rounded-full overflow-hidden p-0.5 border border-rose-200">
                <div
                  className="h-full bg-gradient-to-r from-rose-400 to-pink-500 rounded-full transition-all duration-1000 ease-out"
                  style={{ width: `${Math.min(100, (result.npcAffinityScore || 20))}%` }}
                />
              </div>
            </div>
          </div>
        </div>

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
                                🔊
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

                          {mission.target && (
                            <p className="mt-1 text-[11px] font-normal text-[var(--sumi-faint)]">
                              Mục tiêu: {mission.target}
                            </p>
                          )}
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

        {/* TARGET VOCABULARY & GRAMMAR REINFORCEMENT                    */}

        {/* ============================================================ */}

        {((result.targetVocabularies && result.targetVocabularies.length > 0) ||
          (result.targetGrammars && result.targetGrammars.length > 0)) && (
          <section className="mt-6 rounded-3xl border border-[var(--line)] bg-[var(--paper-50)]/90 backdrop-blur-xs p-6 sm:p-7 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] pb-4">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--ai)] font-sans">
                <BookmarkIcon className="w-4 h-4 text-[var(--ai)]" />
                <span>Củng cố kiến thức trọng tâm</span>
              </div>

              <span className="text-xs font-semibold text-[var(--sumi-faint)]">
                Nội dung đề xuất ôn tập từ kịch bản này
              </span>
            </div>

            {/* Từ vựng */}

            {result.targetVocabularies &&
              result.targetVocabularies.length > 0 && (
                <div className="mt-5">
                  <h3 className="text-sm font-bold text-[var(--sumi)] mb-3 flex items-center gap-2 font-sans">
                    <span className="grid h-5 w-5 place-items-center rounded-full bg-[var(--ai-soft)] text-[var(--ai)] text-[11px] font-black border border-[var(--ai)]/20">
                      A
                    </span>

                    <span>
                      Từ vựng trọng tâm ({result.targetVocabularies.length} từ)
                    </span>
                    <button
                      type="button"
                      onClick={handleSaveAllToFlashcards}
                      className="ml-auto inline-flex items-center gap-1 rounded-xl border border-[var(--ai)]/30 bg-[var(--ai-soft)] px-2.5 py-1 text-xs font-bold text-[var(--ai)] transition hover:bg-[var(--ai)] hover:text-white active:scale-95 shadow-2xs"
                      title="Lưu toàn bộ từ vựng và ngữ pháp vào kho Flashcard lặp lại ngắt quãng (FSRS)"
                    >
                      <span>{isAllSaved ? "✓" : "＋"}</span>
                      <span>
                        {isAllSaved
                          ? "Đã lưu vào Flashcard (FSRS)"
                          : "Lưu vào Flashcard (FSRS)"}
                      </span>
                    </button>
                  </h3>

                  <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                    {result.targetVocabularies.map((vocab) => (
                      <div
                        key={vocab.id}

                        className="group flex flex-col justify-between rounded-2xl border border-[var(--line)] bg-white p-3.5 transition hover:border-[var(--line-strong)] hover:shadow-xs"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <ruby className="text-base font-black text-[var(--sumi)] font-jp">
                              {vocab.word}

                              {vocab.reading && (
                                <rt className="text-[10px] text-[var(--ai)] font-normal">
                                  {vocab.reading}
                                </rt>
                              )}
                            </ruby>

                            <p className="mt-1 text-xs text-[var(--sumi-muted)] leading-relaxed font-medium">
                              {vocab.meaning}
                            </p>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"

                              onClick={() =>
                                handleCopyText(
                                  `${vocab.word}${vocab.reading ? ` (${vocab.reading})` : ""}: ${vocab.meaning}`,
                                  vocab.id,
                                )
                              }

                              className="inline-flex h-7 w-7 items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--paper-100)] text-xs text-[var(--sumi-muted)] transition hover:bg-white hover:text-[var(--ai)] active:scale-95"

                              title="Sao chép từ vựng"
                            >
                              <CopyIcon className="w-3.5 h-3.5" />
                            </button>

                            <button
                              type="button"
                              onClick={() => playJapaneseAudio(vocab.word)}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--paper-100)] text-xs text-[var(--ai)] transition hover:bg-[var(--ai)] hover:text-white active:scale-95 cursor-pointer"
                              title="Nghe phát âm từ vựng"
                              aria-label={`Nghe phát âm ${vocab.word}`}
                            >
                              🔊
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSaveSingleVocab(vocab)}
                              className={`inline-flex h-7 w-7 items-center justify-center rounded-xl border text-xs transition active:scale-95 ${
                                savedVocabIds.has(vocab.id)
                                  ? "border-emerald-300 bg-emerald-50 text-emerald-600"
                                  : "border-[var(--line)] bg-[var(--paper-100)] text-[var(--sumi-muted)] hover:bg-white hover:text-amber-600"
                              }`}
                              title="Lưu từ này vào Thẻ Flashcard FSRS"
                            >
                              {savedVocabIds.has(vocab.id) ? "✓" : "🔖"}
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            {/* Mẫu ngữ pháp */}

            {result.targetGrammars && result.targetGrammars.length > 0 && (
              <div className="mt-6 border-t border-[var(--line)] pt-5">
                <h3 className="text-sm font-bold text-[var(--sumi)] mb-3 flex items-center gap-2 font-sans">
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-indigo-100 text-indigo-700 text-[11px] font-black border border-indigo-200">
                    G
                  </span>

                  <span>
                    Mẫu câu & Ngữ pháp áp dụng ({result.targetGrammars.length}{" "}
                    mẫu)
                  </span>
                </h3>

                <div className="space-y-2.5">
                  {result.targetGrammars.map((grammar) => (
                    <div
                      key={grammar.id}

                      className="rounded-2xl border border-[var(--line)] bg-white p-3.5 text-xs text-[var(--sumi)] shadow-2xs"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-bold text-[var(--ai)] text-sm font-mono">
                          {grammar.pattern}
                        </span>

                        <span className="font-medium text-[var(--sumi-muted)] font-sans">
                          {grammar.meaning}
                        </span>
                      </div>

                      {grammar.exampleSentence && (
                        <p className="mt-1.5 text-[var(--sumi-faint)] italic border-l-2 border-[var(--ai)]/30 pl-2.5 font-jp">
                          Ví dụ: {grammar.exampleSentence}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* ============================================================ */}

        {/* CONVERSATION TRANSCRIPT REVIEW (XEM LẠI ĐỐI THOẠI CHI TIẾT)  */}

        {/* ============================================================ */}

        {result.messages && result.messages.length > 0 && (
          <section className="mt-6 rounded-3xl border border-[var(--line)] bg-[var(--paper-50)]/90 backdrop-blur-xs p-6 sm:p-7 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] pb-4">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--ai)] font-sans">
                <span>Chi tiết toàn bộ đoạn hội thoại</span>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-[var(--sumi-faint)] font-mono">
                  {result.messages.length} lượt nói
                </span>

                <button
                  type="button"

                  onClick={() => setIsTranscriptOpen(!isTranscriptOpen)}

                  className="rounded-xl border border-[var(--line)] bg-white px-3 py-1 text-xs font-semibold text-[var(--sumi-muted)] hover:bg-[var(--paper-100)] active:scale-95 transition shadow-2xs font-sans"
                >
                  {isTranscriptOpen ? "Thu gọn ▲" : "Mở rộng ▼"}
                </button>
              </div>
            </div>

            {isTranscriptOpen && (
              <div className="mt-5 space-y-4">
                {result.messages.map((msg, index) => {
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
                          <span className="text-xs font-bold text-[var(--sumi-muted)] font-sans">
                            {isUser ? "Bạn đã nói" : "AI phản hồi"}
                          </span>

                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                const textToShadow = sanitizeDisplayJapanese(
                                  msg.japaneseText,
                                );
                                navigate(
                                  `/shadowing?query=${encodeURIComponent(textToShadow)}`,
                                );
                              }}
                              className="inline-flex items-center gap-1 rounded-xl border border-[var(--line)] bg-[var(--paper-100)] px-2.5 py-1 text-[11px] font-semibold text-[var(--sumi-muted)] transition hover:border-[var(--ai)] hover:text-[var(--ai)] active:scale-95"
                              title="Luyện phát âm & ngữ điệu câu này trong Shadowing"
                            >
                              <span>🎙️</span>
                              <span>Shadowing</span>
                            </button>
                            <button
                              type="button"

                              onClick={() =>
                                playJapaneseAudio(
                                  sanitizeDisplayJapanese(msg.japaneseText),
                                )
                              }

                              className="inline-flex items-center gap-1 rounded-xl border border-[var(--line)] bg-[var(--paper-100)] px-2.5 py-1 text-[11px] font-semibold text-[var(--ai)] transition hover:bg-[var(--ai)] hover:text-white active:scale-95"

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

                              className={`inline-flex items-center gap-1 rounded-xl border px-2.5 py-1 text-[11px] font-semibold transition active:scale-95 ${
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

                          {isUser && feedback && (
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                                status.toLowerCase() === "success" ||
                                status.toLowerCase() === "good"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : status.toLowerCase() === "warning"
                                    ? "bg-amber-100 text-amber-800"
                                    : "bg-red-100 text-red-800"
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
                        </div>

                        {/* Japanese Utterance (Khử sạch 100% tiếng Việt bị rò rỉ vào câu thoại tiếng Nhật) */}

                        {msg.furiganaHtml ? (
                          <div
                            className="text-sm sm:text-base font-bold text-[var(--sumi)] leading-relaxed break-words font-jp"

                            dangerouslySetInnerHTML={{
                              __html: sanitizeDisplayJapanese(msg.furiganaHtml),
                            }}
                          />
                        ) : (
                          <p className="text-sm sm:text-base font-bold text-[var(--sumi)] leading-relaxed break-words font-jp">
                            {sanitizeDisplayJapanese(msg.japaneseText)}
                          </p>
                        )}

                        {/* Vietnamese Meaning */}

                        {msg.vietnameseMeaning &&
                          msg.vietnameseMeaning.trim() !==
                            msg.japaneseText.trim() && (
                            <p className="text-xs text-[var(--sumi-muted)] leading-relaxed italic">
                              Dịch nghĩa: {msg.vietnameseMeaning}
                            </p>
                          )}

                        {/* User Feedback Detail */}

                        {isUser && feedback && (
                          <div className="mt-2 rounded-2xl bg-[var(--paper-50)] p-3.5 border border-[var(--line)] text-xs space-y-1 shadow-2xs">
                            {feedback.summary && (
                              <p className="font-semibold text-[var(--sumi)]">
                                {feedback.summary}
                              </p>
                            )}

                            {feedback.speechDelivery && (
                              <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px]">
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
                                    ⚡ Phản xạ:{" "}
                                    {feedback.speechDelivery.responseLatencySeconds.toFixed(
                                      1,
                                    )}
                                    s
                                  </span>
                                )}

                                {typeof feedback.speechDelivery.speechPace ===
                                  "number" && (
                                  <span className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2 py-0.5 font-semibold text-blue-800 border border-blue-200/60 font-mono">
                                    Tốc độ:{" "}
                                    {feedback.speechDelivery.speechPace.toFixed(
                                      1,
                                    )}{" "}
                                    ký tự/s
                                  </span>
                                )}
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

                        {/* Audio Waveform Player (Lưu trữ và phát lại trực quan đồng bộ) */}

                        {isUser && (
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
                    🧭
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
                      <span>⚡</span>
                      <span>{isStartingBlind ? "Đang mở phòng..." : "Thử thách Blind 10s"}</span>
                    </button>
                  )}
                  <Link
                    to="/profile#radar-map"
                    className="inline-flex items-center gap-1.5 rounded-2xl border border-[var(--line)] bg-white hover:bg-[var(--paper-100)] px-3.5 py-2.5 text-xs font-bold text-[var(--sumi)] shadow-2xs active:scale-95 transition cursor-pointer"
                  >
                    <span>📊</span>
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
                          <span className="text-[10px] opacity-90">✨</span>
                          <span className="font-black text-sm tracking-tight leading-none">{item.matchScore}%</span>
                          <span className="text-[10px] font-medium opacity-90">phù hợp</span>
                        </div>
                      </div>

                      {/* Header Kịch bản: Bố cục Đỉnh cao với Avatar/Icon khung vuông tinh tế */}
                      <div className="flex items-start gap-3.5 mb-3">
                        {/* Hộp Icon 3D phong cách Nhật Bản Wabi-Sabi */}
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100 border border-[var(--line)] flex items-center justify-center shrink-0 shadow-2xs text-2xl select-none">
                          {item.icon}
                        </div>

                        {/* Tiêu đề & Cấp độ JLPT xếp tầng khoa học */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="px-2 py-0.5 rounded-md bg-[var(--ai-soft)] text-[var(--ai)] text-[10px] font-extrabold font-mono border border-[var(--ai)]/20 shadow-2xs uppercase tracking-wide">
                              JLPT {item.level}
                            </span>
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
                          <span className="text-rose-500">🎯</span>
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

                      <div className="grid grid-cols-2 gap-2">
                        <Link
                          to={`/flashcards?tab=bookmarks&level=${item.level}`}
                          className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-amber-300/80 bg-amber-50/80 hover:bg-amber-100/90 py-2 text-xs font-bold text-amber-900 transition active:scale-95 shadow-2xs"
                          title="Luyện từ vựng trọng tâm của kịch bản"
                        >
                          <span>🎴</span>
                          <span>Flashcard</span>
                        </Link>

                        <Link
                          to={`/shadowing?query=${encodeURIComponent(item.title)}`}
                          className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-teal-300/80 bg-teal-50/80 hover:bg-teal-100/90 py-2 text-xs font-bold text-teal-900 transition active:scale-95 shadow-2xs"
                          title="Luyện nói Shadowing ngữ điệu câu thoại"
                        >
                          <span>🎙️</span>
                          <span>Shadowing</span>
                        </Link>
                      </div>
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
                🔄 Luyện lại kịch bản này
              </Link>
            )}
            <Link
              to={`/flashcards?tab=bookmarks&level=${result.jlptLevel || "All"}`}
              className="rounded-xl border border-amber-300 bg-amber-50/90 hover:bg-amber-100 px-4 py-2.5 text-xs font-bold text-amber-900 shadow-2xs transition active:scale-95"
            >
              🎴 Ôn tập từ vựng & Flashcards
            </Link>
            <Link
              to="/profile#radar-map"
              className="rounded-xl border border-[var(--ai)]/30 bg-[var(--ai-soft)] hover:bg-[var(--ai)] hover:text-white px-4 py-2.5 text-xs font-bold text-[var(--ai)] shadow-2xs transition active:scale-95 flex items-center gap-1"
            >
              <span>📊</span>
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
                <span>🗺️</span>
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
