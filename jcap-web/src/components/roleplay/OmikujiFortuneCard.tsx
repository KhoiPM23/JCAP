import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { ukiyoSound } from '../../utils/ukiyoSoundEngine';

const Sparkles: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/></svg>
);
const Scroll: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 17V5a2 2 0 0 0-2-2H4"/><path d="M8 21h11a2 2 0 0 0 2-2v-2H6"/><path d="M15 17a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2"/></svg>
);
const Compass: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>
);
const BookOpen: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
);
const MessageSquare: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
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
    gakumon: string;      // Học vấn & Khả năng ngôn ngữ
    taiwa: string;        // Giao tiếp & Kính ngữ
    machibito: string;    // Cơ hội & Gặp gỡ
    kokorogamae: string;  // Lời răn tâm thế
  };
  shrineSealText: string;
  luckyNumber: number;
}

const OMIKUJI_DATABASE: Record<OmikujiRank, OmikujiFortune[]> = {
  大吉: [
    {
      rank: '大吉',
      rankTitleVi: 'Đại Cát · Vận khí rực rỡ',
      wakaJapanese: '言の葉を つむぐ心に 花咲きて 人の心を 和らぐるなり',
      wakaRomaji: 'Koto no ha wo / tsumugu kokoro ni / hana sakite / hito no kokoro wo / yawaraguru nari',
      wakaMeaningVi: 'Lời nói thêu dệt tự đáy lòng như hoa khoe sắc, làm dịu dàng và kết nối tâm tư muôn người.',
      teachingSummary: 'Phản xạ và thần thái tự nhiên đạt độ chín muồi. Những câu nói chân thành mở ra sự tin tưởng tuyệt đối từ người bản xứ.',
      aspects: {
        gakumon: 'Ngữ điệu tự nhiên, từ vựng chuẩn xác. Hãy tự tin nâng cấp lên các mẫu đàm thoại Keigo nâng cao.',
        taiwa: 'Lắng nghe nhịp thở của người đối diện, đối đáp trôi chảy không do dự.',
        machibito: 'Cơ hội kết giao bạn bè bản xứ và phỏng vấn việc làm tại Nhật đang mở rộng.',
        kokorogamae: 'Giữ đức khiêm nhường; lấy sự lắng nghe làm gốc của mọi sự cảm thông.'
      },
      shrineSealText: '大吉福寿',
      luckyNumber: 7
    },
    {
      rank: '大吉',
      rankTitleVi: 'Đại Cát · Phong thái ung dung',
      wakaJapanese: '雲晴れて 照る日の光 さしそえば 行く手千里も まどかなるべし',
      wakaRomaji: 'Kumo harete / teru hi no hikari / sashisoeba / yukute senri mo / madoka narubeshi',
      wakaMeaningVi: 'Mây tan nắng rạng soi lối bước, dẫu vạn dặm đường xa phía trước cũng thênh thang sáng tỏ.',
      teachingSummary: 'Tâm lý ngại nói đã được xóa bỏ hoàn toàn. Tiếng Nhật giờ đây là cầu nối tự nhiên trong đời sống.',
      aspects: {
        gakumon: 'Nắm chắc ngữ pháp cốt lõi, phản xạ tức thì dưới 1 giây.',
        taiwa: 'Nói năng khúc chiết, biết đệm lời Aizuchi đúng thời điểm.',
        machibito: 'Sắp gặp gỡ người thầy hoặc bạn đồng hành truyền cảm hứng lớn.',
        kokorogamae: 'Thừa thắng xông lên, tiếp tục thử thách các tình huống thực tế hóc búa hơn.'
      },
      shrineSealText: '神光照覧',
      luckyNumber: 8
    }
  ],
  中吉: [
    {
      rank: '中吉',
      rankTitleVi: 'Trung Cát · Tiến bước vững vàng',
      wakaJapanese: '雨ふりて 地固まる如 試練越え ことばの枝も 茂りゆくらむ',
      wakaRomaji: 'Ame furite / ji katamaru goto / shiren koe / kotoba no eda mo / shigeri yukuran',
      wakaMeaningVi: 'Sau cơn mưa đất càng thêm vững, vượt qua bỡ ngỡ bước đầu thì cành lá ngôn từ sẽ xum xuê tốt tươi.',
      teachingSummary: 'Kiến thức ngôn ngữ đang chuyển hóa thành phản xạ bản năng. Chỉ cần duy trì nhịp độ luyện tập đều đặn.',
      aspects: {
        gakumon: 'Các cấu trúc cơ bản đã thuần thục. Chú ý trau chuốt trợ từ を, に, で.',
        taiwa: 'Phong thái hòa nhã. Hãy thử mở rộng câu thoại thêm một vế phụ.',
        machibito: 'Người hỗ trợ luôn ở quanh bạn; đừng ngần ngại nhờ người đối thoại nói chậm lại khi cần.',
        kokorogamae: 'Bền bỉ tích lũy mỗi ngày, trăm sông rồi cũng về biển lớn.'
      },
      shrineSealText: '中吉安泰',
      luckyNumber: 3
    }
  ],
  小吉: [
    {
      rank: '小吉',
      rankTitleVi: 'Tiểu Cát · Chồi non nảy nở',
      wakaJapanese: '春風に 誘われ出づる 若草の やがて野山を 緑染むらむ',
      wakaRomaji: 'Harukaze ni / sasoware izuru / wakakusa no / yagate noyama wo / midori somuran',
      wakaMeaningVi: 'Gió xuân êm dịu lay cỏ non, chẳng mấy chốc đồng xanh bát ngát nhuộm thắm núi đồi.',
      teachingSummary: 'Đã dũng cảm cất lời và biểu đạt trọn vẹn ý muốn cốt lõi. Sự tiến bộ thấy rõ qua từng lượt đàm thoại.',
      aspects: {
        gakumon: 'Nắm vững các câu mẫu giao tiếp tình huống. Cần rèn luyện thêm phát âm trường âm và âm ngắt.',
        taiwa: 'Diễn đạt vừa đủ ý. Tránh trả lời cộc lốc bằng từ đơn lẻ.',
        machibito: 'Hãy kiên nhẫn; việc hiểu sâu văn hóa cần thời gian thẩm thấu.',
        kokorogamae: 'Không ngại mắc lỗi; mỗi lần sửa sai là một bước tiến gần hơn đến sự lưu loát.'
      },
      shrineSealText: '小吉進歩',
      luckyNumber: 5
    }
  ],
  吉: [
    {
      rank: '吉',
      rankTitleVi: 'Cát · Bình an thuận hòa',
      wakaJapanese: '小川にも 淀みはあれど 絶え間なく 清き流れは 海を目指さむ',
      wakaRomaji: 'Ogawa ni mo / yodomi wa aredo / taemanaku / kiyoki nagare wa / umi wo mezasamu',
      wakaMeaningVi: 'Dòng suối nhỏ dù có khúc quanh co, dòng nước trong veo vẫn không ngừng hướng về biển lớn.',
      teachingSummary: 'Mọi sự khởi sắc bình yên. Luôn giữ tinh thần cầu tiến và bình tĩnh trong mọi ngữ cảnh.',
      aspects: {
        gakumon: 'Tập trung ôn tập từ vựng trọng tâm trước khi bước vào phòng hội thoại.',
        taiwa: 'Chú ý đuôi câu lịch sự Desu / Masu để tạo sự tin cậy.',
        machibito: 'Gặp gỡ bình hòa, môi trường học tập thuận lợi.',
        kokorogamae: 'Thong thả mà chắc chắn; học tiếng Nhật là một hành trình thưởng lãm.'
      },
      shrineSealText: '吉事円満',
      luckyNumber: 1
    }
  ],
  末吉: [
    {
      rank: '末吉',
      rankTitleVi: 'Mạt Cát · Hậu vận rạng ngời',
      wakaJapanese: '冬枯れの 木立ちも春を 待ちわびて やがて花咲く 時ぞ巡らむ',
      wakaRomaji: 'Fuyukare no / kodachi mo haru wo / machiwabite / yagate hanasaku / toki zo meguran',
      wakaMeaningVi: 'Hàng cây trơ trọi giữa mùa đông đợi nắng ấm, thời khắc muôn hoa bừng nở chắc chắn sẽ quay về.',
      teachingSummary: 'Hiện tại có thể còn đôi chỗ ngập ngừng, nhưng nền tảng đang tích tụ. Đừng nản lòng trước những câu thoại khó.',
      aspects: {
        gakumon: 'Chia nhỏ câu dài thành các cụm ngắn để dễ nhớ. Dùng giàn giáo từ khóa để kích hoạt trí nhớ.',
        taiwa: 'Nói chậm rãi, phát âm rõ ràng quan trọng hơn là cố nói nhanh.',
        machibito: 'Cần chủ động tìm kiếm cơ hội luyện tập thêm ngoài bài học.',
        kokorogamae: 'Khổ tận cam lai; sự kiên trì âm thầm hôm nay là thành quả rực rỡ ngày mai.'
      },
      shrineSealText: '大器晩成',
      luckyNumber: 9
    }
  ],
  凶: [
    {
      rank: '凶',
      rankTitleVi: 'Hung · Chuyển hóa nghịch cảnh',
      wakaJapanese: '荒波に 立ち向かふ舟 舵取れば やがて静けき 港に着かむ',
      wakaRomaji: 'Aranami ni / tachimukau fune / kajitoreba / yagate shizukeki / minato ni tsukan',
      wakaMeaningVi: 'Con thuyền vững tay chèo giữa sóng to gió lớn, ắt có ngày cập bến bờ bình yên sóng lặng.',
      teachingSummary: 'Điềm thử thách nhắc nhở cần điều chỉnh phương pháp học tập. Hãy buộc quẻ này lên giàn đền thờ để hóa giải vận hạn!',
      aspects: {
        gakumon: 'Cần xem lại ngay các góp ý lỗi ngữ pháp và phát âm ở trang kết quả.',
        taiwa: 'Hạn chế nói cộc lốc hoặc dùng tiếng bồi. Luyện tập lại từ các câu chào hỏi căn bản.',
        machibito: 'Cẩn trọng hiểu lầm văn hóa; luôn duy trì sự lễ phép trong môi trường Nhật Bản.',
        kokorogamae: 'Biến thử thách thành bài học quý giá. Đền thờ Shinto tin rằng rút phải quẻ Hung là khởi đầu của sự hồi sinh vận khí.'
      },
      shrineSealText: '厄災消除',
      luckyNumber: 4
    }
  ]
};

