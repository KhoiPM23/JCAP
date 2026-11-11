import assert from 'node:assert';
import test from 'node:test';
import {
  acquireMicStream,
  applyOutputDevice,
  buildDeviceOptions,
  buildMicConstraints,
  describeDeviceStatus,
  describeMicError,
  deviceStatus,
  filterSelectableDevices,
  isDeviceUnavailableError,
  isMicVoiceProcessingEnabled,
  newlyConnected,
  normalizeDeviceId,
  systemDefaultLabel,
} from './audioDevice.ts';

const devs = [{ deviceId: 'default' }, { deviceId: 'communications' }, { deviceId: 'abc' }, { deviceId: 'xyz' }];
const err = (name: string) => Object.assign(new Error(name), { name });

// Danh sách micro giống máy thật (Chrome trên Windows): mục 'default' trỏ tới micro cổng tai nghe Realtek.
const laptopMics = [
  { deviceId: 'default', label: 'Default - Microphone (Realtek(R) Audio)', groupId: 'g-realtek' },
  { deviceId: 'communications', label: 'Communications - Microphone (Realtek(R) Audio)', groupId: 'g-realtek' },
  { deviceId: 'array', label: 'Microphone Array (Intel® Smart Sound Technology for Digital Microphones)', groupId: 'g-intel' },
  { deviceId: 'realtek', label: 'Microphone (Realtek(R) Audio)', groupId: 'g-realtek' },
  { deviceId: 'bt', label: 'Headset (UGREEN HiTune Max5c) (Bluetooth)', groupId: 'g-bt' },
];
// Chưa cấp quyền: trình duyệt vẫn liệt kê nhưng id và tên rỗng.
const noPermission = [{ deviceId: '', label: '' }];

test('Lọc bỏ mục "communications" nhưng giữ mục còn lại', () => {
  assert.deepStrictEqual(filterSelectableDevices(devs).map((d) => d.deviceId), ['default', 'abc', 'xyz']);
});

test('Giá trị lưu: rỗng, null và "default" cũ đều là "Mặc định của hệ thống"', () => {
  assert.strictEqual(normalizeDeviceId(''), '');
  assert.strictEqual(normalizeDeviceId(null), '');
  assert.strictEqual(normalizeDeviceId('default'), '');
  assert.strictEqual(normalizeDeviceId('communications'), '');
  assert.strictEqual(normalizeDeviceId('bt'), 'bt');
});

test('Tên thiết bị mà mặc định của hệ thống đang trỏ tới: theo groupId, không thì bỏ tiền tố "Default - "', () => {
  assert.strictEqual(systemDefaultLabel(laptopMics), 'Microphone (Realtek(R) Audio)');
  assert.strictEqual(systemDefaultLabel([{ deviceId: 'default', label: 'Default - MacBook Pro Microphone' }]), 'MacBook Pro Microphone');
  assert.strictEqual(systemDefaultLabel([{ deviceId: 'a', label: 'Mic A' }]), null); // trình duyệt không có mục 'default'
});

test('Lựa chọn: "Mặc định của hệ thống" luôn đứng đầu, không lặp mục giả của trình duyệt', () => {
  const options = buildDeviceOptions('audioinput', laptopMics, '');
  assert.deepStrictEqual(options[0], { value: '', label: 'Mặc định của hệ thống (hiện là: Microphone (Realtek(R) Audio))' });
  assert.deepStrictEqual(
    options.map((o) => o.value),
    ['', 'array', 'realtek', 'bt'],
  );
});

test('Lựa chọn: không có mục "default" (trình duyệt khác) vẫn có "Mặc định của hệ thống"', () => {
  const options = buildDeviceOptions('audiooutput', [{ deviceId: 'spk', label: 'Speakers' }], '');
  assert.deepStrictEqual(options[0], { value: '', label: 'Mặc định của hệ thống' });
  assert.strictEqual(options[1].label, 'Speakers');
});

