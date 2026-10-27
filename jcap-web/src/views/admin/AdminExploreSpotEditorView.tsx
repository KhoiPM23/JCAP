import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PREFECTURES } from '../../data/japanMap';
import { adminExploreService } from '../../services/adminExploreService';
import type {
  AdminExploreSpot,
  AdminExploreSpotSummary,
  ExploreLevel,
  ExploreLookupItem,
  ExploreLookupKind,
  ExploreSpotCheckKey,
  SaveExploreSpot,
} from '../../types/adminExplore';
import { PictogramIcon } from '../explore/exploreUi';
import { WarnIcon } from './AdminExploreChapterSection';
import { IconPicker } from './AdminExploreIconPicker';
import { LookupChip, LookupSearch, UsedByText } from './AdminExplorePickers';
import { AdminExplorePrefectureMap, type MapSpot } from './AdminExplorePrefectureMap';
import { LoadError, useAdminToasts } from './AdminExploreToasts';
import { SPOT_CHECKS, STATUS_BADGE, STATUS_LABEL, formatCoord, inJapan, parseLatLon } from './adminExploreSpots';
import { formatFurigana, parseFurigana } from './furiganaNotation';

/**
 * Soạn một mốc học (giai đoạn 3): địa điểm, bài học tại mốc, các bước luyện tập.
 * Mốc mới luôn là Nháp; chuyển sang "Đang dùng" khi đủ các mục kiểm tra.
 */

const LEVELS: ExploreLevel[] = ['N5', 'N4', 'N3'];
const VISIBLE_TO_LEARNER: ExploreSpotCheckKey[] = ['place', 'sentence', 'situation', 'realUse'];
const DEFAULT_PASS = 60;

interface SpotForm {
  iconId: string;
  nameVi: string;
  nameJp: string;
  nameKana: string;
  coords: string;
  jlptLevel: ExploreLevel;
  estimatedMinutes: string;
  situation: string;
  realUse: string;
  sentenceText: string;
  meaning: string;
  grammarNote: string;
  grammars: ExploreLookupItem[];
  vocabularies: ExploreLookupItem[];
  shadowing: ExploreLookupItem | null;
  shadowingPass: string;
  roleplay: ExploreLookupItem | null;
}

const EMPTY_FORM: SpotForm = {
  iconId: '',
  nameVi: '',
  nameJp: '',
  nameKana: '',
  coords: '',
  jlptLevel: 'N5',
  estimatedMinutes: '5',
  situation: '',
  realUse: '',
  sentenceText: '',
  meaning: '',
  grammarNote: '',
  grammars: [],
  vocabularies: [],
  shadowing: null,
  shadowingPass: String(DEFAULT_PASS),
  roleplay: null,
};

function fromSpot(s: AdminExploreSpot): SpotForm {
  const shadowing = s.activities.find((a) => a.type === 'Shadowing');
  const roleplay = s.activities.find((a) => a.type === 'Roleplay');
  return {
    iconId: s.iconId,
    nameVi: s.nameVi,
    nameJp: s.nameJp,
    nameKana: s.nameKana ?? '',
    coords: `${formatCoord(s.latitude)}, ${formatCoord(s.longitude)}`,
    jlptLevel: s.jlptLevel,
    estimatedMinutes: String(s.estimatedMinutes),
    situation: s.situation,
    realUse: s.realUse,
    sentenceText: formatFurigana(s.sentence),
    meaning: s.meaning,
    grammarNote: s.grammarNote ?? '',
    grammars: s.grammars,
    vocabularies: s.vocabularies,
    shadowing: shadowing?.reference ?? null,
    shadowingPass: String(shadowing?.passThreshold ?? DEFAULT_PASS),
    roleplay: roleplay?.reference ?? null,
  };
}

function toDto(f: SpotForm): SaveExploreSpot {
  const [lat, lon] = parseLatLon(f.coords) ?? [NaN, NaN];
  const activities: SaveExploreSpot['activities'] = [];
  if (f.shadowing) activities.push({ type: 'Shadowing', referenceId: f.shadowing.id, passThreshold: Number(f.shadowingPass) });
  if (f.roleplay) activities.push({ type: 'Roleplay', referenceId: f.roleplay.id });
  return {
    iconId: f.iconId,
    nameVi: f.nameVi.trim(),
    nameJp: f.nameJp.trim(),
    nameKana: f.nameKana.trim() || null,
    latitude: lat,
    longitude: lon,
    jlptLevel: f.jlptLevel,
    situation: f.situation.trim(),
    realUse: f.realUse.trim(),
    sentence: parseFurigana(f.sentenceText).segments,
    meaning: f.meaning.trim(),
    grammarNote: f.grammarNote.trim() || null,
    estimatedMinutes: Number(f.estimatedMinutes),
    grammarIds: f.grammars.map((g) => g.id),
    vocabularyIds: f.vocabularies.map((v) => v.id),
    activities,
  };
}

