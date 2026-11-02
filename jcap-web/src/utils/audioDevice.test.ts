import assert from 'node:assert';
import test from 'node:test';
import {
  acquireMicStream,
  buildMicConstraints,
  describeMicError,
  filterSelectableDevices,
  isDeviceUnavailableError,
  resolveDeviceSelection,
} from './audioDevice.ts';

const devs = [{ deviceId: 'default' }, { deviceId: 'communications' }, { deviceId: 'abc' }, { deviceId: 'xyz' }];
const err = (name: string) => Object.assign(new Error(name), { name });

test('Lọc bỏ mục "communications" nhưng giữ mục còn lại', () => {
  assert.deepStrictEqual(filterSelectableDevices(devs).map((d) => d.deviceId), ['default', 'abc', 'xyz']);
});

test('Chưa lưu gì: chọn mục "default"; không có "default" thì mục đầu tiên', () => {
  assert.deepStrictEqual(resolveDeviceSelection('', devs), { id: 'default', missing: false });
  assert.deepStrictEqual(resolveDeviceSelection('', [{ deviceId: 'a' }, { deviceId: 'b' }]), { id: 'a', missing: false });
});

test('Id đã lưu còn trong danh sách: giữ nguyên', () => {
  assert.deepStrictEqual(resolveDeviceSelection('xyz', devs), { id: 'xyz', missing: false });
});

test('Id đã lưu không còn: chuyển sang mặc định và báo missing', () => {
  assert.deepStrictEqual(resolveDeviceSelection('da-rut-tai-nghe', devs), { id: 'default', missing: true });
});

test('Chưa cấp quyền (deviceId rỗng) hoặc danh sách trống: không kiểm chứng được nên giữ id đã lưu', () => {
  assert.deepStrictEqual(resolveDeviceSelection('abc', [{ deviceId: '' }]), { id: 'abc', missing: false });
  assert.deepStrictEqual(resolveDeviceSelection('abc', []), { id: 'abc', missing: false });
});

test('Ràng buộc mic: có deviceId exact khi đã chọn, không có khi để mặc định', () => {
  assert.deepStrictEqual(buildMicConstraints('abc').deviceId, { exact: 'abc' });
  assert.strictEqual('deviceId' in buildMicConstraints(''), false);
  assert.strictEqual(buildMicConstraints().autoGainControl, true);
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
