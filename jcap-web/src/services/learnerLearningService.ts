export class LearnerLearningError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
export async function getLearning<T>(path: string, signal?: AbortSignal): Promise<T> {
  const token = localStorage.getItem('jcap_token');
  const response = await fetch(`/api/learning/${path}`, { signal, headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) {
    const validation = json?.errors && typeof json.errors === 'object' && !Array.isArray(json.errors) ? Object.values(json.errors).flat().join(' ') : '';
    throw new LearnerLearningError(json?.message || validation || (response.status === 401 ? 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.' : response.status === 404 ? 'Học liệu không còn hiển thị hoặc không tồn tại.' : 'Không tải được học liệu. Vui lòng thử lại.'), response.status);
  }
  return json.data as T;
}