/** Các mục kiểm tra còn thiếu, tính ngay trên form (cùng quy tắc với backend) */
function missingChecks(f: SpotForm): ExploreSpotCheckKey[] {
  const coords = parseLatLon(f.coords);
  const out: ExploreSpotCheckKey[] = [];
  if (!f.nameVi.trim() || !f.nameJp.trim() || !f.iconId || !coords || !inJapan(...coords)) out.push('place');
  if (!f.meaning.trim() || !parseFurigana(f.sentenceText).segments.some((s) => s.text.trim())) out.push('sentence');
  if (f.grammars.length === 0 && f.vocabularies.length === 0) out.push('target');
  if (!f.situation.trim()) out.push('situation');
  if (!f.realUse.trim()) out.push('realUse');
  if (!f.shadowing || !f.shadowing.available) out.push('shadowing');
  return out;
}

type FieldErrors = Partial<Record<'iconId' | 'nameVi' | 'nameJp' | 'coords' | 'estimatedMinutes' | 'sentenceText' | 'shadowingPass', string>>;

/** Lỗi chặn việc lưu (khác với mục kiểm tra, chỉ chặn chuyển sang "Đang dùng") */
function fieldErrors(f: SpotForm): FieldErrors {
  const e: FieldErrors = {};
  if (!f.iconId) e.iconId = 'Chọn biểu tượng cho mốc.';
  if (!f.nameVi.trim()) e.nameVi = 'Nhập tên tiếng Việt.';
  if (!f.nameJp.trim()) e.nameJp = 'Nhập tên tiếng Nhật.';
  const coords = parseLatLon(f.coords);
  if (!f.coords.trim()) e.coords = 'Bấm lên bản đồ hoặc dán toạ độ.';
  else if (!coords) e.coords = 'Toạ độ chưa đúng dạng "35.7147, 139.7967".';
  else if (!inJapan(...coords)) e.coords = 'Toạ độ nằm ngoài nước Nhật (vĩ độ 20–46, kinh độ 122–154).';
  const m = Number(f.estimatedMinutes);
  if (!Number.isInteger(m) || m < 1 || m > 60) e.estimatedMinutes = 'Từ 1 đến 60 phút.';
  const problems = parseFurigana(f.sentenceText).problems;
  if (problems.length) e.sentenceText = problems[0];
  const p = Number(f.shadowingPass);
  if (f.shadowing && (!Number.isInteger(p) || p < 0 || p > 100)) e.shadowingPass = 'Từ 0 đến 100.';
  return e;
}

// ---------------------------------------------------------------------------

