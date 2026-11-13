import { useState, useRef, useCallback, useEffect } from 'react';
import { countJapaneseMora } from '../utils/moraPhonetics';

export type MicState = 'idle' | 'armed' | 'speaking' | 'trailing' | 'standby';

interface UseHandsFreeMicOptions {
  onValidSpeechSubmit?: (transcript: string, audioBlob?: Blob) => void;
  onSilenceTimeout?: () => void;
  minMoraThreshold?: number; // mặc định 2 mora tiếng Nhật
  silenceThresholdMs?: number; // thời gian im lặng để chốt nộp (mặc định 1400ms)
  standbyTimeoutMs?: number; // thời gian không nói gì chuyển sang standby (mặc định 20.000ms = 20s)
  currentAiMessage?: string; // để lọc tiếng vọng của chính AI
}

export function useHandsFreeMic({
  onValidSpeechSubmit,
  onSilenceTimeout,
  minMoraThreshold = 2,
  silenceThresholdMs = 1400,
  standbyTimeoutMs = 20000,
  currentAiMessage = ''
}: UseHandsFreeMicOptions = {}) {
  const [micState, setMicState] = useState<MicState>('idle');
  const [interimText, setInterimText] = useState('');
  const [isLowConfidenceDraft, setIsLowConfidenceDraft] = useState(false);

  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const stateRef = useRef<MicState>('idle');
  stateRef.current = micState;

  const silenceTimerRef = useRef<any>(null);
  const standbyTimerRef = useRef<any>(null);
  const transcriptBufferRef = useRef('');

  // Danh sách các từ ảo/hallucination thường gặp của Whisper/WebSpeech khi thu tiếng ồn
  const isHallucinationOrEcho = useCallback((text: string): boolean => {
    const cleaned = text.trim();
    if (!cleaned) return true;

    // 1. Kiểm tra lặp lại đúng câu AI vừa nói (Echo cancellation phòng vệ)
    if (currentAiMessage && currentAiMessage.trim().includes(cleaned) && cleaned.length > 4) {
      return true;
    }

    // 2. Chữ rác vô nghĩa thường gặp khi chỉ có tiếng thở/tiếng click chuột
    const trashList = [
      'ご視聴ありがとうございました',
      'チャンネル登録',
      'Thank you',
      'Subtitles by',
      'おやすみなさい',
      'あああ',
      'うん'
    ];
    if (trashList.some(trash => cleaned.includes(trash)) && cleaned.length < 15) {
      return true;
    }

    return false;
  }, [currentAiMessage]);

  // Kiểm tra có đủ mora tiếng Nhật hợp lệ không
  const hasValidMora = useCallback((text: string): boolean => {
    try {
      const moras = countJapaneseMora(text);
      return moras >= minMoraThreshold;
    } catch {
      return text.trim().length >= 2;
    }
  }, [minMoraThreshold]);

  // Dọn dẹp timer
  const clearTimers = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (standbyTimerRef.current) {
      clearTimeout(standbyTimerRef.current);
      standbyTimerRef.current = null;
    }
  }, []);

  // Đặt lại hẹn giờ Standby (20s không nói gì sẽ tự tắt mic sang chế độ ngủ)
  const resetStandbyTimer = useCallback(() => {
    if (standbyTimerRef.current) clearTimeout(standbyTimerRef.current);
    standbyTimerRef.current = setTimeout(() => {
      if (stateRef.current === 'armed') {
        setMicState('standby');
        if (recognitionRef.current) {
          try { recognitionRef.current.stop(); } catch { /* ignore */ }
        }
        if (onSilenceTimeout) onSilenceTimeout();
      }
    }, standbyTimeoutMs);
  }, [standbyTimeoutMs, onSilenceTimeout]);

  // Bắt đầu chế độ Armed (chờ giọng nói hợp lệ)
  const armMic = useCallback(() => {
    clearTimers();
    setInterimText('');
    setIsLowConfidenceDraft(false);
    transcriptBufferRef.current = '';
    audioChunksRef.current = [];

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'ja-JP';
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onstart = () => {
        setMicState('armed');
        resetStandbyTimer();
      };

      recognition.onresult = (event: any) => {
        let currentInterim = '';
        let currentFinal = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const item = event.results[i];
          if (item.isFinal) {
            currentFinal += item[0].transcript;
          } else {
            currentInterim += item[0].transcript;
          }
        }

        const candidate = (currentFinal || currentInterim).trim();
        if (!candidate) return;

        // Nếu mic đang ở trạng thái Armed và phát hiện mora hợp lệ -> Chuyển sang Speaking
        if (stateRef.current === 'armed' && hasValidMora(candidate)) {
          setMicState('speaking');
          if (standbyTimerRef.current) clearTimeout(standbyTimerRef.current);
        }

        if (stateRef.current === 'speaking' || stateRef.current === 'trailing') {
          setInterimText(candidate);
          transcriptBufferRef.current = candidate;

          // Bắt đầu đếm nhịp Trailing để chốt nộp
          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
          setMicState('trailing');

          silenceTimerRef.current = setTimeout(() => {
            const finalSpeech = transcriptBufferRef.current.trim();
            clearTimers();

            // Chốt chặn chống ảo giác / tiếng vọng
            if (isHallucinationOrEcho(finalSpeech) || !hasValidMora(finalSpeech)) {
              // Bỏ qua rác, quay về Armed, tuyệt đối không tự nộp bừa
              setMicState('armed');
              setInterimText('');
              resetStandbyTimer();
              return;
            }

            // Hợp lệ 100% -> Gọi nộp
            setMicState('idle');
            try { recognition.stop(); } catch { /* ignore */ }
            if (onValidSpeechSubmit) {
              onValidSpeechSubmit(finalSpeech);
            }
          }, silenceThresholdMs);
        }
      };

      recognition.onerror = (e: any) => {
        if (e.error === 'no-speech') {
          // Không coi là lỗi, tiếp tục giữ trạng thái Armed cho đến hết 20s
          return;
        }
      };

      recognition.onend = () => {
        if (stateRef.current === 'armed' || stateRef.current === 'speaking' || stateRef.current === 'trailing') {
          // Tự động khởi động lại nếu chưa hết 20s và chưa ở standby
          try {
            recognition.start();
          } catch {
            setMicState('idle');
          }
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      setMicState('idle');
    }
  }, [clearTimers, hasValidMora, isHallucinationOrEcho, onValidSpeechSubmit, resetStandbyTimer, silenceThresholdMs]);

  // Ngắt mic thủ công hoặc chuyển trạng thái
  const disarmMic = useCallback(() => {
    clearTimers();
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { /* ignore */ }
      recognitionRef.current = null;
    }
    setMicState('idle');
    setInterimText('');
  }, [clearTimers]);

  useEffect(() => {
    return () => {
      clearTimers();
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch { /* ignore */ }
      }
    };
  }, [clearTimers]);

  return {
    micState,
    interimText,
    isLowConfidenceDraft,
    armMic,
    disarmMic,
    hasValidMora,
    isHallucinationOrEcho
  };
}

