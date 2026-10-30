import React from 'react';
import type { RoleplayMessageDto } from '../../types/roleplay';
import { ukiyoSound } from '../../utils/ukiyoSoundEngine';

export interface EvaluationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  selectedMessage: RoleplayMessageDto | null;
  onRedoTurn?: (msg: RoleplayMessageDto) => void;
}

export const EvaluationDrawer: React.FC<EvaluationDrawerProps> = ({
  isOpen,
  onClose,
  selectedMessage,
  onRedoTurn,
}) => {
  if (!isOpen) return null;

  const feedback = selectedMessage?.linguisticFeedback;
  const score = feedback?.speechDelivery?.turnFluencyScore ?? 85;

  const getScoreColor = (sc: number) => {
    if (sc >= 85) return 'text-emerald-700 bg-emerald-50 border-emerald-300';
    if (sc >= 70) return 'text-amber-700 bg-amber-50 border-amber-300';
    return 'text-rose-700 bg-rose-50 border-rose-300';
  };

  return (
    <aside className="fixed inset-y-0 right-0 w-80 md:w-96 bg-[var(--paper-50)] border-l border-[var(--line)] shadow-2xl z-40 flex flex-col animate-slide-up select-none">
      {/* Header Drawer */}
      <div className="p-4 border-b border-[var(--line)] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[var(--ai)]">insights</span>
          <h3 className="font-bold text-sm text-[var(--sumi)]">Đánh giá & Nhận xét câu</h3>
        </div>
        <button
          type="button"
          onClick={() => {
            ukiyoSound.playSubtleTap();
            onClose();
          }}
          className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-[var(--paper-200)] transition cursor-pointer"
        >
          ✕
        </button>
      </div>

      {/* Body Drawer */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {!selectedMessage && (
          <div className="py-16 text-center text-[var(--sumi-muted)] space-y-2">
            <span className="material-symbols-outlined text-4xl text-slate-300 block">touch_app</span>
            <p className="text-xs">Bấm vào bất kỳ câu nào bạn vừa nói trong hội thoại để xem nhận xét chi tiết.</p>
          </div>
        )}

        {selectedMessage && (
          <>
            {/* Điểm tổng hợp lượt nói */}
            <div className="flex items-center justify-between p-4 rounded-2xl bg-[var(--paper-100)] border border-[var(--line)]">
              <div>
                <span className="text-[11px] font-bold text-[var(--sumi-muted)] uppercase tracking-wider block">
                  Điểm phát âm & tự nhiên
                </span>
                <span className="text-xs text-[var(--sumi-muted)]">Dựa trên ngữ pháp và phản xạ</span>
              </div>
              <div
                className={`w-14 h-14 rounded-full flex items-center justify-center font-bold text-xl font-mono border-2 shadow-xs ${getScoreColor(
                  score
                )}`}
              >
                {score}
              </div>
            </div>

            {/* Câu người học đã nói */}
            <div className="space-y-1.5">
              <span className="text-xs font-bold text-[var(--sumi-muted)]">Câu của bạn:</span>
              <div className="p-3 bg-white rounded-xl border border-[var(--line)] text-sm font-sans font-medium text-[var(--sumi)]">
                {selectedMessage.japaneseText}
              </div>
            </div>

            {/* Gợi ý sửa lỗi Kintsugi (WordDiff / Grammar Error) */}
            {feedback?.grammarAccuracy?.errors && feedback.grammarAccuracy.errors.length > 0 ? (
              <div className="space-y-2">
                <span className="text-xs font-bold text-amber-900 flex items-center gap-1">
                  <span className="material-symbols-outlined text-base text-amber-600">auto_fix_high</span>
                  <span>Góp ý chỉnh sửa (Kintsugi):</span>
                </span>

                {feedback.grammarAccuracy.errors.map((err, idx) => (
                  <div key={idx} className="p-3 rounded-xl kintsugi-repair space-y-1.5 shadow-xs">
                    <div className="flex items-center justify-between text-xs font-bold text-amber-950">
                      <span>{err.type || 'Lỗi trợ từ / ngữ pháp'}</span>
                      <span className="text-[10px] text-amber-800">Cần lưu ý</span>
                    </div>
                    <p className="text-xs text-amber-900 leading-relaxed font-sans">{err.explanation}</p>
                    {err.suggestedCorrection && (
                      <div className="pt-1 text-xs text-emerald-800 font-medium">
                        ✦ Nên nói là:{' '}
                        <strong className="text-emerald-950 font-bold">{err.suggestedCorrection}</strong>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center gap-2">
                <span className="material-symbols-outlined text-emerald-600 text-lg">check_circle</span>
                <span>Câu nói rất tự nhiên, chuẩn trợ từ và đúng ngữ cảnh!</span>
              </div>
            )}

            {/* Chỉ số phản xạ & Lưu loát (Speech Delivery Telemetry) */}
            {feedback?.speechDelivery && (
              <div className="space-y-2 pt-2 border-t border-[var(--line)]">
                <span className="text-xs font-bold text-[var(--sumi-muted)] block">Chỉ số phản xạ & nhịp điệu:</span>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {feedback.speechDelivery.responseLatencySeconds && (
                    <div className="p-2.5 rounded-xl bg-white border border-[var(--line)]">
                      <span className="text-[10px] text-slate-400 block">Thời gian phản xạ</span>
                      <strong className="text-[var(--sumi)] font-mono text-sm">
                        {feedback.speechDelivery.responseLatencySeconds}s
                      </strong>
                    </div>
                  )}

                  {feedback.speechDelivery.speechPace && (
                    <div className="p-2.5 rounded-xl bg-white border border-[var(--line)]">
                      <span className="text-[10px] text-slate-400 block">Tốc độ phát âm</span>
                      <strong className="text-[var(--sumi)] font-mono text-sm">
                        {feedback.speechDelivery.speechPace} kt/s
                      </strong>
                    </div>
                  )}
                </div>

                {feedback.speechDelivery.latencyAssessment && (
                  <p className="text-[11px] text-[var(--sumi-muted)] italic">
                    ℹ {feedback.speechDelivery.latencyAssessment}
                  </p>
                )}
              </div>
            )}

            {/* Nút Luyện lại lượt này */}
            {onRedoTurn && (
              <div className="pt-4">
                <button
                  type="button"
                  onClick={() => {
                    ukiyoSound.playWoodblockSnap();
                    onRedoTurn(selectedMessage);
                  }}
                  className="w-full py-2.5 rounded-xl bg-[var(--ai)] hover:bg-[var(--ai-hover)] text-white text-xs font-bold shadow-md transition active:scale-98 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-base">replay</span>
                  <span>Nói lại câu này để nâng điểm</span>
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
};
