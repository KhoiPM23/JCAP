import React, { useState } from 'react';
import { ukiyoSound } from '../../utils/ukiyoSoundEngine';

export interface RoleplayStageHeaderProps {
  scenarioTitle: string;
  jlptLevel: string;
  completedMissionsCount: number;
  totalMissionsCount: number;
  creditBalance: number;
  showFurigana: boolean;
  onToggleFurigana: (val: boolean) => void;
  showVietnamese: boolean;
  onToggleVietnamese: (val: boolean) => void;
  autoPlayTts: boolean;
  onToggleAutoPlayTts: (val: boolean) => void;
  voiceSpeed: number;
  onChangeVoiceSpeed: (speed: number) => void;
  onToggleMissionsPanel: () => void;
  isMissionsPanelOpen: boolean;
  onToggleEvaluationDrawer: () => void;
  isEvaluationDrawerOpen: boolean;
  onEndEarly: () => void;
  onExit: () => void;
}

export const RoleplayStageHeader: React.FC<RoleplayStageHeaderProps> = ({
  scenarioTitle,
  jlptLevel,
  completedMissionsCount,
  totalMissionsCount,
  creditBalance,
  showFurigana,
  onToggleFurigana,
  showVietnamese,
  onToggleVietnamese,
  autoPlayTts,
  onToggleAutoPlayTts,
  voiceSpeed,
  onChangeVoiceSpeed,
  onToggleMissionsPanel,
  isMissionsPanelOpen,
  onToggleEvaluationDrawer,
  isEvaluationDrawerOpen,
  onEndEarly,
  onExit,
}) => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const getJlptBadgeClass = (lvl: string) => {
    switch (lvl?.toUpperCase()) {
      case 'N5':
        return 'bg-[var(--n5-soft)] text-[var(--n5)] border-[var(--n5)]/30';
      case 'N4':
        return 'bg-[var(--n4-soft)] text-[var(--n4)] border-[var(--n4)]/30';
      case 'N3':
        return 'bg-[var(--n3-soft)] text-[var(--n3)] border-[var(--n3)]/30';
      default:
        return 'bg-[var(--paper-200)] text-[var(--sumi-muted)] border-[var(--line)]';
    }
  };

  return (
    <header className="h-16 px-4 md:px-6 bg-[var(--paper-50)] border-b border-[var(--line)] flex items-center justify-between gap-3 select-none z-20">
      {/* Cụm Điều hướng & Tiêu đề */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={() => {
            ukiyoSound.playSubtleTap();
            onExit();
          }}
          className="p-2 rounded-xl text-[var(--sumi-muted)] hover:text-[var(--sumi)] hover:bg-[var(--paper-200)] transition cursor-pointer flex items-center justify-center"
          title="Rời phòng luyện"
        >
          <span className="material-symbols-outlined text-xl">arrow_back</span>
        </button>

        <div className="flex items-center gap-2 text-xs md:text-sm text-[var(--sumi-muted)]">
          <span className="hidden sm:inline font-medium">Hội thoại AI</span>
          <span className="hidden sm:inline material-symbols-outlined text-sm">chevron_right</span>
          <span className="font-bold text-[var(--sumi)] truncate max-w-[140px] md:max-w-xs">{scenarioTitle}</span>
          <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] md:text-xs border ${getJlptBadgeClass(jlptLevel)}`}>
            {jlptLevel || 'N5'}
          </span>
        </div>
      </div>

      {/* Cụm Thao tác & Trạng thái */}
      <div className="flex items-center gap-2 md:gap-3">
        {/* Nút Nhiệm vụ */}
        <button
          type="button"
          onClick={() => {
            ukiyoSound.playSubtleTap();
            onToggleMissionsPanel();
          }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer border ${
            isMissionsPanelOpen
              ? 'bg-[var(--ai-soft)] text-[var(--ai)] border-[var(--ai)]/30'
              : 'bg-[var(--paper-100)] text-[var(--sumi)] border-[var(--line)] hover:bg-[var(--paper-200)]'
          }`}
        >
          <span className="material-symbols-outlined text-base">checklist</span>
          <span className="hidden sm:inline">Nhiệm vụ</span>
          <span className="px-1.5 py-0.2 rounded-md bg-[var(--paper-50)] text-[11px] font-mono shadow-xs border border-[var(--line)]">
            {completedMissionsCount}/{totalMissionsCount}
          </span>
        </button>

        {/* Nút Đánh giá */}
        <button
          type="button"
          onClick={() => {
            ukiyoSound.playSubtleTap();
            onToggleEvaluationDrawer();
          }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer border ${
            isEvaluationDrawerOpen
              ? 'bg-[var(--ai-soft)] text-[var(--ai)] border-[var(--ai)]/30'
              : 'bg-[var(--paper-100)] text-[var(--sumi)] border-[var(--line)] hover:bg-[var(--paper-200)]'
          }`}
        >
          <span className="material-symbols-outlined text-base">insights</span>
          <span className="hidden sm:inline">Đánh giá</span>
        </button>

        {/* Credit Badge */}
        <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-[var(--credit-soft)] text-[var(--credit)] text-xs font-bold border border-[var(--credit-coin)]/30">
          <span className="material-symbols-outlined text-sm text-[var(--credit-coin)]">monetization_on</span>
          <span>{creditBalance} credits</span>
        </div>

        {/* Cài đặt hội thoại Popover */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              ukiyoSound.playSubtleTap();
              setIsSettingsOpen(!isSettingsOpen);
            }}
            className={`p-2 rounded-xl transition cursor-pointer flex items-center justify-center ${
              isSettingsOpen ? 'bg-[var(--paper-200)] text-[var(--ai)]' : 'text-[var(--sumi-muted)] hover:bg-[var(--paper-100)]'
            }`}
            title="Cài đặt hỗ trợ"
          >
            <span className="material-symbols-outlined text-xl">tune</span>
          </button>

          {isSettingsOpen && (
            <div className="absolute right-0 top-full mt-2 w-72 p-4 bg-[var(--paper-50)] rounded-2xl shadow-xl border border-[var(--line)] flex flex-col gap-3.5 animate-slide-up z-50">
              <div className="flex items-center justify-between pb-2 border-b border-[var(--line)]">
                <span className="text-xs font-bold text-[var(--sumi)] uppercase tracking-wider">Cài đặt hỗ trợ</span>
                <button
                  type="button"
                  onClick={() => setIsSettingsOpen(false)}
                  className="text-slate-400 hover:text-slate-600 text-xs"
                >
                  ✕
                </button>
              </div>

              {/* Toggle Furigana */}
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-xs text-[var(--sumi)] font-medium">Hiện Furigana (Cách đọc)</span>
                <input
                  type="checkbox"
                  checked={showFurigana}
                  onChange={(e) => {
                    ukiyoSound.playSubtleTap();
                    onToggleFurigana(e.target.checked);
                  }}
                  className="w-4 h-4 rounded text-[var(--ai)] focus:ring-[var(--ai)]"
                />
              </label>

              {/* Toggle Nghĩa tiếng Việt */}
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-xs text-[var(--sumi)] font-medium">Hiện nghĩa Tiếng Việt</span>
                <input
                  type="checkbox"
                  checked={showVietnamese}
                  onChange={(e) => {
                    ukiyoSound.playSubtleTap();
                    onToggleVietnamese(e.target.checked);
                  }}
                  className="w-4 h-4 rounded text-[var(--ai)] focus:ring-[var(--ai)]"
                />
              </label>

              {/* Toggle Tự phát TTS */}
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-xs text-[var(--sumi)] font-medium">Tự phát giọng AI</span>
                <input
                  type="checkbox"
                  checked={autoPlayTts}
                  onChange={(e) => {
                    ukiyoSound.playSubtleTap();
                    onToggleAutoPlayTts(e.target.checked);
                  }}
                  className="w-4 h-4 rounded text-[var(--ai)] focus:ring-[var(--ai)]"
                />
              </label>

              {/* Tốc độ giọng đọc */}
              <div className="pt-2 border-t border-[var(--line)] flex flex-col gap-1.5">
                <span className="text-[11px] font-semibold text-[var(--sumi-muted)]">Tốc độ đọc giọng AI</span>
                <div className="grid grid-cols-3 gap-1 bg-[var(--paper-200)] p-1 rounded-xl">
                  {[0.85, 1.0, 1.15].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        ukiyoSound.playSubtleTap();
                        onChangeVoiceSpeed(s);
                      }}
                      className={`py-1 text-xs font-bold rounded-lg transition ${
                        voiceSpeed === s
                          ? 'bg-[var(--paper-50)] text-[var(--ai)] shadow-xs'
                          : 'text-[var(--sumi-muted)] hover:text-[var(--sumi)]'
                      }`}
                    >
                      {s === 1.0 ? 'Chuẩn' : `${s}x`}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Nút Kết thúc sớm */}
        <button
          type="button"
          onClick={() => {
            ukiyoSound.playSubtleTap();
            onEndEarly();
          }}
          className="px-3 py-1.5 rounded-xl text-xs font-bold text-[var(--danger)] bg-[var(--danger-soft)] hover:bg-red-100 transition cursor-pointer border border-[var(--danger)]/20 whitespace-nowrap"
        >
          Kết thúc sớm
        </button>
      </div>
    </header>
  );
};
