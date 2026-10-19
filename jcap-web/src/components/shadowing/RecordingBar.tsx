import { useEffect, useRef, useState } from 'react';
import { audioMetricsService } from '../../services/audioMetricsService';

const BAR_STEP_PX = 8; // thanh 4px + khoảng cách 4px
const DEFAULT_BAR_COUNT = 80;
const SAMPLE_INTERVAL_MS = 40;
// Làm mượt theo thời gian: lên nhanh để bắt kịp tiếng nói, xuống chậm để không giật.
const ATTACK = 0.5;
const RELEASE = 0.16;
const MIN_BAR = 0.06;

/** Đổi mức RMS (0..1) của micro sang chiều cao thanh (0..1); căn bậc để giọng nói thường vẫn thấy rõ. */
export const levelToBarHeight = (rms: number): number => {
  if (!Number.isFinite(rms) || rms <= 0) return MIN_BAR;
  return Math.max(MIN_BAR, Math.min(1, Math.pow(rms * 7, 0.6)));
};

/**
 * Hệ số 0..1 theo vị trí thanh: hai rìa luôn là vạch li ti (baseline), vùng giữa mới nhô lên theo giọng nói.
 * Dạng chuông (Gaussian) nên chuyển từ rìa vào giữa mượt, không có bậc.
 */
export const edgeEnvelope = (index: number, count: number): number => {
  if (count <= 1) return 1;
  const x = (index + 0.5) / count - 0.5; // -0.5 .. 0.5
  return Math.exp(-(x * x) / (2 * 0.17 * 0.17));
};

/** Khoảng cách (số thanh) từ thanh i tới tâm; hai thanh đối xứng qua tâm có cùng khoảng cách nên cùng một mẫu. */
export const mirrorDistance = (index: number, count: number): number =>
  Math.min(count - 1, Math.round(Math.abs(index - (count - 1) / 2)));

interface RecordingBarProps {
  /** Hủy bản thu hiện tại (không chấm điểm), quay về trạng thái sẵn sàng. */
  onCancel: () => void;
  /** Dừng thu và gửi chấm điểm. */
  onSend: () => void;
}

/**
 * Thanh ghi âm (nền hòa với khung bao quanh): sóng âm chạy theo mic, nút vuông (hủy) và nút mũi tên (gửi chấm điểm).
 * Sóng âm lấy từ cùng bộ phân tích đang đo chất lượng mic nên không mở thêm luồng âm thanh nào.
 */
export default function RecordingBar({ onCancel, onSend }: RecordingBarProps) {
  const waveRef = useRef<HTMLDivElement>(null);
  const [barCount, setBarCount] = useState(DEFAULT_BAR_COUNT);
  const [bars, setBars] = useState<number[]>(() => Array(DEFAULT_BAR_COUNT).fill(MIN_BAR));

  // Số thanh theo bề rộng khung để sóng âm lấp đầy khoảng trống thay vì co lại giữa khung.
  useEffect(() => {
    const el = waveRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const update = () => setBarCount(Math.max(20, Math.floor(el.clientWidth / BAR_STEP_PX)));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const smoothedRef = useRef(MIN_BAR);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const target = levelToBarHeight(audioMetricsService.currentLevel);
      const prev = smoothedRef.current;
      smoothedRef.current = prev + (target - prev) * (target > prev ? ATTACK : RELEASE);
      const height = smoothedRef.current;
      setBars((prev) => {
        const next = [...prev, height];
        return next.length > barCount ? next.slice(next.length - barCount) : [...Array(barCount - next.length).fill(MIN_BAR), ...next];
      });
    }, SAMPLE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [barCount]);

  return (
    <div
      className="w-full flex items-center gap-4 sm:gap-5 py-1 animate-in fade-in"
      role="group"
      aria-label="Đang ghi âm"
    >
      <div ref={waveRef} className="flex-1 h-14 flex items-center justify-center gap-1 overflow-hidden" aria-hidden="true">
        {bars.map((_, i) => {
          // Mẫu mới nhất ở GIỮA, mẫu cũ dần lan ra hai bên đối xứng. Rìa giữ chiều cao nhỏ nhất,
          // càng vào giữa càng theo mức âm lượng thật.
          const at = (k: number) => bars[bars.length - 1 - Math.max(0, Math.min(bars.length - 1, k))];
          const d = mirrorDistance(i, bars.length);
          // Làm mượt theo không gian: trung bình có trọng số với hai thanh kề để đường sóng không có răng cưa.
          const h = 0.25 * at(d - 1) + 0.5 * at(d) + 0.25 * at(d + 1);
          const height = MIN_BAR + (h - MIN_BAR) * edgeEnvelope(i, bars.length);
          return (
            <span
              key={i}
              className="w-1 flex-shrink-0 rounded-full bg-[#0878EE]/70 transition-[height] duration-150 ease-out"
              style={{ height: `${Math.round(height * 100)}%` }}
            />
          );
        })}
      </div>

      <button
        type="button"
        onClick={onCancel}
        className="h-12 w-12 flex-shrink-0 rounded-full bg-[#EEF4FB] hover:bg-[#DCE8F6] border border-[#D5E3F3] flex items-center justify-center transition-colors cursor-pointer"
        title="Hủy bản thu này"
        aria-label="Hủy bản thu"
      >
        <span className="block w-4 h-4 rounded-[3px] bg-[#071A44]" />
      </button>

      <button
        type="button"
        onClick={onSend}
        className="h-12 w-12 flex-shrink-0 rounded-full bg-[#0878EE] hover:bg-[#0662C6] flex items-center justify-center transition-colors cursor-pointer"
        title="Gửi để chấm điểm"
        aria-label="Gửi để chấm điểm"
      >
        <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 19V5" />
          <path d="M5 12l7-7 7 7" />
        </svg>
      </button>
    </div>
  );
}
