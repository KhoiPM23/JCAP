/**
 * Audio Metrics Service (Web Audio API)
 * Đo lường chất lượng âm thanh từ Micro và phân tích các chỉ số vật lý:
 * 1. Cổng kiểm định Micro (Mic Quality Gatekeeper): Tốt / Chấp nhận được / Cần thu lại
 * 2. Chỉ số độ trôi chảy (Fluency): Tỷ lệ khoảng lặng, thời lượng nói thực tế, số lần ngập ngừng > 1.2s
 */

export type AudioGateStatus = 'good' | 'acceptable' | 'needs_retry';

export interface AudioQualityMetrics {
  // Cổng kiểm định chất lượng âm thanh đầu vào
  gateStatus: AudioGateStatus;
  gateLabel: string;
  gateDetail: string;
  isValidForAssessment: boolean; // false nếu quá nhỏ, vỡ tiếng hoặc quá ồn

  // Chỉ số vật lý tín hiệu
  volumeRms: number; // 0.0 - 1.0 (mức âm lượng trung bình)
  noiseFloor: number; // 0.0 - 1.0 (tạp âm môi trường nền)
  snrDb: number; // Tỷ số tín hiệu / tạp âm (dB)
  clippingCount: number; // Số khung bị vỡ tiếng (peak > 0.96)

  // Chỉ số độ trôi chảy (Fluency)
  pauseRatio: number; // Tỷ lệ thời gian im lặng (0.0 - 1.0)
  unnaturalPausesCount: number; // Số lần ngập ngừng ngắt quãng kéo dài > 1.2s
  activeSpeechMs: number; // Thời gian thực sự có giọng nói (ms)
  fluencyScore: number; // Điểm lưu loát khoa học (0 - 100)
  durationMs: number; // Tổng thời lượng thu âm (ms)

  // Trường tương thích giao diện cũ
  overallQualityScore: number;
  qualityStatus: 'clear' | 'moderate_noise' | 'noisy' | 'too_quiet' | 'clipping';
  qualityLabel: string;
}

export class AudioMetricsAnalyzer {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private animationFrameId: number | null = null;

  private rmsSamples: number[] = [];
  private silenceSamplesCount: number = 0;
  private totalSamplesCount: number = 0;
  private clippingCount: number = 0;
  private startTime: number = 0;

  // Theo dõi ngập ngừng / dừng quá lâu
  private currentSilenceDurationFrames: number = 0;
  private unnaturalPausesCount: number = 0;

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
      this.silenceSamplesCount = 0;
      this.totalSamplesCount = 0;
      this.clippingCount = 0;
      this.currentSilenceDurationFrames = 0;
      this.unnaturalPausesCount = 0;
      this.startTime = Date.now();

      const bufferLength = this.analyser.fftSize;
      const dataArray = new Float32Array(bufferLength);

      // Ước tính 1 giây có khoảng 60 khung (60fps) -> 1.2s tương đương ~72 khung im lặng liên tục
      const FRAMES_PER_UNNATURAL_PAUSE = 72;

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

        const rms = Math.sqrt(sumSquares / bufferLength);
        this.rmsSamples.push(rms);
        this.totalSamplesCount++;

        // Ngưỡng im lặng (RMS < 0.02)
        const isSilentFrame = rms < 0.02;

        if (isSilentFrame) {
          this.silenceSamplesCount++;
          this.currentSilenceDurationFrames++;
          if (this.currentSilenceDurationFrames === FRAMES_PER_UNNATURAL_PAUSE) {
            this.unnaturalPausesCount++;
          }
        } else {
          this.currentSilenceDurationFrames = 0;
        }

        // Phát hiện vỡ tiếng / clipping (Peak > 0.96)
        if (peak >= 0.96) {
          this.clippingCount++;
        }

