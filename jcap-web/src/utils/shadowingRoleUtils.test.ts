import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeSpeakerRole,
  ensureRolesCoverSentences,
  getDialogueRoleName,
} from './shadowingRoleUtils.ts';

test('1. Giữ nguyên role đơn ký tự (A, B, C, D)', () => {
  const roles = ['Khách hàng', 'Nhân viên', 'Quản lý'];
  assert.equal(normalizeSpeakerRole('A', roles), 'A');
  assert.equal(normalizeSpeakerRole('B', roles), 'B');
  assert.equal(normalizeSpeakerRole('C', roles), 'C');
  assert.equal(normalizeSpeakerRole('D', roles), 'D');
  assert.equal(normalizeSpeakerRole('b', roles), 'B');
});

test('2. Không tự động luân phiên giữa 2 vai khi các câu không xen kẽ', () => {
  const roles = ['Khách hàng', 'Nhân viên'];
  const sequence = ['A', 'A', 'A', 'B', 'B', 'A'];
  const mapped = sequence.map((r) => normalizeSpeakerRole(r, roles));
  assert.deepEqual(mapped, ['A', 'A', 'A', 'B', 'B', 'A']);
});

test('3. Ánh xạ các tiền tố Vai / Role / Speaker / Nhân vật', () => {
  const roles = ['Vai A', 'Vai B', 'Vai C'];
  assert.equal(normalizeSpeakerRole('Vai A', roles), 'A');
  assert.equal(normalizeSpeakerRole('vai b', roles), 'B');
  assert.equal(normalizeSpeakerRole('Role C', roles), 'C');
  assert.equal(normalizeSpeakerRole('Speaker A', roles), 'A');
  assert.equal(normalizeSpeakerRole('Nhân vật B', roles), 'B');
});

test('4. Ánh xạ dạng số thứ tự (Vai 1, Vai 2, Vai 3, 1, 2, 3)', () => {
  const roles = ['Khách hàng', 'Nhân viên', 'Quản lý'];
  assert.equal(normalizeSpeakerRole('1', roles), 'A');
  assert.equal(normalizeSpeakerRole('2', roles), 'B');
  assert.equal(normalizeSpeakerRole('3', roles), 'C');
  assert.equal(normalizeSpeakerRole('Vai 1', roles), 'A');
  assert.equal(normalizeSpeakerRole('Vai 3', roles), 'C');
});

test('5. Ánh xạ đúng tên vai hiển thị từ danh sách roles sang ID chữ cái (A, B, C)', () => {
  const roles = ['Khách hàng (Học viên)', 'Nhân viên phục vụ', 'Bếp trưởng'];
  assert.equal(normalizeSpeakerRole('Khách hàng (Học viên)', roles), 'A');
  assert.equal(normalizeSpeakerRole('Nhân viên phục vụ', roles), 'B');
  assert.equal(normalizeSpeakerRole('Bếp trưởng', roles), 'C');
  // Khớp gần đúng / chứa từ
  assert.equal(normalizeSpeakerRole('Khách hàng', roles), 'A');
  assert.equal(normalizeSpeakerRole('Bếp', roles), 'C');
});

test('6. ensureRolesCoverSentences mở rộng danh sách roles khi câu dùng từ 3 vai trở lên', () => {
  const initialRoles = ['Khách hàng', 'Nhân viên'];
  const sentences = [
    { speakerRole: 'A' },
    { speakerRole: 'B' },
    { speakerRole: 'C' },
    { speakerRole: 'D' },
  ];

  const coveredRoles = ensureRolesCoverSentences(initialRoles, sentences);
  assert.equal(coveredRoles.length, 4);
  assert.equal(coveredRoles[0], 'Khách hàng');
  assert.equal(coveredRoles[1], 'Nhân viên');
  assert.equal(coveredRoles[2], 'Nhân vật C');
  assert.equal(coveredRoles[3], 'Nhân vật D');
});

test('7. getDialogueRoleName lấy đúng tên hiển thị cho vai từ 3 vai trở lên', () => {
  const dialogue = {
    speakerRoles: ['Khách hàng', 'Nhân viên', 'Bác sĩ'],
    speakerRoleA_Name: 'Khách hàng',
    speakerRoleB_Name: 'Nhân viên',
  };

  assert.equal(getDialogueRoleName(dialogue, 'A'), 'Khách hàng');
  assert.equal(getDialogueRoleName(dialogue, 'B'), 'Nhân viên');
  assert.equal(getDialogueRoleName(dialogue, 'C'), 'Bác sĩ');
});
