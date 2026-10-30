import { useEffect, useState } from 'react';
import { PREFECTURES, projectLonLat, type PrefectureShape } from '../../data/japanMap';
import { PICTOGRAMS, PREFECTURE_PICTOGRAMS, pictogramInfo, type Pictogram } from '../../data/japanPictograms';
import { PREFECTURE_CITIES } from '../../data/japanPlaces';
import type { LearnLevel, Phrase } from '../../data/learnContent';
import type { ExplorePrefectureDetail, ExploreSpot } from '../../types/explore';
import { buildDistrictLabels, buildOutline, type DistrictLabel, type Municipality } from './detailGeometry';
import { cachedPrefecture, loadPrefecture } from './exploreStore';

export type { DistrictLabel, Municipality };

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
    pictogram: { id: s.iconId, nameJp: s.nameJp, nameVi: s.nameVi, kind: pictogramInfo(s.iconId)?.kind ?? 'landmark' },
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

/**
 * Nội dung public/japan-detail/{mã tỉnh}.json. outline/districts do scripts/precompute-prefecture-detail.mjs tính sẵn;
 * file chưa có thì trình duyệt tự tính (chậm, nhưng vẫn đúng).
 */
interface DetailFile {
  municipalities: Municipality[];
  outline?: string;
  districts?: DistrictLabel[];
}

const municipalityCache = new Map<number, Promise<DetailFile>>();

function loadMunicipalities(prefId: number): Promise<DetailFile> {
  let p = municipalityCache.get(prefId);
  if (!p) {
    p = fetch(`${import.meta.env.BASE_URL}japan-detail/${prefId}.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<DetailFile>;
      })
      .catch((err) => {
        // Cho phép thử lại ở lần mở sau; bản đồ vẫn dùng được khi thiếu ranh giới thành phố
        municipalityCache.delete(prefId);
        console.error('Không tải được ranh giới thành phố/quận:', err);
        return { municipalities: [] };
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

const detailCache = new Map<number, Promise<PrefectureDetail>>();

function loadDetail(prefId: number): Promise<PrefectureDetail> {
  let p = detailCache.get(prefId);
  if (!p) {
    p = loadMunicipalities(prefId).then(({ municipalities, outline, districts }) => {
      if (!municipalities.length) detailCache.delete(prefId);
      return {
        id: prefId,
        municipalities,
        allD: municipalities.map((m) => m.d).join(''),
        outlineD: outline ?? buildOutline(municipalities),
        districtD: municipalities.filter((m) => !m.city).map((m) => m.d).join(''),
        cityDistrictD: municipalities.filter((m) => m.city).map((m) => m.d).join(''),
        districts: districts ?? buildDistrictLabels(municipalities),
      };
    });
    detailCache.set(prefId, p);
  }
  return p;
}

/** Các tỉnh có khung bao chạm vùng quanh tỉnh đang xem: cũng vẽ chi tiết để bờ biển xung quanh liền mạch */
/**
 * Chuẩn bị trước cho một tỉnh sắp được bấm (gọi khi rê chuột vào tỉnh): dữ liệu mốc học, ranh giới thành phố của tỉnh
 * và các tỉnh lân cận. Tất cả có cache nên gọi nhiều lần không tải lại; nhờ vậy lúc bay tới tỉnh không còn chờ mạng.
 */
export function prefetchPrefecture(prefId: number) {
  const pref = PREFECTURES.find((p) => p.id === prefId);
  if (!pref) return;
  loadPrefecture(prefId);
  for (const id of [prefId, ...nearbyPrefectureIds(pref)]) loadDetail(id);
}

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