export interface OmikujiFortuneCardProps {
  score: number;
  scenarioTitle?: string;
  className?: string;
}

export const OmikujiFortuneCard: React.FC<OmikujiFortuneCardProps> = ({
  score,
  scenarioTitle,
  className = '',
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [ceremonyStep, setCeremonyStep] = useState<'shaking' | 'revealedStick' | 'unfurled'>('shaking');
  const [isTiedToShrine, setIsTiedToShrine] = useState(false);
  const [isSavedToAmulet, setIsSavedToAmulet] = useState(false);

  // Suy đoán quẻ theo điểm số tổng kết của học viên
  const deducedRank: OmikujiRank = (() => {
    if (score >= 90) return '大吉';
    if (score >= 78) return '中吉';
    if (score >= 68) return '小吉';
    if (score >= 55) return '吉';
    if (score >= 40) return '末吉';
    return '凶';
  })();

  const fortunes = OMIKUJI_DATABASE[deducedRank];
  const activeFortune = fortunes[0];

  const handleOpenCeremony = () => {
    ukiyoSound.playWoodblockSnap();
    setIsModalOpen(true);
    setCeremonyStep('shaking');
    setIsTiedToShrine(false);
    setIsSavedToAmulet(false);

    // Bắt đầu nhịp lắc hộp quẻ bát giác
    setTimeout(() => {
      ukiyoSound.playWoodblockSnap();
    }, 450);
    setTimeout(() => {
      ukiyoSound.playWoodblockSnap();
    }, 900);

    // Sau 1.5s, que quẻ rơi ra
    setTimeout(() => {
      setCeremonyStep('revealedStick');
      ukiyoSound.playSubtleTap();
    }, 1500);
  };

  const handleUnfurlScroll = () => {
    ukiyoSound.playMigotoChime();
    setCeremonyStep('unfurled');
  };

  const handleTieToShrine = () => {
    ukiyoSound.playTaikoThud();
    setIsTiedToShrine(true);
  };

  const handleSaveToAmulet = () => {
    ukiyoSound.playMigotoChime();
    setIsSavedToAmulet(true);
  };

  const getRankBadgeClasses = (rank: OmikujiRank) => {
    switch (rank) {
      case '大吉':
        return 'bg-gradient-to-r from-amber-600 via-rose-600 to-amber-700 text-white shadow-xs';
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
      {/* 1. COMPACT CARD IN RESULT OVERVIEW (TAILED WOODEN TALISMAN STYLE) */}
      <div
        className={`relative flex flex-col justify-between overflow-hidden rounded-3xl border border-amber-200/90 bg-gradient-to-br from-[#FFFDF9] via-white to-[#FDF8EE] p-5 shadow-xs transition-all duration-300 hover:border-amber-400/80 hover:shadow-sm ${className}`}
      >
        {/* Nền thư pháp Nhật chìm */}
        <div className="absolute -right-3 -bottom-4 text-5xl font-serif font-black text-amber-900/5 select-none pointer-events-none">
          御神籤
        </div>

        <div>
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-tr from-rose-700 to-amber-600 text-white shadow-2xs">
                <Scroll className="w-4 h-4 text-white" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-stone-900 font-sans tracking-wide">
                  Quẻ Vận Đền Thờ · おみくじ
                </h3>
                <p className="text-[10px] text-amber-800/80 font-medium">Chiêm nghiệm vận hội giao tiếp</p>
              </div>
            </div>

            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-black font-serif tracking-wider ${getRankBadgeClasses(
                activeFortune.rank
              )}`}
            >
              {activeFortune.rank}
            </span>
          </div>

          <p className="text-xs text-stone-700 font-medium leading-relaxed mb-3 italic">
            "{activeFortune.teachingSummary}"
          </p>
        </div>

        <div className="flex items-center justify-between gap-2 pt-3 border-t border-amber-100">
          <button
            type="button"
            onClick={handleOpenCeremony}
            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-stone-900 via-rose-950 to-stone-900 px-3.5 py-1.5 text-xs font-bold text-white shadow-2xs hover:from-black hover:to-rose-900 transition active:scale-95 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>Khai quẻ đền thờ</span>
          </button>

          <div
            className="w-8 h-8 rounded-full border-2 border-dashed border-rose-600 bg-rose-50 flex items-center justify-center text-rose-700 font-serif font-black text-xs select-none shadow-2xs rotate-[-6deg] shrink-0"
            title="Dấu triện thần điện Shinto"
          >
            吉
          </div>
        </div>
      </div>

      {/* 2. AUTHENTIC JAPANESE SHINTO OMIKUJI CEREMONIAL MODAL (PORTAL) */}
      {isModalOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-fade-in">
          <div className="relative w-full max-w-lg bg-[#FAF7F2] rounded-[32px] border-2 border-stone-300 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
            {/* Header dải xà nhà đền thờ Torii */}
            <div className="relative bg-gradient-to-r from-stone-950 via-[#450A0A] to-stone-950 text-stone-100 px-6 py-4 flex items-center justify-between border-b-2 border-rose-900/60 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-700 text-white shadow-2xs">
                  <Scroll className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-stone-100 tracking-wider font-sans">
                    NGHI THỨC KHAI QUẺ ĐỀN THỜ · 神社御神籤
                  </h2>
                  <p className="text-[10px] text-amber-200/80">
                    {scenarioTitle ? `Bối cảnh: ${scenarioTitle}` : 'Chiêm nghiệm tiến trình ngôn ngữ'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  ukiyoSound.playSubtleTap();
                  setIsModalOpen(false);
                }}
                className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/10 text-stone-400 hover:text-white transition cursor-pointer text-xs"
                title="Đóng quẻ"
              >
                ✕
              </button>
            </div>

            {/* Thân nghi thức Shinto */}
            <div className="overflow-y-auto p-5 sm:p-6 pb-8 space-y-5 bg-[#FAF7F2]">
              {ceremonyStep === 'shaking' && (
                /* GIAI ĐOẠN 1: LẮC ỐNG QUẺ BÁT GIÁC */
                <div className="py-12 flex flex-col items-center justify-center gap-6 text-center">
                  {/* Mô phỏng ống quẻ gỗ bát giác (おみくじ筒) */}
                  <div className="relative w-24 h-44 rounded-2xl bg-gradient-to-b from-amber-800 via-amber-950 to-stone-900 border-4 border-amber-700/80 shadow-2xl flex flex-col items-center justify-between p-3 animate-heartbeat">
                    {/* Vành đồng trên */}
                    <div className="w-full h-2 bg-gradient-to-r from-amber-300 via-yellow-100 to-amber-400 rounded-sm shadow-xs" />
                    
                    {/* Chữ Hán khắc chìm trên thân ống gỗ */}
                    <span className="text-amber-200/90 font-serif font-black text-sm tracking-widest writing-vertical select-none">
                      御神籤筒
                    </span>

                    {/* Lỗ xuất que quẻ ở đáy/đầu */}
                    <div className="w-5 h-2 bg-stone-950 rounded-full border border-amber-500/50" />

                    {/* Vành đồng dưới */}
                    <div className="w-full h-2 bg-gradient-to-r from-amber-300 via-yellow-100 to-amber-400 rounded-sm shadow-xs" />
                  </div>

                  <div>
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-900 text-xs font-bold border border-amber-300">
                      <span className="w-2 h-2 rounded-full bg-amber-600 animate-ping" />
                      <span>Đang kính cẩn gieo quẻ gỗ bát giác...</span>
                    </div>
                    <p className="text-xs text-stone-500 mt-2 font-serif">
                      Thành tâm đón nhận chỉ dẫn ngôn ngữ từ thần điện
                    </p>
                  </div>
                </div>
              )}

              {ceremonyStep === 'revealedStick' && (
                /* GIAI ĐOẠN 2: QUE TRE THẦN ĐIỆN RƠI RA */
                <div className="py-8 flex flex-col items-center justify-center gap-6 text-center animate-modal-pop">
                  <div className="relative flex flex-col items-center">
                    {/* Cây que tre dát vàng (Bamboo Fortune Stick) */}
                    <div className="w-12 h-48 rounded-lg bg-gradient-to-b from-amber-200 via-amber-300 to-amber-400 border-2 border-amber-500 shadow-xl flex flex-col items-center justify-between py-3 px-1 select-none">
                      <span className="text-[10px] font-mono font-bold text-amber-900">JCAP</span>
                      <span className="text-base font-serif font-black text-amber-950 tracking-widest writing-vertical">
                        第{activeFortune.luckyNumber}番
                      </span>
                      <span className="text-xs font-serif font-black text-rose-800">
                        {activeFortune.rank}
                      </span>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-base font-black font-sans text-stone-900">
                      Đã rơi ra thẻ số: Thứ {activeFortune.luckyNumber} · 第{activeFortune.luckyNumber}番
                    </h3>
                    <p className="text-xs text-stone-600 mt-1">
                      Thẻ tre tương ứng với một cuộn sớ Washi mang lời sấm truyền thống
                    </p>

                    <button
                      type="button"
                      onClick={handleUnfurlScroll}
                      className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-rose-700 to-amber-700 px-6 py-2.5 text-xs sm:text-sm font-bold text-white shadow-md hover:from-rose-800 hover:to-amber-800 transition active:scale-95 cursor-pointer"
                    >
                      <Scroll className="w-4 h-4 text-amber-200" />
                      <span>Mở sớ quẻ Washi tương ứng</span>
                    </button>
                  </div>
                </div>
              )}

              {ceremonyStep === 'unfurled' && (
                /* GIAI ĐOẠN 3: TỜ SỚ QUẺ WASHI TRUYỀN THỐNG BUNG MỞ */
                <div className="relative rounded-2xl border-2 border-stone-300/80 bg-white p-6 shadow-sm space-y-5 animate-modal-pop">
                  {/* Dải đầu quẻ: Hạng quẻ & Dấu mộc son */}
                  <div className="flex items-center justify-between border-b-2 border-stone-200 pb-4">
                    <div>
                      <span className="text-[11px] font-bold tracking-widest text-stone-500 uppercase font-sans">
                        Thứ số {activeFortune.luckyNumber} · 第{activeFortune.luckyNumber}番
                      </span>
                      <h1 className="text-2xl sm:text-3xl font-black font-serif tracking-widest text-rose-900 mt-0.5">
                        {activeFortune.rank}
                      </h1>
                      <p className="text-xs font-bold text-stone-700 mt-1">
                        {activeFortune.rankTitleVi}
                      </p>
                    </div>

                    <div className="shrink-0">
                      <div
                        className="w-16 h-20 rounded-lg border-2 border-rose-800 bg-rose-50/90 p-1 flex flex-col items-center justify-between text-rose-800 select-none shadow-xs rotate-[-3deg]"
                        title={`Triện đền thờ: ${activeFortune.shrineSealText}`}
                      >
                        <span className="text-[8px] font-serif font-black tracking-widest uppercase">
                          神社之印
                        </span>
                        <span className="text-xs font-serif font-black tracking-widest text-center leading-tight">
                          {activeFortune.shrineSealText || '神光照覧'}
                        </span>
                        <span className="text-[7px] font-mono font-bold tracking-tighter">
                          OMIKUJI
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Bài thơ Waka truyền thống */}
                  <div className="rounded-xl border border-amber-200/80 bg-amber-50/50 p-4 space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900 font-sans">
                      <BookOpen className="w-3.5 h-3.5 text-amber-800" />
                      <span>Thơ Waka cổ truyền (和歌):</span>
                    </div>
                    <p className="font-serif font-bold text-sm sm:text-base text-stone-900 tracking-wide leading-relaxed text-center py-1">
                      {activeFortune.wakaJapanese}
                    </p>
                    <p className="text-[11px] text-stone-600 text-center font-mono">
                      {activeFortune.wakaRomaji}
                    </p>
                    <p className="text-xs text-amber-950 font-medium italic border-t border-amber-200/60 pt-2 leading-relaxed">
                      Ý thơ: {activeFortune.wakaMeaningVi}
                    </p>
                  </div>

                  {/* Lời răn dạy tu thân & Giao tiếp */}
                  <div className="space-y-1.5">
                    <h4 className="text-xs font-bold text-stone-800 uppercase tracking-wider font-sans flex items-center gap-1.5">
                      <Compass className="w-3.5 h-3.5 text-rose-700" />
                      <span>Lời giải nghĩa đạo lý (神託の教え):</span>
                    </h4>
                    <p className="text-xs text-stone-700 leading-relaxed font-serif">
                      {activeFortune.teachingSummary}
                    </p>
                  </div>

                  {/* 4 Phương diện vận khí học tập */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    <div className="rounded-xl border border-stone-200 bg-stone-50/60 p-3 text-xs space-y-1">
                      <span className="font-bold text-stone-900 flex items-center gap-1">
                        <BookOpen className="w-3 h-3 text-stone-700" />
                        <span>Học vấn & Ngôn ngữ (学問)</span>
                      </span>
                      <p className="text-stone-600 text-[11px] leading-relaxed">
                        {activeFortune.aspects.gakumon}
                      </p>
                    </div>

                    <div className="rounded-xl border border-stone-200 bg-stone-50/60 p-3 text-xs space-y-1">
                      <span className="font-bold text-stone-900 flex items-center gap-1">
                        <MessageSquare className="w-3 h-3 text-stone-700" />
                        <span>Giao tiếp & Ứng xử (対話)</span>
                      </span>
                      <p className="text-stone-600 text-[11px] leading-relaxed">
                        {activeFortune.aspects.taiwa}
                      </p>
                    </div>

                    <div className="rounded-xl border border-stone-200 bg-stone-50/60 p-3 text-xs space-y-1">
                      <span className="font-bold text-stone-900 flex items-center gap-1">
                        <Compass className="w-3 h-3 text-stone-700" />
                        <span>Cơ hội & Gặp gỡ (好機)</span>
                      </span>
                      <p className="text-stone-600 text-[11px] leading-relaxed">
                        {activeFortune.aspects.machibito}
                      </p>
                    </div>

                    <div className="rounded-xl border border-stone-200 bg-stone-50/60 p-3 text-xs space-y-1">
                      <span className="font-bold text-stone-900 flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-amber-600" />
                        <span>Tâm thế tu thân (心構え)</span>
                      </span>
                      <p className="text-stone-600 text-[11px] leading-relaxed">
                        {activeFortune.aspects.kokorogamae}
                      </p>
                    </div>
                  </div>

                  {/* Hành động nghi thức: Buộc quẻ / Cất giữ túi hộ mệnh */}
                  <div className="pt-3 border-t border-stone-200 flex flex-wrap items-center justify-between gap-3">
                    {isTiedToShrine ? (
                      <div className="flex items-center gap-2 text-xs font-bold text-emerald-800 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200">
                        <span>Đã buộc sớ quẻ lên giàn đền thờ · Vận hạn tiêu trừ, tâm an trí sáng!</span>
                      </div>
                    ) : isSavedToAmulet ? (
                      <div className="flex items-center gap-2 text-xs font-bold text-amber-800 bg-amber-50 px-3 py-1.5 rounded-xl border border-amber-200">
                        <span>Đã cất quẻ cát tường vào Túi Hộ Mệnh Omamori!</span>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        {activeFortune.rank === '凶' || activeFortune.rank === '末吉' ? (
                          <button
                            type="button"
                            onClick={handleTieToShrine}
                            className="inline-flex items-center gap-1.5 rounded-xl border-2 border-stone-700 bg-stone-900 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-black transition active:scale-95 cursor-pointer shadow-xs"
                          >
                            <span>Buộc quẻ lên giàn đền thờ hóa giải (結び所)</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={handleSaveToAmulet}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-600 to-rose-700 px-3.5 py-1.5 text-xs font-bold text-white hover:from-amber-700 hover:to-rose-800 transition active:scale-95 cursor-pointer shadow-xs"
                          >
                            <Sparkles className="w-3.5 h-3.5 text-amber-200" />
                            <span>Cất vào Túi Hộ Mệnh (御守り)</span>
                          </button>
                        )}
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={handleOpenCeremony}
                      className="text-xs text-stone-500 hover:text-stone-800 font-medium underline underline-offset-2 ml-auto cursor-pointer"
                    >
                      Gieo lại quẻ khác
                    </button>
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
