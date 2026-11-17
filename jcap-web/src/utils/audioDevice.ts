/**
 * Chọn thiết bị âm thanh: khóa lưu trữ, đối chiếu id đã lưu với danh sách thiết bị thật, và mở micro có dự phòng.
 * Phần lớn là hàm thuần để kiểm thử được (xem audioDevice.test.ts).
 */

export const INPUT_DEVICE_STORAGE_KEY = 'jcap_audio_input_device';
export const OUTPUT_DEVICE_STORAGE_KEY = 'jcap_audio_output_device';
/** Tên thiết bị lúc chọn: để còn gọi được tên khi thiết bị đã bị rút (trình duyệt không trả tên thiết bị vắng mặt). */
export const INPUT_LABEL_STORAGE_KEY = 'jcap_audio_input_device_label';
export const OUTPUT_LABEL_STORAGE_KEY = 'jcap_audio_output_device_label';

/**
 * Giá trị lưu cho "Mặc định của hệ thống": KHÔNG ràng buộc thiết bị, hệ điều hành tự chọn.
 * Trình duyệt không cho biết thiết bị nào là mic/loa gắn sẵn trong máy, nên "mặc định" luôn là thiết bị mà
 * Windows/macOS đang chọn (laptop không cắm gì thì chính là mic/loa của máy).
 */
export const SYSTEM_DEFAULT_DEVICE = '';

export type AudioDeviceKind = 'audioinput' | 'audiooutput';

export interface DeviceLike {
  deviceId: string;
  label?: string;
  groupId?: string;
}

/** Chrome thêm mục "communications" trùng với một thiết bị thật, chọn nó chỉ gây nhầm. */
export function filterSelectableDevices<T extends DeviceLike>(devices: T[]): T[] {
  return devices.filter((d) => d.deviceId !== 'communications');
}

/** Mục giả của trình duyệt ('default', 'communications') và mục rỗng (chưa cấp quyền) không phải thiết bị thật. */
const isRealDevice = (d: DeviceLike) => !!d.deviceId && d.deviceId !== 'default' && d.deviceId !== 'communications';

/** Id đã lưu → id dùng thật. 'default' (giá trị cũ) và rỗng đều là "Mặc định của hệ thống". */
export function normalizeDeviceId(id: string | null | undefined): string {
  if (!id || id === 'default' || id === 'communications') return SYSTEM_DEFAULT_DEVICE;
  return id;
}

/** Danh sách có id thật (đã cấp quyền) thì mới kiểm chứng được thiết bị đã lưu còn hay không. */
const canVerify = (devices: DeviceLike[]) => devices.some((d) => !!d.deviceId);

/**
 * Tên thiết bị thật mà "mặc định của hệ thống" đang trỏ tới. Chrome/Edge có mục deviceId 'default' cùng groupId với
 * thiết bị thật; không khớp được thì bỏ tiền tố "Default - " của nhãn. Trình duyệt không có mục này thì trả null.
 */
export function systemDefaultLabel(devices: DeviceLike[]): string | null {
  const def = devices.find((d) => d.deviceId === 'default');
  if (!def) return null;
  const twin = def.groupId ? devices.find((d) => isRealDevice(d) && d.groupId === def.groupId && !!d.label) : undefined;
  if (twin?.label) return twin.label;
  const stripped = (def.label ?? '').replace(/^\s*(default|mặc định)\s*[-–—:]\s*/i, '').trim();
  return stripped || null;
}

export interface DeviceOption {
  value: string;
  label: string;
}

/**
 * Lựa chọn cho hộp chọn thiết bị: luôn có "Mặc định của hệ thống" đứng đầu, sau đó các thiết bị thật (bỏ mục giả trùng lặp).
 * Thiết bị người dùng đã chọn mà đang vắng mặt vẫn được giữ trong danh sách (kèm "đã ngắt kết nối"), không tự đổi lựa chọn.
 */
export function buildDeviceOptions(
  kind: AudioDeviceKind,
  devices: DeviceLike[],
  selectedId: string,
  selectedLabel?: string | null,
): DeviceOption[] {
  const noun = kind === 'audioinput' ? 'Micro' : 'Loa';
  const systemName = systemDefaultLabel(devices);
  const options: DeviceOption[] = [
    {
      value: SYSTEM_DEFAULT_DEVICE,
      label: systemName ? `Mặc định của hệ thống (hiện là: ${systemName})` : 'Mặc định của hệ thống',
    },
  ];

  const real = devices.filter(isRealDevice);
  real.forEach((d, i) => options.push({ value: d.deviceId, label: d.label || `${noun} ${i + 1}` }));

  const id = normalizeDeviceId(selectedId);
  if (id && !real.some((d) => d.deviceId === id)) {
    const name = selectedLabel || `${noun} đã chọn`;
    options.push({ value: id, label: canVerify(devices) ? `${name} (đã ngắt kết nối)` : name });
  }
  return options;
}

