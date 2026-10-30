import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PREFECTURES } from '../../data/japanMap';
import { JCAP_ICONS, PREFECTURE_PICTOGRAMS, SCENE_PICTOGRAM_GROUPS, pictogramInfo, type Pictogram } from '../../data/japanPictograms';
import { PictogramIcon } from '../explore/exploreUi';
import { searchIcons, suggestIconsForName } from './iconSearch';

// ---------------------------------------------------------------------------
// Biểu tượng chọn gần đây: chỉ lưu trên máy admin, mất cũng không sao

const RECENT_KEY = 'jcap.admin.explore.recentIcons';
const RECENT_MAX = 16;

function readRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function pushRecent(id: string) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([id, ...readRecent().filter((x) => x !== id)].slice(0, RECENT_MAX)));
  } catch {
    // không lưu được thì thôi
  }
}

const byIds = (ids: string[]) => ids.map((id) => pictogramInfo(id)).filter((p): p is Pictogram => !!p);

const QUICK_SHOWN = 6;

// ---------------------------------------------------------------------------
// Ô chọn biểu tượng trong form mốc

export interface IconPickerSpot {
  iconId: string;
  nameVi: string;
}

interface IconPickerProps {
  prefectureId: number;
  value: string;
  onChange: (id: string) => void;
  invalid?: boolean;
  /** Tên mốc đang soạn (Việt, Nhật, cách đọc): dùng để gợi ý biểu tượng */
  names?: string[];
  /** Các mốc khác trong tỉnh: nhóm "Đang dùng ở tỉnh này" và ghi chú số mốc đã dùng */
  prefectureSpots?: IconPickerSpot[];
}

