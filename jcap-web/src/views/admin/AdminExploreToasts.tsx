import React, { useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { Toast, type ToastType } from '../../components/ui/Toast';

interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

/** Thông báo nổi góc phải cho các trang quản lý Khám phá */
export function useAdminToasts() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toast = useCallback((message: string, type: ToastType = 'success') => {
    setToasts((t) => [...t, { id: `${Date.now()}-${Math.random()}`, message, type }]);
  }, []);
  const remove = useCallback((id: string) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const node = createPortal(
    <div className="fixed top-5 right-5 z-[9999] flex flex-col gap-2.5 pointer-events-none w-auto max-w-[calc(100vw-2rem)]">
      {toasts.map((t) => (
        <Toast key={t.id} id={t.id} message={t.message} type={t.type} onClose={remove} />
      ))}
    </div>,
    document.body,
  );
  return { toast, toasts: node };
}

/** Khung lỗi tải dữ liệu kèm nút thử lại */
export const LoadError: React.FC<{ message: string; onRetry: () => void }> = ({ message, onRetry }) => (
  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3" role="alert">
    <p className="text-sm text-red-800">{message}</p>
    <button
      type="button"
      onClick={onRetry}
      className="h-9 px-3 rounded-lg bg-white border border-red-200 text-red-700 text-xs font-semibold hover:bg-red-100"
    >
      Thử lại
    </button>
  </div>
);
