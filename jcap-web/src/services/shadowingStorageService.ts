import type {
  ShadowingProgress,
  ShadowingPracticeSession,
  ShadowingBookmark,
} from '../types/shadowingProgress';

const KEYS = {
  PROGRESS: 'shadowing_progress',
  HISTORY: 'shadowing_practice_history',
  BOOKMARKS: 'shadowing_bookmarks',
} as const;

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `id_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function safeGetJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function safeSetJson<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.error(`[ShadowingStorageService] Failed to save key "${key}" to localStorage:`, err);
  }
}

export interface StartProgressDialogueMeta {
  id: number;
  title: string;
  subtitle?: string;
  totalSentences: number;
  jlptLevel?: 'N5' | 'N4' | 'N3';
  scenarioTitle?: string;
  textbookTitle?: string;
  chapterTitle?: string;
  currentSentenceText?: string;
}

class ShadowingStorageService {
  // ============================================================
  // 1. SHADOWING PROGRESS (ACTIVE SESSION)
  // ============================================================

  /**
   * Lấy toàn bộ tiến trình của một learner
   */
  public getAllProgress(learnerId: string): ShadowingProgress[] {
    if (!learnerId) return [];
    const all = safeGetJson<ShadowingProgress[]>(KEYS.PROGRESS, []);
    return all.filter((item) => item.learnerId === learnerId);
  }

  /**
   * Lấy tiến trình cụ thể của một dialogue theo learner
   */
  public getProgress(learnerId: string, dialogueId: number): ShadowingProgress | null {
    if (!learnerId || !dialogueId) return null;
    const all = safeGetJson<ShadowingProgress[]>(KEYS.PROGRESS, []);
    const found = all.find(
      (item) => item.learnerId === learnerId && Number(item.dialogueId) === Number(dialogueId)
    );
    return found || null;
  }

  /**
   * Lưu hoặc cập nhật một progress object
   */
  public saveProgress(progress: ShadowingProgress): void {
    const all = safeGetJson<ShadowingProgress[]>(KEYS.PROGRESS, []);
    const idx = all.findIndex(
      (item) =>
        item.learnerId === progress.learnerId &&
        Number(item.dialogueId) === Number(progress.dialogueId)
    );

    if (idx >= 0) {
      all[idx] = { ...all[idx], ...progress };
    } else {
      all.push(progress);
    }
    safeSetJson(KEYS.PROGRESS, all);
  }

  /**
   * Bắt đầu hoặc tiếp tục một dialogue (không reset nếu đã tồn tại và đang học)
   */
  public startOrUpdateProgress(
    learnerId: string,
    dialogue: StartProgressDialogueMeta,
    role: 'A' | 'B',
    sentenceIndex: number = 0,
    currentSentenceText?: string
  ): ShadowingProgress {
    const now = new Date().toISOString();
    const existing = this.getProgress(learnerId, dialogue.id);

    if (existing) {
      // Nếu đã COMPLETED, giữ nguyên trừ khi được restart
      if (existing.status === 'COMPLETED') {
        return existing;
      }

      const updated: ShadowingProgress = {
        ...existing,
        role: existing.role || role,
        dialogueTitle: dialogue.title || existing.dialogueTitle,
        subtitle: dialogue.subtitle || existing.subtitle,
        scenarioTitle: dialogue.scenarioTitle || existing.scenarioTitle,
        textbookTitle: dialogue.textbookTitle || existing.textbookTitle,
        chapterTitle: dialogue.chapterTitle || existing.chapterTitle,
        jlptLevel: dialogue.jlptLevel || existing.jlptLevel,
        currentSentenceText: currentSentenceText || dialogue.currentSentenceText || existing.currentSentenceText,
        totalSentenceCount: dialogue.totalSentences || existing.totalSentenceCount,
        lastPracticedAt: now,
      };
      this.saveProgress(updated);
      return updated;
    }

    const newProgress: ShadowingProgress = {
      sessionId: generateId(),
      learnerId,
      dialogueId: dialogue.id,
      dialogueTitle: dialogue.title,
      subtitle: dialogue.subtitle,
      scenarioTitle: dialogue.scenarioTitle,
      textbookTitle: dialogue.textbookTitle,
      chapterTitle: dialogue.chapterTitle,
      jlptLevel: dialogue.jlptLevel,
      role,
      status: 'IN_PROGRESS',
      currentSentenceIndex: sentenceIndex,
      currentSentenceText: currentSentenceText || dialogue.currentSentenceText,
      completedSentenceCount: sentenceIndex,
      totalSentenceCount: dialogue.totalSentences,
      startedAt: now,
      lastPracticedAt: now,
    };

    this.saveProgress(newProgress);
    return newProgress;
  }

  /**
   * Bắt đầu lại (Luyện lại) một bài học đã hoàn thành:
   * Tạo session mới, chuyển status về IN_PROGRESS, index về 0, giữ nguyên History cũ.
   */
  public restartProgress(
    learnerId: string,
    dialogue: StartProgressDialogueMeta,
    role: 'A' | 'B'
  ): ShadowingProgress {
    const now = new Date().toISOString();
    const newProgress: ShadowingProgress = {
      sessionId: generateId(),
      learnerId,
      dialogueId: dialogue.id,
      dialogueTitle: dialogue.title,
      subtitle: dialogue.subtitle,
      scenarioTitle: dialogue.scenarioTitle,
      textbookTitle: dialogue.textbookTitle,
      chapterTitle: dialogue.chapterTitle,
      jlptLevel: dialogue.jlptLevel,
      role,
      status: 'IN_PROGRESS',
      currentSentenceIndex: 0,
      currentSentenceText: dialogue.currentSentenceText,
      completedSentenceCount: 0,
      totalSentenceCount: dialogue.totalSentences,
      startedAt: now,
      lastPracticedAt: now,
    };

    this.saveProgress(newProgress);
    return newProgress;
  }

  /**
   * Cập nhật tiến trình khi học viên hoàn thành một câu và chuyển sang câu tiếp theo
   */
  public updateSentenceProgress(
    learnerId: string,
    dialogueId: number,
    nextSentenceIndex: number,
    totalSentences: number,
    currentSentenceText?: string
  ): ShadowingProgress | null {
    const existing = this.getProgress(learnerId, dialogueId);
    if (!existing) return null;

    const now = new Date().toISOString();
    const updated: ShadowingProgress = {
      ...existing,
      currentSentenceIndex: nextSentenceIndex,
      currentSentenceText: currentSentenceText !== undefined ? currentSentenceText : existing.currentSentenceText,
      completedSentenceCount: Math.min(
        totalSentences,
        Math.max(existing.completedSentenceCount, nextSentenceIndex)
      ),
      totalSentenceCount: totalSentences,
      lastPracticedAt: now,
      status: nextSentenceIndex >= totalSentences ? 'COMPLETED' : 'IN_PROGRESS',
    };

    this.saveProgress(updated);
    return updated;
  }

  /**
   * Đánh dấu hoàn thành toàn bộ bài Shadowing
   */
  public completeProgress(
    learnerId: string,
    dialogueId: number,
    totalSentences: number
  ): ShadowingProgress | null {
    const existing = this.getProgress(learnerId, dialogueId);
    const now = new Date().toISOString();

    const updated: ShadowingProgress = existing
      ? {
          ...existing,
          status: 'COMPLETED',
          currentSentenceIndex: Math.max(0, totalSentences - 1),
          completedSentenceCount: totalSentences,
          totalSentenceCount: totalSentences,
          completedAt: now,
          lastPracticedAt: now,
        }
      : {
          sessionId: generateId(),
          learnerId,
          dialogueId,
          role: 'A',
          status: 'COMPLETED',
          currentSentenceIndex: Math.max(0, totalSentences - 1),
          completedSentenceCount: totalSentences,
          totalSentenceCount: totalSentences,
          startedAt: now,
          lastPracticedAt: now,
          completedAt: now,
        };

    this.saveProgress(updated);
    return updated;
  }

  /**
   * Lấy bài Shadowing đang học dở gần đây nhất của Learner (cho phần Continue Shadowing trên Home)
   */
  public getLatestInProgress(learnerId: string): ShadowingProgress | null {
    const progressList = this.getAllProgress(learnerId);
    const inProgressItems = progressList.filter((item) => item.status === 'IN_PROGRESS');

    if (inProgressItems.length === 0) return null;

    // Sắp xếp theo lastPracticedAt mới nhất
    inProgressItems.sort((a, b) => {
      const timeA = new Date(a.lastPracticedAt || a.startedAt || 0).getTime();
      const timeB = new Date(b.lastPracticedAt || b.startedAt || 0).getTime();
      return timeB - timeA;
    });

    return inProgressItems[0];
  }

  // ============================================================
  // 2. SHADOWING PRACTICE HISTORY (IMMUTABLE SESSIONS)
  // ============================================================

  /**
   * Lấy danh sách lịch sử luyện tập của learner (sắp xếp mới nhất lên đầu)
   */
  public getHistoryList(learnerId: string): ShadowingPracticeSession[] {
    if (!learnerId) return [];
    const all = safeGetJson<ShadowingPracticeSession[]>(KEYS.HISTORY, []);
    const userHistory = all.filter((item) => item.learnerId === learnerId);
    userHistory.sort((a, b) => {
      const timeA = new Date(a.completedAt || a.startedAt || 0).getTime();
      const timeB = new Date(b.completedAt || b.startedAt || 0).getTime();
      return timeB - timeA;
    });
    return userHistory;
  }

  /**
   * Thêm một bản ghi lịch sử buổi luyện tập mới (không ghi đè lịch sử cũ)
   */
  public addHistorySession(
    session: Omit<ShadowingPracticeSession, 'id'>
  ): ShadowingPracticeSession {
    const all = safeGetJson<ShadowingPracticeSession[]>(KEYS.HISTORY, []);
    const newRecord: ShadowingPracticeSession = {
      ...session,
      id: generateId(),
    };
    all.push(newRecord);
    safeSetJson(KEYS.HISTORY, all);
    return newRecord;
  }

  // ============================================================
  // 3. SHADOWING BOOKMARKS
  // ============================================================

  /**
   * Lấy danh sách bookmark của learner
   */
  public getBookmarks(learnerId: string): ShadowingBookmark[] {
    if (!learnerId) return [];
    const all = safeGetJson<ShadowingBookmark[]>(KEYS.BOOKMARKS, []);
    return all.filter((item) => item.learnerId === learnerId);
  }

  /**
   * Kiểm tra một bài học có được bookmark hay không
   */
  public isBookmarked(learnerId: string, dialogueId: number): boolean {
    if (!learnerId || !dialogueId) return false;
    const all = safeGetJson<ShadowingBookmark[]>(KEYS.BOOKMARKS, []);
    return all.some(
      (item) => item.learnerId === learnerId && Number(item.dialogueId) === Number(dialogueId)
    );
  }

  /**
   * Toggle bookmark: Thêm nếu chưa có, xóa nếu đã có. Trả về trạng thái sau khi toggle.
   */
  public toggleBookmark(learnerId: string, dialogueId: number): boolean {
    if (!learnerId || !dialogueId) return false;
    const all = safeGetJson<ShadowingBookmark[]>(KEYS.BOOKMARKS, []);
    const existingIndex = all.findIndex(
      (item) => item.learnerId === learnerId && Number(item.dialogueId) === Number(dialogueId)
    );

    if (existingIndex >= 0) {
      all.splice(existingIndex, 1);
      safeSetJson(KEYS.BOOKMARKS, all);
      return false;
    } else {
      const newBookmark: ShadowingBookmark = {
        id: generateId(),
        learnerId,
        dialogueId,
        createdAt: new Date().toISOString(),
      };
      all.push(newBookmark);
      safeSetJson(KEYS.BOOKMARKS, all);
      return true;
    }
  }
}

export const shadowingStorageService = new ShadowingStorageService();

