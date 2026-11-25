import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWordFeedback, issueLabel } from './wordFeedback.ts';
import type { ShadowingDiffToken } from '../types/shadowing.ts';

test('chỉ các từ chưa đúng thành mục nhận xét, đúng thứ tự trong câu, bỏ dấu câu', () => {
  const tokens: ShadowingDiffToken[] = [
    { text: '成田', status: 'correct' },
    {
      text: 'エクスプレス', status: 'mismatched', spokenPart: 'えっくすぷれす', expectedReading: 'えくすぷれす', errorType: 'sokuon',
      issues: [{ kind: 'extra', spoken: 'っ', after: 'え', errorType: 'sokuon', message: 'Thừa âm ngắt 「っ」 sau 「え」', hint: 'Nối liền hai âm, không dừng hơi.' }],
    },
    { text: 'ですね。', status: 'missing', expectedReading: 'ですね' },
  ];
  const items = buildWordFeedback(tokens);
  assert.equal(items.length, 2);
  assert.deepEqual(items[0], {
    kind: 'mismatched', word: 'エクスプレス', expected: 'えくすぷれす', spoken: 'えっくすぷれす', issues: tokens[1].issues,
  });
  assert.deepEqual(items[1], { kind: 'missing', word: 'ですね', expected: null }); // cách đọc trùng chữ thì không nhắc lại
});

test('âm nói thừa thành một mục riêng, nêu vị trí theo từ của câu mẫu, viết hiragana', () => {
  const items = buildWordFeedback([
    { text: 'ダ', status: 'mismatched', spokenPart: 'ダ', errorType: 'extra' },
    { text: '成田', status: 'mismatched', spokenPart: 'れかが', errorType: 'mora' },
    { text: 'エクスプレスですね。何時', status: 'correct' },
    { text: 'ン', status: 'mismatched', spokenPart: 'ン', errorType: 'extra' },
  ]);
  assert.deepEqual(items[0], { kind: 'extra', spoken: 'だ', before: '成田', after: null });
  assert.deepEqual(items[2], { kind: 'extra', spoken: 'ん', before: null, after: '何時' });
});

test('từ nói khác hẳn: không có lỗi từng âm', () => {
  const items = buildWordFeedback([{ text: 'どちらまで', status: 'mismatched', spokenPart: 'どっちがあんまり', errorType: 'sokuon', issues: null }]);
  assert.equal(items[0].kind, 'mismatched');
  assert.deepEqual((items[0] as { issues: unknown[] }).issues, []);
});

test('nhãn loại lỗi', () => {
  assert.equal(issueLabel({ kind: 'extra', errorType: 'sokuon', message: '' }), 'Âm ngắt っ');
  assert.equal(issueLabel({ kind: 'substitute', errorType: 'voicing', message: '' }), 'Âm đục / trong');
  assert.equal(issueLabel({ kind: 'missing', errorType: 'mora', message: '' }), 'Thiếu âm');
  assert.equal(issueLabel({ kind: 'extra', errorType: 'extra', message: '' }), 'Thừa âm');
});
