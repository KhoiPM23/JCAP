import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { PREFECTURES } from '../../data/japanMap';
import { MIN_SPOTS_TO_OPEN, adminExploreService } from '../../services/adminExploreService';
import type { AdminExplorePrefectureContent, AdminExploreWord, ExploreSpotStatus } from '../../types/adminExplore';
import { PictogramIcon } from '../explore/exploreUi';
import { AdminExplorePrefectureMap, type MapSpot } from './AdminExplorePrefectureMap';
import { LoadError, useAdminToasts } from './AdminExploreToasts';
import { SPOT_CHECKS, STATUS_BADGE, STATUS_LABEL } from './adminExploreSpots';

/** Nội dung một tỉnh (giai đoạn 3): danh sách mốc học và "Một từ ở tỉnh". */
export const AdminExplorePrefectureView: React.FC = () => {
  const { id } = useParams();
  const prefectureId = Number(id);
  const shape = PREFECTURES.find((p) => p.id === prefectureId);
  const navigate = useNavigate();
  const { toast, toasts } = useAdminToasts();
  const [content, setContent] = useState<AdminExplorePrefectureContent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<number | null>(null);

  // Thông báo do trang soạn mốc gửi sang (vd. sau khi ngừng dùng mốc)
  const location = useLocation();
  const flash = (location.state as { flash?: string } | null)?.flash;
  useEffect(() => {
    if (!flash) return;
    toast(flash);
    navigate(location.pathname, { replace: true, state: null });
  }, [flash, toast, navigate, location.pathname]);

  const load = useCallback(async () => {
    setError(null);
    const res = await adminExploreService.getPrefectureContent(prefectureId);
    if (res.success && res.data) setContent(res.data);
    else setError(res.message);
  }, [prefectureId]);

  useEffect(() => {
    if (shape) load();
  }, [shape, load]);

  const mapSpots = useMemo<MapSpot[]>(
    () => (content?.spots ?? []).map((s, i) => ({ id: s.id, no: i + 1, lat: s.latitude, lon: s.longitude, status: s.status, label: s.nameVi })),
    [content],
  );

  if (!shape) {
    return (
      <div className="p-8 text-center bg-white m-6 rounded-2xl border border-slate-200 shadow-sm">
        <h2 className="text-xl font-bold text-slate-800">Không tìm thấy tỉnh</h2>
        <Link to="/admin/explore" className="inline-block mt-3 text-sm font-semibold text-[#0878EE] hover:underline">
          Về bản đồ Khám phá
        </Link>
      </div>
    );
  }

  const published = content?.spots.filter((s) => s.status === 'Published').length ?? 0;
  const drafts = (content?.spots.length ?? 0) - published;
  const openSpot = (spotId: number) => navigate(`/admin/explore/spots/${spotId}`);

  return (
    <div className="w-full max-w-7xl mx-auto p-4 sm:p-6 space-y-6 bg-slate-50 min-h-screen">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <nav className="flex items-center gap-1.5 text-xs text-slate-500 font-medium mb-1" aria-label="Breadcrumb">
            <span>Quản lý Nội dung</span>
            <span>&gt;</span>
            <Link to={`/admin/explore?pref=${prefectureId}`} className="hover:text-[#0878EE] hover:underline">
              Bản đồ Khám phá
            </Link>
            <span>&gt;</span>
            <span className="text-slate-800 font-semibold">{shape.nameVi}</span>
          </nav>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              {shape.nameVi}{' '}
              <span className="text-lg font-semibold text-slate-400" lang="ja">
                {shape.nameJp}
              </span>
            </h1>
            {content && (
              <span
                className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${
                  content.isOpen ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-200'
                }`}
              >
                {content.isOpen ? 'Đang mở cho người học' : 'Chưa mở'}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1 max-w-3xl">
            Mỗi mốc là một địa điểm thật trong tỉnh, gắn một tình huống và một bài học. Người học chỉ thấy mốc ở trạng thái
            "Đang dùng"{content && !content.isOpen ? ' và chỉ khi tỉnh đã mở' : ''}.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate(`/admin/explore/prefectures/${prefectureId}/spots/new`)}
          className="shrink-0 inline-flex items-center justify-center gap-1.5 h-10 px-4 rounded-xl bg-[#0878EE] text-white text-sm font-semibold hover:bg-[#0667cc] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#0878EE]"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeWidth="2.5" d="M12 5v14M5 12h14" />
          </svg>
          Thêm mốc
        </button>
      </div>

      {error && <LoadError message={`Không tải được nội dung tỉnh: ${error}`} onRetry={load} />}
      {!content && !error && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" aria-busy="true" aria-label="Đang tải">
          <div className="lg:col-span-7 h-[420px] rounded-2xl bg-slate-200/70 animate-pulse" />
          <div className="lg:col-span-5 h-[420px] rounded-2xl bg-slate-200/70 animate-pulse" />
        </div>
      )}

      {content && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-emerald-500" aria-hidden="true" />
                  Đang dùng ({published})
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-orange-500" aria-hidden="true" />
                  Nháp ({drafts})
                </span>
              </div>
              <div className="mt-3 aspect-[4/3] rounded-xl overflow-hidden border border-slate-100">
                <AdminExplorePrefectureMap prefectureId={prefectureId} spots={mapSpots} highlightId={hoverId} onSpotClick={openSpot} />
              </div>
            </div>

            <section className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 shadow-sm" aria-labelledby="explore-spots-title">
              <div className="p-4 border-b border-slate-100">
                <h2 id="explore-spots-title" className="text-sm font-bold text-slate-900">
                  Mốc học ({content.spots.length})
                </h2>
                {content.isOpen && published <= 1 && (
                  <p className="text-[11px] text-slate-500 mt-1">Tỉnh đang mở cần luôn có ít nhất 1 mốc đang dùng.</p>
                )}
              </div>
              {content.spots.length === 0 ? (
                <div className="px-4 py-10 text-center">
                  <p className="text-sm text-slate-600">Chưa có mốc nào trong tỉnh.</p>
                  <p className="text-xs text-slate-500 mt-1">Thêm mốc đầu tiên; cần ít nhất {MIN_SPOTS_TO_OPEN} mốc "Đang dùng" để mở tỉnh cho người học.</p>
                </div>
              ) : (
                <ol className="divide-y divide-slate-100">
                  {content.spots.map((s, i) => {
                    const missing = SPOT_CHECKS.filter((c) => s.missing.includes(c.key));
                    return (
                      <li key={s.id}>
                        <Link
                          to={`/admin/explore/spots/${s.id}`}
                          onMouseEnter={() => setHoverId(s.id)}
                          onMouseLeave={() => setHoverId(null)}
                          onFocus={() => setHoverId(s.id)}
                          onBlur={() => setHoverId(null)}
                          className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50 focus:outline-none focus-visible:bg-blue-50"
                        >
                          <span
                            className={`mt-0.5 w-6 h-6 rounded-full text-white text-xs font-bold flex items-center justify-center shrink-0 ${
                              s.status === 'Published' ? 'bg-emerald-500' : 'bg-orange-500'
                            }`}
                            aria-hidden="true"
                          >
                            {i + 1}
                          </span>
                          <span className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                            <PictogramIcon id={s.iconId} color="#334155" className="w-6 h-6" />
                          </span>
                          <span className="flex-1 min-w-0">
                            <span className="block text-sm font-semibold text-slate-800 truncate">{s.nameVi}</span>
                            <span className="block text-xs text-slate-500 truncate" lang="ja">
                              {s.nameJp}
                            </span>
                            <span className="flex flex-wrap items-center gap-1.5 mt-1.5">
                              <StatusBadge status={s.status} />
                              <span className="text-[11px] font-semibold text-[#0878EE]">{s.jlptLevel}</span>
                              {s.hasRoleplay && (
                                <span className="text-[11px] font-semibold text-red-700" title="Có Hội thoại AI: người học nhận dấu son">
                                  · dấu son
                                </span>
                              )}
                            </span>
                            {missing.length === 0 ? (
                              <span className="block text-[11px] text-emerald-700 mt-1">Đủ {SPOT_CHECKS.length}/{SPOT_CHECKS.length} mục kiểm tra</span>
                            ) : (
                              <span className="block text-[11px] text-amber-700 mt-1">
                                Còn thiếu: {missing.map((m) => m.label.toLowerCase()).join(', ')}
                              </span>
                            )}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>
          </div>

          <WordCard
            key={JSON.stringify(content.word ?? null)}
            initial={content.word ?? null}
            onSave={async (dto) => {
              const res = await adminExploreService.saveWord(prefectureId, dto);
              if (res.success && res.data) {
                const word = res.data;
                setContent((c) => c && { ...c, word });
                toast(res.message || 'Đã lưu.');
                return null;
              }
              toast(res.message || 'Không lưu được.', 'error');
              return res.errors ?? [res.message];
            }}
          />
        </>
      )}
      {toasts}
    </div>
  );
};

const StatusBadge: React.FC<{ status: ExploreSpotStatus }> = ({ status }) => (
  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_BADGE[status]}`}>{STATUS_LABEL[status]}</span>
);

// ---------------------------------------------------------------------------

const EMPTY_WORD: AdminExploreWord = { word: '', kana: '', meaning: '', note: '', status: 'Draft' };

const WordCard: React.FC<{
  initial: AdminExploreWord | null;
  onSave: (dto: AdminExploreWord) => Promise<string[] | null>;
}> = ({ initial, onSave }) => {
  const start = initial ? { ...initial, note: initial.note ?? '' } : EMPTY_WORD;
  const [form, setForm] = useState<AdminExploreWord>(start);
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(start);
  const set = (key: keyof AdminExploreWord, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const local = [
      !form.word.trim() && 'Từ không được để trống.',
      !form.kana.trim() && 'Cách đọc không được để trống.',
      !form.meaning.trim() && 'Nghĩa không được để trống.',
    ].filter(Boolean) as string[];
    setErrors(local);
    if (local.length) return;
    setSaving(true);
    const result = await onSave({ ...form, note: form.note?.trim() || null });
    setSaving(false);
    setErrors(result ?? []);
  };

  return (
    <form onSubmit={submit} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5" noValidate aria-labelledby="explore-word-title">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
        <div>
          <h2 id="explore-word-title" className="text-base font-bold text-slate-900">
            Một từ ở tỉnh
          </h2>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Một từ văn hoá gắn với cả tỉnh. Khi ở trạng thái "Đang dùng", từ hiện trên bản đồ toàn quốc, kể cả khi tỉnh chưa mở.
          </p>
        </div>
        <div className="flex rounded-lg border border-slate-300 p-0.5 bg-slate-50 shrink-0" role="radiogroup" aria-label="Trạng thái của từ">
          {(['Draft', 'Published'] as const).map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={form.status === s}
              onClick={() => set('status', s)}
              className={`h-8 px-3 rounded-md text-xs font-semibold ${
                form.status === s ? (s === 'Published' ? 'bg-emerald-600 text-white' : 'bg-orange-500 text-white') : 'text-slate-600 hover:bg-white'
              }`}
            >
              {STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
        <WordField id="word-word" label="Từ" value={form.word} onChange={(v) => set('word', v)} max={50} lang="ja" placeholder="鹿" />
        <WordField id="word-kana" label="Cách đọc" value={form.kana} onChange={(v) => set('kana', v)} max={100} lang="ja" placeholder="しか" />
        <WordField id="word-meaning" label="Nghĩa" value={form.meaning} onChange={(v) => set('meaning', v)} max={200} placeholder="con nai" />
      </div>
      <div className="mt-3">
        <WordField id="word-note" label="Ghi chú (tuỳ chọn)" value={form.note ?? ''} onChange={(v) => set('note', v)} max={500} placeholder="Nai thả tự do trong công viên Nara." />
      </div>

      {errors.length > 0 && (
        <ul className="mt-3 text-xs text-red-700 list-disc pl-5" role="alert">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <div className="flex justify-end mt-4">
        <button
          type="submit"
          disabled={!dirty || saving}
          className="h-9 px-4 rounded-lg bg-[#0878EE] text-white text-xs font-semibold hover:bg-[#0667cc] disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-[#0878EE]"
        >
          {saving ? 'Đang lưu…' : 'Lưu từ'}
        </button>
      </div>
    </form>
  );
};

const WordField: React.FC<{
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  max: number;
  placeholder?: string;
  lang?: string;
}> = ({ id, label, value, onChange, max, placeholder, lang }) => (
  <div>
    <label htmlFor={id} className="block text-xs font-semibold text-slate-700 mb-1">
      {label}
    </label>
    <input
      id={id}
      value={value}
      lang={lang}
      maxLength={max}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#0878EE]/40 focus:border-[#0878EE]"
    />
  </div>
);
