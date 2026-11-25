/** Quy tắc tệp đính kèm, khớp FeedbackController.UploadAttachment ở server */
export const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'pdf', 'txt', 'log', 'json', 'zip', 'doc', 'docx'];
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const ACCEPT = ALLOWED_EXTENSIONS.map((e) => `.${e}`).join(',');

/** null = tệp hợp lệ; ngược lại là lý do hiện ngay tại tệp (kiểm tra trước khi tải lên) */
export function fileProblem(name: string, size: number): string | null {
  const dot = name.lastIndexOf('.');
  const ext = dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
  if (!ALLOWED_EXTENSIONS.includes(ext)) return ext ? `Định dạng .${ext} chưa được hỗ trợ.` : 'Tệp không có đuôi định dạng được hỗ trợ.';
  if (size > MAX_FILE_BYTES) return `Tệp ${(size / (1024 * 1024)).toFixed(1).replace('.', ',')} MB, lớn hơn 5MB. Hãy chọn tệp nhỏ hơn.`;
  return null;
}

export function fileIcon(name: string): string {
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  if (ext === 'pdf') return 'picture_as_pdf';
  if (ext === 'zip') return 'folder_zip';
  if (ext === 'log' || ext === 'json' || ext === 'txt') return 'article';
  if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) return 'image';
  return 'description';
}
