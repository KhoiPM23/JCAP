/**
 * Audio Metrics Service (Web Audio API)
 * Đo các chỉ số vật lý của tín hiệu từ Micro để kiểm định đầu vào (Mic Quality Gatekeeper).
 *
 * LƯU Ý: đây là heuristic dựa trên ngưỡng cố định, CHƯA được hiệu chuẩn/kiểm chứng (xem utils/audioGate.ts).
 *  - Kết quả chỉ dùng để quyết định có nên chấm hay yêu cầu thu lại, và gửi kèm cho backend.
 *  - KHÔNG được dùng để tạo điểm số hiển thị.
 *  - Khi bộ đo trực tiếp không đo được, `measureRecordedBlob` giải mã chính bản ghi để biết có tiếng hay không.
 *    Chỉ khi cả hai đều thất bại trạng thái mới là 'unmeasured' (KHÔNG phải 'good').
 */
import {
  NO_SIGNAL_RMS,
  computeGateMetrics,
  frameRmsFromPcm,
  type AudioGateStatus,
  type AudioQualityMetrics,
} from '../utils/audioGate';

export type { AudioGateStatus, AudioQualityMetrics };

export class AudioMetricsAnalyzer {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private animationFrameId: number | null = null;

  private rmsSamples: number[] = [];
  private clippingCount: number = 0;
  private startTime: number = 0;
  private lastRms: number = 0;

  /** Mức âm lượng (RMS 0..1) của khung đo mới nhất; 0 khi không đang phân tích. Chỉ để vẽ sóng âm. */
  public get currentLevel(): number {
    return this.lastRms;
  }

  /**
   * Bắt đầu phân tích luồng âm thanh MediaStream khi người học bấm Micro
   */
  public startAnalysis(stream: MediaStream): void {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;

      this.audioContext = new AudioCtx();
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume().catch(() => {});
      }
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.4;

      this.source = this.audioContext.createMediaStreamSource(stream);
      this.source.connect(this.analyser);

      this.rmsSamples = [];
      this.clippingCount = 0;
      this.startTime = Date.now();

      const bufferLength = this.analyser.fftSize;
      const dataArray = new Float32Array(bufferLength);

      const sample = () => {
        if (!this.analyser) return;

        this.analyser.getFloatTimeDomainData(dataArray);

        let sumSquares = 0;
        let peak = 0;
        for (let i = 0; i < bufferLength; i++) {
          const val = dataArray[i];
          sumSquares += val * val;
          const absVal = Math.abs(val);
          if (absVal > peak) peak = absVal;
        }

        this.lastRms = Math.sqrt(sumSquares / bufferLength);
        this.rmsSamples.push(this.lastRms);
        // Phát hiện vỡ tiếng / clipping (Peak > 0.96)
        if (peak >= 0.96) this.clippingCount++;

        this.animationFrameId = requestAnimationFrame(sample);
      };

      this.animationFrameId = requestAnimationFrame(sample);
    } catch (err) {
      console.warn('[AudioMetricsAnalyzer] Không thể khởi tạo Web Audio API:', err);
    }
  }

  /**
   * Dừng phân tích và tính chỉ số chất lượng âm thanh khi kết thúc ghi âm
   */
  public stopAnalysis(_targetDurationMs?: number): AudioQualityMetrics {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    const durationMs = Math.max(300, Date.now() - this.startTime);
    this.lastRms = 0;

    // Dọn dẹp AudioContext
    try {
      if (this.source) {
        this.source.disconnect();
        this.source = null;
      }
      if (this.audioContext && this.audioContext.state !== 'closed') {
        this.audioContext.close();
        this.audioContext = null;
      }
    } catch {}
    this.analyser = null;

    // Không có mẫu, hoặc toàn bộ mẫu gần 0: bộ đo trực tiếp không phân biệt được "im lặng thật"
    // với "trình duyệt không cấp dữ liệu AudioContext". Trả 'unmeasured' để nơi gọi giải mã chính bản ghi.
    if (this.rmsSamples.length === 0 || this.rmsSamples.every((s) => s < NO_SIGNAL_RMS)) {
      return this.unmeasuredMetrics(durationMs);
    }

    return computeGateMetrics(this.rmsSamples, this.clippingCount, durationMs);
  }

  /** Không có mẫu đo hợp lệ: báo 'unmeasured' thay vì giả định tín hiệu tốt. */
  private unmeasuredMetrics(durationMs: number): AudioQualityMetrics {
    return {
      gateStatus: 'unmeasured',
      gateLabel: 'Chưa đo được',
      gateDetail: 'Không đo được chất lượng tín hiệu micro trên trình duyệt này',
      isValidForAssessment: true,
      isMeasured: false,
      volumeRms: 0,
      volumeDb: -100,
      noiseFloor: 0,
      snrDb: 0,
      clippingCount: 0,
      pauseRatio: 0,
      unnaturalPausesCount: 0,
      activeSpeechMs: 0,
      durationMs,
    };
  }
}

/**
 * Đo trực tiếp trên bản ghi đã thu (giải mã bằng Web Audio) — bằng chứng độc lập với bộ đo trực tiếp.
 * Trả về null nếu không giải mã được (khi đó giữ nguyên trạng thái 'unmeasured').
 */
export async function measureRecordedBlob(blob: Blob, durationMsHint?: number): Promise<AudioQualityMetrics | null> {
  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioCtx || blob.size === 0) return null;

  const ctx: AudioContext = new AudioCtx();
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    const { rmsFrames, clippingCount } = frameRmsFromPcm(decoded.getChannelData(0), decoded.sampleRate);
    return computeGateMetrics(rmsFrames, clippingCount, Math.round(decoded.duration * 1000) || durationMsHint || 0);
  } catch (err) {
    console.warn('[AudioMetrics] Không giải mã được bản ghi để đo:', err);
    return null;
  } finally {
    ctx.close().catch(() => {});
  }
}

export const audioMetricsService = new AudioMetricsAnalyzer();
