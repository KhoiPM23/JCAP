import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { Toast, type ToastType } from '../../components/ui/Toast';
import { PREFECTURES, REGIONS } from '../../data/japanMap';
import { adminExploreService } from '../../services/adminExploreService';
import type {
  AdminExploreChapter,
  AdminExploreOverview,
  AdminExplorePrefecture,
  SaveExploreChapter,
} from '../../types/adminExplore';
import { AdminExploreChapterSection, WarnIcon } from './AdminExploreChapterSection';
import { AdminExploreMap, STATE_LABEL, prefectureState, type PrefectureState } from './AdminExploreMap';

/**
 * Quản lý bản đồ Khám phá (giai đoạn 2): mở tỉnh cho người học và quản lý chương.
 * Soạn mốc học trong tỉnh là giai đoạn 3. Tỉnh đã mở không đóng lại ở đây: tạm ngưng sẽ đi qua chế độ bảo trì.
 */

const SHAPE_BY_ID = new Map(PREFECTURES.map((p) => [p.id, p]));
const REGION_NAME = new Map(REGIONS.map((r) => [r.id, r.nameVi]));

type Filter = 'all' | 'open' | 'closed' | 'draft';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'open', label: 'Đang mở' },
  { id: 'closed', label: 'Chưa mở' },
  { id: 'draft', label: 'Có nháp' },
];

const BADGE: Record<PrefectureState, string> = {
  open: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  ready: 'bg-emerald-50/60 text-emerald-700 border-emerald-200 border-dashed',
  closed: 'bg-slate-100 text-slate-600 border-slate-200',
};

interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

