import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/jcap/Button';
import { Icon } from '../../components/jcap/Icon';
import { JlptBadge } from '../../components/jcap/Badge';
import { getLearning, LearnerLearningError } from '../../services/learnerLearningService';
import { pageNumbers } from './learningNavigation';
import './learning.css';

export function useLearningResource<T>(path: string, delay = 0) {
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<{ path: string; data: T | null; loading: boolean; error: LearnerLearningError | null }>({ path: '', data: null, loading: true, error: null });
  useEffect(() => {
    const controller = new AbortController();
    setState({ path, data: null, loading: true, error: null });
    const timer = window.setTimeout(() => {
      getLearning<T>(path, controller.signal).then(data => { if (!controller.signal.aborted) setState({ path, data, loading: false, error: null }); })
        .catch(cause => { if (!controller.signal.aborted) setState({ path, data: null, loading: false, error: cause instanceof LearnerLearningError ? cause : new LearnerLearningError('Không kết nối được đến máy chủ. Vui lòng thử lại.', 0) }); });
    }, delay);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [path, delay, retry]);
  return { ...(state.path === path ? state : { data: null, loading: true, error: null }), reload: () => setRetry(n => n + 1) };
}
export function LearningPage({ children }: { children: ReactNode }) { return <div className="lc-page"><div className="lc-container">{children}</div></div>; }
export function LevelBadge({ level }: { level: string }) {
  return level === 'N5' || level === 'N4' || level === 'N3' ? <JlptBadge level={level} /> : <span className="lc-level">{level}</span>;
}
export function LearningLoading() { return <div className="lc-loading" role="status"><Icon name="progress_activity" spin size={24} /><span>Đang tải học liệu…</span></div>; }
export function LearningFailure({ error, reload, back }: { error: LearnerLearningError; reload: () => void; back: string }) {
  return <div className="lc-error" role="alert"><Icon name="error_outline" size={28} /><h2>Không thể mở học liệu</h2><p>{error.message}</p><div className="lc-actions">{error.status === 401 ? <Link className="jc-btn jc-btn--primary" to="/login">Đăng nhập lại</Link> : <Button onClick={reload} icon="refresh">Thử lại</Button>}<Link className="jc-btn jc-btn--ghost" to={back}>Quay lại danh sách</Link></div></div>;
}
export function Pagination({ page, pageSize, total, label, busy, onPage }: { page: number; pageSize: number; total: number; label: string; busy: boolean; onPage: (page: number) => void }) {
  const last = Math.max(1, Math.ceil(total / pageSize));
  return <nav className="lc-pagination" aria-label={`Phân trang ${label}`}><span className="lc-pageinfo">{total ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} / ` : ''}{total} {label} · Trang {page}/{last}</span><div className="lc-pages"><Button size="sm" icon="chevron_left" disabled={busy || page <= 1} onClick={() => onPage(page - 1)} aria-label="Trang trước" /><div className="lc-page-numbers">{pageNumbers(page, last).map((p, i) => p === null ? <span key={`gap-${i}`} className="lc-page-gap">…</span> : <Button key={p} size="sm" variant={p === page ? 'primary' : 'ghost'} aria-current={p === page ? 'page' : undefined} aria-label={`Trang ${p}`} disabled={busy} onClick={() => onPage(p)}>{p}</Button>)}</div><Button size="sm" icon="chevron_right" disabled={busy || page >= last} onClick={() => onPage(page + 1)} aria-label="Trang sau" /></div></nav>;
}
