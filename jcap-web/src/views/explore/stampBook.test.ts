import assert from 'node:assert';
import test from 'node:test';
import {
  buildPages,
  learningPage,
  matchesFilter,
  matchesQuery,
  prefectureWatermark,
  regionKeyOf,
  regionLocked,
  regionTabTarget,
  unlockCondition,
  watermarkSize,
} from './stampBook.ts';

type Prefecture = Parameters<typeof buildPages>[0][number];
type Chapter = Parameters<typeof learningPage>[1][number];

const pref = (id: number, over: Partial<Prefecture> = {}): Prefecture => ({
  id,
  isOpen: true,
  chapterId: null,
  spotCount: 5,
  isLocked: false,
  stampCount: 0,
  redStampCount: 0,
  ...over,
});

const chapter = (orderIndex: number, over: Partial<Chapter> = {}): Chapter => ({
  id: orderIndex + 1,
  orderIndex,
  title: `Chương ${orderIndex}`,
  minLevel: 'N5',
  maxLevel: 'N5',
  unlockThresholdPercent: 70,
  prefectureIds: [],
  isUnlocked: false,
  spotCount: 10,
  stampCount: 0,
  ...over,
});

const REGION_OF: Record<number, Parameters<typeof regionKeyOf>[0]> = { 1: 'hokkaido', 12: 'kanto', 13: 'kanto', 26: 'kansai', 29: 'kansai', 34: 'chugoku', 38: 'shikoku', 47: 'kyushu' };
const regionOf = (id: number) => REGION_OF[id];

test('regionKeyOf gộp Chugoku và Shikoku', () => {
  assert.equal(regionKeyOf('chugoku'), 'chugoku-shikoku');
  assert.equal(regionKeyOf('shikoku'), 'chugoku-shikoku');
  assert.equal(regionKeyOf('kyushu'), 'kyushu');
});

test('prefectureWatermark bỏ hậu tố tỉnh', () => {
  assert.equal(prefectureWatermark('千葉県'), '千葉');
  assert.equal(prefectureWatermark('東京都'), '東京');
  assert.equal(prefectureWatermark('京都府'), '京都');
  assert.equal(prefectureWatermark('北海道'), '北海道');
});

test('watermarkSize: tên ngắn thì to hơn', () => {
  assert.ok(watermarkSize('千葉') > watermarkSize('北海道'));
});

test('buildPages chỉ lấy tỉnh đã mở, xếp theo vùng rồi mã tỉnh', () => {
  const pages = buildPages([pref(26), pref(1, { isOpen: false }), pref(13), pref(12), pref(29, { isOpen: false })], regionOf);
  assert.deepEqual(
    pages.map((p) => [p.prefecture.id, p.region]),
    [
      [12, 'kanto'],
      [13, 'kanto'],
      [26, 'kansai'],
    ],
  );
});

test('buildPages: tỉnh Hokkaido không kéo Chiba sang vùng khác (vùng theo từng tỉnh, không theo chương)', () => {
  const pages = buildPages([pref(1, { chapterId: 1 }), pref(12, { chapterId: 1 })], regionOf);
  assert.deepEqual(
    pages.map((p) => [p.prefecture.id, p.region]),
    [
      [12, 'kanto'],
      [1, 'hokkaido'],
    ],
  );
});

test('learningPage: tỉnh đã mở đầu tiên của chương đã mở lớn nhất', () => {
  const chapters = [chapter(0, { isUnlocked: true }), chapter(1, { isUnlocked: true }), chapter(2)];
  const pages = buildPages([pref(12, { chapterId: 1 }), pref(13, { chapterId: 2 }), pref(26, { chapterId: 3, isLocked: true })], regionOf);
  assert.equal(learningPage(pages, chapters), 1);
});

test('learningPage: không có chương đã mở thì trang đầu chưa khoá', () => {
  const pages = buildPages([pref(12, { isLocked: true }), pref(26)], regionOf);
  assert.equal(learningPage(pages, []), 1);
  assert.equal(learningPage([], []), 0);
});

test('unlockCondition ghi phần trăm con dấu của chương trước', () => {
  const chapters = [chapter(0, { title: 'Nhập môn', spotCount: 7, stampCount: 3, isUnlocked: true }), chapter(1)];
  assert.equal(unlockCondition(pref(26, { chapterId: 2, isLocked: true }), chapters), 'Mở khi đạt 70% con dấu của “Nhập môn” (3/5).');
  assert.equal(unlockCondition(pref(12, { chapterId: 1 }), chapters), 'Tỉnh này chưa mở.');
  assert.equal(unlockCondition(pref(12), chapters), 'Tỉnh này chưa mở.');
});

test('regionTabTarget ưu tiên tỉnh đang học nếu nằm trong vùng', () => {
  const pages = buildPages([pref(12), pref(13), pref(26)], regionOf);
  assert.equal(regionTabTarget(pages, 'kanto', 1), 1);
  assert.equal(regionTabTarget(pages, 'kansai', 1), 2);
  assert.equal(regionTabTarget(pages, 'hokkaido', 1), null);
});

test('regionLocked: vùng chưa có tỉnh nào mở được thì khoá', () => {
  const pages = buildPages([pref(12), pref(26, { isLocked: true })], regionOf);
  assert.equal(regionLocked(pages, 'kanto'), false);
  assert.equal(regionLocked(pages, 'kansai'), true);
});

test('matchesFilter', () => {
  const locked = pref(26, { isLocked: true });
  const stamped = pref(12, { stampCount: 2 });
  assert.ok(matchesFilter(locked, 'all'));
  assert.ok(matchesFilter(locked, 'lock'));
  assert.ok(!matchesFilter(locked, 'open'));
  assert.ok(matchesFilter(stamped, 'open'));
  assert.ok(matchesFilter(stamped, 'stamp'));
  assert.ok(!matchesFilter(stamped, 'lock'));
});

test('matchesQuery bỏ dấu và tìm theo tên tỉnh hoặc vùng', () => {
  const [page] = buildPages([pref(26)], regionOf);
  const names = (id: number) => (id === 26 ? 'Kyoto 京都府' : '');
  assert.ok(matchesQuery(page, '', names));
  assert.ok(matchesQuery(page, 'KYOTO', names));
  assert.ok(matchesQuery(page, 'kansai', names));
  assert.ok(!matchesQuery(page, 'hokkaido', names));
});
