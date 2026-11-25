import { encodeWavPcm16 } from './wavEncoder.ts';

/** Đỉnh mong muốn khi nghe lại (~ −3 dBFS). */
const TARGET_PEAK = 0.7;
/** Tăng tối đa +18 dB: micro quá nhỏ vẫn nghe được mà không khuếch đại tiếng ồn quá mức. */
const MAX_GAIN = 8;
/** Bỏ qua 0,1% mẫu to nhất (tiếng click, chạm micro) khi tìm đỉnh. */
const PEAK_PERCENTILE = 0.999;

/**
 * Hệ số khuếch đại để NGHE LẠI bản thu ở mức dễ nghe. Không bao giờ giảm (≥ 1), tối đa {@link MAX_GAIN}.
 * Chỉ dùng cho phát lại; bản gửi chấm giữ nguyên tín hiệu gốc.
 */
export function playbackGain(samples: Float32Array): number {
  if (samples.length === 0) return 1;
  const stride = Math.max(1, Math.ceil(samples.length / 200_000)); // bản dài: lấy mẫu thưa cho nhanh
  const abs = new Float32Array(Math.ceil(samples.length / stride));
  for (let i = 0, j = 0; i < samples.length; i += stride, j++) abs[j] = Math.abs(samples[i]);
  abs.sort();
  const peak = abs[Math.min(abs.length - 1, Math.floor(abs.length * PEAK_PERCENTILE))];
  if (!(peak > 1e-4)) return 1; // im lặng: không khuếch đại tiếng nền
  return Math.min(MAX_GAIN, Math.max(1, TARGET_PEAK / peak));
}

/** Nhân hệ số và kẹp trong [−1, 1]. */
export function applyGain(samples: Float32Array, gain: number): Float32Array {
  return Float32Array.from(samples, (s) => Math.max(-1, Math.min(1, s * gain)));
}

/**
 * Bản để nghe lại: PCM thu trực tiếp (nếu có) được chuẩn hoá âm lượng và mã hoá WAV; không có thì giải mã bản
 * MediaRecorder. Không làm được thì trả về bản gốc.
 */
export async function makePlaybackBlob(original: Blob, pcm?: { samples: Float32Array; sampleRate: number } | null): Promise<Blob> {
  try {
    let samples = pcm && pcm.samples.length > 0 ? pcm.samples : null;
    let sampleRate = pcm?.sampleRate ?? 0;
    if (!samples) {
      const w = globalThis as any;
      const AudioCtx = w.AudioContext || w.webkitAudioContext;
      if (!AudioCtx || original.size === 0) return original;
      const ctx: AudioContext = new AudioCtx();
      try {
        const decoded = await ctx.decodeAudioData(await original.arrayBuffer());
        samples = decoded.getChannelData(0);
        sampleRate = decoded.sampleRate;
      } finally {
        ctx.close().catch(() => {});
      }
    }
    const gain = playbackGain(samples);
    if (gain < 1.1 && !pcm) return original;
    return new Blob([encodeWavPcm16(gain > 1 ? applyGain(samples, gain) : samples, sampleRate)], { type: 'audio/wav' });
  } catch {
    return original;
  }
}
