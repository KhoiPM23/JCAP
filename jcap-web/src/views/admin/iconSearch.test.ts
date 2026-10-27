import assert from 'node:assert';
import test from 'node:test';
import { searchIcons, suggestIconsForName } from './iconSearch.ts';

const ids = (list: { id: string }[]) => list.map((p) => p.id);

test('Gợi ý theo tên mốc: đúng tình huống xếp đầu', () => {
  assert.strictEqual(suggestIconsForName(['Sân bay Narita · Quầy nhập cảnh', '成田空港 入国審査'])[0].id, 'B_immigration');
  assert.strictEqual(suggestIconsForName(['Sân bay Narita · Khu nhận hành lý', '成田空港 手荷物受取所'])[0].id, 'B_baggage-claim');
  assert.strictEqual(suggestIconsForName(['Mua đồ ở combini'])[0].id, 'B_convenience-store');
  assert.strictEqual(suggestIconsForName(['', 'コンビニ']) [0].id, 'B_convenience-store');
  assert.strictEqual(suggestIconsForName(['Ga Tokyo', '東京駅'])[0].id, 'T_train');
});

test('Gợi ý theo tên mốc: địa danh có tên khác vẫn ra đúng icon', () => {
  assert.strictEqual(suggestIconsForName(['Chùa Senso-ji', '浅草寺', 'せんそうじ'])[0].id, 'P_asakusa');
  assert.ok(ids(suggestIconsForName(['Hồ Kawaguchi', '河口湖'])).includes('N_lake'));
});

test('Gợi ý theo tên mốc: không khớp nhầm từ ngắn', () => {
  // "dù" (ô) không được khớp "du" trong "du lịch"
  assert.ok(!ids(suggestIconsForName(['Tàu du lịch'])).includes('B_umbrella'));
  // 港 một chữ không khớp giữa từ 空港
  assert.notStrictEqual(suggestIconsForName(['成田空港'])[0].id, 'B_harbor');
  assert.deepStrictEqual(suggestIconsForName(['', '  ']), []);
});

test('Tìm kiếm: không dấu, kana, romaji, tiếng Anh', () => {
  assert.strictEqual(searchIcons('nhap canh')[0].id, 'B_immigration');
  assert.strictEqual(searchIcons('onsen')[0].id, 'L_hot-spring');
  assert.ok(ids(searchIcons('こんびに')).includes('B_convenience-store'));
  assert.ok(ids(searchIcons('konbini')).includes('B_convenience-store'));
  assert.ok(ids(searchIcons('station')).includes('T_train'));
  assert.ok(ids(searchIcons('rác')).includes('B_burnable-trash'));
  assert.deepStrictEqual(searchIcons('   '), []);
});
