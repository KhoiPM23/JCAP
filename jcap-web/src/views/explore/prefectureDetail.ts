import { useEffect, useState } from 'react';
import { PREFECTURES, projectLonLat, type PrefectureShape } from '../../data/japanMap';
import { PICTOGRAMS, PREFECTURE_PICTOGRAMS, type Pictogram } from '../../data/japanPictograms';
import { PREFECTURE_CITIES } from '../../data/japanPlaces';
import type { LearnLevel, Phrase } from '../../data/learnContent';
import type { ExplorePrefectureDetail, ExploreSpot } from '../../types/explore';
import { cachedPrefecture } from './exploreStore';

/** Địa danh trên bản đồ tỉnh = một mốc học (lấy từ API, admin quản lý) */
export interface MapLandmark {
  /** Id mốc trong CSDL (dùng làm khoá, vì nhiều mốc có thể chung một biểu tượng, vd. ba mốc ở sân bay Narita) */
  spotId: number;
  /** Biểu tượng + tên hiển thị của mốc (tên lấy theo mốc, không theo bộ biểu tượng) */
  pictogram: Pictogram;
  /** Toạ độ trên bản đồ (đã chiếu) */
  xy: [number, number];
  /** Cách đọc tên (furigana trên nhãn) */
  kana?: string;
  /** Câu mẫu của bài tại mốc */
  phrase?: Phrase;
}

export interface MapCity {
  nameJp: string;
  nameVi: string;
  capital: boolean;
  xy: [number, number];
}

export interface Municipality {
  code: string;
  name: string;
  /** Tên thành phố chỉ định nếu đây là một quận (vd. 京都市 của 京都市北区) */
  city?: string;
  d: string;
}

export const BOUNDARY_CREDIT = {
  text: 'Ranh giới hành chính: 「国土数値情報（行政区域データ）」（国土交通省）を加工して作成',
  short: 'Ranh giới: 国土数値情報 (MLIT)',
  url: 'https://nlftp.mlit.go.jp/ksj/',
};

const NO_LANDMARKS: MapLandmark[] = [];
const landmarkCache = new WeakMap<ExplorePrefectureDetail, MapLandmark[]>();

function toLandmark(s: ExploreSpot): MapLandmark {
  const lesson = s.lesson;
  return {
    spotId: s.id,
    pictogram: { id: s.iconId, nameJp: s.nameJp, nameVi: s.nameVi, kind: PICTOGRAMS[s.iconId]?.kind ?? 'landmark' },
    xy: projectLonLat(s.latitude, s.longitude),
    kana: s.nameKana ?? undefined,
    phrase:
      lesson && lesson.sentence.length
        ? {
            s: lesson.sentence.map((seg) => (seg.reading ? ([seg.text, seg.reading] as [string, string]) : seg.text)),
            vi: lesson.meaning,
            lv: lesson.jlptLevel as LearnLevel,
            min: lesson.estimatedMinutes,
          }
        : undefined,
  };
}

/**
 * Các mốc học đang dùng của tỉnh, theo thứ tự API trả về. Chưa tải xong (hoặc tỉnh đóng) thì rỗng;
 * cùng một lần tải luôn trả cùng một mảng để các phép tính phía sau (lộ trình, nhóm ghim) nhớ được kết quả.
 */
export function prefectureLandmarks(prefId: number): MapLandmark[] {
  const detail = cachedPrefecture(prefId);
  if (!detail) return NO_LANDMARKS;
  let list = landmarkCache.get(detail);
  if (!list) {
    list = detail.spots.map(toLandmark);
    landmarkCache.set(detail, list);
  }
  return list;
}

/** Đặc sản của tỉnh (biểu tượng không có vị trí trên bản đồ) */
export function prefectureFoods(prefId: number): Pictogram[] {
  return (PREFECTURE_PICTOGRAMS[prefId] ?? []).map((id) => PICTOGRAMS[id]).filter((p) => p.kind === 'food');
}

const cityCache = new Map<number, MapCity[]>();

export function prefectureCities(prefId: number): MapCity[] {
  let list = cityCache.get(prefId);
  if (!list) {
    list = (PREFECTURE_CITIES[prefId] ?? []).map((c) => ({ ...c, xy: projectLonLat(...c.pos) }));
    cityCache.set(prefId, list);
  }
  return list;
}

const municipalityCache = new Map<number, Promise<Municipality[]>>();

