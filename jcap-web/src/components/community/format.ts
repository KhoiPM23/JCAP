/** Thời gian dạng tương đối ("5 phút trước"); quá một tuần thì hiện ngày */
export function timeAgo(iso: string, now = Date.now()): string {
  const date = new Date(iso);
  const min = Math.floor((now - date.getTime()) / 60000);
  if (min < 1) return 'Vừa xong';
  if (min < 60) return `${min} phút trước`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour} giờ trước`;
  const day = Math.floor(hour / 24);
  if (day < 7) return `${day} ngày trước`;
  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
