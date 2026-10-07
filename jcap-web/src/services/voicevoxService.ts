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

