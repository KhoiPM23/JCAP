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
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium font-sans bg-rose-500/15 hover:bg-rose-500/25 text-rose-800 border border-rose-400/30 transition-all duration-200 cursor-pointer shadow-xs active:scale-95 ${className}`}
      title={title}
    >
      <span className="material-symbols-outlined text-[13px] leading-none">autorenew</span>
      <span>{label}</span>
    </button>
  );
};

/**
 * SumiInkPill: Nút trigger thanh mảnh bên trong bong bóng thoại của học viên
 * - Xóa bỏ 100% chấm tròn nhấp nháy (dot ping) ở đầu theo yêu cầu của Owner
 * - Chỉ giữ text tinh gọn + icon mũi tên đảo chiều mượt mà khi mở/đóng
 */
export interface SumiInkPillProps {
  feedback?: SumiInkFeedbackDto;
  isExpanded: boolean;
  onToggle: () => void;
  className?: string;
}

export const SumiInkPill: React.FC<SumiInkPillProps> = ({
  feedback,
  isExpanded,
  onToggle,
  className = '',
}) => {
  if (!feedback || !feedback.hasStain) return null;

  const isSevere = feedback.stainType === 'TameguchiSlip' || feedback.stainType === 'error';

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        try {
          ukiyoSound.playSubtleTap();
        } catch {
          // ignore
        }
        onToggle();
      }}
      className={`group inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[10px] font-sans font-medium transition-all duration-200 cursor-pointer shadow-2xs active:scale-95 ${
        isSevere
          ? 'bg-rose-500/15 hover:bg-rose-500/25 border-rose-400/40 text-rose-800'
          : 'bg-amber-500/15 hover:bg-amber-500/25 border-amber-400/40 text-amber-800'
      } ${className}`}
      title="Lưu ý về thể văn và độ lịch sự trong giao tiếp."
    >
      <span className="font-semibold">
        {isSevere ? 'Lưu ý: Thể văn (Lệch vai vế)' : 'Gợi ý: Kính ngữ (Sắc thái)'}
      </span>
      <span className={`material-symbols-outlined text-[13px] transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>
        expand_more
      </span>
    </button>
  );
};

/**
 * SumiInkWhisperBubble: Bong bóng tin nhắn phụ trợ độc lập (Co-pilot / Sensei Whisper Message Bubble)
 * - Nằm tách biệt ngay dưới câu thoại của người học trong dòng đối thoại (Dialogue Stream)
 * - Tuyệt đối KHÔNG làm phình to hoặc biến dạng bong bóng chat chính của người học
 * - Định dạng Wabi-Sabi chuẩn giấy ngà ấm áp với đầy đủ lời giải nghĩa, mẫu câu tự nhiên và nút hành động nhanh
 */
export interface SumiInkWhisperBubbleProps {
  feedback?: SumiInkFeedbackDto;
  onRedo?: () => void;
  onApplyText?: (text: string) => void;
  onClose: () => void;
  className?: string;
}

export const SumiInkWhisperBubble: React.FC<SumiInkWhisperBubbleProps> = ({
  feedback,
  onRedo,
  onApplyText,
  onClose,
  className = '',
}) => {
  if (!feedback || !feedback.hasStain) return null;

  const isSevere = feedback.stainType === 'TameguchiSlip' || feedback.stainType === 'error';
  const defaultMessage = isSevere
    ? 'Đối phương ở vị thế xã hội cao hơn, bạn nên dùng Thể lịch sự (です/ます/敬語).'
    : feedback.stainType === 'OverKeigo'
    ? 'Đối thoại thường ngày, dùng kính ngữ quá mức có thể tạo khoảng cách xa cách.'
    : feedback.message || 'Lưu ý về sắc thái biểu đạt hoặc vai vế xã hội.';

  const cleanAlternative = feedback.suggestedAlternative
    ? feedback.suggestedAlternative.replace(/^(gợi ý\s*:\s*)+/i, '').trim()
    : '';

  return (
    <div className={`flex items-start justify-end w-full animate-slide-up -mt-1.5 mb-2.5 ${className}`}>
      <div className="relative max-w-[85%] sm:max-w-[78%] rounded-2xl rounded-tr-[4px] border border-amber-300/80 bg-[#FFFDF7] p-3 sm:p-3.5 text-xs font-sans shadow-xs text-slate-800 space-y-2">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 border-b border-amber-200/60 pb-1.5">
          <div className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-sm text-amber-600">
              tips_and_updates
            </span>
            <span className="font-bold text-[11px] text-amber-950 uppercase tracking-wide">
              Trợ lý Sensei · Gợi ý điều chỉnh sắc thái
            </span>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="text-slate-400 hover:text-slate-700 text-xs p-0.5 rounded cursor-pointer transition"
            title="Đóng gợi ý này"
          >
            ✕
          </button>
        </div>

        {/* Lời giải thích */}
        <p className="text-[12px] leading-relaxed text-slate-700">
          {feedback.message || defaultMessage}
        </p>

        {/* Mẫu câu gợi ý */}
        {cleanAlternative && (
          <div className="rounded-xl border border-amber-200/80 bg-amber-50/70 p-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="min-w-0">
              <span className="text-[10px] font-bold text-amber-800 block uppercase tracking-wider">
                Mẫu câu chuẩn tự nhiên:
              </span>
              <span className="font-japanese text-[14px] font-medium text-slate-900 break-words mt-0.5 block">
                {cleanAlternative}
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
              {onApplyText && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onApplyText(cleanAlternative);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-white border border-amber-300 text-amber-900 text-[11px] font-bold hover:bg-amber-100 transition cursor-pointer shadow-2xs active:scale-95"
                  title="Nạp mẫu câu này vào ô soạn thảo"
                >
                  Nạp câu này
                </button>
              )}
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
                  className="px-2.5 py-1 rounded-lg bg-amber-600 text-white text-[11px] font-bold hover:bg-amber-700 transition cursor-pointer shadow-2xs active:scale-95"
                  title="Nói lại câu này với mẫu câu gợi ý"
                >
                  Nói lại ↻
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
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
        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/20 text-emerald-800 border border-emerald-400/30 shadow-xs ${className}`}
        title="Bạn đã chủ động dùng cụm từ sinh tồn để duy trì hội thoại. Hoàn toàn được bảo toàn điểm tự chủ!"
      >
        <span className="material-symbols-outlined text-xs text-emerald-600">check_circle</span>
        <span>Cụm từ sinh tồn (100đ Tự chủ)</span>
      </div>
    );
  }

  // If no stain was detected, do not render any stain
  if (!feedback.hasStain) return null;

  return (
    <div className={`flex flex-col items-start gap-1.5 transition-all duration-300 ${className}`}>
      <div className="flex items-center gap-2">
        <SumiInkPill
          feedback={feedback}
          isExpanded={isExpanded}
          onToggle={() => setIsExpanded((prev) => !prev)}
        />
        {onRedo && <RedoTurnButton onRedo={onRedo} />}
      </div>
      {isExpanded && (
        <SumiInkWhisperBubble
          feedback={feedback}
          onRedo={onRedo}
          onClose={() => setIsExpanded(false)}
        />
      )}
    </div>
  );
};
