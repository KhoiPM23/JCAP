import { JP_FONT, LABEL_SPEC, labelSize, textWidth, type LabelContent } from './measureText';

/**
 * Xếp nhãn của bản đồ tỉnh trên màn hình (px) sao cho không cái nào chồng lên ghim, nhóm ghim hay nhãn khác.
 * Thứ tự ưu tiên (cái trước được chỗ trước, cái sau bị ẩn nếu hết chỗ):
 *   chip "Tiếp theo" > nhãn ghim > tên thành phố (thủ phủ luôn hiện) > tên quận.
 * Hàm thuần: không chạm DOM, chỉ nhận toạ độ và kích thước.
 */
export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export type Side = 'top' | 'bottom' | 'left' | 'right';

export interface Placed {
  box: Box;
  side: Side;
}

const hit = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/** Hộp cỡ w×h đặt bên `side` của điểm (x, y), cách tâm `gap` px */
function beside(x: number, y: number, w: number, h: number, gap: number, side: Side): Box {
  switch (side) {
    case 'bottom':
      return { x0: x - w / 2, y0: y + gap, x1: x + w / 2, y1: y + gap + h };
    case 'top':
      return { x0: x - w / 2, y0: y - gap - h, x1: x + w / 2, y1: y - gap };
    case 'right':
      return { x0: x + gap, y0: y - h / 2, x1: x + gap + w, y1: y + h / 2 };
    case 'left':
      return { x0: x - gap - w, y0: y - h / 2, x1: x - gap, y1: y + h / 2 };
  }
}

const around = (x: number, y: number, r: number): Box => ({ x0: x - r, y0: y - r, x1: x + r, y1: y + r });

export interface LabelInput {
  furigana: boolean;
  viewport: { w: number; h: number };
  /** Ghim đã đặt (kể cả ghim xòe), theo thứ tự ưu tiên nhãn; ghim đang chọn không có nhãn nhưng vẫn là vật cản */
  pins: { index: number; x: number; y: number; label: LabelContent; active: boolean }[];
  bubbles: { x: number; y: number }[];
  /** Ghim "Tiếp theo" (chip đặt gần ghim này), null nếu không có/đang được chọn */
  next: { x: number; y: number } | null;
  chip: { w: number; h: number };
  /** Bán kính vùng ghim tính là vật cản (px) và khoảng cách từ tâm ghim tới nhãn */
  pinRadius: number;
  pinLabelGap: number;
  /** Thành phố chính và quận/thành phố nhỏ (tâm, cỡ hộp bao trên màn hình): bản đồ tỉnh hiện không truyền */
  cities?: { key: string; x: number; y: number; capital: boolean; label: LabelContent }[];
  cityScale?: number;
  districts?: { key: string; name: string; x: number; y: number; w: number; h: number }[];
}

export interface LabelLayout {
  chip: Placed | null;
  pins: Map<number, Placed>;
  cities: Map<string, Placed>;
  /** Thành phố được vẽ chấm: thành phố có nhãn, và thủ phủ (luôn có chấm dù hết chỗ cho nhãn) */
  cityDots: Set<string>;
  districts: { key: string; name: string; box: Box }[];
}

const DISTRICT_FONT = `500 11px ${JP_FONT}`;
export const DISTRICT_LABEL_H = 14;

