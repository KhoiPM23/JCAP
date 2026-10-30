import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PREFECTURES } from '../../data/japanMap';
import { adminExploreService } from '../../services/adminExploreService';
import type { AdminExploreSpotStats, AdminExploreStats as Stats } from '../../types/adminExplore';
import { LoadError } from './AdminExploreToasts';

/**
 * Thống kê Khám phá: người học đi đến đâu và rơi rụng ở bước nào để admin sửa nội dung mốc.
 * Phễu mỗi mốc: Đã hiểu → Con dấu (Shadowing đạt) → Dấu son (Hội thoại AI, chỉ mốc có kịch bản).
 */

const PREF_NAME = new Map(PREFECTURES.map((p) => [p.id, p.nameVi]));
const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const percent = (part: number, whole: number) => (whole > 0 ? Math.round((part * 100) / whole) : null);

type SortKey = 'prefecture' | 'stuckCount' | 'stuckRate' | 'understood';
const SORTS: { id: SortKey; label: string }[] = [
  { id: 'prefecture', label: 'Theo tỉnh' },
  { id: 'stuckCount', label: 'Kẹt Shadowing nhiều nhất' },
  { id: 'stuckRate', label: 'Tỉ lệ kẹt cao nhất' },
  { id: 'understood', label: 'Nhiều người học nhất' },
];

const stuckRate = (s: AdminExploreSpotStats) => (s.understood > 0 ? s.stuckAtShadowing / s.understood : -1);

const SORT_FN: Record<SortKey, (a: AdminExploreSpotStats, b: AdminExploreSpotStats) => number> = {
  prefecture: (a, b) => a.prefectureId - b.prefectureId || a.spotId - b.spotId,
  stuckCount: (a, b) => b.stuckAtShadowing - a.stuckAtShadowing || SORT_FN.prefecture(a, b),
  stuckRate: (a, b) => stuckRate(b) - stuckRate(a) || b.understood - a.understood || SORT_FN.prefecture(a, b),
  understood: (a, b) => b.understood - a.understood || SORT_FN.prefecture(a, b),
};

export const AdminExploreStats: React.FC = () => {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const res = await adminExploreService.getStats();
    if (res.success && res.data) setStats(res.data);
    else setError(res.message);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <LoadError message={`Không tải được thống kê: ${error}`} onRetry={load} />;
  if (!stats) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Đang tải">
        <div className="h-24 rounded-2xl bg-slate-200/70 animate-pulse" />
        <div className="h-64 rounded-2xl bg-slate-200/70 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Summary stats={stats} />
      <ChapterStats stats={stats} />
      <SpotFunnel stats={stats} />
    </div>
  );
};

// ---------------------------------------------------------------------------

const Summary: React.FC<{ stats: Stats }> = ({ stats }) => (
  <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5" aria-labelledby="explore-stats-summary">
    <h2 id="explore-stats-summary" className="text-base font-bold text-slate-900">
      Tổng quan
    </h2>
    <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-3">
      <Tile label="Người học đã bắt đầu" value={stats.learners} />
      <Tile label="Con dấu mốc đã cấp" value={stats.stamps} />
      <Tile label="Dấu son mốc đã cấp" value={stats.redStamps} />
      <Tile label="Con dấu tỉnh" value={stats.prefectureStamps} />
      <Tile label="Dấu son tỉnh" value={stats.prefectureRedStamps} />
    </div>
    <p className="text-xs text-slate-500 mt-3 leading-relaxed">
      "Đã bắt đầu" là người học có tiến độ ở ít nhất một mốc. Con dấu và dấu son đã cấp thì không thu hồi nên tổng ở đây
      gồm cả mốc nay đã ngừng dùng.
    </p>
  </section>
);

const Tile: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
    <div className="text-lg font-bold text-slate-900 tabular-nums">{value}</div>
    <div className="text-[11px] text-slate-500 leading-tight">{label}</div>
  </div>
);

// ---------------------------------------------------------------------------

const ChapterStats: React.FC<{ stats: Stats }> = ({ stats }) => (
  <section className="bg-white rounded-2xl border border-slate-200 shadow-sm" aria-labelledby="explore-stats-chapters">
    <div className="p-5 border-b border-slate-100">
      <h2 id="explore-stats-chapters" className="text-base font-bold text-slate-900">
        Theo chương
      </h2>
      <p className="text-xs text-slate-500 mt-1 max-w-2xl">
        Số người đã mở chương và tỉ lệ mốc có con dấu trung bình trên những người đó. Chỉ tính mốc đang dùng của tỉnh đã
        mở.
      </p>
    </div>
    {stats.chapters.length === 0 ? (
      <p className="px-5 py-8 text-center text-sm text-slate-500">Chưa có chương nào.</p>
    ) : (
      <ul className="divide-y divide-slate-100">
        {stats.chapters.map((c) => (
          <li key={c.chapterId} className="px-5 py-3 flex flex-wrap items-center gap-x-6 gap-y-2">
            <div className="min-w-0 flex-1 basis-48">
              <div className="text-sm font-semibold text-slate-800 truncate">{c.title}</div>
              <div className="text-xs text-slate-500">{c.spotCount} mốc</div>
            </div>
            <div className="text-sm text-slate-700 tabular-nums">
              <span className="font-bold">{c.unlockedLearners}</span> người đã mở
            </div>
            <div className="w-full sm:w-56">
              {c.avgStampPercent == null ? (
                <span className="text-xs text-slate-500">Chưa có số liệu</span>
              ) : (
                <Bar value={c.avgStampPercent} label={`${c.avgStampPercent}% mốc có con dấu`} />
              )}
            </div>
          </li>
        ))}
      </ul>
    )}
  </section>
);

