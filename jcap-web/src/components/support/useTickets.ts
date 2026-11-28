import { useCallback, useEffect, useRef, useState } from 'react';
import type { FeedbackTicket } from '../../services/feedbackService';
import type { ApiResponse } from '../../types/auth';

const REFRESH_MS = 10000;

/** Danh sách phiếu: tải lần đầu, tự tải lại mỗi 10 giây (lỗi ngầm thì giữ danh sách đang có) */
export function useTickets(load: () => Promise<ApiResponse<FeedbackTicket[]>>) {
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [tickets, setTickets] = useState<FeedbackTicket[]>([]);
  const loadedRef = useRef(false);
  const loadRef = useRef(load);
  loadRef.current = load;
  /** Tăng sau mỗi thao tác của mình: kết quả tải bắt đầu trước đó đã cũ, bỏ qua */
  const mutationRef = useRef(0);

  const refresh = useCallback(async () => {
    const before = mutationRef.current;
    const res = await loadRef.current();
    if (before !== mutationRef.current) return;
    if (res.success && res.data) {
      loadedRef.current = true;
      setTickets(res.data);
      setStatus('ok');
    } else if (!loadedRef.current) {
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const retry = () => {
    setStatus('loading');
    void refresh();
  };
  /** Thêm hoặc thay một phiếu bằng bản server vừa trả về */
  const put = useCallback((ticket: FeedbackTicket) => {
    mutationRef.current += 1;
    setTickets((prev) => (prev.some((t) => t.id === ticket.id) ? prev.map((t) => (t.id === ticket.id ? ticket : t)) : [ticket, ...prev]));
  }, []);

  return { status, tickets, refresh, retry, put };
}
