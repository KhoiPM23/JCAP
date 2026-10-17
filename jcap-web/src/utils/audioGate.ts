/**
 * Cổng kiểm định âm thanh đầu vào (Mic Quality Gatekeeper) dưới dạng hàm thuần để kiểm thử được.
 * Đầu vào là dãy RMS theo khung (~60 khung/giây) lấy từ luồng micro trực tiếp HOẶC từ chính bản ghi đã giải mã.
 *
 * Đây là heuristic dùng ngưỡng cố định, CHƯA được hiệu chuẩn: chỉ để chặn bản thu rõ ràng không dùng được
 * (im lặng, quá nhỏ, vỡ tiếng, ồn áp đảo) và KHÔNG dùng để tạo điểm số.
 */

export type AudioGateStatus = 'good' | 'acceptable' | 'needs_retry' | 'unmeasured';

export interface AudioQualityMetrics {
  gateStatus: AudioGateStatus;
  gateLabel: string;
  gateDetail: string;
  /** false nếu quá nhỏ, vỡ tiếng hoặc quá ồn. Khi unmeasured vẫn true vì không có bằng chứng ngược lại. */
  isValidForAssessment: boolean;
  /** true nếu các chỉ số bên dưới được đo từ mẫu thực; false nếu là giá trị rỗng. */
  isMeasured: boolean;

  volumeRms: number; // 0.0 - 1.0 (trung vị RMS của các khung đang có tiếng nói; không phụ thuộc độ dài bản ghi)
  /** Mức âm lượng giọng tính bằng dB so với mức tối đa (0 dB = to nhất). Dùng để hiển thị cho người học. */
  volumeDb: number;
  noiseFloor: number; // 0.0 - 1.0 (tạp âm nền: 15% khung nhỏ nhất)
  snrDb: number;
  clippingCount: number;

  // Số đo thô về khoảng lặng (chỉ để chẩn đoán, không quy đổi thành điểm)
  pauseRatio: number;
  unnaturalPausesCount: number;
  activeSpeechMs: number;
  durationMs: number;
}

/** Dưới ngưỡng này coi như không có tín hiệu (im lặng số). */
export const NO_SIGNAL_RMS = 0.003;
const SILENT_FRAME_RMS = 0.02;
/** Số khung vỡ tiếng bắt đầu bị cảnh báo (không chặn). */
const CLIPPING_WARN_FRAMES = 15;
/**
 * Tỷ lệ khung vỡ tiếng để CHẶN bản thu. Thử nghiệm thật: bản ghi sạch nhưng to bị AGC của trình duyệt làm vỡ vài chục khung
 * vẫn được Gemini nhận dạng đúng, nên vỡ tiếng thông thường chỉ cảnh báo, không bắt người học thu lại.
 */
const CLIPPING_BLOCK_RATIO = 0.3;
const FRAMES_PER_UNNATURAL_PAUSE = 72; // ~1.2s ở 60 khung/giây

/** Dưới mức này (RMS giọng) coi là mic quá nhỏ. 0.008 ≈ -42 dB. */
const MIN_VOICE_RMS = 0.008;
const MIN_DURATION_MS = 400;
/** Khung được coi là "đang có tiếng" nếu RMS ≥ tỷ lệ này của mức tham chiếu (phân vị 95). */
const ACTIVE_FRAME_RATIO = 0.25;

const toDb = (rms: number) => Math.round(20 * Math.log10(Math.max(rms, 1e-5)));

/**
 * RMS giọng = trung vị RMS của các khung đang có tiếng. Trước đây là trung bình nửa khung to nhất nên bản ghi dài mà nói ít
 * (nhiều khoảng lặng) bị kéo thấp và bị báo "mic quá nhỏ" dù giọng to.
 */
function voiceRmsOf(sortedAsc: number[]): number {
  if (sortedAsc.length === 0) return 0;
  const reference = sortedAsc[Math.min(sortedAsc.length - 1, Math.floor(sortedAsc.length * 0.95))];
  const active = sortedAsc.filter((v) => v >= reference * ACTIVE_FRAME_RATIO);
  if (active.length === 0) return reference;
  const mid = Math.floor(active.length / 2);
  return active.length % 2 === 1 ? active[mid] : (active[mid - 1] + active[mid]) / 2;
}

