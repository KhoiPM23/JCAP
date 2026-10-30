// scripts/generate-dev-pictograms.mjs
// Sinh bộ SVG pictogram dự phòng cho môi trường dev khi máy chưa chép bộ NDC chính thức
// Giúp tắt cảnh báo [Chỉ hiện khi dev] và hiển thị icon trên bản đồ Nhật Bản ngay lập tức.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataFile = path.resolve(__dirname, '../src/data/japanPictograms.ts');
if (!fs.existsSync(dataFile)) {
  console.error('Không tìm thấy file src/data/japanPictograms.ts');
  process.exit(1);
}

const src = fs.readFileSync(dataFile, 'utf8');
const iconRegex = /^\s*P\('([^']+)',\s*'([^']+)',\s*'([^']+)',\s*'([^']+)'\)/gm;
const declared = [];
let match;
while ((match = iconRegex.exec(src)) !== null) {
  declared.push({
    id: match[1],
    nameJp: match[2],
    nameVi: match[3],
    kind: match[4],
  });
}

console.log(`Đã tìm thấy ${declared.length} icon khai báo.`);

const outDir = path.resolve(__dirname, '../public/pictograms');
fs.mkdirSync(outDir, { recursive: true });

// Vector templates (Monochrome black fill/stroke, tương thích với filter SourceAlpha của bản đồ)
const getSvgPathForKind = (kind, jpText) => {
  // Lấy 1-2 chữ Hán đầu tiên để render glyph tinh tế
  const shortJp = jpText.slice(0, 2);

  switch (kind) {
    case 'nature':
      // Hình núi Phú Sĩ / Thiên nhiên
      return `
        <!-- Nature / Fuji silhouette -->
        <path d="M 50 15 L 18 78 L 82 78 Z" fill="#000000" />
        <path d="M 50 15 L 42 38 L 47 34 L 53 38 L 58 34 L 50 15" fill="#ffffff" />
        <circle cx="28" cy="30" r="10" fill="#000000" />
        <text x="50" y="93" font-family="'Noto Sans JP', sans-serif" font-weight="900" font-size="14" text-anchor="middle" fill="#000000">${shortJp}</text>
      `;
    case 'heritage':
      // Hình đền Shinto / Di sản Torii
      return `
        <!-- Torii Gate -->
        <rect x="15" y="24" width="70" height="7" rx="3" fill="#000000" />
        <rect x="22" y="36" width="56" height="5" fill="#000000" />
        <rect x="26" y="24" width="7" height="54" fill="#000000" />
        <rect x="67" y="24" width="7" height="54" fill="#000000" />
        <rect x="46" y="31" width="8" height="10" fill="#000000" />
        <text x="50" y="93" font-family="'Noto Sans JP', sans-serif" font-weight="900" font-size="14" text-anchor="middle" fill="#000000">${shortJp}</text>
      `;
    case 'landmark':
      // Hình tháp Chùa / Castle / Landmark
      return `
        <!-- Pagoda Tower -->
        <polygon points="50,14 42,24 58,24" fill="#000000" />
        <polygon points="50,26 34,38 66,38" fill="#000000" />
        <polygon points="50,40 26,54 74,54" fill="#000000" />
        <rect x="42" y="54" width="16" height="24" fill="#000000" />
        <rect x="46" y="62" width="8" height="16" fill="#ffffff" />
        <text x="50" y="93" font-family="'Noto Sans JP', sans-serif" font-weight="900" font-size="14" text-anchor="middle" fill="#000000">${shortJp}</text>
      `;
    case 'food':
      // Hình Bát Ramen / Đặc sản ẩm thực
      return `
        <!-- Bowl & Chopsticks -->
        <path d="M 18 42 C 18 68 82 68 82 42 Z" fill="#000000" />
        <rect x="36" y="68" width="28" height="7" rx="2" fill="#000000" />
        <line x1="14" y1="30" x2="86" y2="38" stroke="#000000" stroke-width="4" stroke-linecap="round" />
        <line x1="14" y1="24" x2="86" y2="34" stroke="#000000" stroke-width="4" stroke-linecap="round" />
        <text x="50" y="93" font-family="'Noto Sans JP', sans-serif" font-weight="900" font-size="14" text-anchor="middle" fill="#000000">${shortJp}</text>
      `;
    case 'culture':
    default:
      // Hình Quạt Sensu / Văn hóa truyền thống
      return `
        <!-- Japanese Folding Fan -->
        <path d="M 50 78 L 16 38 C 26 24 74 24 84 38 Z" fill="#000000" />
        <circle cx="50" cy="78" r="4" fill="#ffffff" />
        <text x="50" y="93" font-family="'Noto Sans JP', sans-serif" font-weight="900" font-size="14" text-anchor="middle" fill="#000000">${shortJp}</text>
      `;
  }
};

let count = 0;
for (const item of declared) {
  const filePath = path.join(outDir, `${item.id}.svg`);
  const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  ${getSvgPathForKind(item.kind, item.nameJp)}
</svg>`;
  fs.writeFileSync(filePath, svgContent, 'utf8');
  count++;
}

fs.writeFileSync(
  path.join(outDir, 'CREDIT.txt'),
  [
    'Dev Placeholder Pictograms for JCAP local development.',
    'Khi có bộ icon chính thức từ https://experience-japan.info,',
    'chạy: node scripts/copy-pictograms.mjs <thư-mục-icon> để ghi đè.',
  ].join('\n'),
  'utf8',
);

console.log(`Đã tạo thành công ${count} SVG pictograms trong ${outDir}!`);