export const AdminExploreSpotEditorView: React.FC = () => {
  const params = useParams();
  const spotId = params.spotId ? Number(params.spotId) : null;
  const navigate = useNavigate();
  const { toast, toasts } = useAdminToasts();

  const [spot, setSpot] = useState<AdminExploreSpot | null>(null);
  const [prefectureId, setPrefectureId] = useState<number | null>(spotId ? null : Number(params.id));
  // Mọi mốc của tỉnh theo đúng thứ tự trang tỉnh (để số trên bản đồ khớp danh sách mốc)
  const [allSpots, setAllSpots] = useState<AdminExploreSpotSummary[]>([]);
  const [prefectureOpen, setPrefectureOpen] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const [form, setForm] = useState<SpotForm>(EMPTY_FORM);
  const [saved, setSaved] = useState<SpotForm>(EMPTY_FORM);
  const [showErrors, setShowErrors] = useState(false);
  const [serverErrors, setServerErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<'unpublish' | 'deactivate' | null>(null);
  const [outside, setOutside] = useState(false);

  const shape = PREFECTURES.find((p) => p.id === prefectureId);

  const load = useCallback(async () => {
    setLoadError(null);
    let prefId = spotId ? null : Number(params.id);
    if (spotId) {
      const res = await adminExploreService.getSpot(spotId);
      if (!res.success || !res.data) {
        setLoadError(res.message);
        return;
      }
      setSpot(res.data);
      const f = fromSpot(res.data);
      setForm(f);
      setSaved(f);
      prefId = res.data.prefectureId;
    }
    if (!prefId || !PREFECTURES.some((p) => p.id === prefId)) {
      setLoadError('Mã tỉnh không hợp lệ.');
      return;
    }
    setPrefectureId(prefId);
    const content = await adminExploreService.getPrefectureContent(prefId);
    if (content.success && content.data) {
      setAllSpots(content.data.spots);
      setPrefectureOpen(content.data.isOpen);
    }
    setLoaded(true);
  }, [spotId, params.id]);

  useEffect(() => {
    load();
  }, [load]);

  const dirty = JSON.stringify(form) !== JSON.stringify(saved);

  // Nhắc khi rời trang lúc còn thay đổi chưa lưu
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const set = <K extends keyof SpotForm>(key: K, value: SpotForm[K]) => setForm((f) => ({ ...f, [key]: value }));

  const errors = fieldErrors(form);
  const shownErrors: FieldErrors = showErrors ? errors : {};
  const missing = missingChecks(form);
  const status = spot?.status ?? 'Draft';
  const blankedVisible = status === 'Published' ? missing.filter((m) => VISIBLE_TO_LEARNER.includes(m)) : [];
  const canSave = Object.keys(errors).length === 0 && blankedVisible.length === 0;

  const coords = parseLatLon(form.coords);
  const pick = useMemo(() => (coords && inJapan(...coords) ? { lat: coords[0], lon: coords[1] } : null), [coords?.[0], coords?.[1]]); // eslint-disable-line react-hooks/exhaustive-deps
  // Mốc đang soạn được vẽ bằng chấm vị trí (pick), các mốc khác giữ đúng số thứ tự của chúng trong tỉnh
  const mapSpots = useMemo<MapSpot[]>(
    () =>
      allSpots
        .map((s, i) => ({ id: s.id, no: i + 1, lat: s.latitude, lon: s.longitude, status: s.status, label: s.nameVi }))
        .filter((s) => s.id !== spotId),
    [allSpots, spotId],
  );
  const pickNo = spotId ? allSpots.findIndex((s) => s.id === spotId) + 1 || null : null;
  const otherSpots = useMemo(() => allSpots.filter((s) => s.id !== spotId), [allSpots, spotId]);

  const backTo = prefectureId ? `/admin/explore/prefectures/${prefectureId}` : '/admin/explore';
  const goBack = () => {
    if (dirty && !window.confirm('Có thay đổi chưa lưu. Rời trang và bỏ các thay đổi này?')) return;
    navigate(backTo);
  };

  const applyResult = (data: AdminExploreSpot) => {
    setSpot(data);
    const f = fromSpot(data);
    setForm(f);
    setSaved(f);
    setShowErrors(false);
    setServerErrors([]);
  };

  /** Lưu (hoặc tạo); trả về mốc đã lưu, null nếu lỗi */
  const save = async (): Promise<AdminExploreSpot | null> => {
    setShowErrors(true);
    if (!canSave) {
      toast('Còn thông tin chưa hợp lệ, xem các ô báo đỏ.', 'error');
      return null;
    }
    const dto = toDto(form);
    const res = spotId ? await adminExploreService.updateSpot(spotId, dto) : await adminExploreService.createSpot(prefectureId!, dto);
    if (!res.success || !res.data) {
      setServerErrors(res.errors?.length ? res.errors : [res.message]);
      toast(res.message || 'Không lưu được.', 'error');
      return null;
    }
    applyResult(res.data);
    if (!spotId) {
      toast('Đã tạo mốc ở trạng thái Nháp.');
      navigate(`/admin/explore/spots/${res.data.id}`, { replace: true });
    } else {
      toast('Đã lưu mốc.');
    }
    return res.data;
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  const publish = () =>
    run(async () => {
      if (dirty && !(await save())) return;
      const res = await adminExploreService.setSpotStatus(spotId!, 'Published');
      if (!res.success || !res.data) {
        setServerErrors(res.errors?.length ? res.errors : [res.message]);
        toast(res.message || 'Không chuyển được.', 'error');
        return;
      }
      applyResult(res.data);
      toast(prefectureOpen ? 'Mốc đã chuyển sang Đang dùng: người học đã thấy mốc này.' : 'Mốc đã chuyển sang Đang dùng (người học thấy khi tỉnh được mở).');
    });

  const unpublish = () =>
    run(async () => {
      const res = await adminExploreService.setSpotStatus(spotId!, 'Draft');
      if (!res.success || !res.data) {
        toast(res.message || 'Không chuyển được.', 'error');
        return;
      }
      // Giữ các thay đổi đang soạn dở, chỉ cập nhật trạng thái
      setSpot(res.data);
      setConfirm(null);
      toast('Mốc đã chuyển về Nháp.');
    });

  const deactivate = () =>
    run(async () => {
      const res = await adminExploreService.deactivateSpot(spotId!);
      if (!res.success) {
        toast(res.message || 'Không ngừng dùng được.', 'error');
        return;
      }
      setSaved(form); // không hỏi lại khi rời trang
      navigate(backTo, { state: { flash: `Đã ngừng dùng mốc "${form.nameVi}".` } });
    });

  if (loadError) {
    return (
      <div className="w-full max-w-7xl mx-auto p-4 sm:p-6 space-y-4">
        <LoadError message={`Không tải được mốc: ${loadError}`} onRetry={load} />
        <Link to="/admin/explore" className="text-sm font-semibold text-[#0878EE] hover:underline">
          Về bản đồ Khám phá
        </Link>
      </div>
    );
  }

  if (!loaded || !shape) {
    return (
      <div className="w-full max-w-7xl mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6" aria-busy="true" aria-label="Đang tải">
        <div className="lg:col-span-8 h-[640px] rounded-2xl bg-slate-200/70 animate-pulse" />
        <div className="lg:col-span-4 h-80 rounded-2xl bg-slate-200/70 animate-pulse" />
      </div>
    );
  }

  const parsed = parseFurigana(form.sentenceText);

  return (
    <div className="w-full max-w-7xl mx-auto p-4 sm:p-6 space-y-6 bg-slate-50 min-h-screen">
      {/* Tiêu đề */}
      <div>
        <nav className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 font-medium mb-1" aria-label="Breadcrumb">
          <span>Quản lý Nội dung</span>
          <span>&gt;</span>
          <Link to="/admin/explore" className="hover:text-[#0878EE] hover:underline">
            Bản đồ Khám phá
          </Link>
          <span>&gt;</span>
          <button type="button" onClick={goBack} className="hover:text-[#0878EE] hover:underline">
            {shape.nameVi}
          </button>
          <span>&gt;</span>
          <span className="text-slate-800 font-semibold">{spotId ? 'Sửa mốc' : 'Mốc mới'}</span>
        </nav>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{spotId ? saved.nameVi || 'Mốc' : `Mốc mới ở ${shape.nameVi}`}</h1>
          <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${STATUS_BADGE[status]}`}>{STATUS_LABEL[status]}</span>
          {dirty && <span className="text-xs font-semibold text-amber-700">· Có thay đổi chưa lưu</span>}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* ---------------- Form ---------------- */}
        <div className="lg:col-span-8 space-y-6">
          <Section n={1} title="Địa điểm" desc="Địa điểm thật trong tỉnh. Người học thấy mốc ở đúng vị trí này trên bản đồ.">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Tên tiếng Việt" htmlFor="spot-name-vi" error={shownErrors.nameVi} required>
                <input id="spot-name-vi" value={form.nameVi} maxLength={200} onChange={(e) => set('nameVi', e.target.value)} placeholder="Chùa Senso-ji" className={inputClass(!!shownErrors.nameVi)} />
              </Field>
              <Field label="Tên tiếng Nhật" htmlFor="spot-name-jp" error={shownErrors.nameJp} required>
                <input id="spot-name-jp" lang="ja" value={form.nameJp} maxLength={200} onChange={(e) => set('nameJp', e.target.value)} placeholder="浅草寺" className={inputClass(!!shownErrors.nameJp)} />
              </Field>
              <Field label="Cách đọc tên (furigana trên bản đồ)" htmlFor="spot-name-kana" hint="Tuỳ chọn. Viết bằng hiragana.">
                <input id="spot-name-kana" lang="ja" value={form.nameKana} maxLength={200} onChange={(e) => set('nameKana', e.target.value)} placeholder="せんそうじ" className={inputClass(false)} />
              </Field>
              <div>
                <div className="block text-xs font-semibold text-slate-700 mb-1">
                  Biểu tượng<span className="text-red-500"> *</span>
                </div>
                <IconPicker
                  prefectureId={shape.id}
                  value={form.iconId}
                  onChange={(v) => set('iconId', v)}
                  invalid={!!shownErrors.iconId}
                  names={[form.nameVi, form.nameJp, form.nameKana]}
                  prefectureSpots={otherSpots}
                />
                {shownErrors.iconId && <p className="text-[11px] text-red-600 mt-1">{shownErrors.iconId}</p>}
              </div>
            </div>

            <div className="mt-4">
              <div className="aspect-[4/3] rounded-xl overflow-hidden border border-slate-200">
                <AdminExplorePrefectureMap
                  prefectureId={shape.id}
                  spots={mapSpots}
                  pick={pick}
                  pickNo={pickNo}
                  onPick={(lat, lon) => set('coords', `${formatCoord(lat)}, ${formatCoord(lon)}`)}
                  onPickInside={(inside) => setOutside(!inside)}
                />
              </div>
              <p className="text-[11px] text-slate-500 mt-1.5">
                Bấm lên bản đồ để đặt vị trí (chấm xanh dương). Các chấm số là mốc khác trong tỉnh. Muốn chính xác hơn, dán toạ độ từ Google Maps
                (chuột phải vào địa điểm → bấm dòng toạ độ để sao chép).
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              <Field label="Toạ độ (vĩ độ, kinh độ)" htmlFor="spot-coords" error={shownErrors.coords ?? (form.coords.trim() ? errors.coords : undefined)} required>
                <input
                  id="spot-coords"
                  value={form.coords}
                  inputMode="decimal"
                  onChange={(e) => set('coords', e.target.value)}
                  placeholder="35.7147, 139.7967"
                  className={inputClass(!!shownErrors.coords)}
                />
              </Field>
            </div>
            {pick && outside && (
              <p className="mt-2 text-xs text-amber-700 flex items-center gap-1.5">
                <WarnIcon className="w-3.5 h-3.5 shrink-0" />
                Vị trí đang nằm ngoài ranh giới {shape.nameVi}. Kiểm tra lại toạ độ (đảo nhỏ có thể không có trên bản đồ).
              </p>
            )}
          </Section>

          <Section n={2} title="Bài học tại mốc" desc="Một tình huống thật ở đúng địa điểm này, dạy một điểm ngữ pháp/từ vựng theo cấp độ.">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Field label="Cấp độ" htmlFor="spot-level">
                <select id="spot-level" value={form.jlptLevel} onChange={(e) => set('jlptLevel', e.target.value as ExploreLevel)} className={inputClass(false)}>
                  {LEVELS.map((l) => (
                    <option key={l}>{l}</option>
                  ))}
                </select>
              </Field>
              <Field label="Thời lượng (phút)" htmlFor="spot-minutes" error={shownErrors.estimatedMinutes}>
                <input
                  id="spot-minutes"
                  type="number"
                  min={1}
                  max={60}
                  inputMode="numeric"
                  value={form.estimatedMinutes}
                  onChange={(e) => set('estimatedMinutes', e.target.value)}
                  className={inputClass(!!shownErrors.estimatedMinutes)}
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              <Field label="Tình huống" htmlFor="spot-situation" hint="Chuyện gì xảy ra, ở đâu, khi nào tại địa điểm này." check={!missing.includes('situation')}>
                <textarea id="spot-situation" rows={3} maxLength={1000} value={form.situation} onChange={(e) => set('situation', e.target.value)} placeholder="Trên phố Nakamise trước chùa, bạn muốn mua một món quà lưu niệm." className={inputClass(false)} />
              </Field>
              <Field label="Dùng thật" htmlFor="spot-realuse" hint="Ngoài đời, người học dùng câu này khi nào." check={!missing.includes('realUse')}>
                <textarea id="spot-realuse" rows={3} maxLength={1000} value={form.realUse} onChange={(e) => set('realUse', e.target.value)} placeholder="Hỏi giá khi mua hàng ở chợ, cửa hàng lưu niệm." className={inputClass(false)} />
              </Field>
            </div>

            <div className="mt-3">
              <Field
                label="Câu mẫu"
                htmlFor="spot-sentence"
                error={shownErrors.sentenceText ?? (parsed.problems[0] && form.sentenceText ? parsed.problems[0] : undefined)}
                hint="Thêm furigana: 観光[かんこう]です。 — cụm có kana: {お土産|おみやげ}"
                check={!missing.includes('sentence')}
              >
                <input id="spot-sentence" lang="ja" value={form.sentenceText} onChange={(e) => set('sentenceText', e.target.value)} placeholder="これはいくらですか。" className={`${inputClass(!!shownErrors.sentenceText)} text-base`} />
              </Field>
              {parsed.segments.length > 0 && (
                <div className="mt-2 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-lg text-slate-900" lang="ja" aria-label="Xem trước câu mẫu">
                  <Ruby segments={parsed.segments} />
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              <Field label="Nghĩa tiếng Việt" htmlFor="spot-meaning">
                <input id="spot-meaning" value={form.meaning} maxLength={500} onChange={(e) => set('meaning', e.target.value)} placeholder="Cái này bao nhiêu tiền?" className={inputClass(false)} />
              </Field>
              <Field label="Ghi chú ngữ pháp (tuỳ chọn)" htmlFor="spot-note">
                <input id="spot-note" value={form.grammarNote} maxLength={1000} onChange={(e) => set('grammarNote', e.target.value)} placeholder="N は いくらですか: hỏi giá N." className={inputClass(false)} />
              </Field>
            </div>

            <div className="mt-4">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-xs font-semibold text-slate-700">Ngữ pháp và từ vựng mục tiêu</span>
                <CheckDot ok={!missing.includes('target')} />
              </div>
              <p className="text-[11px] text-slate-500 mb-2">Lấy từ kho ngữ pháp/từ vựng dùng chung của hệ thống; cần ít nhất một mục.</p>
              <TargetList
                kind="grammar"
                spotId={spotId}
                label="Ngữ pháp"
                level={form.jlptLevel}
                items={form.grammars}
                onChange={(items) => set('grammars', items)}
              />
              <div className="h-3" />
              <TargetList
                kind="vocabulary"
                spotId={spotId}
                label="Từ vựng"
                level={form.jlptLevel}
                items={form.vocabularies}
                onChange={(items) => set('vocabularies', items)}
              />
            </div>
          </Section>

          <Section n={3} title="Luyện tập" desc="Các bước người học làm tại mốc. Con dấu = hoàn thành các bước miễn phí; thêm Hội thoại AI để nhận dấu son.">
            <ActivityCard
              spotId={spotId}
              step="②"
              title="Shadowing"
              note="Bắt buộc · miễn phí"
              kind="shadowing"
              level={form.jlptLevel}
              item={form.shadowing}
              onChange={(item) => set('shadowing', item)}
              ok={!missing.includes('shadowing')}
            >
              {form.shadowing && (
                <div className="mt-3 max-w-[12rem]">
                  <Field label="Điểm đạt (0–100)" htmlFor="spot-pass" error={shownErrors.shadowingPass}>
                    <input
                      id="spot-pass"
                      type="number"
                      min={0}
                      max={100}
                      inputMode="numeric"
                      value={form.shadowingPass}
                      onChange={(e) => set('shadowingPass', e.target.value)}
                      className={inputClass(!!shownErrors.shadowingPass)}
                    />
                  </Field>
                </div>
              )}
            </ActivityCard>
            <PlaceholderCard step="③" title="Kiểm tra" note="Đạt từ 80% · đang chờ module Kiểm tra của nhóm" />
            <PlaceholderCard step="③" title="Flashcard" note="Đang chờ module Flashcard của nhóm" />
            <ActivityCard
              spotId={spotId}
              step="④"
              title="Hội thoại AI"
              note="Tuỳ chọn · tốn Credit · cho dấu son"
              kind="roleplay"
              level={form.jlptLevel}
              item={form.roleplay}
              onChange={(item) => set('roleplay', item)}
            />
          </Section>
        </div>

        {/* ---------------- Cột phải ---------------- */}
        <aside className="lg:col-span-4 space-y-4" aria-label="Kiểm tra và lưu mốc">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <h2 className="text-sm font-bold text-slate-900">Kiểm tra trước khi dùng</h2>
            <ul className="mt-3 space-y-2">
              {SPOT_CHECKS.map((c) => {
                const ok = !missing.includes(c.key);
                return (
                  <li key={c.key} className="flex items-start gap-2">
                    <CheckDot ok={ok} />
                    <span className="min-w-0">
                      <span className={`block text-sm ${ok ? 'text-slate-700' : 'text-slate-900 font-semibold'}`}>{c.label}</span>
                      {!ok && <span className="block text-[11px] text-slate-500">{c.hint}</span>}
                    </span>
                  </li>
                );
              })}
              <li className="flex items-start gap-2 pt-2 border-t border-slate-100">
                <span className={`mt-0.5 w-4 h-4 rounded-full shrink-0 ${form.roleplay ? 'bg-red-600' : 'border-2 border-dashed border-slate-300'}`} aria-hidden="true" />
                <span className="text-sm text-slate-600">
                  Hội thoại AI <span className="text-[11px] text-slate-500">(tuỳ chọn, cho dấu son)</span>
                </span>
              </li>
            </ul>

            {serverErrors.length > 0 && (
              <ul className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 list-disc pl-6 space-y-0.5" role="alert">
                {serverErrors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            )}
            {blankedVisible.length > 0 && (
              <p className="mt-4 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Mốc đang dùng: người học đang thấy mốc này nên không được để trống{' '}
                {SPOT_CHECKS.filter((c) => blankedVisible.includes(c.key)).map((c) => c.label.toLowerCase()).join(', ')}.
              </p>
            )}

            <div className="mt-4 space-y-2">
              <button
                type="button"
                disabled={busy || (!!spotId && !dirty) || blankedVisible.length > 0}
                onClick={() => run(async () => void (await save()))}
                className="w-full h-10 rounded-xl bg-[#0878EE] text-white text-sm font-semibold hover:bg-[#0667cc] disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#0878EE]"
              >
                {busy ? 'Đang lưu…' : spotId ? 'Lưu thay đổi' : 'Tạo mốc (Nháp)'}
              </button>

              {spotId && status === 'Draft' && (
                <button
                  type="button"
                  disabled={busy || missing.length > 0}
                  onClick={publish}
                  title={missing.length > 0 ? 'Cần đủ các mục kiểm tra' : undefined}
                  className="w-full h-10 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-500 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-emerald-600"
                >
                  {dirty ? 'Lưu và chuyển sang Đang dùng' : 'Chuyển sang Đang dùng'}
                </button>
              )}

              {spotId && status === 'Published' && confirm !== 'unpublish' && (
                <button type="button" disabled={busy} onClick={() => setConfirm('unpublish')} className={SECONDARY_BTN}>
                  Chuyển về Nháp
                </button>
              )}
              {confirm === 'unpublish' && (
                <ConfirmBox
                  tone="amber"
                  text={`Người học sẽ không thấy mốc này nữa${prefectureOpen ? ' (tỉnh đang mở)' : ''}. Nội dung vẫn được giữ để sửa tiếp.`}
                  action="Chuyển về Nháp"
                  busy={busy}
                  onCancel={() => setConfirm(null)}
                  onConfirm={unpublish}
                />
              )}

              {spotId && status === 'Draft' && confirm !== 'deactivate' && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirm('deactivate')}
                  className="w-full h-9 rounded-xl text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
                >
                  Ngừng dùng mốc
                </button>
              )}
              {confirm === 'deactivate' && (
                <ConfirmBox
                  tone="red"
                  text="Mốc được ẩn khỏi danh sách (không xoá dữ liệu)."
                  action="Ngừng dùng"
                  busy={busy}
                  onCancel={() => setConfirm(null)}
                  onConfirm={deactivate}
                />
              )}
              <button type="button" onClick={goBack} className={SECONDARY_BTN}>
                Về danh sách mốc
              </button>
            </div>
            {status === 'Published' && !prefectureOpen && (
              <p className="mt-3 text-[11px] text-slate-500">Tỉnh chưa mở: người học chỉ thấy mốc sau khi tỉnh được mở.</p>
            )}
          </div>

          <Preview form={form} segments={parsed.segments} />
        </aside>
      </div>
      {/* Thanh lưu nổi: cột phải không bám theo khi cuộn (layout chung chặn sticky) nên nút Lưu luôn trong tầm tay */}
      {dirty && (
        <div
          className="fixed z-40 bottom-4 right-4 left-4 sm:left-auto flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/95 backdrop-blur px-4 py-2.5 shadow-lg"
          role="region"
          aria-label="Thay đổi chưa lưu"
        >
          <span className="text-xs font-semibold text-amber-700">Có thay đổi chưa lưu</span>
          <button
            type="button"
            disabled={busy || blankedVisible.length > 0}
            onClick={() => run(async () => void (await save()))}
            className="h-9 px-4 rounded-lg bg-[#0878EE] text-white text-xs font-semibold hover:bg-[#0667cc] disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-[#0878EE]"
          >
            {busy ? 'Đang lưu…' : spotId ? 'Lưu' : 'Tạo mốc (Nháp)'}
          </button>
        </div>
      )}
      {toasts}
    </div>
  );
};

// ---------------------------------------------------------------------------

const SECONDARY_BTN =
  'w-full h-10 rounded-xl border border-slate-300 bg-white text-slate-700 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0878EE]';

const inputClass = (invalid: boolean) =>
  `w-full rounded-lg border px-3 py-2 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#0878EE]/40 ${
    invalid ? 'border-red-400' : 'border-slate-300 focus:border-[#0878EE]'
  }`;

const Section: React.FC<{ n: number; title: string; desc: string; children: React.ReactNode }> = ({ n, title, desc, children }) => (
  <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5" aria-labelledby={`spot-section-${n}`}>
    <div className="flex items-start gap-3 mb-4">
      <span className="w-7 h-7 rounded-lg bg-slate-900 text-white text-sm font-bold flex items-center justify-center shrink-0" aria-hidden="true">
        {n}
      </span>
      <div>
        <h2 id={`spot-section-${n}`} className="text-base font-bold text-slate-900">
          {title}
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
      </div>
    </div>
    {children}
  </section>
);

const Field: React.FC<{
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  required?: boolean;
  /** Hiện chấm kiểm tra cạnh nhãn (mục bắt buộc trước khi dùng) */
  check?: boolean;
  children: React.ReactNode;
}> = ({ label, htmlFor, error, hint, required, check, children }) => (
  <div>
    <label htmlFor={htmlFor} className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-1">
      <span>
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      {check !== undefined && <CheckDot ok={check} />}
    </label>
    {children}
    {error ? <p className="text-[11px] text-red-600 mt-1">{error}</p> : hint ? <p className="text-[11px] text-slate-500 mt-1">{hint}</p> : null}
  </div>
);

const CheckDot: React.FC<{ ok: boolean }> = ({ ok }) =>
  ok ? (
    <span className="mt-0.5 w-4 h-4 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0" aria-label="Đã đủ">
      <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7" />
      </svg>
    </span>
  ) : (
    <span className="mt-0.5 w-4 h-4 rounded-full border-2 border-amber-500 shrink-0" aria-label="Còn thiếu" />
  );

const Ruby: React.FC<{ segments: { text: string; reading?: string | null }[] }> = ({ segments }) => (
  <>
    {segments.map((s, i) =>
      s.reading ? (
        <ruby key={i}>
          {s.text}
          <rt className="text-[0.55em] text-slate-500">{s.reading}</rt>
        </ruby>
      ) : (
        <React.Fragment key={i}>{s.text}</React.Fragment>
      ),
    )}
  </>
);

const TargetList: React.FC<{
  kind: ExploreLookupKind;
  spotId: number | null;
  label: string;
  level: ExploreLevel;
  items: ExploreLookupItem[];
  onChange: (items: ExploreLookupItem[]) => void;
}> = ({ kind, spotId, label, level, items, onChange }) => {
  const [adding, setAdding] = useState(false);
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-slate-500 w-16 shrink-0">{label}</span>
        {items.map((item) => (
          <LookupChip key={item.id} item={item} onRemove={() => onChange(items.filter((x) => x.id !== item.id))} />
        ))}
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="h-8 px-3 rounded-full border border-dashed border-slate-300 text-xs font-semibold text-slate-600 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0878EE]"
          >
            + Thêm {label.toLowerCase()}
          </button>
        )}
      </div>
      {adding && (
        <div className="mt-2">
          <LookupSearch
            kind={kind}
            currentSpotId={spotId}
            level={level}
            exclude={items.map((i) => i.id)}
            onSelect={(item) => onChange([...items, item])}
            onClose={() => setAdding(false)}
          />
        </div>
      )}
    </div>
  );
};

const ActivityCard: React.FC<{
  spotId: number | null;
  step: string;
  title: string;
  note: string;
  kind: ExploreLookupKind;
  level: ExploreLevel;
  item: ExploreLookupItem | null;
  onChange: (item: ExploreLookupItem | null) => void;
  ok?: boolean;
  children?: React.ReactNode;
}> = ({ spotId, step, title, note, kind, level, item, onChange, ok, children }) => {
  const [choosing, setChoosing] = useState(false);
  return (
    <div className="rounded-xl border border-slate-200 p-4 mb-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-base text-slate-500" aria-hidden="true">
            {step}
          </span>
          <span className="text-sm font-bold text-slate-900">{title}</span>
          {ok !== undefined && <CheckDot ok={ok} />}
          <span className="text-[11px] text-slate-500">{note}</span>
        </div>
      </div>
      {item ? (
        <div className={`mt-3 flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2 ${item.available ? 'border-slate-200 bg-slate-50' : 'border-red-200 bg-red-50'}`}>
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-semibold text-slate-800 truncate">
              {item.title} {item.jlptLevel && <span className="text-[11px] font-bold text-[#0878EE]">{item.jlptLevel}</span>}
            </span>
            {item.subtitle && <span className="block text-xs text-slate-500 truncate">{item.subtitle}</span>}
            {!item.available && <span className="block text-xs font-semibold text-red-700">Nội dung này đã ngừng dùng, hãy chọn nội dung khác.</span>}
            <UsedByText usedBy={item.usedBy ?? []} currentSpotId={spotId} links prefix="Cũng đang dùng ở" className="block mt-1" />
          </span>
          <span className="flex gap-1.5">
            <button type="button" onClick={() => setChoosing((c) => !c)} className="h-8 px-3 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50">
              Đổi
            </button>
            <button type="button" onClick={() => onChange(null)} className="h-8 px-3 rounded-lg text-xs font-semibold text-red-600 hover:bg-red-50">
              Bỏ
            </button>
          </span>
        </div>
      ) : (
        !choosing && (
          <button
            type="button"
            onClick={() => setChoosing(true)}
            className="mt-3 h-9 px-3 rounded-lg border border-dashed border-slate-300 text-xs font-semibold text-slate-600 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0878EE]"
          >
            + Chọn {kind === 'shadowing' ? 'bài Shadowing' : 'kịch bản Hội thoại AI'}
          </button>
        )
      )}
      {choosing && (
        <div className="mt-3">
          <LookupSearch
            kind={kind}
            currentSpotId={spotId}
            level={level}
            exclude={item ? [item.id] : []}
            onSelect={(picked) => {
              onChange(picked);
              setChoosing(false);
            }}
            onClose={() => setChoosing(false)}
          />
        </div>
      )}
      {children}
    </div>
  );
};

const PlaceholderCard: React.FC<{ step: string; title: string; note: string }> = ({ step, title, note }) => (
  <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 mb-3 flex items-center gap-2" aria-disabled="true">
    <span className="text-base text-slate-400" aria-hidden="true">
      {step}
    </span>
    <span className="text-sm font-bold text-slate-500">{title}</span>
    <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-200 text-slate-500">Sắp có</span>
    <span className="text-[11px] text-slate-500">{note}</span>
  </div>
);

const ConfirmBox: React.FC<{
  tone: 'amber' | 'red';
  text: string;
  action: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}> = ({ tone, text, action, busy, onCancel, onConfirm }) => (
  <div
    className={`rounded-xl border p-3 ${tone === 'red' ? 'border-red-200 bg-red-50' : 'border-amber-300 bg-amber-50'}`}
    role="alertdialog"
    aria-label={action}
  >
    <p className={`text-xs leading-relaxed ${tone === 'red' ? 'text-red-800' : 'text-amber-900'}`}>{text}</p>
    <div className="flex justify-end gap-2 mt-2">
      <button type="button" onClick={onCancel} className="h-9 px-3 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50">
        Huỷ
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={onConfirm}
        className={`h-9 px-3 rounded-lg text-white text-xs font-semibold disabled:opacity-50 ${tone === 'red' ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-600 hover:bg-amber-700'}`}
      >
        {action}
      </button>
    </div>
  </div>
);

/** Xem trước gần giống thẻ mốc phía người học */
const Preview: React.FC<{ form: SpotForm; segments: { text: string; reading?: string | null }[] }> = ({ form, segments }) => (
  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
    <h2 className="text-sm font-bold text-slate-900">Người học sẽ thấy</h2>
    <div className="mt-3 rounded-xl border border-slate-200 p-4">
      <div className="flex items-center gap-3">
        <span className="w-11 h-11 rounded-xl bg-[#0878EE]/10 flex items-center justify-center shrink-0">
          {form.iconId ? <PictogramIcon id={form.iconId} color="#0878EE" className="w-7 h-7" /> : null}
        </span>
        <span className="min-w-0">
          <span className="block text-base font-bold text-slate-900 truncate" lang="ja">
            {form.nameKana ? (
              <ruby>
                {form.nameJp || '—'}
                <rt className="text-[10px] text-slate-500">{form.nameKana}</rt>
              </ruby>
            ) : (
              form.nameJp || '—'
            )}
          </span>
          <span className="block text-xs text-slate-500 truncate">{form.nameVi || 'Tên tiếng Việt'}</span>
        </span>
        <span className="ml-auto text-[11px] font-bold text-[#0878EE] shrink-0">{form.jlptLevel}</span>
      </div>
      {form.situation && <p className="mt-3 text-xs text-slate-600 leading-relaxed">{form.situation}</p>}
      <div className="mt-3 text-xl text-slate-900 leading-loose" lang="ja">
        {segments.length ? <Ruby segments={segments} /> : <span className="text-sm text-slate-400">Câu mẫu</span>}
      </div>
      {form.meaning && <p className="text-sm text-slate-600">{form.meaning}</p>}
      {form.grammarNote && <p className="mt-2 text-xs text-slate-500 border-t border-slate-100 pt-2">{form.grammarNote}</p>}
    </div>
  </div>
);
