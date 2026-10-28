import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, Link, useSearchParams } from 'react-router-dom';
import { roleplayService } from '../services/roleplayService';
import { roleplayResultService } from '../services/roleplayResultService';
import { scenarioVoiceService } from '../services/scenarioVoiceService';
import { voicevoxService, type VoiceOption } from '../services/voicevoxService';
import { AiVoiceSettingsModal } from '../components/shadowing/AiVoiceSettingsModal';
import { AudioWaveformPlayer } from '../components/common/AudioWaveformPlayer';
import { LivingAvatar, type AvatarState, type MouthViseme } from '../components/roleplay/LivingAvatar';
import { EkiStampOverlay } from '../components/roleplay/EkiStampOverlay';
import { ukiyoSound } from '../utils/ukiyoSoundEngine';
import { useAuth } from '../contexts/AuthContext';
import type {
  RoleplaySessionDetailsDto,
  RoleplayMessageDto,
  RoleplayMissionDto,
  RoleplayHintDto,
  LinguisticFeedbackDto,
} from '../types/roleplay';

export const RoleplayPracticeView: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role?.toLowerCase() === 'admin';
  const { sessionId: rawSessionId } = useParams<{ sessionId: string }>();
  const sessionId = Number(rawSessionId);

  // Dữ liệu chính của session
  const [session, setSession] = useState<RoleplaySessionDetailsDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Toggles hiển thị
  const [showTranslation, setShowTranslation] = useState(true);
  const [showFurigana, setShowFurigana] = useState(false); // Mặc định TẮT theo yêu cầu
  const [autoPlayAudio, setAutoPlayAudio] = useState(true); // Toggle tự động phát âm thanh AI
  const autoPlayAudioRef = useRef(true);
  useEffect(() => {
    autoPlayAudioRef.current = autoPlayAudio;
  }, [autoPlayAudio]);
  const [isPlayingAiSpeech, setIsPlayingAiSpeech] = useState(false);
  const [playingMessageId, setPlayingMessageId] = useState<number | null>(null);
  const [isAmbientOn, setIsAmbientOn] = useState(false);
  const [isRecordingMic, setIsRecordingMic] = useState(false); // Trạng thái thu âm UI
  const isRecordingMicRef = useRef(false);
  const [isProcessingStt, setIsProcessingStt] = useState(false); // Trạng thái xử lý Whisper STT
  const [isWhisperEngineOnline, setIsWhisperEngineOnline] = useState(false);
  const aiFinishedSpeakingAtRef = useRef<number | null>(null);
  const micStartedAtRef = useRef<number | null>(null);
  const lastSpeechConfidenceRef = useRef<number | null>(null);
  const recognitionRef = useRef<any>(null);
  const [micError, setMicError] = useState<string | null>(null);
  const [isLeftOpen, setIsLeftOpen] = useState(true); // Cột Trái (Nhiệm vụ & Cheat Sheet)
  const [isRightOpen, setIsRightOpen] = useState(true); // Cột Phải (Chi tiết Đánh giá - mở mặc định trên desktop)

  // Cấu hình giọng đọc AI & Giọng đọc mẫu của người học (VOICEVOX)
  const [selectedVoiceId, setSelectedVoiceId] = useState<number>(() => scenarioVoiceService.getSelectedVoiceId());
  const [learnerVoiceId, setLearnerVoiceId] = useState<number>(2); // Giọng phát âm mẫu chuẩn (Mặc định: Shikoku Metan - ID 2)

  // Kiểm tra trạng thái Whisper STT Engine & Lazy prefetch âm thanh mẫu vào IndexedDB/RAM
  useEffect(() => {
    void scenarioVoiceService.isWhisperAvailable().then((avail) => {
      setIsWhisperEngineOnline(avail);
    });

    const timer = setTimeout(() => {
      void scenarioVoiceService.prefetchCommonPhrases(learnerVoiceId);
    }, 1200);

    return () => clearTimeout(timer);
  }, [learnerVoiceId]);
  const [isPlayingLearnerSample, setIsPlayingLearnerSample] = useState(false);
  const [playingLearnerText, setPlayingLearnerText] = useState<string | null>(null);
  // Quản lý audio thu âm thực tế của học viên để nghe lại (Voice Playback & A/B Comparison)
  const [playingUserAudioId, setPlayingUserAudioId] = useState<number | null>(null);
  const userAudioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const lastRecordedAudioUrlRef = useRef<string | null>(null);
  const userAudioMapRef = useRef<Map<number, string>>(new Map());

  // Phát lại âm thanh giọng nói của chính học viên
  const handlePlayUserAudio = (messageId: number, audioUrl: string) => {
    scenarioVoiceService.stopAllAudio();
    setIsPlayingAiSpeech(false);
    setPlayingMessageId(null);
    setIsPlayingLearnerSample(false);
    setPlayingLearnerText(null);

    if (playingUserAudioId === messageId) {
      if (userAudioPlayerRef.current) {
        userAudioPlayerRef.current.pause();
        userAudioPlayerRef.current = null;
      }
      setPlayingUserAudioId(null);
      return;
    }

    if (userAudioPlayerRef.current) {
      userAudioPlayerRef.current.pause();
      userAudioPlayerRef.current = null;
    }

    const audio = new Audio(audioUrl);
    userAudioPlayerRef.current = audio;
    setPlayingUserAudioId(messageId);

    audio.onended = () => {
      setPlayingUserAudioId(null);
      userAudioPlayerRef.current = null;
    };
    audio.onerror = () => {
      setPlayingUserAudioId(null);
      userAudioPlayerRef.current = null;
    };

    void audio.play().catch(() => {
      setPlayingUserAudioId(null);
      userAudioPlayerRef.current = null;
    });
  };

  const [availableVoices, setAvailableVoices] = useState<VoiceOption[]>([]);
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);

  // AI Proactive Engagement (Chủ động gợi ý đồng hành khi người học im lặng > 14s)
  const [showProactiveHint, setShowProactiveHint] = useState(false);
  const idleTimerRef = useRef<any>(null);

  // Trạng thái sao chép và phát âm câu gợi ý bản xứ
  const [copiedFeedbackText, setCopiedFeedbackText] = useState(false);
  const [isPlayingAlternativeAudio, setIsPlayingAlternativeAudio] = useState(false);

  // Phím tắt bàn phím (Escape đóng menu/modal)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsSettingsOpen(false);
        setShowEndModal(false);
        setShowLeaveModal(false);
        setIsVoiceModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Trạng thái gõ bàn phím tiếng Nhật (IME composition: ngăn chặn Enter submit nhầm)
  const [isComposing, setIsComposing] = useState(false);

  // Dropdown Cài đặt hỗ trợ (Dịch, Furigana, Giọng AI, Tốc độ)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setIsSettingsOpen(false);
      }
    };
    if (isSettingsOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isSettingsOpen]);

  useEffect(() => {
    let isCurrent = true;
    void scenarioVoiceService.getVoices().then((voices) => {
      if (isCurrent && voices && voices.length > 0) {
        setAvailableVoices(voices);
      }
    });
    return () => {
      isCurrent = false;
    };
  }, []);

  // Tin nhắn & Chat
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [selectedMessageId, setSelectedMessageId] = useState<number | null>(null);

  // Gợi ý Hint
  const [hint, setHint] = useState<RoleplayHintDto | null>(null);
  const [isLoadingHint, setIsLoadingHint] = useState(false);

  // Modal kết thúc & Modal rời phòng
  const [showEndModal, setShowEndModal] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [isEnding, setIsEnding] = useState(false);

  // Toast mock Flashcard
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Gamification & Micro-Celebration: Danh sách ID nhiệm vụ vừa hoàn thành (trong 4.5s)
  const [recentlyCompletedMissionIds, setRecentlyCompletedMissionIds] = useState<number[]>([]);

  // Tốc độ đọc AI (0.85x / 1.0x / 1.15x)
  const [speechRate, setSpeechRate] = useState<number>(() => scenarioVoiceService.getSpeechRate());

  // Tab Cheat Sheet (Từ vựng vs Ngữ pháp)
  const [cheatSheetTab, setCheatSheetTab] = useState<'vocab' | 'grammar'>('vocab');

  // Direction A & B augmentations: Return URL, LivingAvatar visemes, Eki-Stamp overlay, Telemetry counters
  const [searchParams] = useSearchParams();
  const rawReturnUrl = searchParams.get('return');
  const returnUrl = rawReturnUrl && rawReturnUrl.startsWith('/') && !rawReturnUrl.startsWith('//') ? rawReturnUrl : null;
  const [isEkiStampOpen, setIsEkiStampOpen] = useState(false);

  // Adaptive Silence Ring state & timer
  const [silenceCountdownProgress, setSilenceCountdownProgress] = useState<number>(0);
  const silenceIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Taiko sound on room entry
  useEffect(() => {
    ukiyoSound.playTaikoThud();
  }, []);

  // Viseme mouth sync for LivingAvatar during AI speech
  const [currentViseme, setCurrentViseme] = useState<MouthViseme>('closed');
  useEffect(() => {
    if (!isPlayingAiSpeech) {
      setCurrentViseme('closed');
      return;
    }
    const visemes: MouthViseme[] = ['A', 'I', 'U', 'E', 'O'];
    let idx = 0;
    const interval = setInterval(() => {
      idx = (idx + 1) % visemes.length;
      setCurrentViseme(visemes[idx]);
    }, 140);
    return () => clearInterval(interval);
  }, [isPlayingAiSpeech]);

  // Telemetry metric counters for current turn (TikTok-style S1..S12)
  const hintLevelUsedRef = useRef<number>(0);
  const translationPeekCountRef = useRef<number>(0);
  const retryCountRef = useRef<number>(0);

  // Average score summary for Eki-Stamp celebration
  const averageScore = useMemo(() => {
    if (!session || session.messages.length === 0) return 85;
    const scores: number[] = [];
    for (const msg of session.messages) {
      if (msg.sender === 'User' && msg.linguisticFeedback?.speechDelivery?.turnFluencyScore) {
        scores.push(msg.linguisticFeedback.speechDelivery.turnFluencyScore);
      }
    }
    if (scores.length === 0) return 85;
    return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  }, [session]);

  // Âm thanh chúc mừng Web Audio API (Chime E5 -> B5, nhẹ nhàng, không cần asset ngoài)
  const playMissionCompleteSound = () => {
    try {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      const now = ctx.currentTime;

      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(659.25, now);
      gain1.gain.setValueAtTime(0.12, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.3);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(987.77, now + 0.12);
      gain2.gain.setValueAtTime(0.18, now + 0.12);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.12);
      osc2.stop(now + 0.55);
    } catch {
      // Non-blocking fallback
    }
  };

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const hasPlayedOpeningRef = useRef(false);

  // Helper an toàn lấy trạng thái đánh giá (tránh crash khi trường status/quickStatus null/undefined)
  const getFeedbackStatus = (feedback?: LinguisticFeedbackDto | null) => {
    if (!feedback) return 'good';
    const s = feedback.quickStatus || feedback.status || 'good';
    return s.toLowerCase();
  };

  // Dừng thu âm micro ngay lập tức và hủy mọi sự kiện STT nền
  const stopSpeechRecognition = async () => {
    isRecordingMicRef.current = false;
    setIsRecordingMic(false);
    if (silenceIntervalRef.current) {
      clearInterval(silenceIntervalRef.current);
      silenceIntervalRef.current = null;
    }
    setSilenceCountdownProgress(0);

    if (recognitionRef.current) {
      try {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.abort();
      } catch {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
      }
      recognitionRef.current = null;
    }

    // Dừng MediaRecorder và phân tích nhận diện bằng Whisper STT Engine
    try {
      const audioResult = await scenarioVoiceService.stopAudioRecording();
      if (audioResult && audioResult.blob && audioResult.durationSeconds >= 0.3) {
        // Lưu audio URL để học viên có thể nghe lại phát âm của chính mình
        const recordedUrl = URL.createObjectURL(audioResult.blob);
        lastRecordedAudioUrlRef.current = recordedUrl;

        setIsProcessingStt(true);
        const whisperRes = await scenarioVoiceService.transcribeWithWhisper(audioResult.blob);
        if (whisperRes && whisperRes.text && whisperRes.text.trim()) {
          setInputText(whisperRes.text.trim());
          if (typeof whisperRes.confidence === 'number' && whisperRes.confidence > 0) {
            lastSpeechConfidenceRef.current = whisperRes.confidence;
          }
          if (whisperRes.audioUrl) {
            lastRecordedAudioUrlRef.current = whisperRes.audioUrl;
          }
        } else {
          // Fallback: Lưu audio lên server để có link nghe lại vĩnh viễn
          void scenarioVoiceService.saveLearnerAudio(audioResult.blob).then((serverUrl) => {
            if (serverUrl) {
              lastRecordedAudioUrlRef.current = serverUrl;
            }
          });
        }
      }
    } catch (err) {
      console.warn('[Scenario STT] Lỗi xử lý Whisper:', err);
    } finally {
      setIsProcessingStt(false);
    }
  };

  // Nhận diện giọng đọc theo vai khi kịch bản có nhiều nhân vật (Multi-role Voice Mapping)
  const getSpeakerVoiceId = (messageText: string): number => {
    if (session?.roleVoiceMappings) {
      for (const [roleName, voiceId] of Object.entries(session.roleVoiceMappings)) {
        if (
          messageText.startsWith(`[${roleName}]`) ||
          messageText.startsWith(`${roleName}:`) ||
          messageText.startsWith(`【${roleName}】`)
        ) {
          return voiceId;
        }
      }
    }
    return selectedVoiceId;
  };

  // Phát âm thanh giọng nói AI (VOICEVOX / Web Speech fallback)
  const handlePlayMessageAudio = (messageId: number, text: string) => {
    // Luôn đảm bảo ngắt micro trước khi phát âm thanh để tránh dội âm thanh AI vào mic
    stopSpeechRecognition();

    if (playingMessageId === messageId && isPlayingAiSpeech) {
      scenarioVoiceService.stopAllAudio();
      setIsPlayingAiSpeech(false);
      setPlayingMessageId(null);
      return;
    }

    setIsPlayingAiSpeech(true);
    setPlayingMessageId(messageId);

    const voiceToUse = getSpeakerVoiceId(text);
    void scenarioVoiceService.playAiSpeech(text, voiceToUse, () => {
      setIsPlayingAiSpeech(false);
      setPlayingMessageId(null);
      aiFinishedSpeakingAtRef.current = Date.now();
    }, speechRate);
  };

  // Phát âm thanh mẫu câu chuẩn Tokyo cho người học (Learner Sample Voice)
  const handlePlayLearnerSample = (text: string) => {
    if (!text || !text.trim()) return;
    stopSpeechRecognition();

    if (isPlayingLearnerSample && playingLearnerText === text) {
      scenarioVoiceService.stopAllAudio();
      setIsPlayingLearnerSample(false);
      setPlayingLearnerText(null);
      return;
    }

    setPlayingLearnerText(text);
    setIsPlayingLearnerSample(true);

    void scenarioVoiceService.playAiSpeech(
      text,
      learnerVoiceId,
      () => {
        setIsPlayingLearnerSample(false);
        setPlayingLearnerText(null);
      },
      speechRate,
      () => {
        setIsPlayingLearnerSample(true);
      }
    );
  };

  // 1. Tải chi tiết phiên
  useEffect(() => {
    let isMounted = true;
    hasPlayedOpeningRef.current = false;

    const fetchSession = async () => {
      if (!sessionId || isNaN(sessionId)) {
        setLoadError('Mã phiên luyện tập không hợp lệ.');
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setLoadError(null);

      const res = await roleplayService.getSession(sessionId);

      if (!isMounted) return;

      if (res.success && res.data) {
        setSession(res.data);

        // Tự động gán giọng AI chuẩn tối ưu theo Persona của kịch bản
        if (res.data.recommendedAiVoiceId && res.data.recommendedAiVoiceId > 0) {
          setSelectedVoiceId(res.data.recommendedAiVoiceId);
        }
        if (res.data.recommendedLearnerVoiceId && res.data.recommendedLearnerVoiceId > 0) {
          setLearnerVoiceId(res.data.recommendedLearnerVoiceId);
        }

        // Tự động chọn tin nhắn học viên mới nhất có feedback (nếu có)
        const lastUserMsg = [...res.data.messages]
          .reverse()
          .find((m) => m.sender === 'User' && m.linguisticFeedback);
        if (lastUserMsg) {
          setSelectedMessageId(lastUserMsg.id);
        }

        // Tự động phát âm thanh câu mở đầu đầu tiên của AI nếu autoPlay bật và phiên chưa có lượt nói từ User
        const hasNoUserMessages = !res.data.messages.some((m) => m.sender === 'User');
        const openingAiMsg = res.data.messages.find((m) => m.sender === 'Ai');
        if (
          !hasPlayedOpeningRef.current &&
          autoPlayAudioRef.current &&
          hasNoUserMessages &&
          openingAiMsg?.japaneseText
        ) {
          hasPlayedOpeningRef.current = true;
          handlePlayMessageAudio(openingAiMsg.id, openingAiMsg.japaneseText);
        }
      } else {
        setLoadError(res.message || 'Không thể tải dữ liệu phiên luyện tập.');
      }

      setIsLoading(false);
    };

    void fetchSession();

    return () => {
      isMounted = false;
      ukiyoSound.stopAmbientSound();
    };
  }, [sessionId]);

  // Quản lý đồng hồ im lặng để AI chủ động gợi ý (Proactive Idle Assist)
  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
    setShowProactiveHint(false);

    // Chỉ đếm ngược khi AI không nói, người học không gõ/nói, và kịch bản chưa kết thúc
    if (!isSending && !isPlayingAiSpeech && !session?.isNaturallyConcluded) {
      idleTimerRef.current = setTimeout(() => {
        setShowProactiveHint(true);
      }, 14000); // Sau 14s không có hoạt động -> AI chủ động khích lệ
    }
  }, [isSending, isPlayingAiSpeech, session?.isNaturallyConcluded]);

  useEffect(() => {
    resetIdleTimer();
    return () => {
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
      }
    };
  }, [session?.messages.length, isSending, isPlayingAiSpeech, resetIdleTimer]);

  // Cuộn xuống tin nhắn mới nhất
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [session?.messages, isSending]);

  // Đếm nhiệm vụ hoàn thành
  const completedMissionsCount = useMemo(
    () => session?.missions.filter((m) => m.isCompleted).length ?? 0,
    [session?.missions]
  );
  const totalMissionsCount = session?.missions.length ?? 0;
  const progressPercent = totalMissionsCount > 0 ? Math.round((completedMissionsCount / totalMissionsCount) * 100) : 0;
  const isAllMissionsCompleted = totalMissionsCount > 0 && completedMissionsCount >= totalMissionsCount;

  // Derived Avatar State for LivingAvatar
  const avatarState: AvatarState = isSending
    ? 'thinking'
    : isPlayingAiSpeech
    ? 'speaking'
    : isRecordingMic
    ? 'listening'
    : isAllMissionsCompleted || session?.isNaturallyConcluded
    ? 'cheering'
    : 'idle';

  // Lấy tin nhắn người dùng được chọn để hiển thị ở Cột Phải
  const selectedMessage = useMemo(() => {
    if (!session || !selectedMessageId) return null;
    return session.messages.find((m) => m.id === selectedMessageId && m.sender === 'User') ?? null;
  }, [session, selectedMessageId]);


  // 2. Gửi tin nhắn học viên (Optimistic UI update)
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    // Ngăn chặn submit khi người dùng đang bấm Enter để chọn chữ Hán Kanji từ bộ gõ IME
    if (isComposing) {
      return;
    }

    // DỪNG THU ÂM NGAY LẬP TỨC khi người dùng bấm gửi (kể cả khi chưa tự bấm dừng mic)
    // Điều này ngăn chặn triệt để hiện tượng micro thu lại tiếng phát ra từ loa của AI (Audio Feedback Loop)
    stopSpeechRecognition();

    const trimmed = inputText.trim();
    if (!trimmed || isSending || !session) return;

    const currentSessionId = session.sessionId || session.id || sessionId;
    const tempId = Date.now();
    const userAudioToAttach = lastRecordedAudioUrlRef.current;
    lastRecordedAudioUrlRef.current = null;

    // 1. Tạo tin nhắn tạm thời của User để hiển thị ngay lập tức trên UI
    const optimisticUserMsg: RoleplayMessageDto = {
      id: tempId,
      sender: 'User',
      japaneseText: trimmed,
      userAudioUrl: userAudioToAttach ?? undefined,
      createdAt: new Date().toISOString(),
    };

    setSession((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        messages: [...prev.messages, optimisticUserMsg],
      };
    });

    setIsSending(true);
    setInputText('');
    setHint(null); // Đóng hint nếu đang mở

    const now = Date.now();
    let speakingDurationSeconds: number | undefined;
    let responseLatencySeconds: number | undefined;

    if (micStartedAtRef.current) {
      speakingDurationSeconds = Math.max(0.5, (now - micStartedAtRef.current) / 1000);
      if (aiFinishedSpeakingAtRef.current) {
        responseLatencySeconds = Math.max(0.2, (micStartedAtRef.current - aiFinishedSpeakingAtRef.current) / 1000);
      }
    } else if (aiFinishedSpeakingAtRef.current) {
      responseLatencySeconds = Math.max(0.5, (now - aiFinishedSpeakingAtRef.current) / 1000);
    }

    const deliveryPayload = {
      speakingDurationSeconds,
      responseLatencySeconds,
      speechConfidence: lastSpeechConfidenceRef.current ?? undefined,
      audioUrl: userAudioToAttach && !userAudioToAttach.startsWith('blob:') ? userAudioToAttach : undefined,
      hintLevelUsed: hintLevelUsedRef.current,
      translationPeekCount: translationPeekCountRef.current,
      retryCount: retryCountRef.current,
      fallbackToTextInput: !micStartedAtRef.current && !userAudioToAttach,
      bargeInInterrupted: false,
    };

    micStartedAtRef.current = null;
    lastSpeechConfidenceRef.current = null;
    hintLevelUsedRef.current = 0;
    retryCountRef.current = 0;

    const res = await roleplayService.sendMessage(currentSessionId, trimmed, deliveryPayload);

    if (res.success && res.data) {
      const turn = res.data;
      if (userAudioToAttach) {
        userAudioMapRef.current.set(turn.userMessage.id, userAudioToAttach);
      }
      const finalUserMsg: RoleplayMessageDto = {
        ...turn.userMessage,
        audioUrl: turn.userMessage.audioUrl || userAudioToAttach || undefined,
        userAudioUrl: userAudioToAttach ?? undefined,
      };

      setSession((prev) => {
        if (!prev) return null;
        // Thay thế tin nhắn tạm bằng tin nhắn User thật từ backend và kèm theo tin nhắn phản hồi của AI
        const filteredMessages = prev.messages.filter((m) => m.id !== tempId);
        return {
          ...prev,
          messages: [...filteredMessages, finalUserMsg, turn.aiMessage],
          missions: turn.updatedMissions,
          isNaturallyConcluded: turn.isNaturallyConcluded,
          creditBalance: turn.creditBalance ?? prev.creditBalance,
        };
      });

      // Ghi nhận ID tin nhắn mới (không tự động ép mở cột phải)
      if (turn.userMessage.linguisticFeedback) {
        setSelectedMessageId(turn.userMessage.id);
      }

      // Micro-Celebration: Bắn thông báo chúc mừng & âm thanh khi vừa hoàn thành nhiệm vụ mới
      if (turn.newlyCompletedMissionIds && turn.newlyCompletedMissionIds.length > 0) {
        playMissionCompleteSound();
        ukiyoSound.playMigotoChime();
        setRecentlyCompletedMissionIds(turn.newlyCompletedMissionIds);
        setTimeout(() => setRecentlyCompletedMissionIds([]), 4500);

        const completedNames = turn.updatedMissions
          .filter((m) => turn.newlyCompletedMissionIds.includes(m.missionId))
          .map((m) => m.content);
        const nameText = completedNames.length > 0 ? `: "${completedNames[0]}"` : '!';
        setToastMessage(`🎯 Xuất sắc! Bạn vừa hoàn thành nhiệm vụ${nameText}`);
        setTimeout(() => setToastMessage(null), 4000);
      }

      // Con dấu Eki-Stamp Hanko khi kết thúc tự nhiên hoặc hoàn thành mọi nhiệm vụ
      if (turn.isNaturallyConcluded || turn.allMissionsCompleted) {
        setIsEkiStampOpen(true);
      }

      // Tự động phát âm thanh của AI nếu toggle autoPlayAudio đang BẬT
      if (autoPlayAudioRef.current && turn.aiMessage?.japaneseText) {
        handlePlayMessageAudio(turn.aiMessage.id, turn.aiMessage.japaneseText);
      }
    } else {
      // Khi gửi thất bại: xóa tin nhắn tạm và khôi phục nội dung vào ô nhập liệu
      setSession((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          messages: prev.messages.filter((m) => m.id !== tempId),
        };
      });
      setInputText(trimmed);
      alert(res.message || 'Gửi tin nhắn thất bại. Vui lòng thử lại.');
    }

    setIsSending(false);
    inputRef.current?.focus();
  };

  // 3. Xin gợi ý (Hint)
  const handleGetHint = async () => {
    if (!session || isLoadingHint) return;
    setIsLoadingHint(true);
    hintLevelUsedRef.current += 1;
    const currentSessionId = session.sessionId || session.id || sessionId;
    const res = await roleplayService.getHint(currentSessionId);
    if (res.success && res.data) {
      setHint(res.data);
    } else {
      alert(res.message || 'Không thể lấy gợi ý lúc này.');
    }
    setIsLoadingHint(false);
  };

  // 4. Áp dụng gợi ý (Chỉ lấy câu tiếng Nhật, KHÔNG lấy tiếng Việt theo yêu cầu)
  const handleApplyHint = () => {
    if (!hint) return;
    setInputText(hint.suggestedJapaneseText || hint.japaneseSuggestion || '');
    setHint(null);
    inputRef.current?.focus();
  };

  // 5. Kết thúc phiên
  const handleConfirmEnd = async () => {
    if (!session || isEnding) return;
    setIsEnding(true);
    ukiyoSound.playTaikoThud();

    const currentSessionId = session.sessionId || session.id || sessionId;
    const res = await roleplayResultService.completeSession(currentSessionId);
    if (res.success && res.data) {
      setShowEndModal(false);
      const targetUrl = returnUrl
        ? `/roleplay/results/${res.data.resultId}?return=${encodeURIComponent(returnUrl)}`
        : `/roleplay/results/${res.data.resultId}`;
      navigate(targetUrl);
    } else {
      alert(res.message || 'Không thể hoàn tất và lưu kết quả phiên luyện tập.');
      setIsEnding(false);
    }
  };

  // 6. Tạm dừng và rời phòng (giữ nguyên trạng thái Active, không hoàn tất phiên)
  const handleConfirmLeave = () => {
    ukiyoSound.playTaikoThud();
    setShowLeaveModal(false);
    if (returnUrl) {
      navigate(returnUrl);
    } else if (session) {
      navigate(`/scenarios/${session.scenarioId}`);
    } else {
      navigate('/scenarios');
    }
  };

  // 6b. Luyện lại từ đầu (Khởi tạo phiên mới)
  const handleRestartSession = async () => {
    if (!session) return;
    ukiyoSound.playTaikoThud();
    setIsLoading(true);
    const res = await roleplayService.startSession(
      session.scenarioId,
      session.level || session.jlptLevel || 'N5',
      true
    );
    if (res.success && res.data) {
      const newId = res.data.sessionId || res.data.id;
      const target = returnUrl ? `/roleplay/${newId}?return=${encodeURIComponent(returnUrl)}` : `/roleplay/${newId}`;
      navigate(target);
      window.location.reload();
    } else {
      alert(res.message || 'Không thể bắt đầu lại phiên luyện tập.');
      setIsLoading(false);
    }
  };

  // 7. Voice Handlers (Scenario Voice Integration)

  const startSpeechRecognition = () => {
    setMicError(null);
    try {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // ignore
        }
      }

      // Khởi động đồng thời MediaRecorder để thu audio chất lượng cao cho Whisper
      void scenarioVoiceService.startAudioRecording();

      const recognition = scenarioVoiceService.createSpeechRecognition({
        onStart: () => {
          setIsRecordingMic(true);
          isRecordingMicRef.current = true;
          if (!micStartedAtRef.current) {
            micStartedAtRef.current = Date.now();
          }
        },
        onBargeIn: () => {
          // Barge-In: Học viên cất tiếng nói khi AI đang nói -> ngắt lời AI tức thì
          setIsPlayingAiSpeech(false);
          setPlayingMessageId(null);
          ukiyoSound.playSubtleTap();
        },
        onResult: (transcript: string, _isFinal: boolean, confidence?: number) => {
          if (transcript.trim()) {
            setInputText(transcript.trim());
            if (typeof confidence === 'number') {
              lastSpeechConfidenceRef.current = confidence;
            }

            // Adaptive Silence Ring: Khi phát hiện tiếng nói, kích hoạt đếm ngược im lặng (0.75s-1.2s theo level)
            if (silenceIntervalRef.current) {
              clearInterval(silenceIntervalRef.current);
              silenceIntervalRef.current = null;
            }
            const currentLvl = (session?.level || session?.jlptLevel || 'N5').trim().toUpperCase();
            const silenceTimeoutMs = currentLvl === 'N5' ? 1200 : currentLvl === 'N4' ? 1000 : 800;
            const intervalStep = 50;
            let elapsed = 0;
            silenceIntervalRef.current = setInterval(() => {
              elapsed += intervalStep;
              const progress = Math.min(1, elapsed / silenceTimeoutMs);
              setSilenceCountdownProgress(progress);
              if (progress >= 1) {
                if (silenceIntervalRef.current) {
                  clearInterval(silenceIntervalRef.current);
                  silenceIntervalRef.current = null;
                }
                setSilenceCountdownProgress(0);
                // Tự động dừng thu âm và gửi câu khi kết thúc khoảng lặng
                if (isRecordingMicRef.current) {
                  void stopSpeechRecognition();
                }
              }
            }, intervalStep);
          }
        },
        onError: (err: any) => {
          console.warn('[Scenario STT] Error:', err);
          if (err.error === 'not-allowed') {
            setMicError('Quyền truy cập micro đã bị từ chối.');
          }
        },
        onEnd: () => {
          if (silenceIntervalRef.current) {
            clearInterval(silenceIntervalRef.current);
            silenceIntervalRef.current = null;
          }
          setSilenceCountdownProgress(0);

          // Nếu người dùng vẫn đang ở trạng thái thu âm, tự động tái kích hoạt để không bị ngắt quãng
          if (isRecordingMicRef.current && recognitionRef.current) {
            try {
              recognitionRef.current.start();
            } catch {
              setIsRecordingMic(false);
              isRecordingMicRef.current = false;
            }
          } else {
            setIsRecordingMic(false);
            isRecordingMicRef.current = false;
          }
        },
      });

      if (!recognition) {
        alert('Trình duyệt hiện tại không hỗ trợ nhận diện giọng nói (Web Speech API). Vui lòng sử dụng Google Chrome hoặc Edge.');
        setIsRecordingMic(false);
        isRecordingMicRef.current = false;
        return;
      }

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.warn('[Scenario STT] Start error:', err);
      setIsRecordingMic(false);
      isRecordingMicRef.current = false;
    }
  };

  const handleToggleMic = () => {
    // Ngắt toàn bộ âm thanh AI đang phát để tránh tiếng vọng vào micro
    scenarioVoiceService.stopAllAudio();
    setIsPlayingAiSpeech(false);
    setPlayingMessageId(null);

    if (!isRecordingMic) {
      // Telemetry: Ghi nhận retry nếu học viên thu âm lại khi ô nhập đã có nội dung hoặc đã thu âm trước đó
      if (inputText.trim() || lastRecordedAudioUrlRef.current) {
        retryCountRef.current += 1;
      }
      startSpeechRecognition();
    } else {
      void stopSpeechRecognition();
    }
  };

  // Dọn dẹp âm thanh và micro khi rời phòng luyện tập
  useEffect(() => {
    return () => {
      if (silenceIntervalRef.current) {
        clearInterval(silenceIntervalRef.current);
        silenceIntervalRef.current = null;
      }
      scenarioVoiceService.stopAllAudio();
      scenarioVoiceService.stopAudioRecordingSync();
      void stopSpeechRecognition();
    };
  }, []);

  if (isLoading) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-[#F4F9FE]">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-[#0878EE]/20 border-t-[#0878EE]" />
        <p className="mt-4 text-sm font-semibold text-[#71809A]">Đang chuẩn bị phòng hội thoại...</p>
      </div>
    );
  }

  if (loadError || !session) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-[#F4F9FE] px-4">
        <div className="w-full max-w-md rounded-2xl border border-red-200 bg-white p-8 text-center shadow-lg">
          <span className="text-4xl">⚠️</span>
          <h2 className="mt-4 text-lg font-bold text-[#071A44]">Không thể vào phòng luyện tập</h2>
          <p className="mt-2 text-sm text-[#71809A]">{loadError || 'Dữ liệu phiên không tồn tại.'}</p>
          <button
            type="button"
            onClick={() => navigate('/scenarios')}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#0878EE] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#0768D0]"
          >
            Quay lại thư viện kịch bản
          </button>
        </div>
      </div>
    );
  }

  return (
    <div data-theme="phong-luyen" className="flex h-screen flex-col overflow-hidden bg-[#F4F9FE] text-[#071A44] font-sans">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed top-20 right-6 z-50 flex items-center gap-2.5 rounded-2xl px-5 py-3.5 text-xs font-semibold shadow-2xl transition-all duration-300 animate-fade-in ${
            toastMessage.startsWith('🎯')
              ? 'border border-emerald-400/80 bg-[#071A44] text-white shadow-[0_12px_36px_rgba(16,185,129,0.35)]'
              : 'border border-blue-400/40 bg-[#071A44] text-white shadow-[0_12px_36px_rgba(7,26,68,0.3)]'
          }`}
        >
          <span className="text-base">{toastMessage.startsWith('🎯') ? '🎉' : '⭐'}</span>
          <span className="leading-snug">{toastMessage}</span>
        </div>
      )}

      {/* TOP HEADER BAR */}
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-[#E6EDF5] bg-white px-4 md:px-6 shadow-sm z-20">
        {/* Left: Back button & Scenario title */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowLeaveModal(true)}
            className="inline-flex items-center gap-1 rounded-lg border border-[#E6EDF5] px-3 py-1.5 text-xs font-semibold text-[#71809A] transition hover:border-[#0878EE] hover:text-[#0878EE]"
            title="Tạm dừng và rời phòng luyện tập"
          >
            <span>←</span>
            <span className="hidden sm:inline">Rời phòng</span>
          </button>

          <div className="flex items-center gap-2.5">
            <LivingAvatar
              size="sm"
              avatarState={avatarState}
              personaName={session.aiPersona}
              personaRole={session.recommendedAiVoiceName?.split('(')[0].trim()}
              currentViseme={currentViseme}
              isAizuchiActive={isRecordingMic}
            />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold leading-tight text-[#071A44] line-clamp-1">
                  {session.scenarioTitle}
                </h1>
                <span className="rounded-full bg-[#EAF4FF] px-2 py-0.5 text-[10px] font-bold text-[#0878EE]">
                  JLPT {session.level || session.jlptLevel}
                </span>
              </div>
              <p className="text-[11px] text-[#71809A] flex items-center gap-1.5 flex-wrap">
                <span>Đối thoại cùng:</span>
                <span className="font-semibold text-[#071A44]">{session.aiPersona}</span>
                {session.recommendedAiVoiceName && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-[#EAF4FF] px-2 py-0.5 text-[10px] font-bold text-[#0878EE] border border-[#B9D9FF]/60" title="Giọng nói tự động gán phù hợp với nhân vật">
                    <span>🎙️</span>
                    <span>{session.recommendedAiVoiceName.split('(')[0].trim()}</span>
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>

        {/* Center/Right: Compact Action Controls */}
        <div className="flex items-center gap-2">
          {/* Credit balance pill (chỉ hiển thị cho Learner, ẩn đối với Admin) */}
          {!isAdmin && (
            <Link
              to="/credits"
              className="hidden sm:flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-bold text-amber-700 transition hover:bg-amber-100"
              title="Số dư credit hiện tại"
            >
              <span>🪙</span>
              <span>{session.creditBalance ?? 0}</span>
            </Link>
          )}

          {/* Toggle Cột Trái: Nhiệm vụ */}
          <button
            type="button"
            onClick={() => setIsLeftOpen(!isLeftOpen)}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
              isLeftOpen
                ? 'border-[#0878EE] bg-[#EAF4FF] text-[#0878EE]'
                : 'border-[#E6EDF5] bg-white text-[#52627A] hover:border-[#0878EE]'
            }`}
            title="Ẩn/Hiện Danh sách nhiệm vụ kịch bản"
          >
            <span>📋</span>
            <span className="hidden md:inline">Nhiệm vụ</span>
            <span className="text-[10px] font-bold opacity-80">
              ({completedMissionsCount}/{totalMissionsCount})
            </span>
          </button>

          {/* Toggle Cột Phải: Đánh giá */}
          <button
            type="button"
            onClick={() => setIsRightOpen(!isRightOpen)}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
              isRightOpen
                ? 'border-[#0878EE] bg-[#EAF4FF] text-[#0878EE]'
                : 'border-[#E6EDF5] bg-white text-[#52627A] hover:border-[#0878EE]'
            }`}
            title="Ẩn/Hiện Bảng phân tích & đánh giá ngôn ngữ chi tiết"
          >
            <span>🔍</span>
            <span className="hidden md:inline">Đánh giá</span>
          </button>

          {/* Dropdown Menu Cài đặt hỗ trợ (Dịch, Furigana, Giọng đọc AI, Tốc độ) */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsSettingsOpen(!isSettingsOpen)}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                isSettingsOpen
                  ? 'border-[#0878EE] bg-[#EAF4FF] text-[#0878EE]'
                  : 'border-[#E6EDF5] bg-white text-[#52627A] hover:border-[#0878EE]'
              }`}
              title="Cài đặt hỗ trợ (Dịch, Furigana, Giọng đọc AI)"
            >
              <span>⚙️</span>
              <span className="hidden md:inline">Cài đặt</span>
              {(showTranslation || showFurigana || autoPlayAudio) && (
                <span className="h-1.5 w-1.5 rounded-full bg-[#0878EE]" />
              )}
            </button>

            {/* Popover Dropdown Panel */}
            {isSettingsOpen && (
              <div
                ref={settingsRef}
                className="absolute right-0 top-11 z-50 w-72 rounded-2xl border border-[#DCE7F4] bg-white p-4 shadow-2xl animate-fade-in text-xs space-y-3.5"
              >
                <div className="flex items-center justify-between border-b border-[#F1F5F9] pb-2">
                  <span className="font-bold text-[#071A44] text-xs">Cài đặt hỗ trợ luyện tập</span>
                  <button
                    type="button"
                    onClick={() => setIsSettingsOpen(false)}
                    className="text-[#71809A] hover:text-[#071A44] font-bold"
                  >
                    ✕
                  </button>
                </div>

                {/* Toggle Dịch */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-[#071A44]">Dịch nghĩa tiếng Việt</p>
                    <p className="text-[11px] text-[#71809A]">Hiển thị bản dịch dưới câu</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      translationPeekCountRef.current += 1;
                      setShowTranslation(!showTranslation);
                    }}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                      showTranslation ? 'bg-[#0878EE]' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        showTranslation ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* Toggle Furigana */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-[#071A44]">Phiên âm Furigana</p>
                    <p className="text-[11px] text-[#71809A]">Cách đọc Hiragana trên Kanji</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowFurigana(!showFurigana)}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                      showFurigana ? 'bg-[#0878EE]' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        showFurigana ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* Toggle Giọng AI */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-[#071A44]">Tự động phát giọng AI</p>
                    <p className="text-[11px] text-[#71809A]">Phát âm ngay khi AI trả lời</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (autoPlayAudio) {
                        scenarioVoiceService.stopAllAudio();
                        setIsPlayingAiSpeech(false);
                        setPlayingMessageId(null);
                      }
                      setAutoPlayAudio(!autoPlayAudio);
                    }}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                      autoPlayAudio ? 'bg-[#0878EE]' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        autoPlayAudio ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* Tốc độ đọc AI */}
                <div className="border-t border-[#F1F5F9] pt-2.5">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-semibold text-[#071A44]">Tốc độ đọc của AI</span>
                    <span className="font-bold text-[#0878EE]">{speechRate}x</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[0.85, 1.0, 1.15].map((rate) => (
                      <button
                        key={rate}
                        type="button"
                        onClick={() => {
                          setSpeechRate(rate);
                          scenarioVoiceService.setSpeechRate(rate);
                        }}
                        className={`rounded-lg py-1 text-center font-bold text-xs transition ${
                          speechRate === rate
                            ? 'bg-[#0878EE] text-white shadow-xs'
                            : 'bg-[#F1F5F9] text-[#52627A] hover:bg-slate-200'
                        }`}
                      >
                        {rate === 0.85 ? '0.85x Chậm' : rate === 1.0 ? '1.0x Chuẩn' : '1.15x Nhanh'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Âm thanh bối cảnh (Procedural Ambient Sound) */}
                <div className="border-t border-[#F1F5F9] pt-2.5 flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-[#071A44]">Âm thanh bối cảnh</p>
                    <p className="text-[11px] text-[#71809A]">Nồi nước dùng / tàu điện nhẹ nhàng</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (isAmbientOn) {
                        ukiyoSound.stopAmbientSound();
                        setIsAmbientOn(false);
                      } else {
                        const title = (session?.scenarioTitle || '').toLowerCase();
                        const theme = title.includes('tàu') || title.includes('ga') ? 'train' : 'ramen';
                        ukiyoSound.startAmbientSound(theme);
                        setIsAmbientOn(true);
                      }
                    }}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                      isAmbientOn ? 'bg-[#0878EE]' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        isAmbientOn ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* Nút mở cài đặt giọng đọc VOICEVOX */}
                <div className="border-t border-[#F1F5F9] pt-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setIsSettingsOpen(false);
                      scenarioVoiceService.stopAllAudio();
                      setIsPlayingAiSpeech(false);
                      setPlayingMessageId(null);
                      setIsVoiceModalOpen(true);
                    }}
                    className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#DCE7F4] bg-[#F8FAFC] py-2 text-xs font-bold text-[#0878EE] transition hover:bg-[#EAF4FF] hover:border-[#0878EE]"
                  >
                    <span>🎙️</span>
                    <span>Đổi nhân vật & giọng đọc AI</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* End Session Button: Biến thành màu XANH LÁ khi đã hoàn thành 100% nhiệm vụ */}
          {isAllMissionsCompleted ? (
            <button
              type="button"
              onClick={() => setIsEkiStampOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700 animate-pulse"
              title={
                session.isNaturallyConcluded
                  ? 'Kịch bản đã hoàn thành trọn vẹn và kết thúc tự nhiên! Bấm để hoàn thành.'
                  : 'Bạn đã hoàn thành toàn bộ nhiệm vụ! Bấm để hoàn thành phiên.'
              }
            >
              <span>✓</span>
              <span>Hoàn thành phiên</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShowEndModal(true)}
              className="inline-flex items-center gap-1 rounded-xl border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50"
            >
              <span>Kết thúc sớm</span>
            </button>
          )}
        </div>
      </header>

      {/* BODY WORKSPACE (3-COLUMN LAYOUT) */}
      <div className="relative flex flex-1 overflow-hidden">
        {/* ============================================================ */}
        {/* 1. LEFT SIDEBAR: Missions & Cheat Sheet                     */}
        {/* ============================================================ */}
        <aside
          className={`shrink-0 border-r border-[#E6EDF5] bg-white flex flex-col z-10 overflow-hidden transition-all duration-300 ease-in-out ${
            isLeftOpen
              ? 'w-80 opacity-100 shadow-sm'
              : 'w-0 border-r-0 opacity-0 pointer-events-none'
          }`}
        >
          <div className="w-80 flex flex-col h-full shrink-0">
            {/* Header sidebar */}
            <div className="flex items-center justify-between border-b border-[#E6EDF5] px-4 py-3">
              <div>
                <h2 className="text-xs font-bold uppercase tracking-wider text-[#71809A]">
                  Tiến độ kịch bản
                </h2>
                <p className="text-xs font-semibold text-[#071A44]">
                  {completedMissionsCount} / {totalMissionsCount} nhiệm vụ đã xong
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsLeftOpen(false)}
                className="inline-flex items-center gap-1 rounded-lg border border-[#E6EDF5] px-2 py-1 text-xs font-semibold text-[#71809A] hover:bg-[#F4F9FE] hover:text-[#0878EE] hover:border-[#B9D9FF] transition"
                title="Thu gọn danh sách nhiệm vụ"
              >
                <span>◀</span>
                <span>Thu gọn</span>
              </button>
            </div>

            {/* Progress bar */}
            <div className="px-4 py-3 border-b border-[#F1F5F9]">
              <div className="h-2 w-full overflow-hidden rounded-full bg-[#E6EDF5]">
                <div
                  className="h-full bg-gradient-to-r from-[#0878EE] to-emerald-500 transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div className="mt-1 flex justify-between text-[10px] font-semibold text-[#71809A]">
                <span>Bắt đầu</span>
                <span>{progressPercent}%</span>
                <span>Hoàn thành</span>
              </div>
            </div>

            {/* Tab selector: Nhiệm vụ vs Cheat Sheet */}
            <div className="flex border-b border-[#E6EDF5] bg-[#F8FAFC] text-xs">
              <button
                type="button"
                onClick={() => setCheatSheetTab('vocab')}
                className={`flex-1 py-2 font-semibold transition ${
                  cheatSheetTab === 'vocab'
                    ? 'border-b-2 border-[#0878EE] bg-white text-[#0878EE]'
                    : 'text-[#71809A] hover:text-[#071A44]'
                }`}
              >
                Nhiệm vụ ({session.missions.length})
              </button>
              <button
                type="button"
                onClick={() => setCheatSheetTab('grammar')}
                className={`flex-1 py-2 font-semibold transition ${
                  cheatSheetTab === 'grammar'
                    ? 'border-b-2 border-[#0878EE] bg-white text-[#0878EE]'
                    : 'text-[#71809A] hover:text-[#071A44]'
                }`}
              >
                Cheat Sheet
              </button>
            </div>

            {/* Content list */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {cheatSheetTab === 'vocab' ? (
                // DANH SÁCH NHIỆM VỤ TỰ ĐỘNG TICK
                <div className="space-y-2.5">
                  {session.missions.map((mission: RoleplayMissionDto) => (
                    <div
                      key={mission.missionId ?? mission.id ?? mission.order}
                      className={`flex gap-3 rounded-xl border p-3 transition-all duration-300 ${
                        recentlyCompletedMissionIds.includes(mission.missionId ?? mission.id ?? mission.order)
                          ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-400 ring-offset-2 scale-[1.02] shadow-md animate-pulse-glow'
                          : mission.isCompleted
                          ? 'border-emerald-200 bg-emerald-50/60'
                          : 'border-[#E6EDF5] bg-white hover:border-[#B9D9FF]'
                      }`}
                    >
                      {/* Trạng thái icon: CHỈ CÓ Pending hoặc Completed */}
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                          mission.isCompleted
                            ? 'bg-emerald-500 text-white shadow-xs'
                            : 'bg-[#F1F5F9] text-[#71809A]'
                        }`}
                      >
                        {mission.isCompleted ? '✓' : mission.order}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <p
                            className={`text-xs font-semibold leading-snug ${
                              mission.isCompleted ? 'text-emerald-900 font-bold' : 'text-[#071A44]'
                            }`}
                          >
                            {mission.content}
                          </p>
                          {mission.isCompleted && (
                            <span className="shrink-0 text-[10px] font-bold text-emerald-600">
                              {recentlyCompletedMissionIds.includes(mission.missionId ?? mission.id ?? mission.order)
                                ? '🎯 Vừa đạt!'
                                : 'Đã đạt'}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-[11px] leading-tight text-[#71809A]">
                          Mục tiêu: {mission.target}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                // CHEAT SHEET: TỪ VỰNG & NGỮ PHÁP
                <div className="space-y-4 text-xs">
                  <div>
                    <h3 className="font-bold text-[#0878EE] uppercase text-[11px] tracking-wider mb-2">
                      Từ vựng trọng tâm ({(session.targetVocabularies ?? []).length})
                    </h3>
                    <div className="space-y-2">
                      {(session.targetVocabularies ?? []).map((v) => (
                        <div key={v.id} className="rounded-lg bg-[#F8FAFC] p-2 border border-[#E6EDF5]">
                          <div className="flex justify-between items-baseline">
                            <span className="font-bold text-[#071A44]">{v.word}</span>
                            <span className="text-[11px] text-[#71809A]">{v.reading}</span>
                          </div>
                          <p className="mt-0.5 text-[11px] text-[#71809A]">{v.meaning}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h3 className="font-bold text-[#0878EE] uppercase text-[11px] tracking-wider mb-2">
                      Mẫu ngữ pháp ({(session.targetGrammars ?? []).length})
                    </h3>
                    <div className="space-y-2">
                      {(session.targetGrammars ?? []).map((g) => (
                        <div key={g.id} className="rounded-lg bg-[#F8FAFC] p-2 border border-[#E6EDF5]">
                          <p className="font-bold text-[#0878EE]">{g.pattern}</p>
                          <p className="mt-0.5 text-[11px] text-[#71809A]">{g.meaning}</p>
                          {g.exampleSentence && (
                            <p className="mt-1 text-[11px] italic text-[#071A44]">{g.exampleSentence}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* Nút Dock mở rộng Cột Trái khi đang bị thu gọn (Hiệu ứng trượt êm ái) */}
        <button
          type="button"
          onClick={() => setIsLeftOpen(true)}
          className={`absolute top-4 left-0 z-30 flex items-center gap-2 rounded-r-xl border border-l-0 border-[#0878EE]/30 bg-white px-3 py-2.5 text-xs font-bold text-[#0878EE] shadow-md hover:bg-[#EAF4FF] hover:pr-4 transition-all duration-300 ease-in-out ${
            !isLeftOpen
              ? 'translate-x-0 opacity-100 pointer-events-auto'
              : '-translate-x-full opacity-0 pointer-events-none'
          }`}
          title="Mở rộng danh sách nhiệm vụ & Cheat sheet"
        >
          <span>📋</span>
          <span>Nhiệm vụ ({completedMissionsCount}/{totalMissionsCount})</span>
          <span>▶</span>
        </button>

        {/* ============================================================ */}
        {/* 2. CENTER COLUMN: Chat Stream (Max Width 760px Centered)    */}
        {/* ============================================================ */}
        <main className="flex flex-1 flex-col overflow-hidden bg-[#F4F9FE]">
          {/* Scrollable messages container */}
          <div className="flex-1 overflow-y-auto p-4 md:p-6">
            <div className="mx-auto w-full max-w-[760px] space-y-4">
              {/* Scenario Context & Living Avatar Stage Card */}
              <div className="rounded-3xl border border-[#B9D9FF]/70 bg-gradient-to-r from-[#EAF4FF] via-white to-[#F0F7FF] p-4 text-xs shadow-sm flex items-center gap-4">
                <div className="shrink-0">
                  <LivingAvatar
                    size="md"
                    avatarState={avatarState}
                    personaName={session.aiPersona}
                    personaRole={session.recommendedAiVoiceName?.split('(')[0].trim()}
                    currentViseme={currentViseme}
                    isAizuchiActive={isRecordingMic}
                    hideLabel
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 font-bold text-[#0878EE] uppercase tracking-wider text-[11px]">
                    <span>⛩️ BỐI CẢNH LUYỆN TẬP</span>
                    <span className="text-slate-300">•</span>
                    <span className="text-[#071A44] font-semibold lowercase first-letter:uppercase">{session.aiPersona}</span>
                  </div>
                  <p className="mt-1 text-[#475569] leading-relaxed line-clamp-2">{session.scenarioContext}</p>
                </div>
              </div>

              {/* Message List */}
              {session.messages.map((msg: RoleplayMessageDto) => {
                const isAi = msg.sender === 'Ai';
                const isSelected = selectedMessageId === msg.id;

                return (
                  <div
                    key={msg.id}
                    className={`flex items-start gap-3 transition-all duration-300 animate-slide-up ${isAi ? '' : 'justify-end'}`}
                  >
                    {/* Avatar: LivingAvatar mini cho AI, tin nhắn người dùng căn phải tự nhiên */}
                    {isAi && (
                      <div className="shrink-0">
                        <LivingAvatar
                          size="sm"
                          avatarState={playingMessageId === msg.id && isPlayingAiSpeech ? 'speaking' : 'idle'}
                          personaName={session.aiPersona}
                          currentViseme={playingMessageId === msg.id && isPlayingAiSpeech ? currentViseme : 'closed'}
                        />
                      </div>
                    )}

                    {/* Chat Bubble */}
                    <div
                      onClick={() => {
                        if (!isAi && msg.linguisticFeedback) {
                          setSelectedMessageId(msg.id);
                          setIsRightOpen(true);
                        }
                      }}
                      className={`group relative max-w-[80%] rounded-2xl p-4 transition shadow-xs ${
                        isAi
                          ? 'bubble-ai rounded-tl-xs border border-[#E6EDF5] bg-white text-[#071A44]'
                          : `bubble-user rounded-tr-xs bg-[#0878EE] text-white cursor-pointer ${
                              isSelected ? 'ring-3 ring-[#0878EE]/30 shadow-md' : 'hover:bg-[#0768D0]'
                            }`
                      }`}
                    >
                      {/* Header in bubble */}
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span
                          className={`text-[10px] font-bold ${
                            isAi ? 'text-[#71809A]' : 'text-blue-100'
                          }`}
                        >
                          {isAi ? session.aiPersona : 'Bạn'}
                        </span>

                        {/* Quick Status Badge for User message */}
                        {!isAi && msg.linguisticFeedback && (
                          <div
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold shadow-xs ${
                              getFeedbackStatus(msg.linguisticFeedback) === 'warning'
                                ? 'bg-amber-400 text-slate-900'
                                : getFeedbackStatus(msg.linguisticFeedback) === 'error'
                                ? 'bg-red-500 text-white'
                                : 'bg-emerald-500 text-white'
                            }`}
                            title="Bấm để xem phân tích ngữ pháp chi tiết"
                          >
                            <span>
                              {getFeedbackStatus(msg.linguisticFeedback) === 'warning'
                                ? '⚠ Lưu ý'
                                : getFeedbackStatus(msg.linguisticFeedback) === 'error'
                                ? '✕ Cần sửa'
                                : '✓ Chuẩn'}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Japanese text (with furigana toggle support) */}
                      {showFurigana && msg.furiganaHtml ? (
                        <div
                          className="text-base font-medium leading-relaxed tracking-wide"
                          dangerouslySetInnerHTML={{ __html: msg.furiganaHtml }}
                        />
                      ) : (
                        <p className="text-base font-medium leading-relaxed tracking-wide">
                          {showFurigana && msg.furiganaText ? msg.furiganaText : msg.japaneseText}
                        </p>
                      )}

                      {/* Vietnamese translation (with translation toggle support) */}
                      {showTranslation && msg.vietnameseMeaning && msg.vietnameseMeaning.trim() !== msg.japaneseText.trim() && (
                        <p
                          className={`mt-2 border-t pt-2 text-xs leading-relaxed ${
                            isAi ? 'border-[#F1F5F9] text-[#71809A]' : 'border-blue-400/40 text-blue-100'
                          }`}
                        >
                          {msg.vietnameseMeaning}
                        </p>
                      )}

                      {/* Subtle Inline feedback preview for User messages */}
                      {!isAi && msg.linguisticFeedback?.naturalAlternative && (
                        <div className="mt-2 flex items-center justify-between border-t border-blue-400/30 pt-1.5 text-[11px] text-blue-100">
                          <span className="truncate pr-2">💡 Gợi ý: {msg.linguisticFeedback.naturalAlternative}</span>
                          <span className="shrink-0 text-[10px] font-bold text-white/90 underline decoration-dotted">
                            Chi tiết ➔
                          </span>
                        </div>
                      )}

                      {/* Learner audio playback & sample pronunciation buttons */}
                      {!isAi && (
                        <div className="mt-2 flex flex-wrap items-center justify-end gap-2 border-t border-blue-400/20 pt-1.5">
                          {/* Nút nghe lại giọng thu âm thực tế của học viên */}
                          {(msg.userAudioUrl || userAudioMapRef.current.get(msg.id)) && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                const url = msg.userAudioUrl || userAudioMapRef.current.get(msg.id);
                                if (url) handlePlayUserAudio(msg.id, url);
                              }}
                              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition cursor-pointer ${
                                playingUserAudioId === msg.id
                                  ? 'bg-emerald-400 text-slate-900 font-bold shadow-xs'
                                  : 'bg-white/15 text-white hover:bg-white/25'
                              }`}
                              title="Nghe lại bản thu âm giọng nói thực tế của bạn"
                            >
                              {playingUserAudioId === msg.id ? (
                                <span className="flex items-center gap-1.5">
                                  <span className="flex items-end gap-0.5 h-3">
                                    <span className="w-1 bg-slate-900 rounded-full animate-[pulse_0.4s_ease-in-out_infinite] h-3" />
                                    <span className="w-1 bg-slate-900 rounded-full animate-[pulse_0.6s_ease-in-out_infinite_0.1s] h-2" />
                                    <span className="w-1 bg-slate-900 rounded-full animate-[pulse_0.5s_ease-in-out_infinite_0.2s] h-3.5" />
                                  </span>
                                  <span>Đang phát giọng bạn...</span>
                                </span>
                              ) : (
                                <>
                                  <span>🎙️</span>
                                  <span>Nghe lại giọng bạn</span>
                                </>
                              )}
                            </button>
                          )}

                          {/* Nút nghe giọng mẫu bản xứ */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePlayLearnerSample(msg.japaneseText);
                            }}
                            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition cursor-pointer ${
                              isPlayingLearnerSample && playingLearnerText === msg.japaneseText
                                ? 'bg-white/20 text-white font-bold shadow-xs'
                                : 'text-blue-100 hover:text-white hover:bg-white/10'
                            }`}
                            title="Nghe phát âm chuẩn câu này bằng giọng mẫu Tokyo"
                          >
                            {isPlayingLearnerSample && playingLearnerText === msg.japaneseText ? (
                              <span className="flex items-center gap-1.5 text-white">
                                <span className="flex items-end gap-0.5 h-3">
                                  <span className="w-1 bg-white rounded-full animate-[pulse_0.5s_ease-in-out_infinite] h-3" />
                                  <span className="w-1 bg-white rounded-full animate-[pulse_0.7s_ease-in-out_infinite_0.15s] h-2" />
                                  <span className="w-1 bg-white rounded-full animate-[pulse_0.4s_ease-in-out_infinite_0.3s] h-3.5" />
                                  <span className="w-1 bg-white rounded-full animate-[pulse_0.6s_ease-in-out_infinite_0.1s] h-2.5" />
                                </span>
                                <span className="text-[11px] font-bold">Đang đọc mẫu...</span>
                              </span>
                            ) : (
                              <>
                                <span>🌸</span>
                                <span>Nghe đọc mẫu</span>
                              </>
                            )}
                          </button>
                        </div>
                      )}

                      {/* AI Audio button with Soundwave equalizer */}
                      {isAi && (
                        <div className="mt-2 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePlayMessageAudio(msg.id, msg.japaneseText);
                            }}
                            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                              playingMessageId === msg.id && isPlayingAiSpeech
                                ? 'bg-[#EAF4FF] text-[#0878EE] font-bold shadow-xs'
                                : 'text-[#71809A] hover:bg-slate-100 hover:text-[#0878EE]'
                            }`}
                            title="Nghe phát âm tiếng Nhật của AI"
                          >
                            {playingMessageId === msg.id && isPlayingAiSpeech ? (
                              <span className="flex items-center gap-1.5 text-[#0878EE]">
                                <span className="flex items-end gap-0.5 h-3.5">
                                  <span className="w-1 bg-[#0878EE] rounded-full animate-[pulse_0.5s_ease-in-out_infinite] h-3" />
                                  <span className="w-1 bg-[#0878EE] rounded-full animate-[pulse_0.7s_ease-in-out_infinite_0.15s] h-2" />
                                  <span className="w-1 bg-[#0878EE] rounded-full animate-[pulse_0.4s_ease-in-out_infinite_0.3s] h-3.5" />
                                  <span className="w-1 bg-[#0878EE] rounded-full animate-[pulse_0.6s_ease-in-out_infinite_0.1s] h-2.5" />
                                </span>
                                <span className="text-[11px] font-bold">Đang phát...</span>
                              </span>
                            ) : (
                              <>
                                <span>🔈</span>
                                <span>Nghe lại</span>
                              </>
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Typing indicator when AI is generating */}
              {isSending && (
                <div className="flex items-start gap-3 animate-fade-in">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-[#0878EE] to-[#4FA3FF] text-xs font-bold text-white shadow-xs">
                    {session.aiPersona.slice(0, 1) || 'AI'}
                  </div>
                  <div className="rounded-2xl rounded-tl-xs border border-[#E6EDF5] bg-white p-4 shadow-xs text-xs text-[#71809A] flex items-center gap-2">
                    <span className="flex gap-1">
                      <span className="h-2 w-2 rounded-full bg-[#0878EE] animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="h-2 w-2 rounded-full bg-[#0878EE] animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="h-2 w-2 rounded-full bg-[#0878EE] animate-bounce" style={{ animationDelay: '300ms' }} />
                    </span>
                    <span>{session.aiPersona} đang phản hồi...</span>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* HINT BAR & INPUT BAR */}
          <footer className="shrink-0 border-t border-[#E6EDF5] bg-white p-3 md:p-4 z-10 shadow-lg">
            <div className="mx-auto w-full max-w-[760px] space-y-2.5">
              {/* Hint Bar Box (nếu đã gọi gợi ý) */}
              {hint && (
                <div className="rounded-xl border border-[#B9D9FF] bg-[#F4F9FE] p-3 text-xs shadow-xs animate-fade-in">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1 font-bold text-[#0878EE]">
                      <span>💡</span>
                      <span>Gợi ý câu tiếp theo:</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setHint(null)}
                      className="text-[#71809A] hover:text-[#071A44]"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="mt-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div>
                      <p className="font-bold text-[#071A44] text-sm">
                        {hint.suggestedJapaneseText || hint.japaneseSuggestion}
                      </p>
                      <p className="text-[11px] text-[#71809A]">
                        {hint.suggestedVietnameseMeaning || hint.vietnameseMeaning}
                      </p>
                      <p className="mt-0.5 text-[10px] italic text-[#0878EE]">
                        {hint.explanation || hint.contextExplanation}
                      </p>
                    </div>
                    {/* Nút dùng câu này: CHỈ ĐIỀN TIẾNG NHẬT theo yêu cầu */}
                    <button
                      type="button"
                      onClick={handleApplyHint}
                      className="shrink-0 self-end sm:self-center rounded-lg bg-[#0878EE] px-3 py-1.5 font-bold text-white transition hover:bg-[#0768D0] shadow-xs"
                    >
                      Dùng câu này ➔
                    </button>
                  </div>
                </div>
              )}

              {/* Mic Permission / Error Warning */}
              {micError && (
                <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 animate-fade-in shadow-xs">
                  <div className="flex items-center gap-2">
                    <span>⚠️</span>
                    <span>{micError} Hãy cho phép trình duyệt truy cập micro để luyện nói.</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMicError(null)}
                    className="text-red-500 hover:text-red-800 font-bold"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* Proactive AI Engagement (Tự động xuất hiện sau 14s người học chưa phản hồi) */}
              {showProactiveHint && !hint && !isSending && !session.isNaturallyConcluded && (
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-[#B9D9FF] bg-gradient-to-r from-[#F4F9FE] via-[#EAF4FF] to-[#F4F9FE] p-3 shadow-md animate-fade-in transition-all">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-[#0878EE] to-[#4FA3FF] text-white font-bold text-xs shadow-xs ring-2 ring-[#0878EE]/20 animate-pulse">
                      <span>💬</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-[#071A44] truncate">
                        {session.aiPersona || 'AI'} đang chờ bạn mở lời...
                      </p>
                      <p className="text-[11px] text-[#71809A]">
                        Bạn có muốn xem gợi ý câu đối đáp chuẩn không? Đừng ngần ngại nhé!
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setShowProactiveHint(false);
                        handleGetHint();
                      }}
                      className="inline-flex items-center gap-1 rounded-xl bg-[#0878EE] px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-[#0768D0] active:scale-95 transition"
                    >
                      <span>💡</span>
                      <span>Xem gợi ý ngay</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowProactiveHint(false)}
                      className="rounded-lg p-1 text-[#71809A] hover:bg-white hover:text-[#071A44] transition"
                      title="Để sau"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              )}

              {/* Input Row */}
              <form onSubmit={handleSendMessage} className="flex items-center gap-2">
                {/* Button xin Hint */}
                <button
                  type="button"
                  onClick={handleGetHint}
                  disabled={isLoadingHint || isSending}
                  className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-[#E6EDF5] bg-[#F8FAFC] px-3 py-2.5 text-xs font-bold text-[#0878EE] transition hover:bg-[#EAF4FF] hover:border-[#B9D9FF]"
                  title="Xin AI gợi ý cách đáp lời"
                >
                  {isLoadingHint ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#0878EE]/20 border-t-[#0878EE]" />
                  ) : (
                    <span>💡 Gợi ý</span>
                  )}
                </button>

                {/* Button Micro thu âm (Voice Input với hiệu ứng Radar Pulse & Adaptive Silence Ring) */}
                <div className="relative inline-flex shrink-0">
                  {isRecordingMic && (
                    <span className="absolute inset-0 rounded-xl bg-red-500 animate-ping opacity-40 pointer-events-none" />
                  )}
                  {isRecordingMic && silenceCountdownProgress > 0 && (
                    <svg className="absolute -inset-1.5 h-[calc(100%+12px)] w-[calc(100%+12px)] pointer-events-none transform -rotate-90 z-20">
                      <rect
                        x="3"
                        y="3"
                        width="calc(100% - 6px)"
                        height="calc(100% - 6px)"
                        rx="14"
                        stroke="#c63a24"
                        strokeWidth="2.5"
                        fill="none"
                        strokeDasharray={140}
                        strokeDashoffset={140 * (1 - silenceCountdownProgress)}
                        strokeLinecap="round"
                        className="transition-all duration-75"
                      />
                    </svg>
                  )}
                  <button
                    type="button"
                    onClick={handleToggleMic}
                    disabled={isSending || isProcessingStt}
                    className={`relative z-10 inline-flex items-center justify-center gap-1.5 rounded-xl px-3.5 py-2.5 text-xs font-bold transition shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                      isProcessingStt
                        ? 'border border-blue-400 bg-blue-100 text-blue-700'
                        : isRecordingMic
                        ? 'border border-red-500 bg-red-600 text-white ring-4 ring-red-400/40 shadow-lg'
                        : 'border border-[#0878EE] bg-[#0878EE] text-white hover:bg-[#0768D0] hover:shadow-md'
                    }`}
                    title={
                      isProcessingStt
                        ? 'Whisper AI đang xử lý nhận diện giọng nói...'
                        : isRecordingMic
                        ? 'Đang bật mic (Bấm để dừng)'
                        : isWhisperEngineOnline
                        ? 'Nói tiếng Nhật (Hỗ trợ Whisper STT chuẩn cao)'
                        : 'Bấm để nói tiếng Nhật bằng micro'
                    }
                  >
                    {isProcessingStt ? (
                      <>
                        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-blue-600/20 border-t-blue-600" />
                        <span className="hidden sm:inline">Nhận diện...</span>
                      </>
                    ) : (
                      <>
                        <span className="text-sm">{isRecordingMic ? '⏹️' : '🎙️'}</span>
                        <span>{isRecordingMic ? 'Đang thu âm...' : 'Nói'}</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Text input */}
                <input
                  ref={inputRef}
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onCompositionStart={() => setIsComposing(true)}
                  onCompositionEnd={() => setIsComposing(false)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      if (isComposing || (e.nativeEvent as any).isComposing) {
                        return;
                      }
                    }
                  }}
                  placeholder={
                    isRecordingMic
                      ? '🎙️ Đang lắng nghe giọng nói tiếng Nhật của bạn...'
                      : 'Nhập câu trả lời bằng tiếng Nhật... (Enter để gửi)'
                  }
                  disabled={isSending}
                  className={`flex-1 min-w-0 rounded-xl border px-3 sm:px-4 py-2.5 text-sm text-[#071A44] outline-none transition ${
                    isRecordingMic
                      ? 'border-red-300 bg-red-50/40 ring-2 ring-red-200'
                      : 'border-[#E6EDF5] bg-[#F8FAFC] focus:border-[#0878EE] focus:bg-white focus:ring-2 focus:ring-[#0878EE]/20'
                  }`}
                />

                {/* Nút nghe đọc mẫu câu học viên vừa gõ trước khi gửi */}
                {inputText.trim() && (
                  <button
                    type="button"
                    onClick={() => handlePlayLearnerSample(inputText)}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-[#B9D9FF] bg-[#EAF4FF] px-2.5 sm:px-3 py-2.5 text-xs font-bold text-[#0878EE] hover:bg-[#D5E9FF] active:scale-95 transition"
                    title="Nghe phát âm chuẩn câu bạn vừa nhập trước khi gửi"
                  >
                    {isPlayingLearnerSample && playingLearnerText === inputText ? (
                      <span className="flex items-center gap-1 text-[#0878EE]">
                        <span className="flex items-end gap-0.5 h-3">
                          <span className="w-1 bg-[#0878EE] rounded-full animate-[pulse_0.5s_ease-in-out_infinite] h-3" />
                          <span className="w-1 bg-[#0878EE] rounded-full animate-[pulse_0.7s_ease-in-out_infinite_0.15s] h-2" />
                          <span className="w-1 bg-[#0878EE] rounded-full animate-[pulse_0.4s_ease-in-out_infinite_0.3s] h-3.5" />
                        </span>
                        <span className="hidden md:inline text-[11px]">Đang đọc...</span>
                      </span>
                    ) : (
                      <>
                        <span>🔈</span>
                        <span className="hidden md:inline">Đọc mẫu</span>
                      </>
                    )}
                  </button>
                )}

                {/* Send Button */}
                <button
                  type="submit"
                  disabled={!inputText.trim() || isSending}
                  className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-[#0878EE] px-4 sm:px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#0768D0] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
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

              <div className="flex items-center justify-between text-[11px] text-[#71809A]">
                <span>Mẹo: Bạn có thể nhấp vào câu nói của mình để xem đánh giá ngôn ngữ chi tiết.</span>
                <span className="hidden sm:inline">JLPT {session.level || session.jlptLevel}</span>
              </div>
            </div>
          </footer>
        </main>

        {/* ============================================================ */}
        {/* 3. RIGHT SIDEBAR: Linguistic Feedback Panel                 */}
        {/* ============================================================ */}
        <aside
          className={`shrink-0 border-l border-[#E6EDF5] bg-white flex flex-col z-10 overflow-hidden transition-all duration-300 ease-in-out ${
            isRightOpen
              ? 'w-80 lg:w-[330px] xl:w-[350px] max-w-[30vw] opacity-100 shadow-sm'
              : 'w-0 border-l-0 opacity-0 pointer-events-none'
          }`}
        >
          <div className="w-80 lg:w-[330px] xl:w-[350px] flex flex-col h-full shrink-0">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#E6EDF5] px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="text-base">🔍</span>
                <h2 className="text-xs font-bold uppercase tracking-wider text-[#071A44]">
                  Đánh giá lượt nói
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsRightOpen(false)}
                className="inline-flex items-center gap-1 rounded-lg border border-[#E6EDF5] px-2 py-1 text-xs font-semibold text-[#71809A] hover:bg-[#F4F9FE] hover:text-[#0878EE] hover:border-[#B9D9FF] transition"
                title="Thu gọn bảng đánh giá"
              >
                <span>Thu gọn</span>
                <span>▶</span>
              </button>
            </div>

            {/* Content body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {selectedMessage && selectedMessage.linguisticFeedback ? (
                <>
                  {/* Selected User Sentence */}
                  <div className="rounded-xl border border-[#E6EDF5] bg-[#F8FAFC] p-3 text-xs">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#71809A]">
                      Câu của bạn:
                    </p>
                    <p className="mt-1 font-bold text-sm text-[#0878EE] break-words">
                      "{selectedMessage.japaneseText}"
                    </p>
                    {selectedMessage.vietnameseMeaning && (
                      <p className="mt-0.5 text-[#71809A] break-words">{selectedMessage.vietnameseMeaning}</p>
                    )}
                  </div>

                  {/* So sánh phát âm A/B (Giọng bạn vs Mẫu bản xứ) & Chỉ số lưu loát */}
                  <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-3 text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-indigo-950 flex items-center gap-1.5">
                        <span>🎧</span>
                        <span>So sánh phát âm (A/B)</span>
                      </span>
                      {selectedMessage.linguisticFeedback.speechDelivery?.turnFluencyScore && (
                        <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
                          Lưu loát: {selectedMessage.linguisticFeedback.speechDelivery.turnFluencyScore}/100
                        </span>
                      )}
                    </div>

                    <div className="flex flex-col gap-2 pt-1">
                      {/* Chỉ hiển thị player của học viên nếu lượt này THỰC SỰ có bản thu âm (nói bằng Mic) */}
                      {(() => {
                        const userAudio = selectedMessage.audioUrl || selectedMessage.userAudioUrl || userAudioMapRef.current.get(selectedMessage.id);
                        if (userAudio) {
                          return (
                            <AudioWaveformPlayer
                              audioUrl={userAudio}
                              label="Giọng bạn"
                              variant="user"
                              compact
                              className="w-full"
                            />
                          );
                        }
                        return (
                          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-[11px] text-slate-500">
                            <span className="text-sm">⌨️</span>
                            <span className="leading-tight">Lượt này nhập phím (không ghi âm). Hãy dùng nút Mic nói để nghe lại & so sánh phát âm.</span>
                          </div>
                        );
                      })()}

                      {/* Nghe giọng phát âm mẫu chuẩn Tokyo */}
                      <AudioWaveformPlayer
                        onPlayFallback={() => handlePlayLearnerSample(selectedMessage.japaneseText)}
                        onSeekFallback={(ratio, time) => {
                          scenarioVoiceService.seekAiSpeech(
                            selectedMessage.japaneseText,
                            ratio,
                            time,
                            learnerVoiceId,
                            () => {
                              setIsPlayingLearnerSample(false);
                              setPlayingLearnerText(null);
                            },
                            speechRate,
                            () => {
                              setIsPlayingLearnerSample(true);
                            }
                          );
                        }}
                        isFallbackPlaying={isPlayingLearnerSample && playingLearnerText === selectedMessage.japaneseText}
                        fallbackDuration={Math.max(1.4, Number(((selectedMessage.japaneseText.length * 0.22) / speechRate).toFixed(1)))}
                        label="Mẫu Tokyo"
                        variant="model"
                        compact
                        className="w-full"
                      />
                    </div>

                    {/* Delivery Assessment Chips */}
                    {selectedMessage.linguisticFeedback.speechDelivery && (
                      <div className="pt-2 border-t border-indigo-100/70 space-y-1">
                        {selectedMessage.linguisticFeedback.speechDelivery.paceAssessment && (
                          <div className="flex items-center gap-1.5 text-[11px] text-indigo-900 font-medium">
                            <span className="text-[10px]">⚡</span>
                            <span>{selectedMessage.linguisticFeedback.speechDelivery.paceAssessment}</span>
                          </div>
                        )}
                        {selectedMessage.linguisticFeedback.speechDelivery.latencyAssessment && (
                          <div className="flex items-center gap-1.5 text-[11px] text-indigo-900 font-medium">
                            <span className="text-[10px]">⏱️</span>
                            <span>{selectedMessage.linguisticFeedback.speechDelivery.latencyAssessment}</span>
                          </div>
                        )}
                        {typeof selectedMessage.linguisticFeedback.speechDelivery.speechConfidence === 'number' && (
                          <div className="flex items-center gap-1.5 text-[11px] text-indigo-900 font-medium">
                            <span className="text-[10px]">🎙️</span>
                            <span>Độ rõ âm (Whisper): {Math.round(selectedMessage.linguisticFeedback.speechDelivery.speechConfidence * 100)}%</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Summary & Quick Badge */}
                  <div className="rounded-xl border border-[#B9D9FF]/40 bg-[#EAF4FF]/40 p-3 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[#071A44]">Nhận xét chung</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          getFeedbackStatus(selectedMessage.linguisticFeedback) === 'warning'
                            ? 'bg-amber-100 text-amber-800'
                            : getFeedbackStatus(selectedMessage.linguisticFeedback) === 'error'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-emerald-100 text-emerald-700'
                        }`}
                      >
                        {getFeedbackStatus(selectedMessage.linguisticFeedback).toUpperCase()}
                      </span>
                    </div>
                    <p className="mt-1.5 text-[#71809A] leading-relaxed break-words">
                      {selectedMessage.linguisticFeedback.summary || 'Đã ghi nhận câu nói.'}
                    </p>
                  </div>

                  {/* Detailed Criterion Blocks */}
                  <div className="space-y-2.5 text-xs">
                    {/* Render mảng details từ Gemini API nếu có */}
                    {selectedMessage.linguisticFeedback.details && selectedMessage.linguisticFeedback.details.length > 0 ? (
                      selectedMessage.linguisticFeedback.details.map((detail, idx) => (
                        <div key={idx} className="rounded-xl border border-[#E6EDF5] p-3 bg-white shadow-2xs">
                          <div className="flex items-center gap-1.5 font-bold text-[#071A44]">
                            <span
                              className={
                                detail.type === 'warning'
                                  ? 'text-amber-500'
                                  : detail.type === 'error'
                                  ? 'text-red-500'
                                  : 'text-emerald-500'
                              }
                            >
                              {detail.type === 'warning' ? '⚠' : detail.type === 'error' ? '✕' : '✓'}
                            </span>
                            <span>{detail.aspect}</span>
                          </div>
                          <p className="mt-1 text-[#71809A] leading-relaxed break-words">{detail.comment}</p>
                        </div>
                      ))
                    ) : (
                      <>
                        {/* Grammar */}
                        {selectedMessage.linguisticFeedback.grammarAssessment && (
                          <div className="rounded-xl border border-[#E6EDF5] p-3 bg-white shadow-2xs">
                            <div className="flex items-center gap-1.5 font-bold text-[#071A44]">
                              <span>📘</span>
                              <span>Ngữ pháp & Trợ từ</span>
                            </div>
                            <p className="mt-1 text-[#71809A] leading-relaxed break-words">
                              {selectedMessage.linguisticFeedback.grammarAssessment}
                            </p>
                          </div>
                        )}

                        {/* Vocabulary */}
                        {selectedMessage.linguisticFeedback.vocabularyAssessment && (
                          <div className="rounded-xl border border-[#E6EDF5] p-3 bg-white shadow-2xs">
                            <div className="flex items-center gap-1.5 font-bold text-[#071A44]">
                              <span>📗</span>
                              <span>Dùng từ & Độ tự nhiên</span>
                            </div>
                            <p className="mt-1 text-[#71809A] leading-relaxed break-words">
                              {selectedMessage.linguisticFeedback.vocabularyAssessment}
                            </p>
                          </div>
                        )}

                        {/* Politeness */}
                        {selectedMessage.linguisticFeedback.politenessAssessment && (
                          <div className="rounded-xl border border-[#E6EDF5] p-3 bg-white shadow-2xs">
                            <div className="flex items-center gap-1.5 font-bold text-[#071A44]">
                              <span>📙</span>
                              <span>Sắc thái & Kính ngữ</span>
                            </div>
                            <p className="mt-1 text-[#71809A] leading-relaxed break-words">
                              {selectedMessage.linguisticFeedback.politenessAssessment}
                            </p>
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Natural Alternative */}
                  {selectedMessage.linguisticFeedback.naturalAlternative && (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 text-xs">
                      <div className="flex items-center gap-1.5 font-bold text-emerald-800">
                        <span>✨</span>
                        <span>Cách diễn đạt tự nhiên hơn</span>
                      </div>
                      <p className="mt-1.5 font-bold text-sm text-[#071A44] break-words">
                        {selectedMessage.linguisticFeedback.naturalAlternative}
                      </p>
                    </div>
                  )}

                  {/* Cultural Tip */}
                  {selectedMessage.linguisticFeedback.culturalTip && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 text-xs">
                      <div className="flex items-center gap-1.5 font-bold text-amber-900">
                        <span>💡</span>
                        <span>Mẹo văn hóa giao tiếp</span>
                      </div>
                      <p className="mt-1.5 text-amber-800 leading-relaxed break-words">
                        {selectedMessage.linguisticFeedback.culturalTip}
                      </p>
                    </div>
                  )}

                  {/* Hành động thiết thực: Nghe phát âm & Sao chép câu bản xứ */}
                  <div className="pt-2 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const textToPlay =
                          selectedMessage.linguisticFeedback?.naturalAlternative ||
                          selectedMessage.japaneseText;
                        setIsPlayingAlternativeAudio(true);
                        void scenarioVoiceService.playAiSpeech(
                          textToPlay,
                          selectedVoiceId,
                          () => setIsPlayingAlternativeAudio(false),
                          speechRate
                        );
                      }}
                      className={`inline-flex items-center justify-center gap-1.5 rounded-xl border py-2.5 text-xs font-bold transition shadow-2xs ${
                        isPlayingAlternativeAudio
                          ? 'border-[#0878EE] bg-[#EAF4FF] text-[#0878EE]'
                          : 'border-[#E6EDF5] bg-white text-[#52627A] hover:border-[#0878EE] hover:text-[#0878EE]'
                      }`}
                      title="Nghe giọng AI đọc câu gợi ý chuẩn bản xứ này"
                    >
                      <span>{isPlayingAlternativeAudio ? '🔊' : '🔈'}</span>
                      <span>{isPlayingAlternativeAudio ? 'Đang đọc...' : 'Nghe câu mẫu'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const textToCopy =
                          selectedMessage.linguisticFeedback?.naturalAlternative ||
                          selectedMessage.japaneseText;
                        void navigator.clipboard.writeText(textToCopy);
                        setCopiedFeedbackText(true);
                        setToastMessage('📋 Đã sao chép câu mẫu vào bộ nhớ tạm!');
                        setTimeout(() => {
                          setCopiedFeedbackText(false);
                          setToastMessage(null);
                        }, 2500);
                      }}
                      className={`inline-flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold shadow-2xs transition ${
                        copiedFeedbackText
                          ? 'bg-emerald-600 text-white'
                          : 'bg-[#0878EE] text-white hover:bg-[#0768D0]'
                      }`}
                      title="Sao chép câu bản xứ vào clipboard để ghi chú hoặc tra từ điển"
                    >
                      <span>{copiedFeedbackText ? '✓' : '📋'}</span>
                      <span>{copiedFeedbackText ? 'Đã sao chép' : 'Chép câu mẫu'}</span>
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex h-full flex-col items-center justify-center text-center text-xs text-[#71809A] py-12">
                  <span className="text-3xl mb-2">💬</span>
                  <p className="font-semibold text-[#071A44]">Chưa chọn lượt nói</p>
                  <p className="mt-1 max-w-[220px]">
                    Nhấp vào một câu nói bất kỳ của bạn trong dòng chat để xem đánh giá ngôn ngữ chi tiết.
                  </p>
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* Nút Dock mở rộng Cột Phải khi đang bị thu gọn */}
        <button
          type="button"
          onClick={() => setIsRightOpen(true)}
          className={`absolute top-4 right-0 z-30 flex items-center gap-2 rounded-l-xl border border-r-0 border-[#0878EE]/30 bg-white px-3 py-2.5 text-xs font-bold text-[#0878EE] shadow-md hover:bg-[#EAF4FF] hover:pl-4 transition-all duration-300 ease-in-out ${
            !isRightOpen && selectedMessage?.linguisticFeedback
              ? 'translate-x-0 opacity-100 pointer-events-auto'
              : 'translate-x-full opacity-0 pointer-events-none'
          }`}
          title="Mở rộng bảng đánh giá lượt nói"
        >
          <span>◀</span>
          <span>Đánh giá</span>
          <span>🔍</span>
        </button>
      </div>

      {/* ============================================================ */}
      {/* 4. MODAL XÁC NHẬN KẾT THÚC PHIÊN                             */}
      {/* ============================================================ */}
      {showEndModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-fade-in">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-xl text-lg ${
                  isAllMissionsCompleted
                    ? 'bg-emerald-100 text-emerald-600'
                    : 'bg-amber-100 text-amber-600'
                }`}
              >
                {isAllMissionsCompleted ? '🎉' : '⚠️'}
              </div>
              <div>
                <h3 className="text-base font-bold text-[#071A44]">
                  {isAllMissionsCompleted ? 'Hoàn thành phiên luyện tập' : 'Kết thúc phiên sớm?'}
                </h3>
                <p className="text-xs text-[#71809A]">
                  Kịch bản: {session.scenarioTitle} (JLPT {session.level || session.jlptLevel})
                </p>
              </div>
            </div>

            <div className="rounded-xl bg-[#F8FAFC] p-3 text-xs space-y-1.5 border border-[#E6EDF5]">
              <div className="flex justify-between">
                <span className="text-[#71809A]">Tiến độ nhiệm vụ:</span>
                <span className="font-bold text-[#0878EE]">
                  {completedMissionsCount} / {totalMissionsCount} hoàn thành
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#71809A]">Số lượt hội thoại:</span>
                <span className="font-medium text-[#071A44]">{session.messages.length} lượt</span>
              </div>
              {session.isNaturallyConcluded ? (
                <p className="mt-2 text-emerald-700 font-semibold text-[11px]">
                  ✨ Cuộc hội thoại đã kết thúc trọn vẹn và tự nhiên (+Điểm ấn tượng)!
                </p>
              ) : isAllMissionsCompleted ? (
                <p className="mt-2 text-emerald-700 font-semibold text-[11px]">
                  ✓ Bạn đã hoàn thành 100% nhiệm vụ! Có thể nói lời chào tạm biệt để cộng thêm điểm ấn tượng hoặc hoàn thành ngay.
                </p>
              ) : null}
            </div>

            <p className="text-xs text-[#71809A] leading-relaxed">
              {isAllMissionsCompleted
                ? 'Bạn đã hoàn thành đầy đủ các nhiệm vụ của kịch bản. Bấm "Xác nhận kết thúc" để lưu kết quả và xem đánh giá tổng kết.'
                : isAdmin
                ? 'Nếu bạn kết thúc sớm, phiên kiểm thử kịch bản sẽ dừng lại tại đây và chuyển sang trang kết quả đánh giá.'
                : 'Nếu bạn kết thúc sớm khi chưa hoàn thành hết nhiệm vụ, phiên luyện tập sẽ dừng lại tại đây và credit đã trừ sẽ không được hoàn trả.'}
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowEndModal(false)}
                disabled={isEnding}
                className="rounded-xl border border-[#E6EDF5] bg-white px-4 py-2 text-xs font-semibold text-[#71809A] hover:bg-[#F8FAFC]"
              >
                Tiếp tục nói chuyện
              </button>
              <button
                type="button"
                onClick={handleConfirmEnd}
                disabled={isEnding}
                className={`rounded-xl px-5 py-2 text-xs font-bold text-white transition ${
                  isAllMissionsCompleted
                    ? 'bg-emerald-600 hover:bg-emerald-700 shadow-sm'
                    : 'bg-red-600 hover:bg-red-700 shadow-sm'
                }`}
              >
                {isEnding ? 'Đang kết thúc...' : 'Xác nhận kết thúc'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 5. MODAL XÁC NHẬN TẠM DỪNG VÀ RỜI PHÒNG                      */}
      {/* ============================================================ */}
      {showLeaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-fade-in">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl text-lg bg-blue-100 text-[#0878EE]">
                🚪
              </div>
              <div>
                <h3 className="text-base font-bold text-[#071A44]">Tạm dừng phiên luyện tập?</h3>
                <p className="text-xs text-[#71809A]">
                  Kịch bản: {session?.scenarioTitle} (JLPT {session?.level || session?.jlptLevel})
                </p>
              </div>
            </div>

            <div className="rounded-xl bg-[#F8FAFC] p-3 text-xs space-y-1.5 border border-[#E6EDF5]">
              <div className="flex justify-between">
                <span className="text-[#71809A]">Tiến độ hiện tại:</span>
                <span className="font-bold text-[#0878EE]">
                  {completedMissionsCount} / {totalMissionsCount} nhiệm vụ đã xong
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#71809A]">Số lượt đã nói:</span>
                <span className="font-medium text-[#071A44]">{session?.messages.length ?? 0} lượt</span>
              </div>
            </div>

            <p className="text-xs text-[#71809A] leading-relaxed">
              Tiến độ bài học và toàn bộ hội thoại của bạn đã được <strong>tự động lưu</strong>. Bạn có thể quay lại tiếp tục luyện tập bất cứ lúc nào từ trang kịch bản mà không bị mất dữ liệu.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowLeaveModal(false)}
                className="rounded-xl border border-[#E6EDF5] bg-white px-4 py-2 text-xs font-semibold text-[#71809A] hover:bg-[#F8FAFC] transition"
              >
                Ở lại luyện tiếp
              </button>
              <button
                type="button"
                onClick={handleConfirmLeave}
                className="rounded-xl bg-[#0878EE] px-4 py-2 text-xs font-bold text-white hover:bg-[#0768D0] shadow-sm transition"
              >
                Tạm dừng & Rời phòng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 6. MODAL CÀI ĐẶT GIỌNG ĐỌC AI (VOICEVOX)                     */}
      {/* ============================================================ */}
      <AiVoiceSettingsModal
        isOpen={isVoiceModalOpen}
        onClose={() => setIsVoiceModalOpen(false)}
        selectedVoiceId={selectedVoiceId}
        recommendedVoiceId={session?.recommendedAiVoiceId}
        availableVoices={availableVoices}
        onSave={(newVoiceId) => {
          setSelectedVoiceId(newVoiceId);
          localStorage.setItem('jcap_voicevox_selected_id', newVoiceId.toString());
          setIsVoiceModalOpen(false);
          setToastMessage('Đã cập nhật giọng đọc AI thành công!');
          setTimeout(() => setToastMessage(null), 3000);
        }}
      />

      {/* ============================================================ */}
      {/* 7. HANKO EKI-STAMP CELEBRATION OVERLAY                      */}
      {/* ============================================================ */}
      {session && (
        <EkiStampOverlay
          isOpen={isEkiStampOpen}
          scenarioTitle={session.scenarioTitle}
          averageScore={averageScore}
          completedMissionsCount={completedMissionsCount}
          totalMissionsCount={totalMissionsCount}
          isExploreMode={Boolean(returnUrl)}
          onReviewSummary={() => {
            setIsEkiStampOpen(false);
            void handleConfirmEnd();
          }}
          onRestart={() => {
            setIsEkiStampOpen(false);
            void handleRestartSession();
          }}
          onExit={() => {
            setIsEkiStampOpen(false);
            handleConfirmLeave();
          }}
        />
      )}
    </div>
  );
};
