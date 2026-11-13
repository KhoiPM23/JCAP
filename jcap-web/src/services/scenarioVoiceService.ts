import { cleanJapaneseForTts } from '../utils/japaneseSanitizer';
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
  private currentPlaySessionId = 0;

  // MediaRecorder audio capture for Whisper STT Engine
  private mediaRecorder: MediaRecorder | null = null;
  private audioStream: MediaStream | null = null;
  private audioChunks: Blob[] = [];
  private recordingStartedAt = 0;
  private visemeAnimFrame: number | null = null;
  private onVisemeCallback: ((v: any) => void) | null = null;
  private whisperOfflineUntil = 0;
  private isAutoStartingWhisper = false;

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
   * Tốc độ đọc AI khởi tạo thích ứng theo trình độ JLPT (N5: 0.85x, N4: 0.92x, N3+: 1.0x)
   */
  public getDefaultSpeechRateForLevel(level?: string): number {
    const norm = (level || '').toUpperCase().trim();
    if (norm === 'N5') return 0.85;
    if (norm === 'N4') return 0.92;
    return 1.0;
  }

  /**
   * Lấy tốc độ đọc AI từ localStorage (hoặc theo cấp độ thích ứng JLPT: N5: 0.85x, N4: 0.92x, N3+: 1.0x)
   */
  public getSpeechRate(level?: string): number {
    const norm = (level || '').toUpperCase().trim();
    if (typeof window === 'undefined') return this.getDefaultSpeechRateForLevel(norm);
    try {
      if (norm) {
        const levelKey = `jcap_scenario_speech_rate_${norm}`;
        const levelVal = window.localStorage.getItem(levelKey);
        if (levelVal !== null && levelVal.trim() !== '') {
          const parsed = parseFloat(levelVal);
          if (!Number.isNaN(parsed) && parsed >= 0.5 && parsed <= 2.0) {
            return parsed;
          }
        }
        // Khi phiên có cấp độ cụ thể và người dùng chưa từng đổi riêng cho cấp đó, ưu tiên tốc độ thích ứng
        return this.getDefaultSpeechRateForLevel(norm);
      }
      const raw = window.localStorage.getItem('jcap_scenario_speech_rate');
      if (raw !== null && raw.trim() !== '') {
        const parsed = parseFloat(raw);
        if (!Number.isNaN(parsed) && parsed >= 0.5 && parsed <= 2.0) {
          return parsed;
        }
      }
    } catch {
      // ignore storage errors
    }
    return this.getDefaultSpeechRateForLevel(norm);
  }

  /**
   * Lưu tốc độ đọc AI vào localStorage (hỗ trợ lưu cả toàn cục và theo cấp độ nếu có)
   */
  public setSpeechRate(rate: number, level?: string): void {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem('jcap_scenario_speech_rate', rate.toString());
      const norm = (level || '').toUpperCase().trim();
      if (norm) {
        window.localStorage.setItem(`jcap_scenario_speech_rate_${norm}`, rate.toString());
      }
    } catch {
      // ignore
    }
  }

  /**
   * Dừng toàn bộ âm thanh đang phát (cả audio element và SpeechSynthesis)
   */
  public stopAllAudio(): void {
    this.isSpeechCancelled = true;
    this.currentPlaySessionId++; // Invalidate any in-flight synthesis promises immediately

    if (this.visemeAnimFrame !== null) {
      cancelAnimationFrame(this.visemeAnimFrame);
      this.visemeAnimFrame = null;
    }
    if (this.onVisemeCallback) {
      this.onVisemeCallback('closed');
      this.onVisemeCallback = null;
    }

    if (this.currentAudio) {
      this.currentAudio.onended = null;
      this.currentAudio.onerror = null;
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
      this.currentAudio = null;
    }

    if (this.currentUtterance) {
      this.currentUtterance.onstart = null;
      this.currentUtterance.onend = null;
      this.currentUtterance.onerror = null;
      this.currentUtterance = null;
    }

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }

  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private cachedJpVoice: SpeechSynthesisVoice | null = null;

  /**
   * Phát âm thanh tiếng Nhật qua Web Speech API (Local Browser Fallback) - Tốc độ phản hồi cực nhanh < 15ms
   */
  public speakWithWebSpeech(
    text: string,
    onEnd?: () => void,
    rate?: number,
    onStart?: () => void
  ): boolean {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      onEnd?.();
      return false;
    }

    this.isSpeechCancelled = false;
    const cleanText = cleanJapaneseForTts(text);
    if (!cleanText) {
      onEnd?.();
      return false;
    }

    // Chữa lỗi trình duyệt Chrome/Edge bị tạm dừng SpeechSynthesis ngầm
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(cleanText);
    // Lưu tham chiếu utterance vào biến instance để tránh bị Garbage Collector của Chrome thu dọn giữa chừng
    this.currentUtterance = utterance;
    utterance.lang = 'ja-JP';
    utterance.rate = rate ?? this.getSpeechRate();

    if (!this.cachedJpVoice) {
      const voices = window.speechSynthesis.getVoices();
      this.cachedJpVoice = voices.find((v) => v.lang.includes('ja') || v.lang.includes('JP')) || null;
    }
    if (this.cachedJpVoice) {
      utterance.voice = this.cachedJpVoice;
    }

    utterance.onstart = () => {
      if (!this.isSpeechCancelled) {
        onStart?.();
      }
    };

    utterance.onend = () => {
      this.currentUtterance = null;
      if (!this.isSpeechCancelled) {
        onEnd?.();
      }
    };

    utterance.onerror = (e) => {
      this.currentUtterance = null;
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
    onEnd?: () => void,
    rate?: number,
    onStart?: () => void,
    onViseme?: (viseme: any) => void
  ): Promise<void> {
    this.stopAllAudio();
    const playSessionId = ++this.currentPlaySessionId;
    this.isSpeechCancelled = false;
    this.onVisemeCallback = onViseme || null;

    const resolvedVoiceId =
      typeof voiceId === 'number' && !Number.isNaN(voiceId)
        ? voiceId
        : this.getSelectedVoiceId();

    const resolvedRate = rate ?? this.getSpeechRate();

    const cleanText = cleanJapaneseForTts(text);
    if (!cleanText) {
      onEnd?.();
      return;
    }

    try {
      const audioUrl = await voicevoxService.getAudioUrl(cleanText, resolvedVoiceId, 25000);
      // Kiểm tra request có bị hủy hoặc bị thay thế bởi request mới hơn trong lúc fetch mạng không
      if (this.isSpeechCancelled || playSessionId !== this.currentPlaySessionId) {
        return;
      }
      const audio = new Audio(audioUrl);
      audio.playbackRate = resolvedRate;
      this.currentAudio = audio;

      audio.onplay = () => {
        if (!this.isSpeechCancelled && playSessionId === this.currentPlaySessionId) {
          onStart?.();
          if (onViseme) {
            const visemes = voicevoxService.getVisemes(cleanText, resolvedVoiceId);
            if (visemes && visemes.length > 0) {
              const step = () => {
                if (!this.currentAudio || this.currentAudio.paused || this.currentAudio.ended || this.isSpeechCancelled || playSessionId !== this.currentPlaySessionId) {
                  onViseme('closed');
                  return;
                }
                const currentT = this.currentAudio.currentTime;
                let activeV = 'closed';
                for (let i = 0; i < visemes.length; i++) {
                  if (visemes[i].t <= currentT) {
                    activeV = visemes[i].v;
                  } else {
                    break;
                  }
                }
                onViseme(activeV);
                this.visemeAnimFrame = requestAnimationFrame(step);
              };
              this.visemeAnimFrame = requestAnimationFrame(step);
            }
          }
        }
      };

      audio.onended = () => {
        if (this.visemeAnimFrame !== null) {
          cancelAnimationFrame(this.visemeAnimFrame);
          this.visemeAnimFrame = null;
        }
        onViseme?.('closed');
        this.currentAudio = null;
        if (!this.isSpeechCancelled && playSessionId === this.currentPlaySessionId) {
          onEnd?.();
        }
      };

      audio.onerror = () => {
        this.currentAudio = null;
        if (this.isSpeechCancelled || playSessionId !== this.currentPlaySessionId) return;
        // Fallback sang Web Speech nếu Voicevox Engine không online (offline hoặc chưa khởi tạo)
        if (voicevoxService.isAvailable() !== true) {
          this.speakWithWebSpeech(text, onEnd, resolvedRate, onStart);
        } else {
          console.warn('[Scenario Voice] Audio element error with VOICEVOX. Suppressing Web Speech override.');
          onEnd?.();
        }
      };

      await audio.play().catch((err: any) => {
        if (this.isSpeechCancelled || playSessionId !== this.currentPlaySessionId) return;
        // Nếu trình duyệt chặn do Autoplay policy (chưa có thao tác nhấn trên tài liệu):
        // Tuyệt đối KHÔNG fallback sang Web Speech để tránh phát giọng máy móc đè lên,
        // gắn listener tương tác chạm 1 lần để phát ngay khi người dùng chạm vào màn hình.
        if (err && (err.name === 'NotAllowedError' || err.name === 'AbortError')) {
          console.warn('[Scenario Voice] Audio playback blocked by browser Autoplay policy. Awaiting user interaction.');
          if (typeof window !== 'undefined' && typeof document !== 'undefined') {
            const resumeOnInteraction = () => {
              window.removeEventListener('pointerdown', resumeOnInteraction);
              window.removeEventListener('keydown', resumeOnInteraction);
              if (!this.isSpeechCancelled && playSessionId === this.currentPlaySessionId && this.currentAudio === audio) {
                audio.play().then(() => {
                  onStart?.();
                }).catch(() => {});
              }
            };
            window.addEventListener('pointerdown', resumeOnInteraction, { once: true });
            window.addEventListener('keydown', resumeOnInteraction, { once: true });
          }
          return;
        }
        this.currentAudio = null;
        if (voicevoxService.isAvailable() !== true) {
          this.speakWithWebSpeech(text, onEnd, resolvedRate, onStart);
        } else {
          onEnd?.();
        }
      });
    } catch {
      if (this.isSpeechCancelled || playSessionId !== this.currentPlaySessionId) return;
      // Fallback sang Web Speech nếu Voicevox Engine không online
      if (voicevoxService.isAvailable() !== true) {
        this.speakWithWebSpeech(text, onEnd, resolvedRate, onStart);
      } else {
        console.warn('[Scenario Voice] VOICEVOX synthesis failed or delayed. Suppressing Web Speech to prevent robotic override.');
        onEnd?.();
      }
    }
  }

  /**
   * Tải trước ngầm một câu thoại vào cache (RAM + IndexedDB)
   */
  public async prefetchAudio(text: string, voiceId?: number): Promise<void> {
    const resolvedVoiceId =
      typeof voiceId === 'number' && !Number.isNaN(voiceId)
        ? voiceId
        : this.getSelectedVoiceId();
    await voicevoxService.prefetchAudio(text, resolvedVoiceId);
  }

  /**
   * Lazy load các câu thoại chào hỏi/phản xạ phổ biến vào IndexedDB & RAM để phát 0ms delay
   */
  public async prefetchCommonPhrases(voiceId?: number): Promise<void> {
    const resolvedVoiceId =
      typeof voiceId === 'number' && !Number.isNaN(voiceId)
        ? voiceId
        : this.getSelectedVoiceId();
    await voicevoxService.prefetchCommonPhrases(resolvedVoiceId);
  }

  /**
   * Tua âm thanh đang phát tới vị trí tương ứng (hỗ trợ cả file audio tĩnh và cắt lát ngữ điệu Web Speech)
   */
  public seekAiSpeech(
    fullText: string,
    targetRatio: number,
    targetTime: number,
    voiceId?: number,
    onEnd?: () => void,
    rate?: number,
    onStart?: () => void
  ): void {
    if (this.currentAudio && Number.isFinite(this.currentAudio.duration) && this.currentAudio.duration > 0) {
      this.currentAudio.currentTime = Math.min(this.currentAudio.duration, Math.max(0, targetTime));
      return;
    }

    // Nếu VOICEVOX đang online, ưu tiên phát âm thanh bản xứ thay vì nhảy vào Web Speech máy móc
    if (voicevoxService.isAvailable() !== false) {
      void this.playAiSpeech(fullText, voiceId, onEnd, rate, onStart);
      return;
    }

    // Với Web Speech Fallback khi VOICEVOX thực sự offline:
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const textToUse = fullText.trim();
      if (!textToUse) return;
      this.stopAllAudio();
      const charIndex = Math.min(textToUse.length - 1, Math.max(0, Math.floor(targetRatio * textToUse.length)));
      const slicedText = textToUse.slice(charIndex);
      if (slicedText) {
        this.speakWithWebSpeech(slicedText, onEnd, rate, onStart);
      }
    }
  }

  /**
   * Kiểm tra xem AI có đang phát âm thanh không
   */
  public isAiSpeaking(): boolean {
    return this.currentAudio !== null || this.currentUtterance !== null;
  }

  /**
   * Kích hoạt ngắt lời AI (Barge-In) ngay lập tức
   */
  public triggerBargeIn(): void {
    if (this.isAiSpeaking()) {
      this.stopAllAudio();
    }
  }

  /**
   * Khởi tạo bộ nhận diện giọng nói tiếng Nhật (Web Speech API STT)
   */
  public createSpeechRecognition(options?: {
    onStart?: () => void;
    onSpeechStart?: () => void;
    onResult?: (transcript: string, isFinal: boolean, confidence?: number) => void;
    onError?: (error: any) => void;
    onEnd?: () => void;
    onBargeIn?: () => void;
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

      recognition.onspeechstart = () => {
        options?.onSpeechStart?.();
      };

      recognition.onresult = (event: any) => {
        // Barge-In: Nếu AI đang nói mà người học cất tiếng nói có nội dung -> ngắt lời AI ngay
        if (this.isAiSpeaking()) {
          this.triggerBargeIn();
          options?.onBargeIn?.();
        }

        let interim = '';
        let final = '';
        let sumConfidence = 0;
        let countConfidence = 0;
        for (let i = 0; i < event.results.length; ++i) {
          const res = event.results[i];
          if (res.isFinal) {
            final += res[0].transcript;
            if (typeof res[0].confidence === 'number' && res[0].confidence > 0) {
              sumConfidence += res[0].confidence;
              countConfidence++;
            }
          } else {
            interim += res[0].transcript;
          }
        }
        const combined = (final + ' ' + interim).trim();
        const hasFinal = event.results[event.results.length - 1]?.isFinal || false;
        const avgConfidence = countConfidence > 0
          ? sumConfidence / countConfidence
          : (typeof event.results[0]?.[0]?.confidence === 'number' ? event.results[0][0].confidence : 0.88);
        options?.onResult?.(combined, hasFinal, avgConfidence);
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

  /**
   * Chọn định dạng MIME được trình duyệt hỗ trợ để ghi âm
   */
  private pickSupportedMimeType(): string {
    if (typeof MediaRecorder === 'undefined') return 'audio/webm';
    const candidateTypes = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/ogg',
      'audio/mp4',
      'audio/wav',
    ];
    for (const t of candidateTypes) {
      if (MediaRecorder.isTypeSupported(t)) {
        return t;
      }
    }
    return '';
  }

  /**
   * Bắt đầu ghi âm audio stream từ micro cho Whisper STT Engine
   */
  public async startAudioRecording(): Promise<boolean> {
    if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      return false;
    }
    try {
      this.stopAudioRecordingSync();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      this.audioStream = stream;
      this.audioChunks = [];
      this.recordingStartedAt = Date.now();

      const mimeType = this.pickSupportedMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      this.mediaRecorder = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          this.audioChunks.push(e.data);
        }
      };

      recorder.start(100);
      return true;
    } catch (err) {
      console.warn('[Scenario STT] Failed to start MediaRecorder:', err);
      this.stopAudioRecordingSync();
      return false;
    }
  }

  /**
   * Dừng ghi âm và trả về audio blob kèm thời lượng phát âm thực tế
   */
  public async stopAudioRecording(): Promise<{ blob: Blob; durationSeconds: number } | null> {
    const recorder = this.mediaRecorder;
    const startedAt = this.recordingStartedAt;

    if (!recorder || recorder.state === 'inactive') {
      this.stopAudioRecordingSync();
      return null;
    }

    return new Promise((resolve) => {
      recorder.onstop = () => {
        const mime = recorder.mimeType || 'audio/webm';
        const durationSeconds = Math.max(0.1, (Date.now() - startedAt) / 1000);
        const blob = new Blob(this.audioChunks, { type: mime });
        this.stopAudioRecordingSync();
        if (blob.size === 0) {
          resolve(null);
        } else {
          resolve({ blob, durationSeconds });
        }
      };

      try {
        recorder.stop();
      } catch {
        this.stopAudioRecordingSync();
        resolve(null);
      }
    });
  }

  /**
   * Dọn dẹp luồng micro lập tức (giải phóng mic phần cứng)
   */
  public stopAudioRecordingSync(): void {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.stop();
      } catch {
        // ignore
      }
    }
    this.mediaRecorder = null;
    if (this.audioStream) {
      try {
        this.audioStream.getTracks().forEach((t) => t.stop());
      } catch {
        // ignore
      }
      this.audioStream = null;
    }
    this.audioChunks = [];
  }

  /**
   * Kích hoạt lệnh khởi động Whisper STT Engine ngầm qua Backend
   */
  public async triggerAutoStartWhisper(): Promise<void> {
    if (this.isAutoStartingWhisper) return;
    this.isAutoStartingWhisper = true;
    try {
      await fetch('/api/stt/start-engine', { method: 'POST' });
    } catch {
      // ignore
    } finally {
      setTimeout(() => {
        this.isAutoStartingWhisper = false;
      }, 20000);
    }
  }

  /**
   * Nhận diện giọng nói tiếng Nhật chính xác cao qua Whisper STT Engine
   * Hỗ trợ tự động fallback tức thì sang Web Speech API nếu Whisper chưa bật
   */
  public async transcribeWithWhisper(audioBlob: Blob): Promise<{
    text: string;
    confidence: number;
    durationSeconds: number;
    speechPace: number;
    audioUrl?: string;
  } | null> {
    if (!audioBlob || audioBlob.size === 0) return null;

    // Nếu vừa phát hiện Whisper offline trong vòng 25s, fallback ngay lập tức không chờ đợi
    if (Date.now() < this.whisperOfflineUntil) {
      return null;
    }

    const ext = audioBlob.type.includes('ogg') ? 'ogg' : audioBlob.type.includes('wav') ? 'wav' : 'webm';
    const formData = new FormData();
    formData.append('file', audioBlob, `recording.${ext}`);

    // Tier 1: Gọi qua Backend proxy /api/stt/transcribe với timeout nhanh (2500ms)
    try {
      const controller1 = new AbortController();
      const timeout1 = setTimeout(() => controller1.abort(), 2500);
      const res = await fetch('/api/stt/transcribe?language=ja', {
        method: 'POST',
        body: formData,
        signal: controller1.signal,
      }).finally(() => clearTimeout(timeout1));

      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          return {
            text: json.data.text || '',
            confidence: json.data.confidence ?? 0.88,
            durationSeconds: json.data.durationSeconds ?? 0,
            speechPace: json.data.speechPace ?? 0,
            audioUrl: json.data.audioUrl,
          };
        }
      } else if (res.status === 503 || res.status === 502) {
        this.whisperOfflineUntil = Date.now() + 25000;
        void this.triggerAutoStartWhisper();
      }
    } catch (err) {
      console.warn('[Scenario STT] Backend Whisper proxy offline or timed out, triggering background auto-launch:', err);
      this.whisperOfflineUntil = Date.now() + 25000;
      void this.triggerAutoStartWhisper();
    }

    return null;
  }

  /**
   * Lưu trữ audio người học lên server wwwroot/audio/roleplay để nghe lại vĩnh viễn
   */
  public async saveLearnerAudio(audioBlob: Blob): Promise<string | null> {
    if (!audioBlob || audioBlob.size === 0) return null;
    try {
      const ext = audioBlob.type.includes('ogg') ? 'ogg' : audioBlob.type.includes('wav') ? 'wav' : 'webm';
      const formData = new FormData();
      formData.append('file', audioBlob, `recording.${ext}`);
      const res = await fetch('/api/stt/save-audio', {
        method: 'POST',
        body: formData,
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data?.audioUrl) {
          return json.data.audioUrl;
        }
      }
    } catch (err) {
      console.warn('[Scenario STT] Save learner audio failed:', err);
    }
    return null;
  }

  /**
   * Kiểm tra xem Whisper Engine có sẵn sàng phục vụ không
   */
  public async isWhisperAvailable(): Promise<boolean> {
    if (Date.now() < this.whisperOfflineUntil) {
      return false;
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1500);
      const res = await fetch('/api/stt/health', { signal: controller.signal })
        .finally(() => clearTimeout(timeout));
      if (res.ok) {
        const json = await res.json();
        if (json.data?.available) return true;
      }
    } catch {
      // ignore
    }

    this.whisperOfflineUntil = Date.now() + 25000;
    void this.triggerAutoStartWhisper();
    return false;
  }
}

export const scenarioVoiceService = new ScenarioVoiceService();
