/**
 * Chọn và chuẩn hóa MIME type ghi âm theo khả năng thực của trình duyệt
 * (Chrome/Edge: webm, Firefox: ogg, Safari: mp4) thay vì luôn gắn nhãn audio/webm.
 */

/** Thứ tự ưu tiên; backend chỉ chấp nhận các họ định dạng này (xem AudioFormatSniffer). */
export const PREFERRED_RECORDING_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/mp4',
] as const;

/** Trả về MIME đầu tiên trình duyệt hỗ trợ, hoặc undefined để trình duyệt tự chọn mặc định. */
export function pickRecordingMimeType(isTypeSupported?: (mime: string) => boolean): string | undefined {
  if (!isTypeSupported) return undefined;
  return PREFERRED_RECORDING_MIME_TYPES.find((m) => {
    try {
      return isTypeSupported(m);
    } catch {
      return false;
    }
  });
}

/** "audio/webm;codecs=opus" -> "audio/webm" */
export function baseMimeType(mime: string | null | undefined): string {
  if (!mime) return '';
  return mime.split(';')[0].trim().toLowerCase();
}

/**
 * MIME thực tế của bản ghi: ưu tiên giá trị recorder báo cáo, rồi đến giá trị đã yêu cầu.
 * Trả về chuỗi rỗng nếu không xác định được (KHÔNG đoán là webm).
 */
export function resolveRecordedMime(
  recorderMime: string | null | undefined,
  requestedMime: string | null | undefined,
): string {
  return (recorderMime && recorderMime.trim()) || (requestedMime && requestedMime.trim()) || '';
}

export function fileExtensionForMime(mime: string | null | undefined): string {
  switch (baseMimeType(mime)) {
    case 'audio/webm':
    case 'video/webm':
      return 'webm';
    case 'audio/ogg':
      return 'ogg';
    case 'audio/mp4':
    case 'audio/x-m4a':
    case 'audio/m4a':
      return 'm4a';
    case 'audio/wav':
    case 'audio/x-wav':
    case 'audio/wave':
      return 'wav';
    case 'audio/mpeg':
    case 'audio/mp3':
      return 'mp3';
    default:
      return 'bin';
  }
}
