import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../contexts/AuthContext';
import { ukiyoSound } from '../../utils/ukiyoSoundEngine';

const Sparkles: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z" />
  </svg>
);

const ToriiIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 6c5-1.5 13-1.5 18 0" />
    <path d="M5 10h14" />
    <path d="M7 6.5V20" />
    <path d="M17 6.5V20" />
    <path d="M12 6v4" />
  </svg>
);

const ScrollIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 17V5a2 2 0 0 0-2-2H4" />
    <path d="M8 21h11a2 2 0 0 0 2-2v-2H6" />
    <path d="M15 17a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2" />
  </svg>
);

const CoinsIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="8" cy="8" r="6" />
    <path d="M18.09 10.37A6 6 0 1 1 10.34 18" />
    <path d="m7 6 2 4" />
    <path d="m9 6-2 4" />
  </svg>
);

/** Ống quẻ gỗ bát giác thủ công (SVG 3 mặt vát + đai đồng cổ) */
const OctagonalShakerSvg: React.FC = () => (
  <svg viewBox="0 0 120 180" className="w-28 h-40 drop-shadow-[0_14px_24px_rgba(69,10,10,0.28)]" aria-hidden="true">
    <defs>
      <linearGradient id="omikujiWoodCenter" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#6D3418" />
        <stop offset="50%" stopColor="#8B4520" />
        <stop offset="100%" stopColor="#582710" />
      </linearGradient>
      <linearGradient id="omikujiWoodSideL" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#461E0B" />
        <stop offset="100%" stopColor="#6D3418" />
      </linearGradient>
      <linearGradient id="omikujiWoodSideR" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#582710" />
        <stop offset="100%" stopColor="#351506" />
      </linearGradient>
      <linearGradient id="omikujiBrass" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#B47B2B" />
        <stop offset="50%" stopColor="#F4D58D" />
        <stop offset="100%" stopColor="#9A641E" />
      </linearGradient>
    </defs>

    {/* Que tre khẽ nhô lên ở đỉnh miệng ống */}
    <g className="origin-bottom" style={{ animation: 'jcap-stick-peek 0.55s ease-in-out infinite alternate' }}>
      <rect x="57" y="6" width="6" height="24" rx="2" fill="#E8C988" stroke="#9A6B24" strokeWidth="1" />
      <rect x="57" y="6" width="6" height="5" rx="1" fill="#B91C1C" />
    </g>

    {/* Thân ống bát giác 3 mặt */}
    <polygon points="24,28 38,22 38,162 24,154" fill="url(#omikujiWoodSideL)" />
    <rect x="38" y="22" width="44" height="140" fill="url(#omikujiWoodCenter)" />
    <polygon points="82,22 96,28 96,154 82,162" fill="url(#omikujiWoodSideR)" />

    {/* Nắp trên & khe xuất quẻ */}
    <polygon points="24,28 38,22 82,22 96,28 82,34 38,34" fill="#4A210D" stroke="#2D1206" strokeWidth="1" />
    <ellipse cx="60" cy="28" rx="7" ry="2.5" fill="#1C0B04" />

    {/* Đai đồng cổ trên & dưới */}
    <path d="M24,42 L38,38 L82,38 L96,42 L96,48 L82,44 L38,44 L24,48 Z" fill="url(#omikujiBrass)" opacity="0.92" />
    <path d="M24,140 L38,144 L82,144 L96,140 L96,146 L82,150 L38,150 L24,146 Z" fill="url(#omikujiBrass)" opacity="0.92" />

    {/* Chữ Hán khắc dọc chính tâm */}
    <text
      x="60"
      y="72"
      textAnchor="middle"
      fill="#F3D999"
      fontSize="14"
      fontWeight="900"
      fontFamily="serif"
      opacity="0.9"
    >
      <tspan x="60" dy="0">御</tspan>
      <tspan x="60" dy="18">神</tspan>
      <tspan x="60" dy="18">籤</tspan>
      <tspan x="60" dy="18">筒</tspan>
    </text>
  </svg>
);

export type OmikujiRank = '大吉' | '中吉' | '小吉' | '吉' | '末吉' | '凶';

