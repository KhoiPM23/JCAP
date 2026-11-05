import type { LearningImportReport } from '../types/adminLearning';

function authorization(): Record<string, string> {
  const token = localStorage.getItem('jcap_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}
async function failure(response: Response): Promise<never> {
  const json = await response.json().catch(() => null);
  const validation = json?.errors && typeof json.errors === 'object' ? Object.values(json.errors).flat().join(' ') : '';
  throw new Error(json?.message || validation || (response.status === 413 ? 'File quá lớn. Giới hạn 5 MB.' : response.status === 401 ? 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.' : response.status === 403 ? 'Bạn không có quyền quản trị.' : 'Không xử lý được file. Vui lòng thử lại.'));
}
export const adminLearningImportService = {
  async template() {
    const response = await fetch('/api/admin/learning/import/template', { headers: authorization() });
    if (!response.ok) return failure(response);
    const url = URL.createObjectURL(await response.blob());
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'JCAP_Learning_Import_v1.xlsx';
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
  async upload(file: File, fileHash?: string): Promise<LearningImportReport> {
    const body = new FormData(); body.append('file', file);
    if (fileHash) body.append('fileHash', fileHash);
    const response = await fetch(`/api/admin/learning/import/${fileHash ? 'confirm' : 'preview'}`, { method: 'POST', headers: authorization(), body });
    if (!response.ok) return failure(response);
    const json = await response.json();
    if (!json.success) throw new Error(json.message || 'Không xử lý được file.');
    return json.data;
  },
};
