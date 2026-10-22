import React, { useEffect, useMemo, useRef, useState } from 'react';
import { JCAP_ICONS, PICTOGRAMS, PREFECTURE_PICTOGRAMS, type Pictogram } from '../../data/japanPictograms';
import { adminExploreService } from '../../services/adminExploreService';
import type { ExploreLevel, ExploreLookupItem, ExploreLookupKind } from '../../types/adminExplore';
import { PictogramIcon } from '../explore/exploreUi';

const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function iconInfo(id: string): Pictogram | undefined {
  return PICTOGRAMS[id] ?? JCAP_ICONS.find((i) => i.id === id);
}

// ---------------------------------------------------------------------------
// Chọn biểu tượng

interface IconPickerProps {
  prefectureId: number;
  value: string;
  onChange: (id: string) => void;
  invalid?: boolean;
}

export const IconPicker: React.FC<IconPickerProps> = ({ prefectureId, value, onChange, invalid }) => {
  const [open, setOpen] = useState(!value);
  const [query, setQuery] = useState('');
  const current = value ? iconInfo(value) : undefined;

  const groups = useMemo(() => {
    const all = [...JCAP_ICONS, ...Object.values(PICTOGRAMS)];
    const q = normalize(query.trim());
    if (q) {
      const hits = all.filter((p) => normalize(p.nameVi).includes(q) || p.nameJp.includes(query.trim()) || p.id.toLowerCase().includes(q));
      return [{ title: `Kết quả (${hits.length})`, items: hits }];
    }
    const suggested = (PREFECTURE_PICTOGRAMS[prefectureId] ?? []).map((id) => PICTOGRAMS[id]).filter(Boolean);
    return [
      { title: 'Gợi ý cho tỉnh này', items: suggested },
      { title: 'Biểu tượng riêng của JCAP', items: JCAP_ICONS },
      { title: 'Tất cả biểu tượng', items: Object.values(PICTOGRAMS).filter((p) => !suggested.includes(p)) },
    ].filter((g) => g.items.length > 0);
  }, [prefectureId, query]);

  return (
    <div>
      <div className={`flex items-center gap-3 rounded-lg border px-3 py-2 bg-white ${invalid ? 'border-red-400' : 'border-slate-300'}`}>
        <span className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
          {value ? <PictogramIcon id={value} color="#334155" className="w-7 h-7" /> : <span className="text-slate-400 text-xs">—</span>}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold text-slate-800 truncate">
            {current ? current.nameVi : value || 'Chưa chọn biểu tượng'}
          </span>
          {value && <span className="block text-[11px] text-slate-500 truncate">{current ? `${current.nameJp} · ${value}` : value}</span>}
        </span>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="shrink-0 h-9 px-3 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0878EE]"
        >
          {open ? 'Đóng' : 'Đổi'}
        </button>
      </div>

      {open && (
        <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm biểu tượng (tên Việt, tên Nhật)…"
            aria-label="Tìm biểu tượng"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0878EE]/40"
          />
          <div className="mt-3 max-h-72 overflow-y-auto space-y-3 pr-1">
            {groups.map((g) => (
              <div key={g.title}>
                <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1.5">{g.title}</div>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
                  {g.items.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      aria-pressed={p.id === value}
                      title={`${p.nameVi} · ${p.nameJp}`}
                      onClick={() => {
                        onChange(p.id);
                        setOpen(false);
                        setQuery('');
                      }}
                      className={`flex flex-col items-center gap-1 rounded-lg border p-2 text-center focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0878EE] ${
                        p.id === value ? 'border-[#0878EE] bg-blue-50' : 'border-transparent bg-white hover:border-slate-300'
                      }`}
                    >
                      <PictogramIcon id={p.id} color="#334155" className="w-8 h-8" />
                      <span className="text-[10px] leading-tight text-slate-700 line-clamp-2">{p.nameVi}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {groups[0]?.items.length === 0 && <p className="text-sm text-slate-500 text-center py-4">Không có biểu tượng phù hợp.</p>}
          </div>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Tìm nội dung để gắn (ngữ pháp, từ vựng, Shadowing, Hội thoại AI)

const KIND_LABEL: Record<ExploreLookupKind, string> = {
  grammar: 'ngữ pháp',
  vocabulary: 'từ vựng',
  shadowing: 'bài Shadowing',
  roleplay: 'kịch bản Hội thoại AI',
};

interface LookupSearchProps {
  kind: ExploreLookupKind;
  /** Cấp của bài: lọc mặc định theo cấp này */
  level: ExploreLevel;
  /** Id đã chọn (ẩn khỏi kết quả) */
  exclude?: number[];
  onSelect: (item: ExploreLookupItem) => void;
  onClose?: () => void;
}

export const LookupSearch: React.FC<LookupSearchProps> = ({ kind, level, exclude = [], onSelect, onClose }) => {
  const [query, setQuery] = useState('');
  const [onlyLevel, setOnlyLevel] = useState(true);
  const [state, setState] = useState<{ loading: boolean; items: ExploreLookupItem[]; error?: string }>({ loading: true, items: [] });
  const seq = useRef(0);

  useEffect(() => {
    const id = ++seq.current;
    setState((s) => ({ ...s, loading: true }));
    // Chờ người dùng gõ xong một chút rồi mới gọi API
    const t = setTimeout(async () => {
      const res = await adminExploreService.lookup(kind, onlyLevel ? level : null, query);
      if (id !== seq.current) return;
      setState(res.success ? { loading: false, items: res.data ?? [] } : { loading: false, items: [], error: res.message });
    }, query ? 250 : 0);
    return () => clearTimeout(t);
  }, [kind, level, onlyLevel, query]);

  const items = state.items.filter((i) => !exclude.includes(i.id));

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Tìm ${KIND_LABEL[kind]}…`}
          aria-label={`Tìm ${KIND_LABEL[kind]}`}
          autoFocus
          className="flex-1 min-w-[10rem] rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0878EE]/40"
        />
        <label className="flex items-center gap-1.5 text-xs text-slate-600 select-none">
          <input type="checkbox" checked={onlyLevel} onChange={(e) => setOnlyLevel(e.target.checked)} className="rounded" />
          Chỉ cấp {level}
        </label>
        {onClose && (
          <button type="button" onClick={onClose} className="h-9 px-3 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-200">
            Đóng
          </button>
        )}
      </div>
      <ul className="mt-2 max-h-60 overflow-y-auto divide-y divide-slate-200 rounded-lg bg-white border border-slate-200" aria-busy={state.loading}>
        {state.error && <li className="px-3 py-3 text-sm text-red-700">{state.error}</li>}
        {!state.error && !state.loading && items.length === 0 && (
          <li className="px-3 py-3 text-sm text-slate-500">
            Không tìm thấy {KIND_LABEL[kind]}
            {onlyLevel ? ` cấp ${level}` : ''}.
          </li>
        )}
        {state.loading && items.length === 0 && <li className="px-3 py-3 text-sm text-slate-400">Đang tìm…</li>}
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onSelect(item)}
              className="w-full text-left px-3 py-2 hover:bg-blue-50 focus:outline-none focus-visible:bg-blue-50"
            >
              <span className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-800" lang="ja">
                  {item.title}
                </span>
                {item.jlptLevel && <span className="text-[10px] font-bold text-[#0878EE]">{item.jlptLevel}</span>}
              </span>
              {item.subtitle && <span className="block text-xs text-slate-500">{item.subtitle}</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

/** Thẻ hiển thị một nội dung đã gắn */
export const LookupChip: React.FC<{ item: ExploreLookupItem; onRemove: () => void }> = ({ item, onRemove }) => (
  <span
    className={`inline-flex items-center gap-1.5 max-w-full rounded-full border pl-3 pr-1 py-1 text-xs ${
      item.available ? 'bg-white border-slate-300 text-slate-800' : 'bg-red-50 border-red-200 text-red-800'
    }`}
    title={item.subtitle ?? undefined}
  >
    <span className="font-semibold truncate" lang="ja">
      {item.title}
    </span>
    {item.subtitle && <span className="text-slate-500 truncate hidden sm:inline">· {item.subtitle}</span>}
    {!item.available && <span className="font-semibold">· đã ngừng dùng</span>}
    <button
      type="button"
      onClick={onRemove}
      aria-label={`Bỏ ${item.title}`}
      className="w-6 h-6 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100 shrink-0"
    >
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeWidth="3" d="M6 6l12 12M18 6L6 18" />
      </svg>
    </button>
  </span>
);
