import assert from 'node:assert';
import test from 'node:test';
import { parseRuby } from './rubyText.ts';

test('parseRuby tách chữ có furigana và giữ phần chữ thường', () => {
  assert.deepStrictEqual(parseRuby('{幕張|まくはり}メッセにはどうやって{行|い}きますか。'), [
    { base: '幕張', reading: 'まくはり' },
    'メッセにはどうやって',
    { base: '行', reading: 'い' },
    'きますか。',
  ]);
});

test('parseRuby: chuỗi không có cú pháp giữ nguyên, chuỗi rỗng thành mảng rỗng', () => {
  assert.deepStrictEqual(parseRuby('これはいくらですか。'), ['これはいくらですか。']);
  assert.deepStrictEqual(parseRuby(''), []);
});

test('parseRuby: hai cụm furigana liền nhau, ngoặc lệch thì coi là chữ thường', () => {
  assert.deepStrictEqual(parseRuby('{成田|なりた}{空港|くうこう}'), [
    { base: '成田', reading: 'なりた' },
    { base: '空港', reading: 'くうこう' },
  ]);
  assert.deepStrictEqual(parseRuby('{漢字}です'), ['{漢字}です']);
});
