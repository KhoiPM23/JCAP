/**
 * Thứ tự mốc ở màn admin, để số trùng với bản đồ người học: mốc đang dùng theo thứ tự tạo (đúng thứ tự người học thấy),
 * mốc nháp xếp sau và đánh số nối tiếp vì người học không thấy nháp. Danh sách vào theo thứ tự API (ID tăng dần); no tính từ 1.
 */
export function orderForAdmin<T extends { status: string }>(spots: T[]): { spot: T; no: number }[] {
  const live = spots.filter((s) => s.status === 'Published');
  const drafts = spots.filter((s) => s.status !== 'Published');
  return [...live, ...drafts].map((spot, i) => ({ spot, no: i + 1 }));
}