test('Thiết bị đã chọn bị rút: vẫn giữ trong danh sách kèm "đã ngắt kết nối", không tự đổi lựa chọn', () => {
  const options = buildDeviceOptions('audioinput', laptopMics, 'usb-cu', 'USB Headset');
  assert.deepStrictEqual(options.at(-1), { value: 'usb-cu', label: 'USB Headset (đã ngắt kết nối)' });
});

test('Chưa cấp quyền: không kiểm chứng được nên không gắn "đã ngắt kết nối"', () => {
  const options = buildDeviceOptions('audioinput', noPermission, 'bt', 'Headset');
  assert.deepStrictEqual(options.map((o) => o.label), ['Mặc định của hệ thống', 'Headset']);
});

test('Trạng thái thiết bị theo đúng thứ tự ưu tiên', () => {
  assert.strictEqual(deviceStatus({ devices: laptopMics, selectedId: '', supported: false }), 'UNAVAILABLE');
  assert.strictEqual(deviceStatus({ devices: laptopMics, selectedId: '', permissionDenied: true }), 'PERMISSION_DENIED');
  assert.strictEqual(deviceStatus({ devices: [], selectedId: '' }), 'NOT_FOUND');
  assert.strictEqual(deviceStatus({ devices: laptopMics, selectedId: '' }), 'DEFAULT');
  assert.strictEqual(deviceStatus({ devices: laptopMics, selectedId: 'default' }), 'DEFAULT');
  assert.strictEqual(deviceStatus({ devices: laptopMics, selectedId: 'bt' }), 'SELECTED');
  assert.strictEqual(deviceStatus({ devices: laptopMics, selectedId: 'usb-cu' }), 'DISCONNECTED');
  assert.strictEqual(deviceStatus({ devices: noPermission, selectedId: 'bt' }), 'SELECTED'); // chưa kiểm chứng được
});

test('Câu hiển thị nói rõ chức năng nào vẫn dùng được', () => {
  assert.match(describeDeviceStatus('audioinput', 'NOT_FOUND'), /vẫn nghe được câu mẫu.*chưa thể ghi âm/);
  assert.match(describeDeviceStatus('audiooutput', 'NOT_FOUND'), /vẫn luyện nói được/);
  assert.match(describeDeviceStatus('audioinput', 'DEFAULT', { systemDefault: 'Mic X' }), /mặc định của hệ thống: Mic X/);
  assert.match(describeDeviceStatus('audioinput', 'DISCONNECTED', { selected: 'USB Headset' }), /USB Headset đã ngắt kết nối/);
  assert.match(describeDeviceStatus('audiooutput', 'UNAVAILABLE'), /loa mặc định của hệ thống/);
});

test('Thiết bị mới cắm vào: chỉ báo thiết bị thật vừa xuất hiện, không báo ở lần liệt kê đầu', () => {
  const before = laptopMics.filter((d) => d.deviceId !== 'bt');
  assert.deepStrictEqual(newlyConnected(before, laptopMics).map((d) => d.deviceId), ['bt']);
  assert.deepStrictEqual(newlyConnected([], laptopMics), []);
  assert.deepStrictEqual(newlyConnected(noPermission, laptopMics), []);
  assert.deepStrictEqual(newlyConnected(laptopMics, laptopMics), []);
});

test('Đặt loa: mặc định không gọi setSinkId; đã chọn thì chờ setSinkId xong; lỗi/không hỗ trợ được báo lại', async () => {
  const calls: string[] = [];
  const el = { setSinkId: async (id: string) => void calls.push(id) };
  assert.strictEqual(await applyOutputDevice(el, ''), 'default');
  assert.strictEqual(await applyOutputDevice(el, 'default'), 'default');
  assert.deepStrictEqual(calls, []);
  assert.strictEqual(await applyOutputDevice(el, 'bt'), 'selected');
  assert.deepStrictEqual(calls, ['bt']);
  assert.strictEqual(await applyOutputDevice({ setSinkId: async () => Promise.reject(err('NotFoundError')) }, 'bt'), 'failed');
  assert.strictEqual(await applyOutputDevice({}, 'bt'), 'unsupported');
});

