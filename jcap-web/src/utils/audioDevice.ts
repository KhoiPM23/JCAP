/**
 * Chọn thiết bị âm thanh: khóa lưu trữ, đối chiếu id đã lưu với danh sách thiết bị thật, và mở micro có dự phòng.
 * Phần lớn là hàm thuần để kiểm thử được (xem audioDevice.test.ts).
 */

export const INPUT_DEVICE_STORAGE_KEY = 'jcap_audio_input_device';
export const OUTPUT_DEVICE_STORAGE_KEY = 'jcap_audio_output_device';

export interface DeviceLike {
  deviceId: string;
  label?: string;
}

export interface DeviceResolution {
  /** id nên hiển thị và lưu ('' nếu chưa có thiết bị nào để chọn). */
  id: string;
  /** true nếu id đã lưu không còn trong danh sách nên đã chuyển sang thiết bị dự phòng. */
  missing: boolean;
}

/** Chrome thêm mục "communications" trùng với một thiết bị thật, chọn nó chỉ gây nhầm. */
export function filterSelectableDevices<T extends DeviceLike>(devices: T[]): T[] {
  return devices.filter((d) => d.deviceId !== 'communications');
}

/**
 * Đối chiếu id đã lưu với danh sách thiết bị hiện tại.
 * - Chưa lưu gì: dùng thiết bị mặc định (mục "default" nếu có, không thì mục đầu tiên).
 * - Đã lưu và còn trong danh sách: giữ nguyên.
 * - Đã lưu nhưng không còn (rút tai nghe, đổi máy): chuyển sang thiết bị mặc định và báo missing.
 * - Chưa cấp quyền nên danh sách không có id thật (deviceId rỗng): không kiểm chứng được, giữ nguyên id đã lưu.
 */
export function resolveDeviceSelection(savedId: string, devices: DeviceLike[]): DeviceResolution {
  const usable = devices.filter((d) => !!d.deviceId);
  if (usable.length === 0) return { id: savedId, missing: false };

  const fallback = (usable.find((d) => d.deviceId === 'default') ?? usable[0]).deviceId;
  if (!savedId) return { id: fallback, missing: false };
  if (usable.some((d) => d.deviceId === savedId)) return { id: savedId, missing: false };
  return { id: fallback, missing: true };
}

/** Ràng buộc mic dùng chung cho thu âm và thử mic, để mức âm lượng khi thử đúng với khi thu thật. */
export function buildMicConstraints(deviceId?: string): MediaTrackConstraints {
  return {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: 1,
    sampleRate: 48000,
    ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
  };
}

const errorName = (err: unknown): string =>
  typeof err === 'object' && err !== null && 'name' in err ? String((err as { name: unknown }).name) : '';

/** Thiết bị được chọn không còn / không đáp ứng được ràng buộc. Thử lại bằng thiết bị mặc định sẽ có ích. */
export function isDeviceUnavailableError(err: unknown): boolean {
  const name = errorName(err);
  return name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError' || name === 'NotFoundError';
}

export function isPermissionDeniedError(err: unknown): boolean {
  const name = errorName(err);
  return name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError';
}

/** Thông báo cho người học theo đúng nguyên nhân lỗi mở micro. */
export function describeMicError(err: unknown): string {
  if (isPermissionDeniedError(err)) {
    return 'Trình duyệt đang chặn quyền dùng micro. Hãy cho phép micro cho trang này rồi thử lại.';
  }
  if (errorName(err) === 'NotFoundError' || errorName(err) === 'OverconstrainedError') {
    return 'Không tìm thấy micro nào đang kết nối. Hãy cắm micro hoặc tai nghe rồi thử lại.';
  }
  if (errorName(err) === 'NotReadableError' || errorName(err) === 'AbortError') {
    return 'Không mở được micro. Có thể ứng dụng khác đang dùng micro hoặc thiết bị bị lỗi.';
  }
  return 'Không mở được micro. Hãy kiểm tra thiết bị rồi thử lại.';
}

export interface AcquiredMic {
  stream: MediaStream;
  /** true nếu thiết bị đã chọn không dùng được nên đang dùng micro mặc định. */
  usedFallback: boolean;
}

type GetUserMedia = (constraints: MediaStreamConstraints) => Promise<MediaStream>;

/**
 * Mở micro theo thiết bị đã chọn. Nếu thiết bị đó không còn (OverconstrainedError / NotFoundError) và cho phép dự phòng,
 * thử lại bằng micro mặc định để buổi luyện không đứng im; lỗi khác (quyền, thiết bị bận) được ném lại nguyên vẹn.
 */
export async function acquireMicStream(
  deviceId: string,
  options: { fallbackToDefault?: boolean; getUserMedia?: GetUserMedia } = {},
): Promise<AcquiredMic> {
  const { fallbackToDefault = true, getUserMedia = (c) => navigator.mediaDevices.getUserMedia(c) } = options;
  try {
    return { stream: await getUserMedia({ audio: buildMicConstraints(deviceId) }), usedFallback: false };
  } catch (err) {
    if (!deviceId || !fallbackToDefault || !isDeviceUnavailableError(err)) throw err;
    return { stream: await getUserMedia({ audio: buildMicConstraints() }), usedFallback: true };
  }
}