export function computeGateMetrics(
  rmsFrames: ArrayLike<number>,
  clippingCount: number,
  durationMs: number,
): AudioQualityMetrics {
  const frames = Array.from(rmsFrames);
  const total = frames.length;

  let silentFrames = 0;
  let run = 0;
  let unnaturalPausesCount = 0;
  for (const rms of frames) {
    if (rms < SILENT_FRAME_RMS) {
      silentFrames++;
      run++;
      if (run === FRAMES_PER_UNNATURAL_PAUSE) unnaturalPausesCount++;
    } else {
      run = 0;
    }
  }

  const sorted = [...frames].sort((a, b) => a - b);
  const lowCount = Math.max(1, Math.floor(sorted.length * 0.15));
  const noiseFloor = sorted.slice(0, lowCount).reduce((a, b) => a + b, 0) / lowCount;
  const averageVoiceRms = voiceRmsOf(sorted);
  const maxRms = sorted.length ? sorted[sorted.length - 1] : 0;

  const safeNoise = Math.max(0.001, noiseFloor);
  const safeSignal = Math.max(safeNoise, averageVoiceRms);
  const snrDb = Math.round(20 * Math.log10(safeSignal / safeNoise));

  const pauseRatio = total > 0 ? silentFrames / total : 0;
  const activeSpeechMs = Math.max(0, Math.round(durationMs * (1 - pauseRatio)));

  let gateStatus: AudioGateStatus;
  let gateLabel: string;
  let gateDetail: string;
  let isValidForAssessment: boolean;

  if (total === 0 || maxRms < NO_SIGNAL_RMS) {
    gateStatus = 'needs_retry';
    gateLabel = 'Cần thu lại';
    gateDetail = 'Chưa thu được tiếng nói. Hãy kiểm tra micro rồi thu lại';
    isValidForAssessment = false;
  } else if (durationMs < MIN_DURATION_MS) {
    gateStatus = 'needs_retry';
    gateLabel = 'Cần thu lại';
    gateDetail = `Hãy nói trọn câu rồi mới bấm dừng`;
    isValidForAssessment = false;
  } else if (averageVoiceRms < MIN_VOICE_RMS) {
    gateStatus = 'needs_retry';
    gateLabel = 'Cần thu lại';
    gateDetail = `Âm lượng mic quá nhỏ. Hãy nói gần mic hơn, tăng mức vào của mic hoặc chọn đúng thiết bị`;
    isValidForAssessment = false;
  } else if (clippingCount > total * CLIPPING_BLOCK_RATIO) {
    gateStatus = 'needs_retry';
    gateLabel = 'Cần thu lại';
    gateDetail = 'Âm thanh bị vỡ tiếng nặng (nói quá sát mic)';
    isValidForAssessment = false;
  } else if (snrDb < 6) {
    gateStatus = 'needs_retry';
    gateLabel = 'Cần thu lại';
    gateDetail = 'Môi trường quá nhiều tiếng ồn xung quanh';
    isValidForAssessment = false;
  } else if (snrDb < 12 || averageVoiceRms < 0.025 || clippingCount > CLIPPING_WARN_FRAMES) {
    gateStatus = 'acceptable';
    gateLabel = 'Chấp nhận được';
    gateDetail = clippingCount > CLIPPING_WARN_FRAMES
      ? 'Âm thanh hơi vỡ tiếng, hãy lùi xa micro một chút'
      : 'Âm lượng hơi nhỏ hoặc có tiếng ồn nền nhẹ';
    isValidForAssessment = true;
  } else {
    gateStatus = 'good';
    gateLabel = 'Tốt';
    gateDetail = 'Tín hiệu rõ nét, micro rất tốt';
    isValidForAssessment = true;
  }

  return {
    gateStatus,
    gateLabel,
    gateDetail,
    isValidForAssessment,
    isMeasured: true,
    volumeRms: Number(averageVoiceRms.toFixed(3)),
    volumeDb: toDb(averageVoiceRms),
    noiseFloor: Number(noiseFloor.toFixed(3)),
    snrDb,
    clippingCount,
    pauseRatio: Number(pauseRatio.toFixed(2)),
    unnaturalPausesCount,
    activeSpeechMs,
    durationMs,
  };
}

/** Chia mẫu PCM thành khung ~60/giây và tính RMS + số khung vỡ tiếng. Dùng cho bản ghi đã giải mã. */
export function frameRmsFromPcm(
  samples: ArrayLike<number>,
  sampleRate: number,
): { rmsFrames: number[]; clippingCount: number } {
  const frameLen = Math.max(1, Math.round(sampleRate / 60));
  const rmsFrames: number[] = [];
  let clippingCount = 0;
  for (let i = 0; i + frameLen <= samples.length; i += frameLen) {
    let sum = 0;
    let peak = 0;
    for (let j = i; j < i + frameLen; j++) {
      const v = samples[j];
      sum += v * v;
      const a = Math.abs(v);
      if (a > peak) peak = a;
    }
    rmsFrames.push(Math.sqrt(sum / frameLen));
    if (peak >= 0.96) clippingCount++;
  }
  return { rmsFrames, clippingCount };
}
