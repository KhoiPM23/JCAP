import { useEffect, useRef, type ReactNode } from 'react';
import { Modal } from '../../../components/ui/Modal';
import type { TopicOption } from '../../../types/adminLearning';

export const inputClass = 'w-full rounded-lg border border-[#E6EDF5] bg-white px-3 py-2 text-sm text-[#071A44] outline-none focus:border-[#0878EE] focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-500';
export const primaryClass = 'inline-flex items-center justify-center gap-2 rounded-lg bg-[#0878EE] px-4 py-2 text-sm font-semibold text-white hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed';
export const secondaryClass = 'inline-flex items-center justify-center gap-2 rounded-lg border border-[#E6EDF5] bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50';
export const actionClass = 'rounded-md px-2 py-1.5 text-xs font-semibold text-[#0878EE] hover:bg-blue-50 disabled:opacity-40';
export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="block space-y-1.5"><span className="text-xs font-semibold text-slate-600">{label}</span>{children}{hint && <span className="block text-xs font-normal text-slate-400">{hint}</span>}</label>;
}
export function LevelBadge({ level }: { level: string }) {
  return <span className="inline-flex rounded-md border border-blue-100 bg-blue-50 px-2 py-0.5 text-xs font-bold text-[#0878EE]">{level}</span>;
}
export function StatusBadge({ active }: { active: boolean }) {
  return <span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{active ? 'Đang hiển thị' : 'Đã ẩn'}</span>;
}
export function ErrorBox({ message }: { message: string }) {
  return message ? <div role="alert" className="rounded-lg border border-red-100 bg-red-50 px-3 py-2.5 text-sm text-red-700">{message}</div> : null;
}
export function LearningModal({ title, children, footer, onClose, busy = false, wide = true }: { title: string; children: ReactNode; footer?: ReactNode; onClose: () => void; busy?: boolean; wide?: boolean }) {
  const container = useRef<HTMLDivElement>(null);
  const close = useRef(onClose); close.current = onClose;
  const saving = useRef(busy); saving.current = busy;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = container.current?.closest('[role="dialog"]');
    const focusable = () => Array.from(dialog?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href]') || []);
    (container.current?.querySelector<HTMLElement>('input, textarea, select, button') || focusable()[0])?.focus();
    const handle = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving.current) { event.preventDefault(); close.current(); }
      if (event.key === 'Tab') {
        const items = focusable(); const first = items[0]; const last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', handle);
    return () => { document.removeEventListener('keydown', handle); previous?.focus(); };
  }, []);
  return <Modal isOpen onClose={() => { if (!busy) onClose(); }} title={title} maxWidth={wide ? '2xl' : 'lg'} footer={footer}><div ref={container}>{children}</div></Modal>;
}
export function TopicChoices({ topics, selected, onChange, disabled = false }: { topics: TopicOption[]; selected: number[]; onChange: (ids: number[]) => void; disabled?: boolean }) {
  return <div className="max-h-36 overflow-y-auto rounded-lg border border-[#E6EDF5] p-2 space-y-1">{topics.length ? topics.map(topic => <label key={topic.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-slate-50"><input type="checkbox" className="accent-[#0878EE]" checked={selected.includes(topic.id)} disabled={disabled} onChange={e => onChange(e.target.checked ? [...selected, topic.id] : selected.filter(id => id !== topic.id))} /><span className="flex-1">{topic.name}</span><span className="text-xs text-slate-400">{topic.jlptLevel}{!topic.isActive ? ' · Đã ẩn' : ''}</span></label>) : <p className="p-2 text-xs text-slate-400">Chưa có chủ đề ở level này.</p>}</div>;
}