export function layoutLabels(input: LabelInput): LabelLayout {
  const { viewport, pinRadius, pinLabelGap, furigana } = input;
  const margin = 120;
  const visible = (x: number, y: number) => x > -margin && y > -margin && x < viewport.w + margin && y < viewport.h + margin;
  const taken: Box[] = [];
  const free = (b: Box) => !taken.some((t) => hit(b, t));
  // Nhãn phải nằm trọn trong khung nhìn (nhãn lòi ra ngoài mép bị cắt nên coi như không đặt được)
  const inside = (b: Box) => b.x0 >= 0 && b.y0 >= 0 && b.x1 <= viewport.w && b.y1 <= viewport.h;
  const placeable = (b: Box) => inside(b) && free(b);

  for (const p of input.pins) taken.push(around(p.x, p.y, pinRadius));
  for (const b of input.bubbles) taken.push(around(b.x, b.y, pinRadius));

  // 1. Chip "Tiếp theo": trên, rồi trái, rồi phải
  let chip: Placed | null = null;
  if (input.next && visible(input.next.x, input.next.y)) {
    const { x, y } = input.next;
    for (const side of ['top', 'left', 'right'] as const) {
      const box = beside(x, y, input.chip.w, input.chip.h, pinLabelGap - 1, side);
      if (placeable(box)) {
        chip = { box, side };
        taken.push(box);
        break;
      }
    }
  }

  // 2. Nhãn ghim: dưới (cách tâm 25px), phải, trái, trên
  const pins = new Map<number, Placed>();
  for (const p of input.pins) {
    if (p.active || !visible(p.x, p.y)) continue;
    const { w, h } = labelSize(p.label, furigana);
    for (const side of ['bottom', 'right', 'left', 'top'] as const) {
      const box = beside(p.x, p.y, w, h, pinLabelGap, side);
      if (placeable(box)) {
        pins.set(p.index, { box, side });
        taken.push(box);
        break;
      }
    }
  }

  // 3. Thành phố: thủ phủ trước, rồi thành phố khác; hết chỗ thì ẩn nhãn (thủ phủ vẫn giữ chấm trên bản đồ)
  const cities = new Map<string, Placed>();
  const cityDots = new Set<string>();
  const s = input.cityScale ?? 1;
  for (const c of [...(input.cities ?? [])].sort((a, b) => Number(b.capital) - Number(a.capital))) {
    if (!visible(c.x, c.y)) continue;
    const { w, h } = labelSize(c.label, furigana, s);
    const near = (['bottom', 'top', 'right', 'left'] as const).map((side) => ({ side, box: beside(c.x, c.y, w, h, 8 * s, side) }));
    // Thủ phủ được thử thêm vòng xa hơn (vượt qua ghim bên cạnh)
    const far = c.capital
      ? (['bottom', 'top', 'right', 'left'] as const).map((side) => ({ side, box: beside(c.x, c.y, w, h, pinRadius * 2 + 6, side) }))
      : [];
    const pick = [...near, ...far].find((o) => placeable(o.box));
    if (!pick) {
      if (c.capital) {
        cityDots.add(c.key);
        taken.push(around(c.x, c.y, 9 * s));
      }
      continue;
    }
    cities.set(c.key, pick);
    cityDots.add(c.key);
    taken.push(pick.box, around(c.x, c.y, 9 * s));
  }

  // 4. Tên quận (ưu tiên thấp nhất): chỉ khi hộp bao của quận đủ chỗ cho nhãn, bỏ tên trùng thành phố đã có nhãn
  const cityNames = new Set((input.cities ?? []).filter((c) => cities.has(c.key)).map((c) => c.label.jp));
  const districts: LabelLayout['districts'] = [];
  for (const d of input.districts ?? []) {
    if (cityNames.has(d.name) || !visible(d.x, d.y)) continue;
    const w = textWidth(d.name, DISTRICT_FONT) + 6;
    if (d.w < w + 14 || d.h < DISTRICT_LABEL_H + 10) continue;
    const box: Box = { x0: d.x - w / 2, y0: d.y - DISTRICT_LABEL_H / 2, x1: d.x + w / 2, y1: d.y + DISTRICT_LABEL_H / 2 };
    if (!placeable(box)) continue;
    taken.push(box);
    districts.push({ key: d.key, name: d.name, box });
  }

  return { chip, pins, cities, cityDots, districts };
}

/** Cỡ chip "Tiếp theo" (chữ 11.5px đậm + đệm hai bên) */
export function chipSize(text: string): { w: number; h: number } {
  return { w: textWidth(text, `700 ${LABEL_SPEC.viPx}px ${JP_FONT}`) + 18, h: 20 };
}
