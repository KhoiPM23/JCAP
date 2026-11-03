import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, Link, useSearchParams } from 'react-router-dom';
import { roleplayService } from '../services/roleplayService';
import { roleplayResultService } from '../services/roleplayResultService';
import { scenarioVoiceService } from '../services/scenarioVoiceService';
import { flashcardService } from '../services/flashcardService';
import { voicevoxService, type VoiceOption } from '../services/voicevoxService';
import { AiVoiceSettingsModal } from '../components/shadowing/AiVoiceSettingsModal';
import { AudioWaveformPlayer } from '../components/common/AudioWaveformPlayer';
import { LivingAvatar, type AvatarState, type MouthViseme } from '../components/roleplay/LivingAvatar';
import { EkiStampOverlay } from '../components/roleplay/EkiStampOverlay';
import { GraduatedHintCard } from '../components/roleplay/GraduatedHintCard';
import { TypewriterText } from '../components/roleplay/TypewriterText';
import { sanitizeDisplayJapanese, containsJapanese, extractJapaneseKeywords, deriveJapaneseCloze, isWhisperHallucination } from '../utils/japaneseSanitizer';
import { ukiyoSound, detectScenarioTheme, type AmbientTheme } from '../utils/ukiyoSoundEngine';
import { useAuth } from '../contexts/AuthContext';
import {
  FlameIcon,
  TargetIcon,
  TrophyIcon,
  FlowerIcon,
  MicIcon,
  VolumeIcon,
  SparkIcon,
  ListTodoIcon,
  BarChartIcon,
  SettingsIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  XCircleIcon,
  RefreshIcon,
  PhoneCallIcon,
  HandIcon,
  CoinsIcon,
  BookmarkIcon,
  SearchIcon,
  ArrowRightIcon,
  LightbulbIcon,
} from '../components/common/Icons';
import type {
  RoleplaySessionDetailsDto,
  RoleplayMessageDto,
  RoleplayMissionDto,
  RoleplayHintDto,
  LinguisticFeedbackDto,
} from '../types/roleplay';