export type DeviceStatus = 'DEFAULT' | 'SELECTED' | 'NOT_FOUND' | 'DISCONNECTED' | 'PERMISSION_DENIED' | 'UNAVAILABLE';

/**
 * Trạng thái thiết bị theo thứ tự ưu tiên: trình duyệt không hỗ trợ → chưa cấp quyền → không có thiết bị nào →
 * thiết bị đã chọn vắng mặt → đang dùng mặc định / đang dùng thiết bị đã chọn.
 */
export function deviceStatus(params: {
  devices: DeviceLike[];
  selectedId: string;
  permissionDenied?: boolean;
  supported?: boolean;
}): DeviceStatus {
  const { devices, selectedId, permissionDenied = false, supported = true } = params;
  if (!supported) return 'UNAVAILABLE';
  if (permissionDenied) return 'PERMISSION_DENIED';
  if (devices.length === 0) return 'NOT_FOUND';
  const id = normalizeDeviceId(selectedId);
  if (!id) return 'DEFAULT';
  if (canVerify(devices) && !devices.some((d) => d.deviceId === id)) return 'DISCONNECTED';
  return 'SELECTED';
}

/** Câu hiển thị cho từng trạng thái (đúng nguyên nhân, nói rõ chức năng nào vẫn dùng được). */
export function describeDeviceStatus(
  kind: AudioDeviceKind,
  status: DeviceStatus,
  names: { selected?: string | null; systemDefault?: string | null } = {},
): string {
  const mic = kind === 'audioinput';
  switch (status) {
    case 'DEFAULT':
      return `Đang dùng ${mic ? 'micro' : 'loa'} mặc định của hệ thống${names.systemDefault ? `: ${names.systemDefault}` : ''}.`;
    case 'SELECTED':
      return `Đang dùng: ${names.selected || (mic ? 'micro đã chọn' : 'loa đã chọn')}.`;
    case 'DISCONNECTED':
      return `${names.selected || (mic ? 'Micro đã chọn' : 'Loa đã chọn')} đã ngắt kết nối. Đang tạm dùng ${
        mic ? 'micro' : 'loa'
      } mặc định của hệ thống; cắm lại thiết bị hoặc chọn thiết bị khác.`;
    case 'NOT_FOUND':
      return mic
        ? 'Không tìm thấy micro. Bạn vẫn nghe được câu mẫu nhưng chưa thể ghi âm.'
        : 'Không tìm thấy loa. Bạn vẫn luyện nói được nhưng có thể không nghe được câu mẫu.';
    case 'PERMISSION_DENIED':
      return 'Chưa cấp quyền micro cho trang này. Hãy cho phép micro để chọn thiết bị và ghi âm.';
    case 'UNAVAILABLE':
      return mic
        ? 'Trình duyệt này không hỗ trợ thu âm. Hãy dùng Chrome hoặc Edge.'
        : 'Trình duyệt này không cho chọn loa; âm thanh phát qua loa mặc định của hệ thống.';
  }
}

/** Thiết bị thật mới xuất hiện so với lần liệt kê trước (để báo "Đã kết nối: …"). */
export function newlyConnected<T extends DeviceLike>(previous: DeviceLike[], next: T[]): T[] {
  if (!canVerify(previous)) return []; // lần đầu hoặc chưa cấp quyền: không có gì để so
  const known = new Set(previous.map((d) => d.deviceId));
  return next.filter((d) => isRealDevice(d) && !known.has(d.deviceId));
}

export type OutputRouting = 'default' | 'selected' | 'failed' | 'unsupported';

/**
 * Đặt thiết bị phát cho một phần tử âm thanh và CHỜ xong trước khi phát (gọi play() trước khi setSinkId xong thì
 * đoạn đầu có thể phát ra loa mặc định). "Mặc định của hệ thống" thì không gọi setSinkId.
 */
export async function applyOutputDevice(
  element: { setSinkId?: (id: string) => Promise<void> } | null | undefined,
  deviceId: string,
): Promise<OutputRouting> {
  const id = normalizeDeviceId(deviceId);
  if (!id) return 'default';
  if (!element || typeof element.setSinkId !== 'function') return 'unsupported';
  try {
    await element.setSinkId(id);
    return 'selected';
  } catch {
    return 'failed';
  }
}

/**
 * Ràng buộc mic dùng chung cho thu âm và thử mic, để mức âm lượng khi thử đúng với khi thu thật.
 * Khử vọng, khử nhiễu và tự chỉnh âm lượng của trình duyệt luôn BẬT (micro laptop thường rất nhỏ khi tắt tự chỉnh âm lượng).
 */
export function buildMicConstraints(deviceId?: string): MediaTrackConstraints {
  return {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: 1,
    sampleRate: 48000,
    ...(normalizeDeviceId(deviceId) ? { deviceId: { exact: normalizeDeviceId(deviceId) } } : {}),
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
    if (!normalizeDeviceId(deviceId) || !fallbackToDefault || !isDeviceUnavailableError(err)) throw err;
    return { stream: await getUserMedia({ audio: buildMicConstraints() }), usedFallback: true };
  }
}
