import React, { useState } from 'react';
import { ukiyoSound } from '../../utils/ukiyoSoundEngine';

export interface GraduatedHintCardProps {
  missionTitle: string;
  keywords?: string[];
  clozeSentence?: string;
  fullJapaneseSample: string;
  vietnameseMeaning?: string;
  onUseHint: (sentence: string) => void;
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
  onPlaySampleAudio,
  onClose,
}) => {
  const [hintTier, setHintTier] = useState<1 | 2 | 3>(1);

  // Tạo mẫu điền khuyết tự động nếu không truyền từ BE
  const derivedCloze =
    clozeSentence ||
    (fullJapaneseSample.length > 6
      ? fullJapaneseSample.slice(0, Math.floor(fullJapaneseSample.length * 0.45)) +
        ' [ ______ ] ' +
        fullJapaneseSample.slice(Math.floor(fullJapaneseSample.length * 0.8))
      : fullJapaneseSample);

  return (
    <div className="w-full p-4 bg-gradient-to-br from-amber-50 to-orange-50/50 rounded-2xl border border-amber-200/80 shadow-md flex flex-col gap-3 animate-slide-up select-none">
      {/* Header thanh gợi ý */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-amber-600 text-lg">lightbulb</span>
          <span className="text-xs font-bold text-amber-900 uppercase tracking-wide">
            Gợi ý cho: {missionTitle || 'Nhiệm vụ hiện tại'}
          </span>
        </div>

        {/* Nút đóng */}
        <button
          type="button"
          onClick={() => {
            ukiyoSound.playSubtleTap();
            onClose();
          }}
          className="text-amber-800/60 hover:text-amber-950 text-xs p-1 rounded-lg"
        >
          ✕
        </button>
      </div>

      {/* Bộ chọn 3 cấp độ giàn giáo (Graduated Scaffolding Tabs) */}
      <div className="grid grid-cols-3 gap-1 bg-amber-100/60 p-1 rounded-xl">
        <button
          type="button"
          onClick={() => {
            ukiyoSound.playSubtleTap();
            setHintTier(1);
          }}
          className={`py-1 text-[11px] font-bold rounded-lg transition ${
            hintTier === 1 ? 'bg-white text-amber-900 shadow-xs' : 'text-amber-800/70 hover:text-amber-900'
          }`}
        >
          Cấp 1: Từ khoá
        </button>
        <button
          type="button"
          onClick={() => {
            ukiyoSound.playSubtleTap();
            setHintTier(2);
          }}
          className={`py-1 text-[11px] font-bold rounded-lg transition ${
            hintTier === 2 ? 'bg-white text-amber-900 shadow-xs' : 'text-amber-800/70 hover:text-amber-900'
          }`}
        >
          Cấp 2: Điền khuyết
        </button>
        <button
          type="button"
          onClick={() => {
            ukiyoSound.playSubtleTap();
            setHintTier(3);
          }}
          className={`py-1 text-[11px] font-bold rounded-lg transition ${
            hintTier === 3 ? 'bg-white text-amber-900 shadow-xs' : 'text-amber-800/70 hover:text-amber-900'
          }`}
        >
          Cấp 3: Trọn câu
        </button>
      </div>

      {/* Nội dung gợi ý theo Tier */}
      <div className="py-1">
        {hintTier === 1 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold text-amber-800/80">Từ vựng & mẫu ngữ pháp gợi ý:</span>
            <div className="flex flex-wrap gap-1.5">
              {keywords.length > 0 ? (
                keywords.map((kw, idx) => (
                  <span
                    key={idx}
                    className="px-2.5 py-1 rounded-lg bg-white border border-amber-200 text-xs font-bold text-amber-950 font-sans shadow-xs"
                  >
                    {kw}
                  </span>
                ))
              ) : (
                <span className="px-2.5 py-1 rounded-lg bg-white border border-amber-200 text-xs font-bold text-amber-950 shadow-xs">
                  {fullJapaneseSample.split(/[\s、。]/)[0] || 'お願いします'}
                </span>
              )}
            </div>
          </div>
        )}

        {hintTier === 2 && (
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold text-amber-800/80">Hoàn thành chỗ trống trong câu:</span>
            <p className="text-sm font-bold text-amber-950 tracking-wide font-sans bg-white/80 p-2.5 rounded-xl border border-amber-200/80">
              {derivedCloze}
            </p>
          </div>
        )}

        {hintTier === 3 && (
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold text-amber-800/80">Mẫu câu hoàn chỉnh:</span>
            <p className="text-sm md:text-base font-bold text-amber-950 tracking-wide font-sans bg-white p-2.5 rounded-xl border border-amber-200 shadow-xs">
              {fullJapaneseSample}
            </p>
            {vietnameseMeaning && <p className="text-xs text-amber-800/90 italic mt-0.5">{vietnameseMeaning}</p>}
          </div>
        )}
      </div>

      {/* Cụm hành động chân thẻ */}
      <div className="flex items-center justify-end gap-2 pt-1 border-t border-amber-200/50">
        {onPlaySampleAudio && (
          <button
            type="button"
            onClick={onPlaySampleAudio}
            className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-white hover:bg-amber-100 text-amber-900 border border-amber-200 text-xs font-bold transition cursor-pointer"
          >
            <span className="material-symbols-outlined text-sm">volume_up</span>
            <span>Nghe mẫu</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            ukiyoSound.playSubtleTap();
            onUseHint(fullJapaneseSample);
          }}
          className="px-3 py-1 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-xs transition active:scale-95 cursor-pointer"
        >
          Dùng câu này ➔
        </button>
      </div>
    </div>
  );
};
