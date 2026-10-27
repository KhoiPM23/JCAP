// Chép các icon EXPERIENCE JAPAN PICTOGRAMS đang được dùng (khai báo trong src/data/japanPictograms.ts)
// từ thư mục bộ icon tải về vào public/pictograms, đồng thời kiểm tra dữ liệu gán icon cho tỉnh.
//
//   node scripts/copy-pictograms.mjs <thư-mục-EXPERIENCE_JAPAN_PICTOGRAM>
//
// Chỉ chép file được dùng, giữ nguyên nội dung (điều khoản không cho biến dạng hình icon).

import fs from 'node:fs';
import path from 'node:path';

const [, , sourceDir] = process.argv;
if (!sourceDir) {
  console.error('Usage: node scripts/copy-pictograms.mjs <EXPERIENCE_JAPAN_PICTOGRAM dir>');
  process.exit(1);
}

const dataFile = path.resolve('src/data/japanPictograms.ts');
const src = fs.readFileSync(dataFile, 'utf8');

const declared = [...src.matchAll(/^\s*P\('([^']+)'/gm)].map((m) => m[1]);
const dup = declared.filter((id, i) => declared.indexOf(id) !== i);
if (dup.length) throw new Error(`Icon khai báo trùng: ${dup.join(', ')}`);

// Kiểm tra bảng gán tỉnh: đủ 47 tỉnh, mỗi tỉnh có icon, mọi icon được gán đều đã khai báo và ngược lại
const block = src.slice(src.indexOf('export const PREFECTURE_PICTOGRAMS'), src.indexOf('export const PICTOGRAM_PREFECTURES'));
const prefLines = [...block.matchAll(/^\s*(\d+):\s*\[([\s\S]*?)\]/gm)];
const prefIds = new Set(prefLines.map((m) => Number(m[1])));
const used = new Set(prefLines.flatMap((m) => [...m[2].matchAll(/'([^']+)'/g)].map((x) => x[1])));
const missingPrefs = Array.from({ length: 47 }, (_, i) => i + 1).filter((id) => !prefIds.has(id));
if (missingPrefs.length) throw new Error(`Tỉnh chưa có icon: ${missingPrefs.join(', ')}`);
const undeclared = [...used].filter((id) => !declared.includes(id));
if (undeclared.length) throw new Error(`Icon được gán nhưng chưa khai báo: ${undeclared.join(', ')}`);
// Biểu tượng tình huống (SCENE_PICTOGRAM_GROUPS) cố ý không gán cho tỉnh nào
const sceneBlock = src.slice(src.indexOf('export const SCENE_PICTOGRAM_GROUPS'));
const scene = new Set([...sceneBlock.matchAll(/^\s*P\('([^']+)'/gm)].map((m) => m[1]));
const unused = declared.filter((id) => !used.has(id) && !scene.has(id));
if (unused.length) console.warn(`Cảnh báo: icon khai báo nhưng không gán cho tỉnh nào: ${unused.join(', ')}`);

const outDir = path.resolve('public/pictograms');
fs.mkdirSync(outDir, { recursive: true });
const missingFiles = [];
for (const id of declared) {
  const file = path.join(sourceDir, 'svg', `${id}.svg`);
  if (!fs.existsSync(file)) {
    missingFiles.push(id);
    continue;
  }
  fs.copyFileSync(file, path.join(outDir, `${id}.svg`));
}
if (missingFiles.length) throw new Error(`Không tìm thấy file icon: ${missingFiles.join(', ')}`);

fs.writeFileSync(
  path.join(outDir, 'CREDIT.txt'),
  [
    'Materials provided by courtesy of Nippon Design Center / EXPERIENCE JAPAN PICTOGRAMS',
    'https://experience-japan.info',
    '',
    'Copyright NIPPON DESIGN CENTER. Dùng theo Terms of use của bộ icon:',
    '- được đổi màu/kích thước, KHÔNG được biến dạng hình;',
    '- không phân phối lại file icon riêng lẻ, không dùng làm logo/nhãn hiệu.',
    '',
  ].join('\n'),
  'utf8',
);
console.log(`Đã chép ${declared.length} icon vào ${outDir} (${prefIds.size} tỉnh có icon)`);