export interface OmikujiFortune {
  rank: OmikujiRank;
  rankTitleVi: string;
  wakaJapanese: string;
  wakaRomaji: string;
  wakaMeaningVi: string;
  teachingSummary: string;
  aspects: {
    gakumon: string;
    taiwa: string;
    machibito: string;
    kokorogamae: string;
  };
  shrineSealText: string;
  luckyNumber: number;
}

export const COIN_REWARDS: Record<OmikujiRank, { coins: number; labelVi: string; kanjiTitle: string }> = {
  大吉: { coins: 15, labelVi: 'Đại Cát Phúc Lộc', kanjiTitle: '大吉福禄' },
  中吉: { coins: 10, labelVi: 'Trung Cát Hưng Vượng', kanjiTitle: '中吉興旺' },
  小吉: { coins: 5, labelVi: 'Tiểu Cát Tiến Bộ', kanjiTitle: '小吉進歩' },
  吉: { coins: 5, labelVi: 'Cát Tường Bình An', kanjiTitle: '吉事円満' },
  末吉: { coins: 3, labelVi: 'Mạt Cát Hậu Vận', kanjiTitle: '大器晩成' },
  凶: { coins: 3, labelVi: 'Hóa Hung Thành Cát', kanjiTitle: '厄災消除' },
};

const OMIKUJI_DATABASE: Record<OmikujiRank, OmikujiFortune[]> = {
  大吉: [
    {
      rank: '大吉',
      rankTitleVi: 'Đại Cát · Vận khí rạng ngời',
      wakaJapanese: '言の葉に花咲きて 心和らぐ',
      wakaRomaji: 'Koto no ha ni hana sakite',
      wakaMeaningVi: 'Lời chân thành nở hoa, lòng người ấm áp giao hòa.',
      teachingSummary: 'Thần thái ung dung, ngôn từ tự nhiên mở lối hanh thông.',
      aspects: {
        gakumon: 'Phản xạ nhạy bén, từ vựng chuẩn xác.',
        taiwa: 'Lắng nghe nhã nhặn, đối đáp tròn trịa.',
        machibito: 'Gặp quý nhân dẫn lối, vận hội rộng mở.',
        kokorogamae: 'Giữ tâm khiêm nhường, tiến bước vững xa.',
      },
      shrineSealText: '大吉福寿',
      luckyNumber: 7,
    },
  ],
  中吉: [
    {
      rank: '中吉',
      rankTitleVi: 'Trung Cát · Tiến bước vững vàng',
      wakaJapanese: '雨過ぎて地固まり 言葉茂る',
      wakaRomaji: 'Ame sugite ji katamari',
      wakaMeaningVi: 'Sau cơn mưa đất thêm vững, cành lá ngôn từ xanh tươi.',
      teachingSummary: 'Nền tảng vững chãi, phản xạ đang dần thành bản năng.',
      aspects: {
        gakumon: 'Chắc mẫu câu, trau chuốt thêm trợ từ.',
        taiwa: 'Giữ nhịp hòa nhã, mạnh dạn mở rộng ý.',
        machibito: 'Thầy bạn quanh mình, hỏi chậm sẽ thông.',
        kokorogamae: 'Tích tiểu thành đại, trăm sông về biển.',
      },
      shrineSealText: '中吉安泰',
      luckyNumber: 3,
    },
  ],
  小吉: [
    {
      rank: '小吉',
      rankTitleVi: 'Tiểu Cát · Chồi non nảy nở',
      wakaJapanese: '春風に誘われ 若草萌ゆる',
      wakaRomaji: 'Harukaze ni sasoware wakakusa moyuru',
      wakaMeaningVi: 'Gió xuân lay nhẹ, mầm xanh lặng lẽ đơm chồi.',
      teachingSummary: 'Dũng cảm cất lời, mầm tiến bộ đang từng ngày nảy lộc.',
      aspects: {
        gakumon: 'Vững câu cơ bản, chú ý trường âm.',
        taiwa: 'Nói trọn chủ vị, tránh cộc lốc.',
        machibito: 'Kiên nhẫn thẩm thấu, duyên học sẽ đến.',
        kokorogamae: 'Mỗi lần sửa sai là một bước gần đích.',
      },
      shrineSealText: '小吉進歩',
      luckyNumber: 5,
    },
  ],
  吉: [
    {
      rank: '吉',
      rankTitleVi: 'Cát · Bình an thuận hòa',
      wakaJapanese: '清き小川 たゆまず海へ',
      wakaRomaji: 'Kiyoki ogawa tayumazu umi e',
      wakaMeaningVi: 'Suối trong dẫu nhỏ vẫn bền bỉ hướng ra biển lớn.',
      teachingSummary: 'Khởi sắc bình yên, thong thả mà vững bước đường dài.',
      aspects: {
        gakumon: 'Ôn chắc từ khóa trước giờ đối thoại.',
        taiwa: 'Giữ thể lịch sự, tạo cảm giác tin cậy.',
        machibito: 'Môi trường thuận hòa, dễ gặp người chỉ dẫn.',
        kokorogamae: 'Không vội vàng, bền chí ắt tinh thông.',
      },
      shrineSealText: '吉事円満',
      luckyNumber: 1,
    },
  ],
  末吉: [
    {
      rank: '末吉',
      rankTitleVi: 'Mạt Cát · Hậu vận rạng ngời',
      wakaJapanese: '冬木立ち 春待ちわびて花咲かむ',
      wakaRomaji: 'Fuyukodachi haru machiwabite hana sakamu',
      wakaMeaningVi: 'Cây qua mùa đông đợi nắng ấm, khắc hoa bừng nở ắt quay về.',
      teachingSummary: 'Nội lực đang âm thầm tích tụ, kiên trì ắt gặt quả ngọt.',
      aspects: {
        gakumon: 'Chia cụm ngắn, bám sát từ khóa.',
        taiwa: 'Nói chậm rõ chữ hơn là nói nhanh.',
        machibito: 'Chủ động rèn thêm ngoài giờ luyện.',
        kokorogamae: 'Khổ tận cam lai, ngày mai rực rỡ.',
      },
      shrineSealText: '大器晩成',
      luckyNumber: 9,
    },
  ],
  凶: [
    {
      rank: '凶',
      rankTitleVi: 'Hung · Chuyển hóa nghịch cảnh',
      wakaJapanese: '荒波を乗り越え 静けき港へ',
      wakaRomaji: 'Aranami wo norikoe shizukeki minato e',
      wakaMeaningVi: 'Vững tay chèo vượt sóng dữ, ắt cập bến bờ bình yên.',
      teachingSummary: 'Thử thách rèn bản lĩnh; buộc sớ giải hạn để mở vận mới.',
      aspects: {
        gakumon: 'Xem lại ngay các lỗi trợ từ vừa gặp.',
        taiwa: 'Giữ đuôi câu lịch sự, tránh nói bồi.',
        machibito: 'Lắng nghe kỹ ngữ cảnh trước khi đáp.',
        kokorogamae: 'Chạm đáy là điểm tựa bật lên.',
      },
      shrineSealText: '厄災消除',
      luckyNumber: 4,
    },
  ],
};