export const IconPicker: React.FC<IconPickerProps> = ({ prefectureId, value, onChange, invalid, names = [], prefectureSpots = [] }) => {
  const [open, setOpen] = useState(false);
  const current = value ? pictogramInfo(value) : undefined;

  const nameKey = names.join('\n');
  const byName = useMemo(() => suggestIconsForName(nameKey.split('\n'), 16), [nameKey]);
  const usedBy = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const s of prefectureSpots) m.set(s.iconId, [...(m.get(s.iconId) ?? []), s.nameVi]);
    return m;
  }, [prefectureSpots]);

  const pick = (id: string) => {
    pushRecent(id);
    onChange(id);
    setOpen(false);
  };

  const quick = byName.slice(0, QUICK_SHOWN);

  return (
    <div>
      <div className={`flex items-center gap-3 rounded-lg border px-3 py-2 bg-white ${invalid ? 'border-red-400' : 'border-slate-300'}`}>
        <span className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
          {value ? <PictogramIcon id={value} color="#334155" className="w-7 h-7" /> : <span className="text-slate-400 text-xs">—</span>}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold text-slate-800 truncate">{current ? current.nameVi : value || 'Chưa chọn biểu tượng'}</span>
          {value && <span className="block text-[11px] text-slate-500 truncate">{current ? `${current.nameJp} · ${value}` : value}</span>}
        </span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          className="shrink-0 h-9 px-3 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0878EE]"
        >
          {value ? 'Đổi' : 'Chọn'}
        </button>
      </div>

      {quick.length > 0 && (
        <div className="mt-2">
          <div className="text-[11px] text-slate-500 mb-1">Gợi ý theo tên mốc</div>
          <div className="flex flex-wrap gap-1.5">
            {quick.map((p) => (
              <button
                key={p.id}
                type="button"
                aria-pressed={p.id === value}
                title={`${p.nameVi} · ${p.nameJp}`}
                onClick={() => pick(p.id)}
                className={`inline-flex items-center gap-1.5 max-w-full rounded-full border pl-1.5 pr-2.5 py-1 text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0878EE] ${
                  p.id === value ? 'border-[#0878EE] bg-blue-50 text-[#0878EE] font-semibold' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <PictogramIcon id={p.id} color={p.id === value ? '#0878EE' : '#334155'} className="w-5 h-5 shrink-0" />
                <span className="truncate">{p.nameVi}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {open && (
        <IconPickerDialog
          prefectureId={prefectureId}
          value={value}
          byName={byName}
          usedBy={usedBy}
          onPick={pick}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Hộp thoại chọn biểu tượng: nhóm ở cột trái, lưới biểu tượng ở phải, ô tìm ở trên

interface Section {
  title: string;
  items: Pictogram[];
}

interface Tab {
  key: string;
  label: string;
  count: number;
  sections: Section[];
}

interface DialogProps {
  prefectureId: number;
  value: string;
  byName: Pictogram[];
  usedBy: Map<string, string[]>;
  onPick: (id: string) => void;
  onClose: () => void;
}

const ARROWS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

const IconPickerDialog: React.FC<DialogProps> = ({ prefectureId, value, byName, usedBy, onPick, onClose }) => {
  const [query, setQuery] = useState('');
  const [tabKey, setTabKey] = useState('suggest');
  const searchRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Khoá cuộn trang, Esc để đóng, đóng xong trả focus về nút đã mở
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    searchRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      opener?.focus();
    };
  }, []);

  const tabs = useMemo<Tab[]>(() => {
    const suggest: Section[] = [
      { title: 'Theo tên mốc', items: byName },
      { title: 'Đang dùng ở tỉnh này', items: byIds([...usedBy.keys()]) },
      { title: 'Chọn gần đây', items: byIds(readRecent()) },
      { title: 'Địa danh, đặc sản của tỉnh', items: byIds(PREFECTURE_PICTOGRAMS[prefectureId] ?? []) },
    ];
    const list: Omit<Tab, 'count'>[] = [
      { key: 'suggest', label: 'Gợi ý', sections: suggest.filter((s) => s.items.length > 0) },
      ...SCENE_PICTOGRAM_GROUPS.map((g, i) => ({ key: `scene-${i}`, label: g.title, sections: [{ title: g.title, items: g.items }] })),
      { key: 'jcap', label: 'Riêng của JCAP', sections: [{ title: 'Biểu tượng riêng của JCAP', items: JCAP_ICONS }] },
      {
        key: 'prefectures',
        label: 'Địa danh theo tỉnh',
        sections: PREFECTURES.map((p) => ({ title: p.nameVi, items: byIds(PREFECTURE_PICTOGRAMS[p.id] ?? []) })).filter((s) => s.items.length > 0),
      },
    ];
    return list.map((t) => ({ ...t, count: new Set(t.sections.flatMap((s) => s.items.map((p) => p.id))).size }));
  }, [byName, usedBy, prefectureId]);

  const results = useMemo(() => (query.trim() ? searchIcons(query) : null), [query]);
  const tab = tabs.find((t) => t.key === tabKey) ?? tabs[0];
  const sections: Section[] = results ? [{ title: `Kết quả (${results.length})`, items: results }] : tab.sections;
  const first = sections.find((s) => s.items.length > 0)?.items[0];

  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (first) onPick(first.id);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      gridRef.current?.querySelector<HTMLElement>('[data-icon]')?.focus();
    }
  };

  // Phím mũi tên trong lưới: trái/phải theo thứ tự, lên/xuống sang ô gần nhất ở hàng trên/dưới (kể cả qua nhóm khác)
  const onGridKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const dir = ARROWS[e.key];
    const cur = e.target as HTMLElement;
    if (!dir || !cur.dataset.icon || !gridRef.current) return;
    e.preventDefault();
    const buttons = [...gridRef.current.querySelectorAll<HTMLElement>('[data-icon]')];
    if (dir[0]) {
      buttons[buttons.indexOf(cur) + dir[0]]?.focus();
      return;
    }
    const r = cur.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    let best: HTMLElement | null = null;
    let bestScore = Infinity;
    for (const b of buttons) {
      const br = b.getBoundingClientRect();
      const dy = dir[1] > 0 ? br.top - r.bottom : r.top - br.bottom;
      if (dy < 0) continue;
      const score = dy * 1000 + Math.abs(br.left + br.width / 2 - cx);
      if (score < bestScore) {
        bestScore = score;
        best = b;
      }
    }
    if (best) best.focus();
    else if (dir[1] < 0) searchRef.current?.focus();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="icon-picker-title">
      <div className="absolute inset-0 bg-slate-900/50" onClick={onClose} aria-hidden="true" />
      <div className="relative w-full max-w-5xl h-[88vh] sm:h-[80vh] bg-white rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200">
          <h2 id="icon-picker-title" className="text-base font-bold text-slate-900 shrink-0 hidden sm:block">
            Chọn biểu tượng
          </h2>
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onSearchKey}
            placeholder="Tìm: nhập cảnh, combini, 駅, onsen…"
            aria-label="Tìm biểu tượng"
            className="flex-1 min-w-0 rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0878EE]/40"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0878EE]"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeWidth="2.5" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="flex-1 min-h-0 flex flex-col sm:flex-row">
          <nav
            aria-label="Nhóm biểu tượng"
            className="shrink-0 flex sm:flex-col gap-1 overflow-x-auto sm:overflow-y-auto sm:w-56 px-3 py-2 sm:py-3 border-b sm:border-b-0 sm:border-r border-slate-200 bg-slate-50"
          >
            {tabs.map((t) => {
              const active = !results && t.key === tab.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setTabKey(t.key);
                    setQuery('');
                    gridRef.current?.scrollTo({ top: 0 });
                  }}
                  className={`shrink-0 flex items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-sm text-left whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0878EE] ${
                    active ? 'bg-[#0878EE] text-white font-semibold' : 'text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <span>{t.label}</span>
                  <span className={`text-[11px] ${active ? 'text-white/80' : 'text-slate-400'}`}>{t.count}</span>
                </button>
              );
            })}
          </nav>

          <div ref={gridRef} onKeyDown={onGridKey} className="flex-1 min-h-0 overflow-y-auto p-4 space-y-5">
            {sections.map((s) => (
              <section key={s.title}>
                <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-2">{s.title}</h3>
                <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-7 gap-1.5">
                  {s.items.map((p) => (
                    <IconButton key={p.id} p={p} selected={p.id === value} usedBy={usedBy.get(p.id)} onPick={onPick} />
                  ))}
                </div>
              </section>
            ))}
            {!first && (
              <p className="text-sm text-slate-500 text-center py-10">
                {results
                  ? 'Không có biểu tượng phù hợp. Thử từ khác, tiếng Nhật hoặc không dấu.'
                  : 'Chưa có gợi ý. Nhập tên mốc ở form để có gợi ý theo tên, hoặc chọn một nhóm bên cạnh.'}
              </p>
            )}
          </div>
        </div>

        <div className="hidden sm:block px-4 py-2 border-t border-slate-200 text-[11px] text-slate-500">
          Enter: chọn kết quả đầu tiên · ↓ từ ô tìm để vào lưới · ←↑→↓: di chuyển · Esc: đóng
        </div>
      </div>
    </div>
  );
};

const IconButton: React.FC<{ p: Pictogram; selected: boolean; usedBy?: string[]; onPick: (id: string) => void }> = ({ p, selected, usedBy, onPick }) => (
  <button
    type="button"
    data-icon={p.id}
    aria-pressed={selected}
    title={`${p.nameVi} · ${p.nameJp}${usedBy ? `\nĐang dùng ở: ${usedBy.join(', ')}` : ''}`}
    onClick={() => onPick(p.id)}
    className={`flex flex-col items-center gap-1 rounded-lg border p-2 text-center focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0878EE] ${
      selected ? 'border-[#0878EE] bg-blue-50' : 'border-transparent bg-white hover:border-slate-300 hover:bg-slate-50'
    }`}
  >
    <PictogramIcon id={p.id} color={selected ? '#0878EE' : '#334155'} className="w-9 h-9" />
    <span className="text-[11px] leading-tight text-slate-700 line-clamp-2">{p.nameVi}</span>
    {usedBy && <span className="text-[10px] font-semibold text-amber-700">{usedBy.length} mốc trong tỉnh</span>}
  </button>
);
