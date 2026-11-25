import test from 'node:test';
import assert from 'node:assert/strict';
import type { ShadowingDialogueItem } from '../../types/shadowing';
import type { ShadowingProgress } from '../../types/shadowingProgress';
import { bestScores, buildTopics, previewAction, scoreTone } from './library.ts';

const item = (id: number, scenarioTitle: string, jlptLevel: 'N5' | 'N4' | 'N3') =>
  ({ id, scenarioTitle, jlptLevel, title: `Bài ${id}`, totalSentences: 6 }) as ShadowingDialogueItem;

const progress = (status: 'IN_PROGRESS' | 'COMPLETED', role: 'A' | 'B', index = 1) =>
  ({ status, role, currentSentenceIndex: index, completedSentenceCount: index }) as ShadowingProgress;

test('chủ đề giữ thứ tự, đếm bài xong và đang học, cấp dễ đứng trước', () => {
  const topics = buildTopics([item(1, 'Sân bay', 'N4'), item(2, '', 'N5'), item(3, 'Sân bay', 'N5')], (id) =>
    id === 1 ? 'done' : id === 3 ? 'progress' : 'none',
  );
  assert.deepEqual(topics.map((t) => t.name), ['Sân bay', 'Giao tiếp tình huống']);
  assert.deepEqual([topics[0].done, topics[0].inProgress, topics[0].total, topics[0].levels], [1, 1, 2, ['N5', 'N4']]);
});

test('điểm cao nhất theo bài và ngưỡng màu', () => {
  const best = bestScores([{ dialogueId: 1, averageScore: 40 }, { dialogueId: 1, averageScore: 81 }, { dialogueId: 2 }]);
  assert.equal(best.get(1), 81);
  assert.equal(best.get(2), 0);
  assert.deepEqual([scoreTone(80), scoreTone(50), scoreTone(49)], ['good', 'mid', 'low']);
});

test('nút chính: chưa học, đang học cùng vai, đã xong', () => {
  assert.equal(previewAction(7, 'A', null).url, '/shadowing/practice/7?role=A');
  // Mới mở trang, chưa xong câu nào: vẫn là chưa học
  assert.equal(previewAction(7, 'A', progress('IN_PROGRESS', 'A', 0)).label, 'Bắt đầu với vai A');
  const resume = previewAction(7, 'B', progress('IN_PROGRESS', 'B', 2));
  assert.equal(resume.label, 'Tiếp tục câu 3');
  assert.equal(resume.url, '/shadowing/practice/7?role=B&resume=true');
  assert.equal(resume.alt?.url, '/shadowing/practice/7?role=B&restart=true');
  assert.equal(previewAction(7, 'A', progress('COMPLETED', 'A')).url, '/shadowing/practice/7?role=A&restart=true');
});

test('đổi vai không gửi restart để không mất tiến độ đã có của vai đó', () => {
  const switched = previewAction(7, 'A', progress('IN_PROGRESS', 'B', 2));
  assert.equal(switched.url, '/shadowing/practice/7?role=A');
  assert.equal(switched.label, 'Luyện với vai A');
  assert.equal(switched.alt?.role, 'B');
  assert.match(switched.note ?? '', /vai B vẫn được giữ/);
  const afterDone = previewAction(7, 'B', progress('COMPLETED', 'A'));
  assert.equal(afterDone.url, '/shadowing/practice/7?role=B');
  assert.equal(afterDone.note, undefined);
});
