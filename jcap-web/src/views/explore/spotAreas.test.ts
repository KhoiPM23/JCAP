import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shortName, spotAreas, stationState } from './spotAreas.ts';

const NARITA = [
  'Sân bay Narita · Quầy nhập cảnh',
  'Sân bay Narita · Khu nhận hành lý',
  'Sân bay Narita · Quầy SIM và đổi tiền',
  'Sân bay Narita · Sảnh đón khách',
  'Ga sân bay Narita · Làm thẻ IC',
  'Ga sân bay Narita · Mua vé tàu tốc hành',
  'Khách sạn ở Narita · Quầy lễ tân',
  'Chùa Naritasan Shinshoji',
  'Cửa hàng tiện lợi',
];

test('spotAreas: gom mốc liền nhau cùng tiền tố, khu vực một mốc thì bỏ', () => {
  assert.deepEqual(spotAreas(NARITA), [
    { name: 'Sân bay Narita', members: [0, 1, 2, 3] },
    { name: 'Ga sân bay Narita', members: [4, 5] },
  ]);
});

test('spotAreas: cùng tiền tố nhưng không liền nhau thì không gom qua mốc xen giữa', () => {
  assert.deepEqual(spotAreas(['A · 1', 'A · 2', 'Chùa', 'A · 3', 'B · 4', 'A · 5']), [{ name: 'A', members: [0, 1] }]);
  assert.deepEqual(spotAreas([]), []);
  assert.deepEqual(spotAreas(['Công viên Nara', 'Công viên Nara']), []);
});

test('shortName: lấy phần sau dấu phân cách', () => {
  assert.equal(shortName('Khách sạn ở Narita · Quầy lễ tân'), 'Quầy lễ tân');
  assert.equal(shortName('Đền Fushimi Inari'), 'Đền Fushimi Inari');
});

test('stationState: tiến độ đã có được ưu tiên hơn "Tiếp theo"', () => {
  assert.equal(stationState('none', true), 'next');
  assert.equal(stationState('none', false), 'none');
  assert.equal(stationState('understood', true), 'understood');
  assert.equal(stationState('stamp', false), 'stamp');
  assert.equal(stationState('red', false), 'red');
});
