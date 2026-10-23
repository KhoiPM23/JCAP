// Phép chiếu dùng chung cho mọi dữ liệu bản đồ Nhật Bản (tỉnh, thành phố/quận, địa danh).
// Phiên bản TypeScript tương ứng được sinh vào src/data/japanMap.ts (projectLonLat) - đổi ở đây thì phải sinh lại.

/** 1 độ vĩ = 100 đơn vị SVG */
export const K = 100;
/** Hệ số co kinh độ tại vĩ độ 37.5° (giữa nước Nhật) */
export const COS = Math.cos((37.5 * Math.PI) / 180);

/** [kinh độ, vĩ độ] -> [x, y] trong hệ toạ độ bản đồ */
export const project = ([lon, lat]) => [(lon - 122) * COS * K, (46 - lat) * K];
