import assert from 'node:assert';
import test from 'node:test';
import { formatFurigana, parseFurigana } from './furiganaNotation.ts';

test('chữ Hán liền trước [ ] nhận cách đọc', () => {
  const { segments, problems } = parseFurigana('観光[かんこう]です。');
  assert.deepStrictEqual(segments, [{ text: '観光', reading: 'かんこう' }, { text: 'です。' }]);
  assert.deepStrictEqual(problems, []);
});

test('chỉ lấy cụm chữ Hán cuối, phần kana trước đó giữ nguyên', () => {
  const { segments } = parseFurigana('ベトナムから来[き]ました。');
  assert.deepStrictEqual(segments, [{ text: 'ベトナムから' }, { text: '来', reading: 'き' }, { text: 'ました。' }]);
});

test('{chữ|cách đọc} cho cụm có kana', () => {
  const { segments } = parseFurigana('{お土産|おみやげ}を買[か]います');
  assert.deepStrictEqual(segments, [
    { text: 'お土産', reading: 'おみやげ' },
    { text: 'を' },
    { text: '買', reading: 'か' },
    { text: 'います' },
  ]);
});

test('câu không có furigana', () => {
  assert.deepStrictEqual(parseFurigana('すみません、トイレはどこですか。').segments, [{ text: 'すみません、トイレはどこですか。' }]);
  assert.deepStrictEqual(parseFurigana('').segments, []);
});

test('báo lỗi khi gõ sai', () => {
  assert.strictEqual(parseFurigana('です[です]').problems.length, 1);
  assert.strictEqual(parseFurigana('観光[かんこう').problems.length, 1);
  assert.strictEqual(parseFurigana('{観光かんこう}').problems.length, 1);
  assert.strictEqual(parseFurigana('観光[]').problems.length, 1);
});

test('đổi qua lại không mất dữ liệu, kể cả chữ Hán liền nhau', () => {
  const cases = [
    [{ text: '観光', reading: 'かんこう' }, { text: 'です。' }],
    [{ text: '日本' }, { text: '語', reading: 'ご' }],
    [{ text: '東京', reading: 'とうきょう' }, { text: '駅', reading: 'えき' }],
    [{ text: 'お土産', reading: 'おみやげ' }, { text: 'をください。' }],
  ];
  for (const segs of cases) {
    const text = formatFurigana(segs);
    assert.deepStrictEqual(parseFurigana(text).segments, segs, text);
  }
  assert.strictEqual(formatFurigana([{ text: '日本' }, { text: '語', reading: 'ご' }]), '日本{語|ご}');
});
