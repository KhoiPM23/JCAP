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

  // MediaRecorder audio capture for Whisper STT Engine
  private mediaRecorder: MediaRecorder | null = null;
  private audioStream: MediaStream | null = null;
  private audioChunks: Blob[] = [];
  private recordingStartedAt = 0;
  private visemeAnimFrame: number | null = null;
  private onVisemeCallback: ((v: any) => void) | null = null;

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
   * Lấy tốc độ đọc AI từ localStorage (mặc định là 1.0)
   */
  public getSpeechRate(): number {
    if (typeof window === 'undefined') return 1.0;
    try {
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
    return 1.0;
  }

  /**
   * Lưu tốc độ đọc AI vào localStorage
   */
  public setSpeechRate(rate: number): void {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem('jcap_scenario_speech_rate', rate.toString());
    } catch {
      // ignore
    }
  }

  /**
   * Dừng toàn bộ âm thanh đang phát (cả audio element và SpeechSynthesis)
   */
  public stopAllAudio(): void {
    this.isSpeechCancelled = true;

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
      const audioUrl = await voicevoxService.getAudioUrl(cleanText, resolvedVoiceId);
      const audio = new Audio(audioUrl);
      audio.playbackRate = resolvedRate;
      this.currentAudio = audio;

      audio.onplay = () => {
        if (!this.isSpeechCancelled) {
          onStart?.();
          if (onViseme) {
            const visemes = voicevoxService.getVisemes(text, resolvedVoiceId);
            if (visemes && visemes.length > 0) {
              const step = () => {
                if (!this.currentAudio || this.currentAudio.paused || this.currentAudio.ended || this.isSpeechCancelled) {
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
        if (!this.isSpeechCancelled) {
          onEnd?.();
        }
      };

      audio.onerror = () => {
        this.currentAudio = null;
        this.speakWithWebSpeech(text, onEnd, resolvedRate, onStart);
      };

      await audio.play().catch(() => {
        this.currentAudio = null;
        this.speakWithWebSpeech(text, onEnd, resolvedRate, onStart);
      });
    } catch {
      this.speakWithWebSpeech(text, onEnd, resolvedRate, onStart);
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

    // Với Web Speech: cắt lát chuỗi văn bản và phát tiếp tức thời từ vị trí chữ tương ứng
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
   * Nhận diện giọng nói tiếng Nhật chính xác cao qua Whisper STT Engine
   * Hỗ trợ tự động fallback: Backend proxy -> Direct Engine -> null (để dùng Web Speech)
   */
  public async transcribeWithWhisper(audioBlob: Blob): Promise<{
    text: string;
    confidence: number;
    durationSeconds: number;
    speechPace: number;
    audioUrl?: string;
  } | null> {
    if (!audioBlob || audioBlob.size === 0) return null;

    const ext = audioBlob.type.includes('ogg') ? 'ogg' : audioBlob.type.includes('wav') ? 'wav' : 'webm';
    const formData = new FormData();
    formData.append('file', audioBlob, `recording.${ext}`);

    // Tier 1: Thử gọi qua Backend proxy /api/stt/transcribe (Lưu audio persistent luôn) với Timeout 4.5s
    try {
      const controller1 = new AbortController();
      const timeout1 = setTimeout(() => controller1.abort(), 7500);
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
      }
    } catch (err) {
      console.warn('[Scenario STT] Backend Whisper proxy unavailable or timed out, trying direct engine:', err);
    }

    // Tier 2: Thử gọi trực tiếp Whisper Engine /whisper/transcribe với Timeout 4.5s
    try {
      const controller2 = new AbortController();
      const timeout2 = setTimeout(() => controller2.abort(), 7500);
      const directRes = await fetch('/whisper/transcribe?language=ja', {
        method: 'POST',
        body: formData,
        signal: controller2.signal,
      }).finally(() => clearTimeout(timeout2));

      if (directRes.ok) {
        const json = await directRes.json();
        if (json.success) {
          // Lưu audio file song song lên backend để có link phát lại
          const savedUrl = await this.saveLearnerAudio(audioBlob);
          return {
            text: json.text || '',
            confidence: json.confidence ?? 0.88,
            durationSeconds: json.durationSeconds ?? 0,
            speechPace: json.speechPace ?? 0,
            audioUrl: savedUrl || undefined,
          };
        }
      }
    } catch (err) {
      console.warn('[Scenario STT] Direct Whisper engine call failed or timed out:', err);
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
    try {
      const res = await fetch('/api/stt/health');
      if (res.ok) {
        const json = await res.json();
        if (json.data?.available) return true;
      }
    } catch {
      // ignore
    }

    try {
      const direct = await fetch('/whisper/health');
      if (direct.ok) {
        const json = await direct.json();
        return json.status === 'ok';
      }
    } catch {
      // ignore
    }

    return false;
  }
}

export const scenarioVoiceService = new ScenarioVoiceService();