export interface OmikujiFortuneCardProps {
  score: number;
  scenarioTitle?: string;
  resultId?: string | number;
  className?: string;
}

export const OmikujiFortuneCard: React.FC<OmikujiFortuneCardProps> = ({
  score,
  scenarioTitle,
  resultId,
  className = '',
}) => {
  const { user } = useAuth();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [ceremonyStep, setCeremonyStep] = useState<'shaking' | 'revealedStick' | 'unfurled'>('shaking');
  const timersRef = useRef<number[]>([]);

  const clearCeremonyTimers = () => {
    timersRef.current.forEach((t) => window.clearTimeout(t));
    timersRef.current = [];
  };

  useEffect(() => clearCeremonyTimers, []);

  const storageKey = resultId ? `jcap_omikuji_claimed_${resultId}` : null;
  const [hasClaimedCoins, setHasClaimedCoins] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && storageKey) {
      return localStorage.getItem(storageKey) === 'true';
    }
    return false;
  });
  const [claimAction, setClaimAction] = useState<'tied' | 'saved' | null>(() => {
    if (typeof window !== 'undefined' && storageKey) {
      const savedType = localStorage.getItem(`${storageKey}_type`);
      return (savedType as 'tied' | 'saved') || null;
    }
    return null;
  });

  const deducedRank: OmikujiRank = (() => {
    if (score >= 90) return '大吉';
    if (score >= 78) return '中吉';
    if (score >= 68) return '小吉';
    if (score >= 55) return '吉';
    if (score >= 40) return '末吉';
    return '凶';
  })();

  const activeFortune = OMIKUJI_DATABASE[deducedRank][0];
  const reward = COIN_REWARDS[deducedRank];

  const handleOpenCeremony = () => {
    clearCeremonyTimers();
    ukiyoSound.playWoodblockSnap();
    setIsModalOpen(true);

    // Nếu đã nhận xu, mở thẳng lá sớ đã thỉnh, khóa tuyệt đối việc gieo lại
    if (hasClaimedCoins) {
      setCeremonyStep('unfurled');
      return;
    }

    setCeremonyStep('shaking');

    const t1 = window.setTimeout(() => ukiyoSound.playWoodblockSnap(), 360);
    const t2 = window.setTimeout(() => ukiyoSound.playWoodblockSnap(), 720);
    const t3 = window.setTimeout(() => {
      setCeremonyStep('revealedStick');
      ukiyoSound.playSubtleTap();
    }, 1150);

    timersRef.current = [t1, t2, t3];
  };

  const handleCloseModal = () => {
    clearCeremonyTimers();
    ukiyoSound.playSubtleTap();
    setIsModalOpen(false);
  };

  const handleUnfurlScroll = () => {
    ukiyoSound.playMigotoChime();
    setCeremonyStep('unfurled');
  };

  const persistCoinClaim = (action: 'tied' | 'saved') => {
    if (hasClaimedCoins) return;
    ukiyoSound.playCoinJingle();

    const currentBalance = typeof user?.creditBalance === 'number' ? user.creditBalance : 0;
    const newBalance = currentBalance + reward.coins;
    window.dispatchEvent(
      new CustomEvent('jcap_profile_updated', {
        detail: { creditBalance: newBalance },
      })
    );

    setHasClaimedCoins(true);
    setClaimAction(action);

    if (storageKey) {
      try {
        localStorage.setItem(storageKey, 'true');
        localStorage.setItem(`${storageKey}_type`, action);
      } catch {
        // ignore storage errors
      }
    }
  };

  const getRankBadgeClasses = (rank: OmikujiRank) => {
    switch (rank) {
      case '大吉':
        return 'bg-gradient-to-r from-amber-600 to-rose-700 text-white';
      case '中吉':
      case '小吉':
        return 'bg-rose-100 text-rose-800 border border-rose-300';
      case '吉':
      case '末吉':
        return 'bg-amber-100 text-amber-900 border border-amber-300';
      case '凶':
        return 'bg-slate-800 text-slate-100 border border-slate-700';
    }
  };

  return (
    <>
      <style>{`
        @keyframes jcap-omikuji-shake {
          0%, 100% { transform: translate3d(0, 0, 0) rotate(0deg); }
          20% { transform: translate3d(-4px, -3px, 0) rotate(-7deg); }
          40% { transform: translate3d(4px, 2px, 0) rotate(7deg); }
          60% { transform: translate3d(-3px, -2px, 0) rotate(-5deg); }
          80% { transform: translate3d(3px, 1px, 0) rotate(5deg); }
        }
        @keyframes jcap-stick-peek {
          0% { transform: translate3d(0, 4px, 0); }
          100% { transform: translate3d(0, -6px, 0); }
        }
      `}</style>

      {/* 1. THẺ BENTO NGOÀI (SHINTO TALISMAN CARD - ALIGNED TOP, COMPACT, NO WRAP CHAOS) */}
      <div
        className={`relative flex flex-col justify-between overflow-hidden rounded-3xl border transition-all duration-300 p-5 shadow-xs hover:shadow-sm ${
          hasClaimedCoins
            ? 'border-emerald-200/90 bg-gradient-to-br from-[#F4FAF6] via-white to-[#EEF8F2] hover:border-emerald-300'
            : 'border-amber-200/90 bg-gradient-to-br from-[#FFF9EF] via-[#FFFDF9] to-[#FEF4DF] hover:border-amber-300'
        } ${className}`}
      >
        <div className="absolute -right-2 -bottom-4 text-5xl font-serif font-black text-amber-900/[0.04] select-none pointer-events-none">
          御神籤
        </div>

        <div>
          {/* Header 1 dòng gọn tắp giống Tile 1, không bao giờ cắt chữ Quẻ Vận Đ... */}
          <div className="flex items-center justify-between gap-2 mb-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-white shadow-2xs ${
                  hasClaimedCoins
                    ? 'bg-gradient-to-tr from-emerald-600 to-teal-600'
                    : 'bg-gradient-to-tr from-[#991B1B] to-amber-600'
                }`}
              >
                <ToriiIcon className="w-4 h-4 text-white" />
              </div>
              <h3 className="text-xs font-bold text-[var(--sumi)] font-sans whitespace-nowrap">
                Quẻ Vận Đền Thờ
              </h3>
            </div>

            <span
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-black font-serif tracking-wider shrink-0 whitespace-nowrap ${getRankBadgeClasses(
                activeFortune.rank
              )}`}
            >
              {activeFortune.rank}
            </span>
          </div>

          {/* Dòng trạng thái Phúc Lộc & Số quẻ */}
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-[10px] font-medium text-stone-500 font-serif whitespace-nowrap">
              御神籤 · Thẻ #{activeFortune.luckyNumber}
            </span>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold font-mono whitespace-nowrap ${
                hasClaimedCoins
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                  : 'bg-amber-100 text-amber-900 border border-amber-300'
              }`}
            >
              {hasClaimedCoins ? `✓ Đã nhận +${reward.coins} Xu` : `+${reward.coins} Xu phúc lộc`}
            </span>
          </div>

          {/* 1 câu thơ sấm cô đọng nghệ thuật */}
          <div className="border-l-2 border-[#c23a2b]/50 pl-3 py-0.5">
            <p className="text-[11px] font-serif text-stone-400 tracking-wide truncate">
              {activeFortune.wakaJapanese}
            </p>
            <p className="text-xs text-stone-700 font-medium leading-relaxed mt-0.5 line-clamp-2 italic">
              "{activeFortune.teachingSummary}"
            </p>
          </div>
        </div>

        <div className="pt-3 mt-2 border-t border-amber-200/50">
          {hasClaimedCoins ? (
            <button
              type="button"
              onClick={handleOpenCeremony}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-emerald-200 bg-white px-3.5 py-2 text-xs font-bold text-emerald-900 shadow-2xs hover:bg-emerald-50/70 transition active:scale-[0.98] cursor-pointer"
            >
              <ScrollIcon className="w-3.5 h-3.5 text-emerald-700" />
              <span>Xem lại sớ đã thỉnh ({activeFortune.rank})</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleOpenCeremony}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#991B1B] to-[#B91C1C] px-4 py-2 text-xs font-bold text-white shadow-sm hover:brightness-110 transition active:scale-[0.98] cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-200" />
              <span>Gieo quẻ nhận +{reward.coins} Xu</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. MODAL NGHI THỨC KHAI QUẺ WASHI (CHUẨN PRO UI/UX - GỌN GÀNG KHÔNG CUỘN DÀI) */}
      {isModalOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/65 backdrop-blur-xs p-4 animate-fade-in"
            onClick={(e) => {
              if (e.target === e.currentTarget) handleCloseModal();
            }}
          >
            <div className="relative w-full max-w-md bg-[#FAF6EE] rounded-[28px] border border-stone-300/90 shadow-2xl overflow-hidden flex flex-col">
              {/* Header Sơn Mài Chu Sa Ấm Áp */}
              <div className="bg-gradient-to-r from-[#2D1414] via-[#4A1818] to-[#2D1414] text-stone-100 px-5 py-3.5 flex items-center justify-between gap-3 border-b border-amber-400/25 shrink-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/10 border border-amber-300/30 text-amber-200">
                    <ToriiIcon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-sm font-serif font-bold text-amber-50 tracking-wide truncate">
                      Nghi thức Khai quẻ · 神社御神籤
                    </h2>
                    <p className="text-[11px] text-amber-200/75 truncate font-sans">
                      {scenarioTitle || 'Chiêm nghiệm tiến trình ngôn ngữ'}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="w-7 h-7 shrink-0 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/15 text-stone-300 hover:text-white transition cursor-pointer text-xs"
                  aria-label="Đóng quẻ"
                  title="Đóng quẻ"
                >
                  ✕
                </button>
              </div>

              {/* Thân Modal */}
              <div className="p-5 sm:p-6 bg-[#FAF6EE] max-h-[82vh] overflow-y-auto">
                {ceremonyStep === 'shaking' && (
                  <div className="py-8 flex flex-col items-center justify-center gap-5 text-center">
                    <div style={{ animation: 'jcap-omikuji-shake 0.45s ease-in-out infinite' }}>
                      <OctagonalShakerSvg />
                    </div>
                    <div className="space-y-1">
                      <p className="inline-flex items-center px-3.5 py-1 rounded-full bg-amber-100/90 text-amber-950 text-xs font-bold border border-amber-300/80">
                        Đang thành tâm lắc ống quẻ bát giác...
                      </p>
                      <p className="text-xs text-stone-500 font-serif">
                        Lắng tâm đón nhận lời sấm ngôn ngữ từ thần điện
                      </p>
                    </div>
                  </div>
                )}

                {ceremonyStep === 'revealedStick' && (
                  <div className="py-5 flex flex-col items-center justify-center gap-5 text-center animate-modal-pop">
                    {/* Que xăm gỗ Hinoki tinh xảo */}
                    <div className="w-12 h-44 rounded-lg bg-gradient-to-b from-[#DFBE7D] via-[#F2DFB4] to-[#CDA45E] border border-amber-700/60 shadow-lg flex flex-col items-center justify-between py-2.5 px-1 select-none">
                      <span className="w-5 h-5 rounded-full border border-[#b91c1c] bg-white/80 text-[10px] font-serif font-black text-[#b91c1c] flex items-center justify-center">
                        神
                      </span>
                      <span className="text-sm font-serif font-black text-amber-950 tracking-widest [writing-mode:vertical-rl]">
                        第{activeFortune.luckyNumber}番
                      </span>
                      <span className="px-1.5 py-0.5 rounded border border-[#b91c1c]/80 bg-white/85 text-[11px] font-serif font-black text-[#b91c1c]">
                        {activeFortune.rank}
                      </span>
                    </div>

                    <div className="space-y-2">
                      <h3 className="text-sm font-bold font-sans text-stone-900">
                        Rút được thẻ thứ {activeFortune.luckyNumber} · {activeFortune.rankTitleVi}
                      </h3>
                      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 border border-amber-300 text-amber-950 text-xs font-bold font-mono">
                        <CoinsIcon className="w-3.5 h-3.5 text-amber-700" />
                        <span>Phúc lộc: +{reward.coins} Xu</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleUnfurlScroll}
                      className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#991B1B] to-[#B91C1C] px-6 py-2.5 text-xs sm:text-sm font-bold text-white shadow-md hover:brightness-110 transition active:scale-[0.98] cursor-pointer"
                    >
                      <ScrollIcon className="w-4 h-4 text-amber-200" />
                      <span>Mở sớ quẻ Washi</span>
                    </button>
                  </div>
                )}

                {ceremonyStep === 'unfurled' && (
                  <div className="relative rounded-2xl border border-stone-300/80 bg-[#FFFDF9] p-4 sm:p-5 shadow-xs space-y-3.5 animate-modal-pop">
                    {/* Hàng đầu sớ: Số quẻ + Ấn triện nghệ thuật tách lớp */}
                    <div className="flex items-center justify-between gap-3 pb-3 border-b border-stone-200/80">
                      <div className="min-w-0">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-stone-400 font-mono block">
                          第 {activeFortune.luckyNumber} 番 · {reward.kanjiTitle}
                        </span>
                        <h3 className="text-sm font-bold text-stone-900 font-sans mt-0.5 truncate">
                          {activeFortune.rankTitleVi}
                        </h3>
                        <span className="inline-flex items-center gap-1 mt-1.5 px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300/80 text-[11px] font-bold font-mono">
                          <CoinsIcon className="w-3 h-3 text-amber-700" />
                          <span>
                            {hasClaimedCoins ? `Đã nhận +${reward.coins} Xu` : `Phúc lộc: +${reward.coins} Xu`}
                          </span>
                        </span>
                      </div>

                      {/* Con dấu triện nghệ thuật Đỏ Chu Sa (tách lớp SVG filter chỉ lên dấu mực) */}
                      <div className="shrink-0 bg-[#FFFDF7] rounded-xl p-1 border border-stone-200/80 shadow-2xs">
                        <div
                          className="w-16 h-16 rounded-lg border-2 border-[#b91c1c] p-1 flex flex-col items-center justify-center text-[#b91c1c] rotate-[-3deg] select-none"
                          style={{ filter: 'url(#jc-inkfx)', mixBlendMode: 'multiply' }}
                          title={`Triện Thần Điện: ${activeFortune.shrineSealText}`}
                        >
                          <div className="w-full h-full rounded border border-[#b91c1c]/70 flex flex-col items-center justify-center leading-none">
                            <span className="text-[7px] font-serif font-bold tracking-widest">神社之印</span>
                            <span className="text-xl font-serif font-black my-0.5 leading-none">{activeFortune.rank}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Bài thơ Waka & Tinh hoa đạo lý (Cô đọng 1 khối duy nhất) */}
                    <div className="rounded-xl border border-amber-200/70 bg-amber-50/45 px-3.5 py-2.5 text-center space-y-1">
                      <p className="font-serif font-bold text-sm text-stone-900 tracking-wide">
                        「 {activeFortune.wakaJapanese} 」
                      </p>
                      <p className="text-xs text-stone-700 font-serif italic leading-snug">
                        {activeFortune.wakaMeaningVi}
                      </p>
                    </div>

                    {/* 4 Trụ Khẩu Quyết Cô Đọng (Tối đa 5-7 chữ mỗi ô, không lệch hàng) */}
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { tag: '【学問】Học vấn', text: activeFortune.aspects.gakumon },
                        { tag: '【対話】Đối đáp', text: activeFortune.aspects.taiwa },
                        { tag: '【好機】Vận hội', text: activeFortune.aspects.machibito },
                        { tag: '【心構】Tâm thế', text: activeFortune.aspects.kokorogamae },
                      ].map((item) => (
                        <div
                          key={item.tag}
                          className="rounded-xl border border-stone-200/80 bg-white px-3 py-2 flex flex-col justify-between"
                        >
                          <span className="text-[10px] font-bold text-stone-900 font-sans block mb-0.5 whitespace-nowrap">
                            {item.tag}
                          </span>
                          <p className="text-[11px] text-stone-600 leading-snug">
                            {item.text}
                          </p>
                        </div>
                      ))}
                    </div>

                    {/* Hành động nghi thức — Khóa hoàn toàn re-roll sau khi nhận xu */}
                    <div className="pt-2.5 border-t border-stone-200/80">
                      {hasClaimedCoins ? (
                        <div className="space-y-2">
                          <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-emerald-900 bg-emerald-50 py-2 px-3 rounded-xl border border-emerald-200 text-center">
                            <CoinsIcon className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                            <span>
                              {claimAction === 'tied'
                                ? `Đã buộc sớ giải hạn · Nhận +${reward.coins} Xu bình an`
                                : `Đã thỉnh bùa hộ mệnh · Nhận +${reward.coins} Xu may mắn`}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={handleCloseModal}
                            className="w-full py-2.5 rounded-xl bg-stone-900 text-stone-100 font-bold text-xs hover:bg-black transition active:scale-[0.98] cursor-pointer"
                          >
                            Đóng sớ quẻ
                          </button>
                        </div>
                      ) : activeFortune.rank === '凶' || activeFortune.rank === '末吉' ? (
                        <button
                          type="button"
                          onClick={() => persistCoinClaim('tied')}
                          className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-stone-900 px-5 py-2.5 text-xs font-bold text-white hover:bg-black transition active:scale-[0.98] cursor-pointer shadow-xs"
                        >
                          <CoinsIcon className="w-4 h-4 text-amber-300" />
                          <span>Buộc sớ giải hạn & Nhận +{reward.coins} Xu</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => persistCoinClaim('saved')}
                          className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#991B1B] to-[#B91C1C] px-5 py-2.5 text-xs font-bold text-white hover:brightness-110 transition active:scale-[0.98] cursor-pointer shadow-xs"
                        >
                          <CoinsIcon className="w-4 h-4 text-amber-200" />
                          <span>Thỉnh bùa bình an & Nhận +{reward.coins} Xu</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
};
