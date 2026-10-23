import React, { memo } from 'react';
import { LABEL_PAD } from './measureText';
import type { Box, Placed } from './labelLayout';

/** Một nhãn "tên Nhật (furigana) / tên Việt" đặt ở hộp `box` trên màn hình */
const NameLabel: React.FC<{
  box: Box;
  jp: string;
  kana?: string;
  vi?: string;
  furigana: boolean;
  scale?: number;
  viColor: string;
  jpColor: string;
  onClick?: () => void;
  ariaLabel: string;
  title?: string;
}> = ({ box, jp, kana, vi, furigana, scale = 1, viColor, jpColor, onClick, ariaLabel, title }) => {
  const style = {
    transform: `translate(${box.x0.toFixed(1)}px, ${box.y0.toFixed(1)}px)`,
    width: box.x1 - box.x0,
    height: box.y1 - box.y0,
    padding: `${LABEL_PAD.y}px ${LABEL_PAD.x}px`,
    '--s': scale,
  } as React.CSSProperties;
  const body = (
    <>
      {furigana && kana && <span className="jm-pl-k">{kana}</span>}
      <span className="jm-pl-j" style={{ color: jpColor }}>
        {jp}
      </span>
      {vi && (
        <span className="jm-pl-v" style={{ color: viColor }}>
          {vi}
        </span>
      )}
    </>
  );
  return onClick ? (
    <button type="button" className="jm-pl jm-pl-btn jm-focus" style={style} onClick={onClick} aria-label={ariaLabel} title={title}>
      {body}
    </button>
  ) : (
    <div className="jm-pl" style={style} aria-hidden="true">
      {body}
    </div>
  );
};

export interface PinLabelData {
  index: number;
  placed: Placed;
  jp: string;
  kana?: string;
  vi: string;
  onSelect: () => void;
}

export interface CityLabelData {
  key: string;
  placed: Placed;
  jp: string;
  kana?: string;
  vi: string;
  scale: number;
  /** Có cách đọc và giọng đọc: bấm tên để nghe */
  onSpeak?: () => void;
}

export interface DistrictLabelData {
  key: string;
  name: string;
  box: Box;
}

export interface ClusterListData {
  x: number;
  y: number;
  items: { key: string; n?: number; jp: string; vi: string }[];
}

interface Props {
  furigana: boolean;
  /** Màu đậm của vùng (tên Việt) */
  ink: string;
  mapLabelColor: string;
  chip: { box: Box; text: string } | null;
  pins: PinLabelData[];
  cities: CityLabelData[];
  districts: DistrictLabelData[];
  cluster: ClusterListData | null;
  districtColor: string;
}

/**
 * Lớp chữ HTML trên bản đồ tỉnh, vị trí theo pixel màn hình (đã xếp chống chồng ở provinceLabels.ts).
 * Dùng HTML thay vì SVG để có chữ sắc nét, nút bấm/focus đúng nghĩa và dễ canh hai dòng chữ.
 */
export const ProvinceLabels = memo<Props>(({ furigana, ink, mapLabelColor, chip, pins, cities, districts, cluster, districtColor }) => (
  <div className="jm-labels pointer-events-none absolute inset-0 overflow-hidden">
    {districts.map((d) => (
      <div
        key={d.key}
        className="jm-pl-d"
        aria-hidden="true"
        style={{
          transform: `translate(${d.box.x0.toFixed(1)}px, ${d.box.y0.toFixed(1)}px)`,
          width: d.box.x1 - d.box.x0,
          height: d.box.y1 - d.box.y0,
          color: districtColor,
        }}
      >
        {d.name}
      </div>
    ))}

    {cities.map((c) => (
      <NameLabel
        key={c.key}
        box={c.placed.box}
        jp={c.jp}
        kana={c.kana}
        vi={c.vi}
        furigana={furigana}
        scale={c.scale}
        viColor={ink}
        jpColor={mapLabelColor}
        onClick={c.onSpeak}
        ariaLabel={c.kana ? `${c.vi} (${c.jp}), bấm để nghe: ${c.kana}` : `${c.vi} (${c.jp})`}
        title={c.onSpeak ? 'Bấm để nghe' : undefined}
      />
    ))}

    {pins.map((p) => (
      <NameLabel
        key={p.index}
        box={p.placed.box}
        jp={p.jp}
        kana={p.kana}
        vi={p.vi}
        furigana={furigana}
        viColor={ink}
        jpColor={mapLabelColor}
        onClick={p.onSelect}
        ariaLabel={`Chọn địa điểm ${p.vi} (${p.jp})`}
      />
    ))}

    {chip && (
      <div
        className="jm-next-chip"
        aria-hidden="true"
        style={{
          transform: `translate(${chip.box.x0.toFixed(1)}px, ${chip.box.y0.toFixed(1)}px)`,
          width: chip.box.x1 - chip.box.x0,
          height: chip.box.y1 - chip.box.y0,
        }}
      >
        {chip.text}
      </div>
    )}

    {cluster && (
      <div
        className="jm-cluster-list"
        role="tooltip"
        style={{ left: cluster.x, top: cluster.y, transform: 'translate(-50%, calc(-100% - 30px))' }}
      >
        {cluster.items.map((it) => (
          <div key={it.key} className="jm-cl-row">
            {it.n != null && <span className="jm-stop-badge">{it.n}</span>}
            <span className="min-w-0">
              <span className="jm-cl-jp font-jp">{it.jp}</span>
              <span className="jm-cl-vi">{it.vi}</span>
            </span>
          </div>
        ))}
      </div>
    )}
  </div>
));