const Bar: React.FC<{ value: number; label: string }> = ({ value, label }) => (
  <div>
    <div className="text-xs text-slate-600 mb-1">{label}</div>
    <div className="h-2 rounded-full bg-slate-100 overflow-hidden" role="presentation">
      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  </div>
);

// ---------------------------------------------------------------------------

const SpotFunnel: React.FC<{ stats: Stats }> = ({ stats }) => {
  const [sort, setSort] = useState<SortKey>('prefecture');
  const [query, setQuery] = useState('');

  const q = normalize(query.trim());
  const shown = useMemo(() => {
    const list = stats.spots.filter(
      (s) => !q || normalize(s.nameVi).includes(q) || normalize(PREF_NAME.get(s.prefectureId) ?? '').includes(q),
    );
    return [...list].sort(SORT_FN[sort]);
  }, [stats.spots, sort, q]);

  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm" aria-labelledby="explore-stats-spots">
      <div className="p-5 border-b border-slate-100 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h2 id="explore-stats-spots" className="text-base font-bold text-slate-900">
              Phễu từng mốc
            </h2>
            <p className="text-xs text-slate-500 mt-1 max-w-2xl">
              Đã hiểu → có con dấu (Shadowing đạt) → có dấu son (Hội thoại AI). "Kẹt ở Shadowing" là người đã hiểu câu mẫu
              nhưng chưa có con dấu; mốc kẹt nhiều thường có bài Shadowing quá khó hoặc quá dài. Bấm tên mốc để sửa.
            </p>
          </div>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm mốc, tỉnh…"
            aria-label="Tìm mốc theo tên hoặc tỉnh"
            className="w-full sm:w-48 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0878EE]/40 focus:border-[#0878EE]"
          />
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Sắp xếp mốc">
          {SORTS.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={sort === s.id}
              onClick={() => setSort(s.id)}
              className={`h-8 px-3 rounded-full text-xs font-semibold border focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0878EE] ${
                sort === s.id ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-slate-500">Không có mốc phù hợp.</p>
      ) : (
        <div className="max-h-[560px] overflow-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="sticky top-0 z-10 bg-slate-50 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="px-4 py-2.5">Mốc</th>
                <th scope="col" className="px-3 py-2.5 text-right">Đã hiểu</th>
                <th scope="col" className="px-3 py-2.5 text-right">Con dấu</th>
                <th scope="col" className="px-3 py-2.5 text-right">Dấu son</th>
                <th scope="col" className="px-3 py-2.5 text-right">Kẹt ở Shadowing</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {shown.map((s) => (
                <tr key={s.spotId} className="align-top hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link
                      to={`/admin/explore/spots/${s.spotId}`}
                      className="block font-semibold text-slate-800 hover:text-[#0878EE] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0878EE] rounded"
                    >
                      {s.nameVi}
                    </Link>
                    <span className="block text-xs text-slate-500">
                      {PREF_NAME.get(s.prefectureId)}
                      {!s.prefectureIsOpen && ' · tỉnh chưa mở'}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-slate-800">{s.understood}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-slate-800">
                    {s.stamped}
                    <Rate part={s.stamped} whole={s.understood} />
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-slate-800">
                    {s.redStamped == null ? (
                      <span className="text-slate-400" title="Mốc này không có Hội thoại AI">—</span>
                    ) : (
                      <>
                        {s.redStamped}
                        <Rate part={s.redStamped} whole={s.stamped} />
                      </>
                    )}
                  </td>
                  <td className={`px-3 py-3 text-right tabular-nums ${s.stuckAtShadowing > 0 ? 'font-semibold text-orange-700' : 'text-slate-800'}`}>
                    {s.stuckAtShadowing}
                    <Rate part={s.stuckAtShadowing} whole={s.understood} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};

/** Tỉ lệ so với bước trước; không có mẫu số thì không hiện */
const Rate: React.FC<{ part: number; whole: number }> = ({ part, whole }) => {
  const p = percent(part, whole);
  return p == null ? null : <span className="block text-[11px] font-normal text-slate-500">{p}%</span>;
};
