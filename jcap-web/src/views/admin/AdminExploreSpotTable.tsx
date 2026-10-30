import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PREFECTURES } from '../../data/japanMap';
import type { AdminExploreSpotRow, ExploreLookupItem } from '../../types/adminExplore';
import { PictogramIcon } from '../explore/exploreUi';
import { WarnIcon } from './AdminExploreChapterSection';
import { LoadError } from './AdminExploreToasts';
import { STATUS_BADGE, STATUS_LABEL } from './adminExploreSpots';

/**
 * Bảng "Nội dung các mốc": mọi mốc của cả nước và nội dung đã gắn ở từng mốc,
 * để biết mốc nào đã đủ nội dung, mốc nào còn thiếu mà không phải mở từng tỉnh.
 */

const PREF_NAME = new Map(PREFECTURES.map((p) => [p.id, p.nameVi]));

type Filter = 'all' | 'noShadowing' | 'noRoleplay' | 'unavailable' | 'draft';
const FILTERS: { id: Filter; label: string; test: (r: AdminExploreSpotRow) => boolean }[] = [
  { id: 'all', label: 'Tất cả', test: () => true },
  { id: 'noShadowing', label: 'Thiếu Shadowing', test: (r) => r.missing.includes('shadowing') },
  { id: 'noRoleplay', label: 'Chưa có Hội thoại AI', test: (r) => !r.roleplay },
  { id: 'unavailable', label: 'Nội dung bị ngừng dùng', test: (r) => r.hasUnavailableContent },
  { id: 'draft', label: 'Nháp', test: (r) => r.status === 'Draft' },
];

const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

interface Props {
  rows: AdminExploreSpotRow[] | null;
  error: string | null;
  onRetry: () => void;
}

