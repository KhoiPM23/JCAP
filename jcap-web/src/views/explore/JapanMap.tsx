import React, { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  COAST_D,
  HOME_VIEWBOX,
  JAPAN_VIEWBOX,
  LABEL_MIN_PX_PER_UNIT,
  PREFECTURES,
  REGIONS,
  type PrefectureShape,
  type RegionId,
} from '../../data/japanMap';
import { PREFECTURE_PICTOGRAMS, pictogramUrl, type PictogramKind } from '../../data/japanPictograms';
import { useExploreJourney, usePrefectureData } from './exploreStore';
import { REGION_STYLE, SEIGAIHA, T, mix, paperGrainUrl } from './exploreTheme';
import { setFurigana, useFurigana } from './furigana';
import { useSpotProgress } from './learnProgress';
import { STOPS_PER_SPOT, nextSpotIndex, prefectureRoute } from './learnRoute';
import { useFontVersion } from './measureText';
import {
  prefectureLandmarks,
  prefetchPrefecture,
  usePrefectureDetails,
  type MapLandmark,
  type PrefectureDetail,
} from './prefectureDetail';
import { ProvinceLabels } from './ProvinceLabels';
import { PrefectureLabels, type PrefectureLabelItem } from './PrefectureLabelLayer';
import { chipSize, layoutLabels, type Box, type LabelLayout } from './labelLayout';
import { RouteLayer } from './RouteLayer';
import { SpotCard } from './SpotCard';
import { useCanSpeakJa } from './speak';
import { ZONE_ZOOM_STEP, ZoneCircles } from './ZoneCircles';

export { REGION_STYLE };

type ViewBox = [number, number, number, number];

/**
 * Bờ biển kiểu tranh khắc gỗ: các lớp nét vẽ dưới đất, độ dày theo pixel màn hình (non-scaling-stroke).
 * Nét dày nằm một nửa dưới đất nên chỉ phần ngoài khơi lộ ra: dải nước nông, bãi cạn, viền bọt.
 */
const SHORE_PASSES = [
  { stroke: T.sea2, width: 22 },
  { stroke: T.sea3, width: 8 },
  { stroke: T.foam, width: 4 },
] as const;

const ShoreLayer = memo<{ d: string }>(({ d }) => (
  <g pointerEvents="none" aria-hidden="true">
    {SHORE_PASSES.map((s, i) => (
      <path
        key={i}
        d={d}
        fill="none"
        stroke={s.stroke}
        strokeWidth={s.width}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    ))}
  </g>
));


/** Đứng yên bao lâu (ms) sau thao tác cuối thì coi là đã dừng (vẽ lại bản đồ cho nét) */
const MOVING_SETTLE_MS = 200;
/**
 * Khi kéo/phóng, bản đồ không vẽ lại mỗi khung hình: ảnh đã vẽ được dịch/co giãn bằng transform trên GPU, chỉ vẽ
 * lại khi dừng tay, khi co giãn quá RERENDER_SCALE lần (cho khỏi nhoè) hoặc khi sắp lộ mép. Bản đồ được vẽ rộng hơn
 * khung nhìn OVERSCAN_PX mỗi phía để có chỗ dịch.
 */
const OVERSCAN_PX = 240;
const RERENDER_SCALE = 1.3;
/**
 * Khi bay tới khung đích (tỉnh khác, địa điểm khác: ~0.5s, phóng 5-20 lần) chỉ còn đất và nét mảnh trên màn hình
 * (bờ biển và chữ ẩn đến khi tới nơi), co giãn ảnh nhiều hơn không lộ ra nên vẽ lại ít hơn nhiều.
 */
const RERENDER_SCALE_FLYING = 1.8;

const NO_DETAILS = new Map<number, PrefectureDetail>();

/** Khung camera lúc vẽ một lớp <svg> lần gần nhất, kèm cỡ khung chứa lúc đó */
type RenderedView = { vb: ViewBox; w: number; h: number };

/** Đặt viewBox của một lớp <svg> vẽ dư OVERSCAN_PX mỗi phía để khớp camera `vb`, bỏ transform */
function setLayerView(svg: SVGSVGElement | null, vb: ViewBox, w: number) {
  if (!svg || !w) return;
  const o = OVERSCAN_PX / (w / vb[2]);
  svg.setAttribute('viewBox', [vb[0] - o, vb[1] - o, vb[2] + o * 2, vb[3] + o * 2].join(' '));
  svg.style.transform = '';
}

/**
 * Transform đưa ảnh đã vẽ ở khung `from` tới camera `to` (gốc biến đổi = góc khung nhìn),
 * và liệu phần đã vẽ (kể cả phần dư) sau khi biến đổi có còn phủ kín khung nhìn không.
 */
function layerTransform(from: ViewBox, to: ViewBox, cw: number, ch: number) {
  const s = from[2] / to[2];
  const ppu = cw / to[2];
  const tx = (from[0] - to[0]) * ppu;
  const ty = (from[1] - to[1]) * ppu;
  const covers =
    -OVERSCAN_PX * s + tx <= 0 && (cw + OVERSCAN_PX) * s + tx >= cw && -OVERSCAN_PX * s + ty <= 0 && (ch + OVERSCAN_PX) * s + ty >= ch;
  return { s, covers, css: `translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px) scale(${s.toFixed(5)})` };
}

/** Ô hoa văn sóng gốc (px) ở mức thu nhỏ nhất */
const SEA_TILE_PX = 56;
/**
 * Hoa văn sóng chỉ được vẽ lại (raster) khi cỡ ô đổi qua mỗi 1/4 quãng tám; giữa hai mức, lớp sóng được dịch và
 * co giãn bằng transform trên GPU. Kéo bản đồ vì thế không vẽ lại hai lớp sóng phủ kín màn hình ở mỗi khung hình.
 */
const SEA_RASTER_STEPS = 4;
const SEA_MIN_SCALE = 2 ** (-0.5 / SEA_RASTER_STEPS);
/** Hai cỡ hoa văn chỉ hoà vào nhau ở đoạn cuối mỗi quãng tám; phần còn lại chỉ một lớp sóng */
const SEA_FADE_FROM = 0.6;
const mod = (a: number, n: number) => ((a % n) + n) % n;

const VIGNETTE = 'radial-gradient(130% 100% at 50% 40%, transparent 50%, rgba(8,20,44,.38))';

export const REGION_NAME: Record<RegionId, string> = Object.fromEntries(
  REGIONS.map((r) => [r.id, r.nameVi]),
) as Record<RegionId, string>;

export const PREFECTURE_BY_ID = new Map(PREFECTURES.map((p) => [p.id, p]));

// Thu nhỏ nhanh hơn phóng to (~70%) để thao tác "quay lại" có cảm giác nhạy
const ZOOM_IN_MS = 650;
const ZOOM_OUT_MS = 450;
const BUTTON_ZOOM_MS = 250;
/**
 * Con lăn chuột có nấc (mỗi nấc ~14%): không nhảy ngay mà trượt tới mức zoom đích, hằng số thời gian này (ms).
 * Nhảy cả bậc trong một khung hình rồi đứng yên chờ nấc sau làm mắt thấy giật dù máy chạy đủ 60 khung hình/giây.
 */
const WHEEL_SMOOTH_MS = 90;
/** Sự kiện con lăn có |deltaY| từ mức này (px) coi là một nấc chuột; touchpad gửi nhiều bước nhỏ hơn và đã mượt sẵn */
const WHEEL_NOTCH_PX = 40;
/** Bán kính vùng bấm của ghim (px): đường kính 44px, đủ cho ngón tay */
const PIN_HIT_RADIUS_PX = 22;
/** Bán kính ghim địa danh nhìn thấy (px) và cỡ biểu tượng bên trong */
const PIN_RADIUS_PX = 19;
const PIN_ICON_PX = 24;
/** Khoảng cách từ tâm ghim tới nhãn tên bên cạnh (px) */
const PIN_LABEL_GAP_PX = 25;
/** Khi bay tới một địa điểm, ghim nằm thấp hơn tâm vùng trống chừng này (px) để thẻ nổi có chỗ phía trên */
const SPOT_PIN_DROP_PX = 46;
const SPOT_PIN_DROP_MOBILE_PX = 90;
/** Hai ghim gần nhau hơn khoảng này (px) thì gộp thành một nhóm */
const CLUSTER_PX = 46;
/** Giới hạn phóng to tối đa: số px màn hình trên một đơn vị bản đồ (~1 độ = 100 đơn vị) */
const MAX_PX_PER_UNIT = 60;
/** Nhãn to tối đa bao nhiêu lần so với cỡ gốc (tỉnh: chữ 12px -> ~29px, biểu tượng 22px -> ~53px) */
const PREF_LABEL_MAX_SCALE = 2.4;
const REGION_LABEL_MAX_SCALE = 1.25;
/**
 * Màn hẹp: ô chữ dọc tên vùng nhỏ hơn (chữ Hán 11.5px). Ở mức zoom ban đầu chỉ đủ chỗ cho ô chữ, nên tên Latin
 * hiện sau, khi phóng tới ngưỡng regionNarrow (cả hai ngưỡng tính sẵn để 8 nhãn không chồng nhau).
 */
const NARROW_PX = 760;
/** Di chuột quá ngưỡng này (px) thì coi là kéo bản đồ chứ không phải bấm */
const DRAG_THRESHOLD_PX = 6;
const BUTTON_ZOOM_STEP = 1.6;
const KEY_PAN_PX = 120;

/**
 * Tính viewBox sao cho vùng `target` nằm gọn trong phần khung còn trống
 * (trừ phần bị panel che ở bên phải/dưới), giữ đúng tỉ lệ khung chứa.
 */
function fitViewBox(target: ViewBox, cw: number, ch: number, reserveRight: number, reserveBottom: number): ViewBox {
  const [bx, by, bw, bh] = target;
  // Màn hẹp thì lề nhỏ hơn để bản đồ được to nhất có thể
  const pad = cw < 640 ? 12 : 32;
  const availW = Math.max(cw - reserveRight - pad * 2, 80);
  const availH = Math.max(ch - reserveBottom - pad * 2, 80);
  const scale = Math.min(availW / bw, availH / bh);
  const centerPxX = pad + availW / 2;
  const centerPxY = pad + availH / 2;
  return [bx + bw / 2 - centerPxX / scale, by + bh / 2 - centerPxY / scale, cw / scale, ch / scale];
}

/** viewBox đặt điểm (cx, cy) vào giữa phần khung còn trống (giống fitViewBox) ở mức phóng `ppu` px/đơn vị */
function centerViewBox(cx: number, cy: number, ppu: number, cw: number, ch: number, reserveRight: number, reserveBottom: number): ViewBox {
  const pad = cw < 640 ? 12 : 32;
  const availW = Math.max(cw - reserveRight - pad * 2, 80);
  const availH = Math.max(ch - reserveBottom - pad * 2, 80);
  return [cx - (pad + availW / 2) / ppu, cy - (pad + availH / 2) / ppu, cw / ppu, ch / ppu];
}

/** Khung quanh một địa điểm khi phóng vào: tỉ lệ theo cỡ tỉnh, để tỉnh nhỏ hay lớn đều có cảm giác "đến gần" */
function spotBox(pref: PrefectureShape, landmark: MapLandmark): ViewBox {
  const [x, y] = landmark.xy;
  const r = Math.max(Math.max(pref.focus[2], pref.focus[3]) * 0.1, 3);
  return [x - r, y - r, r * 2, r * 2];
}

