import { voicevoxService, type VoiceOption } from './voicevoxService';

/**
 * ScenarioVoiceService
 *
 * Dedicated adapter for Scenario Roleplay voice & audio capabilities.
 * Wraps voicevoxService and Web Speech API synthesis to ensure complete isolation
 * from the Shadowing module.
 */
class ScenarioVoiceService {
  private currentAudio: HTMLAudioElement | null = null;
  private isSpeechCancelled = false;

  /**
   * Lấy danh sách giọng đọc từ VOICEVOX
   */
  public async getVoices(): Promise<VoiceOption[]> {
    try {
      return await voicevoxService.getVoices();
    } catch {
      return [];
    }
  }

  /**
   * Lấy ID giọng đọc người dùng đã chọn trong phần Cài đặt từ localStorage (mặc định là 3 nếu chưa lưu)
   */
  public getSelectedVoiceId(): number {
    if (typeof window === 'undefined') return 3;
    try {
      const raw = window.localStorage.getItem('jcap_voicevox_selected_id');
      if (raw !== null && raw.trim() !== '') {
        const parsed = Number(raw);
        if (!Number.isNaN(parsed) && parsed >= 0) {
          return parsed;
        }
      }
    } catch {
      // ignore storage errors
    }
    return 3;
  }

  /**
   * Dừng toàn bộ âm thanh đang phát (cả audio element và SpeechSynthesis)
   */
  public stopAllAudio(): void {
    this.isSpeechCancelled = true;

    if (this.currentAudio) {
      this.currentAudio.onended = null;
      this.currentAudio.onerror = null;
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
      this.currentAudio = null;
    }

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }

  /**
   * Phát âm thanh tiếng Nhật qua Web Speech API (Local Browser Fallback)
   */
  public speakWithWebSpeech(text: string, onEnd?: () => void): boolean {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      onEnd?.();
      return false;
    }

    this.isSpeechCancelled = false;
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ja-JP';
    utterance.rate = 1.0;

    const voices = window.speechSynthesis.getVoices();
    const jpVoice = voices.find((v) => v.lang.includes('ja') || v.lang.includes('JP'));
    if (jpVoice) utterance.voice = jpVoice;

    utterance.onend = () => {
      if (!this.isSpeechCancelled) {
        onEnd?.();
      }
    };

    utterance.onerror = (e) => {
      if (e.error !== 'canceled' && e.error !== 'interrupted' && !this.isSpeechCancelled) {
        onEnd?.();
      }
    };

    window.speechSynthesis.speak(utterance);
    return true;
  }

  /**
   * Phát giọng AI: ưu tiên VOICEVOX TTS (theo giọng đã chọn trong Cài đặt), nếu offline tự động fallback sang Web Speech API
   */
  public async playAiSpeech(
    text: string,
    voiceId?: number,
    onEnd?: () => void
  ): Promise<void> {
    this.stopAllAudio();
    this.isSpeechCancelled = false;

    const resolvedVoiceId =
      typeof voiceId === 'number' && !Number.isNaN(voiceId)
        ? voiceId
        : this.getSelectedVoiceId();

    try {
      const audioUrl = await voicevoxService.getAudioUrl(text, resolvedVoiceId);
      const audio = new Audio(audioUrl);
      this.currentAudio = audio;

      audio.onended = () => {
        this.currentAudio = null;
        if (!this.isSpeechCancelled) {
          onEnd?.();
        }
      };

      audio.onerror = () => {
        this.currentAudio = null;
        this.speakWithWebSpeech(text, onEnd);
      };

      await audio.play().catch(() => {
        this.currentAudio = null;
        this.speakWithWebSpeech(text, onEnd);
      });
    } catch {
      this.speakWithWebSpeech(text, onEnd);
    }
  }

  /**
   * Khởi tạo bộ nhận diện giọng nói tiếng Nhật (Web Speech API STT)
   */
  public createSpeechRecognition(options?: {
    onStart?: () => void;
    onResult?: (transcript: string, isFinal: boolean) => void;
    onError?: (error: any) => void;
    onEnd?: () => void;
  }): any | null {
    if (typeof window === 'undefined') return null;

    const SpeechRec =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRec) {
      return null;
    }

    try {
      const recognition = new SpeechRec();
      recognition.lang = 'ja-JP';
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onstart = () => {
        options?.onStart?.();
      };

      recognition.onresult = (event: any) => {
        let interim = '';
        let final = '';
        for (let i = 0; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            final += event.results[i][0].transcript;
          } else {
            interim += event.results[i][0].transcript;
          }
        }
        const combined = (final + ' ' + interim).trim();
        const hasFinal = event.results[event.results.length - 1]?.isFinal || false;
        options?.onResult?.(combined, hasFinal);
      };

      recognition.onerror = (err: any) => {
        options?.onError?.(err);
      };

      recognition.onend = () => {
        options?.onEnd?.();
      };

      return recognition;
    } catch {
      return null;
    }
  }
}

export const scenarioVoiceService = new ScenarioVoiceService();
