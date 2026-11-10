import React, { useState } from 'react';
import type { SumiInkFeedbackDto } from '../../types/roleplay';
import { ukiyoSound } from '../../utils/ukiyoSoundEngine';

export interface RedoTurnButtonProps {
  onRedo?: () => void;
  className?: string;
  label?: string;
  title?: string;
}

export const RedoTurnButton: React.FC<RedoTurnButtonProps> = ({
  onRedo,
  className = '',
  label = '言い直す ↻',
  title = 'Nói lại lượt này để tự sửa lỗi (1-Click Self-Repair)',
}) => {
  if (!onRedo) return null;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        try {
          ukiyoSound.playWoodblockSnap();
        } catch {
          // ignore sound error in test or headless env
        }
        onRedo();
      }}
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium font-sans bg-rose-500/15 hover:bg-rose-500/25 text-rose-200 border border-rose-400/30 transition-all duration-200 cursor-pointer shadow-xs active:scale-95 ${className}`}
      title={title}
    >
      <span className="material-symbols-outlined text-[13px] leading-none">autorenew</span>
      <span>{label}</span>
    </button>
  );
};

export interface SumiInkIndicatorProps {
  feedback?: SumiInkFeedbackDto;
  onRedo?: () => void;
  className?: string;
}

export const SumiInkIndicator: React.FC<SumiInkIndicatorProps> = ({
  feedback,
  onRedo,
  className = '',
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!feedback) return null;

  // Case 1: Survival phrase exemption (Cụm từ sinh tồn: もう一度, ゆっくり, etc.)
  if (feedback.isSurvivalPhrase) {
    return (
      <div
        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 shadow-xs ${className}`}
        title="Bạn đã chủ động dùng cụm từ sinh tồn để duy trì hội thoại. Hoàn toàn được bảo toàn điểm tự chủ!"
      >
        <span className="material-symbols-outlined text-xs text-emerald-400">check_circle</span>
        <span>Cụm từ sinh tồn (100đ Tự chủ)</span>
      </div>
    );
  }

  // If no stain was detected, do not render any stain
  if (!feedback.hasStain) return null;

  const isSevere = feedback.stainType === 'TameguchiSlip' || feedback.stainType === 'error';
  const defaultMessage = isSevere
    ? 'Chú ý: Đối phương ở vị thế xã hội cao hơn, nên dùng Thể lịch sự (です/ます/敬語).'
    : feedback.stainType === 'OverKeigo'
    ? 'Lưu ý: Đối thoại thường ngày, dùng kính ngữ quá mức có thể tạo khoảng cách xa cách.'
    : feedback.message || 'Lưu ý về sắc thái biểu đạt hoặc vai vế xã hội.';

  const pillBgClass = isSevere
    ? 'bg-rose-500/20 hover:bg-rose-500/30 border-rose-400/40 text-rose-200'
    : 'bg-amber-500/20 hover:bg-amber-500/30 border-amber-400/40 text-amber-200';

  const dotPingClass = isSevere ? 'bg-rose-400' : 'bg-amber-400';
  const dotSolidClass = isSevere ? 'bg-rose-500' : 'bg-amber-500';

  return (
    <div className={`flex flex-col items-end gap-1.5 transition-all duration-300 ${className}`}>
      {/* Ambient Sumi ink drop pill */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            try {
              ukiyoSound.playSubtleTap();
            } catch {
              // ignore
            }
            setIsExpanded((prev) => !prev);
          }}
          className={`group inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-sans transition-all duration-200 cursor-pointer shadow-xs ${pillBgClass}`}
          title="Phát hiện lệch vai vế giao tiếp. Bấm để xem gợi ý vết mực Sumi."
        >
          {/* Pulsing ink droplet */}
          <span className="relative flex h-2 w-2">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${dotPingClass}`} />
            <span className={`relative inline-flex rounded-full h-2 w-2 ${dotSolidClass}`} />
          </span>
          <span className="font-medium">Vết mực Sumi: {isSevere ? 'Lệch vai vế' : 'Sắc thái'}</span>
          <span className="material-symbols-outlined text-[12px] transition-transform duration-200 group-hover:translate-x-0.5">
            {isExpanded ? 'expand_less' : 'expand_more'}
          </span>
        </button>

        {onRedo && <RedoTurnButton onRedo={onRedo} />}
      </div>

      {/* Expanded non-intrusive 1-line gentle disclosure tip */}
      {isExpanded && (
        <div className="max-w-md p-2.5 rounded-xl bg-slate-900/95 backdrop-blur-xs border border-rose-400/30 text-rose-100 text-xs shadow-md animate-fade-in space-y-1.5">
          <div className="flex items-start gap-1.5">
            <span className="material-symbols-outlined text-sm text-rose-400 shrink-0 mt-0.5">
              format_ink_highlighter
            </span>
            <p className="leading-relaxed text-[11px] text-slate-200">{feedback.message || defaultMessage}</p>
          </div>

          {feedback.suggestedAlternative && (
            <div className="pt-1 border-t border-rose-400/20 text-[11px] text-amber-200 font-sans flex items-center justify-between gap-2">
              <span className="flex items-center gap-1">
                <span className="font-bold text-amber-300">Gợi ý:</span> <strong className="text-white">{feedback.suggestedAlternative}</strong>
              </span>
              {onRedo && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    try {
                      ukiyoSound.playWoodblockSnap();
                    } catch {}
                    onRedo();
                  }}
                  className="px-2 py-0.5 rounded bg-amber-400/20 hover:bg-amber-400/30 text-amber-200 text-[10px] font-bold cursor-pointer"
                >
                  Nói lại câu này
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
