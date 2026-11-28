import type { ShadowingDialogueItem } from '../../types/shadowing';
import type { ShadowingProgress } from '../../types/shadowingProgress';

/** Logic hiển thị của Thư viện Shadowing (HANDOFF 9j), tách riêng để test được */

export type LessonState = 'none' | 'progress' | 'done';

/** Mới mở bài mà chưa xong câu nào thì chưa tính là đang học (cùng quy tắc với dải "Đang học dở" và trang chủ) */
export const lessonState = (p: ShadowingProgress | null | undefined): LessonState =>
  p?.status === 'COMPLETED' ? 'done' : p?.status === 'IN_PROGRESS' && p.completedSentenceCount > 0 ? 'progress' : 'none';

export const DEFAULT_TOPIC = 'Giao tiếp tình huống';
export const topicOf = (item: ShadowingDialogueItem) => item.scenarioTitle || DEFAULT_TOPIC;

/** Khoá mục trên URL (?muc=): đã lưu, hoặc một chủ đề */
export const SAVED = 'da-luu';
export const topicKey = (name: string) => `cd:${name}`;

export interface Topic {
  key: string;
  name: string;
  total: number;
  done: number;
  inProgress: number;
  levels: string[];
}

/** Chủ đề theo thứ tự xuất hiện trong danh mục */
export function buildTopics(items: ShadowingDialogueItem[], stateOf: (id: number) => LessonState): Topic[] {
  const topics = new Map<string, Topic>();
  for (const item of items) {
    const name = topicOf(item);
    let t = topics.get(name);
    if (!t) {
      t = { key: topicKey(name), name, total: 0, done: 0, inProgress: 0, levels: [] };
      topics.set(name, t);
    }
    t.total += 1;
    const state = stateOf(item.id);
    if (state === 'done') t.done += 1;
    if (state === 'progress') t.inProgress += 1;
    if (!t.levels.includes(item.jlptLevel)) t.levels.push(item.jlptLevel);
  }
  // Cấp dễ đứng trước: N5, N4, N3
  for (const t of topics.values()) t.levels.sort().reverse();
  return [...topics.values()];
}

/** Điểm cao nhất của từng bài từ lịch sử đã lưu */
export function bestScores(history: { dialogueId: number; averageScore?: number }[]): Map<number, number> {
  const best = new Map<number, number>();
  for (const h of history) {
    const score = h.averageScore ?? 0;
    if (score > (best.get(h.dialogueId) ?? -1)) best.set(h.dialogueId, score);
  }
  return best;
}

/** Cùng ngưỡng với ScoreRing */
export const scoreTone = (score: number): 'good' | 'mid' | 'low' => (score >= 80 ? 'good' : score >= 50 ? 'mid' : 'low');

export type Role = 'A' | 'B';

export const practiceUrl = (id: number, role: Role, flag?: 'resume' | 'restart') =>
  `/shadowing/practice/${id}?role=${role}${flag ? `&${flag}=true` : ''}`;

export interface PreviewAction {
  label: string;
  icon: string;
  url: string;
  /** Liên kết phụ: làm lại từ đầu, hoặc trả nút gạt về vai đang dở */
  alt?: { label: string; url?: string; role?: Role };
  /** Dòng cảnh báo khi đang gạt sang vai khác vai đang dở */
  note?: string;
}

/**
 * Nút chính của cột xem trước. Máy chủ giữ tiến độ riêng cho từng vai, nên đổi vai KHÔNG gửi restart=true
 * (vai đó còn dở thì tiếp tục, chưa có thì tạo mới); chỉ "Luyện lại từ câu 1" và luyện lại bài đã xong mới làm lại thật.
 */
export function previewAction(id: number, role: Role, progress: ShadowingProgress | null): PreviewAction {
  const state = lessonState(progress);
  if (state === 'none' || !progress) return { label: `Bắt đầu với vai ${role}`, icon: 'play_arrow', url: practiceUrl(id, role) };
  const sentence = progress.currentSentenceIndex + 1;
  if (role !== progress.role) {
    return {
      label: `Luyện với vai ${role}`,
      icon: 'play_arrow',
      url: practiceUrl(id, role),
      note:
        state === 'progress'
          ? `Bạn đang luyện dở vai ${progress.role}. Mỗi vai có tiến độ riêng, vai ${progress.role} vẫn được giữ.`
          : undefined,
      alt: state === 'progress' ? { label: `Giữ vai ${progress.role} và tiếp tục câu ${sentence}`, role: progress.role } : undefined,
    };
  }
  if (state === 'done') return { label: `Luyện lại với vai ${role}`, icon: 'replay', url: practiceUrl(id, role, 'restart') };
  return {
    label: `Tiếp tục câu ${sentence}`,
    icon: 'play_arrow',
    url: practiceUrl(id, role, 'resume'),
    alt: { label: 'Luyện lại từ câu 1', url: practiceUrl(id, role, 'restart') },
  };
}
