/**
 * Khởi động Web Speech trên ĐÚNG micro người học đã chọn.
 *
 * `recognition.start()` không tham số luôn nghe micro mặc định của hệ thống, trong khi bản ghi để chấm và đo nhịp
 * lấy từ micro đã chọn trong "Cài đặt âm thanh". Chọn micro khác mặc định thì chữ nhận dạng và bản ghi đến từ
 * hai micro khác nhau. Spec Web Speech có `start(audioTrack)`; theo tài liệu, trình duyệt chưa hỗ trợ sẽ bỏ qua tham số
 * hoặc ném lỗi (khi đó hàm này quay về `start()`).
 * THỰC TẾ: thử trên trình duyệt thật của nhóm, truyền track làm Web Speech ngừng nhận dạng hoàn toàn (không lỗi rõ ràng),
 * nên cách này đang TẮT mặc định và chỉ bật qua công tắc thử nghiệm để chẩn đoán.
 * Không có cách phát hiện chắc chắn trình duyệt có dùng track hay không, nên kết quả chỉ cho biết đã thử cách nào.
 */

/**
 * Công tắc thử nghiệm: thử trên trình duyệt thật, truyền track làm Web Speech ngừng nhận dạng hoàn toàn,
 * nên mặc định TẮT. Bật bằng `localStorage.setItem('jcap_speech_mic_track', '1')` để chẩn đoán.
 */
export const SPEECH_MIC_TRACK_STORAGE_KEY = 'jcap_speech_mic_track';

export function isSpeechMicTrackEnabled(storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage): boolean {
  try {
    return storage?.getItem(SPEECH_MIC_TRACK_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export interface StartableRecognition {
  start: (audioTrack?: MediaStreamTrack) => void;
}

/** 'track': đã truyền track của micro đã chọn; 'default': khởi động như cũ (micro mặc định). */
export type RecognitionMicSource = 'track' | 'default';

export function startRecognitionOnTrack(
  recognition: StartableRecognition,
  track: Pick<MediaStreamTrack, 'readyState' | 'kind'> | null | undefined,
): RecognitionMicSource {
  if (track && track.kind === 'audio' && track.readyState === 'live') {
    try {
      recognition.start(track as MediaStreamTrack);
      return 'track';
    } catch (err) {
      // Trình duyệt không nhận tham số (TypeError) hoặc không dùng được track này: quay về cách cũ.
      // Lỗi InvalidStateError (đã start rồi) không xảy ra ở đây vì mỗi phiên là một instance mới.
      if (!(err instanceof TypeError) && (err as { name?: string })?.name !== 'NotSupportedError') throw err;
    }
  }
  recognition.start();
  return 'default';
}
