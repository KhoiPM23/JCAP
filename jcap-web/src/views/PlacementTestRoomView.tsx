import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LivingAvatar } from '../components/roleplay/LivingAvatar';
import { TypewriterText } from '../components/roleplay/TypewriterText';
import {
  MicIcon,
  VolumeIcon,
  PhoneCallIcon,
  HandIcon,
  SettingsIcon,
  RefreshIcon,
  CheckCircleIcon,
  AlertCircleIcon,
} from '../components/common/Icons';
import { placementTestService } from '../services/placementTestService';
import { scenarioVoiceService } from '../services/scenarioVoiceService';
import type {
  HotelContextPackageDto,
  PlacementTestTurnMessageDto,
  PlacementTestCompleteResponseDto,
} from '../types/placementTest';

export const PlacementTestRoomView: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { refreshUser } = useAuth();
  const [allowRetakeForTesting, setAllowRetakeForTesting] = useState(true);

  // 1. Trạng thái phiên kiểm tra
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  // 2. Dữ liệu hội thoại & Bối cảnh
  const [messages, setMessages] = useState<PlacementTestTurnMessageDto[]>([]);
  const [contextPackage, setContextPackage] = useState<HotelContextPackageDto | null>(null);

  // 3. Tiến trình sự kiện phiên kiểm tra
  const [currentEvent, setCurrentEvent] = useState<string>('EVT-01');

  const [strikeWarning, setStrikeWarning] = useState<string | null>(null);
  const [isConcluded, setIsConcluded] = useState(false);
  const [finalResult, setFinalResult] = useState<PlacementTestCompleteResponseDto | null>(null);
  const [showResultModal, setShowResultModal] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);

  // 4. State điều khiển hiển thị & Nhập liệu
  const [isHandsFreeMode, setIsHandsFreeMode] = useState(false);
  const [showTranslation, setShowTranslation] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [inputText, setInputText] = useState('');
  const [isRecordingMic, setIsRecordingMic] = useState(false);
  const [playingMessageId, setPlayingMessageId] = useState<number | null>(null);
  const [synthesizingMessageId, setSynthesizingMessageId] = useState<number | null>(null);
  const [streamingAiMessageId, setStreamingAiMessageId] = useState<number | null>(null);

  const recognitionRef = useRef<any>(null);
  const isMicActiveRef = useRef(false);
  const usedVoiceInputRef = useRef(false);
  const micStartedAtRef = useRef<number>(0);
  const lastSpeechActivityAtRef = useRef<number>(0);
  const silenceCountdownIntervalRef = useRef<number | null>(null);
  const committedTranscriptRef = useRef<string>('');
  const currentSessionTranscriptRef = useRef<string>('');
  const micRestartCountRef = useRef(0);
  const [micSilenceProgress, setMicSilenceProgress] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const turnStartTimeRef = useRef<number>(Date.now());

  // Tự động cuộn xuống cuối khi có tin nhắn mới
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSending]);

  // Khởi tạo hoặc tải phiên làm bài kiểm tra từ Backend
  const isMountedRef = useRef(true);
  const sessionRunIdRef = useRef(0);
  const speechTokenRef = useRef(0);
  const cancelActiveSpeechRef = useRef<(() => void) | null>(null);
  const isCompletingRef = useRef(false);
  const hasCompletedResultRef = useRef(false);

  const MIC_SILENCE_TIMEOUT_MS = 5000;

  const combineTranscriptParts = (committed: string, current: string) => {
    const a = committed.trim();
    const b = current.trim();
    if (!a) return b;
    if (!b) return a;
    return `${a} ${b}`;
  };

  const stopMicRecording = () => {
    isMicActiveRef.current = false;
    micRestartCountRef.current = 0;

    if (silenceCountdownIntervalRef.current !== null) {
      window.clearInterval(silenceCountdownIntervalRef.current);
      silenceCountdownIntervalRef.current = null;
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.onstart = null;
        recognitionRef.current.onspeechstart = null;
        recognitionRef.current.onspeechend = null;
        recognitionRef.current.onsoundstart = null;
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      } catch {
        try {
          recognitionRef.current.abort();
        } catch {
          // ignore
        }
      }
      recognitionRef.current = null;
    }

    if (isMountedRef.current) {
      setMicSilenceProgress(0);
      setIsRecordingMic(false);
    }
  };

  const refreshMicSilenceActivity = () => {
    if (!isMicActiveRef.current) return;
    lastSpeechActivityAtRef.current = Date.now();
    micRestartCountRef.current = 0;
    if (isMountedRef.current) {
      setMicSilenceProgress(0);
    }
  };

  const startSilenceCountdownTimer = () => {
    if (silenceCountdownIntervalRef.current !== null) {
      window.clearInterval(silenceCountdownIntervalRef.current);
    }
    silenceCountdownIntervalRef.current = window.setInterval(() => {
      if (!isMicActiveRef.current) {
        if (silenceCountdownIntervalRef.current !== null) {
          window.clearInterval(silenceCountdownIntervalRef.current);
          silenceCountdownIntervalRef.current = null;
        }
        return;
      }

      const elapsed = Date.now() - lastSpeechActivityAtRef.current;
      const progress = Math.min(1, Math.max(0, elapsed / MIC_SILENCE_TIMEOUT_MS));
      if (isMountedRef.current) {
        setMicSilenceProgress(progress);
      }

      if (elapsed >= MIC_SILENCE_TIMEOUT_MS) {
        stopMicRecording();
      }
    }, 50);
  };

  const startRecognitionInstance = (SpeechRecognitionCtor: any) => {
    if (!isMicActiveRef.current) return;

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = 'ja-JP';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onstart = () => {
      if (!isMicActiveRef.current) {
        try {
          recognition.stop();
        } catch {
          // ignore
        }
        return;
      }
      if (isMountedRef.current) {
        setIsRecordingMic(true);
      }
    };

    recognition.onspeechstart = () => {
      refreshMicSilenceActivity();
    };

    recognition.onspeechend = () => {
      refreshMicSilenceActivity();
    };

    recognition.onresult = (event: any) => {
      if (!isMicActiveRef.current) return;
      const transcript = Array.from(event.results)
        .map((result: any) => result[0]?.transcript || '')
        .join('')
        .trim();

      currentSessionTranscriptRef.current = transcript;
      if (transcript.length > 0) {
        usedVoiceInputRef.current = true;
        refreshMicSilenceActivity();
        setInputText(combineTranscriptParts(committedTranscriptRef.current, transcript));
      }
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      if (
        event.error === 'not-allowed' ||
        event.error === 'service-not-allowed' ||
        event.error === 'audio-capture'
      ) {
        stopMicRecording();
      }
    };

    recognition.onend = () => {
      if (recognitionRef.current === recognition) {
        recognitionRef.current = null;
      }

      if (currentSessionTranscriptRef.current.trim()) {
        committedTranscriptRef.current = combineTranscriptParts(
          committedTranscriptRef.current,
          currentSessionTranscriptRef.current
        );
        currentSessionTranscriptRef.current = '';
      }

      if (!isMicActiveRef.current) {
        return;
      }

      const remainingMs = MIC_SILENCE_TIMEOUT_MS - (Date.now() - lastSpeechActivityAtRef.current);
      if (remainingMs > 250 && micRestartCountRef.current < 8) {
        micRestartCountRef.current += 1;
        try {
          startRecognitionInstance(SpeechRecognitionCtor);
          return;
        } catch (restartErr) {
          console.warn('Cannot keep speech recognition open during hesitation:', restartErr);
        }
      }

      stopMicRecording();
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  const loadPlacementSession = async (reset: boolean = false) => {
    const runId = ++sessionRunIdRef.current;
    stopMicRecording();
    cancelActiveSpeechRef.current?.();
    scenarioVoiceService.stopAllAudio();
    setPlayingMessageId(null);
    setSynthesizingMessageId(null);
    setStreamingAiMessageId(null);
    isCompletingRef.current = false;
    hasCompletedResultRef.current = false;
    setIsLoading(true);
    setLoadError(null);
    setStrikeWarning(null);
    setIsConcluded(false);
    setFinalResult(null);
    setShowResultModal(false);

    try {
      const res = await placementTestService.startOrResume(reset);
      if (!isMountedRef.current || sessionRunIdRef.current !== runId) return;

      if (res.success && res.data) {
        setSessionId(res.data.sessionId);
        setCurrentEvent(res.data.currentEvent || 'EVT-01');
        setContextPackage(res.data.contextPackage);
        const loadedMessages =
          res.data.messageHistory && res.data.messageHistory.length > 0
            ? res.data.messageHistory
            : res.data.openingMessage
            ? [res.data.openingMessage]
            : [];
        setMessages(loadedMessages);

        const openingToPlay =
          !res.data.isResumed && res.data.openingMessage
            ? res.data.openingMessage
            : loadedMessages.length === 1 && loadedMessages[0].sender === 'Ai'
            ? loadedMessages[0]
            : null;

        if (!res.data.isResumed && openingToPlay?.id) {
          setStreamingAiMessageId(openingToPlay.id);
        }
        turnStartTimeRef.current = Date.now();
        if (reset && searchParams.get('reset') === '1') {
          setSearchParams({}, { replace: true });
        }
        void refreshUser();

        // Tự động phát giọng đọc câu mồi đầu tiên của AI (truyền trực tiếp speakerId vì state contextPackage chưa kịp re-render)
        if (openingToPlay?.japaneseText) {
          void playAiSpeechWithLifecycle(
            openingToPlay.id,
            openingToPlay.japaneseText,
            res.data.contextPackage?.receptionistSpeakerId
          );
        }
      } else {
        setLoadError(res.message || 'Không thể tải phiên kiểm tra xếp lớp.');
      }
    } catch (err: any) {
      if (!isMountedRef.current || sessionRunIdRef.current !== runId) return;
      setLoadError(err.message || 'Lỗi kết nối máy chủ.');
    } finally {
      if (isMountedRef.current && sessionRunIdRef.current === runId) {
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    isMountedRef.current = true;
    const shouldReset = searchParams.get('reset') === '1';
    void placementTestService.getStatus().then((sRes) => {
      if (isMountedRef.current && sRes.success && sRes.data) {
        setAllowRetakeForTesting(sRes.data.allowRetakeForTesting ?? false);
      }
    });
    void loadPlacementSession(shouldReset);
    return () => {
      isMountedRef.current = false;
      sessionRunIdRef.current += 1;
      stopMicRecording();
    cancelActiveSpeechRef.current?.();
      scenarioVoiceService.stopAllAudio();
    };
  }, []);

  // Tổng hợp & tự động phát giọng đọc AI ở nền ngay khi sẵn sàng (không chặn hiển thị văn bản),
  // và resolve Promise khi âm thanh phát xong 100% (hoặc bị hủy/lỗi).
  const playAiSpeechWithLifecycle = (
    msgId: number,
    text: string,
    speakerIdOverride?: number
  ): Promise<void> => {
    stopMicRecording();
    cancelActiveSpeechRef.current?.();

    const token = ++speechTokenRef.current;
    const speakerId = speakerIdOverride ?? contextPackage?.receptionistSpeakerId;

    return new Promise<void>((resolve) => {
      let hasStartedPlayback = false;
      let hasFinished = false;
      let postStartFallbackTimer: number | null = null;
      let playbackEndSafetyTimer: number | null = null;

      const clearAllTimers = () => {
        if (postStartFallbackTimer !== null) {
          window.clearTimeout(postStartFallbackTimer);
          postStartFallbackTimer = null;
        }
        if (playbackEndSafetyTimer !== null) {
          window.clearTimeout(playbackEndSafetyTimer);
          playbackEndSafetyTimer = null;
        }
      };

      const ensurePlaybackEndSafetyTimer = () => {
        if (playbackEndSafetyTimer !== null || hasFinished) return;
        const estimatedMaxPlaybackMs = Math.min(75000, Math.max(20000, text.length * 550));
        playbackEndSafetyTimer = window.setTimeout(() => {
          finishNow();
        }, estimatedMaxPlaybackMs);
      };

      const finishNow = () => {
        if (hasFinished) return;
        hasFinished = true;
        clearAllTimers();
        if (cancelActiveSpeechRef.current === cancelCurrent) {
          cancelActiveSpeechRef.current = null;
        }
        if (isMountedRef.current && speechTokenRef.current === token) {
          setSynthesizingMessageId((prev) => (prev === msgId ? null : prev));
          setPlayingMessageId((prev) => (prev === msgId ? null : prev));
          if (!isMicActiveRef.current && !usedVoiceInputRef.current && !committedTranscriptRef.current.trim()) {
            turnStartTimeRef.current = Date.now();
          }
        }
        resolve();
      };

      const cancelCurrent = () => {
        finishNow();
      };
      cancelActiveSpeechRef.current = cancelCurrent;

      if (!text.trim()) {
        finishNow();
        return;
      }

      if (isMountedRef.current && speechTokenRef.current === token) {
        setPlayingMessageId(null);
        setSynthesizingMessageId(msgId);
      }

      scenarioVoiceService
        .playAiSpeechStreamed(
          text,
          speakerId,
          () => {
            finishNow();
          },
          undefined,
          () => {
            hasStartedPlayback = true;
            if (postStartFallbackTimer !== null) {
              window.clearTimeout(postStartFallbackTimer);
              postStartFallbackTimer = null;
            }
            if (isMountedRef.current && speechTokenRef.current === token) {
              setSynthesizingMessageId((prev) => (prev === msgId ? null : prev));
              setPlayingMessageId(msgId);
            }
            ensurePlaybackEndSafetyTimer();
          },
          undefined,
          35000
        )
        .then(() => {
          // Nếu trình duyệt chặn autoplay khiến onStart chưa bắn ngay, gỡ nhãn "Đang chuẩn bị giọng..." sau 1.5s
          if (!hasStartedPlayback && !hasFinished) {
            postStartFallbackTimer = window.setTimeout(() => {
              if (isMountedRef.current && speechTokenRef.current === token) {
                setSynthesizingMessageId((prev) => (prev === msgId ? null : prev));
              }
              ensurePlaybackEndSafetyTimer();
            }, 1500);
          }
        })
        .catch((err) => {
          console.warn('Playback error:', err);
          finishNow();
        });
    });
  };

  // Xử lý gửi tin nhắn của học viên lên Backend
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || isSending || isConcluded || !sessionId) return;

    const runId = sessionRunIdRef.current;
    const usedMicForTurn = isRecordingMic || isMicActiveRef.current || usedVoiceInputRef.current;
    const micDurationSec =
      usedMicForTurn && micStartedAtRef.current > 0
        ? Math.max(1.0, Number(((Date.now() - micStartedAtRef.current) / 1000).toFixed(1)))
        : 0;
    stopMicRecording();
    cancelActiveSpeechRef.current?.();
    scenarioVoiceService.stopAllAudio();
    usedVoiceInputRef.current = false;
    micStartedAtRef.current = 0;
    committedTranscriptRef.current = '';
    const userText = inputText.trim();
    setInputText('');
    setStreamingAiMessageId(null);
    setIsSending(true);
    setStrikeWarning(null);

    const latencySeconds = Math.max(0.5, (Date.now() - turnStartTimeRef.current) / 1000);

    // Optimistic UI: Tạo tạm tin nhắn người dùng hiển thị ngay lập tức
    const optimisticUserMsg: PlacementTestTurnMessageDto = {
      id: Date.now(),
      sender: 'User',
      japaneseText: userText,
      vietnameseMeaning: '',
      furiganaHtml: null,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticUserMsg]);

    try {
      const res = await placementTestService.sendMessage(sessionId, {
        message: userText,
        fallbackToTextInput: !usedMicForTurn,
        responseLatencySeconds: latencySeconds,
        speakingDurationSeconds: usedMicForTurn ? (micDurationSec || 3.0) : 0,
      });

      if (!isMountedRef.current || sessionRunIdRef.current !== runId) {
        if (isMountedRef.current) setIsSending(false);
        return;
      }

      if (res.success && res.data) {
        const turnData = res.data;

        // 1. Hiển thị NGAY LẬP TỨC cả bản dịch lượt nói học viên lẫn câu trả lời của AI (kèm hiệu ứng gõ chữ mượt như Scenario)
        setMessages((prev) => [...prev.slice(0, -1), turnData.userMessage, turnData.aiMessage]);
        if (turnData.aiMessage?.id) {
          setStreamingAiMessageId(turnData.aiMessage.id);
        }

        // Cập nhật trạng thái sự kiện hiện tại ngay khi nhận phản hồi
        setCurrentEvent(turnData.currentEvent);

        // Cảnh báo nếu học viên nói lạc đề hoặc vi phạm nguyên tắc
        if (turnData.isStrikeWarning && turnData.strikeWarningMessage) {
          setStrikeWarning(turnData.strikeWarningMessage);
        }

        setIsSending(false);
        turnStartTimeRef.current = Date.now();

        if (turnData.isConcluded) {
          setIsConcluded(true);
          void refreshUser();
        }

        // 2. Đường tiếng: tổng hợp VOICEVOX ở nền, xong lúc nào tự động phát lúc đó
        const aiText = turnData.aiMessage?.japaneseText || '';
        if (aiText) {
          void playAiSpeechWithLifecycle(turnData.aiMessage.id, aiText);
        }
      } else {
        setStrikeWarning(res.message || 'Lỗi xử lý phản hồi từ AI.');
        setIsSending(false);
      }
    } catch (err: any) {
      if (isMountedRef.current && sessionRunIdRef.current === runId) {
        setStrikeWarning(err.message || 'Lỗi gửi tin nhắn đến máy chủ.');
        setIsSending(false);
      }
    }
  };

  // Phát giọng đọc tiếng Nhật cho tin nhắn của AI
  const handlePlayAiSpeech = async (msgId: number, text: string) => {
    if (playingMessageId === msgId) {
      cancelActiveSpeechRef.current?.();
      scenarioVoiceService.stopAllAudio();
      return;
    }
    await playAiSpeechWithLifecycle(msgId, text);
  };

  // Toggle Micro thu âm (Web Speech API - giữ mở 5s sau âm thanh cuối để người học ngập ngừng)
  const handleToggleMic = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert('Trình duyệt của bạn chưa hỗ trợ nhận diện giọng nói Web Speech API. Vui lòng nhập bằng bàn phím.');
      return;
    }

    if (isRecordingMic || isMicActiveRef.current) {
      stopMicRecording();
      return;
    }

    // Ngắt âm thanh AI đang tổng hợp/phát để không dội ngược vào micro
    cancelActiveSpeechRef.current?.();
    scenarioVoiceService.stopAllAudio();

    try {
      committedTranscriptRef.current = inputText.trim();
      currentSessionTranscriptRef.current = '';
      micRestartCountRef.current = 0;
      micStartedAtRef.current = Date.now();
      isMicActiveRef.current = true;
      lastSpeechActivityAtRef.current = Date.now();
      setMicSilenceProgress(0);
      startSilenceCountdownTimer();
      startRecognitionInstance(SpeechRecognition);
    } catch (err) {
      console.error('Cannot start speech recognition:', err);
      stopMicRecording();
    }
  };

  // Kết thúc bài kiểm tra và lấy kết quả tổng hợp
  const handleConcludeAndFetchResult = async () => {
    if (!sessionId) return;
    if (hasCompletedResultRef.current || finalResult) {
      setShowResultModal(true);
      return;
    }
    if (isCompletingRef.current) return;
    isCompletingRef.current = true;
    try {
      const res = await placementTestService.complete(sessionId);
      if (res.success && res.data && isMountedRef.current) {
        hasCompletedResultRef.current = true;
        setFinalResult(res.data);
        setShowResultModal(true);
        void refreshUser();
      }
    } catch (err) {
      console.error('Cannot complete session:', err);
    } finally {
      isCompletingRef.current = false;
    }
  };

  return (
    <div
      data-theme="phong-luyen"
      className="flex h-screen flex-col overflow-hidden bg-[var(--paper-100)] text-[var(--sumi)] font-sans"
    >
      {/* ========================================================================= */}
      {/* 1. TOP HEADER BAR                                                         */}
      {/* ========================================================================= */}
      <header className="flex h-14 sm:h-16 shrink-0 items-center justify-between border-b border-[var(--line)] bg-[var(--paper-50)]/95 backdrop-blur-sm px-3 sm:px-4 md:px-6 shadow-xs z-30 flex-nowrap">
        {/* Left: Nút rời phòng & Thông tin kịch bản */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1 mr-2 sm:mr-4 overflow-hidden">
          <button
            type="button"
            onClick={() => setShowLeaveModal(true)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-[var(--line)] bg-white px-2.5 py-1.5 text-xs font-semibold text-[var(--sumi-faint)] transition hover:border-[var(--ai)] hover:text-[var(--ai)] hover:shadow-xs whitespace-nowrap active:scale-95 cursor-pointer"
            title="Tạm dừng và rời phòng"
          >
            <span>←</span>
            <span className="hidden sm:inline">Rời phòng</span>
          </button>

          <div className="flex items-center gap-2 sm:gap-3 min-w-0 overflow-hidden flex-1">
            <div className="shrink-0 p-1 rounded-full border border-stone-200 bg-white shadow-2xs aspect-square flex items-center justify-center">
              <LivingAvatar
                size="sm"
                avatarState={playingMessageId ? 'speaking' : 'idle'}
                personaName="フロント 山田"
                personaRole="Lễ tân"
                scenarioTitle="Khách sạn Sakura"
                archetype="hospitality"
                hideLabel
              />
            </div>
            <div className="min-w-0 overflow-hidden flex-1">
              <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                <h1
                  className="text-xs sm:text-sm font-bold font-sans leading-tight text-[var(--sumi)] max-w-[220px] sm:max-w-xs md:max-w-md lg:max-w-lg truncate"
                  title="Khách sạn Sakura (ホテルさくら)"
                >
                  Khách sạn Sakura (ホテルさくら)
                </h1>

                {/* Badge trạng thái sự kiện cho Tester */}
                <span className="shrink-0 rounded-full bg-[var(--ai-soft)] px-2 py-0.5 text-[10px] font-bold text-[var(--ai)] whitespace-nowrap">
                  {currentEvent}
                </span>
              </div>
              <div className="text-[11px] text-[var(--sumi-faint)] flex items-center gap-1.5 mt-0.5 min-w-0">
                <span className="hidden sm:inline shrink-0">Đối thoại cùng:</span>
                <span
                  className="font-semibold text-[var(--sumi)] max-w-[180px] sm:max-w-[280px] truncate"
                  title="フロント 山田"
                >
                  Lễ tân Yamada (フロント 山田)
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Controls chuẩn Scenario */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Nút Làm lại bài mới (Huỷ phiên đang dở và khởi tạo lại từ EVT-01) */}
          {allowRetakeForTesting && (
            <button
              type="button"
              disabled={isLoading || isSending}
              onClick={() => void loadPlacementSession(true)}
              className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-[var(--line)] bg-white px-2 sm:px-2.5 py-1.5 text-xs font-semibold text-[var(--sumi)] hover:border-[var(--ai)] hover:text-[var(--ai)] transition active:scale-95 cursor-pointer shadow-2xs disabled:opacity-50"
              title="Huỷ phiên đang làm dở và bắt đầu lại bài kiểm tra từ đầu (Reset)"
            >
              <RefreshIcon className="w-3.5 h-3.5 text-[var(--ai)]" />
              <span className="hidden md:inline">Làm lại</span>
            </button>
          )}

          {/* Nút Rảnh tay */}
          <button
            type="button"
            onClick={() => setIsHandsFreeMode(!isHandsFreeMode)}
            className={`inline-flex items-center gap-1 sm:gap-1.5 rounded-xl border px-2 sm:px-2.5 py-1.5 text-xs font-bold transition whitespace-nowrap shrink-0 shadow-2xs cursor-pointer ${
              isHandsFreeMode
                ? 'border-[var(--ai)] bg-[var(--ai-soft)] text-[var(--ai)] ring-1 ring-[var(--ai)]/30'
                : 'border-[var(--line)] bg-[var(--paper-50)] text-[var(--sumi-muted)] hover:border-[var(--ai)]'
            }`}
          >
            {isHandsFreeMode ? (
              <PhoneCallIcon className="w-3.5 h-3.5 animate-pulse text-[var(--ai)]" />
            ) : (
              <HandIcon className="w-3.5 h-3.5 text-[var(--sumi-muted)]" />
            )}
            <span className="hidden sm:inline">Rảnh tay</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                isHandsFreeMode ? 'bg-[var(--ai)] text-white' : 'bg-slate-200 text-slate-600'
              }`}
            >
              {isHandsFreeMode ? 'BẬT' : 'TẮT'}
            </span>
          </button>


          {/* Dropdown Cài đặt */}
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setIsSettingsOpen(!isSettingsOpen)}
              className={`inline-flex items-center gap-1 sm:gap-1.5 rounded-xl border px-2 sm:px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap shrink-0 transition cursor-pointer ${
                isSettingsOpen
                  ? 'border-[var(--ai)] bg-[var(--ai-soft)] text-[var(--ai)]'
                  : 'border-[var(--line)] bg-white text-[var(--sumi-muted)] hover:border-[var(--ai)]'
              }`}
              title="Cài đặt hỗ trợ (Dịch nghĩa)"
            >
              <SettingsIcon className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">Cài đặt</span>
              {showTranslation && (
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--ai)]" />
              )}
            </button>

            {isSettingsOpen && (
              <div className="absolute right-0 top-full mt-2 z-[200] w-72 rounded-2xl border border-[var(--line)] bg-white p-4 shadow-xl ring-1 ring-black/5 animate-fade-in text-xs space-y-3">
                <div className="flex items-center justify-between border-b border-[var(--line)] pb-2">
                  <span className="font-bold text-[var(--sumi)] text-sm">Cài đặt hiển thị</span>
                  <button
                    type="button"
                    onClick={() => setIsSettingsOpen(false)}
                    className="text-[var(--sumi-faint)] hover:text-[var(--sumi)] cursor-pointer font-bold"
                  >
                    ✕
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-[var(--sumi)]">Dịch nghĩa tiếng Việt</p>
                    <p className="text-[11px] text-[var(--sumi-faint)]">Hiển thị bản dịch dưới câu</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowTranslation(!showTranslation)}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                      showTranslation ? 'bg-[var(--ai)]' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        showTranslation ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Nút Kết thúc sớm / Hoàn thành phiên */}
          {isConcluded || currentEvent === 'EVT-05' || currentEvent === 'CONCLUDED' ? (
            <button
              type="button"
              onClick={() => void handleConcludeAndFetchResult()}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-emerald-500 bg-emerald-600 px-3 sm:px-4 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700 whitespace-nowrap cursor-pointer active:scale-95 animate-pulse"
              title="Đã đến bước tổng kết cuối cùng! Bấm để hoàn tất phiên và nhận bảng điểm"
            >
              <span>✓</span>
              <span className="hidden sm:inline">Hoàn thành phiên</span>
              <span className="sm:hidden">Hoàn thành</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleConcludeAndFetchResult()}
              className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-red-200 bg-white px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50 whitespace-nowrap cursor-pointer active:scale-95"
              title="Hoàn tất bài thi sớm để xem bảng điểm và trình độ ước tính"
            >
              <span className="hidden sm:inline">Kết thúc sớm</span>
              <span className="sm:hidden">Kết thúc</span>
            </button>
          )}
        </div>
      </header>

      {/* ========================================================================= */}
      {/* 2. BODY WORKSPACE (FOCUSED CHAT LAYOUT)                                   */}
      {/* ========================================================================= */}
      <div className="relative flex flex-1 overflow-hidden">
        {/* ============================================================ */}
        {/* 2.B. CENTER COLUMN: UNIFIED SCENARIO CHAT STREAM             */}
        {/* ============================================================ */}
        <main className="flex flex-1 flex-col overflow-hidden bg-[var(--paper-100)]">
          {/* Cảnh báo vi phạm / Lạc đề nếu có */}
          {strikeWarning && (
            <div className="bg-amber-100/90 border-b border-amber-300 px-4 py-2.5 text-xs text-amber-950 flex items-center justify-between shadow-2xs z-20">
              <div className="flex items-center gap-2">
                <AlertCircleIcon className="w-4 h-4 text-amber-700 shrink-0" />
                <span className="font-medium">{strikeWarning}</span>
              </div>
              <button
                type="button"
                onClick={() => setStrikeWarning(null)}
                className="text-amber-800 hover:text-black font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          {/* Vùng cuộn tin nhắn */}
          <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6">
            <div className="mx-auto w-full max-w-[800px] space-y-4">
              {/* Context Summary Banner */}
              <div className="rounded-2xl border border-[var(--line)] bg-white/90 backdrop-blur-xs px-4 py-3.5 shadow-2xs text-xs font-sans space-y-2">
                <div className="flex items-center gap-1.5 font-bold text-[var(--ai)] text-[10.5px] tracking-wide uppercase">
                  <span>Bối cảnh phòng</span>
                </div>
                <p className="text-[var(--sumi)] text-xs leading-relaxed">
                  Bạn vừa đến sảnh <strong>Khách sạn Sakura (Tokyo)</strong> sau chuyến bay dài và đến quầy lễ tân làm thủ tục nhận phòng.
                </p>
                <ul className="space-y-1.5 text-[11.5px] text-[var(--sumi-muted)] leading-relaxed pl-4 list-disc">
                  <li>
                    <strong className="text-[var(--sumi)]">Thông tin đặt phòng:</strong> Phòng Standard cho 3 đêm, có ghi chú <em>ưu tiên phòng yên tĩnh</em> (bạn có thể tự do xưng tên thật hoặc bất kỳ tên nào).
                  </li>
                  <li>
                    <strong className="text-[var(--sumi)]">Tình huống phát sinh:</strong> Trong quá trình sắp xếp, lễ tân thông báo không còn trống phòng Standard yên tĩnh như yêu cầu ban đầu.
                  </li>
                  <li>
                    <strong className="text-[var(--sumi)]">Nhiệm vụ của bạn:</strong> Trao đổi với lễ tân để giải quyết việc nhận phòng, sau đó hỏi thêm thông tin về việc đăng ký bữa sáng tại khách sạn.
                  </li>
                </ul>
              </div>

              {/* Loading State Skeleton */}
              {isLoading && (
                <div className="p-8 text-center text-xs text-[var(--sumi-muted)] space-y-2">
                  <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-[var(--ai)] border-t-transparent" />
                  <p>Đang chuẩn bị phòng kiểm tra xếp lớp (0 Credit)...</p>
                </div>
              )}

              {/* Load Error */}
              {loadError && (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-center text-xs text-red-700 space-y-3">
                  <p className="font-bold">Không thể mở phiên kiểm tra:</p>
                  <p>{loadError}</p>
                  <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                    {allowRetakeForTesting && (
                      <button
                        type="button"
                        onClick={() => void loadPlacementSession(true)}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-red-700 cursor-pointer"
                      >
                        <span>🔄 Bắt đầu bài kiểm tra mới</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => navigate('/placement-test/history')}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-red-300 bg-white px-3 py-1.5 text-xs font-bold text-red-800 hover:bg-red-100 cursor-pointer"
                    >
                      <span>📜 Xem lịch sử xếp lớp</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate('/')}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--line)] bg-white px-3 py-1.5 text-xs font-bold text-[var(--sumi)] hover:bg-[var(--paper-100)] cursor-pointer"
                    >
                      <span>← Về trang chủ</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Danh sách tin nhắn đối thoại */}
              {messages.map((msg) => {
                const isAi = msg.sender === 'Ai';

                return (
                  <div
                    key={msg.id}
                    className={`flex items-start gap-3 transition-all duration-300 animate-slide-up ${
                      isAi ? '' : 'justify-end'
                    }`}
                  >
                    {/* Living Avatar AI bên trái bubble */}
                    {isAi && (
                      <div className="shrink-0 pt-0.5">
                        <LivingAvatar
                          size="sm"
                          avatarState={playingMessageId === msg.id ? 'speaking' : 'idle'}
                          personaName="フロント 山田"
                          personaRole="Lễ tân"
                          scenarioTitle="Khách sạn Sakura"
                          archetype="hospitality"
                          hideLabel
                        />
                      </div>
                    )}

                    {/* Chat Bubble */}
                    <div
                      className={`group relative max-w-[80%] rounded-2xl p-4 transition shadow-xs ${
                        isAi
                          ? 'rounded-tl-sm border border-[var(--line)] bg-white text-[var(--sumi)] shadow-xs'
                          : 'rounded-tr-sm bg-[var(--ai)] text-white shadow-sm'
                      }`}
                    >
                      {/* Bubble Header */}
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span
                          className={`text-[10px] font-bold ${
                            isAi ? 'text-[var(--sumi-faint)]' : 'text-blue-100'
                          }`}
                        >
                          {isAi ? 'フロント 山田' : 'Bạn'}
                        </span>

                        {isAi && (
                          <div className="flex items-center gap-1.5">
                            {playingMessageId === msg.id ? (
                              <span className="rounded bg-emerald-100 px-1.5 py-0.2 text-[9px] font-bold text-emerald-800">
                                ĐANG NÓI
                              </span>
                            ) : synthesizingMessageId === msg.id ? (
                              <span className="inline-flex items-center gap-1 rounded bg-[var(--ai-soft)] px-1.5 py-0.2 text-[9px] font-semibold text-[var(--ai)]">
                                <span className="inline-block h-2.5 w-2.5 animate-spin rounded-full border border-[var(--ai)] border-t-transparent" />
                                <span>Đang chuẩn bị giọng...</span>
                              </span>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => void handlePlayAiSpeech(msg.id, msg.japaneseText)}
                              className="rounded-full bg-[var(--paper-100)] px-2 py-0.5 text-[10px] font-semibold text-[var(--sumi-muted)] hover:bg-[var(--line)] hover:text-[var(--sumi)] transition active:scale-95 cursor-pointer flex items-center gap-1"
                              title={playingMessageId === msg.id ? 'Dừng phát âm thanh' : 'Nghe lại câu nói này'}
                            >
                              <VolumeIcon className="w-3 h-3 text-[var(--ai)]" />
                              <span>{playingMessageId === msg.id ? 'Dừng' : 'Nghe lại'}</span>
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Japanese Utterance */}
                      <div className="text-base font-medium leading-relaxed tracking-wide min-h-[1.75rem]">
                        {isAi && streamingAiMessageId === msg.id ? (
                          <p>
                            <TypewriterText
                              text={msg.japaneseText}
                              baseSpeedMs={20}
                              onComplete={() =>
                                setStreamingAiMessageId((prev) => (prev === msg.id ? null : prev))
                              }
                            />
                          </p>
                        ) : (
                          <p>{msg.japaneseText}</p>
                        )}
                      </div>

                      {/* Vietnamese Meaning */}
                      {showTranslation && msg.vietnameseMeaning && (
                        <div
                          className={`mt-2 border-t pt-2 text-xs leading-relaxed transition-all duration-500 ease-out ${
                            isAi
                              ? 'border-[var(--line)] text-[var(--sumi-muted)]'
                              : 'border-white/20 text-white/90'
                          } ${
                            isAi && streamingAiMessageId === msg.id
                              ? 'opacity-0 translate-y-1 pointer-events-none'
                              : 'opacity-100 translate-y-0'
                          }`}
                        >
                          {msg.vietnameseMeaning}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Sending Indicator */}
              {isSending && (
                <div className="flex items-start gap-3 animate-slide-up">
                  <div className="shrink-0 pt-0.5">
                    <LivingAvatar
                      size="sm"
                      avatarState="thinking"
                      personaName="フロント 山田"
                      personaRole="Lễ tân"
                      scenarioTitle="Khách sạn Sakura"
                      archetype="hospitality"
                      hideLabel
                    />
                  </div>
                  <div className="rounded-2xl rounded-tl-sm border border-[var(--line)] bg-white px-4 py-3 shadow-xs text-xs text-[var(--sumi-muted)] flex items-center gap-2">
                    <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-[var(--ai)] border-t-transparent" />
                    <span>Lễ tân Yamada đang lắng nghe và suy nghĩ câu phản hồi...</span>
                  </div>
                </div>
              )}

              {/* Phiên đã kết thúc Banner */}
              {isConcluded && (
                <div className="rounded-2xl border border-emerald-300 bg-emerald-50/90 p-4 text-center text-xs text-emerald-950 space-y-2 animate-fade-in">
                  <CheckCircleIcon className="w-6 h-6 text-emerald-600 mx-auto" />
                  <p className="font-bold text-sm">Bài kiểm tra xếp lớp đã kết thúc!</p>
                  <p className="text-emerald-800">
                    Toàn bộ các sự kiện đối thoại cần thiết đã được ghi nhận. Bấm nút dưới đây để xem phân tích năng lực.
                  </p>
                  <button
                    type="button"
                    onClick={() => void handleConcludeAndFetchResult()}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 cursor-pointer active:scale-95"
                  >
                    <span>📊 Xem kết quả xếp lớp chi tiết</span>
                  </button>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* ============================================================ */}
          {/* 2.C. BOTTOM STICKY INPUT BAR                                 */}
          {/* ============================================================ */}
          <div className="border-t border-[var(--line)] bg-[var(--paper-50)]/95 backdrop-blur-sm p-3 sm:p-4 shadow-lg">
            <div className="mx-auto w-full max-w-[800px] space-y-2">
              <form onSubmit={handleSendMessage} className="flex items-center gap-2 sm:gap-3">
                {/* Button Micro thu âm (ở bên trái, chuẩn RoleplayPracticeView) */}
                <div className="relative inline-flex shrink-0">
                  <button
                    type="button"
                    onClick={handleToggleMic}
                    disabled={isSending || isConcluded}
                    className={`relative z-10 inline-flex items-center justify-center gap-1.5 rounded-2xl px-3.5 py-2.5 text-xs font-bold transition-all shadow-xs cursor-pointer select-none overflow-hidden ${
                      isRecordingMic
                        ? 'border border-rose-500 bg-rose-600 text-white ring-4 ring-rose-400/25 shadow-md min-w-[96px] animate-pulse'
                        : 'border border-[var(--line)] bg-white text-[var(--sumi)] hover:border-[var(--ai)] hover:text-[var(--ai)] hover:bg-[var(--ai-soft)] hover:shadow-sm active:scale-95 min-w-[80px]'
                    }`}
                    title="Bấm để nói tiếng Nhật bằng micro (tự động tắt sau 5s im lặng kể từ âm thanh cuối)"
                  >
                    <span className="flex items-center gap-1.5">
                      <MicIcon
                        className={`w-3.5 h-3.5 shrink-0 ${
                          isRecordingMic ? 'text-white' : 'text-[var(--ai)]'
                        }`}
                      />
                      <span className="whitespace-nowrap flex items-center gap-1.5">
                        <span>{isRecordingMic ? 'Đang nghe...' : 'Nói'}</span>
                        {isRecordingMic && micSilenceProgress > 0 && (
                          <span
                            className="absolute bottom-0 left-0 h-1 bg-white/80 transition-all duration-75 ease-linear rounded-full pointer-events-none"
                            style={{ width: `${Math.max(0, Math.min(100, (1 - micSilenceProgress) * 100))}%` }}
                          />
                        )}
                        {isRecordingMic && micSilenceProgress > 0 && (
                          <span
                            className="absolute bottom-0 left-0 h-1 bg-white/80 transition-all duration-75 ease-linear rounded-full pointer-events-none"
                            style={{ width: `${Math.max(0, Math.min(100, (1 - micSilenceProgress) * 100))}%` }}
                          />
                        )}
                        {!isRecordingMic && (
                          <span
                            className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-xs"
                            title="STT Sẵn sàng"
                          />
                        )}
                      </span>
                    </span>
                  </button>
                </div>

                {/* Text input */}
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => {
                    const nextVal = e.target.value;
                    setInputText(nextVal);
                    if (!isMicActiveRef.current) {
                      committedTranscriptRef.current = nextVal;
                      if (!nextVal.trim()) {
                        usedVoiceInputRef.current = false;
                      }
                    }
                  }}
                  placeholder={
                    isRecordingMic
                      ? 'Đang lắng nghe giọng nói tiếng Nhật của bạn...'
                      : 'Nhập câu trả lời bằng tiếng Nhật... (Enter để gửi)'
                  }
                  disabled={isSending || isConcluded}
                  className={`flex-1 min-w-0 rounded-xl border px-3 sm:px-4 py-2.5 text-sm text-[var(--sumi)] outline-none transition ${
                    isRecordingMic
                      ? 'border-red-300 bg-red-50/40 ring-2 ring-red-200'
                      : 'border-[var(--line)] bg-[var(--paper-50)] focus:border-[var(--ai)] focus:bg-white focus:ring-2 focus:ring-[var(--ai)]/20'
                  }`}
                />

                {/* Send Button */}
                <button
                  type="submit"
                  disabled={!inputText.trim() || isSending || isConcluded}
                  className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-[var(--ai)] px-4 sm:px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-[var(--ai-hover)] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer active:scale-95"
                >
                  {isSending ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  ) : (
                    <>
                      <span>Gửi</span>
                      <span>➔</span>
                    </>
                  )}
                </button>
              </form>

              {/* Sub-bar helper text */}
              <div className="flex items-center justify-between text-[11px] text-[var(--sumi-faint)]">
                <span>Mẹo: Bạn có thể tự do gõ phím hoặc bấm Mic để nói. Hệ thống hỗ trợ cả hai phương thức.</span>
              </div>
            </div>
          </div>
        </main>

      </div>

      {/* ========================================================================= */}
      {/* 3. MODAL KẾT QUẢ ĐÁNH GIÁ (PLACEMENT TEST RESULT MODAL)                    */}
      {/* ========================================================================= */}
      {showResultModal && finalResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-fade-in">
          <div className="w-full max-w-lg rounded-3xl border border-[var(--line)] bg-white p-6 shadow-2xl space-y-5 animate-scale-up">
            <div className="text-center space-y-1">
              <span className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-100 text-2xl text-emerald-600 mb-1">
                🎯
              </span>
              <h2 className="text-lg font-bold text-[var(--sumi)]">Kết quả đánh giá xếp lớp sơ bộ</h2>
              <p className="text-xs text-[var(--sumi-muted)]">
                Dựa trên kịch bản đối thoại tại Khách sạn Sakura (0 Credit)
              </p>
            </div>

            {/* Estimated Level Highlight */}
            <div className="rounded-2xl border border-[var(--ai)]/30 bg-[var(--ai-soft)]/60 p-4 text-center space-y-1">
              <span className="text-[11px] font-bold text-[var(--ai)] uppercase tracking-wider">
                Trình độ ước tính ban đầu
              </span>
              <div className="text-3xl font-black text-[var(--ai)] font-mono">
                {finalResult.initialEstimatedLevel}
              </div>
              <div className="text-xs text-[var(--sumi-muted)]">
                Độ tin cậy: <span className="font-bold text-[var(--sumi)]">{finalResult.initialConfidenceTier}</span> • Điểm tổng thể: <span className="font-bold text-[var(--ai)]">{finalResult.overallScore}/100</span>
              </div>
            </div>

            {/* 4 Rubric Criteria Grid */}
            <div className="grid grid-cols-2 gap-2.5 text-xs">
              <div className="rounded-xl border border-[var(--line)] bg-[var(--paper-50)] p-2.5">
                <p className="text-[10px] text-[var(--sumi-faint)]">Nhiệm vụ giao tiếp</p>
                <p className="font-bold text-sm text-[var(--sumi)] font-mono mt-0.5">
                  {finalResult.taskFulfillmentScore}/100
                </p>
              </div>
              <div className="rounded-xl border border-[var(--line)] bg-[var(--paper-50)] p-2.5">
                <p className="text-[10px] text-[var(--sumi-faint)]">Độ chuẩn ngữ pháp</p>
                <p className="font-bold text-sm text-emerald-700 font-mono mt-0.5">
                  {finalResult.grammarAccuracyScore}/100
                </p>
              </div>
              <div className="rounded-xl border border-[var(--line)] bg-[var(--paper-50)] p-2.5">
                <p className="text-[10px] text-[var(--sumi-faint)]">Vốn từ vựng</p>
                <p className="font-bold text-sm text-purple-700 font-mono mt-0.5">
                  {finalResult.vocabularyRangeScore}/100
                </p>
              </div>
              <div className="rounded-xl border border-[var(--line)] bg-[var(--paper-50)] p-2.5">
                <p className="text-[10px] text-[var(--sumi-faint)]">Văn phong xã hội</p>
                <p className="font-bold text-sm text-amber-700 font-mono mt-0.5">
                  {finalResult.pragmaticsScore}/100
                </p>
              </div>
            </div>

            {/* Summary Feedback */}
            {finalResult.summaryFeedback && (
              <div className="rounded-xl border border-[var(--line)] bg-[var(--paper-50)] p-3 text-xs text-[var(--sumi-muted)] leading-relaxed">
                <p className="font-bold text-[var(--sumi)] mb-1">Nhận xét tổng hợp:</p>
                <p>{finalResult.summaryFeedback}</p>
              </div>
            )}

            {/* Disclaimer */}
            <p className="text-[10.5px] text-[var(--sumi-faint)] italic leading-tight text-center">
              {finalResult.disclaimer}
            </p>

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-2.5 pt-1">
              {allowRetakeForTesting && (
                <button
                  type="button"
                  onClick={() => void loadPlacementSession(true)}
                  className="flex-1 rounded-xl border border-[var(--line)] py-2.5 px-3 text-xs font-bold text-[var(--sumi)] hover:border-[var(--ai)] hover:text-[var(--ai)] transition active:scale-95 cursor-pointer"
                >
                  🔄 Thử lại bài mới
                </button>
              )}
              <button
                type="button"
                onClick={() => navigate('/placement-test/history')}
                className="flex-1 rounded-xl border border-[var(--line)] py-2.5 px-3 text-xs font-bold text-[var(--sumi)] hover:border-[var(--ai)] hover:text-[var(--ai)] transition active:scale-95 cursor-pointer"
              >
                📜 Xem lịch sử
              </button>
              <button
                type="button"
                onClick={() => navigate('/')}
                className="flex-1 rounded-xl bg-[var(--ai)] py-2.5 px-3 text-xs font-bold text-white shadow-sm hover:bg-[var(--ai-hover)] transition active:scale-95 cursor-pointer"
              >
                Về trang chủ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. MODAL XÁC NHẬN RỜI PHÒNG                                               */}
      {/* ========================================================================= */}
      {showLeaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-fade-in">
          <div className="w-full max-w-sm rounded-3xl border border-[var(--line)] bg-white p-5 shadow-2xl space-y-4 animate-scale-up">
            <h3 className="font-bold text-base text-[var(--sumi)]">Tạm dừng bài kiểm tra?</h3>
            <p className="text-xs text-[var(--sumi-muted)] leading-relaxed">
              Tiến trình làm bài hiện tại đã được lưu lại trên hệ thống. Bạn có thể quay lại tiếp tục bất cứ lúc nào mà không bị mất dữ liệu.
            </p>
            <div className="flex gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setShowLeaveModal(false)}
                className="flex-1 rounded-xl border border-[var(--line)] py-2 text-xs font-semibold text-[var(--sumi)] hover:bg-[var(--paper-100)] transition cursor-pointer"
              >
                Ở lại làm tiếp
              </button>
              <button
                type="button"
                onClick={() => navigate('/')}
                className="flex-1 rounded-xl bg-red-600 py-2 text-xs font-semibold text-white hover:bg-red-700 transition cursor-pointer"
              >
                Tạm dừng &amp; Về trang chủ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
