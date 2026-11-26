import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { FlashcardQuota } from '../../types/flashcard';

export interface FlashcardStudyQuotaModalProps {
  isOpen: boolean;
  setTitle: string;
  totalNewCards: number;
  learnedCardsCount: number;
  quota: FlashcardQuota | null;
  unlocking: boolean;
  unlockError?: string | null;
  unlockSuccess?: string | null;
  onUnlockExtra: () => Promise<void>;
  onContinue: () => void;
  onExtraPractice?: () => void;
  onClose: () => void;
}

export const FlashcardStudyQuotaModal: React.FC<FlashcardStudyQuotaModalProps> = ({
  isOpen,
  setTitle,
  totalNewCards,
  learnedCardsCount,
  quota,
  unlocking,
  unlockError,
  unlockSuccess,
  onUnlockExtra,
  onContinue,
  onExtraPractice,
  onClose,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !quota) return null;

  const remaining = Math.max(0, quota.remainingNewCardsToday);
  const isExhausted = remaining === 0;
  const isPartial = remaining > 0 && remaining < totalNewCards;
  const cardsThisTurn = Math.min(totalNewCards, remaining);
  const cardsRemainingAfterTurn = Math.max(0, totalNewCards - cardsThisTurn);
  const hasEnoughCredit = quota.userCreditBalance >= quota.unlockCreditCost;

  return createPortal(
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-[9999] animate-fade-in overflow-y-auto"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-paper-50 rounded-3xl border border-line max-w-md w-full shadow-2xl p-6 space-y-5 my-auto text-sumi"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-line pb-3.5">
          <div className="flex items-start gap-3">
            <div
              className={`w-10 h-10 rounded-2xl flex items-center justify-center text-xl shrink-0 border ${
                isExhausted
                  ? 'bg-danger-soft text-danger border-danger/30'
                  : isPartial
                  ? 'bg-warning-soft text-warning border-warning/30'
                  : 'bg-success-soft text-success border-success/30'
              }`}
            >
              {isExhausted ? '🔒' : isPartial ? '⚡' : '✅'}
            </div>
            <div>
              <h3 className="text-base font-black text-sumi leading-snug">
                {isExhausted
                  ? 'Đã hết hạn mức thẻ mới hôm nay'
                  : isPartial
                  ? 'Không thể học hết bộ trong 1 lượt'
                  : 'Đã đủ hạn mức học trọn bộ!'}
              </h3>
              <p className="text-xs text-sumi-muted mt-0.5 line-clamp-1">{setTitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-paper-100 hover:bg-paper-200 text-sumi-muted hover:text-sumi font-bold flex items-center justify-center transition-colors shrink-0 cursor-pointer"
            aria-label="Đóng"
          >
            ✕
          </button>
        </div>

        {/* Body Summary */}
        <div className="space-y-3.5">
          {isExhausted ? (
            <div className="p-4 rounded-2xl bg-danger-soft/40 border border-danger/30 text-xs text-sumi space-y-2 leading-relaxed">
              <p>
                Bạn đã dùng hết hạn mức{' '}
                <strong className="text-danger">
                  {quota.studiedNewCardsToday}/{quota.totalAllowedNewCardsToday} thẻ mới
                </strong>{' '}
                của hôm nay. Bộ thẻ này vẫn còn{' '}
                <strong className="text-sumi">{totalNewCards} thẻ mới</strong> chưa học.
              </p>
              <p className="text-sumi-muted">
                Bạn có thể mở thêm{' '}
                <strong className="text-sumi">+{quota.unlockBatchSize} thẻ mới</strong> bằng Credit ngay bên dưới, hoặc chờ hạn mức miễn phí tự làm mới vào 00:00 ngày mai (thẻ đến hạn ôn lại luôn miễn phí).
              </p>
            </div>
          ) : isPartial ? (
            <>
              <p className="text-xs text-sumi-muted leading-relaxed">
                Bộ thẻ này còn <strong className="text-sumi">{totalNewCards} thẻ mới</strong>, lớn hơn hạn mức thẻ mới còn lại hôm nay của bạn. Lượt học này sẽ mở tối đa{' '}
                <strong className="text-ai">{cardsThisTurn} thẻ mới</strong>.
              </p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-ai-soft/50 border border-ai/30 rounded-xl p-2.5">
                  <div className="text-[10px] font-bold text-ai uppercase">Học lượt này</div>
                  <div className="text-lg font-black text-ai">{cardsThisTurn}</div>
                </div>
                <div className="bg-paper-100 border border-line rounded-xl p-2.5">
                  <div className="text-[10px] font-bold text-sumi-muted uppercase">Tổng thẻ mới</div>
                  <div className="text-lg font-black text-sumi">{totalNewCards}</div>
                </div>
                <div className="bg-warning-soft/50 border border-warning/30 rounded-xl p-2.5">
                  <div className="text-[10px] font-bold text-warning uppercase">Còn lại sau</div>
                  <div className="text-lg font-black text-warning">{cardsRemainingAfterTurn}</div>
                </div>
              </div>
            </>
          ) : (
            <div className="p-4 rounded-2xl bg-success-soft/40 border border-success/30 text-xs text-sumi leading-relaxed">
              Hạn mức hiện tại (<strong className="text-success">còn {remaining} thẻ mới</strong>) đã đủ để bạn học toàn bộ{' '}
              <strong>{totalNewCards} thẻ mới</strong> còn lại trong bộ này trong 1 lượt.
            </div>
          )}

          {/* Quota & Credit Info Bar */}
          <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-paper-100 border border-line text-xs">
            <span className="text-sumi-muted">
              Hạn mức hôm nay:{' '}
              <strong className="text-sumi">
                {quota.studiedNewCardsToday}/{quota.totalAllowedNewCardsToday}
              </strong>
            </span>
            <span className="text-sumi-muted">
              Số dư:{' '}
              <strong className={hasEnoughCredit ? 'text-warning' : 'text-danger'}>
                {quota.userCreditBalance} 🪙
              </strong>
            </span>
          </div>

          {/* Inline feedback inside modal */}
          {unlockSuccess && (
            <div className="px-3.5 py-2.5 rounded-xl bg-success-soft border border-success/30 text-success text-xs font-semibold">
              ✅ {unlockSuccess}
            </div>
          )}
          {unlockError && (
            <div className="px-3.5 py-2.5 rounded-xl bg-danger-soft border border-danger/30 text-danger text-xs font-semibold">
              ⚠️ {unlockError}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="space-y-2.5 pt-1">
          {!isExhausted && (
            <button
              type="button"
              onClick={onContinue}
              className="w-full py-3 px-4 rounded-xl bg-ai hover:bg-ai-hover text-on-ai font-extrabold text-xs transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>▶</span>
              <span>Tiếp tục học {cardsThisTurn} thẻ</span>
            </button>
          )}

          {(isExhausted || isPartial) && (
            <button
              type="button"
              onClick={onUnlockExtra}
              disabled={unlocking}
              className={`w-full py-2.5 px-4 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 ${
                isExhausted
                  ? 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-xs'
                  : 'bg-warning-soft/60 hover:bg-warning-soft text-warning border border-warning/30'
              }`}
            >
              <span>🔓</span>
              <span>
                {unlocking
                  ? 'Đang mở khóa...'
                  : `Mở thêm +${quota.unlockBatchSize} thẻ (-${quota.unlockCreditCost} 🪙)`}
              </span>
            </button>
          )}

          {isExhausted && learnedCardsCount > 0 && onExtraPractice && (
            <button
              type="button"
              onClick={onExtraPractice}
              className="w-full py-2.5 px-4 rounded-xl bg-ai-soft hover:bg-ai-soft/80 text-ai border border-ai/30 font-bold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <span>↻</span>
              <span>Ôn thêm tự do (không tốn hạn mức)</span>
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 px-4 rounded-xl bg-paper-100 hover:bg-paper-200 text-sumi font-bold text-xs border border-line transition-colors cursor-pointer"
          >
            {isExhausted ? 'Đóng' : 'Hủy'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
