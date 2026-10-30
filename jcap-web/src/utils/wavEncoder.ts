/**
 * Xuất bản ghi sang WAV PCM 16-bit mono 16 kHz để backend đo nhịp nói.
 *
 * `decodeAudioData` giải mã theo sample rate của AudioContext (thường 44.1/48 kHz), KHÔNG đảm bảo 16 kHz.
 * Vì vậy bản ghi được render lại qua OfflineAudioContext 16 kHz (trình duyệt tự lọc chống răng cưa khi hạ tần số),
 * rồi mới mã hóa WAV. Backend từ chối WAV sai định dạng thay vì phân tích dữ liệu sai tốc độ.
 */

export const ANALYSIS_SAMPLE_RATE = 16000;

/** Mã hóa mẫu float [-1, 1] thành WAV PCM 16-bit mono little-endian (có header 44 byte). */
export function encodeWavPcm16(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const dataBytes = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);

  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };

  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true); // kích thước khối fmt
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bit/mẫu
  writeAscii(36, 'data');
  view.setUint32(40, dataBytes, true);

  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, Number.isFinite(samples[i]) ? samples[i] : 0));
    view.setInt16(44 + i * 2, clamped < 0 ? Math.round(clamped * 32768) : Math.round(clamped * 32767), true);
  }
  return buffer;
}

/**
 * Giải mã bản ghi rồi render lại ở 16 kHz mono và mã hóa WAV.
 * Trả về null nếu không làm được (thiếu Web Audio, không giải mã được...): khi đó chỉ mất số liệu nhịp nói,
 * không ảnh hưởng việc chấm điểm nội dung.
 */
export async function blobToAnalysisWav(blob: Blob): Promise<Blob | null> {
  const w = globalThis as any;
  const AudioCtx = w.AudioContext || w.webkitAudioContext;
  const OfflineCtx = w.OfflineAudioContext || w.webkitOfflineAudioContext;
  if (!AudioCtx || !OfflineCtx || blob.size === 0) return null;

  const ctx: AudioContext = new AudioCtx();
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    const length = Math.max(1, Math.ceil(decoded.duration * ANALYSIS_SAMPLE_RATE));
    const offline: OfflineAudioContext = new OfflineCtx(1, length, ANALYSIS_SAMPLE_RATE);

    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination); // hạ về mono và 16 kHz do trình duyệt xử lý
    source.start();

    const rendered = await offline.startRendering();
    if (rendered.sampleRate !== ANALYSIS_SAMPLE_RATE) return null; // không để lọt dữ liệu sai tần số
    return new Blob([encodeWavPcm16(rendered.getChannelData(0), ANALYSIS_SAMPLE_RATE)], { type: 'audio/wav' });
  } catch (err) {
    console.warn('[WavEncoder] Không xuất được WAV 16 kHz để đo nhịp nói:', err);
    return null;
  } finally {
    ctx.close().catch(() => {});
  }
}
