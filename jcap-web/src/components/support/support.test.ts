import test from 'node:test';
import assert from 'node:assert/strict';
import type { FeedbackTicket } from '../../services/feedbackService';
import { buildTimeline, countByStatus, filterTickets, lastIncomingId, supportTickets } from './thread.ts';
import { fileProblem } from './files.ts';

const at = (minute: number) => `2026-11-20T10:${String(minute).padStart(2, '0')}:00Z`;
const msg = (id: number, senderRole: 'LEARNER' | 'ADMIN', minute: number) => ({
  id,
  ticketId: 1,
  senderRole,
  content: `tin ${id}`,
  attachments: [],
  createdAt: at(minute),
});
const ticket = (id: number, over: Partial<FeedbackTicket> = {}): FeedbackTicket => ({
  id,
  anonymousCode: `#ANON-${1000 + id}`,
  title: `Phiếu ${id}`,
  category: 'SYSTEM_BUG',
  status: 'PENDING',
  createdAt: at(id),
  updatedAt: at(id),
  messages: [],
  ...over,
});

test('phiếu sự cố bỏ góp ý, xếp theo ngày cập nhật; đếm và lọc theo trạng thái, mã, tiêu đề', () => {
  const list = supportTickets([ticket(1), ticket(2, { category: 'SUGGESTION' }), ticket(3, { status: 'CLOSED' })]);
  assert.deepEqual(list.map((t) => t.id), [3, 1]);
  assert.deepEqual(countByStatus(list), { ALL: 2, PENDING: 1, IN_PROGRESS: 0, CLOSED: 1 });
  assert.deepEqual(filterTickets(list, 'CLOSED').map((t) => t.id), [3]);
  assert.deepEqual(filterTickets(list, 'ALL', 'anon-1001').map((t) => t.id), [1]);
  assert.deepEqual(filterTickets(list, 'ALL', 'phiếu 3').map((t) => t.id), [3]);
});

test('luồng tin: mốc đã xem đứng trước câu trả lời cùng lúc, mốc đóng chỉ có khi phiếu đang đóng', () => {
  const t = ticket(1, {
    status: 'CLOSED',
    adminSeenAt: at(5),
    closedAt: at(9),
    messages: [msg(1, 'LEARNER', 1), msg(2, 'ADMIN', 5)],
  });
  assert.deepEqual(buildTimeline(t).map((i) => i.key), ['m-1', 'seen', 'm-2', 'closed']);
  assert.deepEqual(buildTimeline({ ...t, status: 'IN_PROGRESS' }).map((i) => i.key), ['m-1', 'seen', 'm-2']);
  assert.equal(lastIncomingId(t, 'learner'), 2);
  assert.equal(lastIncomingId(t, 'admin'), 1);
});

test('tệp đính kèm: chặn định dạng lạ và tệp quá 5MB trước khi tải lên', () => {
  assert.equal(fileProblem('anh.PNG', 1000), null);
  assert.equal(fileProblem('video.mp4', 1000), 'Định dạng .mp4 chưa được hỗ trợ.');
  assert.match(fileProblem('hoa-don.pdf', 6.4 * 1024 * 1024) ?? '', /6,4 MB, lớn hơn 5MB/);
});
