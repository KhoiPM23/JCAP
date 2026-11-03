import React, { useEffect } from 'react';
import { ukiyoSound } from '../../utils/ukiyoSoundEngine';

export interface EkiStampOverlayProps {
  isOpen: boolean;
  scenarioTitle: string;
  averageScore: number;
  completedMissionsCount: number;
  totalMissionsCount: number;
  onReviewSummary: () => void;
  onRestart: () => void;
  onExit: () => void;
  isExploreMode?: boolean;
}

export const EkiStampOverlay: React.FC<EkiStampOverlayProps> = ({
  isOpen,
  scenarioTitle,
  averageScore,
  completedMissionsCount,
  totalMissionsCount,
  onReviewSummary,
  onRestart,
  onExit,
  isExploreMode = false,
}) => {
  useEffect(() => {
    if (isOpen) {
      // Âm thanh Taiko đập mạnh khi con dấu đóng xuống
      ukiyoSound.playTaikoThud();
      // Chuông ngũ cung Hirajoshi ngân nga ngay sau đó
      const timer = setTimeout(() => {
        ukiyoSound.playMigotoChime();
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--sumi)]/75 backdrop-blur-sm select-none transition-opacity duration-300 animate-fade-in">
      <div className="w-full max-w-md bg-[var(--paper-50)] rounded-3xl p-6 md:p-8 shadow-2xl border-2 border-[var(--line)] flex flex-col items-center text-center relative overflow-hidden animate-modal-pop">
        {/* Hoa văn Seigaiha / sóng nền nhẹ phía sau */}
        <div className="absolute -top-12 -right-12 w-36 h-36 rounded-full bg-[var(--sora-soft)] opacity-40 pointer-events-none" />

        {/* Con dấu Eki-Stamp Hanko đập mạnh (Slam Animation) */}
        <div className="my-3 animate-stamp-slam">
          <div className="w-28 h-28 md:w-32 md:h-32 rounded-full border-4 border-dashed border-[var(--shu)] flex flex-col items-center justify-center p-2 relative shadow-lg transform rotate-[-4deg] bg-[var(--shu-soft)]/20">
            <div className="w-full h-full rounded-full border-2 border-[var(--shu)] flex flex-col items-center justify-center text-[var(--shu)]">
              <span className="text-[10px] font-bold tracking-widest uppercase">JCAP · 会話達成</span>
              <span className="text-3xl md:text-4xl font-extrabold font-serif my-0.5 tracking-wider">見事</span>
              <span className="text-[10px] font-bold tracking-widest uppercase">合格 · STAMPED</span>
            </div>
          </div>
        </div>

        {/* Tiêu đề chúc mừng */}
        <h2 className="text-xl md:text-2xl font-bold text-[var(--sumi)] mt-2">
          {isExploreMode ? 'Hoàn thành mốc hành trình!' : 'Hoàn thành phiên hội thoại!'}
        </h2>
        <p className="text-xs text-[var(--sumi-muted)] mt-1 max-w-xs">{scenarioTitle}</p>

        {/* Thẻ thống kê kết quả */}
        <div className="grid grid-cols-2 gap-3 w-full my-4">
          <div className="p-3.5 rounded-2xl bg-[var(--paper-100)] border border-[var(--line)]">
            <span className="text-[11px] font-bold text-[var(--sumi-muted)] block">Điểm trung bình</span>
            <span className="text-2xl font-extrabold font-mono text-[var(--ai)] mt-0.5 block">
              {averageScore}
              <span className="text-xs font-normal text-slate-400">/100</span>
            </span>
          </div>

          <div className="p-3.5 rounded-2xl bg-[var(--paper-100)] border border-[var(--line)]">
            <span className="text-[11px] font-bold text-[var(--sumi-muted)] block">Nhiệm vụ</span>
            <span className="text-2xl font-extrabold font-mono text-emerald-700 mt-0.5 block">
              {completedMissionsCount}/{totalMissionsCount}
            </span>
          </div>
        </div>

        {/* Quẻ xăm Omikuji may mắn (Variable Reward) */}
        <div className="w-full mb-5 p-3 rounded-2xl bg-gradient-to-r from-amber-50/80 via-orange-50/50 to-amber-50/80 border border-amber-200/80 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2.5 text-left">
            <span className="w-9 h-9 rounded-xl bg-amber-500 text-white font-serif font-black text-sm flex items-center justify-center shadow-xs">
              {averageScore >= 85 ? '大吉' : averageScore >= 70 ? '中吉' : '吉'}
            </span>
            <div>
              <div className="text-[11px] font-bold text-amber-900 flex items-center gap-1">
                <span>Quẻ xăm may mắn (おみくじ):</span>
                <span className="text-amber-700 font-normal">
                  {averageScore >= 85 ? 'Đại Cát · +15 EXP' : averageScore >= 70 ? 'Trung Cát · +10 EXP' : 'Tiểu Cát · +5 EXP'}
                </span>
              </div>
              <p className="text-[11px] text-amber-800 italic mt-0.5">
                {averageScore >= 85
                  ? '「千里の道も一歩から」— Phản xạ nhạy bén, tự tin như người bản xứ!'
                  : averageScore >= 70
                  ? '「継続は力なり」— Nhịp điệu đối thoại vững vàng, ngày càng tiến bộ!'
                  : '「七転び八起き」— Vạn sự khởi đầu nan, kiên trì ắt thành tài!'}
              </p>
            </div>
          </div>
        </div>

        {/* Cụm nút hành động */}
        <div className="flex flex-col gap-2.5 w-full">
          <button
            type="button"
            onClick={() => {
              ukiyoSound.playSubtleTap();
              onReviewSummary();
            }}
            className="w-full py-3 rounded-2xl bg-[var(--ai)] hover:bg-[var(--ai-hover)] text-white text-sm font-bold shadow-md transition active:scale-98 cursor-pointer flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-base">insights</span>
            <span>Xem nhận xét chi tiết từng câu</span>
          </button>

          <div className="grid grid-cols-2 gap-2.5 w-full">
            <button
              type="button"
              onClick={() => {
                ukiyoSound.playSubtleTap();
                onRestart();
              }}
              className="py-2.5 rounded-2xl bg-[var(--paper-100)] hover:bg-[var(--paper-200)] text-[var(--sumi)] border border-[var(--line)] text-xs font-bold transition active:scale-98 cursor-pointer flex items-center justify-center gap-1.5"
            >
              <span className="material-symbols-outlined text-base">replay</span>
              <span>Luyện lại</span>
            </button>

            <button
              type="button"
              onClick={() => {
                ukiyoSound.playSubtleTap();
                onExit();
              }}
              className="py-2.5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shadow-sm transition active:scale-98 cursor-pointer flex items-center justify-center gap-1"
            >
              <span>{isExploreMode ? 'Về bản đồ' : 'Thoát ra'}</span>
              <span>➔</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
