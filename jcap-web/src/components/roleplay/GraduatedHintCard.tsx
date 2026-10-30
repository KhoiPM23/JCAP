import React, { useState } from 'react';
import { ukiyoSound } from '../../utils/ukiyoSoundEngine';
import {
  extractJapaneseKeywords,
  deriveJapaneseCloze,
  sanitizeDisplayJapanese,
} from '../../utils/japaneseSanitizer';

export interface GraduatedHintCardProps {
  missionTitle: string;
  keywords?: string[];
  clozeSentence?: string;
  fullJapaneseSample: string;
  vietnameseMeaning?: string;
  onUseHint: (text: string, tier: 1 | 2 | 3) => void;
  /** Callback fired immediately when user switches tier tab — used to record penalty level without waiting for "Dùng" button */
  onTierChange?: (tier: 1 | 2 | 3) => void;
  onPlaySampleAudio?: () => void;
  onClose: () => void;
}

export const GraduatedHintCard: React.FC<GraduatedHintCardProps> = ({
  missionTitle,
  keywords = [],
  clozeSentence,
  fullJapaneseSample,
  vietnameseMeaning,
  onUseHint,
  onTierChange,
  onPlaySampleAudio,
  onClose,
}) => {
  const [hintTier, setHintTier] = useState<1 | 2 | 3>(1);

  const cleanSample = sanitizeDisplayJapanese(fullJapaneseSample);

  // 1. Phân giải danh sách từ khóa thực sự (Tier 1)
  const resolvedKeywords =
    keywords.length > 0 ? keywords : extractJapaneseKeywords(cleanSample);

  // 2. Phân giải câu điền khuyết thực sự (Tier 2)
  const derivedCloze =
    clozeSentence ||
    deriveJapaneseCloze(
      cleanSample,
      resolvedKeywords.length > 0 ? resolvedKeywords[0] : undefined
    );

  // Xử lý nạp văn bản thích ứng theo đúng cấp độ người học chọn
  const handleApplyCurrentTier = () => {
    ukiyoSound.playSubtleTap();
    if (hintTier === 1) {
      // Cấp 1: Chỉ nạp các từ khóa chính để người học tự ghép thành câu hoàn chỉnh (-10đ tự chủ)
      onUseHint(resolvedKeywords.join(' '), 1);
    } else if (hintTier === 2) {
      // Cấp 2: Nạp mẫu câu điền khuyết với chỗ trống [ ______ ] (-30đ tự chủ)
      onUseHint(derivedCloze, 2);
    } else {
      // Cấp 3: Nạp toàn bộ câu mẫu hoàn chỉnh (-60đ tự chủ)
      onUseHint(cleanSample, 3);
    }
  };

  return (
    <div className="w-full p-3.5 bg-gradient-to-br from-amber-50/95 via-orange-50/80 to-amber-100/60 rounded-2xl border border-amber-300/80 shadow-md flex flex-col gap-2.5 animate-slide-up select-none">
      {/* Header thanh gợi ý giàn giáo */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-amber-600 font-bold text-base">💡</span>
          <div className="flex flex-col">
            <span className="text-xs font-bold text-amber-950 uppercase tracking-wide">
              Giàn giáo ZPD: {missionTitle || 'Nhiệm vụ hiện tại'}
            </span>
            <span className="text-[10px] text-amber-900 font-medium">
              👁️ Đang xem trước (Chưa trừ điểm) — {hintTier === 1 && 'Cấp 1: Từ khóa (Nếu áp dụng: -10đ tự chủ)'}{hintTier === 2 && 'Cấp 2: Khung điền khuyết (Nếu áp dụng: -30đ tự chủ)'}{hintTier === 3 && 'Cấp 3: Mẫu câu hoàn chỉnh (Nếu áp dụng: -60đ tự chủ)'}
            </span>
          </div>
        </div>

        {/* Nút đóng */}
        <button
          type="button"
          onClick={() => {
            ukiyoSound.playSubtleTap();
            onClose();
          }}
          className="text-amber-800/70 hover:text-amber-950 text-xs p-1 rounded-lg hover:bg-amber-100/60 transition"
          title="Đóng gợi ý"
        >
          ✕
        </button>
      </div>

      {/* Bộ chọn 3 cấp độ giàn giáo (Graduated Scaffolding Tabs) */}
      <div className="grid grid-cols-3 gap-1 bg-amber-200/50 p-1 rounded-xl text-center">
        <button
          type="button"
          onClick={() => {
            ukiyoSound.playSubtleTap();
            setHintTier(1);
            onTierChange?.(1);
          }}
          className={`py-1.5 px-1 text-[11px] font-bold rounded-lg transition ${
            hintTier === 1
              ? 'bg-white text-amber-950 shadow-xs'
              : 'text-amber-900/70 hover:text-amber-950 hover:bg-white/40'
          }`}
        >
          <span>Cấp 1: Từ khoá</span>
          <span className="block text-[9px] font-normal text-emerald-700">(-10đ)</span>
        </button>
        <button
          type="button"
          onClick={() => {
            ukiyoSound.playSubtleTap();
            setHintTier(2);
            onTierChange?.(2);
          }}
          className={`py-1.5 px-1 text-[11px] font-bold rounded-lg transition ${
            hintTier === 2
              ? 'bg-white text-amber-950 shadow-xs'
              : 'text-amber-900/70 hover:text-amber-950 hover:bg-white/40'
          }`}
        >
          <span>Cấp 2: Điền khuyết</span>
          <span className="block text-[9px] font-normal text-amber-700">(-30đ)</span>
        </button>
        <button
          type="button"
          onClick={() => {
            ukiyoSound.playSubtleTap();
            setHintTier(3);
            onTierChange?.(3);
          }}
          className={`py-1.5 px-1 text-[11px] font-bold rounded-lg transition ${
            hintTier === 3
              ? 'bg-white text-amber-950 shadow-xs'
              : 'text-amber-900/70 hover:text-amber-950 hover:bg-white/40'
          }`}
        >
          <span>Cấp 3: Trọn câu</span>
          <span className="block text-[9px] font-normal text-rose-700">(-60đ)</span>
        </button>
      </div>

      {/* Nội dung hiển thị riêng biệt theo Tier */}
      <div className="py-1">
        {hintTier === 1 && (
          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-semibold text-amber-900/80">
              Nhấp từ khóa để chèn nhanh, hoặc bấm nút dưới để lấy toàn bộ:
            </span>
            <div className="flex flex-wrap gap-2">
              {resolvedKeywords.map((kw, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    ukiyoSound.playSubtleTap();
                    onUseHint(kw, 1);
                  }}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white border border-amber-300 text-xs font-bold text-amber-950 shadow-2xs hover:bg-amber-100/70 hover:border-amber-400 transition cursor-pointer"
                  title="Bấm để nạp từ này vào ô nhập"
                >
                  <span>{kw}</span>
                  <span className="text-[10px] text-amber-600 font-normal">＋</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {hintTier === 2 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold text-amber-900/80">
              Khung câu điền từ (Hoàn thành vị trí trong ngoặc):
            </span>
            <div className="text-sm font-bold text-amber-950 tracking-wide font-sans bg-white/95 p-2.5 rounded-xl border border-amber-300 shadow-2xs flex items-center justify-between">
              <span>{derivedCloze}</span>
            </div>
          </div>
        )}

        {hintTier === 3 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold text-amber-900/80">
              Mẫu câu hoàn chỉnh chuẩn Tokyo:
            </span>
            <div className="bg-white p-2.5 rounded-xl border border-amber-300 shadow-2xs space-y-1">
              <p className="text-sm md:text-base font-bold text-amber-950 tracking-wide font-sans">
                {cleanSample}
              </p>
              {vietnameseMeaning && (
                <p className="text-xs text-amber-900/80 italic border-t border-amber-100 pt-1">
                  Dịch nghĩa: {vietnameseMeaning}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Cụm hành động chân thẻ */}
      <div className="flex items-center justify-between gap-2 pt-2 border-t border-amber-200/80">
        <div className="text-[10px] text-amber-800/70 font-medium">
          {hintTier === 1 && '💡 Thử tự nối các từ khóa bằng trợ từ は, を, に'}
          {hintTier === 2 && '💡 Thay thế [ ______ ] bằng từ vựng bạn muốn'}
          {hintTier === 3 && '💡 Lắng nghe ngữ điệu chuẩn trước khi nói'}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {onPlaySampleAudio && (
            <button
              type="button"
              onClick={onPlaySampleAudio}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-bold transition shadow-2xs cursor-pointer"
            >
              <span>🔊</span>
              <span>Nghe mẫu</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleApplyCurrentTier}
            className="px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-xs transition active:scale-95 cursor-pointer"
          >
            {hintTier === 1 && 'Dùng từ khoá (-10đ) ➔'}
            {hintTier === 2 && 'Dùng mẫu khuyết (-30đ) ➔'}
            {hintTier === 3 && 'Dùng trọn câu (-60đ) ➔'}
          </button>
        </div>
      </div>
    </div>
  );
};
