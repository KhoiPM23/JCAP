import { acquireMicStream, normalizeDeviceId } from './audioDevice';
import { PcmTakeBuffer } from './pcmTakeBuffer';

/** Âm thanh giữ lại trước khi bấm ghi, đặt vào đầu bản ghi chấm điểm. */
export const PREROLL_MS = 500;

/**
 * Micro mở sẵn trong buổi luyện, dùng lại cho mọi lượt ghi.
 *
 * Mở micro lúc bấm ghi làm mất 0.2–0.5 s đầu (thiết bị khởi động, tự chỉnh âm lượng đang dò mức), đúng chỗ âm đầu
 * câu, nên mô hình âm vị hay bỏ mất âm đầu (vd. "パスポート" thành "すぽうと"). Giữ micro mở thì lượt ghi bắt đầu
 * ngay, và bộ đệm thu trước (PcmTakeBuffer) còn lấy lại được phần đã nói ngay trước khi bấm.
 *
 * Luồng PCM ở tần số gốc của AudioContext; xuất WAV 16 kHz bằng `pcmToAnalysisWav`.
 */
export class WarmMic {
  private ctx: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private node: AudioNode | null = null;
  private sink: GainNode | null = null;
  private workletUrl: string | null = null;
  private buffer: PcmTakeBuffer | null = null;

  private constructor(
    readonly stream: MediaStream,
    /** Thiết bị đã yêu cầu ('' = mặc định hệ thống), để biết khi nào phải mở lại. */
    readonly requestedDeviceId: string,
    readonly usedFallback: boolean,
    readonly voiceProcessing: boolean,
  ) {}

  /** Mở micro (ném lỗi getUserMedia như cũ để nơi gọi báo đúng nguyên nhân). PCM không dựng được thì vẫn trả về micro. */
  static async open(deviceId: string, voiceProcessing: boolean): Promise<WarmMic> {
    const { stream, usedFallback } = await acquireMicStream(deviceId);
    const mic = new WarmMic(stream, normalizeDeviceId(deviceId), usedFallback, voiceProcessing);
    try {
      await mic.startPcmCapture();
    } catch (err) {
      console.warn('[WarmMic] Không thu được PCM trực tiếp, dùng bản ghi MediaRecorder:', err);
      mic.teardownAudioGraph();
    }
    return mic;
  }

  get track(): MediaStreamTrack | null {
    return this.stream.getAudioTracks()[0] ?? null;
  }

  /** Micro còn dùng được (chưa bị rút / chưa đóng). */
  get isLive(): boolean {
    return this.track?.readyState === 'live';
  }

  /** Có luồng PCM (bản ghi chấm điểm có thu trước); false thì chỉ còn MediaRecorder. */
  get hasPcm(): boolean {
    return this.buffer !== null && this.ctx !== null && this.ctx.state !== 'closed';
  }

  matches(deviceId: string, voiceProcessing: boolean): boolean {
    return this.requestedDeviceId === normalizeDeviceId(deviceId) && this.voiceProcessing === voiceProcessing;
  }

  /** Bắt đầu lượt ghi PCM, kèm tối đa `prerollMs` âm thanh trước đó. Gọi trong sự kiện bấm (để AudioContext được chạy). */
  startTake(prerollMs: number): void {
    if (this.ctx?.state === 'suspended') this.ctx.resume().catch(() => {});
    this.buffer?.startTake(prerollMs);
  }

  /** Kết thúc lượt ghi PCM; null nếu không có luồng PCM. */
  stopTake(): { samples: Float32Array; sampleRate: number; prerollMs: number } | null {
    if (!this.buffer || !this.buffer.isRecording) return null;
    const samples = this.buffer.stopTake();
    const sampleRate = this.buffer.sampleRate;
    return { samples, sampleRate, prerollMs: Math.round((this.buffer.prerollSampleCount * 1000) / sampleRate) };
  }

  cancelTake(): void {
    this.buffer?.cancelTake();
  }

  close(): void {
    this.teardownAudioGraph();
    this.stream.getTracks().forEach((t) => t.stop());
  }

  private async startPcmCapture(): Promise<void> {
    const w = globalThis as any;
    const AudioCtx = w.AudioContext || w.webkitAudioContext;
    if (!AudioCtx) throw new Error('Không có Web Audio API');

    const ctx: AudioContext = new AudioCtx();
    this.ctx = ctx;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const buffer = new PcmTakeBuffer(ctx.sampleRate, PREROLL_MS);
    this.buffer = buffer;

    this.source = ctx.createMediaStreamSource(this.stream);
    // Nối ra loa với âm lượng 0 để trình duyệt chắc chắn chạy nút xử lý (không phát tiếng micro ra loa).
    this.sink = ctx.createGain();
    this.sink.gain.value = 0;
    this.sink.connect(ctx.destination);

    if (ctx.audioWorklet && typeof AudioWorkletNode !== 'undefined') {
      this.workletUrl = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: 'text/javascript' }));
      await ctx.audioWorklet.addModule(this.workletUrl);
      const node = new AudioWorkletNode(ctx, 'jcap-pcm-tap', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1 });
      node.port.onmessage = (e: MessageEvent<Float32Array>) => buffer.push(e.data);
      this.node = node;
    } else {
      // Trình duyệt cũ: ScriptProcessorNode (đã lỗi thời nhưng vẫn chạy)
      const node = ctx.createScriptProcessor(4096, 1, 1);
      node.onaudioprocess = (e) => buffer.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      this.node = node;
    }
    this.source.connect(this.node);
    this.node.connect(this.sink);
  }

  private teardownAudioGraph(): void {
    try {
      this.source?.disconnect();
      this.node?.disconnect();
      this.sink?.disconnect();
      if (this.node && 'port' in this.node) (this.node as AudioWorkletNode).port.onmessage = null;
      if (this.node && 'onaudioprocess' in this.node) (this.node as ScriptProcessorNode).onaudioprocess = null;
    } catch {
      // ignore
    }
    if (this.ctx && this.ctx.state !== 'closed') this.ctx.close().catch(() => {});
    if (this.workletUrl) URL.revokeObjectURL(this.workletUrl);
    this.ctx = null;
    this.source = null;
    this.node = null;
    this.sink = null;
    this.workletUrl = null;
    this.buffer = null;
  }
}

/** Gom mẫu kênh đầu thành khối 1024 (~21 ms ở 48 kHz) rồi gửi về luồng chính. */
const WORKLET_SOURCE = `
class JcapPcmTap extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buf = new Float32Array(1024);
    this.n = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) {
      for (let i = 0; i < ch.length; i++) {
        this.buf[this.n++] = ch[i];
        if (this.n === this.buf.length) {
          this.port.postMessage(this.buf);
          this.buf = new Float32Array(1024);
          this.n = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor('jcap-pcm-tap', JcapPcmTap);
`;

/** Đã có quyền micro thì mới mở sẵn (không bật hộp xin quyền khi người học chưa bấm gì). */
export async function isMicPermissionGranted(): Promise<boolean> {
  try {
    const status = await navigator.permissions?.query({ name: 'microphone' as PermissionName });
    return status?.state === 'granted';
  } catch {
    return false; // trình duyệt không hỗ trợ hỏi quyền micro (vd. Firefox): mở khi bấm ghi lần đầu
  }
}
