/**
 * Bộ đệm PCM cho một lượt ghi âm, có "thu trước" (pre-roll).
 *
 * Khi chưa ghi, chỉ giữ vài trăm ms âm thanh gần nhất (vòng tròn). Khi bấm ghi, phần đó được đặt vào đầu bản ghi,
 * nên âm đầu câu không bị mất nếu người học nói ngay lúc bấm (micro mở lúc bấm thường mất 0.2–0.5 s đầu).
 * Không phụ thuộc trình duyệt để kiểm thử được bằng Node.
 */
export class PcmTakeBuffer {
  private readonly prerollCapacity: number;
  private readonly maxTakeSamples: number;
  private ring: Float32Array;
  private ringWrite = 0;
  private ringFilled = 0;
  private take: Float32Array[] | null = null;
  private takeLength = 0;
  private prerollSamples = 0;
  readonly sampleRate: number;

  constructor(sampleRate: number, prerollMs: number, maxTakeSeconds = 60) {
    this.sampleRate = sampleRate;
    this.prerollCapacity = Math.max(0, Math.round((sampleRate * prerollMs) / 1000));
    this.maxTakeSamples = Math.round(sampleRate * maxTakeSeconds);
    this.ring = new Float32Array(this.prerollCapacity);
  }

  get isRecording(): boolean {
    return this.take !== null;
  }

  /** Số mẫu thu trước đã đặt vào đầu lượt ghi hiện tại / gần nhất. */
  get prerollSampleCount(): number {
    return this.prerollSamples;
  }

  push(chunk: Float32Array): void {
    if (chunk.length === 0) return;
    if (this.take) {
      const room = this.maxTakeSamples - this.takeLength;
      if (room <= 0) return; // chặn trên bộ nhớ: bỏ phần vượt quá
      const part = chunk.length > room ? chunk.slice(0, room) : chunk.slice();
      this.take.push(part);
      this.takeLength += part.length;
      return;
    }
    const cap = this.prerollCapacity;
    if (cap === 0) return;
    for (let i = Math.max(0, chunk.length - cap); i < chunk.length; i++) {
      this.ring[this.ringWrite] = chunk[i];
      this.ringWrite = (this.ringWrite + 1) % cap;
    }
    this.ringFilled = Math.min(cap, this.ringFilled + chunk.length);
  }

  /** Bắt đầu lượt ghi, lấy tối đa `maxPrerollMs` âm thanh gần nhất làm phần đầu (0 = không lấy). */
  startTake(maxPrerollMs: number = Number.POSITIVE_INFINITY): void {
    const wanted = Math.max(0, Math.floor((this.sampleRate * Math.max(0, maxPrerollMs)) / 1000));
    const count = Math.min(this.ringFilled, wanted);
    const preroll = new Float32Array(count);
    const cap = this.prerollCapacity;
    for (let i = 0; i < count; i++) {
      preroll[i] = this.ring[(this.ringWrite - count + i + cap) % cap];
    }
    this.take = count > 0 ? [preroll] : [];
    this.takeLength = count;
    this.prerollSamples = count;
    this.clearRing();
  }

  /** Kết thúc lượt ghi và trả toàn bộ mẫu (gồm phần thu trước). Gọi khi chưa ghi thì trả mảng rỗng. */
  stopTake(): Float32Array {
    const parts = this.take ?? [];
    const out = new Float32Array(this.takeLength);
    let offset = 0;
    for (const p of parts) {
      out.set(p, offset);
      offset += p.length;
    }
    this.take = null;
    this.takeLength = 0;
    return out;
  }

  /** Bỏ lượt ghi đang chạy (không trả dữ liệu). */
  cancelTake(): void {
    this.take = null;
    this.takeLength = 0;
    this.prerollSamples = 0;
  }

  private clearRing(): void {
    this.ringWrite = 0;
    this.ringFilled = 0;
  }
}

/**
 * Lượng thu trước được phép: không lấy âm thanh lúc đang phát giọng mẫu hay bản ghi (tiếng loa lọt vào micro
 * sẽ bị nhận thành chữ ở đầu câu), và chỉ lấy phần sau khi phát xong (trừ thêm một khoảng an toàn cho tiếng vọng).
 */
export function allowedPrerollMs(
  playbackActive: boolean,
  playbackEndedAt: number | null,
  now: number,
  maxMs: number,
  echoGuardMs = 150,
): number {
  if (playbackActive) return 0;
  if (playbackEndedAt == null) return maxMs;
  return Math.max(0, Math.min(maxMs, now - playbackEndedAt - echoGuardMs));
}
