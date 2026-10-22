// Kiểm tra public/pictograms có đủ các icon EXPERIENCE JAPAN PICTOGRAMS mà bản đồ Khám phá dùng không.
// Thư mục này không có trong git (điều khoản của NDC không cho phân phối lại file icon), nên máy mới clone sẽ thiếu.
//
//   node scripts/check-pictograms.mjs            -> in kết quả, luôn thoát mã 0
//   node scripts/check-pictograms.mjs --strict   -> thoát mã 1 nếu thiếu (dùng trước khi build/deploy)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(root, 'src/data/japanPictograms.ts'), 'utf8');
const declared = [...src.matchAll(/^\s*P\('([^']+)'/gm)].map((m) => m[1]);
const dir = path.join(root, 'public/pictograms');
const missing = declared.filter((id) => !fs.existsSync(path.join(dir, `${id}.svg`)));

if (!missing.length) {
  console.log(`Đủ ${declared.length} icon trong public/pictograms.`);
  process.exit(0);
}

console.log(`
Thiếu ${missing.length}/${declared.length} icon EXPERIENCE JAPAN PICTOGRAMS trong public/pictograms
(vd. ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ', ...' : ''}).

Bản đồ Khám phá vẫn chạy nhưng sẽ thiếu biểu tượng tỉnh và địa danh. Cách thêm:
  1. Tải bộ icon miễn phí tại https://experience-japan.info (giải nén ra một thư mục).
  2. Trong thư mục jcap-web, chạy:
       node scripts/copy-pictograms.mjs <thư-mục-icon-vừa-giải-nén>
  3. Chạy lại lệnh này để kiểm tra.

Không commit thư mục public/pictograms (đã nằm trong .gitignore): điều khoản của NDC không cho phân phối lại file icon.
`);
process.exit(process.argv.includes('--strict') ? 1 : 0);