function loadMunicipalities(prefId: number): Promise<Municipality[]> {
  let p = municipalityCache.get(prefId);
  if (!p) {
    p = fetch(`${import.meta.env.BASE_URL}japan-detail/${prefId}.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: { municipalities: Municipality[] }) => data.municipalities)
      .catch((err) => {
        // Cho phép thử lại ở lần mở sau; bản đồ vẫn dùng được khi thiếu ranh giới thành phố
        municipalityCache.delete(prefId);
        console.error('Không tải được ranh giới thành phố/quận:', err);
        return [];
      });
    municipalityCache.set(prefId, p);
  }
  return p;
}

/** Dữ liệu chi tiết đã dựng sẵn của một tỉnh: thành phố/quận, toàn bộ hình (gộp) và đường bao ngoài */
export interface PrefectureDetail {
  id: number;
  municipalities: Municipality[];
  /** Mọi thành phố/quận gộp thành một path (tô nền, bóng đổ) */
  allD: string;
  /** Đường bao ngoài của tỉnh (bờ biển + ranh giới với tỉnh khác), dựng từ ranh giới thành phố */
  outlineD: string;
  /** Ranh giới các thành phố/thị trấn thường gộp một path (viền mờ) */
  districtD: string;
  /** Ranh giới các quận của thành phố chỉ định (viền nhạt hơn) */
  cityDistrictD: string;
  /** Tâm và cỡ của từng quận/thành phố để đặt tên */
  districts: DistrictLabel[];
}

/** Điểm đặt tên một quận/thành phố: tâm vòng lớn nhất và hộp bao của vòng đó (đơn vị bản đồ) */
export interface DistrictLabel {
  code: string;
  name: string;
  cx: number;
  cy: number;
  /** Rộng/cao hộp bao của vòng lớn nhất */
  bw: number;
  bh: number;
}

/** Vòng lớn nhất (theo diện tích) của một path nhiều vòng "Mx yLx y...", trả về tâm theo diện tích và hộp bao */
function largestRing(d: string): { cx: number; cy: number; bw: number; bh: number } | null {
  let best: { cx: number; cy: number; bw: number; bh: number; area: number } | null = null;
  for (const sub of d.split('M')) {
    if (!sub) continue;
    const pts = sub
      .replace(/Z/g, '')
      .split('L')
      .map((t) => t.trim().split(' ').map(Number))
      .filter((p) => p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]));
    if (pts.length < 3) continue;
    let a = 0;
    let cx = 0;
    let cy = 0;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [x0, y0] = pts[j];
      const [x1, y1] = pts[i];
      const f = x0 * y1 - x1 * y0;
      a += f;
      cx += (x0 + x1) * f;
      cy += (y0 + y1) * f;
      minX = Math.min(minX, x1);
      minY = Math.min(minY, y1);
      maxX = Math.max(maxX, x1);
      maxY = Math.max(maxY, y1);
    }
    const area = Math.abs(a / 2);
    if (!area || (best && area <= best.area)) continue;
    best = { cx: cx / (3 * a), cy: cy / (3 * a), bw: maxX - minX, bh: maxY - minY, area };
  }
  return best;
}

function buildDistrictLabels(munis: Municipality[]): DistrictLabel[] {
  const out: DistrictLabel[] = [];
  for (const m of munis) {
    const r = largestRing(m.d);
    if (r) out.push({ code: m.code, name: m.name, cx: r.cx, cy: r.cy, bw: r.bw, bh: r.bh });
  }
  return out;
}

/** Đặt chiều vành để đất nằm bên trái hướng đi (ngược chiều kim đồng hồ trên màn hình, trục y hướng xuống) */
function landOnLeft(pts: string[]): string[] {
  const xy = pts.map((p) => p.split(' ').map(Number));
  let s = 0;
  for (let i = 0, j = xy.length - 1; i < xy.length; j = i++) s += xy[j][0] * xy[i][1] - xy[i][0] * xy[j][1];
  return s < 0 ? pts : [...pts].reverse();
}

/**
 * Đường bao ngoài = các cạnh chỉ thuộc về đúng một thành phố/quận (cạnh dùng chung là ranh giới bên trong).
 * Bỏ các đoạn lẻ rất ngắn (do vài đỉnh của hai thành phố kề nhau không trùng khít sau khi đơn giản hoá).
 * Các cạnh giữ chiều "đất bên trái" và được nối thành đường liền, để chấm bọt chạy quanh bờ theo một chiều, không đứt nhịp.
 */
function buildOutline(munis: Municipality[]): string {
  const count = new Map<string, number>();
  /** Cạnh theo chiều đất bên trái, tra theo khoá không hướng */
  const directed = new Map<string, [string, string]>();
  for (const m of munis) {
    for (const sub of m.d.split('M')) {
      if (!sub) continue;
      let pts = sub
        .replace(/Z/g, '')
        .split('L')
        .map((t) => t.trim())
        .filter(Boolean);
      if (pts.length > 1 && pts[0] === pts[pts.length - 1]) pts.pop();
      if (pts.length < 3) continue;
      pts = landOnLeft(pts);
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        const key = a < b ? `${a}|${b}` : `${b}|${a}`;
        count.set(key, (count.get(key) ?? 0) + 1);
        directed.set(key, [a, b]);
      }
    }
  }
  // Gom các cạnh ngoài thành từng chuỗi liền nhau (union-find theo đỉnh) và đo tổng chiều dài mỗi chuỗi
  const parent = new Map<string, string>();
  const length = new Map<string, number>();
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    while (parent.get(x) !== r) {
      const next = parent.get(x)!;
      parent.set(x, r);
      x = next;
    }
    return r;
  };
  const add = (x: string) => {
    if (!parent.has(x)) {
      parent.set(x, x);
      length.set(x, 0);
    }
  };
  const segments: [string, string][] = [];
  for (const [key, n] of count) {
    if (n !== 1) continue;
    const [a, b] = directed.get(key)!;
    add(a);
    add(b);
    const [ax, ay] = a.split(' ').map(Number);
    const [bx, by] = b.split(' ').map(Number);
    let ra = find(a);
    const rb = find(b);
    if (ra !== rb) {
      parent.set(rb, ra);
      length.set(ra, length.get(ra)! + length.get(rb)!);
    }
    ra = find(a);
    length.set(ra, length.get(ra)! + Math.hypot(ax - bx, ay - by));
    segments.push([a, b]);
  }
  const kept = segments.filter(([a]) => length.get(find(a))! > 12);

  // Nối các cạnh nối đuôi nhau thành đường liền: lùi về đầu chuỗi rồi đi tới
  const byStart = new Map<string, number[]>();
  const byEnd = new Map<string, number[]>();
  kept.forEach(([a, b], i) => {
    byStart.set(a, [...(byStart.get(a) ?? []), i]);
    byEnd.set(b, [...(byEnd.get(b) ?? []), i]);
  });
  const used = new Set<number>();
  let d = '';
  for (let i = 0; i < kept.length; i++) {
    if (used.has(i)) continue;
    let head = i;
    for (const seen = new Set([i]); ; ) {
      const prev = (byEnd.get(kept[head][0]) ?? []).find((k) => !used.has(k) && !seen.has(k));
      if (prev == null) break;
      seen.add(prev);
      head = prev;
    }
    used.add(head);
    const pts = [...kept[head]];
    for (;;) {
      const next = (byStart.get(pts[pts.length - 1]) ?? []).find((k) => !used.has(k));
      if (next == null) break;
      used.add(next);
      pts.push(kept[next][1]);
    }
    d += 'M' + pts.join('L');
  }
  return d;
}

const detailCache = new Map<number, Promise<PrefectureDetail>>();

function loadDetail(prefId: number): Promise<PrefectureDetail> {
  let p = detailCache.get(prefId);
  if (!p) {
    p = loadMunicipalities(prefId).then((municipalities) => {
      if (!municipalities.length) detailCache.delete(prefId);
      return {
        id: prefId,
        municipalities,
        allD: municipalities.map((m) => m.d).join(''),
        outlineD: buildOutline(municipalities),
        districtD: municipalities.filter((m) => !m.city).map((m) => m.d).join(''),
        cityDistrictD: municipalities.filter((m) => m.city).map((m) => m.d).join(''),
        districts: buildDistrictLabels(municipalities),
      };
    });
    detailCache.set(prefId, p);
  }
  return p;
}

/** Các tỉnh có khung bao chạm vùng quanh tỉnh đang xem: cũng vẽ chi tiết để bờ biển xung quanh liền mạch */
export function nearbyPrefectureIds(pref: PrefectureShape): number[] {
  const [fx, fy, fw, fh] = pref.focus;
  const m = Math.max(160, fw * 0.9, fh * 0.9);
  const zone = [fx - m, fy - m, fx + fw + m, fy + fh + m];
  return PREFECTURES.filter(
    (q) =>
      q.id !== pref.id && q.bbox[0] < zone[2] && q.bbox[0] + q.bbox[2] > zone[0] && q.bbox[1] < zone[3] && q.bbox[1] + q.bbox[3] > zone[1],
  ).map((q) => q.id);
}

/**
 * Chi tiết của tỉnh đang xem và các tỉnh lân cận (tải song song, có cache). Trả về theo thứ tự tải xong,
 * nên bản đồ hiện dần từng tỉnh; tỉnh chưa tải vẫn dùng hình thô.
 */
export function usePrefectureDetails(prefId: number | null): Map<number, PrefectureDetail> {
  const [state, setState] = useState<{ id: number | null; map: Map<number, PrefectureDetail> }>({ id: null, map: new Map() });
  useEffect(() => {
    if (prefId == null) return;
    const pref = PREFECTURES.find((p) => p.id === prefId);
    if (!pref) return;
    let alive = true;
    setState({ id: prefId, map: new Map() });
    for (const id of [prefId, ...nearbyPrefectureIds(pref)]) {
      loadDetail(id).then((detail) => {
        if (!alive || !detail.municipalities.length) return;
        setState((s) => (s.id === prefId ? { id: prefId, map: new Map(s.map).set(id, detail) } : s));
      });
    }
    return () => {
      alive = false;
    };
  }, [prefId]);
  return prefId != null && state.id === prefId ? state.map : EMPTY_DETAILS;
}
const EMPTY_DETAILS = new Map<number, PrefectureDetail>();
