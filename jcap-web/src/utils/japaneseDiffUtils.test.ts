import assert from 'node:assert';
import test from 'node:test';
import {
  compareJapaneseSpeechTokens,
  normalizeJapaneseText,
  katakanaToHiragana,
  areJapaneseTokensPhoneticallyEquivalent,
} from './japaneseDiffUtils.ts';

test('1. Đọc câu tiếng Nhật chính xác 100%', () => {
  const target = '一人です。カウンター席でお願いします。';
  const spoken = '一人です。カウンター席でお願いします。';
  const res = compareJapaneseSpeechTokens(target, spoken);
  assert.strictEqual(res.contentMatchScore, 100);
  assert.strictEqual(res.tier, 'green');
  assert.strictEqual(res.diffTokens.every(t => t.status === 'correct'), true);
});

test('2. STT ra Hiragana/Katakana nhưng câu nói đúng hoàn toàn (一人 vs ひとり, カウンター vs かうんたー)', () => {
  const target = '一人です。カウンター席でお願いします。';
  const spoken = 'ひとりです。かうんたー席でおねがいします。';
  const res = compareJapaneseSpeechTokens(target, spoken);
  assert.strictEqual(res.contentMatchScore, 100);
  assert.strictEqual(res.tier, 'green');
});

test('3. Thay đổi 1 từ (nói テーブル thay vì カウンター): các từ khác (一人, お願いします) vẫn phải là correct', () => {
  const target = '一人です。カウンター席でお願いします。';
  const spoken = 'ひとりです。テーブル席でおねがいします。';
  const res = compareJapaneseSpeechTokens(target, spoken);

  // 一人 (nói ひとり) phải là correct
  const hitoriToken = res.diffTokens.find(t => t.text.includes('一人') || t.text.includes('ひとり'));
  assert.ok(hitoriToken, 'Phải có token 一人');
  assert.strictEqual(hitoriToken.status, 'correct', 'Token 一人 phải được công nhận là correct khi nói ひとり');

  // カウンター (nói テーブル) phải là mismatched
  const counterToken = res.diffTokens.find(t => t.text.includes('カウンター'));
  assert.ok(counterToken, 'Phải có token カウンター');
  assert.strictEqual(counterToken.status, 'mismatched', 'Token カウンター phải là mismatched');
  assert.strictEqual(counterToken.spokenPart, 'テーブル');

  // Điểm phải cao (khoảng 80%+ vì chỉ sai 1 từ)
  assert.ok(res.contentMatchScore >= 80, `Điểm phải >= 80, thực tế là ${res.contentMatchScore}`);
});

test('4. Phát âm sai trường âm (おばあさん vs おばさん) KHÔNG được coi là giống nhau', () => {
  const target = 'おばあさん';
  const spoken = 'おばさん';
  const res = compareJapaneseSpeechTokens(target, spoken);

  assert.notStrictEqual(res.contentMatchScore, 100, 'Không được cho 100 điểm khi thiếu trường âm');
  assert.strictEqual(res.diffTokens[0].status, 'mismatched');
  assert.strictEqual(res.diffTokens[0].errorType, 'chouon', 'Phải phát hiện lỗi trường âm chouon');
  assert.strictEqual(res.detectedErrors?.hasChouonError, true);
});

test('5. Phát âm sai âm ngắt (きって vs きて) KHÔNG được coi là giống nhau', () => {
  const target = 'きって';
  const spoken = 'きて';
  const res = compareJapaneseSpeechTokens(target, spoken);

  assert.notStrictEqual(res.contentMatchScore, 100, 'Không được cho 100 điểm khi thiếu âm ngắt');
  assert.strictEqual(res.diffTokens[0].status, 'mismatched');
  assert.strictEqual(res.diffTokens[0].errorType, 'sokuon', 'Phải phát hiện lỗi âm ngắt sokuon');
  assert.strictEqual(res.detectedErrors?.hasSokuonError, true);
});

test('6. Nhầm trợ từ (へ vs に)', () => {
  const target = '学校へ行きます';
  const spoken = '学校に行きます';
  const res = compareJapaneseSpeechTokens(target, spoken);

  const particleToken = res.diffTokens.find(t => t.text === 'へ');
  assert.ok(particleToken, 'Phải có token trợ từ へ');
  assert.strictEqual(particleToken.status, 'mismatched');
  assert.strictEqual(particleToken.spokenPart, 'に');
  assert.strictEqual(res.detectedErrors?.hasParticleError, true);
});

test('7. Không nói gì (transcript rỗng) -> Điểm khớp nội dung bằng 0 và không bị gán điểm phát âm sai', () => {
  const target = '一人です。';
  const spoken = '';
  const res = compareJapaneseSpeechTokens(target, spoken);

  assert.strictEqual(res.contentMatchScore, 0);
  assert.strictEqual(res.completionRate, 0);
  assert.strictEqual(res.tier, 'red');
  assert.strictEqual(res.diffTokens[0].status, 'missing');
});

test('8. Số đếm tương đương (1人 vs 一人)', () => {
  assert.strictEqual(areJapaneseTokensPhoneticallyEquivalent('1人', '一人'), true);
  assert.strictEqual(areJapaneseTokensPhoneticallyEquivalent('2人', '二人'), true);
});

test('9. Dấu câu và khoảng trắng không bị phạt', () => {
  const target = 'こんにちは、元気ですか？';
  const spoken = 'こんにちは元気ですか';
  const res = compareJapaneseSpeechTokens(target, spoken);
  assert.strictEqual(res.contentMatchScore, 100);
});

test('10. Nói câu hoàn toàn sai/không liên quan (tất cả token mismatched) -> Điểm khớp nội dung phải bằng 0', () => {
  const target = 'その階段を上るのでしょうか';
  const spoken = '話し出る恋も。話してる。君の名前は。';
  const res = compareJapaneseSpeechTokens(target, spoken);

  assert.strictEqual(res.contentMatchScore, 0, 'Phải bằng 0 điểm khi tất cả từ đều sai');
  assert.strictEqual(res.tier, 'red');
  assert.strictEqual(res.diffTokens.every((t) => t.status === 'mismatched'), true);
});

