import { Badge } from '../jcap';
import type { ShadowingFluencyMetrics } from '../../types/shadowing';
import { summarizeFluency } from '../../utils/fluencySummary';

interface Props {
  fluency?: ShadowingFluencyMetrics | null;
}

/**
 * Lưu loát (tham khảo, CHƯA tính điểm): tốc độ so với giọng mẫu, số lần dừng, ngập ngừng giữa từ, độ dài đoạn nói liền,
 * kèm nhận xét có bằng chứng. Chỉ hiện khi so được với giọng mẫu.
 */
export default function FluencyPanel({ fluency }: Props) {
  const summary = summarizeFluency(fluency);
  if (!summary) return null;

  return (
    <section className="rounded-xl border border-line bg-paper-100 px-3.5 py-2.5 space-y-2" aria-label="Lưu loát">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-bold text-sumi">Lưu loát</span>
        <span className="text-[11px] text-sumi-muted">Tham khảo, chưa tính vào điểm</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {summary.chips.map((c) => (
          <Badge key={c.label} tone={c.tone === 'warning' ? 'warning' : 'neutral'}>
            {c.label}
          </Badge>
        ))}
      </div>
      {summary.notes.length > 0 && (
        <ul className="list-disc space-y-1 pl-4 text-xs text-sumi">
          {summary.notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