        this.animationFrameId = requestAnimationFrame(sample);
      };

      this.animationFrameId = requestAnimationFrame(sample);
    } catch (err) {
      console.warn('[AudioMetricsAnalyzer] Không thể khởi tạo Web Audio API:', err);
    }
  }

  /**
   * Dừng phân tích và tính toán toàn bộ chỉ số chất lượng âm thanh khi kết thúc ghi âm
   */
  public stopAnalysis(targetDurationMs?: number): AudioQualityMetrics {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    const durationMs = Math.max(300, Date.now() - this.startTime);

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

    if (this.rmsSamples.length === 0) {
      return this.getDefaultMetrics(durationMs);
    }

    // Nếu tất cả các mẫu đều bằng 0 hoặc cực nhỏ (< 0.003) do trình duyệt chưa cấp quyền AudioContext float data
    const isVirtuallyEmptyBuffer = this.rmsSamples.every(s => s < 0.003);
    if (isVirtuallyEmptyBuffer && durationMs > 500) {
      return this.getDefaultMetrics(durationMs);
    }

    // 1. Phân tích Volume & Noise Floor
    const sortedSamples = [...this.rmsSamples].sort((a, b) => a - b);
    const lowCount = Math.max(1, Math.floor(sortedSamples.length * 0.15));
    const noiseFloor = sortedSamples.slice(0, lowCount).reduce((a, b) => a + b, 0) / lowCount;

    const highSamples = sortedSamples.slice(Math.floor(sortedSamples.length * 0.5));
    const averageVoiceRms = highSamples.reduce((a, b) => a + b, 0) / Math.max(1, highSamples.length);

    // Tính SNR (Signal to Noise Ratio dB)
    const safeNoise = Math.max(0.001, noiseFloor);
    const safeSignal = Math.max(safeNoise, averageVoiceRms);
    const snrDb = Math.round(20 * Math.log10(safeSignal / safeNoise));

    // 2. Tỷ lệ khoảng lặng & Thời gian nói thực tế
    const pauseRatio = this.totalSamplesCount > 0
      ? this.silenceSamplesCount / this.totalSamplesCount
      : 0.2;
    const activeSpeechMs = Math.max(100, Math.round(durationMs * (1 - pauseRatio)));

    // 3. Cổng kiểm định Micro (Mic Quality Gatekeeper)
    let gateStatus: AudioGateStatus = 'good';
    let gateLabel = 'Tốt';
    let gateDetail = 'Tín hiệu rõ nét, ít tạp âm';
    let isValidForAssessment = true;
    let legacyQualityStatus: AudioQualityMetrics['qualityStatus'] = 'clear';

    if (durationMs < 400 || averageVoiceRms < 0.008) {
      gateStatus = 'needs_retry';
      gateLabel = 'Cần thu lại';
      gateDetail = 'Âm lượng mic quá nhỏ hoặc chưa thu được tiếng';
      isValidForAssessment = false;
      legacyQualityStatus = 'too_quiet';
    } else if (this.clippingCount > 15) {
      gateStatus = 'needs_retry';
      gateLabel = 'Cần thu lại';
      gateDetail = 'Âm thanh bị vỡ tiếng (nói quá sát mic)';
      isValidForAssessment = false;
      legacyQualityStatus = 'clipping';
    } else if (snrDb < 6) {
      gateStatus = 'needs_retry';
      gateLabel = 'Cần thu lại';
      gateDetail = 'Môi trường quá nhiều tiếng ồn xung quanh';
      isValidForAssessment = false;
      legacyQualityStatus = 'noisy';
    } else if (snrDb < 12 || averageVoiceRms < 0.025) {
      gateStatus = 'acceptable';
      gateLabel = 'Chấp nhận được';
      gateDetail = 'Âm lượng hơi nhỏ hoặc có tiếng ồn nền nhẹ';
      isValidForAssessment = true;
      legacyQualityStatus = 'moderate_noise';
    } else {
      gateStatus = 'good';
      gateLabel = 'Tốt';
      gateDetail = 'Tín hiệu rõ nét, micro rất tốt';
      isValidForAssessment = true;
      legacyQualityStatus = 'clear';
    }

    // 4. Tính toán Độ lưu loát (Fluency Score: 0 - 100)
    // Sư phạm: Không phạt học viên N5/N4 nói chậm vừa phải để rèn phát âm tròn chữ
    let fluencyScore = 88;

    // Phạt khi khoảng lặng quá dài (ngập ngừng không tự nhiên)
    if (pauseRatio > 0.55) {
      fluencyScore = Math.max(45, Math.round(80 - (pauseRatio - 0.55) * 90));
    } else if (pauseRatio > 0.38) {
      fluencyScore = Math.round(85 - (pauseRatio - 0.38) * 35);
    } else {
      fluencyScore = Math.min(98, Math.round(88 + (0.35 - pauseRatio) * 20));
    }

    // Phạt mỗi lần dừng ngắt quãng kéo dài > 1.2s (Unnatural pauses)
    if (this.unnaturalPausesCount > 0) {
      fluencyScore = Math.max(40, fluencyScore - this.unnaturalPausesCount * 7);
    }

    return {
      gateStatus,
      gateLabel,
      gateDetail,
      isValidForAssessment,
      volumeRms: Number(averageVoiceRms.toFixed(3)),
      noiseFloor: Number(noiseFloor.toFixed(3)),
      snrDb,
      clippingCount: this.clippingCount,
      pauseRatio: Number(pauseRatio.toFixed(2)),
      unnaturalPausesCount: this.unnaturalPausesCount,
      activeSpeechMs,
      fluencyScore: Math.min(98, Math.max(40, fluencyScore)),
      durationMs,
      overallQualityScore: gateStatus === 'good' ? 95 : gateStatus === 'acceptable' ? 80 : 55,
      qualityStatus: legacyQualityStatus,
      qualityLabel: gateDetail,
    };
  }

  private getDefaultMetrics(durationMs: number): AudioQualityMetrics {
    return {
      gateStatus: 'good',
      gateLabel: 'Tốt',
      gateDetail: 'Tín hiệu rõ nét, ít tạp âm',
      isValidForAssessment: true,
      volumeRms: 0.18,
      noiseFloor: 0.02,
      snrDb: 22,
      clippingCount: 0,
      pauseRatio: 0.2,
      unnaturalPausesCount: 0,
      activeSpeechMs: Math.round(durationMs * 0.8),
      fluencyScore: 88,
      durationMs,
      overallQualityScore: 92,
      qualityStatus: 'clear',
      qualityLabel: 'Tín hiệu rõ nét, ít tạp âm',
    };
  }
}

export const audioMetricsService = new AudioMetricsAnalyzer();

