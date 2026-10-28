import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { PREFECTURES } from '../../data/japanMap';
import { adminExploreService } from '../../services/adminExploreService';
import type { ExploreLevel, ExploreLookupItem, ExploreLookupKind, ExploreSpotRef } from '../../types/adminExplore';

// ---------------------------------------------------------------------------
// Tìm nội dung để gắn (ngữ pháp, từ vựng, Shadowing, Hội thoại AI)

const KIND_LABEL: Record<ExploreLookupKind, string> = {
  grammar: 'ngữ pháp',
  vocabulary: 'từ vựng',
  shadowing: 'bài Shadowing',
  roleplay: 'kịch bản Hội thoại AI',
};

const PREF_NAME = new Map(PREFECTURES.map((p) => [p.id, p.nameVi]));
const USED_BY_SHOWN = 3;

/**
 * Nội dung đang được gắn ở những mốc nào.
 * links = true: mỗi mốc là link mở trình soạn ở tab mới (không làm mất phần đang soạn dở).
 */
export const UsedByText: React.FC<{
  usedBy: ExploreSpotRef[];
  currentSpotId?: number | null;
  links?: boolean;
  prefix?: string;
  className?: string;
}> = ({ usedBy, currentSpotId, links, prefix = 'Đang gắn ở', className }) => {
  const others = usedBy.filter((u) => u.spotId !== currentSpotId);
  const here = usedBy.length > others.length;
  const base = `text-[11px] leading-snug ${className ?? ''}`;
  if (others.length === 0) {
    return <span className={`${base} text-slate-400`}>{here ? 'Chỉ đang dùng ở mốc này' : 'Chưa gắn ở mốc nào'}</span>;
  }
  const label = (u: ExploreSpotRef) => `${u.nameVi} (${PREF_NAME.get(u.prefectureId) ?? `tỉnh ${u.prefectureId}`}${u.status === 'Draft' ? ', nháp' : ''})`;
  const shown = others.slice(0, USED_BY_SHOWN);
  const rest = others.length - shown.length;
  return (
    <span className={`${base} text-slate-600`} title={others.map(label).join('\n')}>
      {here ? 'Mốc này và ' : `${prefix}: `}
      {shown.map((u, i) => (
        <React.Fragment key={u.spotId}>
          {i > 0 && ', '}
          {links ? (
            <Link to={`/admin/explore/spots/${u.spotId}`} target="_blank" rel="noopener" className="font-semibold text-[#0878EE] hover:underline">
              {label(u)}
            </Link>
          ) : (
            <span className="font-semibold">{label(u)}</span>
          )}
        </React.Fragment>
      ))}
      {rest > 0 && ` và ${rest} mốc khác`}
    </span>
  );
};

interface LookupSearchProps {
  kind: ExploreLookupKind;
  /** Mốc đang soạn (để ghi "mốc này" thay vì liệt kê lại chính nó) */
  currentSpotId?: number | null;
  /** Cấp của bài: lọc mặc định theo cấp này */
  level: ExploreLevel;
  /** Id đã chọn (ẩn khỏi kết quả) */
  exclude?: number[];
  onSelect: (item: ExploreLookupItem) => void;
  onClose?: () => void;
}

export const LookupSearch: React.FC<LookupSearchProps> = ({ kind, currentSpotId, level, exclude = [], onSelect, onClose }) => {
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
              <UsedByText usedBy={item.usedBy ?? []} currentSpotId={currentSpotId} className="block mt-0.5" />
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
