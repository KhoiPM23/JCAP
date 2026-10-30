import type { ContentDetail, ContentKind, ContentRow, LearningFilters, LearningKind, LearningPage, SaveContent, SaveTopic, TopicDetail, TopicOption, TopicRow } from '../types/adminLearning';

export class LearningApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
async function request<T>(path: string, method = 'GET', body?: unknown, signal?: AbortSignal): Promise<T> {
  const token = localStorage.getItem('jcap_token');
  const response = await fetch(`/api/admin/learning/${path}`, {
    method, signal, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) {
    const validation = json?.errors && typeof json.errors === 'object' ? Object.values(json.errors).flat().join(' ') : '';
    throw new LearningApiError(json?.message || validation || (response.status === 403 ? 'Bạn không có quyền quản trị.' : 'Không tải được dữ liệu. Vui lòng thử lại.'), response.status);
  }
  return json.data as T;
}
function params(filters: LearningFilters) {
  return new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== undefined && value !== '') as [string, string][]).toString();
}
export const adminLearningService = {
  topics: (filters: LearningFilters, signal?: AbortSignal) => request<LearningPage<TopicRow>>(`topics?${params(filters)}`, 'GET', undefined, signal),
  contents: (kind: ContentKind, filters: LearningFilters, signal?: AbortSignal) => request<LearningPage<ContentRow>>(`${kind}?${params(filters)}`, 'GET', undefined, signal),
  options: (signal?: AbortSignal) => request<TopicOption[]>('topics/options', 'GET', undefined, signal),
  topic: (id: number, signal?: AbortSignal) => request<TopicDetail>(`topics/${id}`, 'GET', undefined, signal),
  detail: (kind: ContentKind, id: number, signal?: AbortSignal) => request<ContentDetail>(`${kind}/${id}`, 'GET', undefined, signal),
  saveTopic: (id: number | null, data: SaveTopic) => request<TopicDetail>(id ? `topics/${id}` : 'topics', id ? 'PUT' : 'POST', data),
  saveContent: (kind: ContentKind, id: number | null, data: SaveContent) => request<ContentDetail>(id ? `${kind}/${id}` : kind, id ? 'PUT' : 'POST', data),
  status: (kind: LearningKind, id: number, isActive: boolean) => request<boolean>(`${kind}/${id}/status`, 'PUT', { isActive }),
  bulkStatus: (kind: ContentKind, itemIds: number[], isActive: boolean) => request<boolean>('bulk-status', 'POST', { kind, itemIds, isActive }),
  topicContents: (id: number, vocabularyIds: number[], grammarIds: number[]) => request<TopicDetail>(`topics/${id}/contents`, 'PUT', { vocabularyIds, grammarIds }),
  assign: (kind: ContentKind, itemIds: number[], topicIds: number[]) => request<boolean>('assign-topics', 'POST', { kind, itemIds, topicIds }),
};
