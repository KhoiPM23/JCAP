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

class VoiceVoxService {
  // In-Memory Blob Cache: Tránh gọi lại VOICEVOX cho cùng một câu thoại và giọng
  private blobCache = new Map<string, string>();
  // Hàng đợi tránh gọi trùng request khi đang fetch dở cho cùng 1 câu và giọng
  private pendingRequests = new Map<string, Promise<string>>();

  /**
   * Lấy danh sách voice có sẵn từ Backend (Backend gọi VOICEVOX /speakers)
   */
  public async getVoices(): Promise<VoiceOption[]> {
    const res = await fetch('/api/tts/voices');
    if (!res.ok) {
      let errorMsg = 'Không thể kết nối đến VOICEVOX Engine.';
      try {
        const err = await res.json();
        if (err?.message) errorMsg = err.message;
      } catch {}
      throw new Error(errorMsg);
    }
    const data = await res.json();
    return data.data || [];
  }

  /**
   * Lấy URL âm thanh WAV (ưu tiên lấy từ Cache nếu câu thoại và voice đã từng được sinh)
   */
  public async getAudioUrl(text: string, speakerId: number): Promise<string> {
    const trimmedText = text.trim();
    if (!trimmedText) {
      throw new Error('Văn bản không được để trống.');
    }

    const cacheKey = `${speakerId}_${trimmedText}`;
    if (this.blobCache.has(cacheKey)) {
      return this.blobCache.get(cacheKey)!;
    }

    if (this.pendingRequests.has(cacheKey)) {
      return this.pendingRequests.get(cacheKey)!;
    }

    const fetchPromise = (async () => {
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
        });

        if (!res.ok) {
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

        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        this.blobCache.set(cacheKey, url);
        return url;
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
   * Dọn dẹp cache và giải phóng bộ nhớ browser khi rời màn hình
   */
  public clearCache(): void {
    this.blobCache.forEach(url => {
      try {
        URL.revokeObjectURL(url);
      } catch {}
    });
    this.blobCache.clear();
  }
}

export const voicevoxService = new VoiceVoxService();