export const AdminExploreView: React.FC = () => {
  const [overview, setOverview] = useState<AdminExploreOverview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [searchParams, setSearchParams] = useSearchParams();
  const mapRef = useRef<HTMLDivElement>(null);

  const selectedId = (() => {
    const n = Number(searchParams.get('pref'));
    return Number.isInteger(n) && n >= 1 && n <= 47 ? n : null;
  })();

  const select = useCallback(
    (id: number | null) => {
      setSearchParams(id ? { pref: String(id) } : {}, { replace: true });
    },
    [setSearchParams],
  );

  const toast = useCallback((message: string, type: ToastType = 'success') => {
    setToasts((t) => [...t, { id: `${Date.now()}-${Math.random()}`, message, type }]);
  }, []);
  const removeToast = useCallback((id: string) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const load = useCallback(async () => {
    setLoadError(null);
    const res = await adminExploreService.getOverview();
    if (res.success && res.data) setOverview(res.data);
    else setLoadError(res.message);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const prefectures = useMemo(
    () => new Map((overview?.prefectures ?? []).map((p) => [p.id, p])),
    [overview],
  );
  const chapters = overview?.chapters ?? [];

  /** Chạy một thao tác ghi; chặn bấm trùng và báo lỗi bằng toast */
  const run = async <T,>(action: () => Promise<{ success: boolean; message: string; data?: T; errors?: string[] }>) => {
    setBusy(true);
    try {
      const res = await action();
      if (!res.success) toast(res.message || 'Thao tác không thành công.', 'error');
      return res;
    } finally {
      setBusy(false);
    }
  };

  const handleOpen = async (id: number) => {
    const res = await run(() => adminExploreService.openPrefecture(id));
    if (res.success && res.data) {
      const updated = res.data;
      setOverview((o) => o && { ...o, prefectures: o.prefectures.map((p) => (p.id === id ? updated : p)) });
      toast(`Đã mở ${SHAPE_BY_ID.get(id)?.nameVi} cho người học.`);
    }
    return res.success;
  };

  const handleAssign = async (prefectureId: number, chapterId: number | null) => {
    const res = await run(() => adminExploreService.assignChapter(prefectureId, chapterId));
    if (res.success && res.data) {
      setOverview(res.data);
      const name = SHAPE_BY_ID.get(prefectureId)?.nameVi;
      const chapter = res.data.chapters.find((c) => c.id === chapterId);
      toast(chapter ? `Đã đưa ${name} vào "${chapter.title}".` : `Đã bỏ ${name} khỏi chương.`);
    }
  };

  const handleSaveChapter = async (id: number | null, dto: SaveExploreChapter) => {
    const res = await run(() =>
      id === null ? adminExploreService.createChapter(dto) : adminExploreService.updateChapter(id, dto),
    );
    if (!res.success) return res.errors ?? [];
    await load();
    toast(id === null ? 'Đã tạo chương.' : 'Đã lưu chương.');
    return null;
  };

  const handleMove = async (id: number, delta: -1 | 1) => {
    const ids = chapters.map((c) => c.id);
    const from = ids.indexOf(id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to], ids[from]];
    const res = await run(() => adminExploreService.reorderChapters(ids));
    if (res.success && res.data) {
      const ordered = res.data;
      setOverview((o) => o && { ...o, chapters: ordered });
    }
  };

  const handleDeactivate = async (id: number) => {
    const title = chapters.find((c) => c.id === id)?.title;
    const res = await run(() => adminExploreService.deactivateChapter(id));
    if (!res.success) return false;
    await load();
    toast(`Đã ngừng dùng "${title}".`);
    return true;
  };

  const selectFromChapter = (id: number) => {
    select(id);
    mapRef.current?.scrollIntoView({ block: 'start' });
  };

  const totals = useMemo(() => {
    const list = overview?.prefectures ?? [];
    return {
      open: list.filter((p) => p.isOpen).length,
      published: list.reduce((s, p) => s + p.publishedSpotCount, 0),
      draft: list.reduce((s, p) => s + p.draftSpotCount, 0),
    };
  }, [overview]);

  return (
    <div className="w-full max-w-7xl mx-auto p-4 sm:p-6 space-y-6 bg-slate-50 min-h-screen">
      {/* Tiêu đề trang */}
      <div>
        <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium mb-1">
          <span>Quản lý Nội dung</span>
          <span>&gt;</span>
          <span className="text-slate-800 font-semibold">Bản đồ Khám phá</span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Bản đồ Khám phá</h1>
          {overview && (
            <span className="bg-blue-100 text-[#0878EE] font-bold text-xs px-2.5 py-0.5 rounded-full border border-blue-200">
              {totals.open}/47 tỉnh đang mở
            </span>
          )}
        </div>
        <p className="text-xs text-slate-500 mt-1 max-w-3xl">
          Mở tỉnh cho người học và sắp xếp các chương của hành trình. Tỉnh chưa mở hiện mờ với người học kèm thông báo
          "Sẽ cập nhật trong tương lai".
        </p>
      </div>

      {loadError && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3" role="alert">
          <p className="text-sm text-red-800">Không tải được dữ liệu bản đồ: {loadError}</p>
          <button
            type="button"
            onClick={load}
            className="h-9 px-3 rounded-lg bg-white border border-red-200 text-red-700 text-xs font-semibold hover:bg-red-100"
          >
            Thử lại
          </button>
        </div>
      )}

      {!overview && !loadError && <LoadingSkeleton />}

      {overview && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Bản đồ */}
            <div ref={mapRef} className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 shadow-sm p-4 scroll-mt-4">
              <Legend />
              <div className="mt-3 aspect-[1500/1560] max-h-[78vh] mx-auto">
                <AdminExploreMap prefectures={prefectures} selectedId={selectedId} onSelect={select} />
              </div>
            </div>

            {/* Bảng bên phải: tỉnh đang chọn + danh sách */}
            <div className="lg:col-span-5 space-y-4">
              {selectedId ? (
                <PrefecturePanel
                  key={selectedId}
                  id={selectedId}
                  data={prefectures.get(selectedId)}
                  chapters={chapters}
                  busy={busy}
                  onClose={() => select(null)}
                  onOpen={handleOpen}
                  onAssign={handleAssign}
                />
              ) : (
                <SummaryPanel open={totals.open} published={totals.published} draft={totals.draft} />
              )}
              <PrefectureList prefectures={prefectures} chapters={chapters} selectedId={selectedId} onSelect={select} />
            </div>
          </div>

          <AdminExploreChapterSection
            chapters={chapters}
            prefectures={prefectures}
            busy={busy}
            onSelectPrefecture={selectFromChapter}
            onSave={handleSaveChapter}
            onMove={handleMove}
            onDeactivate={handleDeactivate}
          />
        </>
      )}

      {createPortal(
        <div className="fixed top-5 right-5 z-[9999] flex flex-col gap-2.5 pointer-events-none w-auto max-w-[calc(100vw-2rem)]">
          {toasts.map((t) => (
            <Toast key={t.id} id={t.id} message={t.message} type={t.type} onClose={removeToast} />
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------

const Legend: React.FC = () => (
  <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate-600" aria-label="Chú thích màu">
    <li className="flex items-center gap-1.5">
      <span className="w-3.5 h-3.5 rounded bg-emerald-500" aria-hidden="true" />
      {STATE_LABEL.open}
    </li>
    <li className="flex items-center gap-1.5">
      <span className="w-3.5 h-3.5 rounded bg-emerald-200" aria-hidden="true" />
      {STATE_LABEL.ready}
    </li>
    <li className="flex items-center gap-1.5">
      <span className="w-3.5 h-3.5 rounded bg-slate-200" aria-hidden="true" />
      {STATE_LABEL.closed}
    </li>
    <li className="flex items-center gap-1.5">
      <span className="w-3.5 h-3.5 rounded bg-white border-2 border-orange-500" aria-hidden="true" />
      Có mốc nháp
    </li>
    <li className="flex items-center gap-1.5">
      <span className="w-3.5 h-3.5 rounded bg-[#0878EE]" aria-hidden="true" />
      Đang chọn
    </li>
  </ul>
);

const SummaryPanel: React.FC<{ open: number; published: number; draft: number }> = ({ open, published, draft }) => (
  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
    <h2 className="text-base font-bold text-slate-900">Tổng quan</h2>
    <div className="grid grid-cols-3 gap-2 mt-3">
      <Stat label="Tỉnh đang mở" value={`${open}/47`} />
      <Stat label="Mốc đang dùng" value={published} />
      <Stat label="Mốc nháp" value={draft} tone={draft > 0 ? 'warn' : undefined} />
    </div>
    <p className="text-xs text-slate-500 mt-4 leading-relaxed">
      Chọn một tỉnh trên bản đồ hoặc trong danh sách bên dưới để xem chi tiết, đặt chương và mở tỉnh cho người học.
    </p>
  </div>
);

const Stat: React.FC<{ label: string; value: React.ReactNode; tone?: 'warn' }> = ({ label, value, tone }) => (
  <div className={`rounded-xl border px-3 py-2.5 ${tone === 'warn' ? 'border-orange-200 bg-orange-50' : 'border-slate-200 bg-slate-50'}`}>
    <div className={`text-lg font-bold ${tone === 'warn' ? 'text-orange-700' : 'text-slate-900'}`}>{value}</div>
    <div className="text-[11px] text-slate-500 leading-tight">{label}</div>
  </div>
);

// ---------------------------------------------------------------------------

interface PanelProps {
  id: number;
  data: AdminExplorePrefecture | undefined;
  chapters: AdminExploreChapter[];
  busy: boolean;
  onClose: () => void;
  onOpen: (id: number) => Promise<boolean>;
  onAssign: (id: number, chapterId: number | null) => void;
}

const PrefecturePanel: React.FC<PanelProps> = ({ id, data, chapters, busy, onClose, onOpen, onAssign }) => {
  const [confirming, setConfirming] = useState(false);
  const shape = SHAPE_BY_ID.get(id)!;
  const state = prefectureState(data);
  const published = data?.publishedSpotCount ?? 0;
  const draft = data?.draftSpotCount ?? 0;
  const chapter = chapters.find((c) => c.id === data?.chapterId);

  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5" aria-labelledby="explore-pref-title">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="explore-pref-title" className="text-lg font-bold text-slate-900">
              {shape.nameVi}
            </h2>
            <span className="text-sm text-slate-500" lang="ja">
              {shape.nameJp}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${BADGE[state]}`}>
              {STATE_LABEL[state]}
            </span>
            <span className="text-xs text-slate-500">
              Vùng {REGION_NAME.get(shape.region)} · Mã {id}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Bỏ chọn tỉnh"
          className="shrink-0 w-9 h-9 rounded-lg text-slate-500 hover:bg-slate-100 flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0878EE]"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeWidth="2.5" d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2 mt-4">
        <Stat label="Mốc đang dùng" value={published} />
        <Stat label="Mốc nháp" value={draft} tone={draft > 0 ? 'warn' : undefined} />
        <Stat label="Một từ ở tỉnh" value={data?.hasWord ? 'Có' : 'Chưa'} />
      </div>

      {/* Chương */}
      <div className="mt-5">
        <label htmlFor="explore-pref-chapter" className="block text-xs font-semibold text-slate-700 mb-1">
          Thuộc chương
        </label>
        <select
          id="explore-pref-chapter"
          value={data?.chapterId ?? ''}
          disabled={busy}
          onChange={(e) => onAssign(id, e.target.value === '' ? null : Number(e.target.value))}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#0878EE]/40 focus:border-[#0878EE] disabled:opacity-60"
        >
          <option value="">Chưa thuộc chương nào</option>
          {chapters.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
        <p className="text-[11px] text-slate-500 mt-1">
          Mỗi tỉnh chỉ thuộc một chương; chọn chương khác sẽ chuyển tỉnh sang chương đó.
        </p>
      </div>

      {/* Trạng thái với người học */}
      <div className="mt-5">
        <div className="text-xs font-semibold text-slate-700 mb-1.5">Với người học</div>
        {data?.isOpen ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
            <p className="text-sm font-semibold text-emerald-800">
              Đang mở{data.openedAt ? ` từ ${new Date(data.openedAt).toLocaleDateString('vi-VN')}` : ''}
            </p>
            <p className="text-xs text-emerald-900/80 mt-1 leading-relaxed">
              Tỉnh đã công khai không đóng lại ngay được vì người học có thể đang học dở. Việc tạm ngưng sẽ làm qua
              chế độ bảo trì (sắp có). Nội dung mốc vẫn sửa được bình thường.
            </p>
          </div>
        ) : confirming ? (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-3" role="alertdialog" aria-label="Xác nhận mở tỉnh">
            <p className="text-sm font-semibold text-amber-900">Mở {shape.nameVi} cho người học?</p>
            <ul className="text-xs text-amber-900/90 mt-1.5 space-y-1 list-disc pl-4 leading-relaxed">
              <li>Người học vào được tỉnh và thấy {published} mốc đang dùng.</li>
              <li>Sau khi mở, tỉnh không đóng lại ngay được; tạm ngưng phải qua chế độ bảo trì.</li>
              {draft > 0 && <li>{draft} mốc nháp vẫn ẩn với người học cho đến khi chuyển sang "Đang dùng".</li>}
              {!chapter && <li className="font-semibold">Tỉnh chưa thuộc chương nào nên chưa nằm trong lộ trình chương.</li>}
            </ul>
            <div className="flex justify-end gap-2 mt-3">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="h-9 px-3 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0878EE]"
              >
                Huỷ
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  if (await onOpen(id)) setConfirming(false);
                }}
                className="h-9 px-3 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-emerald-600"
              >
                {busy ? 'Đang mở…' : 'Xác nhận mở'}
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs text-slate-600 leading-relaxed">
              Chưa mở: người học thấy tỉnh mờ kèm thông báo "Sẽ cập nhật trong tương lai".
            </p>
            <button
              type="button"
              disabled={busy || published === 0}
              onClick={() => setConfirming(true)}
              className="mt-3 w-full h-10 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:bg-slate-300 disabled:text-slate-600 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-emerald-600"
            >
              Mở cho người học
            </button>
            {published === 0 && (
              <p className="text-[11px] text-slate-500 mt-1.5 flex items-start gap-1">
                <WarnIcon className="w-3.5 h-3.5 shrink-0 mt-px text-amber-600" />
                Cần ít nhất 1 mốc đang dùng trước khi mở tỉnh.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Giai đoạn 3 */}
      <button
        type="button"
        disabled
        className="mt-5 w-full h-10 rounded-xl border border-dashed border-slate-300 text-slate-500 text-sm font-semibold flex items-center justify-center gap-2 cursor-not-allowed"
      >
        Quản lý mốc học
        <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
          Sắp có
        </span>
      </button>
    </section>
  );
};

// ---------------------------------------------------------------------------

interface ListProps {
  prefectures: Map<number, AdminExplorePrefecture>;
  chapters: AdminExploreChapter[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}

const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const PrefectureList: React.FC<ListProps> = ({ prefectures, chapters, selectedId, onSelect }) => {
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const chapterTitle = useMemo(() => new Map(chapters.map((c) => [c.id, c.title])), [chapters]);

  const counts = useMemo(() => {
    const list = [...prefectures.values()];
    return {
      all: 47,
      open: list.filter((p) => p.isOpen).length,
      closed: 47 - list.filter((p) => p.isOpen).length,
      draft: list.filter((p) => p.draftSpotCount > 0).length,
    } satisfies Record<Filter, number>;
  }, [prefectures]);

  const q = normalize(query.trim());
  const rows = PREFECTURES.filter((shape) => {
    const p = prefectures.get(shape.id);
    if (filter === 'open' && !p?.isOpen) return false;
    if (filter === 'closed' && p?.isOpen) return false;
    if (filter === 'draft' && !(p && p.draftSpotCount > 0)) return false;
    return !q || normalize(shape.nameVi).includes(q) || shape.nameJp.includes(query.trim());
  });

  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm" aria-labelledby="explore-list-title">
      <div className="p-4 border-b border-slate-100 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 id="explore-list-title" className="text-sm font-bold text-slate-900">
            Danh sách tỉnh
          </h2>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm tỉnh…"
            aria-label="Tìm tỉnh theo tên"
            className="w-40 rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0878EE]/40 focus:border-[#0878EE]"
          />
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Lọc theo trạng thái">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={`h-8 px-3 rounded-full text-xs font-semibold border focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0878EE] ${
                filter === f.id
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {f.label} <span className="opacity-70">{counts[f.id]}</span>
            </button>
          ))}
        </div>
      </div>

      <ul className="max-h-[420px] overflow-y-auto divide-y divide-slate-100">
        {rows.length === 0 && <li className="px-4 py-6 text-center text-sm text-slate-500">Không có tỉnh phù hợp.</li>}
        {rows.map((shape) => {
          const p = prefectures.get(shape.id);
          const state = prefectureState(p);
          const selected = shape.id === selectedId;
          return (
            <li key={shape.id}>
              <button
                type="button"
                onClick={() => onSelect(shape.id)}
                aria-current={selected ? 'true' : undefined}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left focus:outline-none focus-visible:bg-blue-50 ${
                  selected ? 'bg-blue-50' : 'hover:bg-slate-50'
                }`}
              >
                <span
                  className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                    state === 'open' ? 'bg-emerald-500' : state === 'ready' ? 'bg-emerald-200' : 'bg-slate-300'
                  }`}
                  aria-hidden="true"
                />
                <span className="flex-1 min-w-0">
                  <span className={`block text-sm truncate ${selected ? 'font-bold text-[#0878EE]' : 'font-semibold text-slate-800'}`}>
                    {shape.nameVi} <span className="font-normal text-slate-400" lang="ja">{shape.nameJp}</span>
                  </span>
                  <span className="block text-[11px] text-slate-500 truncate">
                    {p?.chapterId ? chapterTitle.get(p.chapterId) : 'Chưa thuộc chương'}
                  </span>
                </span>
                <span className="shrink-0 flex items-center gap-1.5">
                  {(p?.publishedSpotCount ?? 0) > 0 && (
                    <span className="text-[11px] font-semibold text-slate-600">{p!.publishedSpotCount} mốc</span>
                  )}
                  {(p?.draftSpotCount ?? 0) > 0 && (
                    <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-orange-50 text-orange-700 border border-orange-200">
                      {p!.draftSpotCount} nháp
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

const LoadingSkeleton: React.FC = () => (
  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" aria-busy="true" aria-label="Đang tải">
    <div className="lg:col-span-7 h-[480px] rounded-2xl bg-slate-200/70 animate-pulse" />
    <div className="lg:col-span-5 space-y-4">
      <div className="h-44 rounded-2xl bg-slate-200/70 animate-pulse" />
      <div className="h-64 rounded-2xl bg-slate-200/70 animate-pulse" />
    </div>
  </div>
);