/** Đa giác đều n cạnh quanh (cx, cy) bán kính r, góc xoay rot (khung ghim di sản) */
const polygonPoints = (cx: number, cy: number, r: number, n: number, rot: number) =>
  Array.from({ length: n }, (_, i) => {
    const a = rot + (i * 2 * Math.PI) / n;
    return `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
  }).join(' ');

/** Viền hoa 12 cánh trong ô 44×44 (khung ghim văn hóa) */
const SCALLOP_44 = (() => {
  const n = 12;
  const r1 = 17.2;
  const r2 = 22.4;
  let d = '';
  for (let i = 0; i <= n; i++) {
    const a = (i * 2 * Math.PI) / n - Math.PI / 2;
    const am = a - Math.PI / n;
    const x = 22 + r1 * Math.cos(a);
    const y = 22 + r1 * Math.sin(a);
    d += i === 0 ? `M${x.toFixed(2)} ${y.toFixed(2)}` : `Q${(22 + r2 * Math.cos(am)).toFixed(2)} ${(22 + r2 * Math.sin(am)).toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  return d + 'Z';
})();

/**
 * Khung ghim theo loại địa danh (ô 44×44, tâm 22,22): địa danh tròn, thiên nhiên vuông bo, di sản bát giác,
 * văn hóa viền hoa. Lớp ngoài tô giấy viền màu vùng, lớp trong là nét mảnh.
 */
const PinFrame: React.FC<{ kind: PictogramKind; fill: string; stroke: string; ring: string; ringOpacity: number }> = ({
  kind,
  fill,
  stroke,
  ring,
  ringOpacity,
}) => {
  const outer = { fill, stroke, strokeWidth: 2 };
  const inner = { fill: 'none', stroke: ring, strokeWidth: 1, opacity: ringOpacity };
  switch (kind) {
    case 'nature':
      return (
        <>
          <rect x={3.5} y={3.5} width={37} height={37} rx={11} {...outer} />
          <rect x={7} y={7} width={30} height={30} rx={8} {...inner} />
        </>
      );
    case 'heritage':
      return (
        <>
          <polygon points={polygonPoints(22, 22, 21, 8, Math.PI / 8)} {...outer} />
          <polygon points={polygonPoints(22, 22, 17, 8, Math.PI / 8)} {...inner} />
        </>
      );
    case 'culture':
      return (
        <>
          <path d={SCALLOP_44} {...outer} />
          <circle cx={22} cy={22} r={14.5} {...inner} />
        </>
      );
    default:
      return (
        <>
          <circle cx={22} cy={22} r={19.5} {...outer} />
          <circle cx={22} cy={22} r={16} {...inner} />
        </>
      );
  }
};

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export interface JapanMapProps {
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  activeSpot: number | null;
  onSpotSelect: (index: number | null) => void;
  /** Số px bị panel che ở cạnh phải / cạnh dưới khi đang xem một tỉnh */
  reserveRight: number;
  reserveBottom: number;
  /** Gọi khi người dùng tự kéo/phóng to bản đồ lần đầu (để ẩn gợi ý thao tác) */
  onInteract?: () => void;
}

export const JapanMap: React.FC<JapanMapProps> = ({
  selectedId,
  onSelect,
  activeSpot,
  onSpotSelect,
  reserveRight,
  reserveBottom,
  onInteract,
}) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // ---- Camera: viewBox hiện tại nằm trong ref (cập nhật DOM ngay), state chỉ đồng bộ mỗi khung hình ----
  const viewRef = useRef<ViewBox | null>(null);
  const [view, setView] = useState<ViewBox | null>(null);
  const syncFrameRef = useRef(0);
  const animFrameRef = useRef(0);
  /** Zoom trượt của con lăn: mức phóng đích (px/đơn vị) và điểm neo dưới con trỏ (px trong khung chứa) */
  const wheelTargetRef = useRef<{ ppu: number; x: number; y: number } | null>(null);
  const wheelFrameRef = useRef(0);
  const cancelWheelZoom = useCallback(() => {
    cancelAnimationFrame(wheelFrameRef.current);
    wheelFrameRef.current = 0;
    wheelTargetRef.current = null;
  }, []);
  const sizeRef = useRef({ w: 0, h: 0 });
  const [size, setSize] = useState({ w: 0, h: 0 });

  const [hoverId, setHoverId] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  /** Các địa danh đang được "xòe" (quá sát nhau, phóng tối đa cũng không tách được) và mức phóng lúc xòe */
  const [expanded, setExpanded] = useState<{ members: number[]; ppu: number } | null>(null);
  /** Nhóm ghim đang được rê chuột/focus (để hiện danh sách các địa điểm bên trong) */
  const [hoverCluster, setHoverCluster] = useState<string | null>(null);
  const loadedDetails = usePrefectureDetails(selectedId);
  // Mốc học của tỉnh đang xem (API); prefectureLandmarks() đọc từ dữ liệu đã tải nên chỉ cần đăng ký để vẽ lại
  usePrefectureData(selectedId);
  const journey = useExploreJourney();
  /** Tỉnh đang đóng (admin chưa mở): vẽ nhạt trên bản đồ toàn quốc; bấm vào chỉ hiện "Sẽ cập nhật trong tương lai" */
  const isClosed = (id: number) => journey.status === 'ok' && !journey.prefecture(id)?.isOpen;
  // Bản đồ chi tiết (hàng trăm ranh giới thành phố) chỉ gắn vào khi camera đã dừng ở tỉnh đang chọn: gắn giữa chuyến
  // bay làm khựng hình, nên trong lúc bay vẫn dùng hình thô rồi chi tiết hiện dần lên khi tới nơi.
  const [detailFor, setDetailFor] = useState<number | null>(null);
  const allDetails = detailFor === selectedId ? loadedDetails : NO_DETAILS;
  // Tới nơi: gắn bản đồ chi tiết theo từng nhịp (mỗi nhịp một khung hình) thay vì một lần - một lần gắn cả tỉnh đang xem,
  // các tỉnh lân cận và mọi nhãn chữ là một tác vụ dài ngay lúc hạ cánh (khựng).
  // Nhịp 1: tỉnh đang xem · 2: thêm tỉnh lân cận · 3: thêm nhãn và thẻ địa điểm.
  const [stage, setStage] = useState<{ id: number | null; n: number }>({ id: null, n: 0 });
  const detailStage = detailFor != null && detailFor === selectedId ? (stage.id === selectedId ? stage.n : 1) : 0;
  useEffect(() => {
    if (detailFor == null || detailFor !== selectedId) return;
    let raf = 0;
    let timer = 0;
    const advance = (n: number) => {
      raf = requestAnimationFrame(() => {
        timer = window.setTimeout(() => {
          setStage({ id: detailFor, n });
          if (n < 3) advance(n + 1);
        });
      });
    };
    advance(2);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, [detailFor, selectedId]);
  const details = useMemo(() => {
    if (detailStage >= 2 || selectedId == null) return allDetails;
    const own = detailStage >= 1 ? allDetails.get(selectedId) : undefined;
    return own ? new Map([[selectedId, own]]) : NO_DETAILS;
  }, [allDetails, detailStage, selectedId]);
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;
  useEffect(() => setExpanded(null), [selectedId]);

  // Chuyến bay dài (~0.5s): trong lúc bay chỉ vẽ đất, còn bờ biển và chữ/ghim chờ tới nơi mới hiện. Cả hai đều rất
  // tốn khi vẽ (nét dày theo pixel, hàng chục nhãn chữ Nhật) mà lúc camera lao đi người dùng cũng không đọc được.
  const bigFlyRef = useRef(false);
  const shoreHiddenRef = useRef(false);
  /** Tỉnh mà camera đã tới nơi gần nhất; khác tỉnh đang chọn nghĩa là đang bay tới tỉnh mới (undefined = chưa biết) */
  const [settledSel, setSettledSel] = useState<number | null | undefined>(undefined);
  /** Đếm số lần camera tới nơi, để effect hiện lại bờ biển */
  const [arrived, setArrived] = useState(0);
  const finishFly = useCallback(() => {
    bigFlyRef.current = false;
    setSettledSel(selectedIdRef.current);
    setArrived((n) => n + 1);
  }, []);
  const prefFlying = settledSel !== undefined && settledSel !== selectedId;

  const selected = selectedId != null ? PREFECTURE_BY_ID.get(selectedId) ?? null : null;
  const onInteractRef = useRef(onInteract);
  onInteractRef.current = onInteract;
  // Đang xem một tỉnh: người dùng không tự phóng to/thu nhỏ được nữa (con lăn, chụm ngón, nút và phím +/-).
  // Vẫn kéo được bản đồ, và các chuyến bay do ứng dụng tự chạy (chọn địa điểm, mở nhóm ghim, "Đưa về khung tỉnh") giữ nguyên.
  const zoomLocked = selected != null;

  // Đứng yên một nhịp ngắn sau khi kéo/cuộn: vẽ lại bản đồ cho nét và nạp chi tiết tỉnh đang xem
  const movingTimerRef = useRef(0);
  const firstCommitRef = useRef(true);

  // Khung camera lúc vẽ bản đồ lần gần nhất (kèm cỡ khung chứa). Nội dung trong <svg> bản đồ tính theo khung này,
  // còn camera thật (viewRef) chỉ được áp bằng transform, nên kéo/phóng không làm vẽ lại bản đồ mỗi khung hình.
  const renderedRef = useRef<RenderedView | null>(null);
  const [renderView, setRenderView] = useState<ViewBox | null>(null);
  // Dải bờ biển nằm ở lớp <svg> riêng, có khung đã vẽ riêng (xem paintShore)
  const shoreSvgRef = useRef<SVGSVGElement>(null);
  const shoreRenderedRef = useRef<RenderedView | null>(null);
  // Lớp tên tỉnh (HTML): đặt theo khung labelVbRef (khung đã vẽ lúc React dựng nhãn), camera chỉ dịch/co giãn bằng transform
  const labelLayerRef = useRef<HTMLDivElement>(null);
  const labelVbRef = useRef<ViewBox | null>(null);
  const placeLabelLayer = useCallback((vb: ViewBox) => {
    const el = labelLayerRef.current;
    const lv = labelVbRef.current;
    const { w, h } = sizeRef.current;
    if (!el || !lv || !w) return;
    el.style.transform = lv === vb ? '' : layerTransform(lv, vb, w, h).css;
  }, []);

  /** Vẽ lại dải bờ biển đúng khung camera `vb` (đang bay thì bỏ qua: lớp này đang ẩn, `force` để hiện lại) */
  const paintShore = useCallback((vb: ViewBox, force = false) => {
    if (bigFlyRef.current && !force) return;
    const { w, h } = sizeRef.current;
    shoreRenderedRef.current = { vb, w, h };
    setLayerView(shoreSvgRef.current, vb, w);
  }, []);

  /** Vẽ lại bản đồ (và dải bờ biển) đúng khung camera `vb`, bỏ transform */
  const paint = useCallback(
    (vb: ViewBox) => {
      const { w, h } = sizeRef.current;
      renderedRef.current = { vb, w, h };
      setLayerView(svgRef.current, vb, w);
      paintShore(vb);
      // Nhãn vẫn đặt theo khung cũ đến khi React dựng lại: giữ khớp bằng transform trong lúc chờ
      placeLabelLayer(vb);
      setRenderView(vb);
    },
    [paintShore, placeLabelLayer],
  );

  /** Đưa camera tới `vb`: dịch/co giãn ảnh đã vẽ nếu còn đủ nét và đủ phủ khung nhìn, không thì vẽ lại */
  const applyCamera = useCallback(
    (vb: ViewBox) => {
      const r = renderedRef.current;
      const { w: cw, h: ch } = sizeRef.current;
      const svg = svgRef.current;
      if (!r || !svg || !cw || r.w !== cw || r.h !== ch) return paint(vb);
      const m = layerTransform(r.vb, vb, cw, ch);
      const maxScale = bigFlyRef.current ? RERENDER_SCALE_FLYING : RERENDER_SCALE;
      if (!m.covers || m.s > maxScale || m.s < 1 / maxScale) return paint(vb);
      svg.style.transform = m.css;
      placeLabelLayer(vb);
      if (bigFlyRef.current) return; // bờ biển đang ẩn, hiện lại (vẽ một lần) khi tới nơi
      // Dải bờ biển co giãn cùng nhịp với bản đồ (nét dày phình/teo theo trong lúc phóng, dừng tay là vẽ lại cho
      // đúng). Vẽ lại dải bờ (nét dày chạy quanh cả nước) ở mỗi khung hình là phần nặng nhất của GPU khi lăn chuột.
      const rs = shoreRenderedRef.current;
      const ms = rs && rs.w === cw && rs.h === ch ? layerTransform(rs.vb, vb, cw, ch) : null;
      if (!ms || !ms.covers || ms.s > maxScale || ms.s < 1 / maxScale) paintShore(vb);
      else if (shoreSvgRef.current) shoreSvgRef.current.style.transform = ms.css;
    },
    [paint, paintShore, placeLabelLayer],
  );

  const commit = useCallback((vb: ViewBox) => {
    viewRef.current = vb;
    if (firstCommitRef.current) {
      firstCommitRef.current = false;
      paint(vb);
      setDetailFor(selectedIdRef.current);
      finishFly();
    } else {
      applyCamera(vb);
      window.clearTimeout(movingTimerRef.current);
      movingTimerRef.current = window.setTimeout(() => {
        setDetailFor(selectedIdRef.current);
        // Dừng tay: vẽ lại cho nét ở đúng khung đang nhìn
        if (viewRef.current && renderedRef.current?.vb !== viewRef.current) paint(viewRef.current);
      }, MOVING_SETTLE_MS);
    }
    if (!syncFrameRef.current) {
      syncFrameRef.current = requestAnimationFrame(() => {
        syncFrameRef.current = 0;
        setView(viewRef.current);
      });
    }
  }, [paint, applyCamera, finishFly]);

  /** Người dùng tự kéo/cuộn giữa chuyến bay: dừng tại chỗ và coi như đã tới (hiện lại nhãn, bờ biển) */
  const stopAnimation = useCallback(() => {
    const running = animFrameRef.current;
    cancelAnimationFrame(running);
    animFrameRef.current = 0;
    if (running || bigFlyRef.current) finishFly();
  }, [finishFly]);

  const animateTo = useCallback(
    (target: ViewBox, duration: number) => {
      // Huỷ chuyến bay đang dở (nếu có) mà không coi là "đã tới": chuyến mới sẽ tự kết thúc
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = 0;
      cancelWheelZoom();
      const from = viewRef.current;
      if (!from || prefersReducedMotion()) {
        commit(target);
        finishFly();
        return;
      }
      if (duration >= ZOOM_OUT_MS) {
        bigFlyRef.current = true;
        shoreHiddenRef.current = true;
        if (shoreSvgRef.current) shoreSvgRef.current.style.visibility = 'hidden';
      }
      const [fx, fy, fw, fh] = from;
      const [tx, ty, tw, th] = target;
      const fcx = fx + fw / 2;
      const fcy = fy + fh / 2;
      const tcx = tx + tw / 2;
      const tcy = ty + th / 2;
      const start = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        const e = easeInOutCubic(t);
        // Kích thước nội suy theo cấp số nhân để tốc độ phóng to đều mắt
        const w = fw * Math.pow(tw / fw, e);
        const h = fh * Math.pow(th / fh, e);
        commit([fcx + (tcx - fcx) * e - w / 2, fcy + (tcy - fcy) * e - h / 2, w, h]);
        if (t < 1) animFrameRef.current = requestAnimationFrame(step);
        else {
          animFrameRef.current = 0;
          finishFly();
        }
      };
      animFrameRef.current = requestAnimationFrame(step);
    },
    [commit, finishFly, cancelWheelZoom],
  );

  // Tới nơi: hiện lại bờ biển, vẽ một lần ở đúng khung đang nhìn (tỉnh thì chờ có bản đồ chi tiết để khỏi vẽ hai lần)
  useEffect(() => {
    if (!shoreHiddenRef.current || bigFlyRef.current) return;
    if (selectedId != null && detailFor !== selectedId) return;
    shoreHiddenRef.current = false;
    const el = shoreSvgRef.current;
    const vb = viewRef.current;
    if (!el || !vb) return;
    paintShore(vb, true);
    el.style.visibility = '';
    if (!prefersReducedMotion()) el.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 280, easing: 'ease-out' });
  }, [arrived, detailFor, selectedId, paintShore]);

  // Theo dõi kích thước khung chứa
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ w: Math.round(width), h: Math.round(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fitBottom = reserveBottom;

  /** Khung đích theo lựa chọn hiện tại: toàn quốc / một tỉnh / một địa điểm */
  const target = useMemo<ViewBox | null>(() => {
    if (!size.w || !size.h) return null;
    // Chưa chọn tỉnh: khung các đảo chính; Okinawa nằm đúng vị trí bên dưới, kéo xuống để tới
    if (!selected) return fitViewBox(HOME_VIEWBOX, size.w, size.h, 0, 0);
    const landmark = activeSpot != null ? prefectureLandmarks(selected.id)[activeSpot] : undefined;
    const box = landmark ? spotBox(selected, landmark) : selected.focus;
    const vb = fitViewBox(box, size.w, size.h, reserveRight, fitBottom);
    if (!landmark) return vb;
    // Ghim thấp hơn tâm vùng trống (điện thoại có ngăn kéo thì thấp hơn nữa) để thẻ nổi có chỗ phía trên
    const drop = ((reserveBottom > 0 ? SPOT_PIN_DROP_MOBILE_PX : SPOT_PIN_DROP_PX) * vb[2]) / size.w;
    return [vb[0], vb[1] - drop, vb[2], vb[3]];
  }, [selected, activeSpot, size.w, size.h, reserveRight, fitBottom]);
  const targetKey = `${selectedId}:${activeSpot}:${reserveRight}:${reserveBottom}`;

  // Đổi lựa chọn -> bay tới khung đích; chỉ đổi kích thước -> giữ nguyên tâm và mức phóng to
  const prevRef = useRef<{ key: string; w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    if (!target) return;
    const prev = prevRef.current;
    prevRef.current = { key: targetKey, w: size.w, h: size.h };
    sizeRef.current = { w: size.w, h: size.h };
    const current = viewRef.current;
    if (!prev || !current) {
      commit(target);
      return;
    }
    if (prev.key !== targetKey) {
      animateTo(target, target[2] > current[2] ? ZOOM_OUT_MS : ZOOM_IN_MS);
      return;
    }
    if (prev.w !== size.w || prev.h !== size.h) {
      if (animFrameRef.current) {
        animateTo(target, ZOOM_IN_MS);
        return;
      }
      const [x, y, w, h] = current;
      const ppu = prev.w / w;
      const nw = size.w / ppu;
      const nh = size.h / ppu;
      commit([x + w / 2 - nw / 2, y + h / 2 - nh / 2, nw, nh]);
    }
  }, [target, targetKey, size.w, size.h, commit, animateTo]);

  useEffect(
    () => () => {
      cancelAnimationFrame(animFrameRef.current);
      cancelAnimationFrame(syncFrameRef.current);
      window.clearTimeout(movingTimerRef.current);
    },
    [],
  );

  // ---- Kéo / phóng to tự do ----

  /**
   * Giữ mức phóng to trong giới hạn và giới hạn vùng kéo:
   * - nhỏ nhất (vừa khít cả nước Nhật): khóa cứng ở giữa, không kéo trôi được;
   * - từ khung ban đầu trở lên: tâm khung nhìn được đi khắp nước Nhật (kéo xuống tới Okinawa);
   * - ở giữa hai mức: vùng kéo nới dần theo mức phóng to, để không có cú giật khi đổi mức.
   */
  const clampView = useCallback((vb: ViewBox): ViewBox => {
    const { w: cw, h: ch } = sizeRef.current;
    if (!cw || !ch) return vb;
    const [x, y, w] = vb;
    const full = fitViewBox(JAPAN_VIEWBOX, cw, ch, 0, 0);
    const minPpu = cw / full[2];
    const homePpu = cw / fitViewBox(HOME_VIEWBOX, cw, ch, 0, 0)[2];
    const ppu = Math.min(Math.max(cw / w, minPpu), MAX_PX_PER_UNIT);
    const nw = cw / ppu;
    const nh = ch / ppu;

    const freedom = homePpu > minPpu ? Math.min(Math.max((ppu - minPpu) / (homePpu - minPpu), 0), 1) : 1;
    const ax = full[0] + full[2] / 2; // tâm khung nhỏ nhất = tâm nước Nhật
    const ay = full[1] + full[3] / 2;
    const [jx, jy, jw, jh] = JAPAN_VIEWBOX;
    const cx = Math.min(Math.max(x + w / 2, ax + (jx - ax) * freedom), ax + (jx + jw - ax) * freedom);
    const cy = Math.min(Math.max(y + vb[3] / 2, ay + (jy - ay) * freedom), ay + (jy + jh - ay) * freedom);
    return [cx - nw / 2, cy - nh / 2, nw, nh];
  }, []);

  const panBy = useCallback(
    (dxPx: number, dyPx: number) => {
      const vb = viewRef.current;
      const cw = sizeRef.current.w;
      if (!vb || !cw) return;
      const ppu = cw / vb[2];
      commit(clampView([vb[0] - dxPx / ppu, vb[1] - dyPx / ppu, vb[2], vb[3]]));
    },
    [commit, clampView],
  );

  /** Phóng to/thu nhỏ quanh một điểm trên màn hình (px trong khung chứa), điểm đó đứng yên dưới con trỏ */
  const zoomAt = useCallback(
    (px: number, py: number, factor: number, animated = false) => {
      const vb = viewRef.current;
      const { w: cw, h: ch } = sizeRef.current;
      if (!vb || !cw) return;
      const ppu = cw / vb[2];
      const wx = vb[0] + px / ppu;
      const wy = vb[1] + py / ppu;
      const nppu = ppu * factor;
      const next = clampView([wx - px / nppu, wy - py / nppu, cw / nppu, ch / nppu]);
      if (animated) animateTo(next, BUTTON_ZOOM_MS);
      else commit(next);
    },
    [commit, clampView, animateTo],
  );

  const markInteracted = useCallback(() => {
    onInteractRef.current?.();
  }, []);

  // Con lăn chuột / pinch trên touchpad (ctrlKey). Cần listener non-passive để chặn cuộn trang.
  // Gắn vào khung bao ngoài (không phải <svg>) để cuộn trên ghim ở lớp phủ cũng phóng to được.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    // Trượt dần tới mức zoom đích: mỗi khung hình đi một phần quãng còn lại (theo log), neo điểm dưới con trỏ
    let last = 0;
    const slide = (now: number) => {
      const target = wheelTargetRef.current;
      const vb = viewRef.current;
      const cw = sizeRef.current.w;
      if (!target || !vb || !cw) {
        wheelFrameRef.current = 0;
        return;
      }
      const dt = last ? Math.min(now - last, 64) : 16;
      last = now;
      const ppu = cw / vb[2];
      const remaining = Math.log(target.ppu / ppu);
      const near = Math.abs(remaining) < 0.003;
      zoomAt(target.x, target.y, Math.exp(near ? remaining : remaining * (1 - Math.exp(-dt / WHEEL_SMOOTH_MS))));
      const after = viewRef.current ? cw / viewRef.current[2] : ppu;
      // Tới nơi, hoặc chạm giới hạn phóng (mức zoom không đổi nữa): dừng
      if (near || Math.abs(Math.log(after / ppu)) < 1e-6) {
        wheelTargetRef.current = null;
        wheelFrameRef.current = 0;
        return;
      }
      wheelFrameRef.current = requestAnimationFrame(slide);
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault(); // luôn chặn cuộn trang; khi khoá zoom thì bỏ qua hẳn, không làm gián đoạn chuyến bay đang chạy
      if (zoomLocked) return;
      stopAnimation();
      markInteracted();
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
      const speed = e.ctrlKey ? 0.01 : 0.0015;
      const rect = wrap.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const factor = Math.exp(-e.deltaY * unit * speed);
      // Touchpad (bước nhỏ, chụm ngón = ctrlKey) đã mượt sẵn: phản hồi ngay, không thêm độ trễ
      const notch = !e.ctrlKey && (e.deltaMode !== 0 || Math.abs(e.deltaY) >= WHEEL_NOTCH_PX);
      const vb = viewRef.current;
      const { w: cw, h: ch } = sizeRef.current;
      if (!notch || prefersReducedMotion() || !vb || !cw) {
        cancelWheelZoom();
        zoomAt(x, y, factor);
        return;
      }
      // Chuột có nấc: cộng dồn vào mức đích (lăn tiếp khi đang trượt vẫn liền mạch), giới hạn trong khoảng phóng được
      const minPpu = cw / fitViewBox(JAPAN_VIEWBOX, cw, ch, 0, 0)[2];
      const from = wheelTargetRef.current?.ppu ?? cw / vb[2];
      wheelTargetRef.current = { ppu: Math.min(Math.max(from * factor, minPpu), MAX_PX_PER_UNIT), x, y };
      if (!wheelFrameRef.current) {
        last = 0;
        wheelFrameRef.current = requestAnimationFrame(slide);
      }
    };
    wrap.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      wrap.removeEventListener('wheel', onWheel);
      cancelWheelZoom();
    };
  }, [zoomAt, stopAnimation, markInteracted, zoomLocked, cancelWheelZoom]);

  // Kéo bằng chuột/1 ngón, chụm 2 ngón để phóng to
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const gestureRef = useRef<{ startX: number; startY: number; dragging: boolean; dist?: number; mid?: { x: number; y: number } } | null>(null);
  const suppressClickRef = useRef(false);

  // setPointerCapture ném lỗi nếu con trỏ đã không còn hoạt động; mất capture chỉ làm kéo kém mượt, không nên làm hỏng thao tác
  const capturePointer = (pointerId: number) => {
    try {
      wrapRef.current?.setPointerCapture(pointerId);
    } catch {
      /* bỏ qua */
    }
  };

  const localPoint = (e: React.PointerEvent) => {
    const rect = wrapRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const pinchInfo = () => {
    const [a, b] = [...pointersRef.current.values()];
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // Nút điều khiển, đường dẫn ghi nguồn... không bắt đầu kéo bản đồ (ghim địa danh thì vẫn kéo được)
    if ((e.target as Element).closest('[data-map-ui]')) return;
    const p = localPoint(e);
    pointersRef.current.set(e.pointerId, p);
    stopAnimation();
    cancelWheelZoom();
    if (pointersRef.current.size === 1) {
      gestureRef.current = { startX: p.x, startY: p.y, dragging: false };
    } else if (pointersRef.current.size === 2) {
      const { dist, mid } = pinchInfo();
      gestureRef.current = { startX: mid.x, startY: mid.y, dragging: true, dist, mid };
      for (const id of pointersRef.current.keys()) capturePointer(id);
      setDragging(true);
      handleHover(null);
      markInteracted();
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const prev = pointersRef.current.get(e.pointerId);
    const g = gestureRef.current;
    if (!prev || !g) return;
    const p = localPoint(e);
    pointersRef.current.set(e.pointerId, p);

    if (pointersRef.current.size >= 2) {
      const { dist, mid } = pinchInfo();
      if (g.dist && g.mid) {
        if (!zoomLocked) zoomAt(mid.x, mid.y, dist / g.dist);
        panBy(mid.x - g.mid.x, mid.y - g.mid.y);
      }
      g.dist = dist;
      g.mid = mid;
      return;
    }

    if (!g.dragging) {
      if (Math.hypot(p.x - g.startX, p.y - g.startY) < DRAG_THRESHOLD_PX) return;
      g.dragging = true;
      // Chỉ bắt con trỏ khi đã thật sự kéo, để cú bấm thường vẫn tới đúng tỉnh/ghim
      capturePointer(e.pointerId);
      setDragging(true);
      handleHover(null);
      markInteracted();
    }
    panBy(p.x - prev.x, p.y - prev.y);
  };

  const onPointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.delete(e.pointerId)) return;
    const g = gestureRef.current;
    if (pointersRef.current.size === 1 && g) {
      // Nhấc một ngón sau khi chụm: tiếp tục kéo bằng ngón còn lại
      const [rest] = pointersRef.current.values();
      g.dist = undefined;
      g.mid = undefined;
      g.startX = rest.x;
      g.startY = rest.y;
      return;
    }
    if (pointersRef.current.size === 0) {
      if (g?.dragging) {
        // Chặn cú click sinh ra ngay sau khi thả chuột, tránh vô tình chọn tỉnh khi vừa kéo xong
        suppressClickRef.current = true;
        window.setTimeout(() => (suppressClickRef.current = false), 0);
      }
      gestureRef.current = null;
      setDragging(false);
    }
  };

  const onClickCapture = (e: React.MouseEvent) => {
    if (suppressClickRef.current) {
      e.stopPropagation();
      e.preventDefault();
      suppressClickRef.current = false;
    }
  };

  // Nút điều khiển và phím tắt
  const zoomByButton = useCallback(
    (factor: number) => {
      if (zoomLocked) return;
      const { w, h } = sizeRef.current;
      markInteracted();
      zoomAt((w - reserveRight) / 2, (h - reserveBottom) / 2, factor, true);
    },
    [zoomAt, reserveRight, reserveBottom, markInteracted, zoomLocked],
  );
  const recenter = useCallback(() => {
    if (target) animateTo(target, ZOOM_IN_MS);
  }, [target, animateTo]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
      const pans: Record<string, [number, number]> = {
        ArrowLeft: [KEY_PAN_PX, 0],
        ArrowRight: [-KEY_PAN_PX, 0],
        ArrowUp: [0, KEY_PAN_PX],
        ArrowDown: [0, -KEY_PAN_PX],
      };
      if (e.key === '+' || e.key === '=') zoomByButton(BUTTON_ZOOM_STEP);
      else if (e.key === '-' || e.key === '_') zoomByButton(1 / BUTTON_ZOOM_STEP);
      else if (pans[e.key]) {
        e.preventDefault();
        stopAnimation();
        markInteracted();
        panBy(...pans[e.key]);
      } else return;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoomByButton, panBy, stopAnimation, markInteracted]);

  // ---- Hover: làm nổi tỉnh dưới con trỏ (không hiện tooltip) ----
  const draggingRef = useRef(false);
  draggingRef.current = dragging;
  // Dừng chuột/focus trên một tỉnh một nhịp ngắn: chuẩn bị trước dữ liệu, ranh giới và font của tỉnh đó,
  // để khi bấm thì chuyến bay không phải chờ mạng hay dàn lại chữ (lướt chuột qua bản đồ thì không tải gì)
  const prefetchTimerRef = useRef(0);
  const handleHover = useCallback((id: number | null) => {
    if (id != null && draggingRef.current) return;
    setHoverId(id);
    window.clearTimeout(prefetchTimerRef.current);
    if (id != null) prefetchTimerRef.current = window.setTimeout(() => prefetchPrefecture(id), 120);
  }, []);

  const hovered = hoverId != null && !selected ? PREFECTURE_BY_ID.get(hoverId) ?? null : null;

  const [grain, setGrain] = useState<string | null>(null);
  useEffect(() => setGrain(paperGrainUrl()), []);

  // Kích thước cố định theo pixel màn hình, quy đổi ra đơn vị bản đồ theo mức phóng to hiện tại.
  // Lưu ý: filter CSS trên phần tử SVG cũng tính theo đơn vị bản đồ nên phải quy đổi như vậy.
  const pxPerUnit = view && size.w ? size.w / view[2] : 1;
  const px = 1 / pxPerUnit;
  const minPxPerUnit = size.w && size.h ? size.w / fitViewBox(JAPAN_VIEWBOX, size.w, size.h, 0, 0)[2] : 0;
  // Ở mức nhỏ nhất bản đồ bị khóa: không hiện con trỏ "kéo" và làm mờ nút thu nhỏ
  const atMinZoom = pxPerUnit <= minPxPerUnit * 1.001;
  const atMaxZoom = pxPerUnit >= MAX_PX_PER_UNIT * 0.999;
  const reducedMotion = prefersReducedMotion();
  const toScreen = (x: number, y: number) => (view ? { x: (x - view[0]) * pxPerUnit, y: (y - view[1]) * pxPerUnit } : null);
  // Nội dung trong <svg> bản đồ tính theo khung đã vẽ (renderView), không theo camera thật: nhờ vậy lúc kéo/phóng
  // các thuộc tính trong đó đứng yên và trình duyệt chỉ cần dịch/co giãn ảnh cũ. Lớp phủ theo pixel dùng camera thật.
  const rv = renderView ?? view;
  const rPxPerUnit = rv && size.w ? size.w / rv[2] : 1;
  const rpx = 1 / rPxPerUnit;
  const toRendered = (x: number, y: number) => (rv ? { x: (x - rv[0]) * rPxPerUnit, y: (y - rv[1]) * rPxPerUnit } : null);

  // Nhãn theo cấp phóng to, đồng nhất cho mọi vùng/tỉnh: xa thì chưa có nhãn, vừa thì tên 8 vùng,
  // gần thì tên tất cả các tỉnh (ngưỡng được tính sẵn để nhãn không chồng lên nhau)
  const narrow = size.w > 0 && size.w < NARROW_PX;
  const regionMinPpu = narrow ? LABEL_MIN_PX_PER_UNIT.regionNarrowCompact : LABEL_MIN_PX_PER_UNIT.region;
  const showRegionRomaji = !narrow || pxPerUnit >= LABEL_MIN_PX_PER_UNIT.regionNarrow;
  // Cấp nhãn đổi theo khung đã vẽ để tên vùng (lớp phủ) và tên tỉnh (trong bản đồ) đổi cùng lúc
  const labelLevel: 'none' | 'region' | 'prefecture' =
    rPxPerUnit >= LABEL_MIN_PX_PER_UNIT.prefecture ? 'prefecture' : rPxPerUnit >= regionMinPpu ? 'region' : 'none';

  // Nhãn to dần khi phóng to (theo căn bậc hai mức zoom, có giới hạn) để không bị "teo" so với bản đồ.
  // Khoảng cách giữa các nhãn tăng theo đúng mức zoom, nhanh hơn kích thước nhãn, nên vẫn không chồng nhau.
  const labelScale = (minPpu: number, max: number, ppu: number) => Math.min(Math.max(Math.sqrt(ppu / minPpu), 1), max);
  const regionScale = labelScale(regionMinPpu, REGION_LABEL_MAX_SCALE, pxPerUnit);
  // Tên tỉnh (kèm biểu tượng) nằm ở lớp nhãn đi theo bản đồ nên tính theo khung đã vẽ; trong lúc kéo/phóng
  // camera co giãn cả lớp cùng với ảnh bản đồ
  const lpx = rpx * labelScale(LABEL_MIN_PX_PER_UNIT.prefecture, PREF_LABEL_MAX_SCALE, rPxPerUnit);
  const prefLabelScale = lpx * rPxPerUnit;

  // Tên tỉnh: toàn quốc (kèm biểu tượng) hoặc tỉnh lân cận khi đang xem một tỉnh. Tính theo khung đã vẽ nên chỉ đổi
  // khi bản đồ vẽ lại; bỏ các nhãn nằm ngoài vùng đã vẽ (khung nhìn + phần vẽ dư).
  // Tên tỉnh toàn quốc được dựng sẵn từ trước (ẩn) và chỉ bật/tắt khi qua ngưỡng zoom: dựng 47 nhãn ngay lúc vượt
  // ngưỡng tốn một lần tính bố cục lớn đúng giữa lúc đang cuộn
  const mountPrefLabels = !selected && !prefFlying;
  const showPrefLabels = mountPrefLabels && labelLevel === 'prefecture';
  const showNeighborLabels = selected != null && !prefFlying && detailFor === selected.id;
  const prefLabelItems = useMemo<PrefectureLabelItem[]>(() => {
    if (!rv || !size.w || (!mountPrefLabels && !showNeighborLabels)) return [];
    const margin = OVERSCAN_PX + 120;
    const out: PrefectureLabelItem[] = [];
    for (const p of PREFECTURES) {
      if (showNeighborLabels && p.id === selected?.id) continue;
      const x = (p.labelPos[0] - rv[0]) * rPxPerUnit;
      const y = (p.labelPos[1] - rv[1]) * rPxPerUnit;
      if (x < -margin || y < -margin || x > size.w + margin || y > size.h + margin) continue;
      out.push({
        id: p.id,
        x,
        // Mép trên dòng tên Việt: đường chân chữ cũ ở +9 (toàn quốc) hoặc 0 (tỉnh lân cận) đơn vị nhãn
        y: mountPrefLabels ? y - 1.2 * prefLabelScale : y - 11.2,
        nameVi: p.nameVi,
        nameJp: p.nameJp,
        icon: mountPrefLabels ? PREFECTURE_PICTOGRAMS[p.id]?.[0] : undefined,
      });
    }
    return out;
  }, [rv, rPxPerUnit, size.w, size.h, mountPrefLabels, showNeighborLabels, selected?.id, prefLabelScale]);

  // Sau khi React dựng nhãn theo khung mới: ghi nhận khung đó và bỏ transform (hoặc khớp camera nếu đã đi tiếp)
  useLayoutEffect(() => {
    labelVbRef.current = rv;
    const el = labelLayerRef.current;
    const vb = viewRef.current;
    if (!el) return;
    el.style.transform = rv && vb && vb !== rv && size.w ? layerTransform(rv, vb, size.w, size.h).css : '';
  }, [rv, size.w, size.h]);

  const ink = selected ? REGION_STYLE[selected.region].ink : T.ink;
  // Màu nền đất của tỉnh đang xem: màu vùng pha 35% giấy, một màu cho mọi quận
  const landFill = selected ? mix(REGION_STYLE[selected.region].fill, T.paper, 0.35) : T.paper;
  // Cỡ vòng khám phá tính theo độ phóng đã lượng tử hoá (chỉ đổi khi zoom đổi hơn 2%)
  const zonePxQ = Math.pow(ZONE_ZOOM_STEP, -Math.round(Math.log(rPxPerUnit) / Math.log(ZONE_ZOOM_STEP)));
  // Khi xem một tỉnh: tỉnh có dữ liệu chi tiết vẽ bằng ranh giới thành phố thay cho hình thô
  const selectedDetail = selected ? details.get(selected.id) : undefined;
  const neighborDetails = useMemo(
    () => [...details.values()].filter((d) => d.id !== selectedId),
    [details, selectedId],
  );

  // ---- Bản đồ chi tiết của tỉnh đang xem: ranh giới thành phố/quận và địa danh ----
  const landmarks = selected ? prefectureLandmarks(selected.id) : [];
  const activeLandmark = activeSpot != null ? landmarks[activeSpot] : undefined;

  // Gộp các ghim quá gần nhau trên màn hình thành nhóm (tính lại theo mức phóng to hiện tại)
  const clusters: { members: number[]; s: { x: number; y: number } }[] = [];
  if (selected && view) {
    landmarks.forEach((lm, i) => {
      const s = toScreen(...lm.xy)!;
      const c = clusters.find((cl) => Math.hypot(cl.s.x - s.x, cl.s.y - s.y) < CLUSTER_PX);
      if (c) c.members.push(i);
      else clusters.push({ members: [i], s });
    });
  }
  const clusterKey = (members: number[]) => members.join(',');
  /**
   * Nhóm được "xòe" ra: mọi thành viên đều nằm trong tập đã xòe (và chưa thu nhỏ quá xa so với lúc xòe),
   * hoặc nhóm chứa địa điểm đang xem.
   */
  const isSpread = (members: number[]) =>
    members.length > 1 &&
    ((expanded != null && pxPerUnit >= expanded.ppu * 0.6 && members.every((m) => expanded.members.includes(m))) ||
      (activeSpot != null && members.includes(activeSpot)));

  /** Vị trí hiển thị (toạ độ bản đồ) của từng ghim: vị trí thật, hoặc vị trí xòe quanh tâm nhóm */
  const pinPlacements: { index: number; at: [number, number]; spreadFrom?: [number, number] }[] = [];
  for (const c of clusters) {
    if (c.members.length === 1 || isSpread(c.members)) {
      if (c.members.length === 1) {
        pinPlacements.push({ index: c.members[0], at: landmarks[c.members[0]].xy });
        continue;
      }
      const cx = c.members.reduce((s, i) => s + landmarks[i].xy[0], 0) / c.members.length;
      const cy = c.members.reduce((s, i) => s + landmarks[i].xy[1], 0) / c.members.length;
      const radiusPx = Math.max(40, (c.members.length * (PIN_HIT_RADIUS_PX * 2 + 4)) / (2 * Math.PI));
      c.members.forEach((i, k) => {
        const a = -Math.PI / 2 + (2 * Math.PI * k) / c.members.length;
        pinPlacements.push({
          index: i,
          at: [cx + Math.cos(a) * radiusPx * px, cy + Math.sin(a) * radiusPx * px],
          spreadFrom: landmarks[i].xy,
        });
      });
    }
  }
  const bubbles = clusters.filter((c) => c.members.length > 1 && !isSpread(c.members));

  // Ghim đã xòe có thể đè lên ghim/nhóm bên cạnh: đẩy dần chúng ra (tính trên màn hình), ghim khác giữ nguyên
  if (view && pinPlacements.some((p) => p.spreadFrom)) {
    const minGap = PIN_HIT_RADIUS_PX * 2 + 2;
    const pts = pinPlacements.map((p) => ({ ...toScreen(...p.at)!, movable: !!p.spreadFrom }));
    const fixed = bubbles.map((b) => b.s);
    for (let iter = 0; iter < 30; iter++) {
      let moved = false;
      for (let i = 0; i < pts.length; i++) {
        if (!pts[i].movable) continue;
        for (const o of [...pts.filter((_, j) => j !== i), ...fixed]) {
          const dx = pts[i].x - o.x;
          const dy = pts[i].y - o.y;
          const d = Math.hypot(dx, dy) || 0.01;
          if (d >= minGap) continue;
          const push = (minGap - d) / ((o as { movable?: boolean }).movable ? 2 : 1);
          pts[i].x += (dx / d) * push;
          pts[i].y += (dy / d) * push;
          moved = true;
        }
      }
      if (!moved) break;
    }
    pts.forEach((s, i) => {
      if (s.movable) pinPlacements[i].at = [view[0] + s.x * px, view[1] + s.y * px];
    });
  }

  const openCluster = (members: number[]) => {
    const xs = members.map((i) => landmarks[i].xy[0]);
    const ys = members.map((i) => landmarks[i].xy[1]);
    const pad = 1;
    const box: ViewBox = [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) - Math.min(...xs) + pad * 2, Math.max(...ys) - Math.min(...ys) + pad * 2];
    const next = fitViewBox(box, size.w, size.h, reserveRight, fitBottom);
    markInteracted();
    if (size.w / next[2] > MAX_PX_PER_UNIT) {
      // Các địa danh quá sát nhau, phóng tối đa cũng không tách được: bay vào hết mức tại tâm nhóm rồi xòe ra
      const cx = xs.reduce((a, b) => a + b, 0) / xs.length;
      const cy = ys.reduce((a, b) => a + b, 0) / ys.length;
      setExpanded({ members, ppu: MAX_PX_PER_UNIT });
      animateTo(centerViewBox(cx, cy, MAX_PX_PER_UNIT, size.w, size.h, reserveRight, fitBottom), ZOOM_IN_MS);
    } else {
      setExpanded(null);
      animateTo(next, ZOOM_IN_MS);
    }
  };

  // ---- Lộ trình học, tiến độ và nhãn tên (chữ HTML theo pixel màn hình, xếp chống chồng nhau) ----
  const progressOf = useSpotProgress();
  const spotProgress = (i: number) => (selected ? progressOf(landmarks[i].spotId) : 0);
  const spotDone = (i: number) => spotProgress(i) >= STOPS_PER_SPOT;
  const route = selected ? prefectureRoute(selected.id) : null;
  const nextIdx = selected ? nextSpotIndex(selected.id, spotProgress) : null;
  const [furigana] = useFurigana();
  const canSpeak = useCanSpeakJa();
  useFontVersion(); // phông mới tải xong -> số đo chữ đổi -> xếp lại nhãn
  const showLabels = !!selected && !!view && !prefFlying && detailStage >= 3;

  const pinScreen = new Map<number, { x: number; y: number }>();
  let labelLayout: LabelLayout | null = null;
  const nextBubble = nextIdx != null ? bubbles.find((b) => b.members.includes(nextIdx)) : undefined;
  const nextActive = nextIdx != null && (nextIdx === activeSpot || (nextBubble != null && activeSpot != null && nextBubble.members.includes(activeSpot)));
  if (showLabels && view) {
    for (const p of pinPlacements) pinScreen.set(p.index, toScreen(...p.at)!);
    const nextAnchor = nextIdx == null || nextActive ? null : (pinScreen.get(nextIdx) ?? nextBubble?.s ?? null);
    // Ưu tiên chỗ cho nhãn: địa điểm "Tiếp theo" trước, rồi theo thứ tự lộ trình
    const stopOf = (i: number) => (route ? route.stop[i] : i + 1);
    const ordered = [...pinPlacements].sort((a, b) =>
      a.index === nextIdx ? -1 : b.index === nextIdx ? 1 : stopOf(a.index) - stopOf(b.index),
    );
    labelLayout = layoutLabels({
      furigana,
      viewport: { w: size.w, h: size.h },
      pins: ordered.map((p) => {
        const lm = landmarks[p.index];
        const s = pinScreen.get(p.index)!;
        return {
          index: p.index,
          x: s.x,
          y: s.y,
          active: p.index === activeSpot,
          label: { jp: lm.pictogram.nameJp, kana: lm.kana, vi: lm.pictogram.nameVi },
        };
      }),
      bubbles: bubbles.map((b) => b.s),
      // Chip "Tiếp theo" gắn lên ghim đó; nếu ghim đang nằm trong một nhóm thì gắn lên nhóm
      next: nextAnchor,
      chip: chipSize('Tiếp theo'),
      pinRadius: PIN_HIT_RADIUS_PX,
      pinLabelGap: PIN_LABEL_GAP_PX,
    });
  }

  const activePos = activeLandmark
    ? toScreen(...(pinPlacements.find((p) => p.index === activeSpot)?.at ?? activeLandmark.xy))
    : null;

  const shorePaths = selected && details.size ? [...details.values()].map((d) => d.outlineD) : [COAST_D];

  // Sóng neo theo bản đồ: hoa văn 青海波 phóng to/thu nhỏ cùng đất và bám vào gốc toạ độ bản đồ, nên không trôi lệch.
  // Mỗi khi ô sóng to gấp đôi, hai lớp hoa văn (ô to và ô bằng nửa) hoà dần vào nhau ở đoạn cuối quãng tám
  // để quay về cỡ gốc liền mạch.
  const seaOctave = Math.log2(Math.max(minPxPerUnit > 0 ? pxPerUnit / minPxPerUnit : 1, 1));
  const seaFrac = seaOctave - Math.floor(seaOctave);
  const seaBig = SEA_TILE_PX * 2 ** seaFrac;
  const seaOriginX = view ? -view[0] * pxPerUnit : 0;
  const seaOriginY = view ? -view[1] * pxPerUnit : 0;
  const seaFade = Math.min(Math.max((seaFrac - SEA_FADE_FROM) / (1 - SEA_FADE_FROM), 0), 1);
  const seaLayers = [
    { tile: seaBig, opacity: 1 - seaFade },
    { tile: seaBig / 2, opacity: seaFade },
  ]
    .filter((l) => l.opacity > 0.02)
    .map((l) => {
      const base = SEA_TILE_PX * 2 ** (Math.round(Math.log2(l.tile / SEA_TILE_PX) * SEA_RASTER_STEPS) / SEA_RASTER_STEPS);
      return {
        ...l,
        base,
        scale: l.tile / base,
        // Đủ phủ khung nhìn cả khi co nhỏ nhất trong mức hiện tại, cộng một ô dư mỗi phía để dịch
        cols: Math.ceil(size.w / (base * SEA_MIN_SCALE)) + 2,
        rows: Math.ceil(size.h / ((base / 2) * SEA_MIN_SCALE)) + 2,
        dx: mod(seaOriginX, l.tile) - l.tile,
        dy: mod(seaOriginY, l.tile / 2) - l.tile / 2,
      };
    });

  return (
    <div
      ref={wrapRef}
      className="absolute inset-0 overflow-hidden select-none"
      style={{
        touchAction: 'none',
        cursor: dragging ? 'grabbing' : atMinZoom ? 'default' : 'grab',
        backgroundColor: T.sea,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onClickCapture={onClickCapture}
    >
      {seaLayers.map((l) => (
        <div
          key={l.tile === seaBig ? 'big' : 'half'}
          className="pointer-events-none absolute left-0 top-0"
          aria-hidden="true"
          style={{
            width: l.cols * l.base,
            height: (l.rows * l.base) / 2,
            backgroundImage: SEIGAIHA,
            backgroundSize: `${l.base.toFixed(2)}px ${(l.base / 2).toFixed(2)}px`,
            transformOrigin: '0 0',
            transform: `translate3d(${l.dx.toFixed(1)}px, ${l.dy.toFixed(1)}px, 0) scale(${l.scale.toFixed(4)})`,
            willChange: 'transform',
            opacity: l.opacity,
          }}
        />
      ))}
      {/* Bờ biển (dưới đất): toàn quốc dùng hình thô; khi xem tỉnh dùng đường bao chi tiết của tỉnh đó và các tỉnh
          lân cận. Lớp riêng, viewBox do paintShore() đặt, cùng khung vẽ dư với bản đồ. */}
      <svg
        ref={shoreSvgRef}
        viewBox={JAPAN_VIEWBOX.join(' ')}
        width={size.w + OVERSCAN_PX * 2}
        height={size.h + OVERSCAN_PX * 2}
        preserveAspectRatio="xMidYMid meet"
        className="pointer-events-none absolute block"
        style={{
          left: -OVERSCAN_PX,
          top: -OVERSCAN_PX,
          transformOrigin: `${OVERSCAN_PX}px ${OVERSCAN_PX}px`,
          willChange: 'transform',
        }}
        aria-hidden="true"
      >
        {shorePaths.map((d, i) => (
          <ShoreLayer key={i} d={d} />
        ))}
      </svg>
      <svg
        ref={svgRef}
        // viewBox do paint() đặt; phần vẽ dư OVERSCAN_PX mỗi phía nằm ngoài khung nhìn (bị khung bao cắt đi)
        viewBox={JAPAN_VIEWBOX.join(' ')}
        width={size.w + OVERSCAN_PX * 2}
        height={size.h + OVERSCAN_PX * 2}
        preserveAspectRatio="xMidYMid meet"
        style={{
          left: -OVERSCAN_PX,
          top: -OVERSCAN_PX,
          transformOrigin: `${OVERSCAN_PX}px ${OVERSCAN_PX}px`,
          willChange: 'transform',
        }}
        role="group"
        aria-label={
          selected
            ? `Bản đồ tỉnh ${selected.nameVi}. Kéo để di chuyển, cuộn hoặc phím cộng trừ để phóng to.`
            : 'Bản đồ Nhật Bản. Kéo để di chuyển, cuộn hoặc phím cộng trừ để phóng to.'
        }
        className="absolute block"
      >
        {/* Nền biển: bấm (không kéo) để lùi một cấp */}
        <rect
          x={-1e5}
          y={-1e5}
          width={2e5}
          height={2e5}
          fill="transparent"
          onClick={() => {
            if (activeSpot != null) onSpotSelect(null);
            else if (selected) onSelect(null);
          }}
        />

        <g>
          {/* Thứ tự 47 tỉnh không đổi khi chọn tỉnh: dời phần tử tỉnh vừa bấm (đang có focus) xuống cuối làm nó mất
              focus giữa lượt cập nhật, React trả focus lại và ép tính lại bố cục cả bản đồ ngay trước khi bay (khựng) */}
          {PREFECTURES.map((p) => (
            <PrefecturePath
              key={p.id}
              shape={p}
              mode={selected ? (p.id === selected.id ? 'selected' : 'dim') : 'idle'}
              hidden={details.has(p.id)}
              closed={!selected && isClosed(p.id)}
              onHover={handleHover}
              onSelect={onSelect}
            />
          ))}
          {/* Viền tỉnh đang chọn vẽ đè lên trên để không bị các tỉnh bên cạnh che (thay cho việc dời tỉnh xuống cuối) */}
          {selected && !details.has(selected.id) && (
            <path
              d={selected.d}
              fillRule="evenodd"
              fill="none"
              stroke={REGION_STYLE[selected.region].ink}
              strokeWidth={2.5}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
              aria-hidden="true"
            />
          )}
        </g>

        {/* Tỉnh lân cận: vẽ lại bằng ranh giới thành phố, tô màu giấy nhạt, viền mực mảnh */}
        {neighborDetails.map((d) => (
          <NeighborDetail key={d.id} detail={d} fill={REGION_STYLE[PREFECTURE_BY_ID.get(d.id)!.region].dim} />
        ))}

        {/* Tỉnh đang xem: bóng in lệch (không blur), viền mực, ô thành phố/quận ba sắc độ */}
        {selected && selectedDetail && (
          <g key={`sel-${selected.id}`} className="jm-fade-quick" onClick={(e) => e.stopPropagation()}>
            <path d={selectedDetail.allD} fill={T.shadow} opacity={0.18} transform={`translate(0 ${10 * rpx})`} pointerEvents="none" />
            <path d={selectedDetail.allD} fill={T.shadow} opacity={0.35} transform={`translate(0 ${3 * rpx})`} pointerEvents="none" />
            <path
              d={selectedDetail.allD}
              fill="none"
              stroke={T.inkLine}
              strokeWidth={3.2}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
            />
            {/* Nền đất một màu (nhận click để bấm vào tỉnh không bị coi là bấm ra biển), ranh giới quận chỉ là nét mờ */}
            <path d={selectedDetail.allD} fill={landFill} />
            <path
              d={selectedDetail.districtD}
              fill="none"
              stroke={T.inkLine}
              strokeOpacity={0.14}
              strokeWidth={0.9}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
            />
            <path
              d={selectedDetail.cityDistrictD}
              fill="none"
              stroke={T.inkLine}
              strokeOpacity={0.1}
              strokeWidth={0.9}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
            />
            <ZoneCircles
              zones={landmarks.map((lm, i) => ({ key: String(lm.spotId), x: lm.xy[0], y: lm.xy[1], done: spotDone(i) }))}
              clipId={`jm-zone-${selected.id}`}
              clipD={selectedDetail.allD}
              color={REGION_STYLE[selected.region].hover}
              pxQ={zonePxQ}
            />
          </g>
        )}

        {/* Rê chuột: tỉnh đổi sang màu đậm hơn, viền màu vùng (vẽ đè để không bị tỉnh bên cạnh che) */}
        {hovered && !dragging && (
          <path
            d={hovered.d}
            fillRule="evenodd"
            fill={isClosed(hovered.id) ? REGION_STYLE[hovered.region].tint : REGION_STYLE[hovered.region].hover}
            stroke={REGION_STYLE[hovered.region].ink}
            strokeWidth={1.6}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        )}

      </svg>

      {/* Tên tỉnh (HTML, xem PrefectureLabelLayer): toàn quốc - biểu tượng, tên Việt, tên Nhật; khi xem một tỉnh -
          tên các tỉnh lân cận nhỏ, nhạt, không biểu tượng để nhường chỗ cho tỉnh đang xem */}
      <div ref={labelLayerRef} className="jm-plabel-layer" aria-hidden="true">
        {mountPrefLabels && (
          <div key="prefecture-labels" className={`jm-plabel-group${showPrefLabels ? ' jm-on' : ''}`}>
            <PrefectureLabels items={prefLabelItems} scale={prefLabelScale} variant="main" iconColor={T.inkLine} />
          </div>
        )}
        {showNeighborLabels && (
          <div key="neighbor-labels" className="jm-label-fade">
            <PrefectureLabels items={prefLabelItems} scale={1} variant="neighbor" iconColor={T.muted} />
          </div>
        )}
      </div>

      {/* Hạt giấy phủ trên mép tối dần như giấy in cũ: gộp một lớp tĩnh, không nhận chuột */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: `${grain ? `url(${grain}) 0 0 / 180px 180px, ` : ''}${VIGNETTE}` }}
        aria-hidden="true"
      />

      {/* Tên vùng: ô giấy khung đôi, chữ Hán in dọc, tên Latin bên dưới */}
      {labelLevel === 'region' && !selected && !prefFlying && view && (
        <div key="region-labels" className="jm-label-fade pointer-events-none absolute inset-0" aria-hidden="true">
          {REGIONS.map((r) => {
            const s = toScreen(...r.labelPos)!;
            return (
              <div
                key={r.id}
                className="jm-rlabel"
                style={{ color: REGION_STYLE[r.id].ink, transform: `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px) translate(-50%, -50%) scale(${regionScale})` }}
              >
                <span className="jm-rk" lang="ja">
                  {r.nameJp}
                </span>
                {showRegionRomaji && <span className="jm-rv">{r.nameVi}</span>}
              </div>
            );
          })}
        </div>
      )}

      {/* Lớp phủ theo pixel màn hình: biểu tượng nhãn tỉnh và ghim địa danh. Ảnh trong SVG bản đồ bị trình
          duyệt bỏ không vẽ khi phóng rất sâu (ảnh chỉ còn < 1 đơn vị bản đồ), nên vẽ ở đây với kích thước px
          cố định, luôn sắc nét. Lớp này không nhận chuột, chỉ ghim/nhóm ghim bật lại pointer-events. */}
      {view && size.w > 0 && (
        <svg width={size.w} height={size.h} className="absolute inset-0 overflow-visible" pointerEvents="none" aria-hidden={!selected}>
          <defs>
            {/* Đổi màu biểu tượng (giữ nguyên hình, chỉ thay màu - đúng điều khoản của bộ icon) */}
            <filter id="jm-ink" colorInterpolationFilters="sRGB">
              <feFlood floodColor={T.inkLine} />
              <feComposite in2="SourceAlpha" operator="in" />
            </filter>
            <filter id="jm-ink-region" colorInterpolationFilters="sRGB">
              <feFlood floodColor={ink} />
              <feComposite in2="SourceAlpha" operator="in" />
            </filter>
            <filter id="jm-ink-paper" colorInterpolationFilters="sRGB">
              <feFlood floodColor={T.paper} />
              <feComposite in2="SourceAlpha" operator="in" />
            </filter>
          </defs>

          {selected && !prefFlying && (
            <g key={selected.id} className="jm-fade-quick" pointerEvents="auto">
              {/* Lộ trình học nối vị trí thật của các địa điểm; chỉ hiện sau khi ghim đã bật ra */}
              {route && (
                <g className="jm-route-in">
                  <RouteLayer
                    points={route.route.map((i) => {
                      const s = toScreen(...landmarks[i].xy)!;
                      return { x: s.x, y: s.y, done: spotDone(i) };
                    })}
                  />
                </g>
              )}

              {/* Nhóm địa danh quá gần nhau: bấm để phóng tới (hoặc xòe ra nếu không thể tách) */}
              {bubbles.map((b) => {
                const { x, y } = b.s;
                const names = b.members.map((i) => landmarks[i].pictogram.nameVi).join(', ');
                const open = () => openCluster(b.members);
                return (
                  <g
                    key={clusterKey(b.members)}
                    className="jm-pin"
                    role="button"
                    tabIndex={0}
                    aria-label={`Nhóm ${b.members.length} địa điểm: ${names}`}
                    style={{ cursor: 'pointer', outline: 'none' }}
                    onPointerEnter={() => !dragging && setHoverCluster(clusterKey(b.members))}
                    onPointerLeave={() => setHoverCluster(null)}
                    onFocus={() => setHoverCluster(clusterKey(b.members))}
                    onBlur={() => setHoverCluster(null)}
                    onClick={(e) => {
                      e.stopPropagation();
                      open();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        open();
                      }
                    }}
                  >
                    <g transform={`translate(${x - 24} ${y - 24})`}>
                      <circle cx={24} cy={24} r={PIN_HIT_RADIUS_PX + 2} fill="transparent" />
                      {nextBubble === b && !nextActive && !reducedMotion && (
                        <circle className="jm-next-ring" cx={24} cy={24} r={20} fill="none" stroke={T.shu} strokeWidth={2} pointerEvents="none" />
                      )}
                      {/* Chồng giấy: số tờ khớp số địa điểm (nhóm 2 = 2 tờ, từ 3 trở lên = 3 tờ), tờ trước tô màu
                          vùng ghi số địa điểm */}
                      <g style={{ filter: 'drop-shadow(0 2px 3px rgba(7,26,68,0.22))' }}>
                        {b.members.length > 2 && <circle cx={30} cy={18} r={16} fill={T.paper} stroke={ink} strokeWidth={1.5} />}
                        <circle cx={27} cy={21} r={16} fill={T.paper} stroke={ink} strokeWidth={1.5} />
                        <circle className="jm-focus-ring" cx={23} cy={25} r={17} fill={ink} stroke={T.paper} strokeWidth={2} />
                      </g>
                      <text x={23} y={30.5} textAnchor="middle" fontSize={15} fontWeight={700} fill={T.paper} pointerEvents="none">
                        {b.members.length}
                      </text>
                    </g>
                  </g>
                );
              })}

              {/* Đường nối từ ghim đã xòe về vị trí thật */}
              {pinPlacements
                .filter((p) => p.spreadFrom)
                .map((p) => {
                  const from = toScreen(...p.spreadFrom!)!;
                  const to = toScreen(...p.at)!;
                  return (
                    <g key={`leg-${p.index}`} pointerEvents="none">
                      <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={T.foam} strokeWidth={1.5} strokeDasharray="3 3" />
                      <circle cx={from.x} cy={from.y} r={3.5} fill={T.foam} />
                    </g>
                  );
                })}

              {/* Ghim địa danh (= địa điểm học): khung theo loại, nền giấy, biểu tượng màu vùng */}
              {pinPlacements.map(({ index, at }) => {
                const { x, y } = toScreen(...at)!;
                const lm = landmarks[index];
                const active = activeSpot === index;
                const toggle = () => onSpotSelect(active ? null : index);
                const stopN = route ? route.stop[index] : null;
                const isNext = index === nextIdx && !active;
                return (
                  <g
                    key={lm.spotId}
                    className="jm-pin"
                    style={{ cursor: 'pointer', outline: 'none' }}
                    role="button"
                    tabIndex={0}
                    aria-label={`${lm.pictogram.nameVi} (${lm.pictogram.nameJp})`}
                    aria-pressed={active}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggle();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggle();
                      }
                    }}
                  >
                    <g transform={`translate(${x - 22} ${y - 22})`}>
                      {/* Vùng bấm trong suốt 44px */}
                      <circle cx={22} cy={22} r={PIN_HIT_RADIUS_PX} fill="transparent" />
                      {active && !reducedMotion && (
                        <circle className="jm-ripple" cx={22} cy={22} r={21} fill="none" stroke={ink} strokeWidth={2} pointerEvents="none" />
                      )}
                      {isNext && !reducedMotion && (
                        <circle className="jm-next-ring" cx={22} cy={22} r={20} fill="none" stroke={T.shu} strokeWidth={2} pointerEvents="none" />
                      )}
                      <g className="jm-pin-body" style={{ transform: active ? 'scale(1.14)' : undefined }}>
                        <g className="jm-focus-ring" style={{ filter: 'drop-shadow(0 2px 3px rgba(7,26,68,0.22))' }}>
                          <PinFrame
                            kind={lm.pictogram.kind}
                            fill={active ? ink : T.paper}
                            stroke={ink}
                            ring={active ? T.paper : ink}
                            ringOpacity={active ? 0.6 : 0.45}
                          />
                        </g>
                        <image
                          href={pictogramUrl(lm.pictogram.id)}
                          x={10}
                          y={10}
                          width={PIN_ICON_PX}
                          height={PIN_ICON_PX}
                          filter={active ? 'url(#jm-ink-paper)' : 'url(#jm-ink-region)'}
                          preserveAspectRatio="xMidYMid meet"
                          pointerEvents="none"
                        />
                        {/* Số thứ tự trên lộ trình: huy hiệu 19px ở góc dưới trái */}
                        {stopN != null && (
                          <g aria-hidden="true" pointerEvents="none">
                            <circle cx={8} cy={36} r={9.5} fill={T.inkLine} stroke={T.paper} strokeWidth={1.5} />
                            <text x={8} y={40} textAnchor="middle" fontSize={11} fontWeight={700} fill={T.paper}>
                              {stopN}
                            </text>
                          </g>
                        )}
                      </g>
                    </g>
                  </g>
                );
              })}
            </g>
          )}
        </svg>
      )}

      {/* Chữ trên bản đồ tỉnh: tên địa điểm, chip "Tiếp theo", tên thành phố/quận (HTML theo pixel màn hình) */}
      {showLabels && labelLayout && (
        <ProvinceLabels
          furigana={furigana}
          ink={ink}
          mapLabelColor={T.mapLabel}
          districtColor={T.ink2}
          chip={labelLayout.chip ? { box: labelLayout.chip.box, text: 'Tiếp theo' } : null}
          pins={pinPlacements.flatMap(({ index }) => {
            const placed = labelLayout!.pins.get(index);
            if (!placed) return [];
            const lm = landmarks[index];
            return [
              {
                index,
                placed,
                jp: lm.pictogram.nameJp,
                kana: lm.kana,
                vi: lm.pictogram.nameVi,
                onSelect: () => onSpotSelect(index),
              },
            ];
          })}
          cluster={(() => {
            const b = hoverCluster ? bubbles.find((c) => clusterKey(c.members) === hoverCluster) : undefined;
            if (!b) return null;
            const order = (i: number) => (route ? route.stop[i] : i);
            return {
              x: b.s.x,
              y: b.s.y,
              items: [...b.members]
                .sort((a, c) => order(a) - order(c))
                .map((i) => ({
                  key: String(landmarks[i].spotId),
                  n: route ? route.stop[i] : undefined,
                  jp: landmarks[i].pictogram.nameJp,
                  vi: landmarks[i].pictogram.nameVi,
                })),
            };
          })()}
        />
      )}

      {/* Thẻ nổi của địa điểm đang chọn: đặt ở phía không che ghim nào, bám theo ghim khi kéo/phóng to */}
      {showLabels && activePos && activeLandmark && activeSpot != null && selected && (
        <SpotCard
          pin={activePos}
          obstacles={[
            ...pinPlacements.map((p): Box => {
              const s = pinScreen.get(p.index) ?? toScreen(...p.at)!;
              return { x0: s.x - PIN_HIT_RADIUS_PX, y0: s.y - PIN_HIT_RADIUS_PX, x1: s.x + PIN_HIT_RADIUS_PX, y1: s.y + PIN_HIT_RADIUS_PX };
            }),
            ...bubbles.map((b): Box => ({
              x0: b.s.x - PIN_HIT_RADIUS_PX,
              y0: b.s.y - PIN_HIT_RADIUS_PX,
              x1: b.s.x + PIN_HIT_RADIUS_PX,
              y1: b.s.y + PIN_HIT_RADIUS_PX,
            })),
          ]}
          bounds={{ x0: 8, y0: 8, x1: size.w - reserveRight - 8, y1: size.h - reserveBottom - 8 }}
          pictogramId={activeLandmark.pictogram.id}
          nameVi={activeLandmark.pictogram.nameVi}
          nameJp={activeLandmark.pictogram.nameJp}
          kana={activeLandmark.kana}
          stop={route ? { n: route.stop[activeSpot], total: route.route.length } : null}
          status={nextIdx === activeSpot ? 'next' : spotDone(activeSpot) ? 'done' : null}
          phrase={activeLandmark.phrase}
          furigana={furigana}
          compact={reserveBottom > 0}
          canSpeak={canSpeak}
          ink={ink}
        />
      )}

      {/* Nút phóng to / thu nhỏ / đưa về khung nhìn */}
      <div
        data-map-ui
        className="absolute z-30 flex flex-col overflow-hidden transition-[right,bottom] duration-300"
        style={{
          right: reserveRight + 16,
          bottom: reserveBottom + 16,
          background: T.paper,
          border: `1px solid ${T.inkLine}`,
          borderRadius: 8,
          boxShadow: 'var(--sh-2)',
        }}
      >
        <MapButton label="Phóng to" disabled={atMaxZoom || zoomLocked} onClick={() => zoomByButton(BUTTON_ZOOM_STEP)}>
          <path strokeLinecap="round" strokeWidth="2" d="M12 5v14M5 12h14" />
        </MapButton>
        <div className="h-px" style={{ background: T.rule }} />
        <MapButton label="Thu nhỏ" disabled={atMinZoom || zoomLocked} onClick={() => zoomByButton(1 / BUTTON_ZOOM_STEP)}>
          <path strokeLinecap="round" strokeWidth="2" d="M5 12h14" />
        </MapButton>
        <div className="h-px" style={{ background: T.rule }} />
        <MapButton label={selected ? 'Đưa về khung tỉnh' : 'Xem cả nước Nhật'} onClick={recenter}>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 9V5a1 1 0 011-1h4M15 4h4a1 1 0 011 1v4M20 15v4a1 1 0 01-1 1h-4M9 20H5a1 1 0 01-1-1v-4" />
          <circle cx="12" cy="12" r="2.5" strokeWidth="2" />
        </MapButton>
        {selected && (
          <>
            <div className="h-px" style={{ background: T.rule }} />
            <button
              type="button"
              aria-pressed={furigana}
              aria-label={furigana ? 'Tắt furigana' : 'Bật furigana'}
              title={furigana ? 'Tắt furigana' : 'Bật furigana'}
              onClick={() => setFurigana(!furigana)}
              className="jm-focus flex h-11 w-11 items-center justify-center font-jp text-base font-bold transition-colors hover:bg-[var(--paper-2)]"
              style={{ color: furigana ? T.shu : T.ghost }}
            >
              ふ
            </button>
          </>
        )}
      </div>

      <style>{`
        .jm-fade-in { animation: jm-fade-in 0.35s ease-out 0.45s both; }
        .jm-fade-quick { animation: jm-fade-in 0.32s cubic-bezier(0.22, 1, 0.36, 1) both; }
        .jm-pin { animation: jm-fade-in 0.3s ease-out both; }
        .jm-pin-body { transform-box: fill-box; transform-origin: center; transition: transform 0.24s cubic-bezier(0.34, 1.56, 0.64, 1); }
        .jm-pin:hover .jm-pin-body { transform: scale(1.08); }
        .jm-ripple { transform-box: fill-box; transform-origin: center; animation: jm-ripple 1.8s cubic-bezier(0.22, 1, 0.36, 1) infinite; }
        .jm-label-fade { animation: jm-fade-in 0.2s ease-out both; }
        @keyframes jm-fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes jm-ripple { from { transform: scale(0.9); opacity: 0.7; } to { transform: scale(1.9); opacity: 0; } }
        .jm-rlabel { position: absolute; left: 0; top: 0; display: flex; flex-direction: column; align-items: center; gap: 6px; white-space: nowrap; line-height: 1; }
        .jm-rk { writing-mode: vertical-rl; text-orientation: upright; font-family: var(--font-mincho); font-weight: 800; font-size: 17px;
          letter-spacing: .14em; line-height: 1; padding: 7px 4px; background: ${T.paper}; border: 1px solid ${T.inkLine};
          box-shadow: 0 0 0 2px ${T.paper}, 0 0 0 3px ${T.inkLine}, 2px 3px 0 3px rgba(8,20,44,.18); }
        .jm-rv { font-size: 11px; font-weight: 700; letter-spacing: .04em; margin-top: 2px;
          text-shadow: 0 0 2px ${T.paper}, 0 0 2px ${T.paper}, 0 0 3px ${T.paper}, 0 0 4px ${T.paper}; }
        @media (max-width: ${NARROW_PX}px) {
          .jm-rk { font-size: 11.5px; padding: 4px 2px; box-shadow: 0 0 0 1.5px ${T.paper}, 0 0 0 2.5px ${T.inkLine}; }
          .jm-rv { font-size: 9.5px; }
        }
        .jm-plabel-layer { position: absolute; left: 0; top: 0; width: 0; height: 0; transform-origin: 0 0; will-change: transform; pointer-events: none; }
        .jm-plabel-group { opacity: 0; visibility: hidden; transition: opacity .2s ease-out, visibility 0s linear .2s; }
        .jm-plabel-group.jm-on { opacity: 1; visibility: visible; transition: opacity .2s ease-out; }
        .jm-plabel { position: absolute; left: 0; top: 0; transform-origin: 50% 0; display: flex; flex-direction: column; align-items: center;
          white-space: nowrap; -webkit-text-stroke: 3px ${T.paper}; paint-order: stroke fill; }
        .jm-plabel-icon { position: absolute; bottom: 100%; left: 50%; width: 22px; height: 22px; margin: 0 0 3.4px -11px; }
        .jm-plabel-main .jm-plabel-vi { font-size: 12px; line-height: 13px; font-weight: 650; color: ${T.mapLabel}; }
        .jm-plabel-main .jm-plabel-jp { font-size: 11px; line-height: 13px; font-weight: 500; color: ${T.ink2}; }
        .jm-plabel-neighbor { color: ${T.muted}; }
        .jm-plabel-neighbor .jm-plabel-vi { font-size: 12px; line-height: 12px; font-weight: 600; }
        .jm-plabel-neighbor .jm-plabel-jp { font-size: 10.5px; line-height: 12px; font-weight: 500; }
        .jm-route-in { animation: jm-fade-in 0.4s ease-out 0.35s both; }
        .jm-next-ring { transform-box: fill-box; transform-origin: center; animation: jm-next-ring 2.4s ease-out infinite; }
        @keyframes jm-next-ring { from { transform: scale(0.95); opacity: 0.85; } to { transform: scale(1.55); opacity: 0; } }
        /* Nhãn tên cạnh ghim/thành phố: [furigana 9px] / tên Nhật 13px / tên Việt 11.5px, viền chữ màu giấy để đọc được trên nền */
        .jm-pl { position: absolute; left: 0; top: 0; display: flex; flex-direction: column; align-items: center; box-sizing: border-box;
          white-space: nowrap; pointer-events: none; text-shadow: 0 0 2px ${T.paper}, 0 0 2px ${T.paper}, 0 0 3px ${T.paper}, 0 0 4px ${T.paper}; }
        .jm-pl-btn { pointer-events: auto; cursor: pointer; background: none; border: 0; border-radius: 6px; font: inherit; }
        .jm-pl > span { max-width: calc(168px * var(--s, 1)); overflow: hidden; text-overflow: ellipsis; text-align: center; }
        .jm-pl-k { font-family: 'Noto Sans JP', 'Inter', system-ui, sans-serif; font-size: calc(9px * var(--s, 1)); line-height: calc(11px * var(--s, 1)); font-weight: 500; color: ${T.ink2}; }
        .jm-pl-j { font-family: 'Noto Sans JP', 'Inter', system-ui, sans-serif; font-size: calc(13px * var(--s, 1)); line-height: calc(16px * var(--s, 1)); font-weight: 700; }
        .jm-pl-v { font-size: calc(11.5px * var(--s, 1)); line-height: calc(14px * var(--s, 1)); font-weight: 700; }
        .jm-pl-d { position: absolute; left: 0; top: 0; display: flex; align-items: center; justify-content: center; white-space: nowrap; pointer-events: none;
          font-family: 'Noto Sans JP', 'Inter', system-ui, sans-serif; font-size: 11px; line-height: 14px; font-weight: 500;
          text-shadow: 0 0 2px ${T.paper}, 0 0 2px ${T.paper}, 0 0 3px ${T.paper}; }
        .jm-next-chip { position: absolute; left: 0; top: 0; display: flex; align-items: center; justify-content: center; box-sizing: border-box;
          background: ${T.shu}; color: #fff; border-radius: 999px; font-size: 11.5px; font-weight: 700; white-space: nowrap; pointer-events: none;
          box-shadow: 0 1px 3px rgba(8,20,44,.3); }
        .jm-chip-next { display: inline-flex; align-items: center; background: ${T.shu}; color: #fff; border-radius: 999px; padding: 1px 8px;
          font-size: 11.5px; font-weight: 700; }
        .jm-chip-done { display: inline-flex; align-items: center; border: 1px solid; border-radius: 999px; padding: 0 8px; font-size: 11.5px; font-weight: 700; background: ${T.paper}; }
        .jm-stop-badge { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; width: 19px; height: 19px; border-radius: 999px;
          background: ${T.inkLine}; color: ${T.paper}; border: 1.5px solid ${T.paper}; font-size: 11px; font-weight: 700; line-height: 1; }
        .jm-cluster-list { position: absolute; z-index: 6; pointer-events: none; min-width: 190px; max-width: 280px; padding: 6px 10px; background: ${T.paper};
          border: 1px solid ${T.inkLine}; border-radius: 8px; box-shadow: var(--sh-2); }
        .jm-cl-row { display: flex; align-items: center; gap: 8px; padding: 3px 0; }
        .jm-cl-jp { display: block; font-size: 13px; font-weight: 700; line-height: 1.3; color: ${T.ink}; }
        .jm-cl-vi { display: block; font-size: 11.5px; line-height: 1.3; color: ${T.ink2}; }
        .jm-spotcard { position: absolute; left: 0; top: 0; z-index: 20; box-sizing: border-box; padding: 12px; background: ${T.paper};
          border: 1px solid ${T.inkLine}; border-radius: 8px; box-shadow: var(--sh-2); pointer-events: auto; cursor: default; animation: jm-fade-in 0.2s ease-out both; }
        .jm-phrase { font-size: 15.5px; font-weight: 700; line-height: 1.95; color: ${T.ink}; margin: 0; }
        .jm-spotcard ruby, .jm-wordcard ruby { ruby-align: center; }
        .jm-spotcard rt, .jm-wordcard rt { font-size: 0.55em; font-weight: 500; color: ${T.ink2}; }
        .jm-wordcard { position: absolute; left: 16px; top: 16px; z-index: 8; box-sizing: border-box; width: 220px; padding: 12px 14px; background: ${T.paper};
          border: 1px solid ${T.inkLine}; border-radius: 8px; box-shadow: var(--sh-2); cursor: default; }
        .jm-wordcard-inline { position: static; width: auto; box-shadow: none; background: var(--card); border-color: var(--rule); }
        .jm-word-jp { font-family: var(--font-mincho); font-weight: 800; font-size: 30px; line-height: 1.5; }
        .jm-word-jp rt { font-size: 11px; }
        @media (prefers-reduced-motion: reduce) {
          .jm-fade-in, .jm-fade-quick, .jm-pin, .jm-label-fade, .jm-ripple, .jm-route-in, .jm-spotcard { animation: none; }
          .jm-plabel-group, .jm-plabel-group.jm-on { transition: none; }
          .jm-next-ring { display: none; }
          .jm-pin-body { transition: none; }
        }
        g[role='button']:focus-visible .jm-focus-ring > *:first-child,
        g[role='button']:focus-visible circle.jm-focus-ring,
        path[role='button']:focus-visible { stroke: ${T.primary}; stroke-width: 3px; }
      `}</style>
    </div>
  );
};

