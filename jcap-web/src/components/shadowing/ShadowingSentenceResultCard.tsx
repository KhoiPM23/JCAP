import React from 'react';
import { JapaneseSentenceDiffView } from './JapaneseSentenceDiffView';
import type { ShadowingDiffToken, ShadowingFluencyMetrics } from '../../types/shadowing';

export interface ShadowingSentenceResultCardProps {
  targetText: string;
  spokenText?: string;
  overallScore: number;
  /** Số liệu nhịp nói thô (tham khảo, chưa tính vào điểm). null/unavailable = không hiển thị. */
  fluencyMetrics?: ShadowingFluencyMetrics | null;
  gateDetail?: string;
  diffTokens: ShadowingDiffToken[];
  attemptsCount: number;
  hasRecording: boolean;
  isPlayingUserAudio: boolean;
  evaluationStatus?: 'completed' | 'partial' | 'unavailable' | 'failed';
  /** Nguồn nhận dạng backend đã dùng; web_speech nghĩa là nguồn chính gặp lỗi kỹ thuật. */
  recognitionSource?: 'gemini' | 'web_speech' | null;
  onPlayUserAudio: () => void;
  onRetry: () => void;
  onNext: () => void;
  className?: string;
}

export const ShadowingSentenceResultCard: React.FC<ShadowingSentenceResultCardProps> = ({
  targetText,
  spokenText = '',
  overallScore,
  fluencyMetrics = null,
  gateDetail,
  diffTokens,
  attemptsCount,
  hasRecording,
  isPlayingUserAudio,
  evaluationStatus = 'completed',
  recognitionSource = null,
  onPlayUserAudio,
  onRetry,
  onNext,
  className = '',
}) => {
  // State C: chưa chấm được (không có điểm). unavailable = thiếu dữ liệu tin cậy (im lặng, âm thanh không đạt);
  // failed = lỗi kỹ thuật. Cả hai KHÔNG phải điểm 0 và không bị tính vào điểm tổng.
  const cleanSpoken = spokenText.trim();
  const isTechnicalFailure = evaluationStatus === 'failed';
  const isAudioInvalid = cleanSpoken.length === 0 || evaluationStatus === 'unavailable' || isTechnicalFailure;

  // =========================================================================
  // STATE C: Âm thanh không đạt chuẩn (Mic quá nhỏ, ồn hoặc chưa có tiếng)
  // Quy tắc: Không hiện ô điểm đỏ, không hiện progress bar giả, CTA chính là [Thu âm lại]
  // =========================================================================
  if (isAudioInvalid) {
    const invalidReason =
      gateDetail ||
      'Micro chưa bắt rõ giọng nói. Hãy nói to hơn hoặc đưa micro lại gần rồi thử lại nhé.';

    return (
      <div className={`w-full space-y-3 animate-in fade-in duration-200 ${className}`}>
        {/* Header Cảnh báo Kỹ thuật Thân thiện */}
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center text-lg flex-shrink-0 mt-0.5 shadow-2xs">
              🎙️
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="text-sm font-extrabold text-[#071A44]">
                  {isTechnicalFailure ? 'Chưa thể chấm điểm lúc này' : 'Chưa thể đánh giá bản ghi'}
                </h4>
                <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                  Lần thử #{attemptsCount}
                </span>
              </div>
              <p className="text-xs text-[#556987] font-medium mt-1 leading-relaxed">
                {invalidReason}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5 italic">
                * Bản ghi chưa được đánh giá sẽ không bị tính vào điểm tổng của bạn.
              </p>
            </div>
          </div>
        </div>

        {/* Khung Câu Tiếng Nhật Mẫu để học viên quan sát đối chiếu */}
        <div className="bg-[#F8FAFD] p-3.5 rounded-xl border border-slate-200/80 space-y-1.5">
          <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
            CÂU MẪU CẦN LUYỆN
          </span>
          <p className="font-jp text-base sm:text-lg font-bold text-[#071A44] leading-relaxed">
            {targetText}
          </p>
        </div>

        {/* Thanh Điều Hướng Hành Động State C */}
        <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-3 pt-1">
          {/* Nút Nghe lại bản thu (Chỉ hiện khi có file thu âm nhưng bị nhỏ) */}
          <div>
            {hasRecording && (
              <button
                type="button"
                onClick={onPlayUserAudio}
                className={`h-9 px-4 rounded-full text-xs font-bold transition-all shadow-2xs cursor-pointer flex items-center justify-center ${
                  isPlayingUserAudio
                    ? 'bg-cyan-100 text-cyan-800 border border-cyan-300 animate-pulse'
                    : 'text-[#0878EE] bg-blue-50 hover:bg-blue-100 border border-blue-200'
                }`}
                title="Bấm để kiểm tra lại âm thanh bạn vừa thu âm"
              >
                <span>{isPlayingUserAudio ? 'Đang phát...' : 'Nghe lại bản thu'}</span>
              </button>
            )}
          </div>

          {/* Cặp CTA: [Bỏ qua câu] (phụ) vs [Thu âm lại] (chính) */}
          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onNext}
              className="h-9 px-4 rounded-full text-xs font-bold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-all cursor-pointer"
              title="Bỏ qua câu này và chuyển sang câu tiếp theo"
            >
              Bỏ qua câu
            </button>
            <button
              type="button"
              onClick={onRetry}
              className="h-9 px-6 rounded-full text-xs font-extrabold text-white bg-[#0878EE] hover:bg-[#0662C6] transition-all shadow-sm flex items-center justify-center transform hover:scale-102 active:scale-98 cursor-pointer"
            >
              <span>Thu âm lại</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // STATE D: Bản ghi hợp lệ & Đã có kết quả (Valid Evaluated State)
  return (
    <div className={`w-full space-y-3 animate-in fade-in duration-200 ${className}`}>
      {/* 1. ĐỐI CHIẾU CÂU MẪU (Unified Sentence Diff Card) */}
      <div className="bg-[#F8FAFD] p-3.5 rounded-xl border border-slate-200/80 space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-slate-200/60">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
              ĐỐI CHIẾU CÂU MẪU
            </span>
            <span className="text-[10px] font-bold text-slate-400 bg-white px-2 py-0.5 rounded-full border border-slate-200">
              Lần thử #{attemptsCount}
            </span>
          </div>
          <div className="flex items-baseline gap-1 bg-white px-3 py-1 rounded-xl border border-slate-200/80 shadow-2xs">
            <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider mr-0.5">
              Điểm
            </span>
            <span
              className={`text-xl font-black tracking-tight leading-none ${
                overallScore >= 80
                  ? 'text-emerald-600'
                  : overallScore >= 65
                  ? 'text-amber-600'
                  : 'text-rose-600'
              }`}
            >
              {overallScore}
            </span>
            <span className="text-xs font-bold text-slate-400">/100</span>
          </div>
        </div>
        <JapaneseSentenceDiffView
          diffTokens={diffTokens}
          targetText={targetText}
          spokenText={cleanSpoken}
          size="md"
        />
        {evaluationStatus === 'partial' && recognitionSource === 'web_speech' && (
          <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
            Dịch vụ nhận dạng AI tạm thời không khả dụng nên lượt này được chấm theo nhận dạng của trình duyệt.
          </p>
        )}
      </div>

      {/* 2. NHỊP NÓI SO VỚI GIỌNG MẪU: chỉ hiện khi đủ điều kiện so sánh (đọc đúng câu, có giọng mẫu, audio hợp lệ).
          Là nhận xét về nhịp, không phải điểm và không nói lên phát âm đúng/sai. */}
      {(fluencyMetrics?.comparison?.status === 'available' || (fluencyMetrics?.observations ?? []).length > 0) && (
        <div className="bg-white px-3.5 py-2.5 rounded-xl border border-slate-200/80">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
              Nhịp nói so với giọng mẫu
            </span>
            <span className="text-[10px] text-slate-400">Tham khảo, chưa tính vào điểm</span>
          </div>
          {(fluencyMetrics.observations ?? []).length > 0 ? (
            <ul className="mt-1.5 space-y-1 text-xs text-[#071A44] list-disc pl-4">
              {(fluencyMetrics.observations ?? []).map((o, i) => (
                <li key={`${o.code}-${i}`}>
                  {o.message}
                  {o.data?.experimental === true && (
                    <span className="ml-1.5 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5 align-middle">
                      Thử nghiệm
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1.5 text-xs text-slate-500">Chưa thấy khác biệt rõ về nhịp nói so với giọng mẫu.</p>
          )}
        </div>
      )}

      {/* 3. BA NÚT THAO TÁC: [🎧 Nghe lại] [🔄 Luyện lại câu] [Tiếp tục →] */}
      <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-3 pt-1">
        {/* Nút 1: Nghe lại giọng bạn */}
        <div>
          {hasRecording ? (
            <button
              type="button"
              onClick={onPlayUserAudio}
              className={`h-9 px-4 rounded-full text-xs font-bold transition-all shadow-2xs cursor-pointer flex items-center justify-center ${
                isPlayingUserAudio
                  ? 'bg-cyan-100 text-cyan-800 border border-cyan-300 animate-pulse'
                  : 'text-[#0878EE] bg-blue-50/80 hover:bg-blue-100 border border-blue-200'
              }`}
              title="Nghe lại giọng bạn vừa thu âm"
            >
              <span>{isPlayingUserAudio ? 'Đang phát...' : 'Nghe lại'}</span>
            </button>
          ) : (
            <div className="h-9" />
          )}
        </div>

        {/* Nút 2 & 3: Luyện lại câu + Tiếp tục */}
        <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
          <button
            type="button"
            onClick={onRetry}
            className="h-9 px-4 rounded-full text-xs font-bold text-[#4A5D78] hover:text-[#0878EE] bg-white hover:bg-[#EEF6FE] border border-[#E6EDF5] transition-all shadow-2xs cursor-pointer flex items-center justify-center"
            title="Luyện thu âm lại câu này"
          >
            <span>Luyện lại câu</span>
          </button>
          <button
            type="button"
            onClick={onNext}
            className="h-9 px-6 rounded-full text-xs font-extrabold text-white bg-[#0878EE] hover:bg-[#0662C6] transition-all shadow-sm flex items-center justify-center transform hover:scale-102 active:scale-98 cursor-pointer"
            title="Chốt kết quả và chuyển sang câu tiếp theo"
          >
            <span>Tiếp tục</span>
          </button>
        </div>
      </div>
    </div>
  );
};