export const AdminExploreSpotTable: React.FC<Props> = ({ rows, error, onRetry }) => {
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const navigate = useNavigate();

  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map((f) => [f.id, (rows ?? []).filter(f.test).length])) as Record<Filter, number>,
    [rows],
  );

  const q = normalize(query.trim());
  const shown = (rows ?? []).filter((r) => {
    if (!FILTERS.find((f) => f.id === filter)!.test(r)) return false;
    if (!q) return true;
    return (
      normalize(r.nameVi).includes(q) ||
      r.nameJp.includes(query.trim()) ||
      normalize(PREF_NAME.get(r.prefectureId) ?? '').includes(q) ||
      normalize(r.shadowing?.title ?? '').includes(q) ||
      normalize(r.roleplay?.title ?? '').includes(q)
    );
  });

  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm" aria-labelledby="explore-spot-table-title">
      <div className="p-5 border-b border-slate-100 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h2 id="explore-spot-table-title" className="text-base font-bold text-slate-900">
              Nội dung các mốc
            </h2>
            <p className="text-xs text-slate-500 mt-1 max-w-2xl">
              Mọi mốc trên bản đồ và nội dung đã gắn ở từng mốc. Bấm một dòng để mở trình soạn mốc đó.
            </p>
          </div>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm mốc, tỉnh, bài…"
            aria-label="Tìm mốc theo tên, tỉnh hoặc nội dung đã gắn"
            className="w-full sm:w-56 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0878EE]/40 focus:border-[#0878EE]"
          />
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Lọc mốc">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={`h-8 px-3 rounded-full text-xs font-semibold border focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0878EE] ${
                filter === f.id ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {f.label} <span className="opacity-70">{counts[f.id]}</span>
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="p-5">
          <LoadError message={`Không tải được danh sách mốc: ${error}`} onRetry={onRetry} />
        </div>
      )}
      {!rows && !error && <div className="m-5 h-40 rounded-xl bg-slate-100 animate-pulse" aria-busy="true" aria-label="Đang tải" />}
      {rows && shown.length === 0 && <p className="px-5 py-8 text-center text-sm text-slate-500">Không có mốc phù hợp.</p>}

      {rows && shown.length > 0 && (
        <>
          {/* Bảng (màn hình rộng) */}
          <div className="hidden md:block max-h-[560px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-4 py-2.5">Mốc</th>
                  <th scope="col" className="px-3 py-2.5">Tỉnh</th>
                  <th scope="col" className="px-3 py-2.5">Trạng thái</th>
                  <th scope="col" className="px-3 py-2.5">Shadowing</th>
                  <th scope="col" className="px-3 py-2.5">Hội thoại AI</th>
                  <th scope="col" className="px-3 py-2.5">Mục tiêu</th>
                  <th scope="col" className="px-3 py-2.5">Kiểm tra · Flashcard</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shown.map((r) => (
                  <tr key={r.id} onClick={() => navigate(`/admin/explore/spots/${r.id}`)} className="cursor-pointer hover:bg-slate-50 align-top">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <span className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                          <PictogramIcon id={r.iconId} color="#334155" className="w-5 h-5" />
                        </span>
                        <span className="min-w-0">
                          <Link
                            to={`/admin/explore/spots/${r.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="block font-semibold text-slate-800 hover:text-[#0878EE] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0878EE] rounded"
                          >
                            {r.nameVi}
                          </Link>
                          <span className="block text-xs text-slate-500" lang="ja">
                            {r.nameJp} · {r.jlptLevel}
                          </span>
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-slate-700 whitespace-nowrap">{PREF_NAME.get(r.prefectureId)}</td>
                    <td className="px-3 py-3">
                      <StatusBadge row={r} />
                    </td>
                    <td className="px-3 py-3">
                      <ContentCell item={r.shadowing} empty={<MissingTag text="Chưa gắn" />} />
                    </td>
                    <td className="px-3 py-3">
                      <ContentCell item={r.roleplay} empty={<span className="text-slate-400">—</span>} />
                    </td>
                    <td className="px-3 py-3 text-xs whitespace-nowrap">
                      {r.grammarCount + r.vocabularyCount === 0 ? (
                        <MissingTag text="Chưa có" />
                      ) : (
                        <span className="text-slate-600">
                          {r.grammarCount} ngữ pháp · {r.vocabularyCount} từ
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <SoonTag />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Thẻ (điện thoại) */}
          <ul className="md:hidden divide-y divide-slate-100 max-h-[640px] overflow-y-auto">
            {shown.map((r) => (
              <li key={r.id}>
                <Link to={`/admin/explore/spots/${r.id}`} className="block px-4 py-3 hover:bg-slate-50 focus:outline-none focus-visible:bg-blue-50">
                  <span className="flex items-center gap-2.5">
                    <span className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                      <PictogramIcon id={r.iconId} color="#334155" className="w-5 h-5" />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold text-slate-800 truncate">{r.nameVi}</span>
                      <span className="block text-xs text-slate-500 truncate">
                        {PREF_NAME.get(r.prefectureId)} · {r.jlptLevel}
                      </span>
                    </span>
                    <StatusBadge row={r} />
                  </span>
                  <span className="mt-2 grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-xs">
                    <span className="text-slate-500">Shadowing</span>
                    <ContentCell item={r.shadowing} empty={<MissingTag text="Chưa gắn" />} />
                    <span className="text-slate-500">Hội thoại AI</span>
                    <ContentCell item={r.roleplay} empty={<span className="text-slate-400">—</span>} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
};

const StatusBadge: React.FC<{ row: AdminExploreSpotRow }> = ({ row }) => (
  <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap ${STATUS_BADGE[row.status]}`}>
    {STATUS_LABEL[row.status]}
  </span>
);

const ContentCell: React.FC<{ item?: ExploreLookupItem | null; empty: React.ReactNode }> = ({ item, empty }) => {
  if (!item) return <>{empty}</>;
  return (
    <span className="block min-w-0">
      <span className={`block text-xs font-semibold ${item.available ? 'text-slate-800' : 'text-red-700 line-through'}`}>{item.title}</span>
      {!item.available && <span className="block text-[11px] font-semibold text-red-700">Đã ngừng dùng</span>}
    </span>
  );
};

const MissingTag: React.FC<{ text: string }> = ({ text }) => (
  <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 whitespace-nowrap">
    <WarnIcon className="w-3.5 h-3.5" />
    {text}
  </span>
);

const SoonTag: React.FC = () => (
  <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 whitespace-nowrap">Sắp có</span>
);