test('Ràng buộc mic: có deviceId exact khi đã chọn, không có khi để mặc định (kể cả giá trị "default" cũ)', () => {
  assert.deepStrictEqual(buildMicConstraints('abc').deviceId, { exact: 'abc' });
  assert.strictEqual('deviceId' in buildMicConstraints(''), false);
  assert.strictEqual('deviceId' in buildMicConstraints('default'), false);
  assert.strictEqual(buildMicConstraints('', true).autoGainControl, true);
});

test('Tắt khử nhiễu/tự chỉnh âm lượng khi thử nghiệm, khử vọng luôn bật; mặc định bật', () => {
  const raw = buildMicConstraints('', false);
  assert.strictEqual(raw.noiseSuppression, false);
  assert.strictEqual(raw.autoGainControl, false);
  assert.strictEqual(raw.echoCancellation, true);
  assert.strictEqual(isMicVoiceProcessingEnabled({ getItem: () => null }), true);
  assert.strictEqual(isMicVoiceProcessingEnabled({ getItem: () => 'off' }), false);
  const blocked = { getItem: () => { throw new Error('SecurityError'); } };
  assert.strictEqual(isMicVoiceProcessingEnabled(blocked), true);
});

test('Nhận diện lỗi thiết bị không còn, không nhầm với lỗi quyền', () => {
  assert.strictEqual(isDeviceUnavailableError(err('OverconstrainedError')), true);
  assert.strictEqual(isDeviceUnavailableError(err('NotFoundError')), true);
  assert.strictEqual(isDeviceUnavailableError(err('NotAllowedError')), false);
  assert.strictEqual(isDeviceUnavailableError(err('NotReadableError')), false);
  assert.strictEqual(isDeviceUnavailableError(null), false);
});

test('Thông báo lỗi mic đúng nguyên nhân', () => {
  assert.match(describeMicError(err('NotAllowedError')), /chặn quyền/);
  assert.match(describeMicError(err('NotFoundError')), /Không tìm thấy micro/);
  assert.match(describeMicError(err('NotReadableError')), /ứng dụng khác/);
  assert.match(describeMicError(err('Lạ')), /Không mở được micro/);
});

test('acquireMicStream: thiết bị đã chọn dùng được thì không dự phòng', async () => {
  const calls: unknown[] = [];
  const stream = { id: 's1' } as unknown as MediaStream;
  const r = await acquireMicStream('abc', { getUserMedia: async (c) => (calls.push(c), stream) });
  assert.strictEqual(r.stream, stream);
  assert.strictEqual(r.usedFallback, false);
  assert.strictEqual(calls.length, 1);
});

test('acquireMicStream: id cũ gây OverconstrainedError thì thử lại bằng mic mặc định và báo usedFallback', async () => {
  const seen: (string | undefined)[] = [];
  const stream = { id: 's2' } as unknown as MediaStream;
  const r = await acquireMicStream('stale', {
    getUserMedia: async (c) => {
      const exact = ((c.audio as MediaTrackConstraints).deviceId as { exact?: string } | undefined)?.exact;
      seen.push(exact);
      if (exact) throw err('OverconstrainedError');
      return stream;
    },
  });
  assert.strictEqual(r.usedFallback, true);
  assert.deepStrictEqual(seen, ['stale', undefined]);
});

test('acquireMicStream: lỗi quyền được ném lại, không thử lại', async () => {
  let n = 0;
  await assert.rejects(
    acquireMicStream('abc', { getUserMedia: async () => (n++, Promise.reject(err('NotAllowedError'))) }),
    (e: Error) => e.name === 'NotAllowedError',
  );
  assert.strictEqual(n, 1);
});

test('acquireMicStream: tắt dự phòng thì ném lỗi thiết bị không còn', async () => {
  await assert.rejects(
    acquireMicStream('stale', { fallbackToDefault: false, getUserMedia: async () => Promise.reject(err('OverconstrainedError')) }),
    (e: Error) => e.name === 'OverconstrainedError',
  );
});