const MapButton: React.FC<{ label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }> = ({
  label,
  onClick,
  disabled,
  children,
}) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    onClick={onClick}
    disabled={disabled}
    className="jm-focus w-11 h-11 flex items-center justify-center text-[var(--ink-2)] hover:bg-[var(--paper-2)] hover:text-[var(--ink)] transition-colors disabled:text-[var(--ghost)] disabled:hover:bg-transparent disabled:cursor-not-allowed"
  >
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      {children}
    </svg>
  </button>
);

/** Tỉnh lân cận khi đang xem một tỉnh: hình chi tiết tô màu giấy nhạt, đường bao mực mảnh */
const NeighborDetail = memo<{ detail: PrefectureDetail; fill: string }>(({ detail, fill }) => (
  <g pointerEvents="none" aria-hidden="true">
    <path d={detail.allD} fill={fill} />
    <path
      d={detail.outlineD}
      fill="none"
      stroke={T.inkLine}
      strokeOpacity={0.32}
      strokeWidth={1}
      strokeLinecap="round"
      vectorEffect="non-scaling-stroke"
    />
  </g>
));

type PathMode = 'idle' | 'selected' | 'dim';

interface PrefecturePathProps {
  shape: PrefectureShape;
  mode: PathMode;
  /** Ẩn hình thô khi đã có hình chi tiết vẽ thay (vẫn giữ trong DOM cho bàn phím/trình đọc màn hình) */
  hidden: boolean;
  /** Tỉnh admin chưa mở: vẽ nhạt; vẫn bấm được để hiện "Sẽ cập nhật trong tương lai" */
  closed: boolean;
  onHover: (id: number | null) => void;
  onSelect: (id: number) => void;
}

