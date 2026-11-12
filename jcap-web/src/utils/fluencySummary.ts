import type { ShadowingFluencyMetrics } from '../types/shadowing';

export interface FluencyChip {
  label: string;
  /** neutral: bình thường; warning: đáng chú ý */
  tone: 'neutral' | 'warning';
}

export interface FluencySummary {
  chips: FluencyChip[];
  notes: string[];
}

/**
 * Ngưỡng tốc độ phát âm so với giọng mẫu (mẫu / người học; < 1 là chậm hơn). SLOW_RATIO trùng ngưỡng nhận xét "chậm" của backend
 * (`Shadowing:Fluency:Comparison:SlowRatio`). Nói nhanh hơn mẫu KHÔNG bị đánh dấu: người Nhật thật thường nhanh hơn VOICEVOX
 * (FLEURS: 26/150 câu nhanh hơn mẫu ≥ 1,4 lần), chỉ ghi lại để tham khảo.
 */
export const SLOW_RATIO = 0.7;
/** Từ mức này mới ghi "nhanh hơn mẫu" (dưới đó coi là tương đương). */
export const FASTER_NOTE_RATIO = 1.15;

const pct = (x: number) => Math.round(Math.abs(x) * 100);

/**
 * Tóm tắt Lưu loát để hiển thị (tham khảo, không phải điểm): tốc độ so với mẫu, số lần dừng, số lần ngập ngừng giữa từ,
 * độ dài đoạn nói liền. Null khi không so được với giọng mẫu (đọc chưa đúng câu, thiếu giọng mẫu, câu quá ngắn…).
 */
export function summarizeFluency(f: ShadowingFluencyMetrics | null | undefined): FluencySummary | null {
  const c = f?.comparison;
  if (!f || f.status !== 'available' || !c || c.status !== 'available') return null;

  const chips: FluencyChip[] = [];
  const ratio = c.articulationRateRatio;
  if (ratio != null) {
    if (ratio <= SLOW_RATIO) chips.push({ label: `Tốc độ: chậm hơn mẫu ${pct(1 - ratio)}%`, tone: 'warning' });
    else if (ratio >= FASTER_NOTE_RATIO) chips.push({ label: `Tốc độ: nhanh hơn mẫu ${pct(ratio - 1)}%`, tone: 'neutral' });
    else chips.push({ label: 'Tốc độ: tương đương giọng mẫu', tone: 'neutral' });
  }

  const pauses = c.learnerPauseCount ?? f.pauseCount;
  if (pauses != null) {
    const ref = c.referencePauseCount;
    const extra = c.extraPauseCount ?? 0;
    chips.push({
      label: `Dừng giữa câu: ${pauses} lần${ref != null ? ` (mẫu: ${ref})` : ''}`,
      tone: extra > 0 ? 'warning' : 'neutral',
    });
  }

  if (c.hesitationCount != null && c.hesitationCount > 0) {
    chips.push({ label: `Ngập ngừng giữa từ: ${c.hesitationCount} lần`, tone: 'warning' });
  }

  if (f.meanRunMoras != null) {
    const ref = f.reference?.metrics?.meanRunMoras;
    chips.push({
      label: `Nói liền trung bình: ${f.meanRunMoras} âm${ref != null ? ` (mẫu: ${ref})` : ''}`,
      tone: 'neutral',
    });
  }

  return { chips, notes: (f.observations ?? []).map((o) => o.message).filter(Boolean) };
}
