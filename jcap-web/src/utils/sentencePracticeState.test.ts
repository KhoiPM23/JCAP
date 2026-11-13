import { test } from 'node:test';
import assert from 'node:assert/strict';
import { entriesFromServer, initialEntry, mergeServerStates, nextSentenceState, type SentenceEvent, type SentenceStateEntry } from './sentencePracticeState.ts';

test('phản hồi server đến muộn không xóa bản ghi chưa gửi của câu đang thu', () => {
  const current = new Map<number, SentenceStateEntry>([
    [1, { state: 'RECORDED', persisted: 'NOT_STARTED' }],
    [3, { state: 'EVALUATED', persisted: 'EVALUATED' }],
  ]);
  const merged = mergeServerStates(current, [
    { sentenceId: 1, state: 'EVALUATION_FAILED' },
    { sentenceId: 3, state: 'EVALUATED' },
    { sentenceId: 5, state: 'NOT_STARTED' },
  ]);
  assert.deepEqual(merged.get(1), { state: 'RECORDED', persisted: 'EVALUATION_FAILED' });
  assert.deepEqual(merged.get(3), { state: 'EVALUATED', persisted: 'EVALUATED' });
  assert.deepEqual(merged.get(5), { state: 'NOT_STARTED', persisted: 'NOT_STARTED' });
});

const run = (start: SentenceStateEntry, ...events: SentenceEvent[]) => events.reduce(nextSentenceState, start);

test('thu → dừng → nghe lại → gửi → có điểm', () => {
  const end = run(initialEntry(), { type: 'START_RECORDING' }, { type: 'STOP_RECORDING', hasAudio: true }, { type: 'SUBMIT' }, { type: 'RESULT', scored: true });
  assert.deepEqual(end, { state: 'EVALUATED', persisted: 'EVALUATED' });
});

test('dừng mà không có âm thanh: về trạng thái server, không có gì để gửi', () => {
  const end = run(initialEntry(), { type: 'START_RECORDING' }, { type: 'STOP_RECORDING', hasAudio: false });
  assert.equal(end.state, 'NOT_STARTED');
  assert.equal(nextSentenceState(end, { type: 'SUBMIT' }).state, 'NOT_STARTED'); // không gửi khi chưa có bản ghi
});

test('thu lại khi đang có bản ghi chưa gửi: bỏ bản cũ, ghi mới', () => {
  const recorded = run(initialEntry(), { type: 'START_RECORDING' }, { type: 'STOP_RECORDING', hasAudio: true });
  assert.equal(nextSentenceState(recorded, { type: 'START_RECORDING' }).state, 'RECORDING');
});

test('hủy khi đang ghi hoặc đã thu: về trạng thái đã có ở server (giữ kết quả cũ)', () => {
  const evaluated = initialEntry('EVALUATED');
  assert.equal(run(evaluated, { type: 'START_RECORDING' }, { type: 'CANCEL' }).state, 'EVALUATED');
  assert.equal(run(evaluated, { type: 'START_RECORDING' }, { type: 'STOP_RECORDING', hasAudio: true }, { type: 'CANCEL' }).state, 'EVALUATED');
});

test('chưa chấm được → EVALUATION_FAILED; nhưng câu đã từng chấm được vẫn là EVALUATED', () => {
  const fresh = run(initialEntry(), { type: 'START_RECORDING' }, { type: 'STOP_RECORDING', hasAudio: true }, { type: 'SUBMIT' }, { type: 'RESULT', scored: false });
  assert.deepEqual(fresh, { state: 'EVALUATION_FAILED', persisted: 'EVALUATION_FAILED' });

  const before = run(initialEntry('EVALUATED'), { type: 'START_RECORDING' }, { type: 'STOP_RECORDING', hasAudio: true }, { type: 'SUBMIT' }, { type: 'RESULT', scored: false });
  assert.equal(before.state, 'EVALUATED');
});

test('lỗi mạng/quá hạn khi chấm: quay về RECORDED để gửi lại, không kẹt ở EVALUATING', () => {
  const failed = run(initialEntry(), { type: 'START_RECORDING' }, { type: 'STOP_RECORDING', hasAudio: true }, { type: 'SUBMIT' }, { type: 'REQUEST_FAILED' });
  assert.equal(failed.state, 'RECORDED');
  assert.equal(nextSentenceState(failed, { type: 'SUBMIT' }).state, 'EVALUATING');
});

test('đang chấm thì không bắt đầu ghi mới và kết quả đến muộn không làm hỏng trạng thái khác', () => {
  const evaluating = run(initialEntry(), { type: 'START_RECORDING' }, { type: 'STOP_RECORDING', hasAudio: true }, { type: 'SUBMIT' });
  assert.equal(nextSentenceState(evaluating, { type: 'START_RECORDING' }).state, 'EVALUATING');
  assert.equal(nextSentenceState(initialEntry(), { type: 'RESULT', scored: true }).state, 'NOT_STARTED');
});

test('khôi phục từ server: chỉ có trạng thái lưu được, không có RECORDING/EVALUATING', () => {
  const map = entriesFromServer([
    { sentenceId: 1, state: 'EVALUATED' },
    { sentenceId: 3, state: 'EVALUATION_FAILED' },
  ]);
  assert.deepEqual(map.get(1), { state: 'EVALUATED', persisted: 'EVALUATED' });
  assert.deepEqual(map.get(3), { state: 'EVALUATION_FAILED', persisted: 'EVALUATION_FAILED' });
});