/** Tỉnh vẽ bằng hình thô: màu bột phẳng, nét mực mảnh; khi đang xem tỉnh khác thì chuyển sang màu giấy nhạt */
const PrefecturePath = memo<PrefecturePathProps>(({ shape, mode, hidden, closed, onHover, onSelect }) => {
  const style = REGION_STYLE[shape.region];
  const interactive = mode === 'idle';

  return (
    <path
      d={shape.d}
      fillRule="evenodd"
      fill={mode === 'dim' || closed ? style.dim : style.fill}
      stroke={mode === 'selected' ? style.ink : T.inkLine}
      strokeOpacity={mode === 'selected' ? 1 : mode === 'dim' ? 0.18 : closed ? 0.3 : 0.5}
      strokeWidth={mode === 'selected' ? 2.5 : 0.9}
      strokeLinejoin="round"
      vectorEffect="non-scaling-stroke"
      data-pref-id={shape.id}
      role="button"
      tabIndex={interactive ? 0 : -1}
      aria-label={`${shape.nameVi} (${shape.nameJp}), vùng ${REGION_NAME[shape.region]}${closed ? ', sẽ cập nhật trong tương lai' : ''}`}
      aria-hidden={mode === 'dim' ? true : undefined}
      onPointerEnter={interactive ? () => onHover(shape.id) : undefined}
      // Gọi lại khi di chuột để tỉnh sáng lại ngay sau khi vừa kéo bản đồ xong (lúc kéo thì tắt làm nổi)
      onPointerMove={interactive ? () => onHover(shape.id) : undefined}
      onPointerLeave={interactive ? () => onHover(null) : undefined}
      onFocus={interactive ? () => onHover(shape.id) : undefined}
      onBlur={interactive ? () => onHover(null) : undefined}
      onClick={(e) => {
        e.stopPropagation();
        if (interactive) {
          onHover(null);
          onSelect(shape.id);
        }
      }}
      onKeyDown={(e) => {
        if (interactive && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onHover(null);
          onSelect(shape.id);
        }
      }}
      style={{
        visibility: hidden ? 'hidden' : undefined,
        pointerEvents: mode === 'dim' ? 'none' : 'auto',
        cursor: interactive ? 'pointer' : 'inherit',
        outline: 'none',
        transition: 'fill 0.15s',
      }}
    />
  );
});
