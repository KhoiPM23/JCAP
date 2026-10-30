export interface VoiceOption {
  id: number;
  speakerName: string;
  romajiName: string;
  gender: 'Female' | 'Male' | 'Mascot' | string;
  region: string;
  description: string;
  styleName: string;
  styleVietnamese: string;
  speakerUuid: string;
  displayName: string;
}

// ----------------------------------------------------
// TẦNG LƯU TRỮ INDEXEDDB: Cache audio WAV bền vững (Persistent Storage)
// ----------------------------------------------------
const DB_NAME = 'jcap_audio_cache_db';
const STORE_NAME = 'audio_cache';
const DB_VERSION = 1;

function openAudioDb(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function getCachedAudioBlob(key: string): Promise<Blob | null> {
  try {
    const db = await openAudioDb();
    if (!db) return null;
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => {
        if (req.result && req.result.blob instanceof Blob) {
          resolve(req.result.blob);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function setCachedAudioBlob(key: string, blob: Blob): Promise<void> {
  try {
    const db = await openAudioDb();
    if (!db) return;
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put({ key, blob, createdAt: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Bỏ qua lỗi ghi storage nếu bộ nhớ đầy hoặc browser hạn chế
  }
}

class VoiceVoxService {
  // L1 Cache: In-Memory Object URL Cache (Truy xuất tức thì 0ms trong phiên)
  private blobCache = new Map<string, string>();
  // Viseme mouth timeline cache cho LivingAvatar
  private visemeCache = new Map<string, Array<{ t: number; v: string }>>();
  // Hàng đợi tránh gọi trùng request khi đang fetch dở cho cùng 1 câu và giọng
  private pendingRequests = new Map<string, Promise<string>>();

  // Cờ trạng thái sẵn sàng: Nếu VOICEVOX offline, chuyển sang Web Speech trong 0ms mà không tốn 3-4s chờ timeout
  private isVoiceVoxAvailable: boolean | null = null;
  private lastCheckTime = 0;
  private readonly OFFLINE_COOLDOWN_MS = 6000; // 6 giây thử lại thay vì 45s để không bị treo lâu

  /**
   * Reset cờ trạng thái để thử lại kết nối VOICEVOX ngay lập tức
   */
  public resetAvailability(): void {
    this.isVoiceVoxAvailable = null;
    this.lastCheckTime = 0;
  }

  // Danh mục câu chào & mẫu thoại cốt lõi hay gặp nhất trong tiếng Nhật giao tiếp
  public static readonly COMMON_PHRASES = [
    'こんにちは',
    'いらっしゃいませ',
    'ありがとうございます',
    'ごちそうさまでした',
    'すみません',
    'お願いします',
    'わかりました',
    'かしこまりました',
    '少々お待ちください',
    '失礼します',
  ];

  /**
   * Lấy danh sách voice có sẵn từ Backend (Backend gọi VOICEVOX /speakers)
   */
  public async getVoices(): Promise<VoiceOption[]> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);
    try {
      const res = await fetch('/api/tts/voices', { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!res.ok) {
        this.isVoiceVoxAvailable = false;
        this.lastCheckTime = Date.now();
        let errorMsg = 'Không thể kết nối đến VOICEVOX Engine.';
        try {
          const err = await res.json();
          if (err?.message) errorMsg = err.message;
        } catch {}
        throw new Error(errorMsg);
      }
      this.isVoiceVoxAvailable = true;
      this.lastCheckTime = Date.now();
      const data = await res.json();
      return data.data || [];
    } catch (err: any) {
      clearTimeout(timeoutId);
      this.isVoiceVoxAvailable = false;
      this.lastCheckTime = Date.now();
      throw err;
    }
  }

  /**
   * Lấy URL âm thanh WAV:
   * 1. Check L1 Cache (RAM) -> 0ms
   * 2. Check L2 Cache (IndexedDB) -> ~2ms (không tốn mạng)
   * 3. Network Fetch từ VOICEVOX Backend -> Lưu đồng thời vào cả L1 và L2
   */
  public async getAudioUrl(text: string, speakerId: number): Promise<string> {
    const trimmedText = text.trim();
    if (!trimmedText) {
      throw new Error('Văn bản không được để trống.');
    }

    const cacheKey = `${speakerId}_${trimmedText}`;

    // 1. Kiểm tra L1 Cache (RAM)
    if (this.blobCache.has(cacheKey)) {
      return this.blobCache.get(cacheKey)!;
    }

    // Kiểm tra request đang chạy dở
    if (this.pendingRequests.has(cacheKey)) {
      return this.pendingRequests.get(cacheKey)!;
    }

    // Nếu gần đây VOICEVOX không phản hồi, bỏ qua ngay trong 0ms để rơi vào Web Speech API tức thì!
    if (this.isVoiceVoxAvailable === false && Date.now() - this.lastCheckTime < this.OFFLINE_COOLDOWN_MS) {
      throw new Error('VOICEVOX Engine is offline (Fast fallback).');
    }

    const fetchPromise = (async () => {
      // 2. Kiểm tra L2 Cache (IndexedDB bền vững)
      try {
        const cachedBlob = await getCachedAudioBlob(cacheKey);
        if (cachedBlob) {
          const url = URL.createObjectURL(cachedBlob);
          this.blobCache.set(cacheKey, url);
          return url;
        }
      } catch {
        // bỏ qua lỗi đọc IndexedDB và tiếp tục fetch mạng
      }

      // 3. Network Fetch
      // Đặt timeout 12000ms (12 giây) để CPU tổng hợp đủ thời gian (trên CPU Voicevox thường tốn 1.2s - 2.5s)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);

      try {
        const res = await fetch('/api/tts/synthesize', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text: trimmedText,
            speakerId,
          }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!res.ok) {
          // Chỉ đánh dấu offline nếu backend trả về 503 (VOICEVOX process không bật)
          if (res.status === 503) {
            this.isVoiceVoxAvailable = false;
            this.lastCheckTime = Date.now();
          }
          let message = 'VOICEVOX Engine is not running.';
          try {
            const problem = await res.json();
            if (problem?.detail) {
              message = problem.detail;
            } else if (problem?.message) {
              message = problem.message;
            }
          } catch {}
          throw new Error(message);
        }

        this.isVoiceVoxAvailable = true;
        this.lastCheckTime = Date.now();

        // Đọc header X-Viseme-Timeline để làm lip-sync thời gian thực chuẩn phách
        const visemesHeader = res.headers.get('X-Viseme-Timeline');
        if (visemesHeader) {
          try {
            const parsed = JSON.parse(visemesHeader);
            if (Array.isArray(parsed)) {
              this.visemeCache.set(cacheKey, parsed);
            }
          } catch {}
        }

        const blob = await res.blob();
        const url = URL.createObjectURL(blob);

        // Lưu vào RAM và lưu ngầm vào IndexedDB
        this.blobCache.set(cacheKey, url);
        void setCachedAudioBlob(cacheKey, blob);

        return url;
      } catch (err: any) {
        clearTimeout(timeoutId);
        // Nếu do timeout fetch, không vội đánh dấu cả hệ thống offline vĩnh viễn
        if (err?.name === 'AbortError') {
          console.warn('[VOICEVOX] Fetch synthesis timed out (>12s), falling back gracefully.');
        } else {
          this.isVoiceVoxAvailable = false;
          this.lastCheckTime = Date.now();
        }
        throw err;
      } finally {
        this.pendingRequests.delete(cacheKey);
      }
    })();

    this.pendingRequests.set(cacheKey, fetchPromise);
    return fetchPromise;
  }

  /**
   * Tải trước âm thanh ngầm (Pre-fetch) để khi người dùng bấm phát hoặc đối phương nói sẽ phát ngay lập tức (0ms delay)
   */
  public async prefetchAudio(text: string, speakerId: number): Promise<void> {
    try {
      await this.getAudioUrl(text, speakerId);
    } catch {
      // Pre-fetch ngầm thất bại sẽ bỏ qua trong yên lặng, khi phát thật sẽ có cơ chế fallback
    }
  }

  /**
   * Lazy Loading & Warm-up các câu thoại chào hỏi/phản xạ cốt lõi vào IndexedDB & RAM
   * Chạy nền không chặn UI luồng chính
   */
  public async prefetchCommonPhrases(speakerId: number = 2): Promise<void> {
    if (typeof window === 'undefined') return;

    for (const phrase of VoiceVoxService.COMMON_PHRASES) {
      const key = `${speakerId}_${phrase}`;
      if (this.blobCache.has(key)) continue;

      try {
        const cachedBlob = await getCachedAudioBlob(key);
        if (cachedBlob) {
          const url = URL.createObjectURL(cachedBlob);
          this.blobCache.set(key, url);
          continue;
        }

        // Tải tuần tự với khoảng nghỉ nhỏ để không làm nghẽn băng thông
        await this.prefetchAudio(phrase, speakerId);
        await new Promise((r) => setTimeout(r, 60));
      } catch {
        // Bỏ qua lỗi mạng
      }
    }
  }

  /**
   * Phát nhanh câu thoại chào mừng để nghe thử chất giọng trong Settings
   */
  public async playVoicePreview(speakerId: number): Promise<HTMLAudioElement> {
    const sampleText = 'こんにちは！シャドーイングの練習を始めましょう。';
    const audioUrl = await this.getAudioUrl(sampleText, speakerId);
    const audio = new Audio(audioUrl);
    await audio.play();
    return audio;
  }

  /**
   * Lấy danh sách timeline visemes (mốc thời gian và khẩu hình miệng tương ứng)
   */
  public getVisemes(text: string, speakerId: number): Array<{ t: number; v: string }> | null {
    const trimmedText = text.trim();
    const cacheKey = `${speakerId}_${trimmedText}`;
    return this.visemeCache.get(cacheKey) || null;
  }

  /**
   * Dọn dẹp RAM blob cache khi cần giải phóng bộ nhớ (IndexedDB vẫn giữ nguyên)
   */
  public clearCache(): void {
    this.blobCache.forEach((url) => {
      try {
        URL.revokeObjectURL(url);
      } catch {}
    });
    this.blobCache.clear();
  }
}

export const voicevoxService = new VoiceVoxService();