import { countJapaneseMora } from '../utils/moraPhonetics.ts';
export { countJapaneseMora };


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
  const [recordingDurationSec, setRecordingDurationSec] = useState<number>(0);
  const [appliedHintTier, setAppliedHintTier] = useState<number | null>(null);
  const [celebratingMission, setCelebratingMission] = useState<{
    title: string;
    count: number;
    total: number;
    isAll: boolean;
  } | null>(null);
  const prevCompletedMissionIdsRef = useRef<Set<string | number>>(new Set());

  useEffect(() => {
    let interval: any = null;
    let autoStopTimeout: any = null;
    if (isRecordingMic) {
      const start = Date.now();
      setRecordingDurationSec(0);
      interval = setInterval(() => {
        setRecordingDurationSec(Number(((Date.now() - start) / 1000).toFixed(1)));
      }, 100);
      // Giới hạn 12s tự động chốt và chuyển sang Whisper để người học không phải đợi lâu
      autoStopTimeout = setTimeout(() => {
        if (isRecordingMicRef.current) {
          void stopSpeechRecognition();
        }
      }, 12000);
    } else {
      setRecordingDurationSec(0);
    }
    return () => {
      if (interval) clearInterval(interval);
      if (autoStopTimeout) clearTimeout(autoStopTimeout);
    };
  }, [isRecordingMic]);


  // Chế độ Đàm thoại Rảnh tay 2 chiều liên tục (Mặc định: BẬT - tự động nghe sau khi AI nói, có guard chống gửi lặp)
  const [isHandsFreeMode, setIsHandsFreeMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    try {
      const saved = window.localStorage.getItem('jcap_hands_free_mode');
      return saved === null ? true : saved === 'true';
    } catch {
      return true;
    }
  });
  const isHandsFreeModeRef = useRef(isHandsFreeMode);
  useEffect(() => {
    isHandsFreeModeRef.current = isHandsFreeMode;
    try {
      window.localStorage.setItem('jcap_hands_free_mode', String(isHandsFreeMode));
    } catch {}
  }, [isHandsFreeMode]);
  const handsFreeAutoListenTimeoutRef = useRef<any>(null);
  const isPlayingAiSpeechRef = useRef(false);
  useEffect(() => {
    isPlayingAiSpeechRef.current = isPlayingAiSpeech;
  }, [isPlayingAiSpeech]);
  const isSendingRef = useRef(false);
  const sessionConcludedRef = useRef(false);
  useEffect(() => {
    sessionConcludedRef.current = Boolean(
      session?.isNaturallyConcluded ||
      (session?.missions && session.missions.length > 0 && session.missions.every((m: any) => m.isCompleted))
    );
  }, [session]);
  const latestTranscriptRef = useRef('');
  const [quickReflexPrompt, setQuickReflexPrompt] = useState<string | null>(null);
  const [isBowing, setIsBowing] = useState(false);
  const hesitationTimerRef = useRef<any>(null);
  const deadlockTimerRef = useRef<any>(null);
  const overloadTimerRef = useRef<any>(null);
  const [encouragementMessage, setEncouragementMessage] = useState<string | null>(null);
  const [isContextBannerExpanded, setIsContextBannerExpanded] = useState(false);
  const [isLeftOpen, setIsLeftOpen] = useState(false); // Cột Trái (Nhiệm vụ & Cheat Sheet)
  const [isRightOpen, setIsRightOpen] = useState(false); // Cột Phải (Chi tiết Đánh giá - mặc định đóng để giữ không gian chat rộng rãi, mở khi bấm tin nhắn hoặc nút Đánh giá)


  // Cấu hình giọng đọc AI & Giọng đọc mẫu của người học (VOICEVOX)
  const [selectedVoiceId, setSelectedVoiceId] = useState<number>(() => scenarioVoiceService.getSelectedVoiceId());
  const [learnerVoiceId, setLearnerVoiceId] = useState<number>(2); // Giọng phát âm mẫu chuẩn (Mặc định: Shikoku Metan - ID 2)


  // Kiểm tra trạng thái Whisper STT Engine & Lazy prefetch âm thanh mẫu vào IndexedDB/RAM
  useEffect(() => {
    // Luôn reset availability để chắc chắn VOICEVOX được thử lại ngay khi vào phòng
    voicevoxService.resetAvailability();


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
  const proactiveDismissedTurnRef = useRef<number>(-1);


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
  useEffect(() => {
    isSendingRef.current = isSending;
  }, [isSending]);
  const [selectedMessageId, setSelectedMessageId] = useState<number | null>(null);
  // Theo dõi ID của tin nhắn AI mới nhất đang chạy hiệu ứng máy đánh chữ mượt mà (Claude style)
  const [streamingAiMessageId, setStreamingAiMessageId] = useState<number | null>(null);


  // Gợi ý Hint
  const [hint, setHint] = useState<RoleplayHintDto | null>(null);
  const [isLoadingHint, setIsLoadingHint] = useState(false);


  // Cơ chế độc quyền hỗ trợ (Mutual Exclusion): Chỉ hiển thị DUY NHẤT 1 gợi ý tại 1 thời điểm
  const clearAllAssistance = useCallback(() => {
    if (hesitationTimerRef.current) clearTimeout(hesitationTimerRef.current);
    if (deadlockTimerRef.current) clearTimeout(deadlockTimerRef.current);
    if (overloadTimerRef.current) clearTimeout(overloadTimerRef.current);
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    setHint(null);
    setQuickReflexPrompt(null);
    setEncouragementMessage(null);
    setShowProactiveHint(false);
  }, []);


  const setSingleAssistance = useCallback(
    (type: 'hint' | 'quickReflex' | 'encouragement' | 'proactive', payload?: any) => {
      setHint(type === 'hint' ? payload : null);
      setQuickReflexPrompt(type === 'quickReflex' ? payload : null);
      setEncouragementMessage(type === 'encouragement' ? payload : null);
      setShowProactiveHint(type === 'proactive');
    },
    []
  );


  // Modal kết thúc & Modal rời phòng
  const [showEndModal, setShowEndModal] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [isEnding, setIsEnding] = useState(false);


  // Toast notification & Flashcard Bookmark Integration
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [practiceBookmarkedVocabIds, setPracticeBookmarkedVocabIds] = useState<Set<number>>(new Set());
  const [practiceBookmarkedGrammarIds, setPracticeBookmarkedGrammarIds] = useState<Set<number>>(new Set());

  const handleToggleBookmark = async (
    type: 'Vocabulary' | 'Grammar',
    item: { id: number; text: string }
  ) => {
    const isVocab = type === 'Vocabulary';
    const isBookmarked = isVocab ? practiceBookmarkedVocabIds.has(item.id) : practiceBookmarkedGrammarIds.has(item.id);
    const setIds = isVocab ? setPracticeBookmarkedVocabIds : setPracticeBookmarkedGrammarIds;
    const itemLabel = isVocab ? 'từ vựng' : 'ngữ pháp';

    setIds((prev) => {
      const next = new Set(prev);
      if (isBookmarked) next.delete(item.id);
      else next.add(item.id);
      return next;
    });

    const res = await flashcardService.toggleBookmark(type, item.id);
    if (!res.success) {
      setIds((prev) => {
        const next = new Set(prev);
        if (isBookmarked) next.add(item.id);
        else next.delete(item.id);
        return next;
      });
      setToastMessage(res.message || `Không thể lưu ${itemLabel}.`);
    } else {
      const isSaved = res.data?.isBookmarked ?? !isBookmarked;
      if (isSaved) {
        ukiyoSound.playMigotoChime();
        setToastMessage(`✨ Đã lưu ${itemLabel} 「${item.text}」 vào Flashcard!`);
      } else {
        ukiyoSound.playSubtleTap();
        setToastMessage(`Đã bỏ lưu ${itemLabel} 「${item.text}」 khỏi Flashcard.`);
      }
    }
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleToggleCheatVocabBookmark = (v: { id: number; word: string }) =>
    handleToggleBookmark('Vocabulary', { id: v.id, text: v.word });

  const handleToggleCheatGrammarBookmark = (g: { id: number; pattern: string }) =>
    handleToggleBookmark('Grammar', { id: g.id, text: g.pattern });



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

  // Blind Mode (Thử thách phản xạ 10s & Khóa gợi ý Active Recall)
  const isBlindMode = searchParams.get('mode') === 'blind' || searchParams.get('blind') === 'true';
  const [sttNotice, setSttNotice] = useState<string | null>(null);
  const [reflexCountdown, setReflexCountdown] = useState<number | null>(null);

  // Game-like Floating Score Deduction Pill (-10đ Tự chủ, -30đ Tự chủ, etc.)
  const [floatingDeduction, setFloatingDeduction] = useState<{ text: string; id: number } | null>(null);

  const triggerFloatingDeduction = useCallback((tier: number) => {
    const penalty = tier === 1 ? 10 : tier === 2 ? 30 : 60;
    ukiyoSound.playSubtleTap();
    setFloatingDeduction({ text: `-${penalty}đ Tự chủ`, id: Date.now() });
    setTimeout(() => {
      setFloatingDeduction((prev) => (prev?.id ? null : prev));
    }, 1800);
  }, []);

  const [isLearnerUttering, setIsLearnerUttering] = useState(false);
  const learnerUtterTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const markLearnerUttering = useCallback(() => {
    setIsLearnerUttering(true);
    if (learnerUtterTimeoutRef.current) clearTimeout(learnerUtterTimeoutRef.current);
    learnerUtterTimeoutRef.current = setTimeout(() => {
      setIsLearnerUttering(false);
    }, 1800);
  }, []);

  useEffect(() => {
    // Chỉ kích hoạt đếm ngược 10s phản xạ trong Blind Mode, KHI AI ĐÃ DỨT LỜI NÓI và đang đợi người học
    if (!isBlindMode || isPlayingAiSpeech || isSending || sessionConcludedRef.current || !aiFinishedSpeakingAtRef.current) {
      setReflexCountdown(null);
      return;
    }

    setReflexCountdown(10);
    const interval = setInterval(() => {
      setReflexCountdown((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isBlindMode, isPlayingAiSpeech, isSending]);

  // Khi học viên đã thực sự cất tiếng nói hoặc gửi tin nhắn, dừng đếm ngược phản xạ
  useEffect(() => {
    if ((latestTranscriptRef.current && !isWhisperHallucination(latestTranscriptRef.current)) || (inputText && !isWhisperHallucination(inputText))) {
      setReflexCountdown(null);
    }
  }, [inputText]);


  // Adaptive Silence Ring state & timer
  const [silenceCountdownProgress, setSilenceCountdownProgress] = useState<number>(0);
  const silenceIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);


  // Taiko sound on room entry & cleanup ambient and recorded audio Blob on exit
  useEffect(() => {
    ukiyoSound.playTaikoThud();
    return () => {
      ukiyoSound.stopAmbientSound();
      if (lastRecordedAudioUrlRef.current) {
        URL.revokeObjectURL(lastRecordedAudioUrlRef.current);
        lastRecordedAudioUrlRef.current = null;
      }
    };
  }, []);


  // Viseme mouth sync for LivingAvatar during AI speech (Tự nhiên theo âm điệu mora tiếng Nhật)
  const [currentViseme, setCurrentViseme] = useState<MouthViseme>('closed');
  useEffect(() => {
    if (!isPlayingAiSpeech) {
      setCurrentViseme('closed');
      return;
    }
    // Chuỗi biến thiên khẩu hình tự nhiên theo nhịp phách tiếng Nhật: A -> I -> closed -> O -> E -> N -> A -> U
    const naturalVisemeSequence: MouthViseme[] = ['A', 'I', 'closed', 'O', 'E', 'A', 'N', 'U', 'I', 'closed'];
    let idx = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let isCancelled = false;


    const tick = () => {
      if (isCancelled) return;
      idx = (idx + 1) % naturalVisemeSequence.length;
      setCurrentViseme(naturalVisemeSequence[idx]);
      const nextDelay = 110 + (idx % 3) * 20;
      timer = setTimeout(tick, nextDelay);
    };


    timer = setTimeout(tick, 120);


    return () => {
      isCancelled = true;
      if (timer) clearTimeout(timer);
      setCurrentViseme('closed');
    };
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


  // Âm thanh chúc mừng Web Audio API singleton (Chime Migoto chuẩn JCAP qua ukiyoSoundEngine)
  const playMissionCompleteSound = () => {
    ukiyoSound.playMigotoChime();
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
    if (handsFreeFallbackTimerRef.current) {
      clearTimeout(handsFreeFallbackTimerRef.current);
      handsFreeFallbackTimerRef.current = null;
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
        // Lưu audio URL để học viên có thể nghe lại phát âm của chính mình (thu hồi blob cũ tránh rò rỉ bộ nhớ)
        if (lastRecordedAudioUrlRef.current && lastRecordedAudioUrlRef.current.startsWith('blob:')) {
          URL.revokeObjectURL(lastRecordedAudioUrlRef.current);
        }
        const recordedUrl = URL.createObjectURL(audioResult.blob);
        lastRecordedAudioUrlRef.current = recordedUrl;


        setIsProcessingStt(true);
        const whisperRes = await scenarioVoiceService.transcribeWithWhisper(audioResult.blob);
        if (whisperRes && whisperRes.text && whisperRes.text.trim()) {
          const rawText = whisperRes.text.trim();
          if (!isWhisperHallucination(rawText)) {
            // Chống tự điền đè lại vào ô nhập nếu câu nói đã được gửi đi rồi
            if (!isSendingRef.current) {
              setInputText(rawText);
              latestTranscriptRef.current = rawText;
              markLearnerUttering();
            }
            if (typeof whisperRes.confidence === 'number' && whisperRes.confidence > 0) {
              lastSpeechConfidenceRef.current = whisperRes.confidence;
            }
            if (whisperRes.audioUrl) {
              lastRecordedAudioUrlRef.current = whisperRes.audioUrl;
            }
          } else {
            console.warn('[Scenario STT] Bỏ qua ảo giác Whisper:', rawText);
          }
        } else {
          // Fallback: Lưu audio lên server để có link nghe lại vĩnh viễn
          void scenarioVoiceService.saveLearnerAudio(audioResult.blob).then((serverUrl) => {
            if (serverUrl) {
              lastRecordedAudioUrlRef.current = serverUrl;
            }
          });
          // Nếu cả Web Speech lẫn Whisper đều chưa bắt được từ nào
          if (!inputText.trim() && !latestTranscriptRef.current) {
            setToastMessage('Chưa nhận diện được giọng nói. Hãy nói to, rõ ràng bằng tiếng Nhật (VD: こんにちは, すみません) hoặc kiểm tra micro.');
            setTimeout(() => setToastMessage(null), 4500);
          }
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
    return session?.recommendedAiVoiceId || selectedVoiceId;
  };


  // Cờ đánh dấu AI đã đệm lời trong lượt chờ hiện tại chưa (tránh nói lặp lại nhiều lần)
  const hasSpokenVocalFillerRef = useRef(false);
  const handsFreeFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Câu đệm tình huống nhẹ nhàng khi học viên ngập ngừng hoặc im lặng quá lâu
  const getSituationalVocalFiller = useCallback((): string => {
    const combined = `${session?.scenarioTitle || ''} ${session?.aiPersona || ''} ${session?.scenarioContext || ''}`.toLowerCase();
    const lastAiMsg = session?.messages?.filter((m) => m.sender === 'AI').slice(-1)[0]?.japaneseText || '';

    if (/cafe|quán cafe|cà phê|tiệm|quán ăn|nhà hàng|ramen|ラーメン|combini|bán hàng|store|shop|barista|バリスタ|店長/.test(combined)) {
      if (/アレルギー|食材|変更|抜き/.test(lastAiMsg)) {
        return 'アレルギーや苦手な食材など、何でもお気軽に仰ってくださいね。';
      }
      if (/決まり|注文|いらっしゃい|おすすめ/.test(lastAiMsg)) {
        const fillers = [
          'どうぞ、メニューをゆっくりご覧になってお決めくださいね。',
          '何かおすすめやご不明な点はございますか？',
          'ごゆっくりで大丈夫ですよ。お決まりでしたらお呼びください。',
        ];
        return fillers[Math.floor(Math.random() * fillers.length)];
      }
      return 'どうぞ、ごゆっくりお選びください。';
    }
    if (/bác sĩ|khám bệnh|phòng khám|y tế|bệnh viện|clinic|doctor|病院/.test(combined)) {
      return '無理をなさらず、ゆっくりお話しくださいね。大丈夫ですよ。';
    }
    if (/phỏng vấn|xin việc|interview|công ty|sếp|面接|取引先|ビジネス/.test(combined)) {
      const interviewFillers = [
        '焦らなくて大丈夫ですよ。ご自身のペースでお話しください。',
        'どうぞ、緊張なさらずにリラックスしてくださいね。',
      ];
      return interviewFillers[Math.floor(Math.random() * interviewFillers.length)];
    }
    return '大丈夫ですか？ごゆっくりでいいですよ。';
  }, [session?.scenarioTitle, session?.aiPersona, session?.scenarioContext, session?.messages]);

  // Phát âm thanh giọng nói AI (VOICEVOX / Web Speech fallback) - Tích hợp DDA speedScale thích ứng ngầm
  const handlePlayMessageAudio = (
    messageId: number,
    text: string,
    customSpeedScale?: number,
    onAudioStarted?: () => void,
    voiceIdOverride?: number
  ) => {
    // Luôn đảm bảo ngắt micro trước khi phát âm thanh để tránh dội âm thanh AI vào mic
    stopSpeechRecognition();


    if (playingMessageId === messageId && isPlayingAiSpeech) {
      scenarioVoiceService.stopAllAudio();
      setIsPlayingAiSpeech(false);
      setPlayingMessageId(null);
      return;
    }


    setPlayingMessageId(messageId);


    const voiceToUse = voiceIdOverride ?? getSpeakerVoiceId(text);
    const effectiveRate = typeof customSpeedScale === 'number' && customSpeedScale > 0
      ? Number((speechRate * customSpeedScale).toFixed(2))
      : speechRate;


    void scenarioVoiceService.playAiSpeech(
      text,
      voiceToUse,
      () => {
        setIsPlayingAiSpeech(false);
        setPlayingMessageId(null);
        setCurrentViseme('closed');
        aiFinishedSpeakingAtRef.current = Date.now();
        // Tự động mở micro đón câu trả lời sau khi AI kết thúc lượt nói (320ms khoảng nghỉ)
        if (isHandsFreeModeRef.current && !sessionConcludedRef.current && !isSendingRef.current) {
          if (handsFreeAutoListenTimeoutRef.current) {
            clearTimeout(handsFreeAutoListenTimeoutRef.current);
          }
          handsFreeAutoListenTimeoutRef.current = setTimeout(() => {
            if (!isRecordingMicRef.current && !isPlayingAiSpeechRef.current) {
              startSpeechRecognition();
            }
          }, 320);


          // GIÀN GIÁO THÍCH ỨNG: Chờ người học phản hồi tự nhiên (AI đệm lời nhẹ nhàng nếu chờ quá 10s)
          if (deadlockTimerRef.current) clearTimeout(deadlockTimerRef.current);
          deadlockTimerRef.current = setTimeout(() => {
            if (isHandsFreeModeRef.current && !isSendingRef.current && !sessionConcludedRef.current) {
              setShowProactiveHint(true);
              if (!hasSpokenVocalFillerRef.current && !isPlayingAiSpeechRef.current) {
                hasSpokenVocalFillerRef.current = true;
                // Tạm dừng micro và đánh dấu AI đang nói để tránh âm thanh đệm dội ngược vào micro
                stopSpeechRecognition();
                setIsPlayingAiSpeech(true);
                const filler = getSituationalVocalFiller();
                const voiceId = session?.recommendedAiVoiceId || selectedVoiceId;
                void scenarioVoiceService.playAiSpeech(
                  filler,
                  voiceId,
                  () => {
                    setIsPlayingAiSpeech(false);
                    if (isHandsFreeModeRef.current && !sessionConcludedRef.current && !isSendingRef.current) {
                      setTimeout(() => {
                        if (!isRecordingMicRef.current && !isPlayingAiSpeechRef.current) {
                          startSpeechRecognition();
                        }
                      }, 320);
                    }
                  },
                  effectiveRate,
                  () => {
                    setIsPlayingAiSpeech(true);
                  }
                );
              }
            }
          }, 10000);
        }
      },
      effectiveRate,
      () => {
        // onStart: Khi âm thanh VOICEVOX THỰC SỰ vang lên từ loa
        setIsPlayingAiSpeech(true);
        onAudioStarted?.();
      },
      (viseme) => {
        setCurrentViseme(viseme);
      }
    );
  };


  // Active Recall: Luyện nói lại một lượt hội thoại bất kỳ (thay thế lượt nói hiện tại)
  const handleRedoTurn = (targetMessageId?: number) => {
    stopSpeechRecognition();
    scenarioVoiceService.stopAllAudio();
    setIsPlayingAiSpeech(false);
    setPlayingMessageId(null);
    clearAllAssistance();
    hasSpokenVocalFillerRef.current = false;

    // Roll back lượt thoại được chọn (hoặc gần nhất) khỏi session.messages để thay thế thay vì bồi thêm lượt mới
    setSession((prev) => {
      if (!prev || prev.messages.length === 0) return prev;
      const msgs = [...prev.messages];
      let targetIdx = -1;
      if (typeof targetMessageId === 'number') {
        targetIdx = msgs.findIndex((m) => m.id === targetMessageId);
      }
      if (targetIdx === -1) {
        for (let i = msgs.length - 1; i >= 0; i--) {
          if (msgs[i].sender === 'User') {
            targetIdx = i;
            break;
          }
        }
      }
      if (targetIdx !== -1) {
        return {
          ...prev,
          messages: msgs.slice(0, targetIdx),
        };
      }
      return prev;
    });

    latestTranscriptRef.current = '';
    setInputText('');
    retryCountRef.current += 1;
    ukiyoSound.playSubtleTap();
    setToastMessage('Đang mở micro để nói lại lượt này...');
    setTimeout(() => setToastMessage(null), 2500);
    setTimeout(() => {
      startSpeechRecognition();
    }, 250);
  };


  // Nâng cấp diễn đạt tự nhiên chuẩn bản xứ (Upgrade Phrasing)
  const handleUpgradePhrasing = (naturalText: string) => {
    stopSpeechRecognition();
    scenarioVoiceService.stopAllAudio();
    setIsPlayingAiSpeech(false);
    setPlayingMessageId(null);
    setInputText(naturalText);
    retryCountRef.current += 1;
    ukiyoSound.playMigotoChime();
    handlePlayLearnerSample(naturalText);
  };


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
          handlePlayMessageAudio(openingAiMsg.id, openingAiMsg.japaneseText, undefined, undefined, res.data.recommendedAiVoiceId || undefined);
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


  // Quản lý đồng hồ im lặng để AI chủ động gợi ý (Proactive Idle Assist - cho chế độ bấm nói thủ công)
  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }


    // Chỉ đếm ngược khi AI không nói, người học không gõ/nói, kịch bản chưa kết thúc, chưa mở hint, và không ở chế độ Rảnh tay
    if (proactiveDismissedTurnRef.current === session?.messages.length) return;
    if (!isHandsFreeMode && !isSending && !isPlayingAiSpeech && !session?.isNaturallyConcluded && !hint) {
      idleTimerRef.current = setTimeout(() => {
        setShowProactiveHint(true);
        if (!hasSpokenVocalFillerRef.current && !isPlayingAiSpeechRef.current) {
          hasSpokenVocalFillerRef.current = true;
          const filler = getSituationalVocalFiller();
          const voiceId = session?.recommendedAiVoiceId || selectedVoiceId;
          void scenarioVoiceService.playAiSpeech(filler, voiceId);
        }
      }, 12000); // Sau 12s không có hoạt động ở chế độ thủ công -> AI nhẹ nhàng đệm lời và hiện banner nhắc
    }
  }, [isHandsFreeMode, isSending, isPlayingAiSpeech, session?.isNaturallyConcluded, hint]);


  useEffect(() => {
    // Không restart timer khi banner đang hiển thị — tránh vòng lặp:
    // showProactiveHint=true -> re-render -> effect chạy -> resetIdleTimer -> timer kích hoạt -> showProactiveHint=true -> ...
    if (showProactiveHint) return;
    resetIdleTimer();
    return () => {
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
      }
    };
  }, [session?.messages.length, isSending, isPlayingAiSpeech, showProactiveHint, resetIdleTimer]);


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


  // Giờ sinh học (Circadian) theo giờ thực tế Việt Nam (UTC+7)
  const circadianInfo = useMemo(() => {
    const hour = (new Date().getUTCHours() + 7) % 24;
    if (hour >= 5 && hour < 11) {
      return {
        label: 'Ban mai',
        subtext: '朝 (Asa)',
        badgeClass: 'bg-[var(--sora-soft)] text-[var(--warning)] border-[var(--warning)]/30',
        stageGradient: 'bg-gradient-to-r from-[var(--sora-soft)] via-[var(--paper-50)] to-[var(--ai-soft)]',
        icon: '',
      };
    }
    if (hour >= 11 && hour < 18) {
      return {
        label: 'Ban trưa & chiều',
        subtext: '昼 (Hiru)',
        badgeClass: 'bg-[var(--ai-soft)] text-[var(--ai)] border-[var(--ai)]/30',
        stageGradient: 'bg-gradient-to-r from-[var(--ai-soft)] via-[var(--paper-50)] to-[var(--paper-100)]',
        icon: '',
      };
    }
    return {
      label: 'Đêm muộn',
      subtext: '夜 (Yoru)',
      badgeClass: 'bg-[var(--paper-200)] text-[var(--sumi)] border-[var(--line-strong)]',
      stageGradient: 'bg-gradient-to-r from-[var(--paper-200)] via-[var(--sora-soft)] to-[var(--ai-soft)]',
      icon: '',
    };
  }, []);


  // --- DỮ LIỆU ĐỘNG CHO SÂN KHẤU ĐIỆN ẢNH TƯƠNG TÁC (ADAPTIVE CINEMA STAGE) ---
  const activeMissionIndex = useMemo(() => {
    if (!session?.missions) return -1;
    return session.missions.findIndex((m) => !m.isCompleted);
  }, [session?.missions]);


  const activeMission = useMemo(() => {
    if (!session?.missions || activeMissionIndex === -1) return null;
    return session.missions[activeMissionIndex];
  }, [session?.missions, activeMissionIndex]);


  const latestAiMessage = useMemo(() => {
    if (!session?.messages || session.messages.length === 0) return null;
    for (let i = session.messages.length - 1; i >= 0; i--) {
      if (session.messages[i].sender === 'Ai') return session.messages[i];
    }
    return null;
  }, [session?.messages]);


  const latestUserMessage = useMemo(() => {
    if (!session?.messages || session.messages.length === 0) return null;
    for (let i = session.messages.length - 1; i >= 0; i--) {
      if (session.messages[i].sender !== 'Ai') return session.messages[i];
    }
    return null;
  }, [session?.messages]);


  // Tự động sinh Đạo cụ Ngôn ngữ Bối cảnh (Tangible Countertop Props) thích ứng 100% mọi kịch bản trong dự án
  const dynamicStageProps = useMemo(() => {
    if (!session) return [];
    const theme = detectScenarioTheme(session.scenarioTitle, session.aiPersona);


    const inferIcon = (jp: string, vi: string): string => {
      const combined = `${jp} ${vi}`.toLowerCase();
      if (/カード|現金|支払|会計|円|いくら|thẻ|tiền|thanh toán|giá/.test(combined)) return '💳';
      if (/味玉|玉子|卵|トッピング|チャーシュー|ねぎ|trứng|topping|thêm/.test(combined)) return '🥚';
      if (/麺|ラーメン|スープ|硬|濃|うどん|そば|mì|nước dùng|sợi|món/.test(combined)) return '🍜';
      if (/コーヒー|水|お茶|抹茶|ビール|ドリンク|nước|trà|cà phê|uống/.test(combined)) return '🍵';
      if (/切符|駅|電車|新幹線|ホーム|乗|改札|空港|vé|tàu|ga|sân bay|chuyến/.test(combined)) return '🎫';
      if (/荷物|宅配便|スーツケース|送|箱|hành lý|bưu phẩm|gửi hàng|gói hàng/.test(combined)) return '📦';
      if (/時間|時|明日|今日|予約|シフト|午前|午後|giờ|hẹn|lịch|ca làm/.test(combined)) return '🕒';
      if (/仕事|面接|経験|志望|御社|会社|バイト|phỏng vấn|công ty|kinh nghiệm|ứng tuyển/.test(combined)) return '💼';
      if (/薬|痛|熱|病院|アレルギー|症状|thuốc|đau|dị ứng|bệnh|khám/.test(combined)) return '💊';
      if (/コピー|マルチ|チケット|袋|温め|弁当|máy in|túi|hâm nóng|cơm hộp/.test(combined)) return '🏪';
      if (/部屋|チェックイン|鍵|温泉|予約|phòng|khách sạn|suối nước nóng/.test(combined)) return '🔑';
      switch (theme) {
        case 'ramen': return '';
        case 'cafe': return '☕';
        case 'konbini': return '';
        case 'train': return '';
        case 'office': return '';
        case 'zen': return '';
        default: return '';
      }
    };


    const buildNaturalPhrase = (word: string): string => {
      const clean = sanitizeDisplayJapanese(word);
      if (!clean) return 'はい、お願いします。';
      // Nếu đã là một câu hoàn chỉnh hoặc cụm dài
      if (clean.length > 9 || /[。！？ますですか]$/.test(clean)) {
        return clean.endsWith('。') || clean.endsWith('？') || clean.endsWith('！') ? clean : `${clean}。`;
      }
      // Kiểm tra xem trong ngữ pháp mục tiêu có câu ví dụ chứa từ này không
      const matchingGrammar = session.targetGrammars?.find(
        (g) => g.exampleSentence && g.exampleSentence.includes(clean) && containsJapanese(g.exampleSentence)
      );
      if (matchingGrammar?.exampleSentence) {
        return sanitizeDisplayJapanese(matchingGrammar.exampleSentence);
      }
      if (theme === 'office') {
        return `${clean}についてお話しします。`;
      }
      if (theme === 'train') {
        return `すみません、${clean}はどこですか？`;
      }
      return `すみません、${clean}をお願いします。`;
    };


    const propsList: Array<{
      id: string;
      icon: string;
      labelJp: string;
      reading?: string;
      meaningVi: string;
      actionSentenceJp: string;
      isHighlight?: boolean;
    }> = [];
    const seenJp = new Set<string>();


    // 1. Nếu nhiệm vụ hiện tại có chứa từ tiếng Nhật (ví dụ trong ngoặc như 味玉), ưu tiên đưa lên đầu làm đạo cụ nhiệm vụ!
    if (activeMission) {
      const missionJpMatches = (`${activeMission.content} ${activeMission.target || ''}`).match(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]{2,}/g);
      if (missionJpMatches) {
        for (const kw of missionJpMatches.slice(0, 2)) {
          if (!seenJp.has(kw)) {
            seenJp.add(kw);
            propsList.push({
              id: `mission-kw-${kw}`,
              icon: '',
              labelJp: kw,
              meaningVi: activeMission.content.length > 28 ? activeMission.content.slice(0, 28) + '…' : activeMission.content,
              actionSentenceJp: buildNaturalPhrase(kw),
              isHighlight: true,
            });
          }
        }
      }
    }


    // 2. Từ vựng mục tiêu của kịch bản (targetVocabularies)
    if (session.targetVocabularies && session.targetVocabularies.length > 0) {
      for (const v of session.targetVocabularies) {
        const cleanWord = sanitizeDisplayJapanese(v.word);
        if (cleanWord && containsJapanese(cleanWord) && !seenJp.has(cleanWord) && propsList.length < 4) {
          seenJp.add(cleanWord);
          propsList.push({
            id: `vocab-${v.id || cleanWord}`,
            icon: inferIcon(cleanWord, v.meaning || ''),
            labelJp: cleanWord,
            reading: v.reading,
            meaningVi: v.meaning || 'Từ vựng trọng tâm',
            actionSentenceJp: buildNaturalPhrase(cleanWord),
          });
        }
      }
    }


    // 3. Mẫu ngữ pháp mục tiêu của kịch bản (targetGrammars)
    if (session.targetGrammars && session.targetGrammars.length > 0 && propsList.length < 4) {
      for (const g of session.targetGrammars) {
        const cleanPattern = sanitizeDisplayJapanese(g.pattern.replace(/[〜~]/g, '').trim());
        const example = g.exampleSentence && containsJapanese(g.exampleSentence)
          ? sanitizeDisplayJapanese(g.exampleSentence)
          : buildNaturalPhrase(cleanPattern);
        if (cleanPattern && containsJapanese(cleanPattern) && !seenJp.has(cleanPattern) && propsList.length < 4) {
          seenJp.add(cleanPattern);
          propsList.push({
            id: `grammar-${g.id || cleanPattern}`,
            icon: '',
            labelJp: g.pattern,
            meaningVi: g.meaning || 'Mẫu câu mục tiêu',
            actionSentenceJp: example,
          });
        }
      }
    }


    // 4. Fallback thông minh theo bối cảnh nếu kịch bản chưa có từ vựng trong DB
    if (propsList.length < 3) {
      const themeFallbacks: Record<string, Array<{ icon: string; labelJp: string; meaningVi: string; actionSentenceJp: string }>> = {
        ramen: [
          { icon: '', labelJp: '麺を硬めで', meaningVi: 'Chọn mì sợi cứng', actionSentenceJp: 'すみません、麺を硬めでお願いします。' },
          { icon: '', labelJp: '味玉を追加', meaningVi: 'Thêm trứng lòng đào', actionSentenceJp: '味玉をトッピングでお願いします。' },
          { icon: '', labelJp: 'カードで支払う', meaningVi: 'Hỏi thanh toán thẻ', actionSentenceJp: 'カードで支払うことはできますか？' },
        ],
        konbini: [
          { icon: '', labelJp: '宅配便を送る', meaningVi: 'Gửi bưu phẩm', actionSentenceJp: 'すみません、宅配便をお願いします。' },
          { icon: '', labelJp: '午前の時間帯', meaningVi: 'Chọn khung giờ sáng', actionSentenceJp: '明日の午前中でお願いします。' },
          { icon: '', labelJp: 'コピー機の使い方', meaningVi: 'Hỏi cách dùng máy in', actionSentenceJp: 'マルチコピー機の使い方を教えていただけますか？' },
        ],
        train: [
          { icon: '', labelJp: '切符を買う', meaningVi: 'Mua vé tàu', actionSentenceJp: 'すみません、新宿までの切符をお願いします。' },
          { icon: '', labelJp: '乗り場を確認', meaningVi: 'Hỏi sân ga tàu chạy', actionSentenceJp: 'この電車は何番線から出ますか？' },
          { icon: '', labelJp: '次の発車時刻', meaningVi: 'Hỏi giờ tàu tiếp theo', actionSentenceJp: '次の電車は何時ですか？' },
        ],
        office: [
          { icon: '', labelJp: '自己紹介・経験', meaningVi: 'Chia sẻ kinh nghiệm', actionSentenceJp: 'これまでの経験についてお話しします。' },
          { icon: '', labelJp: 'シフトの希望', meaningVi: 'Nêu nguyện vọng ca làm', actionSentenceJp: '週に三日、夕方のシフトを希望しています。' },
          { icon: '', labelJp: '志望動機', meaningVi: 'Lý do ứng tuyển', actionSentenceJp: '御社のサービスに魅力を感じて応募いたしました。' },
        ],
        cafe: [
          { icon: '☕', labelJp: 'おすすめを聞く', meaningVi: 'Hỏi món gợi ý', actionSentenceJp: 'おすすめのメニューは何ですか？' },
          { icon: '', labelJp: 'ホットで注文', meaningVi: 'Gọi đồ uống nóng', actionSentenceJp: 'ホットコーヒーを一つお願いします。' },
          { icon: '', labelJp: 'お会計', meaningVi: 'Thanh toán hóa đơn', actionSentenceJp: 'すみません、お会計をお願いします。' },
        ],
        zen: [
          { icon: '', labelJp: '挨拶・お礼', meaningVi: 'Chào hỏi & Cảm ơn', actionSentenceJp: '本日はよろしくお願いいたします。' },
          { icon: '', labelJp: '予約の確認', meaningVi: 'Xác nhận đặt chỗ', actionSentenceJp: '予約したグエンと申します。' },
          { icon: '', labelJp: '質問する', meaningVi: 'Hỏi thêm thông tin', actionSentenceJp: '少しお伺いしてもよろしいでしょうか？' },
        ],
      };
      const fbList = themeFallbacks[theme] || themeFallbacks.zen;
      for (const fb of fbList) {
        if (!seenJp.has(fb.labelJp) && propsList.length < 4) {
          seenJp.add(fb.labelJp);
          propsList.push({
            id: `fb-${fb.labelJp}`,
            ...fb,
          });
        }
      }
    }


    // 5. Luôn đính kèm 1 đạo cụ Phản xạ Cứu nguy chuẩn Nhật (Nhờ nói lại / Giải thích lại)
    propsList.push({
      id: 'coping-repeat',
      icon: '',
      labelJp: 'もう一度お願いします',
      meaningVi: 'Nhờ nhắc lại lịch sự',
      actionSentenceJp: 'すみません、もう一度ゆっくりお願いできますか？',
    });


    return propsList.slice(0, 5);
  }, [session, activeMission]);


  // Ojigi cúi chào mở đầu kịch bản & khi hoàn thành nhiệm vụ
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsBowing(true);
      setTimeout(() => setIsBowing(false), 1400);
    }, 700);
    return () => clearTimeout(timer);
  }, [sessionId]);


  const prevCompletedCountRef = useRef(0);
  useEffect(() => {
    if (!session?.missions) return;
    const completedList = session.missions.filter((m) => m.isCompleted);
    const newCompletedCount = completedList.length;

    if (newCompletedCount > prevCompletedCountRef.current && prevCompletedCountRef.current > 0) {
      // Xác định nhiệm vụ vừa mới được đánh dấu hoàn thành
      const newlyFinished = completedList.find((m) => !prevCompletedMissionIdsRef.current.has(m.id || m.content));
      const missionTitle = newlyFinished?.content || newlyFinished?.target || 'Mục tiêu hội thoại';
      const isAll = newCompletedCount >= (session.missions?.length || 0);

      setCelebratingMission({
        title: missionTitle,
        count: newCompletedCount,
        total: session.missions.length,
        isAll,
      });

      setIsBowing(true);
      if (isAll) {
        ukiyoSound.playTaikoThud();
        setTimeout(() => ukiyoSound.playMigotoChime(), 300);
      } else {
        ukiyoSound.playMigotoChime();
      }
      setTimeout(() => setIsBowing(false), 1600);

      // Tự động đóng banner vinh danh sau 3.8s
      const timer = setTimeout(() => {
        setCelebratingMission(null);
      }, 3800);
      return () => clearTimeout(timer);
    }

    prevCompletedCountRef.current = newCompletedCount;
    prevCompletedMissionIdsRef.current = new Set(completedList.map((m) => m.id || m.content));
  }, [completedMissionsCount, session?.missions]);

  // M2: Live Momentum (Thanh năng lượng / Phong độ hội thoại dựa trên các lượt nói gần nhất)
  const liveMomentum = useMemo(() => {
    if (!session?.messages) {
      return {
        level: 'starting',
        label: 'Khởi động ',
        detail: 'Bắt đầu cuộc trò chuyện',
        points: 0,
        badgeClass: 'bg-slate-100 text-slate-700 border border-slate-200',
      };
    }
    const userMsgs = session.messages.filter((m) => m.sender === 'User' && m.linguisticFeedback);
    if (userMsgs.length === 0) {
      return {
        level: 'starting',
        label: 'Khởi động ',
        detail: 'Hãy nói câu đầu tiên',
        points: 0,
        badgeClass: 'bg-slate-100 text-slate-700 border border-slate-200',
      };
    }

    const recent = userMsgs.slice(-4);
    let pts = 0;
    for (const msg of recent) {
      const fb = msg.linguisticFeedback;
      const status = getFeedbackStatus(fb);
      if (status === 'good') pts += 3;
      else if (status === 'warning') pts += 1;
      else if (status === 'error') pts = Math.max(0, pts - 1);

      if ((fb?.speechDelivery?.turnAutonomyScore ?? 100) >= 95) pts += 1;
      if ((fb?.speechDelivery?.turnFluencyScore ?? 0) >= 85) pts += 1;
    }

    if (pts >= 12) {
      return {
        level: 'peak',
        label: 'Phong độ đỉnh cao ',
        detail: 'Phản xạ chuẩn xác, tự chủ tuyệt đối!',
        points: pts,
        badgeClass: 'bg-gradient-to-r from-amber-400 via-orange-400 to-rose-400 text-slate-950 font-black shadow-xs ring-2 ring-amber-300 animate-pulse',
      };
    } else if (pts >= 7) {
      return {
        level: 'flowing',
        label: 'Đang vào nhịp ⚡',
        detail: 'Đối thoại rất lưu loát và tự nhiên',
        points: pts,
        badgeClass: 'bg-gradient-to-r from-sky-500 to-blue-600 text-white font-bold shadow-xs',
      };
    } else if (pts >= 3) {
      return {
        level: 'building',
        label: 'Đang tiến bộ ',
        detail: 'Giữ vững nhịp phản xạ',
        points: pts,
        badgeClass: 'bg-emerald-50 text-emerald-800 border border-emerald-300 font-bold',
      };
    }
    return {
      level: 'starting',
      label: 'Khởi động ',
      detail: 'Đang lấy đà phản xạ',
      points: pts,
      badgeClass: 'bg-slate-100 text-slate-700 border border-slate-200 font-medium',
    };
  }, [session?.messages]);


  // Derived Avatar State for LivingAvatar
  const avatarState: AvatarState = isBowing
    ? 'bowing'
    : isSending
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




  // 2. Gửi tin nhắn học viên (Optimistic UI update) - Hỗ trợ cả FormEvent và Direct text từ Hands-Free Voice Loop
  const handleSendMessage = async (eOrText?: React.FormEvent | string) => {
    let customText: string | undefined;
    if (typeof eOrText === 'string') {
      customText = eOrText;
    } else if (eOrText && 'preventDefault' in eOrText) {
      eOrText.preventDefault();
    }


    clearAllAssistance();
    hasSpokenVocalFillerRef.current = false;


    // Ngăn chặn submit khi người dùng đang bấm Enter để chọn chữ Hán Kanji từ bộ gõ IME
    if (isComposing) {
      return;
    }


    // DỪNG THU ÂM & DẬP TOÀN BỘ ÂM THANH NGAY LẬP TỨC khi người dùng bấm gửi (chống ghost audio đè lên trạng thái AI suy nghĩ)
    stopSpeechRecognition();
    scenarioVoiceService.stopAllAudio();
    setIsPlayingAiSpeech(false);


    const trimmed = (customText ?? inputText).trim();
    if (!trimmed || isSendingRef.current || isSending || !session) return;
    // Khóa chống gửi đúp tức thì (Double-Submit Prevention Lock)
    isSendingRef.current = true;
    latestTranscriptRef.current = '';
    setInputText('');


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


    // Anti-Cheat: Nếu người học xem gợi ý Cấp 3 hoặc copy câu mẫu gợi ý
    if (hint) {
      const sample = (hint.suggestedJapaneseText || hint.japaneseSuggestion || '').trim();
      const userClean = trimmed.replace(/[\s\.,?!。、？！]/g, '');
      const sampleClean = sample.replace(/[\s\.,?!。、？！]/g, '');
      if (sampleClean.length >= 4 && (userClean.includes(sampleClean) || sampleClean.includes(userClean))) {
        hintLevelUsedRef.current = Math.max(hintLevelUsedRef.current, 3);
      }
    }

    setIsSending(true);
    ukiyoSound.playAizuchi();
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


    let moraRate: number | undefined;
    if (speakingDurationSeconds && speakingDurationSeconds > 0) {
      const moraCount = countJapaneseMora(trimmed);
      moraRate = Math.round((moraCount / speakingDurationSeconds) * 10) / 10;
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
      moraRate,
    };


    micStartedAtRef.current = null;
    lastSpeechConfidenceRef.current = null;
    hintLevelUsedRef.current = 0;
    setAppliedHintTier(null);
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


      // 1. Cập nhật tin nhắn User thật + missions + feedback ngay (KHOAN bung tin nhắn AI)
      setSession((prev) => {
        if (!prev) return null;
        const filteredMessages = prev.messages.filter((m) => m.id !== tempId);
        return {
          ...prev,
          messages: [...filteredMessages, finalUserMsg],
          missions: turn.updatedMissions,
          isNaturallyConcluded: turn.isNaturallyConcluded,
          creditBalance: turn.creditBalance ?? prev.creditBalance,
        };
      });


      if (turn.userMessage.linguisticFeedback) {
        setSelectedMessageId(turn.userMessage.id);
      }


      // 2. Hàm bung câu phản hồi của AI ra màn hình
      let hasRevealedAiMessage = false;
      const revealAiMessage = () => {
        if (hasRevealedAiMessage) return;
        hasRevealedAiMessage = true;


        setSession((prev) => {
          if (!prev) return null;
          if (prev.messages.some((m) => m.id === turn.aiMessage.id)) return prev;
          return {
            ...prev,
            messages: [...prev.messages, turn.aiMessage],
          };
        });


        // Tắt typing indicator và bắt đầu hiệu ứng máy đánh chữ
        setIsSending(false);
        if (turn.aiMessage?.id) {
          setStreamingAiMessageId(turn.aiMessage.id);
        }


        // Micro-Celebration: Bắn thông báo chúc mừng & âm thanh khi vừa hoàn thành nhiệm vụ mới
        if (turn.newlyCompletedMissionIds && turn.newlyCompletedMissionIds.length > 0) {
          ukiyoSound.playMigotoChime();
          setRecentlyCompletedMissionIds(turn.newlyCompletedMissionIds);
          setTimeout(() => setRecentlyCompletedMissionIds([]), 4500);


          const completedNames = turn.updatedMissions
            .filter((m) => turn.newlyCompletedMissionIds.includes(m.missionId))
            .map((m) => m.content);
          const nameText = completedNames.length > 0 ? `: "${completedNames[0]}"` : '!';
          setToastMessage(`Xuất sắc! Bạn vừa hoàn thành nhiệm vụ${nameText}`);
          setTimeout(() => setToastMessage(null), 4000);
        }

        // Dynamic Scaffolding DDA: Khích lệ học viên khi hệ thống phát hiện cần trợ lực phản xạ
        if (turn.shouldOfferEncouragement && !turn.newlyCompletedMissionIds?.length) {
          setToastMessage('💡 Tiếp tục phát huy! Hãy thử trả lời bằng câu hoàn chỉnh (như 〜をお願いします) để ghi điểm tối đa.');
          setTimeout(() => setToastMessage(null), 4500);
        }


        // Không tự động bung pop-up Eki-Stamp khi nói xong câu thoại cuối;
        // Học viên vẫn có thể tự do đọc lại transcript, nghe lại audio và chỉ mở bảng pop-up khi tự bấm nút 'Hoàn thành phiên'
        if (turn.isNaturallyConcluded || turn.allMissionsCompleted) {
          setToastMessage('🎉 Bạn đã hoàn thành toàn bộ nhiệm vụ! Hãy bấm "Hoàn thành phiên" ở thanh trên cùng khi đã sẵn sàng.');
          setTimeout(() => setToastMessage(null), 5000);
        }
      };


      // 3. ĐỒNG BỘ CHUẨN XÁC: Chỉ khi VOICEVOX nhận xong và BẮT ĐẦU PHÁT ÂM THANH thì câu thoại mới bung ra và miệng avatar mới mấp máy
      if (autoPlayAudioRef.current && turn.aiMessage?.japaneseText) {
        setCurrentViseme('closed');


        // Fallback an toàn: nếu quá 4s VOICEVOX chưa phản hồi thì bung text ra ngay
        const fallbackTimer = setTimeout(() => {
          revealAiMessage();
        }, 4000);


        handlePlayMessageAudio(
          turn.aiMessage.id,
          turn.aiMessage.japaneseText,
          turn.speedScale,
          // onAudioStarted: ĐÚNG LÚC âm thanh bắt đầu phát ra từ loa
          () => {
            clearTimeout(fallbackTimer);
            revealAiMessage();
          }
        );
      } else {
        // Nếu không bật tự động phát âm thanh: bung ra ngay
        revealAiMessage();
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
      setToastMessage(`${res.message || 'Không thể gửi tin nhắn. Vui lòng thử lại.'}`);
      setTimeout(() => setToastMessage(null), 4000);
    }


    hintLevelUsedRef.current = 0;
    translationPeekCountRef.current = 0;
    retryCountRef.current = 0;
    micStartedAtRef.current = null;
    lastSpeechConfidenceRef.current = null;
    setIsSending(false);
    inputRef.current?.focus();
  };


  // Tự động nộp câu nói và gửi lượt hội thoại trong Chế độ Đàm thoại Rảnh tay liên tục (0-Click)
  const handleAutoSubmitVoiceTurn = async () => {
    if (!isRecordingMicRef.current || isSendingRef.current) return;
    isRecordingMicRef.current = false;
    setIsRecordingMic(false);
    if (silenceIntervalRef.current) {
      clearInterval(silenceIntervalRef.current);
      silenceIntervalRef.current = null;
    }
    if (handsFreeFallbackTimerRef.current) {
      clearTimeout(handsFreeFallbackTimerRef.current);
      handsFreeFallbackTimerRef.current = null;
    }
    setSilenceCountdownProgress(0);


    if (recognitionRef.current) {
      try {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.abort();
      } catch {}
      recognitionRef.current = null;
    }


    let textToSend = (latestTranscriptRef.current || '').trim();

    try {
      const audioResult = await scenarioVoiceService.stopAudioRecording();
      if (audioResult && audioResult.blob && audioResult.durationSeconds >= 0.3) {
        if (lastRecordedAudioUrlRef.current && lastRecordedAudioUrlRef.current.startsWith('blob:')) {
          URL.revokeObjectURL(lastRecordedAudioUrlRef.current);
        }
        const recordedUrl = URL.createObjectURL(audioResult.blob);
        lastRecordedAudioUrlRef.current = recordedUrl;

        setIsProcessingStt(true);
        // Whisper STT: Nếu Web Speech đã bắt được câu (textToSend) -> race 2500ms để chốt nhanh
        // Nếu Web Speech rỗng -> cho Whisper tối đa 5500ms để giải mã
        let whisperRes: { text: string; confidence?: number; audioUrl?: string } | null = null;
        if (textToSend) {
          const whisperPromise = scenarioVoiceService.transcribeWithWhisper(audioResult.blob);
          const timeoutPromise = new Promise<{ text: string; confidence?: number; audioUrl?: string } | null>((resolve) =>
            setTimeout(() => resolve(null), 5500)
          );
          whisperRes = await Promise.race([whisperPromise, timeoutPromise]);
        } else {
          whisperRes = await scenarioVoiceService.transcribeWithWhisper(audioResult.blob);
        }

        if (whisperRes && whisperRes.text && whisperRes.text.trim()) {
          const rawWhisper = whisperRes.text.trim();
          if (!isWhisperHallucination(rawWhisper)) {
            textToSend = rawWhisper;
          }
          if (typeof whisperRes.confidence === 'number' && whisperRes.confidence > 0) {
            lastSpeechConfidenceRef.current = whisperRes.confidence;
          }
          if (whisperRes.audioUrl) {
            lastRecordedAudioUrlRef.current = whisperRes.audioUrl;
          }
        } else {
          void scenarioVoiceService.saveLearnerAudio(audioResult.blob).then((serverUrl) => {
            if (serverUrl) {
              lastRecordedAudioUrlRef.current = serverUrl;
            }
          });
        }
      }
    } catch (err) {
      console.warn('[Scenario STT] Auto submit audio capture error:', err);
    } finally {
      setIsProcessingStt(false);
    }

    // Chặn gửi lặp: nếu câu nói chuẩn bị gửi trùng lặp hoàn toàn với câu học viên đã gửi trước đó
    const lastUserMsg = session?.messages?.filter((m) => m.sender === 'User').slice(-1)[0];
    if (lastUserMsg && textToSend && textToSend === lastUserMsg.japaneseText.trim()) {
      console.warn('[Scenario STT] Chặn gửi lặp câu cũ trong đàm thoại rảnh tay:', textToSend);
      latestTranscriptRef.current = '';
      setInputText('');
      if (isHandsFreeModeRef.current && !sessionConcludedRef.current && !isSendingRef.current) {
        setTimeout(() => {
          if (!isRecordingMicRef.current && !isPlayingAiSpeechRef.current) {
            startSpeechRecognition();
          }
        }, 500);
      }
      return;
    }

    if (textToSend && textToSend.trim().length > 0) {
      if (isWhisperHallucination(textToSend)) {
        console.warn('[Scenario STT] Filtered Whisper silence/hallucination:', textToSend);
        setSttNotice('Âm thanh bị nhiễu hoặc chưa rõ lời. Chưa trừ lượt thoại, bạn hãy nói lại nhé!');
        setTimeout(() => setSttNotice(null), 3500);
        if (isHandsFreeModeRef.current && !sessionConcludedRef.current && !isSendingRef.current) {
          setTimeout(() => {
            if (!isRecordingMicRef.current && !isPlayingAiSpeechRef.current) {
              startSpeechRecognition();
            }
          }, 400);
        }
        return;
      }
      ukiyoSound.playSubtleTap();
      latestTranscriptRef.current = '';
      setInputText('');
      void handleSendMessage(textToSend.trim());
    } else {
      // Re-arm micro nếu âm thanh thu được là khoảng lặng hoặc tiếng ồn không thành chữ
      if (isHandsFreeModeRef.current && !sessionConcludedRef.current && !isSendingRef.current) {
        setTimeout(() => {
          if (!isRecordingMicRef.current && !isPlayingAiSpeechRef.current) {
            startSpeechRecognition();
          }
        }, 400);
      }
    }
  };


  // 3a. Instant Scaffolding Synthesis: Tổng hợp tức thì giàn giáo 3 cấp trong < 5ms từ kịch bản
  const synthesizeInstantHint = (currSession: RoleplaySessionDetailsDto): RoleplayHintDto => {
    const uncompletedMission = currSession.missions?.find((m) => !m.isCompleted);
    const keywords = (currSession.targetVocabularies || [])
      .map((v) => v.word)
      .filter((w) => containsJapanese(w));


    const grammarSample = currSession.targetGrammars?.[0]?.pattern;
    const vocabWord = currSession.targetVocabularies?.[0]?.word;
    const sampleSentence = vocabWord
      ? (grammarSample ? `${vocabWord} ${grammarSample} でお願いします。` : `${vocabWord} をお願いします。`)
      : (grammarSample ? `すみません、${grammarSample} でお願いします。` : 'すみません、お願いします。');


    const cloze = deriveJapaneseCloze(
      sampleSentence,
      keywords.length > 0 ? keywords[0] : vocabWord
    );


    return {
      japaneseSuggestion: sampleSentence,
      suggestedJapaneseText: sampleSentence,
      vietnameseMeaning: uncompletedMission?.content || 'Hãy hoàn thành mục tiêu giao tiếp này',
      suggestedVietnameseMeaning: uncompletedMission?.content || 'Hãy hoàn thành mục tiêu giao tiếp này',
      clozeSentence: cloze,
      keywords: keywords.slice(0, 4),
    };
  };


  const handleGetInstantHint = async () => {
    if (!session || isLoadingHint) return;
    ukiyoSound.playSubtleTap();
    // Không phạt khi mở xem preview - chỉ phạt khi người học thực sự bấm "Dùng" hoặc chèn từ khóa
    
    // Xóa bỏ tất cả các timer chờ đợi ngầm (hesitation, deadlock, overload, idle)
    if (hesitationTimerRef.current) clearTimeout(hesitationTimerRef.current);
    if (deadlockTimerRef.current) clearTimeout(deadlockTimerRef.current);
    if (overloadTimerRef.current) clearTimeout(overloadTimerRef.current);
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    setShowProactiveHint(false);


    // Chỉ nạp và mở bảng gợi ý khi LLM backend đã trả về dữ liệu thực tế, tránh lộ mock giật lag
    const currentSessionId = session.sessionId || session.id || sessionId;
    setIsLoadingHint(true);
    try {
      const res = await roleplayService.getHint(currentSessionId);
      if (res.success && res.data) {
        hintLevelUsedRef.current = Math.max(hintLevelUsedRef.current, 1);
        setAppliedHintTier(1);
        setHint(res.data);
      } else {
        const fallback = synthesizeInstantHint(session);
        hintLevelUsedRef.current = Math.max(hintLevelUsedRef.current, 1);
        setAppliedHintTier(1);
        setHint(fallback);
      }
    } catch {
      const fallback = synthesizeInstantHint(session);
      hintLevelUsedRef.current = Math.max(hintLevelUsedRef.current, 1);
      setAppliedHintTier(1);
      setHint(fallback);
    } finally {
      setIsLoadingHint(false);
    }
  };


  // 3. Xin gợi ý (Hint)
  const handleGetHint = async (isAutomatic = false) => {
    if (!session || isLoadingHint) return;
    setIsLoadingHint(true);
    hintLevelUsedRef.current += 1;
    const currentSessionId = session.sessionId || session.id || sessionId;
    const res = await roleplayService.getHint(currentSessionId);
    if (res.success && res.data) {
      setSingleAssistance('hint', res.data);
    } else if (!isAutomatic) {
      alert(res.message || 'Không thể lấy gợi ý lúc này.');
    }
    setIsLoadingHint(false);
  };


  // 4. Áp dụng gợi ý (Chỉ lấy câu tiếng Nhật, KHÔNG lấy tiếng Việt theo yêu cầu)
  const handleApplyHint = () => {
    if (!hint) return;
    setInputText(hint.suggestedJapaneseText || hint.japaneseSuggestion || '');
    clearAllAssistance();
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
      const rawData = res.data as any;
      const resolvedResultId =
        rawData?.resultId ??
        rawData?.id ??
        rawData?.data?.resultId ??
        rawData?.data?.id ??
        currentSessionId;
      const targetUrl = returnUrl
        ? `/roleplay/results/${resolvedResultId}?return=${encodeURIComponent(returnUrl)}`
        : `/roleplay/results/${resolvedResultId}`;
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
      const rawData = res.data as any;
      const newId = rawData?.sessionId ?? rawData?.id ?? rawData?.data?.sessionId ?? rawData?.data?.id;
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
    latestTranscriptRef.current = '';
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

      // Fallback timer cho chế độ Rảnh tay: nếu micro đang thu âm mà Web Speech không bắt được kết quả sau 5.5s
      if (handsFreeFallbackTimerRef.current) clearTimeout(handsFreeFallbackTimerRef.current);
      if (isHandsFreeModeRef.current) {
        handsFreeFallbackTimerRef.current = setTimeout(() => {
          if (isRecordingMicRef.current && !isSendingRef.current) {
            void handleAutoSubmitVoiceTurn();
          }
        }, 8500);
      }


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
          if (handsFreeFallbackTimerRef.current) {
            clearTimeout(handsFreeFallbackTimerRef.current);
            handsFreeFallbackTimerRef.current = null;
          }
          const cleanTranscript = transcript.trim();
          if (cleanTranscript && !isWhisperHallucination(cleanTranscript)) {
            clearAllAssistance();
            latestTranscriptRef.current = cleanTranscript;
            setInputText(cleanTranscript);
            markLearnerUttering();
            if (typeof confidence === 'number') {
              lastSpeechConfidenceRef.current = confidence;
            }


            // Adaptive Silence Ring: Khi phát hiện tiếng nói, kích hoạt đếm ngược im lặng (0.8s-1.2s theo level)
            if (silenceIntervalRef.current) {
              clearInterval(silenceIntervalRef.current);
              silenceIntervalRef.current = null;
            }
            const currentLvl = (session?.level || session?.jlptLevel || 'N5').trim().toUpperCase();
            // Chuẩn công thái học học ngoại ngữ: N5: 3500ms, N4: 3000ms, N3+: 2500ms (đủ thời gian ậm à, lấy hơi và suy nghĩ câu)
            const silenceTimeoutMs = currentLvl === 'N5' ? 3500 : currentLvl === 'N4' ? 3000 : 2500;
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

                // Bộ lọc từ đệm ngắn: nếu chỉ mới nói từ ngập ngừng (あの, ええと, はい, 嗯) hoặc dưới 3 ký tự, không vội gửi ngay
                const currentSnapshot = (latestTranscriptRef.current || inputText || '').trim();
                const isShortFiller = currentSnapshot.length < 3 || /^(はい|うん|あの|ええと|えっと|あのー|えー|その)$/.test(currentSnapshot);
                if (isShortFiller && isRecordingMicRef.current) {
                  return;
                }

                // Tự động nộp câu thoại và gửi lượt hội thoại liên tục (Hands-Free Zero-Click)
                if (isRecordingMicRef.current && !isSendingRef.current) {
                  void handleAutoSubmitVoiceTurn();
                }
              }
            }, intervalStep);
          }
        },
        onError: (err: any) => {
          console.warn('[Scenario STT] Error:', err);
          if (err.error === 'not-allowed') {
            setMicError('Quyền truy cập micro đã bị từ chối.');
          } else if (err.error === 'network') {
            setMicError('Không thể kết nối máy chủ nhận diện Google STT. Hãy kiểm tra kết nối mạng.');
          } else if (err.error === 'audio-capture') {
            setMicError('Không tìm thấy thiết bị micro trên máy tính.');
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


  // Dọn dẹp âm thanh, timers và micro khi rời phòng luyện tập
  useEffect(() => {
    return () => {
      if (silenceIntervalRef.current) {
        clearInterval(silenceIntervalRef.current);
        silenceIntervalRef.current = null;
      }
      if (handsFreeAutoListenTimeoutRef.current) {
        clearTimeout(handsFreeAutoListenTimeoutRef.current);
        handsFreeAutoListenTimeoutRef.current = null;
      }
      if (hesitationTimerRef.current) {
        clearTimeout(hesitationTimerRef.current);
        hesitationTimerRef.current = null;
      }
      if (deadlockTimerRef.current) {
        clearTimeout(deadlockTimerRef.current);
        deadlockTimerRef.current = null;
      }
      if (overloadTimerRef.current) {
        clearTimeout(overloadTimerRef.current);
        overloadTimerRef.current = null;
      }
      scenarioVoiceService.stopAllAudio();
      scenarioVoiceService.stopAudioRecordingSync();
      void stopSpeechRecognition();
    };
  }, []);


  if (isLoading) {
    return (
      <div data-theme="phong-luyen" className="flex h-screen flex-col items-center justify-center bg-[var(--paper-100)] gap-5">
        <div className="relative flex h-16 w-16 items-center justify-center">
          <span className="absolute inset-0 rounded-full border-4 border-[var(--line)] border-t-[var(--ai)] animate-spin" />
                  </div>
        <div className="text-center">
          <p className="text-sm font-bold text-[var(--sumi)] font-sans">Chuẩn bị phòng hội thoại...</p>
          <p className="mt-1 text-xs text-[var(--sumi-faint)] font-sans">Đang nạp nhân vật AI, nhiệm vụ & giọng VOICEVOX</p>
        </div>
      </div>
    );
  }


  if (loadError || !session) {
    return (
      <div data-theme="phong-luyen" className="flex h-screen flex-col items-center justify-center bg-[var(--paper-100)] px-4">
        <div className="w-full max-w-md rounded-3xl border border-red-200 bg-[var(--paper-50)] p-8 text-center shadow-lg space-y-3">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-2xl">
            <AlertCircleIcon className="w-7 h-7 text-red-600" />
          </div>
          <h2 className="text-lg font-bold text-[var(--sumi)] font-sans">Không thể vào phòng luyện tập</h2>
          <p className="text-sm text-[var(--sumi-muted)] leading-relaxed font-sans">{loadError || 'Dữ liệu phiên không tồn tại hoặc đã hết hạn.'}</p>
          <button
            type="button"
            onClick={() => navigate('/scenarios')}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--ai)] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[var(--ai-hover)] active:scale-95 shadow-sm"
          >
            ← Quay lại thư viện kịch bản
          </button>
        </div>
      </div>
    );
  }


  return (
    <div data-theme="phong-luyen" className="flex h-screen flex-col overflow-hidden bg-[var(--paper-100)] text-[var(--sumi)] font-sans">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed top-20 right-6 z-50 flex items-center gap-2.5 rounded-2xl px-5 py-3.5 text-xs font-semibold shadow-2xl transition-all duration-300 animate-fade-in ${
            toastMessage.startsWith('')
              ? 'border border-emerald-400/80 bg-[var(--sumi)] text-white shadow-[0_12px_36px_rgba(16,185,129,0.35)]'
              : 'border border-blue-400/40 bg-[var(--sumi)] text-white shadow-[0_12px_36px_rgba(7,26,68,0.3)]'
          }`}
        >
                    <span className="leading-snug">{toastMessage}</span>
        </div>
      )}


      {/* TOP HEADER BAR */}
      <header className="flex h-14 sm:h-16 shrink-0 items-center justify-between border-b border-[var(--line)] bg-[var(--paper-50)]/95 backdrop-blur-sm px-3 sm:px-4 md:px-6 shadow-xs z-30 flex-nowrap">
        {/* Left: Back button & Scenario title */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1 mr-2 sm:mr-4 overflow-hidden">
          <button
            type="button"
            onClick={() => setShowLeaveModal(true)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-[var(--line)] px-2.5 py-1.5 text-xs font-semibold text-[var(--sumi-faint)] transition hover:border-[var(--ai)] hover:text-[var(--ai)] hover:shadow-xs whitespace-nowrap active:scale-95"
            title="Tạm dừng và rời phòng luyện tập"
          >
            <span>←</span>
            <span className="hidden sm:inline">Rời phòng</span>
          </button>


          <div className="flex items-center gap-2 sm:gap-3 min-w-0 overflow-hidden flex-1">
            <div className="shrink-0 p-1 rounded-full border border-stone-200 bg-white shadow-2xs aspect-square flex items-center justify-center">
              <LivingAvatar
                size="sm"
                avatarState={avatarState}
                personaName={session.aiPersona}
                personaRole={session.recommendedAiVoiceName?.split('(')[0].trim()}
                scenarioTitle={session.scenarioTitle}
                archetype={(session.sceneType as any) || undefined}
                currentViseme={currentViseme}
                isAizuchiActive={isRecordingMic}
                hideLabel
              />
            </div>
            <div className="min-w-0 overflow-hidden flex-1">
              <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                <h1 className="text-xs sm:text-sm font-bold font-sans leading-tight text-[var(--sumi)] max-w-[220px] sm:max-w-xs md:max-w-md lg:max-w-lg truncate" title={session.scenarioTitle}>
                  {session.scenarioTitle}
                </h1>
                <span className="shrink-0 rounded-full bg-[var(--ai-soft)] px-2 py-0.5 text-[10px] font-bold text-[var(--ai)] whitespace-nowrap">
                  JLPT {session.level || session.jlptLevel}
                </span>
                {isBlindMode && (
                  <span className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-500 to-rose-500 px-2.5 py-0.5 text-[10px] font-black text-white shadow-2xs">
                    <span>⚡ 10s Phản xạ</span>
                    {reflexCountdown !== null && (
                      <span className={`px-1.5 py-0.2 rounded-full text-[9px] font-mono ${reflexCountdown <= 3 ? 'bg-rose-700 animate-ping' : 'bg-black/30'}`}>
                        {reflexCountdown}s
                      </span>
                    )}
                  </span>
                )}
              </div>
              <div className="text-[11px] text-[var(--sumi-faint)] flex items-center gap-1.5 mt-0.5 min-w-0">
                <span className="hidden sm:inline shrink-0">Đối thoại cùng:</span>
                <span className="font-semibold text-[var(--sumi)] max-w-[180px] sm:max-w-[280px] truncate" title={session.aiPersona}>{session.aiPersona}</span>
              </div>
            </div>
          </div>
        </div>


        {/* Center/Right: Compact Action Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* User Credits Coin Badge */}
          <Link
            to="/credits"
            className="inline-flex items-center gap-1 rounded-xl border border-amber-300/80 bg-gradient-to-r from-amber-50 to-orange-50 px-2 sm:px-2.5 py-1 text-xs font-bold text-amber-900 shadow-2xs hover:bg-amber-100/80 transition shrink-0 active:scale-95"
            title="Số xu hiện có (Bấm để xem lịch sử & nạp thêm)"
          >
            <span>🪙</span>
            <span className="font-mono">{session?.creditBalance ?? user?.creditBalance ?? 814}</span>
          </Link>

          {/* Toggle Chế độ Đàm thoại Rảnh tay liên tục (Hands-Free Call Mode) */}
          <button
            type="button"
            onClick={() => {
              const nextVal = !isHandsFreeMode;
              setIsHandsFreeMode(nextVal);
              ukiyoSound.playSubtleTap();
              setToastMessage(nextVal ? 'Đã bật Đàm thoại Rảnh tay (tự động nhận diện sau câu nói của AI)' : '✋ Đã chuyển sang Bấm nói thủ công');
              setTimeout(() => setToastMessage(null), 3200);
            }}
            className={`inline-flex items-center gap-1 sm:gap-1.5 rounded-xl border px-2 sm:px-2.5 py-1.5 text-xs font-bold transition whitespace-nowrap shrink-0 shadow-2xs ${
              isHandsFreeMode
                ? 'border-[var(--ai)] bg-[var(--ai-soft)] text-[var(--ai)] ring-1 ring-[var(--ai)]/30'
                : 'border-[var(--line)] bg-[var(--paper-50)] text-[var(--sumi-muted)] hover:border-[var(--ai)]'
            }`}
            title={isHandsFreeMode ? 'Đang bật đàm thoại 2 chiều liên tục (Tự động nghe và gửi)' : 'Bấm để bật chế độ tự động đàm thoại không cần dùng chuột'}
          >
            {isHandsFreeMode ? (
              <PhoneCallIcon className="w-3.5 h-3.5 animate-pulse text-[var(--ai)]" />
            ) : (
              <HandIcon className="w-3.5 h-3.5 text-[var(--sumi-muted)]" />
            )}
            <span className="hidden sm:inline">Rảnh tay</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${isHandsFreeMode ? 'bg-[var(--ai)] text-[var(--on-ai)]' : 'bg-slate-200 text-slate-600'}`}>
              {isHandsFreeMode ? 'BẬT' : 'TẮT'}
            </span>
          </button>


          {/* Toggle Cột Trái: Nhiệm vụ */}
          <button
            type="button"
            onClick={() => {
              const nextState = !isLeftOpen;
              if (nextState && window.innerWidth < 1280 && isRightOpen) {
                setIsRightOpen(false);
              }
              setIsLeftOpen(nextState);
            }}
            className={`inline-flex items-center gap-1 sm:gap-1.5 rounded-xl border px-2 sm:px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap shrink-0 transition ${
              isLeftOpen
                ? 'border-[var(--ai)] bg-[var(--ai-soft)] text-[var(--ai)]'
                : 'border-[var(--line)] bg-white text-[var(--sumi-muted)] hover:border-[var(--ai)]'
            }`}
            title="Ẩn/Hiện Danh sách nhiệm vụ kịch bản"
          >
            <ListTodoIcon className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Nhiệm vụ</span>
            <span className="text-[10px] font-bold opacity-80">
              ({completedMissionsCount}/{totalMissionsCount})
            </span>
          </button>


          {/* Toggle Cột Phải: Đánh giá */}
          <button
            type="button"
            onClick={() => {
              const nextState = !isRightOpen;
              if (nextState && window.innerWidth < 1280 && isLeftOpen) {
                setIsLeftOpen(false);
              }
              setIsRightOpen(nextState);
            }}
            className={`inline-flex items-center gap-1 sm:gap-1.5 rounded-xl border px-2 sm:px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap shrink-0 transition ${
              isRightOpen
                ? 'border-[var(--ai)] bg-[var(--ai-soft)] text-[var(--ai)]'
                : 'border-[var(--line)] bg-white text-[var(--sumi-muted)] hover:border-[var(--ai)]'
            }`}
            title="Ẩn/Hiện Bảng phân tích & đánh giá ngôn ngữ chi tiết"
          >
            <span className="text-xs">📊</span>
            <span className="hidden lg:inline">Đánh giá</span>
          </button>


          {/* Dropdown Menu Cài đặt hỗ trợ (Dịch, Furigana, Giọng đọc AI, Tốc độ) */}
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setIsSettingsOpen(!isSettingsOpen)}
              className={`inline-flex items-center gap-1 sm:gap-1.5 rounded-xl border px-2 sm:px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap shrink-0 transition ${
                isSettingsOpen
                  ? 'border-[var(--ai)] bg-[var(--ai-soft)] text-[var(--ai)]'
                  : 'border-[var(--line)] bg-white text-[var(--sumi-muted)] hover:border-[var(--ai)]'
              }`}
              title="Cài đặt hỗ trợ (Dịch, Furigana, Giọng đọc AI)"
            >
              <span>⚙️</span>
              <span className="hidden lg:inline">Cài đặt</span>
              {(showTranslation || showFurigana || autoPlayAudio) && (
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--ai)]" />
              )}
            </button>


            {/* Popover Dropdown Panel */}
            {isSettingsOpen && (
              <div
                ref={settingsRef}
                className="absolute right-0 top-full mt-2 z-[200] w-80 rounded-3xl border border-stone-200 bg-white p-5 shadow-[0_20px_50px_rgba(0,0,0,0.18)] ring-1 ring-black/5 animate-fade-in text-xs space-y-4"
              >
                <div className="flex items-center justify-between border-b border-[var(--line)] pb-2.5">
                  <span className="font-bold text-[var(--sumi)] text-sm font-sans">Cài đặt hỗ trợ luyện tập</span>
                  <button
                    type="button"
                    onClick={() => setIsSettingsOpen(false)}
                    className="flex h-6 w-6 items-center justify-center rounded-lg text-[var(--sumi-faint)] transition hover:bg-[var(--line)] hover:text-[var(--sumi)] active:scale-95 font-bold"
                  >
                    ✕
                  </button>
                </div>


                {/* Toggle Dịch */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-[var(--sumi)]">Dịch nghĩa tiếng Việt</p>
                    <p className="text-[11px] text-[var(--sumi-faint)]">Hiển thị bản dịch dưới câu</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      translationPeekCountRef.current += 1;
                      setShowTranslation(!showTranslation);
                    }}
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


                {/* Toggle Furigana */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-[var(--sumi)]">Phiên âm Furigana</p>
                    <p className="text-[11px] text-[var(--sumi-faint)]">Cách đọc Hiragana trên Kanji</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowFurigana(!showFurigana)}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                      showFurigana ? 'bg-[var(--ai)]' : 'bg-slate-300'
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
                    <p className="font-semibold text-[var(--sumi)]">Tự động phát giọng AI</p>
                    <p className="text-[11px] text-[var(--sumi-faint)]">Phát âm ngay khi AI trả lời</p>
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
                      autoPlayAudio ? 'bg-[var(--ai)]' : 'bg-slate-300'
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
                <div className="border-t border-[var(--line)] pt-2.5">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-semibold text-[var(--sumi)]">Tốc độ đọc của AI</span>
                    <span className="font-bold text-[var(--ai)]">{speechRate}x</span>
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
                        className={`rounded-xl py-1 text-center font-bold text-xs transition active:scale-95 ${
                          speechRate === rate
                            ? 'bg-[var(--ai)] text-white shadow-xs'
                            : 'bg-[var(--paper-100)] text-[var(--sumi-muted)] hover:bg-[var(--line)]'
                        }`}
                      >
                        {rate === 0.85 ? '0.85x Chậm' : rate === 1.0 ? '1.0x Chuẩn' : '1.15x Nhanh'}
                      </button>
                    ))}
                  </div>
                </div>


                {/* Nút mở cài đặt giọng đọc VOICEVOX */}
                <div className="border-t border-[var(--line)] pt-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setIsSettingsOpen(false);
                      scenarioVoiceService.stopAllAudio();
                      setIsPlayingAiSpeech(false);
                      setPlayingMessageId(null);
                      setIsVoiceModalOpen(true);
                    }}
                    className="w-full inline-flex items-center justify-center gap-1.5 rounded-2xl border border-[var(--line)] bg-[var(--paper-100)] py-2 text-xs font-bold text-[var(--ai)] transition hover:bg-[var(--ai-soft)] hover:border-[var(--ai)] active:scale-98"
                  >
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
              className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-emerald-600 px-2.5 sm:px-3.5 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700 animate-pulse whitespace-nowrap"
              title={
                session.isNaturallyConcluded
                  ? 'Kịch bản đã hoàn thành trọn vẹn và kết thúc tự nhiên! Bấm để hoàn thành.'
                  : 'Bạn đã hoàn thành toàn bộ nhiệm vụ! Bấm để hoàn thành phiên.'
              }
            >
              <span>✓</span>
              <span className="hidden sm:inline">Hoàn thành phiên</span>
              <span className="sm:hidden">Xong</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShowEndModal(true)}
              className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-red-200 bg-white px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50 whitespace-nowrap"
            >
              <span className="hidden sm:inline">Kết thúc sớm</span>
              <span className="sm:hidden">Kết thúc</span>
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
          className={`shrink-0 border-r border-[var(--line)] bg-[var(--paper-50)] flex flex-col z-10 overflow-hidden transition-all duration-300 ease-in-out ${
            isLeftOpen
              ? 'w-72 lg:w-80 opacity-100 shadow-md'
              : 'w-0 border-r-0 opacity-0 pointer-events-none'
          }`}
        >
          <div className="w-72 lg:w-80 flex flex-col h-full shrink-0">
            {/* Header sidebar */}
            <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3 bg-white">
              <div>
                <h2 className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--sumi-faint)]">
                  Tiến độ kịch bản
                </h2>
                <p className="text-xs font-bold text-[var(--sumi)] mt-0.5">
                  <span className="text-[var(--ai)]">{completedMissionsCount}</span>
                  <span className="text-[var(--sumi-faint)]"> / {totalMissionsCount} nhiệm vụ</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsLeftOpen(false)}
                className="inline-flex items-center gap-1 rounded-xl border border-[var(--line)] px-2.5 py-1 text-xs font-semibold text-[var(--sumi-faint)] hover:bg-[var(--paper-100)] hover:text-[var(--ai)] transition active:scale-95"
                title="Thu gọn danh sách nhiệm vụ"
              >
                <span>◀</span>
                <span>Thu gọn</span>
              </button>
            </div>


            {/* Progress bar */}
            <div className="px-4 py-3 border-b border-[var(--line)] bg-white">
              <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--paper-200)]">
                <div
                  className="h-full rounded-full transition-all duration-700 ease-out"
                  style={{
                    width: `${progressPercent}%`,
                    background: progressPercent >= 100
                      ? 'linear-gradient(90deg, var(--score-good), var(--success))'
                      : 'linear-gradient(90deg, var(--ai), var(--nami))',
                  }}
                />
              </div>
              <div className="mt-1.5 flex justify-between text-[10px] font-semibold text-[var(--sumi-faint)]">
                <span>Bắt đầu</span>
                <span className={progressPercent >= 100 ? 'text-[var(--score-good)] font-bold' : 'text-[var(--ai)]'}>
                  {progressPercent}%
                </span>
                <span>Hoàn thành</span>
              </div>
            </div>


            {/* Tab selector: Nhiệm vụ vs Cheat Sheet */}
            <div className="flex border-b border-[var(--line)] bg-[var(--paper-50)] text-xs">
              <button
                type="button"
                onClick={() => setCheatSheetTab('vocab')}
                className={`flex-1 py-2 font-semibold transition ${
                  cheatSheetTab === 'vocab'
                    ? 'border-b-2 border-[var(--ai)] bg-white text-[var(--ai)]'
                    : 'text-[var(--sumi-faint)] hover:text-[var(--sumi)]'
                }`}
              >
                Nhiệm vụ ({session.missions.length})
              </button>
              <button
                type="button"
                onClick={() => setCheatSheetTab('grammar')}
                className={`flex-1 py-2 font-semibold transition ${
                  cheatSheetTab === 'grammar'
                    ? 'border-b-2 border-[var(--ai)] bg-white text-[var(--ai)]'
                    : 'text-[var(--sumi-faint)] hover:text-[var(--sumi)]'
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
                      className={`flex gap-3 rounded-2xl border p-3 transition-all duration-300 ${
                        recentlyCompletedMissionIds.includes(mission.missionId ?? mission.id ?? mission.order)
                          ? 'border-emerald-500 bg-emerald-50/80 ring-2 ring-emerald-400 ring-offset-2 scale-[1.02] shadow-md animate-pulse-glow'
                          : mission.isCompleted
                          ? 'border-emerald-200 bg-emerald-50/50 shadow-xs'
                          : 'border-[var(--line)] bg-[var(--paper-50)] hover:bg-[var(--paper-100)] hover:border-[var(--line-strong)] shadow-xs'
                      }`}
                    >
                      {/* Trạng thái icon: CHỈ CÓ Pending hoặc Completed */}
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold transition ${
                          mission.isCompleted
                            ? 'bg-emerald-500 text-white shadow-xs'
                            : 'bg-[var(--paper-200)] text-[var(--sumi-muted)]'
                        }`}
                      >
                        {mission.isCompleted ? '✓' : mission.order}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <p
                            className={`text-xs font-semibold leading-snug ${
                              mission.isCompleted ? 'text-emerald-900 font-bold' : 'text-[var(--sumi)]'
                            }`}
                          >
                            {mission.content}
                          </p>
                          {mission.isCompleted && (
                            <span className="shrink-0 text-[10px] font-bold text-emerald-600">
                              {recentlyCompletedMissionIds.includes(mission.missionId ?? mission.id ?? mission.order)
                                ? 'Vừa đạt!'
                                : 'Đã đạt'}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-[11px] leading-tight text-[var(--sumi-faint)]">
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
                    <h3 className="font-bold text-[var(--ai)] uppercase text-[11px] tracking-wide mb-2 font-sans">
                      Từ vựng trọng tâm ({(session.targetVocabularies ?? []).length})
                    </h3>
                    <div className="space-y-2">
                      {(session.targetVocabularies ?? []).map((v) => (
                        <div key={v.id} className="rounded-xl bg-[var(--paper-50)] p-2.5 border border-[var(--line)] shadow-xs transition hover:border-[var(--line-strong)]">
                          <div className="flex justify-between items-baseline">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-[var(--sumi)] text-[13px]">{v.word}</span>
                              <button
                                type="button"
                                onClick={() => handleToggleCheatVocabBookmark(v)}
                                className={`text-[11px] p-0.5 rounded transition ${
                                  practiceBookmarkedVocabIds.has(v.id)
                                    ? 'text-amber-600 font-bold'
                                    : 'text-slate-400 hover:text-amber-600'
                                }`}
                                title={practiceBookmarkedVocabIds.has(v.id) ? 'Đã lưu vào Flashcard (Bấm để bỏ lưu)' : 'Lưu vào Flashcard'}
                              >
                                {practiceBookmarkedVocabIds.has(v.id) ? '🔖' : '☆'}
                              </button>
                            </div>
                            <span className="text-[11px] text-[var(--sumi-faint)]">{v.reading}</span>
                          </div>
                          <p className="mt-0.5 text-[11px] text-[var(--sumi-muted)]">{v.meaning}</p>
                        </div>
                      ))}
                    </div>
                  </div>


                  <div>
                    <h3 className="font-bold text-[var(--ai)] uppercase text-[11px] tracking-wide mb-2 font-sans">
                      Mẫu ngữ pháp ({(session.targetGrammars ?? []).length})
                    </h3>
                    <div className="space-y-2">
                      {(session.targetGrammars ?? []).map((g) => (
                        <div key={g.id} className="rounded-xl bg-[var(--paper-50)] p-2.5 border border-[var(--line)] shadow-xs transition hover:border-[var(--line-strong)]">
                          <div className="flex items-center justify-between gap-1">
                            <p className="font-bold text-[var(--ai)] font-mono">{g.pattern}</p>
                            <button
                              type="button"
                              onClick={() => handleToggleCheatGrammarBookmark(g)}
                              className={`text-[11px] p-0.5 rounded transition ${
                                practiceBookmarkedGrammarIds.has(g.id)
                                  ? 'text-amber-600 font-bold'
                                  : 'text-slate-400 hover:text-amber-600'
                              }`}
                              title={practiceBookmarkedGrammarIds.has(g.id) ? 'Đã lưu vào Flashcard (Bấm để bỏ lưu)' : 'Lưu vào Flashcard'}
                            >
                              {practiceBookmarkedGrammarIds.has(g.id) ? '🔖' : '☆'}
                            </button>
                          </div>
                          <p className="mt-0.5 text-[11px] text-[var(--sumi-muted)]">{g.meaning}</p>
                          {g.exampleSentence && (
                            <p className="mt-1 text-[11px] italic text-[var(--sumi)] border-l-2 border-[var(--line)] pl-2">{g.exampleSentence}</p>
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
          className={`absolute top-4 left-0 z-30 flex items-center gap-2 rounded-r-xl border border-l-0 border-[var(--ai)]/30 bg-white px-3 py-2.5 text-xs font-bold text-[var(--ai)] shadow-md hover:bg-[var(--ai-soft)] hover:pr-4 transition-all duration-300 ease-in-out ${
            !isLeftOpen
              ? 'translate-x-0 opacity-100 pointer-events-auto'
              : '-translate-x-full opacity-0 pointer-events-none'
          }`}
          title="Mở rộng danh sách nhiệm vụ & Cheat sheet"
        >
          <ListTodoIcon className="w-3.5 h-3.5" />
          <span>Nhiệm vụ ({completedMissionsCount}/{totalMissionsCount})</span>
          <span>▶</span>
        </button>


        {/* ============================================================ */}
        {/* 2. CENTER COLUMN: Chat Stage & Stream (Max Width 760px)      */}
        {/* ============================================================ */}
        <main className="flex flex-1 flex-col overflow-hidden bg-[var(--paper-100)]">
          {/* ============================================================ */}
          {/* HERO CONVERSATION CANVAS                                    */}
          {/* ============================================================ */}
          <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6">
            <div className="mx-auto w-full max-w-[800px] space-y-4">
              {/* Scenario Context Bar (Gọn gàng, thanh lịch, không trùng lặp Persona/Tiêu đề đã có ở Header) */}
              {session?.scenarioContext && (
                <div className="rounded-2xl border border-[var(--line)] bg-white/80 backdrop-blur-xs px-4 py-2.5 shadow-2xs text-xs font-sans">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 font-bold text-[var(--ai)] text-[10px] tracking-wide uppercase">
                        <span>Bối cảnh tình huống</span>
                      </div>
                      <p className={`mt-0.5 text-[var(--sumi)] text-[11px] leading-relaxed ${isContextBannerExpanded ? '' : 'line-clamp-2'}`}>
                        {session.scenarioContext}
                      </p>
                    </div>
                    {session.scenarioContext.length > 100 && (
                      <button
                        type="button"
                        onClick={() => setIsContextBannerExpanded(!isContextBannerExpanded)}
                        className="shrink-0 text-[10px] font-bold text-[var(--ai)] hover:underline pt-0.5 cursor-pointer"
                      >
                        {isContextBannerExpanded ? 'Thu gọn ▲' : 'Xem thêm ▼'}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* M3: Micro-Celebration Banner for Newly Completed Mission */}
              {celebratingMission && (
                <div className={`relative overflow-hidden rounded-2xl p-3.5 shadow-lg border text-white transition-all duration-500 animate-slide-up select-none font-sans ${
                  celebratingMission.isAll
                    ? 'bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 border-amber-300 ring-2 ring-amber-300/60'
                    : 'bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 border-emerald-400'
                }`}>
                  {/* Micro Confetti Drops (16 GPU-accelerated CSS dots) */}
                  <div className="absolute inset-0 pointer-events-none overflow-hidden">
                    {[...Array(16)].map((_, i) => (
                      <span
                        key={i}
                        className="absolute w-1.5 h-1.5 rounded-full opacity-90 animate-[confettiDrop_2s_ease-out_forwards]"
                        style={{
                          left: `${(i * 6.25) + (Math.sin(i) * 3)}%`,
                          top: '-6px',
                          backgroundColor: ['var(--sora)', 'var(--ai)', 'var(--score-good)', 'var(--shu)', 'var(--n3)', 'var(--credit-coin)'][i % 6],
                          animationDelay: `${(i % 5) * 80}ms`,
                          animationDuration: `${1.4 + (i % 3) * 0.4}s`
                        }}
                      />
                    ))}
                  </div>

                  <div className="relative z-10 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-2xl shrink-0 animate-bounce">
                        {celebratingMission.isAll ? '🎊' : '🎯'}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black uppercase tracking-wider text-amber-200">
                            {celebratingMission.isAll ? '見事 · HOÀN THÀNH TẤT CẢ MỤC TIÊU!' : 'MỤC TIÊU ĐẠT ĐƯỢC!'}
                          </span>
                          <span className="text-[10px] font-bold px-2 py-0.2 rounded-full bg-black/25 text-white/95 font-mono">
                            {celebratingMission.count}/{celebratingMission.total}
                          </span>
                        </div>
                        <p className="text-xs font-semibold text-white truncate mt-0.5">
                          "{celebratingMission.title}"
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCelebratingMission(null)}
                      className="shrink-0 text-white/80 hover:text-white text-xs font-bold p-1 rounded-lg hover:bg-black/20 transition cursor-pointer"
                      title="Đóng thông báo"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              )}

              {/* Message List */}
              {session.messages.map((msg: RoleplayMessageDto) => {
                const isAi = msg.sender === 'Ai';
                const isSelected = selectedMessageId === msg.id;


                return (
                  <div
                    key={msg.id}
                    className={`flex items-start gap-3 transition-all duration-300 animate-slide-up ${isAi ? '' : 'justify-end'}`}
                  >
                    {/* Living Avatar chính của nhân vật đối thoại: Hiển thị cử động miệng, chớp mắt, biểu cảm */}
                    {isAi && (
                      <div className="shrink-0 pt-0.5">
                        <LivingAvatar
                          size="sm"
                          avatarState={playingMessageId === msg.id && isPlayingAiSpeech ? 'speaking' : isBowing ? 'bowing' : 'idle'}
                          personaName={session.aiPersona}
                          personaRole={session.recommendedAiVoiceName?.split('(')[0].trim()}
                          scenarioTitle={session.scenarioTitle}
                          archetype={(session.sceneType as any) || undefined}
                          currentViseme={playingMessageId === msg.id && isPlayingAiSpeech ? currentViseme : 'closed'}
                          isAizuchiActive={isLearnerUttering && isAi && msg.id === session.messages[session.messages.length - 1]?.id}
                          hideLabel
                        />
                      </div>
                    )}


                    {/* Chat Bubble */}
                    <div
                      onClick={() => {
                        if (!isAi && msg.linguisticFeedback) {
                          setSelectedMessageId(msg.id);
                          if (window.innerWidth < 1280 && isLeftOpen) {
                            setIsLeftOpen(false);
                          }
                          setIsRightOpen(true);
                        }
                      }}
                      className={`group relative max-w-[80%] rounded-2xl p-4 transition shadow-xs ${
                        isAi
                          ? 'bubble-ai rounded-tl-sm border border-[var(--line)] bg-white text-[var(--sumi)] shadow-xs'
                          : `bubble-user rounded-tr-sm bg-[var(--ai)] text-white cursor-pointer shadow-sm ${
                              isSelected ? 'ring-2 ring-[var(--ai)]/40 shadow-md' : 'hover:bg-[var(--ai-hover)] hover:shadow-md'
                            }`
                      }`}
                    >
                      {/* Header in bubble */}
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`text-[10px] font-bold ${
                              isAi ? 'text-[var(--sumi-faint)]' : 'text-blue-100'
                            }`}
                          >
                            {isAi ? session.aiPersona : 'Bạn'}
                          </span>
                          
                        </div>


                        {/* Quick Status Badge & Autonomy Chip for User message */}
                        {!isAi && msg.linguisticFeedback && (
                          <div className="flex items-center gap-1">
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
                            {msg.linguisticFeedback.speechDelivery?.turnAutonomyScore != null && getFeedbackStatus(msg.linguisticFeedback) !== 'error' && (
                              <span
                                className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold shadow-2xs ${
                                  msg.linguisticFeedback.speechDelivery.turnAutonomyScore >= 95
                                    ? 'bg-emerald-400 text-emerald-950'
                                    : msg.linguisticFeedback.speechDelivery.turnAutonomyScore >= 70
                                    ? 'bg-amber-300 text-amber-950'
                                    : 'bg-orange-300 text-orange-950'
                                }`}
                                title={msg.linguisticFeedback.speechDelivery.autonomyAssessment || 'Độ tự chủ lượt nói'}
                              >
                                <span>{msg.linguisticFeedback.speechDelivery.turnAutonomyScore >= 95 ? '100đ Tự chủ' : `${msg.linguisticFeedback.speechDelivery.turnAutonomyScore}đ Cấp ${msg.linguisticFeedback.speechDelivery.turnAutonomyScore >= 70 ? '1' : msg.linguisticFeedback.speechDelivery.turnAutonomyScore >= 50 ? '2' : '3'}`}</span>
                              </span>
                            )}
                          </div>
                        )}
                      </div>


                      {/* Japanese text (with furigana toggle support & 100% Vietnamese leak protection & Typewriter Streaming) */}
                      {isAi && streamingAiMessageId === msg.id ? (
                        <p className="text-base font-medium leading-relaxed tracking-wide min-h-[1.75rem]">
                          <TypewriterText
                            text={sanitizeDisplayJapanese(msg.japaneseText)}
                            baseSpeedMs={20}
                            onComplete={() => setStreamingAiMessageId(null)}
                          />
                        </p>
                      ) : showFurigana && msg.furiganaHtml ? (
                        <div
                          className="text-base font-medium leading-relaxed tracking-wide min-h-[1.75rem]"
                          dangerouslySetInnerHTML={{ __html: sanitizeDisplayJapanese(msg.furiganaHtml) }}
                        />
                      ) : (
                        <p className="text-base font-medium leading-relaxed tracking-wide min-h-[1.75rem]">
                          {sanitizeDisplayJapanese(showFurigana && msg.furiganaText ? msg.furiganaText : msg.japaneseText)}
                        </p>
                      )}


                      {/* Vietnamese translation (Fade-in mượt mà sau khi câu tiếng Nhật chạy hoặc khi xem lại) */}
                      {showTranslation && msg.vietnameseMeaning && msg.vietnameseMeaning.trim() !== msg.japaneseText.trim() && (
                        <div
                          className={`mt-2 border-t pt-2 text-xs leading-relaxed transition-all duration-500 ease-out ${
                            isAi ? 'border-[var(--line)] text-[var(--sumi-muted)]' : 'border-white/20 text-white/90'
                          } ${
                            isAi && streamingAiMessageId === msg.id
                              ? 'opacity-0 translate-y-1 pointer-events-none'
                              : 'opacity-100 translate-y-0'
                          }`}
                        >
                          <p>{msg.vietnameseMeaning}</p>
                        </div>
                      )}


                      {/* Tinh giản Pro UI: Hàng trạng thái & công cụ nhẹ nhàng cho câu thoại của học viên */}
                      {!isAi && (
                        <div className="mt-2 flex items-center justify-between gap-1.5 pt-1.5 border-t border-white/20 text-[10px]">
                          {/* Điểm tự chủ & Rõ ràng */}
                          <div className="flex items-center gap-1.5">
                            {msg.linguisticFeedback?.speechDelivery?.turnAutonomyScore != null && (
                              <span className={`inline-flex items-center px-1.5 py-0.5 rounded font-mono font-bold ${
                                getFeedbackStatus(msg.linguisticFeedback) === 'error'
                                  ? 'bg-rose-500/30 text-rose-200'
                                  : msg.linguisticFeedback.speechDelivery.turnAutonomyScore >= 95
                                  ? 'bg-emerald-500/30 text-emerald-100'
                                  : 'bg-amber-400/30 text-amber-100'
                              }`}>
                                {getFeedbackStatus(msg.linguisticFeedback) === 'error'
                                  ? '✕ 0đ'
                                  : msg.linguisticFeedback.speechDelivery.turnAutonomyScore >= 95
                                  ? '✓ 100đ'
                                  : `${msg.linguisticFeedback.speechDelivery.turnAutonomyScore}đ`}
                              </span>
                            )}
                            {msg.linguisticFeedback?.speechDelivery?.pronunciationClarityScore != null && (
                              <span className="font-mono text-blue-200/80">
                                {msg.linguisticFeedback.speechDelivery.pronunciationClarityScore}% rõ
                              </span>
                            )}
                          </div>

                          {/* Action tools */}
                          <div className="flex items-center gap-1 shrink-0">
                            {/* Nút Xem phân tích đánh giá */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedMessageId(msg.id);
                                setIsRightOpen(true);
                              }}
                              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium text-white/90 hover:bg-white/20 transition cursor-pointer"
                              title="Xem chi tiết phân tích ngữ pháp & phát âm"
                            >
                              <span>💡</span>
                              <span>Đánh giá</span>
                            </button>

                            {/* Nút Nói lại */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRedoTurn(msg.id);
                              }}
                              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium text-white/90 hover:bg-white/20 transition cursor-pointer"
                              title="Nói lại câu này"
                            >
                              <RefreshIcon className="w-3 h-3" />
                              <span>Nói lại</span>
                            </button>

                            {/* Nút nghe lại giọng bạn */}
                            {(msg.userAudioUrl || userAudioMapRef.current.get(msg.id)) && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const url = msg.userAudioUrl || userAudioMapRef.current.get(msg.id);
                                  if (url) handlePlayUserAudio(msg.id, url);
                                }}
                                className={`inline-flex items-center px-1.5 py-0.5 rounded font-medium transition cursor-pointer ${
                                  playingUserAudioId === msg.id ? 'bg-emerald-400 text-slate-900 font-bold' : 'text-white/90 hover:bg-white/20'
                                }`}
                                title="Nghe lại bản thu âm giọng bạn"
                              >
                                <span>{playingUserAudioId === msg.id ? 'Đang phát...' : 'Giọng bạn'}</span>
                              </button>
                            )}
                          </div>
                        </div>
                      )}

                      {/* AI Audio button with Soundwave equalizer */}
                      {isAi && (
                        <div
                          className={`mt-2 flex items-center gap-2 transition-all duration-500 ease-out ${
                            streamingAiMessageId === msg.id ? 'opacity-40 pointer-events-none' : 'opacity-100'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePlayMessageAudio(msg.id, msg.japaneseText);
                            }}
                            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold transition active:scale-95 shadow-2xs ${
                              playingMessageId === msg.id && isPlayingAiSpeech
                                ? 'border-[var(--ai)] bg-[var(--ai-soft)] text-[var(--ai)] font-bold shadow-xs'
                                : 'border-[var(--line)] bg-[var(--paper-100)] text-[var(--sumi-muted)] hover:bg-white hover:text-[var(--ai)] hover:border-[var(--ai)]'
                            }`}
                            title="Nghe phát âm tiếng Nhật của AI"
                          >
                            {playingMessageId === msg.id && isPlayingAiSpeech ? (
                              <span className="flex items-center gap-1.5 text-[var(--ai)]">
                                <span className="flex items-end gap-0.5 h-3.5">
                                  <span className="w-1 bg-[var(--ai)] rounded-full animate-[pulse_0.5s_ease-in-out_infinite] h-3" />
                                  <span className="w-1 bg-[var(--ai)] rounded-full animate-[pulse_0.7s_ease-in-out_infinite_0.15s] h-2" />
                                  <span className="w-1 bg-[var(--ai)] rounded-full animate-[pulse_0.4s_ease-in-out_infinite_0.3s] h-3.5" />
                                  <span className="w-1 bg-[var(--ai)] rounded-full animate-[pulse_0.6s_ease-in-out_infinite_0.1s] h-2.5" />
                                </span>
                                <span className="text-[11px] font-bold">Đang phát...</span>
                              </span>
                            ) : (
                              <>
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
                  <div className="shrink-0 pt-0.5">
                    <LivingAvatar
                      size="sm"
                      avatarState="thinking"
                      personaName={session.aiPersona}
                      personaRole={session.recommendedAiVoiceName?.split('(')[0].trim()}
                      scenarioTitle={session.scenarioTitle}
                      archetype={(session.sceneType as any) || undefined}
                      currentViseme="closed"
                      isAizuchiActive={false}
                      hideLabel
                    />
                  </div>
                  <div className="rounded-2xl rounded-tl-sm border border-[var(--line)] bg-white p-4 shadow-xs text-xs text-[var(--sumi-faint)] flex items-center gap-3">
                    <span className="flex gap-1">
                      <span className="h-2 w-2 rounded-full bg-[var(--ai)] animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="h-2 w-2 rounded-full bg-[var(--ai)] animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="h-2 w-2 rounded-full bg-[var(--ai)] animate-bounce" style={{ animationDelay: '300ms' }} />
                    </span>
                    <span className="font-semibold text-[var(--sumi)]">{session.aiPersona}</span>
                    <span>đang soạn câu trả lời...</span>
                  </div>
                </div>
              )}


              <div ref={messagesEndRef} />
            </div>
          </div>


          {/* HINT BAR & INPUT BAR */}
          <footer className="shrink-0 border-t border-[var(--line)] bg-[var(--paper-50)] p-3 md:p-4 z-10 shadow-sm">
            <div className="mx-auto w-full max-w-[760px] space-y-2.5">
              {/* Mic Permission / Error Warning */}
              {micError && (
                <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 animate-fade-in shadow-xs">
                  <div className="flex items-center gap-2">
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


              {/* HỘP GỢI Ý DUY NHẤT: GraduatedHintCard ZPD 3 CẤP HOẶC FLOATING CHIP NHẸ NHÀNG */}
              {hint && !isSending ? (
                isBlindMode ? (
                  <div className="rounded-2xl border border-amber-300 bg-amber-50/90 p-4 text-center text-xs font-bold text-amber-900 shadow-2xs flex items-center justify-center gap-2 animate-fade-in">
                    <span className="text-base">⚡</span>
                    <span>Chế độ Phản xạ (Blind Mode): Gợi ý tạm khóa để kích hoạt Active Recall. Hãy tự tin nói theo ý bạn!</span>
                  </div>
                ) : (
                <GraduatedHintCard
                  missionTitle={session?.missions?.find((m) => !m.isCompleted)?.content || 'Nhiệm vụ tiếp theo'}
                  keywords={
                    hint.keywords && hint.keywords.length > 0
                      ? hint.keywords
                      : session?.targetVocabularies?.map((v) => v.word).filter((w) => containsJapanese(w))
                  }
                  clozeSentence={hint.clozeSentence}
                  fullJapaneseSample={hint.suggestedJapaneseText || hint.japaneseSuggestion || ''}
                  furiganaHtml={hint.furiganaHtml || (hint as any).suggestedFuriganaHtml}
                  vietnameseMeaning={hint.suggestedVietnameseMeaning || hint.vietnameseMeaning}
                  lockedTier={hintLevelUsedRef.current}
                  onUseHint={(sentence, tier) => {
                    hintLevelUsedRef.current = Math.max(hintLevelUsedRef.current, tier);
                    setAppliedHintTier(tier);
                    triggerFloatingDeduction(tier);
                    setInputText(sentence);
                    clearAllAssistance();
                    const penalty = tier === 1 ? 10 : tier === 2 ? 30 : 60;
                    setToastMessage(`Đã nạp gợi ý Cấp ${tier} vào ô nhập (Tự chủ dự kiến: ${100 - penalty}/100đ)`);
                    setTimeout(() => setToastMessage(null), 3500);
                  }}
                  onTierChange={(tier) => {
                    hintLevelUsedRef.current = Math.max(hintLevelUsedRef.current, tier);
                    setAppliedHintTier(tier);
                    triggerFloatingDeduction(tier);
                  }}
                  onPlaySampleAudio={(textToPlay) => {
                    const text = textToPlay || hint.suggestedJapaneseText || hint.japaneseSuggestion;
                    if (text) void scenarioVoiceService.playAiSpeech(text, learnerVoiceId || 2);
                  }}
                  onClose={clearAllAssistance}
                  />
                )
              ) : showProactiveHint && !isSending && !session?.isNaturallyConcluded ? (
                <div className="flex items-center justify-between gap-3 rounded-full border border-[var(--ai)]/20 bg-gradient-to-r from-[var(--ai-soft)] via-white to-sky-50/70 px-4 py-1.5 shadow-xs animate-fadeIn text-xs select-none">
                  <div className="flex items-center gap-2 min-w-0">
                                        <span className="font-semibold text-[var(--sumi)] truncate">
                      {session.aiPersona || 'AI'} đang chờ bạn — cần gợi ý đối đáp không?
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => void handleGetInstantHint()}
                      className="px-3 py-1 rounded-full bg-[var(--ai)] text-white text-[11px] font-bold hover:bg-[var(--ai-hover)] transition shadow-2xs cursor-pointer active:scale-95"
                    >
                      Xem gợi ý ➔
                    </button>
                    <button
                      type="button"
                      onClick={clearAllAssistance}
                      className="text-slate-400 hover:text-slate-700 text-xs font-bold cursor-pointer"
                      title="Đóng"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ) : null}


              {/* Input Row */}
              {/* Applied Hint Feedback Banner - Monotonic locked */}
              {appliedHintTier !== null && !hint && (
                <div className="flex items-center justify-between gap-2 px-3 py-1 rounded-xl bg-amber-50/95 border border-amber-300 text-[11px] text-amber-900 shadow-2xs font-sans animate-fade-in">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-amber-700">🔒 Cấp {appliedHintTier}:</span>
                    <span>Tự chủ tối đa: <strong>{appliedHintTier === 1 ? '90' : appliedHintTier === 2 ? '70' : '40'}/100đ</strong></span>
                    <span className="text-[10px] text-amber-700/80">(Không hoàn lại khi đổi cấp)</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAppliedHintTier(null)}
                    className="text-amber-700 hover:text-amber-950 font-bold text-xs p-0.5 cursor-pointer"
                    title="Ẩn thông báo"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* Input Row or Session Completed Banner */}
              {session?.status === 'Completed' || session?.status === 'Abandoned' ? (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 rounded-3xl bg-emerald-50/90 border border-emerald-300 text-xs shadow-xs font-sans">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shrink-0"><CheckCircleIcon className="w-5 h-5" /></div>
                    <div>
                      <p className="font-bold text-emerald-950 text-sm">
                        Phiên luyện tập đã hoàn thành!
                      </p>
                      <p className="text-[11px] text-emerald-800">
                        Toàn bộ lượt thoại và chỉ số năng lực đã được lưu lại an toàn. Bạn có thể xem bảng kết quả chi tiết.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate(`/roleplay/results/${session.sessionId || session.id || sessionId}`)}
                    className="shrink-0 px-4 py-2 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm transition active:scale-95 cursor-pointer"
                  >
                    Xem kết quả đánh giá ➔
                  </button>
                </div>
              ) : (
              <form onSubmit={handleSendMessage} className="flex items-center gap-2">
                {/* Button xin Hint (Tức thì < 5ms) */}
                <button
                  type="button"
                  onClick={() => handleGetInstantHint()}
                  disabled={isSending}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-2xl border border-[var(--line)] bg-white px-3.5 py-2.5 text-xs font-bold text-[var(--ai)] transition hover:bg-[var(--ai-soft)] hover:border-[var(--ai)] active:scale-95 shadow-2xs"
                  title="Xin AI gợi ý cách đáp lời"
                >
                  {isLoadingHint ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--ai)]/20 border-t-[var(--ai)]" />
                  ) : (
                    <span className="flex items-center gap-1.5"><LightbulbIcon className="w-3.5 h-3.5 text-[var(--ai)]" /><span>Gợi ý</span></span>
                  )}
                </button>


                {/* Button Micro thu âm (Voice Input với hiệu ứng Breathing Glow & Inner Ring) */}
                <div className="relative inline-flex shrink-0">
                  <button
                    type="button"
                    onClick={handleToggleMic}
                    disabled={isSending || isProcessingStt}
                    className={`relative z-10 inline-flex items-center justify-center gap-1.5 rounded-2xl px-3.5 py-2.5 text-xs font-bold transition-all shadow-xs cursor-pointer select-none disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden ${
                      isProcessingStt
                        ? 'border border-[var(--ai)] bg-[var(--ai-soft)] text-[var(--ai)] min-w-[105px]'
                        : isRecordingMic
                        ? 'border border-rose-500 bg-rose-600 text-white ring-4 ring-rose-400/25 shadow-md min-w-[96px] animate-pulse'
                        : 'border border-[var(--line)] bg-white text-[var(--sumi)] hover:border-[var(--ai)] hover:text-[var(--ai)] hover:bg-[var(--ai-soft)] hover:shadow-sm active:scale-95 min-w-[80px]'
                    }`}
                    title={
                      isProcessingStt
                        ? 'Đang nhận diện giọng nói...'
                        : isRecordingMic
                        ? 'Đang bật mic (Bấm để dừng)'
                        : isWhisperEngineOnline
                        ? 'Nói tiếng Nhật (Hỗ trợ Whisper STT)'
                        : 'Bấm để nói tiếng Nhật bằng micro'
                    }
                  >
                    {/* Thanh đếm im lặng thông minh bên trong button, không tràn viền */}
                    {isRecordingMic && silenceCountdownProgress > 0 && (
                      <span 
                        className="absolute bottom-0 left-0 h-1 bg-white/70 transition-all duration-75 ease-linear rounded-full pointer-events-none"
                        style={{ width: `${Math.max(0, Math.min(100, (1 - silenceCountdownProgress) * 100))}%` }}
                      />
                    )}

                    {isProcessingStt ? (
                      <span className="flex items-center gap-1.5">
                        <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-[var(--ai)]/30 border-t-[var(--ai)]" />
                        <span className="text-[11px] font-semibold whitespace-nowrap">Nhận diện...</span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5">
                        <svg className={`w-3.5 h-3.5 shrink-0 ${isRecordingMic ? 'text-white' : 'text-[var(--ai)]'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                        </svg>
                        <span className="whitespace-nowrap flex items-center gap-1.5">
                          <span>{isRecordingMic ? `${recordingDurationSec.toFixed(1)}s` : 'Nói'}</span>
                          {!isRecordingMic && (
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${isWhisperEngineOnline ? 'bg-emerald-500 shadow-xs' : 'bg-amber-400'}`}
                              title={isWhisperEngineOnline ? 'Whisper STT (Local Engine) đang hoạt động' : 'Web Speech API (Trình duyệt)'}
                            />
                          )}
                        </span>
                      </span>
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
                      ? 'Đang lắng nghe giọng nói tiếng Nhật của bạn...'
                      : 'Nhập câu trả lời bằng tiếng Nhật... (Enter để gửi)'
                  }
                  disabled={isSending}
                  className={`flex-1 min-w-0 rounded-xl border px-3 sm:px-4 py-2.5 text-sm text-[var(--sumi)] outline-none transition ${
                    isRecordingMic
                      ? 'border-red-300 bg-red-50/40 ring-2 ring-red-200'
                      : 'border-[var(--line)] bg-[var(--paper-50)] focus:border-[var(--ai)] focus:bg-white focus:ring-2 focus:ring-[var(--ai)]/20'
                  }`}
                />


                {/* Nút nghe đọc mẫu câu học viên vừa gõ trước khi gửi (compact icon) */}
                {inputText.trim() && (
                  <button
                    type="button"
                    onClick={() => handlePlayLearnerSample(inputText)}
                    className="inline-flex shrink-0 items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--ai-soft)] p-2.5 text-xs font-bold text-[var(--ai)] hover:bg-[var(--paper-200)] active:scale-95 transition"
                    title="Nghe phát âm chuẩn câu bạn vừa nhập trước khi gửi"
                  >
                    {isPlayingLearnerSample && playingLearnerText === inputText ? (
                      <span className="flex items-end gap-0.5 h-3">
                        <span className="w-1 bg-[var(--ai)] rounded-full animate-[pulse_0.5s_ease-in-out_infinite] h-3" />
                        <span className="w-1 bg-[var(--ai)] rounded-full animate-[pulse_0.7s_ease-in-out_infinite_0.15s] h-2" />
                        <span className="w-1 bg-[var(--ai)] rounded-full animate-[pulse_0.4s_ease-in-out_infinite_0.3s] h-3.5" />
                      </span>
                    ) : (
                      <VolumeIcon className="w-4 h-4 text-[var(--ai)]" />
                    )}
                  </button>
                )}

                {/* Send Button */}
                <button
                  type="submit"
                  disabled={!inputText.trim() || isSending}
                  className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-[var(--ai)] px-4 sm:px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-[var(--ai-hover)] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
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
              )}


              <div className="flex items-center justify-between text-[11px] text-[var(--sumi-faint)]">
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
          className={`shrink-0 border-l border-[var(--line)] bg-[var(--paper-50)] flex flex-col z-10 overflow-hidden transition-all duration-300 ease-in-out ${
            isRightOpen
              ? 'w-72 lg:w-80 max-w-[30vw] opacity-100 shadow-sm'
              : 'w-0 border-l-0 opacity-0 pointer-events-none'
          }`}
        >
          <div className="w-72 lg:w-80 flex flex-col h-full shrink-0">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[var(--line)] bg-white/60 backdrop-blur-xs px-4 py-3">
              <div className="flex items-center gap-2">
                                <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--sumi)] font-sans">
                  Đánh giá lượt nói
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsRightOpen(false)}
                className="inline-flex items-center gap-1 rounded-xl border border-[var(--line)] px-2.5 py-1 text-xs font-semibold text-[var(--sumi-muted)] hover:bg-[var(--paper-100)] hover:text-[var(--ai)] hover:border-[var(--line-strong)] active:scale-95 transition"
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
                  <div className="rounded-xl border border-[var(--line)] bg-[var(--paper-50)] p-3 text-xs">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--sumi-faint)]">
                      Câu của bạn:
                    </p>
                    <p className="mt-1 font-bold text-sm text-[var(--ai)] break-words">
                      "{selectedMessage.japaneseText}"
                    </p>
                    {selectedMessage.vietnameseMeaning && (
                      <p className="mt-0.5 text-[var(--sumi-faint)] break-words">{selectedMessage.vietnameseMeaning}</p>
                    )}
                  </div>


                  {/* So sánh phát âm A/B (Giọng bạn vs Mẫu bản xứ) & Chỉ số lưu loát */}
                  <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-3 text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-indigo-950 flex items-center gap-1.5">
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
                                                        <span>{selectedMessage.linguisticFeedback.speechDelivery.latencyAssessment}</span>
                          </div>
                        )}
                        {typeof selectedMessage.linguisticFeedback.speechDelivery.speechConfidence === 'number' && (
                          <div className="flex items-center gap-1.5 text-[11px] text-indigo-900 font-medium">
                                                        <span>Độ rõ âm (Acoustic Clarity): {Math.round(selectedMessage.linguisticFeedback.speechDelivery.speechConfidence * 100)}%</span>
                          </div>
                        )}
                        {selectedMessage.linguisticFeedback.speechDelivery.moraRate != null && (
                          <div className="flex items-center gap-1.5 text-[11px] text-indigo-900 font-medium">
                                                        <span>Tốc độ Mora: {selectedMessage.linguisticFeedback.speechDelivery.moraRate} mora/s (chuẩn người Nhật ~5.0 - 7.5)</span>
                          </div>
                        )}
                        {selectedMessage.linguisticFeedback.speechDelivery.turnAutonomyScore != null && (
                          <div className="mt-1 pt-1.5 border-t border-indigo-100/60 flex flex-col gap-0.5">
                            <div className="flex items-center justify-between text-[11px] font-bold">
                              <span className="flex items-center gap-1 text-slate-700">
                                                                <span>Độ tự chủ lượt này:</span>
                              </span>
                              <span className={selectedMessage.linguisticFeedback.speechDelivery.turnAutonomyScore >= 95 ? 'text-emerald-700' : 'text-amber-700'}>
                                {selectedMessage.linguisticFeedback.speechDelivery.turnAutonomyScore}/100
                              </span>
                            </div>
                            {selectedMessage.linguisticFeedback.speechDelivery.autonomyAssessment && (
                              <span className="text-[10px] text-slate-500 italic">
                                {selectedMessage.linguisticFeedback.speechDelivery.autonomyAssessment}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>


                  {/* Summary & Quick Badge */}
                  <div className="rounded-xl border border-[var(--line)]/40 bg-[var(--ai-soft)]/40 p-3 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[var(--sumi)]">Nhận xét chung</span>
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
                    <p className="mt-1.5 text-[var(--sumi-faint)] leading-relaxed break-words">
                      {selectedMessage.linguisticFeedback.summary || 'Đã ghi nhận câu nói.'}
                    </p>
                  </div>


                  {/* Detailed Criterion Blocks */}
                  <div className="space-y-2.5 text-xs">
                    {/* Render mảng details từ Gemini API nếu có */}
                    {selectedMessage.linguisticFeedback.details && selectedMessage.linguisticFeedback.details.length > 0 ? (
                      selectedMessage.linguisticFeedback.details.map((detail, idx) => (
                        <div key={idx} className="rounded-xl border border-[var(--line)] p-3 bg-white shadow-2xs">
                          <div className="flex items-center gap-1.5 font-bold text-[var(--sumi)]">
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
                          <p className="mt-1 text-[var(--sumi-faint)] leading-relaxed break-words">{detail.comment}</p>
                        </div>
                      ))
                    ) : (
                      <>
                        {/* Grammar */}
                        {selectedMessage.linguisticFeedback.grammarAssessment && (
                          <div className="rounded-xl border border-[var(--line)] p-3 bg-white shadow-2xs">
                            <div className="flex items-center gap-1.5 font-bold text-[var(--sumi)]">
                                                            <span>Ngữ pháp & Trợ từ</span>
                            </div>
                            <p className="mt-1 text-[var(--sumi-faint)] leading-relaxed break-words">
                              {selectedMessage.linguisticFeedback.grammarAssessment}
                            </p>
                          </div>
                        )}


                        {/* Vocabulary */}
                        {selectedMessage.linguisticFeedback.vocabularyAssessment && (
                          <div className="rounded-xl border border-[var(--line)] p-3 bg-white shadow-2xs">
                            <div className="flex items-center gap-1.5 font-bold text-[var(--sumi)]">
                                                            <span>Dùng từ & Độ tự nhiên</span>
                            </div>
                            <p className="mt-1 text-[var(--sumi-faint)] leading-relaxed break-words">
                              {selectedMessage.linguisticFeedback.vocabularyAssessment}
                            </p>
                          </div>
                        )}


                        {/* Politeness */}
                        {selectedMessage.linguisticFeedback.politenessAssessment && (
                          <div className="rounded-xl border border-[var(--line)] p-3 bg-white shadow-2xs">
                            <div className="flex items-center gap-1.5 font-bold text-[var(--sumi)]">
                                                            <span>Sắc thái & Kính ngữ</span>
                            </div>
                            <p className="mt-1 text-[var(--sumi-faint)] leading-relaxed break-words">
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
                                                <span>Cách diễn đạt tự nhiên hơn</span>
                      </div>
                      <p className="mt-1.5 font-bold text-sm text-[var(--sumi)] break-words">
                        {selectedMessage.linguisticFeedback.naturalAlternative}
                      </p>
                    </div>
                  )}


                  {/* Cultural Tip */}
                  {selectedMessage.linguisticFeedback.culturalTip && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 text-xs">
                      <div className="flex items-center gap-1.5 font-bold text-amber-900">
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
                          ? 'border-[var(--ai)] bg-[var(--ai-soft)] text-[var(--ai)]'
                          : 'border-[var(--line)] bg-white text-[var(--sumi-muted)] hover:border-[var(--ai)] hover:text-[var(--ai)]'
                      }`}
                      title="Nghe giọng AI đọc câu gợi ý chuẩn bản xứ này"
                    >
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
                        setToastMessage('Đã sao chép câu mẫu vào bộ nhớ tạm!');
                        setTimeout(() => {
                          setCopiedFeedbackText(false);
                          setToastMessage(null);
                        }, 2500);
                      }}
                      className={`inline-flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold shadow-2xs transition ${
                        copiedFeedbackText
                          ? 'bg-emerald-600 text-white'
                          : 'bg-[var(--ai)] text-white hover:bg-[var(--ai-hover)]'
                      }`}
                      title="Sao chép câu bản xứ vào clipboard để ghi chú hoặc tra từ điển"
                    >
                      <span>{copiedFeedbackText ? '✓' : ''}</span>
                      <span>{copiedFeedbackText ? 'Đã sao chép' : 'Chép câu mẫu'}</span>
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex h-full flex-col items-center justify-center text-center text-xs text-[var(--sumi-faint)] py-12">
                                    <p className="font-semibold text-[var(--sumi)]">Chưa chọn lượt nói</p>
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
          className={`absolute top-4 right-0 z-30 flex items-center gap-2 rounded-l-xl border border-r-0 border-[var(--ai)]/30 bg-white px-3 py-2.5 text-xs font-bold text-[var(--ai)] shadow-md hover:bg-[var(--ai-soft)] hover:pl-4 transition-all duration-300 ease-in-out ${
            !isRightOpen && selectedMessage?.linguisticFeedback
              ? 'translate-x-0 opacity-100 pointer-events-auto'
              : 'translate-x-full opacity-0 pointer-events-none'
          }`}
          title="Mở rộng bảng đánh giá lượt nói"
        >
          <span>◀</span>
          <span>Đánh giá</span>
                  </button>
      </div>


      {/* ============================================================ */}
      {/* 4. MODAL XÁC NHẬN KẾT THÚC PHIÊN                             */}
      {/* ============================================================ */}
      {showEndModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-fade-in">
          <div className="w-full max-w-md rounded-3xl bg-[var(--paper-50)] border border-[var(--line)] p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div
                className={`flex h-11 w-11 items-center justify-center rounded-2xl text-xl shadow-xs ${
                  isAllMissionsCompleted
                    ? 'bg-emerald-100 text-emerald-600'
                    : 'bg-amber-100 text-amber-600'
                }`}
              >
                {isAllMissionsCompleted ? '🏆' : '🚪'}
              </div>
              <div>
                <h3 className="text-base font-bold text-[var(--sumi)] font-sans">
                  {isAllMissionsCompleted ? 'Hoàn thành phiên luyện tập' : 'Kết thúc phiên sớm?'}
                </h3>
                <p className="text-xs text-[var(--sumi-faint)]">
                  Kịch bản: {session.scenarioTitle} (JLPT {session.level || session.jlptLevel})
                </p>
              </div>
            </div>


            <div className="rounded-2xl bg-white p-3.5 text-xs space-y-1.5 border border-[var(--line)] shadow-2xs">
              <div className="flex justify-between">
                <span className="text-[var(--sumi-faint)]">Tiến độ nhiệm vụ:</span>
                <span className="font-bold text-[var(--ai)]">
                  {completedMissionsCount} / {totalMissionsCount} hoàn thành
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--sumi-faint)]">Số lượt hội thoại:</span>
                <span className="font-medium text-[var(--sumi)]">{session.messages.length} lượt</span>
              </div>
              {session.isNaturallyConcluded ? (
                <p className="mt-2 text-emerald-700 font-semibold text-[11px]">
                  Cuộc hội thoại đã kết thúc trọn vẹn và tự nhiên (+Điểm ấn tượng)!
                </p>
              ) : isAllMissionsCompleted ? (
                <p className="mt-2 text-emerald-700 font-semibold text-[11px]">
                  ✓ Bạn đã hoàn thành 100% nhiệm vụ! Có thể nói lời chào tạm biệt để cộng thêm điểm ấn tượng hoặc hoàn thành ngay.
                </p>
              ) : null}
            </div>


            <p className="text-xs text-[var(--sumi-muted)] leading-relaxed">
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
                className="rounded-2xl border border-[var(--line)] bg-white px-4 py-2 text-xs font-semibold text-[var(--sumi-muted)] hover:bg-[var(--paper-100)] active:scale-95 transition"
              >
                Tiếp tục nói chuyện
              </button>
              <button
                type="button"
                onClick={handleConfirmEnd}
                disabled={isEnding}
                className={`rounded-2xl px-5 py-2 text-xs font-bold text-white transition active:scale-95 ${
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
          <div className="w-full max-w-md rounded-3xl bg-[var(--paper-50)] border border-[var(--line)] p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl text-xl bg-[var(--ai-soft)] text-[var(--ai)] shadow-xs">
                <span>⏸️</span>
              </div>
              <div>
                <h3 className="text-base font-bold text-[var(--sumi)] font-sans">Tạm dừng phiên luyện tập?</h3>
                <p className="text-xs text-[var(--sumi-faint)]">
                  Kịch bản: {session?.scenarioTitle} (JLPT {session?.level || session?.jlptLevel})
                </p>
              </div>
            </div>


            <div className="rounded-2xl bg-white p-3.5 text-xs space-y-1.5 border border-[var(--line)] shadow-2xs">
              <div className="flex justify-between">
                <span className="text-[var(--sumi-faint)]">Tiến độ hiện tại:</span>
                <span className="font-bold text-[var(--ai)]">
                  {completedMissionsCount} / {totalMissionsCount} nhiệm vụ đã xong
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--sumi-faint)]">Số lượt đã nói:</span>
                <span className="font-medium text-[var(--sumi)]">{session?.messages.length ?? 0} lượt</span>
              </div>
            </div>


            <p className="text-xs text-[var(--sumi-muted)] leading-relaxed">
              Tiến độ bài học và toàn bộ hội thoại của bạn đã được <strong>tự động lưu</strong>. Bạn có thể quay lại tiếp tục luyện tập bất cứ lúc nào từ trang kịch bản mà không bị mất dữ liệu.
            </p>


            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowLeaveModal(false)}
                className="rounded-2xl border border-[var(--line)] bg-white px-4 py-2 text-xs font-semibold text-[var(--sumi-muted)] hover:bg-[var(--paper-100)] active:scale-95 transition"
              >
                Ở lại luyện tiếp
              </button>
              <button
                type="button"
                onClick={handleConfirmLeave}
                className="rounded-2xl bg-[var(--ai)] px-4 py-2 text-xs font-bold text-white hover:bg-[var(--ai-hover)] shadow-sm active:scale-95 transition"
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
      {/* Loading Overlay khi đang hoàn tất phiên & tổng hợp kết quả */}
      {isEnding && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-900/80 backdrop-blur-sm text-white select-none animate-fadeIn">
          <div className="w-14 h-14 rounded-full border-4 border-white/20 border-t-white animate-spin mb-4 shadow-xl" />
          <h3 className="text-base font-bold font-sans">Đang hoàn tất phiên luyện tập...</h3>
          <p className="text-xs text-white/80 mt-1 font-sans">Hệ thống đang tổng hợp điểm số và phân tích năng lực Kaiwa của bạn</p>
        </div>
      )}

      {/* ============================================================ */}
      {/* Game-like Floating Score Deduction Pill */}
      {floatingDeduction && (
        <div
          key={floatingDeduction.id}
          className="pointer-events-none fixed bottom-28 left-1/2 -translate-x-1/2 z-[100] px-4 py-1.5 rounded-full bg-rose-600/95 text-white font-extrabold text-xs shadow-lg animate-float-deduct flex items-center gap-1.5 border border-rose-300 select-none"
        >
          <span>⚡</span>
          <span>{floatingDeduction.text}</span>
        </div>
      )}

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
