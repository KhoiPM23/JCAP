import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { shadowingService } from '../../services/shadowingService';
import { shadowingStorageService } from '../../services/shadowingStorageService';
import type {
  ShadowingDialogueDetail,
  ShadowingSentenceItem,
  ShadowingSentencePracticeResult,
  ShadowingAudioEvaluationResult,
  ShadowingDiffToken,
  ShadowingFluencyMetrics,
} from '../../types/shadowing';
import { RoleSelectionModal } from '../../components/shadowing/RoleSelectionModal';
import { AudioDeviceSettingsModal } from '../../components/shadowing/AudioDeviceSettingsModal';
import { voicevoxService, type VoiceOption } from '../../services/voicevoxService';
import RecordingBar from '../../components/shadowing/RecordingBar';
import { audioMetricsService, measureRecordedBlob, type AudioQualityMetrics, type AudioGateStatus } from '../../services/audioMetricsService';
import { useAuth } from '../../contexts/AuthContext';
import { SpeechTranscriptCollector } from '../../utils/speechTranscriptCollector';
import { pickRecordingMimeType, resolveRecordedMime } from '../../utils/recordingMime';
import { blobToAnalysisWav } from '../../utils/wavEncoder';
import { summarizeSessionScores } from '../../utils/shadowingSessionScores';
import { JapaneseSentenceDiffView } from '../../components/shadowing/JapaneseSentenceDiffView';
import { ShadowingSentenceResultCard } from '../../components/shadowing/ShadowingSentenceResultCard';

// Chặn trên (ms) khi chờ sự kiện kết thúc của MediaRecorder / Web Speech sau khi bấm dừng.
const RECORDER_SETTLE_TIMEOUT_MS = 2000;
// Chờ kết quả cuối của Web Speech có chặn trên để không làm chậm việc chấm: kết quả cuối thường về trong < 0.6 s sau khi dừng;
// quá hạn thì chỉ dùng phần đã chốt (không bao giờ dùng interim).
const SPEECH_SETTLE_TIMEOUT_MS = 600;
const MAX_RECOGNITION_RESTARTS = 5;

const GATE_LABELS: Record<AudioGateStatus, string> = {
  good: 'Tốt',
  acceptable: 'Chấp nhận được',
  needs_retry: 'Cần thu lại',
  unmeasured: 'Chưa đo được',
};

const settleWithin = (promise: Promise<unknown>, ms: number): Promise<void> =>
  Promise.race([
    promise.then(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, ms)),
  ]);

export const LearnerShadowingPracticeView: React.FC = () => {
  const { id } = useParams<{ id?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  // Active JLPT level selector (N5, N4, N3 - default N4 as per prototype)
  const initialLevel = (searchParams.get('level')?.toUpperCase() as 'N5' | 'N4' | 'N3') || 'N4';
  const [selectedLevel, setSelectedLevel] = useState<'N5' | 'N4' | 'N3'>(initialLevel);

  const [dialogue, setDialogue] = useState<ShadowingDialogueDetail | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Learner Role selection: 'A' or 'B'
  const roleParam = (searchParams.get('role')?.toUpperCase() as 'A' | 'B') || 'A';
  const [userRole, setUserRole] = useState<'A' | 'B'>(roleParam);
  const [isRoleModalOpen, setIsRoleModalOpen] = useState<boolean>(false);

  // Practice turn tracking: start at sentence index 0
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState<number>(0);
  const [sentenceResults, setSentenceResults] = useState<Map<number, ShadowingSentencePracticeResult>>(new Map());
  const [practiceStartTime] = useState<number>(Date.now());
  const [sessionDurationSeconds, setSessionDurationSeconds] = useState<number>(0);

  // Recording & State
  type PracticeState = 'ready' | 'listening' | 'analyzing' | 'evaluated' | 'opponent-speaking' | 'completed';
  const [practiceState, setPracticeState] = useState<PracticeState>('ready');
  const [currentRecognizedText, setCurrentRecognizedText] = useState<string>('');
  const [currentScore, setCurrentScore] = useState<number>(0);
  // null = chưa đo được (không phải 0)
  const [currentFluencyMetrics, setCurrentFluencyMetrics] = useState<ShadowingFluencyMetrics | null>(null);
  const [currentGateDetail, setCurrentGateDetail] = useState<string>('');
  const [currentDiffTokens, setCurrentDiffTokens] = useState<ShadowingDiffToken[]>([]);
  const [currentEvaluationStatus, setCurrentEvaluationStatus] = useState<'completed' | 'partial' | 'unavailable' | 'failed'>('completed');
  // Nguồn nhận dạng đã dùng cho kết quả hiện tại (backend ghi nhận)
  const [currentRecognitionSource, setCurrentRecognitionSource] = useState<'gemini' | 'web_speech' | null>(null);
  const [sentenceAttemptsMap, setSentenceAttemptsMap] = useState<Map<number, number>>(new Map());
  const latestAttemptIsBestRef = useRef<boolean>(true);
  const [micError, setMicError] = useState<string | null>(null);
  const [isOpponentPausedForResume, setIsOpponentPausedForResume] = useState<boolean>(false);

  // Audio Playback
  const [isPlayingAudio, setIsPlayingAudio] = useState<boolean>(false);
  const [loadingAudioSentenceId, setLoadingAudioSentenceId] = useState<number | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  // MediaRecorder & Playback for user recordings
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedAudioChunksRef = useRef<Blob[]>([]);
  const [recordedAudioUrls, setRecordedAudioUrls] = useState<Map<number, string>>(new Map());
  const [playingUserAudioSentenceId, setPlayingUserAudioSentenceId] = useState<number | null>(null);
  const userAudioPlayerRef = useRef<HTMLAudioElement | null>(null);

  // Web Speech Recognition & Auto-scroll
  const recognitionRef = useRef<any>(null);
  const isRecordingRef = useRef<boolean>(false);
  // Gom transcript đã chốt qua các lần Web Speech tự khởi động lại
  const collectorRef = useRef<SpeechTranscriptCollector>(new SpeechTranscriptCollector());
  const recognitionRestartCountRef = useRef<number>(0);
  const recordedMimeRef = useRef<string>('');
  const recorderStoppedRef = useRef<Promise<void> | null>(null);
  // Tăng mỗi khi hủy/thu lại để bỏ qua kết quả đến muộn
  const evaluationSeqRef = useRef<number>(0);
  const isSubmittingRef = useRef<boolean>(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // Modals & Slideovers (Mặc định ẩn nội dung khi lần đầu vào trang, mũi tên hướng xuống)
  const [isSituationCollapsed, setIsSituationCollapsed] = useState<boolean>(true);
  const [isDialogueContentCollapsed, setIsDialogueContentCollapsed] = useState<boolean>(true);
  const [isFullScriptModalOpen, setIsFullScriptModalOpen] = useState<boolean>(false);
  const [isCompletedModalOpen, setIsCompletedModalOpen] = useState<boolean>(false);
  // Lưu buổi luyện vào lịch sử ở backend: idle (chưa lưu / không có câu nào được chấm) | saving | saved | failed
  const [historySaveState, setHistorySaveState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const [historySaveMessage, setHistorySaveMessage] = useState<string>('');
  const [isAudioDeviceModalOpen, setIsAudioDeviceModalOpen] = useState<boolean>(false);
  const [selectedAudioInputDeviceId, setSelectedAudioInputDeviceId] = useState<string>(
    localStorage.getItem('jcap_audio_input_device') || ''
  );
  const [selectedAudioOutputDeviceId, setSelectedAudioOutputDeviceId] = useState<string>(
    localStorage.getItem('jcap_audio_output_device') || ''
  );

  // VOICEVOX TTS Integration
  const [availableVoices, setAvailableVoices] = useState<VoiceOption[]>([]);
  const initialSavedVoiceId = Number(localStorage.getItem('jcap_voicevox_selected_id')) || 3;
  const [selectedVoiceVoxId, setSelectedVoiceVoxId] = useState<number>(initialSavedVoiceId);
  const selectedVoiceVoxIdRef = useRef<number>(initialSavedVoiceId);

  // Nạp danh sách Voice từ Backend (VOICEVOX) khi khởi tạo
  useEffect(() => {
    voicevoxService
      .getVoices()
      .then((list) => {
        setAvailableVoices(list);
        const savedId = Number(localStorage.getItem('jcap_voicevox_selected_id'));
        if (savedId && list.some((v) => v.id === savedId)) {
          setSelectedVoiceVoxId(savedId);
          selectedVoiceVoxIdRef.current = savedId;
        } else if (list.length > 0 && !list.some((v) => v.id === selectedVoiceVoxIdRef.current)) {
          setSelectedVoiceVoxId(list[0].id);
          selectedVoiceVoxIdRef.current = list[0].id;
        }
      })
      .catch(() => {
        // Nếu VOICEVOX offline, hệ thống sẽ tự động fallback sang Web Speech API
      });

    return () => {
      voicevoxService.clearCache();
    };
  }, []);

  // Translations visibility toggles
  const [showTranslations, setShowTranslations] = useState<Record<number, boolean>>({});

  // Synchronization refs to avoid stale closure races and unwanted auto-play
  const userRoleRef = useRef<'A' | 'B'>(userRole);
  const turnIdRef = useRef<number>(0);
  const turnTimeoutRef = useRef<any>(null);
  const isSpeechCancelledRef = useRef<boolean>(false);
  const dialogueRef = useRef<ShadowingDialogueDetail | null>(null);

  // Keep refs in sync
  useEffect(() => {
    userRoleRef.current = userRole;
  }, [userRole]);

  useEffect(() => {
    dialogueRef.current = dialogue;
  }, [dialogue]);

  // Centralized audio & timer stopper
  const stopAllAudio = () => {
    turnIdRef.current += 1;
    isSpeechCancelledRef.current = true;

    if (turnTimeoutRef.current) {
      clearTimeout(turnTimeoutRef.current);
      turnTimeoutRef.current = null;
    }

    if (audioPlayerRef.current) {
      audioPlayerRef.current.onended = null;
      audioPlayerRef.current.onerror = null;
      audioPlayerRef.current.pause();
      audioPlayerRef.current.currentTime = 0;
      audioPlayerRef.current = null;
    }

    if (userAudioPlayerRef.current) {
      userAudioPlayerRef.current.onended = null;
      userAudioPlayerRef.current.onerror = null;
      userAudioPlayerRef.current.pause();
      userAudioPlayerRef.current.currentTime = 0;
      userAudioPlayerRef.current = null;
    }

    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }

    setIsPlayingAudio(false);
    setPlayingUserAudioSentenceId(null);
  };

  // 1. Fetch dialogue detail from real backend API (strictly dependent on id, NOT userRole)
  useEffect(() => {
    let isCancelled = false;

    const loadDialogue = async () => {
      setIsLoading(true);
      setErrorMessage(null);

      if (!id) {
        setErrorMessage('Thiếu mã bài học Shadowing (ID). Vui lòng chọn một bài học từ Thư viện.');
        setIsLoading(false);
        return;
      }

      try {
        const targetId = parseInt(id, 10);
        if (isNaN(targetId)) {
          setErrorMessage('Mã bài học không hợp lệ.');
          setIsLoading(false);
          return;
        }

        const res = await shadowingService.getDetail(targetId);

        if (isCancelled) return;

        if (res.success && res.data) {
          setDialogue(res.data);
          dialogueRef.current = res.data;
          if (res.data.jlptLevel) {
            setSelectedLevel(res.data.jlptLevel as 'N5' | 'N4' | 'N3');
          }

          stopAllAudio();

          const isResume = searchParams.get('resume') === 'true';
          const isRestart = searchParams.get('restart') === 'true';
          const learnerId = user?.id || user?.email || 'guest_learner';
          const savedProgress = shadowingStorageService.getProgress(learnerId, targetId);

          let initialIndex = 0;
          let effectiveRole = userRoleRef.current;

          if (isRestart) {
            const firstSentenceText = res.data.sentences[0]?.japaneseText;
            effectiveRole = userRoleRef.current;
            shadowingStorageService.restartProgress(
              learnerId,
              {
                id: res.data.id,
                title: res.data.title,
                subtitle: res.data.scenarioTitle,
                totalSentences: res.data.sentences.length,
                jlptLevel: res.data.jlptLevel,
                scenarioTitle: res.data.scenarioTitle,
                textbookTitle: res.data.textbookTitle,
                chapterTitle: res.data.chapterTitle,
                currentSentenceText: firstSentenceText,
              },
              effectiveRole
            );
            initialIndex = 0;
          } else if (isResume && savedProgress && savedProgress.status === 'IN_PROGRESS') {
            effectiveRole = savedProgress.role || userRoleRef.current;
            userRoleRef.current = effectiveRole;
            setUserRole(effectiveRole);
            initialIndex = Math.min(
              Math.max(0, savedProgress.currentSentenceIndex),
              Math.max(0, res.data.sentences.length - 1)
            );
          } else {
            const firstSentenceText = res.data.sentences[0]?.japaneseText;
            shadowingStorageService.startOrUpdateProgress(
              learnerId,
              {
                id: res.data.id,
                title: res.data.title,
                subtitle: res.data.scenarioTitle,
                totalSentences: res.data.sentences.length,
                jlptLevel: res.data.jlptLevel,
                scenarioTitle: res.data.scenarioTitle,
                textbookTitle: res.data.textbookTitle,
                chapterTitle: res.data.chapterTitle,
                currentSentenceText: firstSentenceText,
              },
              effectiveRole,
              0,
              firstSentenceText
            );
            initialIndex = 0;
          }

          setCurrentSentenceIndex(initialIndex);
          setSentenceResults(new Map());
          setRecordedAudioUrls(new Map());
          setCurrentRecognizedText('');

          // Kiểm tra câu bắt đầu tại initialIndex
          if (res.data.sentences.length > initialIndex) {
            const startSentence = res.data.sentences[initialIndex];
            if (startSentence.speakerRole !== effectiveRole) {
              if (isResume) {
                // Q4 Rule: Resume câu đối phương -> KHÔNG tự động phát ngay, chuyển sang paused state với nút nghe rõ ràng
                setIsOpponentPausedForResume(true);
                setPracticeState('opponent-speaking');
              } else {
                setIsOpponentPausedForResume(false);
                setPracticeState('opponent-speaking');
                const activeTurnId = turnIdRef.current;
                turnTimeoutRef.current = setTimeout(() => {
                  if (turnIdRef.current === activeTurnId) {
                    playOpponentSentence(startSentence, activeTurnId);
                  }
                }, 600);
              }
            } else {
              setIsOpponentPausedForResume(false);
              setPracticeState('ready');
            }
          } else {
            setIsOpponentPausedForResume(false);
            setPracticeState('ready');
          }
        } else {
          setErrorMessage(res.message || `Không tìm thấy bài học Shadowing với Id = ${targetId}.`);
        }
      } catch (err: any) {
        if (!isCancelled) {
          setErrorMessage(err.message || 'Lỗi khi kết nối đến máy chủ.');
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    loadDialogue();

    return () => {
      isCancelled = true;
      stopAllAudio();
    };
  }, [id]);

  // Sync role if changed via URL query params (e.g. browser back/forward)
  useEffect(() => {
    const roleInUrl = (searchParams.get('role')?.toUpperCase() as 'A' | 'B') || 'A';
    if (roleInUrl !== userRoleRef.current) {
      handleConfirmRoleChange(roleInUrl);
    }
  }, [searchParams]);

  // Handle changing Level from dropdown in header
  const handleLevelChange = (newLevel: 'N5' | 'N4' | 'N3') => {
    setSelectedLevel(newLevel);
    navigate(`/shadowing?level=${newLevel}`);
  };

  // Back button: returns to dialogue catalog
  const handleBackToDialogueList = () => {
    navigate('/shadowing');
  };

  // Update session duration counter
  useEffect(() => {
    if (practiceState === 'completed') return;
    const timer = setInterval(() => {
      setSessionDurationSeconds(Math.floor((Date.now() - practiceStartTime) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [practiceStartTime, practiceState]);

  // Stop audio on unmount
  useEffect(() => {
    return () => {
      isRecordingRef.current = false;
      evaluationSeqRef.current += 1;
      collectorRef.current.lock();
      stopAllAudio();
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // ignore
        }
      }
      stopRecordingMedia();
    };
  }, []);

  // Auto-scroll to latest sentence when dialogue progresses
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentSentenceIndex, practiceState]);

  // Tự động tải trước (Pre-fetch ngầm) âm thanh VOICEVOX theo thứ tự ưu tiên:
  // 1. Tải câu hiện tại trước tiên
  // 2. Tuần tự nạp 2 câu tiếp theo
  useEffect(() => {
    const sentences = dialogue?.sentences || [];
    if (!sentences || sentences.length === 0 || availableVoices.length === 0) return;

    let isCancelled = false;

    const prefetchSequence = async () => {
      // Ưu tiên số 1: Tải câu hiện tại
      const current = sentences[currentSentenceIndex];
      if (current?.japaneseText && (!current.nativeAudioUrl || !current.nativeAudioUrl.startsWith('http'))) {
        await voicevoxService.prefetchAudio(current.japaneseText, selectedVoiceVoxId);
      }
      if (isCancelled) return;

      // Ưu tiên số 2: Tuần tự nạp 2 câu tiếp theo
      const nextSentences = sentences.slice(currentSentenceIndex + 1, currentSentenceIndex + 3);
      for (const s of nextSentences) {
        if (isCancelled) return;
        if (s.japaneseText && (!s.nativeAudioUrl || !s.nativeAudioUrl.startsWith('http'))) {
          await voicevoxService.prefetchAudio(s.japaneseText, selectedVoiceVoxId);
        }
      }
    };

    prefetchSequence();

    return () => {
      isCancelled = true;
    };
  }, [currentSentenceIndex, dialogue?.sentences, availableVoices.length, selectedVoiceVoxId]);

  // Web Speech Synthesis for high-fidelity native Japanese audio playback
  const speakJapanese = (
    text: string,
    onEnd?: () => void,
    expectedTurnId?: number
  ) => {
    if ('speechSynthesis' in window) {
      isSpeechCancelledRef.current = false;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'ja-JP';
      utterance.rate = 1.0;
      const voices = window.speechSynthesis.getVoices();
      const jpVoice = voices.find(v => v.lang.includes('ja') || v.lang.includes('JP'));
      if (jpVoice) utterance.voice = jpVoice;

      utterance.onend = () => {
        setIsPlayingAudio(false);
        if (!isSpeechCancelledRef.current && (expectedTurnId === undefined || expectedTurnId === turnIdRef.current)) {
          if (onEnd) onEnd();
        }
      };

      utterance.onerror = (e: any) => {
        setIsPlayingAudio(false);
        // Khi bị hủy bởi cancel(), turn bị drop hoặc đang dở đổi vai, tuyệt đối không trigger callback onEnd!
        if (e.error === 'canceled' || e.error === 'interrupted' || isSpeechCancelledRef.current) {
          return;
        }
        if (expectedTurnId === undefined || expectedTurnId === turnIdRef.current) {
          if (onEnd) onEnd();
        }
      };

      setIsPlayingAudio(true);
      window.speechSynthesis.speak(utterance);
      return true;
    }
    if (onEnd && (expectedTurnId === undefined || expectedTurnId === turnIdRef.current)) {
      onEnd();
    }
    return false;
  };

  // Phát audio bằng VOICEVOX TTS, nếu gặp sự cố sẽ tự động fallback sang Web Speech API
  const playVoiceVoxWithFallback = async (
    text: string,
    onEnd?: () => void,
    expectedTurnId?: number,
    sentenceId?: number
  ) => {
    try {
      if (sentenceId !== undefined) {
        setLoadingAudioSentenceId(sentenceId);
      }
      const audioUrl = await voicevoxService.getAudioUrl(text, selectedVoiceVoxIdRef.current);
      if (expectedTurnId !== undefined && expectedTurnId !== turnIdRef.current) return;

      const audio = new Audio(audioUrl);
      if (selectedAudioOutputDeviceId && 'setSinkId' in HTMLMediaElement.prototype) {
        (audio as any).setSinkId(selectedAudioOutputDeviceId).catch(console.warn);
      }
      audioPlayerRef.current = audio;
      setIsPlayingAudio(true);

      audio.onended = () => {
        setIsPlayingAudio(false);
        if (expectedTurnId === undefined || expectedTurnId === turnIdRef.current) {
          if (onEnd) onEnd();
        }
      };

      audio.onerror = () => {
        setIsPlayingAudio(false);
        speakJapanese(text, onEnd, expectedTurnId);
      };

      await audio.play().catch(() => {
        speakJapanese(text, onEnd, expectedTurnId);
      });
    } catch {
      speakJapanese(text, onEnd, expectedTurnId);
    } finally {
      if (sentenceId !== undefined) {
        setLoadingAudioSentenceId((prev) => (prev === sentenceId ? null : prev));
      }
    }
  };

  // Play audio sample: prefers real audio URL, falls back smoothly to VOICEVOX TTS (then Web Speech API)
  const playAudio = (
    url?: string,
    text?: string,
    onEnd?: () => void,
    expectedTurnId?: number,
    sentenceId?: number
  ) => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.onended = null;
      audioPlayerRef.current.onerror = null;
      audioPlayerRef.current.pause();
      audioPlayerRef.current = null;
    }
    if ('speechSynthesis' in window) {
      isSpeechCancelledRef.current = true;
      window.speechSynthesis.cancel();
    }

    if (url && url.startsWith('http')) {
      const audio = new Audio(url);
      if (selectedAudioOutputDeviceId && 'setSinkId' in HTMLMediaElement.prototype) {
        (audio as any).setSinkId(selectedAudioOutputDeviceId).catch(console.warn);
      }
      audioPlayerRef.current = audio;
      setIsPlayingAudio(true);

      audio.onended = () => {
        setIsPlayingAudio(false);
        if (expectedTurnId === undefined || expectedTurnId === turnIdRef.current) {
          if (onEnd) onEnd();
        }
      };

      audio.onerror = () => {
        if (expectedTurnId !== undefined && expectedTurnId !== turnIdRef.current) return;
        if (text) {
          playVoiceVoxWithFallback(text, onEnd, expectedTurnId, sentenceId);
        } else {
          setIsPlayingAudio(false);
          if (onEnd) onEnd();
        }
      };

      audio.play().catch(() => {
        if (expectedTurnId !== undefined && expectedTurnId !== turnIdRef.current) return;
        if (text) {
          playVoiceVoxWithFallback(text, onEnd, expectedTurnId, sentenceId);
        } else {
          setIsPlayingAudio(false);
          if (onEnd) onEnd();
        }
      });
    } else if (text) {
      playVoiceVoxWithFallback(text, onEnd, expectedTurnId, sentenceId);
    } else {
      if (onEnd && (expectedTurnId === undefined || expectedTurnId === turnIdRef.current)) {
        onEnd();
      }
    }
  };

  // Play user recorded audio (nghe lại giọng của người học cho từng câu đã lưu)
  const playUserRecording = (sentenceId: number) => {
    const url = recordedAudioUrls.get(sentenceId);
    if (!url) return;

    if (playingUserAudioSentenceId === sentenceId) {
      if (userAudioPlayerRef.current) {
        userAudioPlayerRef.current.pause();
      }
      setPlayingUserAudioSentenceId(null);
      return;
    }

    stopAllAudio();

    const audio = new Audio(url);
    if (selectedAudioOutputDeviceId && 'setSinkId' in HTMLMediaElement.prototype) {
      (audio as any).setSinkId(selectedAudioOutputDeviceId).catch(console.warn);
    }
    userAudioPlayerRef.current = audio;
    setPlayingUserAudioSentenceId(sentenceId);

    audio.onended = () => {
      setPlayingUserAudioSentenceId(null);
    };
    audio.onerror = () => {
      setPlayingUserAudioSentenceId(null);
    };
    audio.play().catch(() => {
      setPlayingUserAudioSentenceId(null);
    });
  };

  // Turn progression: Opponent speaks and auto-advances
  const playOpponentSentence = (sentence: ShadowingSentenceItem, activeTurnId?: number) => {
    const currentTurnId = activeTurnId ?? turnIdRef.current;
    setPracticeState('opponent-speaking');
    playAudio(
      sentence.nativeAudioUrl,
      sentence.japaneseText,
      () => {
        if (turnIdRef.current !== currentTurnId) return;
        turnTimeoutRef.current = setTimeout(() => {
          if (turnIdRef.current !== currentTurnId) return;
          advanceAfterOpponent(sentence.orderIndex, currentTurnId);
        }, 700);
      },
      currentTurnId
    );
  };

  const advanceAfterOpponent = (currentOrderIndex: number, expectedTurnId?: number) => {
    if (expectedTurnId !== undefined && turnIdRef.current !== expectedTurnId) return;
    const currentDialogue = dialogueRef.current || dialogue;
    if (!currentDialogue) return;

    const currentIdx = currentDialogue.sentences.findIndex(s => s.orderIndex === currentOrderIndex);
    const nextIdx = currentIdx + 1;
    if (nextIdx < currentDialogue.sentences.length) {
      setCurrentSentenceIndex(nextIdx);
      setIsOpponentPausedForResume(false);

      const nextSentence = currentDialogue.sentences[nextIdx];
      const learnerId = user?.id || user?.email || 'guest_learner';
      shadowingStorageService.updateSentenceProgress(
        learnerId,
        currentDialogue.id,
        nextIdx,
        currentDialogue.sentences.length,
        nextSentence?.japaneseText
      );
      const currentUserRole = userRoleRef.current;

      if (nextSentence.speakerRole !== currentUserRole) {
        // Đối phương nói: tự động phát giọng đối phương, KHÔNG thu âm
        setPracticeState('opponent-speaking');
        const activeTurnId = turnIdRef.current;
        turnTimeoutRef.current = setTimeout(() => {
          if (turnIdRef.current === activeTurnId) {
            playOpponentSentence(nextSentence, activeTurnId);
          }
        }, 500);
      } else {
        // LƯỢT CỦA NGƯỜI HỌC: Sẵn sàng ghi âm, TUYỆT ĐỐI KHÔNG TỰ ĐỘNG PHÁT CÂU MẪU!
        // Người học phải chủ động bấm nút "Nghe lại" thì mới phát câu mẫu
        setPracticeState('ready');
        setCurrentRecognizedText('');
      }
    } else {
      handleFinishDialogue();
    }
  };

  const handlePlayResumedOpponentSentence = () => {
    setIsOpponentPausedForResume(false);
    const activeTurnId = turnIdRef.current;
    if (currentSentence) {
      playOpponentSentence(currentSentence, activeTurnId);
    }
  };

  const handleSkipOpponentSpeech = () => {
    setIsOpponentPausedForResume(false);
    stopAllAudio();
    if (currentSentence) {
      const activeTurnId = turnIdRef.current;
      advanceAfterOpponent(currentSentence.orderIndex, activeTurnId);
    }
  };

  // Toggle translation
  const toggleTranslation = (sentenceId: number) => {
    setShowTranslations(prev => ({
      ...prev,
      [sentenceId]: !prev[sentenceId],
    }));
  };

  // ===========================================================================
  // GHI ÂM → NHẬN DẠNG → BACKEND CHẤM ĐIỂM
  // Backend (ShadowingEvaluationService) là nguồn điểm DUY NHẤT. Client chỉ thu bằng chứng
  // (audio, transcript Web Speech ĐÃ CHỐT, trạng thái cổng mic) và hiển thị kết quả trả về.
  // Nhận dạng giọng nói chạy trên trình duyệt (Web Speech); backend chỉ chấm transcript ĐÃ CHỐT, không bao giờ dùng interim.
  // ===========================================================================

  /** Hủy mọi kết quả đang chờ và bỏ qua sự kiện nhận dạng đến muộn. */
  const cancelPendingEvaluation = () => {
    evaluationSeqRef.current += 1;
    collectorRef.current.lock();
  };

  // Một phiên Web Speech. Tự khởi động lại khi trình duyệt tự kết thúc, nhưng KHÔNG mất đoạn đã chốt
  // (SpeechTranscriptCollector giữ lại các đoạn final qua các phiên).
  const startRecognitionSession = (): boolean => {
    const collector = collectorRef.current;
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      collector.markUnsupported();
      return false;
    }

    let sessionId = -1;
    try {
      const recognition = new SpeechRec();
      recognition.lang = 'ja-JP';
      recognition.continuous = true;
      recognition.interimResults = true;
      sessionId = collector.startSession();
      recognitionRef.current = recognition;

      recognition.onstart = () => {
        if (recognitionRef.current === recognition) setPracticeState('listening');
      };

      recognition.onresult = (event: any) => {
        collector.handleResult(sessionId, event.results);
      };

      recognition.onerror = (event: any) => {
        collector.handleError(sessionId, String(event?.error ?? 'unknown'));
      };

      recognition.onend = () => {
        collector.endSession(sessionId);
        // Instance đã bị thay thế (bắt đầu lượt ghi âm mới/abort): không tự khởi động lại.
        if (recognitionRef.current !== recognition) return;
        if (
          isRecordingRef.current &&
          !collector.stopRequested &&
          !collector.hasFatalError &&
          recognitionRestartCountRef.current < MAX_RECOGNITION_RESTARTS
        ) {
          recognitionRestartCountRef.current += 1;
          startRecognitionSession();
        }
      };

      recognition.start();
      return true;
    } catch (err) {
      console.warn('Recognition start error:', err);
      if (sessionId >= 0) {
        collector.handleError(sessionId, 'start-failed');
        collector.endSession(sessionId);
      }
      return false;
    }
  };

  // Start Voice Recording (CHỈ ghi âm khi tới câu của người học: speakerRole === userRole)
  const startRecording = async () => {
    if (!currentSentence || currentSentence.speakerRole !== userRole) return;

    cancelPendingEvaluation();
    const collector = collectorRef.current;
    collector.reset();
    isRecordingRef.current = true;
    recognitionRestartCountRef.current = 0;
    setMicError(null);
    setCurrentRecognizedText('');

    if (audioPlayerRef.current) audioPlayerRef.current.pause();
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    if (userAudioPlayerRef.current) userAudioPlayerRef.current.pause();
    setPlayingUserAudioSentenceId(null);

    // 1. MediaRecorder: dùng MIME thực sự được trình duyệt hỗ trợ (webm/ogg/mp4), không gắn nhãn cứng.
    recorderStoppedRef.current = Promise.resolve();
    recordedAudioChunksRef.current = [];
    recordedMimeRef.current = '';
    try {
      const audioConstraints: MediaTrackConstraints = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
        sampleRate: 48000,
        ...(selectedAudioInputDeviceId ? { deviceId: { exact: selectedAudioInputDeviceId } } : {}),
      };
      const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
      // Phân tích Web Audio API (cổng mic): heuristic, chỉ dùng để kiểm định đầu vào.
      audioMetricsService.startAnalysis(stream);

      const requestedMime = pickRecordingMimeType(
        typeof MediaRecorder !== 'undefined' ? (t) => MediaRecorder.isTypeSupported(t) : undefined
      );
      const mediaRecorder = requestedMime
        ? new MediaRecorder(stream, { mimeType: requestedMime })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      recordedMimeRef.current = resolveRecordedMime(mediaRecorder.mimeType, requestedMime);

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedAudioChunksRef.current.push(e.data);
        }
      };

      recorderStoppedRef.current = new Promise<void>((resolve) => {
        mediaRecorder.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());
          resolve();
        };
      });

      mediaRecorder.start(100);
    } catch (err: any) {
      console.warn('Microphone access denied:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setMicError('Quyền truy cập micro đã bị từ chối.');
      }
    }

    // 2. Web Speech (ja-JP): nguồn dự phòng + hiển thị trực tiếp
    if (!startRecognitionSession()) {
      setPracticeState('listening');
    }
  };

  const stopRecordingMedia = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
    }
  };

  // Hiển thị trạng thái "chưa chấm được" (không có điểm; KHÔNG phải điểm 0).
  const showNotScored = (
    sentence: ShadowingSentenceItem,
    status: 'unavailable' | 'failed',
    reason: string,
    audioBlob: Blob | null
  ) => {
    const prevAttempts = sentenceAttemptsMap.get(sentence.id) || 0;
    const nextAttempts = prevAttempts + 1;
    setSentenceAttemptsMap((prev) => new Map(prev).set(sentence.id, nextAttempts));

    setCurrentEvaluationStatus(status);
    setCurrentRecognitionSource(null);
    setCurrentRecognizedText('');
    setCurrentScore(0);
    setCurrentFluencyMetrics(null);
    setCurrentGateDetail(reason);
    setCurrentDiffTokens([]);
    setPracticeState('evaluated');

    latestAttemptIsBestRef.current = false;
    registerRecording(sentence.id, audioBlob, false);
    setSentenceResults((prev) => {
      const existing = prev.get(sentence.id);
      if (!existing) return prev;
      return new Map(prev).set(sentence.id, { ...existing, attemptsCount: nextAttempts });
    });
  };

  // Lưu bản thu để người học nghe lại (chỉ giữ bản thu tốt nhất; bản chưa có thì luôn lưu).
  const registerRecording = (sentenceId: number, blob: Blob | null, isBest: boolean) => {
    if (!blob) return;
    setRecordedAudioUrls((prev) => {
      if (isBest || !prev.has(sentenceId)) {
        return new Map(prev).set(sentenceId, URL.createObjectURL(blob));
      }
      return prev;
    });
  };

  // Áp dụng kết quả backend. KHÔNG tính lại điểm ở client.
  const applyBackendEvaluation = (
    sentence: ShadowingSentenceItem,
    data: ShadowingAudioEvaluationResult,
    metrics: AudioQualityMetrics,
    audioBlob: Blob
  ) => {
    const isScored =
      (data.evaluationStatus === 'completed' || data.evaluationStatus === 'partial') &&
      data.contentMatchScore != null &&
      data.overallScore != null;

    if (!isScored) {
      const status = data.evaluationStatus === 'failed' ? 'failed' : 'unavailable';
      showNotScored(
        sentence,
        status,
        // errorMessage là lý do thật (kể cả AUDIO_QUALITY_INSUFFICIENT); audioQualityDetail chỉ là mô tả cổng mic.
        data.errorMessage || data.audioQualityDetail || 'Chưa thể đánh giá bản ghi này.',
        audioBlob
      );
      return;
    }

    const contentMatch = data.contentMatchScore as number;
    const overallScore = data.overallScore as number;
    const tier: 'green' | 'yellow' | 'red' = data.tier === 'green' || data.tier === 'yellow' ? data.tier : 'red';
    const diffTokens = data.diffTokens ?? [];
    const source = data.recognitionSource === 'web_speech' ? 'web_speech' : 'gemini';

    const prevAttempts = sentenceAttemptsMap.get(sentence.id) || 0;
    const nextAttempts = prevAttempts + 1;
    setSentenceAttemptsMap((prev) => new Map(prev).set(sentence.id, nextAttempts));

    setCurrentEvaluationStatus(data.evaluationStatus);
    setCurrentRecognitionSource(source);
    setCurrentRecognizedText(data.recognizedText);
    setCurrentScore(overallScore);
    setCurrentFluencyMetrics(data.fluency ?? null);
    setCurrentGateDetail(data.audioQualityDetail ?? '');
    setCurrentDiffTokens(diffTokens);
    setPracticeState('evaluated');

    const prevResult = sentenceResults.get(sentence.id);
    const prevScore = prevResult ? prevResult.overallScore : -1;
    const isBest = !prevResult || !prevResult.isValidForBestAttempt || overallScore >= prevScore;
    latestAttemptIsBestRef.current = isBest;
    registerRecording(sentence.id, audioBlob, isBest);

    const resultItem: ShadowingSentencePracticeResult = {
      sentenceId: sentence.id,
      evaluationId: data.evaluationId ?? null,
      orderIndex: sentence.orderIndex,
      targetText: data.targetText || sentence.japaneseText,
      recognizedText: data.recognizedText,
      contentMatchScore: contentMatch,
      fluencyScore: data.fluencyScore ?? null,
      overallScore,
      accuracyScore: contentMatch,
      evaluationStatus: data.evaluationStatus,
      recognitionSource: source,
      fallbackReason: data.fallbackReason ?? null,
      scoringVersion: data.scoringVersion,
      comparisonMethod: data.comparisonMethod,
      targetReading: data.targetReading,
      recognizedReading: data.recognizedReading,
      feedback: data.feedback,
      missingWords: data.missingWords,
      mismatchedWords: data.mismatchedWords,
      audioGateStatus: data.audioQualityStatus,
      audioGateLabel: GATE_LABELS[data.audioQualityStatus],
      isValidForBestAttempt: true,
      attemptsCount: nextAttempts,
      evaluationTier: tier,
      diffTokens: data.diffTokens,
      durationMs: metrics.durationMs,
      targetAudioUrl: sentence.nativeAudioUrl ?? undefined,
      romajiText: sentence.romajiText ?? undefined,
      vietnameseTranslation: sentence.vietnameseTranslation,
    };
    setSentenceResults((prev) => new Map(prev).set(sentence.id, resultItem));
  };

  // Stop recording manually: chờ kết thúc theo sự kiện (có chặn trên), chốt transcript rồi gửi backend chấm điểm
  const stopRecordingManually = async () => {
    if (!currentSentence || isSubmittingRef.current) return;
    const sentence = currentSentence;
    const collector = collectorRef.current;

    isRecordingRef.current = false;
    collector.requestStop();
    try {
      recognitionRef.current?.stop();
    } catch {
      // ignore
    }
    stopRecordingMedia();
    setPracticeState('analyzing');

    isSubmittingRef.current = true;
    const seq = (evaluationSeqRef.current += 1);
    try {
      // Đợi MediaRecorder xả hết dữ liệu và Web Speech trả kết quả cuối (onend), tối đa vài giây.
      await Promise.all([
        settleWithin(recorderStoppedRef.current ?? Promise.resolve(), RECORDER_SETTLE_TIMEOUT_MS),
        collector.whenSettled(SPEECH_SETTLE_TIMEOUT_MS),
      ]);
      collector.lock();
      if (seq !== evaluationSeqRef.current) return; // đã hủy: thử lại/đi tiếp/đổi vai

      let metrics = audioMetricsService.stopAnalysis(sentence.audioDurationMs);
      const chunks = recordedAudioChunksRef.current;
      if (chunks.length === 0) {
        showNotScored(sentence, 'unavailable', 'Chưa thu được âm thanh. Hãy kiểm tra micro rồi thu lại.', null);
        return;
      }

      const audioBlob = new Blob(chunks, { type: recordedMimeRef.current });

      // Bộ đo trực tiếp không đo được (vd. im lặng tuyệt đối làm mọi mẫu bằng 0): đo trên chính bản ghi để biết
      // có tiếng hay không, thay vì để bản thu rỗng đi tiếp tới nhận dạng (STT dễ bịa chữ cho đoạn im lặng).
      if (metrics.gateStatus === 'unmeasured') {
        const decoded = await measureRecordedBlob(audioBlob, metrics.durationMs);
        if (seq !== evaluationSeqRef.current) return;
        if (decoded) metrics = decoded;
      }
      // WAV 16 kHz mono để backend đo nhịp nói; không làm được thì chỉ mất số liệu này, vẫn chấm nội dung như thường.
      const analysisWav = await blobToAnalysisWav(audioBlob);
      if (seq !== evaluationSeqRef.current) return;

      const res = await shadowingService.evaluateAudio(audioBlob, sentence.japaneseText, {
        sentenceId: sentence.id,
        clientRecognition: collector.snapshot(),
        audioGateStatus: metrics.gateStatus,
        audioGateDetail: metrics.gateDetail,
        durationMs: metrics.durationMs,
        analysisWav,
        referenceSpeakerId: selectedVoiceVoxIdRef.current,
      });
      if (seq !== evaluationSeqRef.current) return;

      if (!res.success || !res.data) {
        // Lỗi kỹ thuật phía kết nối: không có điểm, KHÔNG phải điểm 0.
        showNotScored(
          sentence,
          'failed',
          res.message || 'Không thể chấm điểm lúc này. Điểm chưa được ghi nhận.',
          audioBlob
        );
        return;
      }

      applyBackendEvaluation(sentence, res.data, metrics, audioBlob);
    } finally {
      isSubmittingRef.current = false;
    }
  };

  // Hủy bản thu đang chạy (nút vuông trên thanh ghi âm): bỏ âm thanh, KHÔNG gửi chấm điểm, quay về trạng thái sẵn sàng.
  const cancelRecording = () => {
    if (isSubmittingRef.current) return;
    cancelPendingEvaluation();
    isRecordingRef.current = false;
    try {
      recognitionRef.current?.stop();
    } catch {
      // ignore
    }
    stopRecordingMedia();
    audioMetricsService.stopAnalysis();
    recordedAudioChunksRef.current = [];
    setCurrentRecognizedText('');
    setMicError(null);
    setPracticeState('ready');
  };

  // Retry current sentence
  const handleRetryCurrentSentence = () => {
    cancelPendingEvaluation();
    stopAllAudio();
    setPracticeState('ready');
    setCurrentRecognizedText('');
    setMicError(null);
    setCurrentEvaluationStatus('completed');
  };

  // Finish current sentence and move to next
  const handleNextSentence = () => {
    cancelPendingEvaluation();
    stopAllAudio();
    const currentDialogue = dialogueRef.current || dialogue;
    if (!currentDialogue) return;

    const nextIdx = currentSentenceIndex + 1;
    const learnerId = user?.id || user?.email || 'guest_learner';

    if (nextIdx < currentDialogue.sentences.length) {
      setCurrentSentenceIndex(nextIdx);
      setCurrentRecognizedText('');
      setMicError(null);
      setIsOpponentPausedForResume(false);

      const nextSentence = currentDialogue.sentences[nextIdx];
      // Cập nhật tiến trình lưu vào storage
      shadowingStorageService.updateSentenceProgress(
        learnerId,
        currentDialogue.id,
        nextIdx,
        currentDialogue.sentences.length,
        nextSentence?.japaneseText
      );
      const currentUserRole = userRoleRef.current;
      if (nextSentence.speakerRole !== currentUserRole) {
        // Đối phương nói: tự động phát giọng đối phương, KHÔNG thu âm
        setPracticeState('opponent-speaking');
        const activeTurnId = turnIdRef.current;
        turnTimeoutRef.current = setTimeout(() => {
          if (turnIdRef.current === activeTurnId) {
            playOpponentSentence(nextSentence, activeTurnId);
          }
        }, 300);
      } else {
        // Lượt của người học: sẵn sàng ghi âm, KHÔNG tự động phát âm thanh câu mẫu
        setPracticeState('ready');
      }
    } else {
      handleFinishDialogue();
    }
  };

  // Complete dialogue
  const handleFinishDialogue = async () => {
    setPracticeState('completed');
    setIsCompletedModalOpen(true);
    setHistorySaveState('idle');
    setHistorySaveMessage('');

    const currentDialogue = dialogueRef.current || dialogue;
    if (!currentDialogue) return;

    // 1. Cập nhật trạng thái hoàn thành của tiến trình đang luyện (lưu trên trình duyệt để có thể luyện tiếp)
    const learnerId = user?.id || user?.email || 'guest_learner';
    shadowingStorageService.completeProgress(learnerId, currentDialogue.id, currentDialogue.sentences.length);

    // 2. Chỉ các câu backend đã chấm VÀ đã lưu mới vào lịch sử. Không câu nào thì không tạo bản ghi "0 điểm" gây hiểu nhầm.
    const evaluationIds = Array.from(sentenceResults.values())
      .filter((r) => r.isValidForBestAttempt !== false && r.evaluationId)
      .map((r) => r.evaluationId as string);
    if (evaluationIds.length === 0) return;

    // 3. Backend đọc điểm đã lưu, tính điểm tổng và lưu buổi luyện vào lịch sử (client không gửi điểm).
    setHistorySaveState('saving');
    const completeRes = await shadowingService.completeSession({
      dialogueId: currentDialogue.id,
      learnerRole: userRoleRef.current,
      durationSeconds: sessionDurationSeconds,
      startedAt: new Date(practiceStartTime).toISOString(),
      evaluationIds,
    });

    if (completeRes.success) {
      setHistorySaveState('saved');
    } else {
      setHistorySaveState('failed');
      setHistorySaveMessage(completeRes.message || 'Chưa lưu được buổi luyện vào lịch sử.');
    }
  };

  // Role selection change
  const handleConfirmRoleChange = (newRole: 'A' | 'B') => {
    // 1. Dừng ngay lập tức toàn bộ audio, speech synthesis và timers đang chạy dở
    cancelPendingEvaluation();
    isRecordingRef.current = false;
    stopAllAudio();

    // 2. Dừng micro và ghi âm nếu đang ghi âm dở
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
    }
    stopRecordingMedia();

    // 3. Cập nhật vai mới vào ref và state
    setIsRoleModalOpen(false);
    userRoleRef.current = newRole;
    setUserRole(newRole);
    setSearchParams({ level: selectedLevel, role: newRole });

    // 4. Reset toàn bộ tiến độ bài học về câu 0 & bắt đầu session mới
    setCurrentSentenceIndex(0);
    setSentenceResults(new Map());
    setSentenceAttemptsMap(new Map());
    setRecordedAudioUrls(new Map());
    setCurrentRecognizedText('');
    setMicError(null);
    setIsCompletedModalOpen(false);
    setIsOpponentPausedForResume(false);

    const currentDialogue = dialogueRef.current || dialogue;
    if (currentDialogue) {
      const learnerId = user?.id || user?.email || 'guest_learner';
      shadowingStorageService.restartProgress(
        learnerId,
        {
          id: currentDialogue.id,
          title: currentDialogue.title,
          totalSentences: currentDialogue.sentences.length,
          jlptLevel: currentDialogue.jlptLevel,
          scenarioTitle: currentDialogue.scenarioTitle,
          textbookTitle: currentDialogue.textbookTitle,
          chapterTitle: currentDialogue.chapterTitle,
        },
        newRole
      );
    }

    // 5. Kiểm tra câu 0 theo vai mới
    if (currentDialogue && currentDialogue.sentences && currentDialogue.sentences.length > 0) {
      const firstSentence = currentDialogue.sentences[0];
      if (firstSentence.speakerRole !== newRole) {
        // Câu 0 là vai đối phương: Tự động phát âm thanh đối phương sau 500ms
        setPracticeState('opponent-speaking');
        const activeTurnId = turnIdRef.current;
        turnTimeoutRef.current = setTimeout(() => {
          if (turnIdRef.current === activeTurnId) {
            playOpponentSentence(firstSentence, activeTurnId);
          }
        }, 500);
      } else {
        // Câu 0 là vai người học (vai của tôi):
        // Chuyển sang trạng thái 'ready' (sẵn sàng ghi âm), TUYỆT ĐỐI KHÔNG TỰ ĐỘNG PHÁT CÂU MẪU!
        // Người học phải chủ động bấm nút "Nghe lại" thì mới phát câu mẫu.
        setPracticeState('ready');
      }
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F4F9FE] flex flex-col items-center justify-center space-y-4">
        <div className="w-12 h-12 border-4 border-[#BCDDFB] border-t-[#0878EE] rounded-full animate-spin"></div>
        <p className="text-sm font-bold text-[#071A44]">Đang chuẩn bị phòng luyện Shadowing...</p>
      </div>
    );
  }

  if (errorMessage || !dialogue) {
    return (
      <div className="min-h-screen bg-[#F4F9FE] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white p-8 rounded-2xl border border-red-200 text-center space-y-4 shadow-sm">
          <p className="text-red-600 font-bold">{errorMessage || 'Không tìm thấy bài học.'}</p>
          <button
            onClick={() => navigate('/shadowing')}
            className="bg-[#0878EE] text-white px-5 py-2 rounded-full font-bold text-xs hover:bg-[#0662C6] cursor-pointer"
          >
            Quay lại Thư viện Shadowing
          </button>
        </div>
      </div>
    );
  }

  const sentences = dialogue.sentences || [];
  const currentSentence: ShadowingSentenceItem | undefined = sentences[currentSentenceIndex];
  const remainingSentences = sentences.slice(currentSentenceIndex + 1);
  const hasNextLearnerSentence = remainingSentences.some((s) => s.speakerRole === userRole);


  // Helper names
  const opponentRole = userRole === 'A' ? 'B' : 'A';
  const opponentName = userRole === 'A' ? dialogue.speakerRoleB_Name : dialogue.speakerRoleA_Name;
  const learnerName = userRole === 'A' ? dialogue.speakerRoleA_Name : dialogue.speakerRoleB_Name;


  // Summary results for celebration modal (trung bình các điểm do backend chấm; không áp lại công thức)
  const learnerSentences = sentences.filter(s => s.speakerRole === userRole);
  const totalLearnerSentencesCount = learnerSentences.length;

  const sessionSummary = summarizeSessionScores(learnerSentences.map(s => s.id), sentenceResults);
  const practicedSentencesCount = sessionSummary.practicedSentences;
  const finalContentMatchScore = sessionSummary.contentMatch;
  const finalFluencyScore = sessionSummary.fluency; // null = chưa đo
  const finalWeightedScore = sessionSummary.overall;
  const finalGateStatus = sessionSummary.gateStatus;
  const finalGreenCount = sessionSummary.greenCount;
  const finalYellowCount = sessionSummary.yellowCount;
  const finalRedCount = sessionSummary.redCount;

  // Render text directly without popup annotations (Bỏ qua popup từ vựng/ngữ pháp theo yêu cầu)
  const renderAnnotatedSentenceText = (text: string) => {
    return text;
  };

  return (
    <div
      className="min-h-screen lg:h-screen lg:max-h-screen flex flex-col justify-between selection:bg-[#0878EE] selection:text-white bg-[#F4F9FE] text-[#071A44] font-sans lg:overflow-hidden"
      style={{
        backgroundImage: 'radial-gradient(#CBDDF3 1px, transparent 1px)',
        backgroundSize: '24px 24px',
      }}
    >
      {/* Styles for interactive tooltips & pulse animations */}
      <style>{`
        .annotation-term {
          position: relative;
          display: inline-block;
          cursor: pointer;
          border-bottom-width: 2px;
          border-bottom-style: dashed;
          padding: 0 2px;
          transition: all 0.15s ease-in-out;
        }
        .annotation-term-red {
          border-bottom-color: #F04438;
        }
        .annotation-term-red:hover {
          background-color: rgba(240, 68, 56, 0.12);
        }
        .annotation-term-blue {
          border-bottom-color: #38BDF8;
        }
        .annotation-term-blue:hover {
          background-color: rgba(56, 189, 248, 0.18);
        }
        .annotation-term .term-tooltip {
          visibility: hidden;
          opacity: 0;
          position: absolute;
          bottom: 125%;
          left: 50%;
          transform: translateX(-50%) translateY(4px);
          transition: opacity 0.2s ease, transform 0.2s ease, visibility 0.2s;
          z-index: 60;
          pointer-events: none;
          min-width: 220px;
          max-width: 280px;
          width: max-content;
        }
        .annotation-term:hover .term-tooltip {
          visibility: visible;
          opacity: 1;
          transform: translateX(-50%) translateY(0);
        }
        /* Custom scrollbar for dialogue container */
        .dialogue-scroll-container::-webkit-scrollbar {
          width: 6px;
        }
        .dialogue-scroll-container::-webkit-scrollbar-track {
          background: transparent;
        }
        .dialogue-scroll-container::-webkit-scrollbar-thumb {
          background-color: #CBDDF3;
          border-radius: 9999px;
        }
        .dialogue-scroll-container::-webkit-scrollbar-thumb:hover {
          background-color: #93C5FD;
        }
      `}</style>

      {/* TOP HEADER (MATCHES REFERENCE IMAGE 2 EXACTLY) */}
      <header className="w-full bg-[#F4F9FE]/90 backdrop-blur-md sticky top-0 z-40 py-2.5 border-b border-[#E6EDF5] px-6 flex-shrink-0">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          {/* Brand & Breadcrumbs */}
          <div className="flex items-center gap-3">
            <Link
              to="/shadowing"
              className="font-black text-[#0878EE] text-2xl tracking-wide leading-none select-none hover:opacity-90"
            >
              JCAP
            </Link>
            <span className="text-gray-300 font-light">|</span>

            {/* JLPT Level Dropdown Pill */}
            <div className="relative inline-block">
              <select
                value={selectedLevel}
                onChange={(e) => handleLevelChange(e.target.value as 'N5' | 'N4' | 'N3')}
                className="bg-white border border-[#BCDDFB] hover:border-[#0878EE] text-[#071A44] text-xs font-bold rounded-full px-3 py-1 pr-6 cursor-pointer focus:ring-[#0878EE] focus:border-[#0878EE] shadow-2xs transition-colors"
              >
                <option value="N5">JLPT N5</option>
                <option value="N4">JLPT N4</option>
                <option value="N3">JLPT N3</option>
              </select>
            </div>

            <span className="text-gray-400">/</span>
            <span className="text-gray-700 font-semibold text-xs truncate max-w-[200px]" title={dialogue.scenarioTitle}>
              {dialogue.scenarioTitle || 'Kịch bản hội thoại'}
            </span>

            <span className="text-gray-400">/</span>
            <span className="text-[#0878EE] font-bold text-xs truncate max-w-[280px]" title={dialogue.title}>
              {dialogue.title}
            </span>
          </div>

          {/* Right Action: Cài đặt âm thanh (Microphone & Loa) */}
          <button
            type="button"
            onClick={() => setIsAudioDeviceModalOpen(true)}
            title="Cài đặt thiết bị âm thanh"
            className="flex items-center gap-1.5 h-8 px-3 rounded-full border border-[#BCDDFB] bg-white hover:bg-[#EEF6FE] hover:border-[#0878EE] text-[#071A44] hover:text-[#0878EE] text-xs font-bold transition-all shadow-2xs cursor-pointer flex-shrink-0"
          >
            <svg
              className="w-3.5 h-3.5 text-[#0878EE]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M10.5 4.5L5.5 8.5H2.5a1 1 0 00-1 1v5a1 1 0 001 1h3l5 4V4.5z" />
              <path d="M14 10a3 3 0 010 4" />
              <path d="M17 7.5a6.5 6.5 0 010 9" />
              <path d="M20 5a10 10 0 010 14" />
            </svg>
            <span className="hidden sm:inline">Cài đặt âm thanh</span>
          </button>
        </div>
      </header>

      {/* MAIN WORKSPACE CONTENT */}
      <main className="max-w-7xl w-full mx-auto py-3 px-4 sm:px-6 flex-1 flex flex-col min-h-0 lg:overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start lg:h-full min-h-0 lg:overflow-hidden">
          {/* LEFT COLUMN: Context Panel (Hình 3) - Cố định vị trí, không cuộn theo đoạn chat */}
          <section className="lg:col-span-4 flex flex-col gap-4 lg:h-full lg:overflow-y-auto pr-1">
            <div className="rounded-[28px] p-5 shadow-sm border border-[#E6EDF5] bg-white relative overflow-hidden backdrop-blur-md">
              {/* Back / End Buttons */}
              <div className="flex items-center justify-between mb-3">
                <button
                  onClick={handleBackToDialogueList}
                  className="text-[#071A44] bg-[#F4F9FE] hover:bg-[#EBF3FB] border border-[#E6EDF5] px-3.5 py-1 rounded-full text-xs font-bold transition-all shadow-xs cursor-pointer"
                >
                  Quay lại
                </button>
                <button
                  onClick={handleFinishDialogue}
                  className="flex items-center gap-1.5 text-[#D92D20] hover:text-red-700 bg-white hover:bg-red-50/50 border border-red-200 font-extrabold text-xs px-3.5 py-1 rounded-full shadow-xs transition-all cursor-pointer"
                >
                  <span className="w-2 h-2 rounded-full border-2 border-[#D92D20] inline-block"></span>
                  <span>Kết thúc</span>
                </button>
              </div>

              {/* Campus Illustration Card with "Khuôn viên trường" badge */}
              <div className="w-full h-40 rounded-2xl bg-gradient-to-b from-[#EBF4FE] to-[#F8FBFE] border border-[#E6EDF5] relative overflow-hidden flex items-end justify-center">
                <svg className="w-full h-full object-cover" fill="none" viewBox="0 0 400 180" xmlns="http://www.w3.org/2000/svg">
                  <rect fill="#EBF4FE" height="180" width="400"></rect>
                  <path d="M40 30 Q55 20 70 30 T100 30 T120 40 L30 40 Z" fill="#FFFFFF" opacity="0.7"></path>
                  <path d="M280 25 Q295 15 310 25 T340 25 T360 35 L270 35 Z" fill="#FFFFFF" opacity="0.8"></path>
                  <path d="M-20 180 C80 120 180 160 420 130 L420 180 Z" fill="#D2E6FA"></path>
                  <path d="M-10 180 C120 140 260 170 410 145 L410 180 Z" fill="#B9DBFC"></path>
                  <g opacity="0.9">
                    <circle cx="340" cy="110" fill="#F6D06F" r="10"></circle>
                    <circle cx="365" cy="105" fill="#F6D06F" r="9"></circle>
                    <circle cx="385" cy="118" fill="#F6D06F" r="8"></circle>
                  </g>
                  <g transform="translate(130, 45)">
                    <rect fill="#FFE6D4" height="55" rx="3" stroke="#DDAA80" strokeWidth="2" width="90" x="25" y="45"></rect>
                    <polygon fill="#D87860" points="15,45 70,18 125,45" stroke="#B85540" strokeWidth="1.5"></polygon>
                    <rect fill="#FFF2E8" height="35" rx="2" stroke="#DDAA80" strokeWidth="1.5" width="36" x="52" y="10"></rect>
                    <polygon fill="#0878EE" points="46,10 70,-10 94,10"></polygon>
                    <circle cx="70" cy="26" fill="#FFFFFF" r="9" stroke="#809B89" strokeWidth="1.5"></circle>
                    <line stroke="#333" strokeLinecap="round" strokeWidth="1.5" x1="70" x2="70" y1="26" y2="21"></line>
                    <line stroke="#333" strokeLinecap="round" strokeWidth="1.5" x1="70" x2="75" y1="26" y2="26"></line>
                    <rect fill="#FFFFFF" height="14" rx="2" stroke="#DDAA80" width="34" x="53" y="52"></rect>
                    <text fill="#071A44" fontSize="6.5" fontWeight="900" textAnchor="middle" x="70" y="62">FPT SCHOOL</text>
                  </g>
                  <circle cx="100" cy="135" fill="#58AB8A" r="18"></circle>
                  <circle cx="280" cy="138" fill="#58AB8A" r="16"></circle>
                </svg>
                <div className="absolute top-2 right-2 bg-white/95 text-[10px] font-bold text-[#0878EE] px-2.5 py-0.5 rounded-full shadow-xs border border-blue-100">
                  Khuôn viên trường
                </div>
              </div>

              {/* Character Avatar and Title Section: Ran TIỀN BỐI */}
              <div className="flex items-center gap-3 -mt-6 px-2 relative z-10">
                <div className="w-16 h-16 rounded-full border-4 border-white bg-[#F4F9FE] shadow-md overflow-hidden flex-shrink-0 flex items-center justify-center relative">
                  <img src="/default_avatar.png" alt={opponentName} className="w-full h-full object-cover" />
                  <span className="absolute bottom-1 right-1 w-3.5 h-3.5 bg-emerald-500 border-2 border-white rounded-full"></span>
                </div>
                <div className="flex-1">
                  <h2 className="text-lg font-black text-[#071A44] tracking-tight">{opponentName}</h2>
                  <p className="text-[10px] font-extrabold text-[#0878EE] uppercase tracking-wide">
                    TIỀN BỐI
                  </p>
                </div>
              </div>

              {/* VAI CỦA BẠN: Yuuri Tân học sinh & Đổi vai */}
              <div className="mt-3.5 bg-[#F8FAFD] border border-[#E6EDF5] rounded-2xl px-3.5 py-2 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-[#071A44]">{learnerName} </span>
                  <span className="text-[#556987] text-[11px] font-normal">Tân học sinh</span>
                </div>
                <button
                  onClick={() => {
                    stopAllAudio();
                    setIsRoleModalOpen(true);
                  }}
                  className="flex items-center gap-1 bg-white hover:bg-[#EEF6FE] text-[#0878EE] text-[11px] font-bold px-3 py-0.5 rounded-full border border-[#BCDDFB] shadow-2xs transition-all cursor-pointer"
                >
                  Đổi vai
                </button>
              </div>

              {/* Divider Leaf */}
              <div className="flex items-center justify-center my-3">
                <div className="h-px bg-[#E6EDF5] flex-1"></div>
                <span className="px-2 text-emerald-600 text-xs">🍃</span>
                <div className="h-px bg-[#E6EDF5] flex-1"></div>
              </div>

              {/* Situation ("Tình huống") */}
              <div className="space-y-1.5">
                <div
                  className="flex items-center justify-between text-[#071A44] font-bold text-sm cursor-pointer select-none"
                  onClick={() => setIsSituationCollapsed(!isSituationCollapsed)}
                >
                  <span className="font-extrabold tracking-tight">Tình huống</span>
                  <button
                    type="button"
                    aria-label={isSituationCollapsed ? 'Mở rộng' : 'Thu gọn'}
                    className="w-6 h-6 rounded-full bg-[#F4F9FE] hover:bg-[#EEF6FE] border border-[#E6EDF5] text-[#556987] flex items-center justify-center transition-colors cursor-pointer"
                  >
                    {isSituationCollapsed ? (
                      <svg className="w-3.5 h-3.5 text-[#556987]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M19 9l-7 7-7-7" />
                      </svg>
                    ) : (
                      <svg className="w-3.5 h-3.5 text-[#556987]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 15l7-7 7 7" />
                      </svg>
                    )}
                  </button>
                </div>

                {!isSituationCollapsed && (
                  <div className="space-y-3 pt-1">
                    <p className="text-xs leading-relaxed text-[#4A5D78] text-justify">
                      {dialogue.scenarioDescription ||
                        'Bạn là tân học sinh. Chị khóa trên Ran phụ trách Club Day gọi điện báo về Ngày giới thiệu câu lạc bộ. Hãy hỏi lịch trình, địa điểm nhận đơn, và cách đăng ký câu lạc bộ âm nhạc.'}
                    </p>
                  </div>
                )}
              </div>

              <div className="h-px bg-[#E6EDF5] my-3"></div>

              {/* NỘI DUNG BÀI HỌC (3 Buttons: Toàn bộ hội thoại, Từ vựng, Ngữ pháp) */}
              <div className="space-y-1.5">
                <div
                  className="flex items-center justify-between text-[#071A44] font-bold text-sm cursor-pointer select-none"
                  onClick={() => setIsDialogueContentCollapsed(!isDialogueContentCollapsed)}
                >
                  <span className="font-extrabold tracking-tight">Nội dung bài học</span>
                  <button
                    type="button"
                    aria-label={isDialogueContentCollapsed ? 'Mở rộng' : 'Thu gọn'}
                    className="w-6 h-6 rounded-full bg-[#F4F9FE] hover:bg-[#EEF6FE] border border-[#E6EDF5] text-[#556987] flex items-center justify-center transition-colors cursor-pointer"
                  >
                    {isDialogueContentCollapsed ? (
                      <svg className="w-3.5 h-3.5 text-[#556987]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M19 9l-7 7-7-7" />
                      </svg>
                    ) : (
                      <svg className="w-3.5 h-3.5 text-[#556987]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 15l7-7 7 7" />
                      </svg>
                    )}
                  </button>
                </div>

                {!isDialogueContentCollapsed && (
                  <div className="grid grid-cols-3 gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setIsFullScriptModalOpen(true)}
                      className="flex flex-col items-center justify-center py-2 px-1 rounded-xl bg-white hover:bg-[#EEF6FE] border border-[#BCDDFB] text-[#071A44] hover:text-[#0878EE] text-[11px] font-bold shadow-2xs transition-all cursor-pointer text-center leading-tight"
                    >
                      Toàn bộ hội thoại
                    </button>
                    <button
                      type="button"
                      onClick={() => {}}
                      className="flex flex-col items-center justify-center py-2 px-1 rounded-xl bg-white hover:bg-[#EEF6FE] border border-[#BCDDFB] text-[#071A44] hover:text-[#0878EE] text-[11px] font-bold shadow-2xs transition-all cursor-pointer text-center leading-tight"
                    >
                      Từ vựng
                    </button>
                    <button
                      type="button"
                      onClick={() => {}}
                      className="flex flex-col items-center justify-center py-2 px-1 rounded-xl bg-white hover:bg-[#EEF6FE] border border-[#BCDDFB] text-[#071A44] hover:text-[#0878EE] text-[11px] font-bold shadow-2xs transition-all cursor-pointer text-center leading-tight"
                    >
                      Ngữ pháp
                    </button>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* RIGHT COLUMN: Dialogue Stream & Mic Console */}
          <section className="lg:col-span-8 flex flex-col justify-between lg:h-full min-h-0 lg:overflow-hidden gap-2">
            {/* Dialogue Stream - CHỈ PHẦN NÀY ĐƯỢC CUỘN */}
            <div className="dialogue-scroll-container flex-1 overflow-y-auto min-h-0 pr-2 space-y-4 pb-2">
              {sentences.slice(0, currentSentenceIndex + 1).map((s, idx) => {
                const isOpponent = s.speakerRole !== userRole;
                const isCurrentActive = idx === currentSentenceIndex;
                const hasRecordedAudio = recordedAudioUrls.has(s.id);

                if (isOpponent) {
                  // Opponent speech bubble (Ran / Yui)
                  return (
                    <div key={s.id} className="flex items-start gap-3 w-full max-w-xl">
                      <div className="w-10 h-10 rounded-full border-2 border-white shadow-sm bg-blue-100 overflow-hidden flex-shrink-0 mt-0.5">
                        <img src="/default_avatar.png" alt={opponentName} className="w-full h-full object-cover" />
                      </div>

                      <div className="flex flex-col items-start min-w-0">
                        <div className="flex items-center gap-2 mb-1.5 ml-1">
                          <span className="font-bold text-xs text-[#071A44]">{opponentName}</span>
                        </div>

                        <div className="bg-white rounded-[20px] p-4 shadow-xs border border-[#E6EDF5] max-w-full">
                          <p className="text-base text-[#071A44] font-medium leading-relaxed">
                            {renderAnnotatedSentenceText(s.japaneseText)}
                          </p>

                          {showTranslations[s.id] && (
                            <div className="mt-2 pt-2 border-t border-[#E6EDF5] text-xs text-[#556987] italic">
                              "{s.vietnameseTranslation}"
                            </div>
                          )}
                        </div>

                        {/* Nút hành động nằm NGOÀI bong bóng, góc dưới phía avatar (bên trái) */}
                        <div className="flex items-center justify-start gap-1.5 mt-1.5 ml-1">
                          <button
                            type="button"
                            onClick={() => toggleTranslation(s.id)}
                            className="bg-white hover:bg-[#EEF4FB] text-[#4A5D78] border border-[#E6EDF5] text-[11px] font-bold px-3 py-1 rounded-full flex items-center gap-1 shadow-2xs transition-all cursor-pointer"
                          >
                            <span>文A</span> Dịch
                          </button>
                          <button
                            type="button"
                            onClick={() => playAudio(s.nativeAudioUrl, s.japaneseText, undefined, undefined, s.id)}
                            disabled={loadingAudioSentenceId === s.id}
                            className="bg-white hover:bg-[#EEF4FB] text-[#4A5D78] border border-[#E6EDF5] text-[11px] font-bold px-3 py-1 rounded-full flex items-center gap-1 shadow-2xs transition-all cursor-pointer disabled:opacity-60"
                          >
                            {loadingAudioSentenceId === s.id ? (
                              <>
                                <span className="w-2.5 h-2.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></span>
                                <span>Đang nạp...</span>
                              </>
                            ) : (
                              <>
                                <span>🔊</span> Nghe mẫu
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                } else {
                  // Learner Bubble (MATCHES REFERENCE IMAGE 2 EXACTLY FOR BOTH ACTIVE & COMPLETED TURNS)
                  return (
                    <div key={s.id} className="flex flex-col items-end w-full">
                      {/* Top Header: Yuuri / Learner Name */}
                      <div className="flex items-center gap-2 mb-1.5 text-xs pr-10">
                        <span className="font-bold text-[#071A44]">{learnerName}</span>
                        {(() => {
                          const sentenceResult = sentenceResults.get(s.id);
                          const activeScore = (isCurrentActive && practiceState === 'evaluated')
                            ? currentScore
                            : (sentenceResult ? (sentenceResult.overallScore ?? sentenceResult.accuracyScore) : null);

                          if (activeScore === null || activeScore === undefined) return null;

                          return (
                            <span className={`font-bold text-[11px] px-2.5 py-0.5 rounded-full border transition-all duration-300 ${
                              activeScore >= 80
                                ? 'bg-[#ECFDF3] text-[#027A48] border-[#A6F4C5]'
                                : activeScore >= 65
                                ? 'bg-amber-50 text-amber-700 border-amber-200'
                                : 'bg-red-50 text-red-700 border-red-200'
                            }`}>
                              {activeScore}%
                            </span>
                          );
                        })()}
                      </div>

                      <div className="flex items-start gap-2.5 justify-end w-full max-w-xl">
                        {/* Dark Navy Bubble */}
                        <div className={`rounded-[22px] p-4 sm:p-5 text-white shadow-md flex flex-col justify-between min-w-0 max-w-full bg-[#071A44] transition-all ${
                          isCurrentActive && practiceState === 'listening' ? 'ring-2 ring-cyan-400 shadow-cyan-500/20' : ''
                        }`}>
                          {/* Japanese Text */}
                          <p className="text-lg sm:text-xl font-bold tracking-wide text-white leading-relaxed my-1 text-left">
                            {renderAnnotatedSentenceText(s.japaneseText)}
                          </p>

                          {/* Vietnamese Translation (if toggled) */}
                          {showTranslations[s.id] && (
                            <div className="pt-2 mt-2 text-xs sm:text-sm text-blue-100 italic border-t border-[#1F4289] text-left">
                              "{s.vietnameseTranslation}"
                            </div>
                          )}
                        </div>

                        {/* Circular Avatar */}
                        <div className="w-8 h-8 rounded-full border border-blue-400/30 overflow-hidden flex-shrink-0 shadow-xs mt-1">
                          <img src="/default_avatar.png" alt={learnerName} className="w-full h-full object-cover" />
                        </div>
                      </div>

                      {/* Nút hành động nằm NGOÀI bong bóng, góc dưới bên phải (phía avatar) */}
                      <div className="flex items-center justify-end gap-1.5 mt-1.5 w-full max-w-xl pr-10">
                        {/* 1. Mic: ghi âm / nghe lại giọng của bạn */}
                        <button
                          type="button"
                          onClick={() => {
                            if (hasRecordedAudio) {
                              playUserRecording(s.id);
                            } else {
                              startRecording();
                            }
                          }}
                          className="h-7 w-8 sm:w-9 rounded-full bg-white hover:bg-[#EEF6FE] text-[#0878EE] border border-[#BCDDFB] flex items-center justify-center transition-all shadow-2xs cursor-pointer"
                          title={hasRecordedAudio ? "Nghe lại giọng ghi âm của bạn" : "Bấm để ghi âm câu này"}
                        >
                          <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                            <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                          </svg>
                        </button>

                        {/* 2. Nghe mẫu */}
                        <button
                          type="button"
                          onClick={() => playAudio(s.nativeAudioUrl, s.japaneseText, undefined, undefined, s.id)}
                          disabled={loadingAudioSentenceId === s.id}
                          className="h-7 px-3.5 rounded-full bg-white hover:bg-[#EEF6FE] text-[#071A44] border border-[#E6EDF5] font-bold text-xs flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer disabled:opacity-60"
                          title="Nghe phát âm chuẩn câu này"
                        >
                          {loadingAudioSentenceId === s.id ? (
                            <>
                              <span className="w-2.5 h-2.5 border-2 border-[#0878EE] border-t-transparent rounded-full animate-spin"></span>
                              <span>Đang nạp...</span>
                            </>
                          ) : (
                            <>
                              <svg className="w-3.5 h-3.5 text-[#0878EE] fill-current" viewBox="0 0 24 24">
                                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                              </svg>
                              <span>Nghe mẫu</span>
                            </>
                          )}
                        </button>

                        {/* 3. 文A Dịch */}
                        <button
                          type="button"
                          onClick={() => toggleTranslation(s.id)}
                          className="h-7 px-3 rounded-full bg-white hover:bg-[#EEF6FE] text-[#4A5D78] border border-[#E6EDF5] text-xs font-bold flex items-center gap-1 transition-all shadow-2xs cursor-pointer"
                          title="Xem bản dịch tiếng Việt"
                        >
                          <span>文A Dịch</span>
                        </button>
                      </div>
                    </div>
                  );
                }
              })}
              {/* Anchor for auto-scrolling */}
              <div ref={chatEndRef} />
            </div>

            {/* ACTION CONSOLE (Recording & Evaluation) (Hình 4) - Cố định vị trí ở đáy */}
            <div className="w-full flex-shrink-0 pt-2 pb-1 z-10">
              <div
                className="w-full rounded-[24px] border-2 border-dashed bg-white/90 backdrop-blur-xs py-3.5 px-6 flex flex-col items-center justify-center shadow-xs transition-all"
                style={{ borderColor: 'rgb(147, 197, 253)' }}
              >
                {micError && (
                  <div className="w-full mb-3 p-2 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-center justify-between">
                    <span>⚠️ {micError}</span>
                    <button onClick={() => setMicError(null)} className="font-bold text-red-500">×</button>
                  </div>
                )}

                {/* CHỈ THU ÂM CÂU CỦA NGƯỜI HỌC (userRole) - KHÔNG THU ÂM CÂU CỦA ĐỐI PHƯƠNG */}
                {currentSentence?.speakerRole !== userRole ? (
                  isOpponentPausedForResume ? (
                    <div className="w-full flex flex-col items-center justify-center py-2 px-4 gap-2.5 animate-in fade-in">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-blue-100 border border-blue-300 overflow-hidden flex items-center justify-center font-bold text-base shadow-sm">
                          <img src="/default_avatar.png" alt={opponentName} className="w-full h-full object-cover" />
                        </div>
                        <div className="text-left">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-[#071A44]">{opponentName} (Đối phương)</span>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                              Tạm dừng (Tiếp tục học)
                            </span>
                          </div>
                          <p className="text-xs font-semibold text-blue-900 font-jp mt-0.5 line-clamp-1">
                            "{currentSentence?.japaneseText}"
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 my-1">
                        <button
                          type="button"
                          onClick={handlePlayResumedOpponentSentence}
                          className="text-xs font-bold text-white bg-[#0878EE] hover:bg-[#0662C6] px-5 py-2 rounded-full transition-all cursor-pointer shadow-sm flex items-center gap-1.5"
                        >
                          <span>Nghe câu đối thoại</span>
                        </button>
                        {hasNextLearnerSentence && (
                          <button
                            type="button"
                            onClick={handleSkipOpponentSpeech}
                            className="text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 px-4 py-2 rounded-full transition-all cursor-pointer"
                          >
                            <span>Sang lượt nói của bạn</span>
                          </button>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500">
                        {hasNextLearnerSentence
                          ? '* Bấm để nghe câu thoại mẫu của đối phương trước khi chuyển sang lượt nói của bạn.'
                          : '* Bấm để nghe câu đối thoại kết thúc của đối phương.'}
                      </p>
                    </div>
                  ) : (
                    <div className="w-full flex flex-col items-center justify-center py-2 px-4 gap-2.5 animate-in fade-in">
                      {/* Audio wave indicator */}
                      <div className="flex items-center gap-1 my-0.5">
                        <span className="w-1 h-2.5 bg-blue-500 rounded-full animate-bounce"></span>
                        <span className="w-1 h-4 bg-blue-600 rounded-full animate-bounce [animation-delay:0.1s]"></span>
                        <span className="w-1 h-5 bg-blue-500 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                        <span className="w-1 h-3.5 bg-blue-600 rounded-full animate-bounce [animation-delay:0.3s]"></span>
                        <span className="w-1 h-2 bg-blue-500 rounded-full animate-bounce [animation-delay:0.4s]"></span>
                      </div>
                      {hasNextLearnerSentence && (
                        <button
                          onClick={handleSkipOpponentSpeech}
                          className="text-xs font-bold text-white bg-[#0878EE] hover:bg-[#0662C6] px-5 py-1.5 rounded-full transition-all cursor-pointer shadow-sm flex items-center gap-1.5"
                        >
                          <span>Sang lượt nói của bạn</span>
                        </button>
                      )}
                    </div>
                  )
                ) : (
                  <>
                    {/* LƯỢT CỦA BẠN - State 1: Ready to record (Ảnh 1: Chỉ hiển thị nút ghi âm) */}
                    {practiceState === 'ready' && (
                      <div className="flex items-center justify-center w-full py-1">
                        <button
                          onClick={startRecording}
                          className="group bg-gradient-to-r from-[#0878EE] to-[#054EA0] hover:from-[#0662C6] hover:to-[#043A78] text-white w-14 h-14 rounded-full font-bold shadow-lg shadow-blue-500/30 flex items-center justify-center transition-all transform hover:scale-105 active:scale-95 cursor-pointer"
                          title="Bấm để ghi âm câu thoại của bạn"
                        >
                          {/* Refined minimalist mic icon */}
                          <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                            <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
                            <line x1="12" y1="18" x2="12" y2="22" />
                          </svg>
                        </button>
                      </div>
                    )}

                    {/* LƯỢT CỦA BẠN - State 2: Listening (Đang ghi âm câu thoại) */}
                    {practiceState === 'listening' && (
                      <div className="flex items-center justify-center w-full py-1">
                        <RecordingBar onCancel={cancelRecording} onSend={stopRecordingManually} />
                      </div>
                    )}

                    {/* LƯỢT CỦA BẠN - State B: Analyzing / Processing (Đang phân tích bản ghi) */}
                    {practiceState === 'analyzing' && (
                      <div className="w-full flex items-center justify-center gap-3 py-6 bg-white rounded-2xl border border-[#E6EDF5] shadow-2xs text-[#071A44] font-bold text-sm animate-pulse">
                        <div className="w-5 h-5 border-2 border-[#0878EE] border-t-transparent rounded-full animate-spin"></div>
                        <span>Đang phân tích bản ghi âm...</span>
                      </div>
                    )}

                    {/* LƯỢT CỦA BẠN - State 3: Evaluated (State C & State D chuẩn SaaS EdTech) */}
                    {practiceState === 'evaluated' && currentSentence && (
                      <ShadowingSentenceResultCard
                        targetText={currentSentence.japaneseText}
                        spokenText={currentRecognizedText}
                        overallScore={currentScore}
                        fluencyMetrics={currentFluencyMetrics}
                        gateDetail={currentGateDetail}
                        diffTokens={currentDiffTokens}
                        attemptsCount={sentenceAttemptsMap.get(currentSentence.id) || 1}
                        hasRecording={recordedAudioUrls.has(currentSentence.id)}
                        isPlayingUserAudio={playingUserAudioSentenceId === currentSentence.id}
                        evaluationStatus={currentEvaluationStatus}
                        recognitionSource={currentRecognitionSource}
                        onPlayUserAudio={() => playUserRecording(currentSentence.id)}
                        onRetry={handleRetryCurrentSentence}
                        onNext={handleNextSentence}
                      />
                    )}
                  </>
                )}
              </div>
            </div>
          </section>
        </div>
      </main>

      {/* MODAL 1: FullScriptModal (Xem kịch bản toàn bộ) */}
      {isFullScriptModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#071A44]/50 backdrop-blur-xs transition-all duration-200"
          onClick={() => setIsFullScriptModalOpen(false)}
        >
          <div
            className="bg-white rounded-[28px] max-w-2xl w-full max-h-[88vh] shadow-2xl border border-[#E6EDF5] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-5 border-b border-[#E6EDF5] bg-[#F4F9FE] flex items-center justify-between">
              <h3 className="font-extrabold text-[#071A44] text-lg">
                Toàn bộ kịch bản hội thoại
              </h3>
              <button
                onClick={() => setIsFullScriptModalOpen(false)}
                className="w-8 h-8 rounded-full bg-white hover:bg-red-50 text-[#556987] hover:text-[#D92D20] border border-[#E6EDF5] flex items-center justify-center font-bold text-sm transition-colors shadow-2xs cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 flex-1 text-sm bg-white">
              <div className="space-y-3.5">
                {sentences.map(s => (
                  <div
                    key={s.id}
                    className={`flex items-start gap-2.5 ${s.speakerRole === userRole ? 'justify-end' : 'justify-start'}`}
                  >
                    {s.speakerRole !== userRole && (
                      <div className="w-8 h-8 rounded-full bg-blue-100 overflow-hidden flex-shrink-0 mt-1">
                        <img src="/default_avatar.png" alt="Opponent" className="w-full h-full object-cover" />
                      </div>
                    )}

                    <div className={`flex flex-col max-w-[80%] ${s.speakerRole === userRole ? 'items-end' : 'items-start'}`}>
                      <div className="flex items-center gap-1.5 mb-1">
                        <button
                          onClick={() => playAudio(s.nativeAudioUrl, s.japaneseText)}
                          className="bg-white hover:bg-blue-50 text-[#0878EE] border border-blue-200 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-2xs cursor-pointer"
                        >
                          <span>🔊</span> Nghe
                        </button>
                        <span className="text-[10px] text-[#556987]">Câu #{s.orderIndex}</span>
                        <span className="font-bold text-xs text-[#071A44]">
                          {s.speakerRole === 'A' ? dialogue.speakerRoleA_Name : dialogue.speakerRoleB_Name}
                        </span>
                      </div>

                      <div
                        className={`p-3 rounded-2xl border text-sm ${
                          s.speakerRole === userRole
                            ? 'bg-[#EEF6FE] border-[#BCDDFB] text-right'
                            : 'bg-[#F8FAFD] border-[#E6EDF5] text-left'
                        }`}
                      >
                        <p className="font-semibold text-[#071A44] leading-relaxed">{s.japaneseText}</p>
                        <p className="text-xs text-[#556987] mt-1 italic">"{s.vietnameseTranslation}"</p>
                      </div>
                    </div>

                    {s.speakerRole === userRole && (
                      <div className="w-8 h-8 rounded-full border border-blue-400/30 overflow-hidden flex-shrink-0 mt-1">
                        <img src="/default_avatar.png" alt="Learner" className="w-full h-full object-cover" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="p-4 border-t border-[#E6EDF5] bg-[#F4F9FE] flex justify-end">
              <button
                onClick={() => setIsFullScriptModalOpen(false)}
                className="px-6 py-2 rounded-full bg-[#0878EE] text-white text-xs font-bold hover:bg-[#0662C6] cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: CompletedModal (Đánh giá tổng quát 4 tiêu chí & So sánh âm thanh) */}
      {isCompletedModalOpen && (
        <div className="fixed inset-0 bg-[#071A44]/50 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-[28px] max-w-3xl w-full shadow-2xl border border-[#E6EDF5] max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95 duration-200 overflow-hidden">
            {/* Scrollable Content Body (Trục cuộn duy nhất) */}
            <div className="flex-1 overflow-y-auto p-5 sm:p-7 space-y-5">
              {/* 1. Header */}
              <div className="flex flex-col items-center text-center">
                <div className="w-12 h-12 rounded-2xl bg-[#EEF6FE] text-[#0878EE] flex items-center justify-center shadow-xs border border-[#BCDDFB] mb-2">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                  </svg>
                </div>
                <h3 className="text-xl sm:text-2xl font-black text-[#071A44] tracking-tight">
                  Chúc mừng bạn đã hoàn thành bài luyện!
                </h3>
                <p className="text-xs sm:text-sm text-[#556987] font-medium mt-1">
                  {dialogue.title} · <span className="text-[#0878EE] font-semibold">{practicedSentencesCount}/{totalLearnerSentencesCount} câu đã luyện</span> · JLPT {dialogue.jlptLevel}
                </p>
                {historySaveState === 'saving' && (
                  <p className="text-[11px] text-[#556987] mt-1">Đang lưu buổi luyện vào lịch sử...</p>
                )}
                {historySaveState === 'saved' && (
                  <p className="text-[11px] text-[#027A48] font-semibold mt-1">Đã lưu buổi luyện vào lịch sử.</p>
                )}
                {historySaveState === 'failed' && (
                  <p className="text-[11px] text-red-600 font-semibold mt-1">{historySaveMessage}</p>
                )}
              </div>

              {/* 2. Unified Hero Score Card (Hợp nhất Điểm tổng & 2 Trụ cột cốt lõi) */}
              <div className="p-5 sm:p-6 rounded-2xl bg-gradient-to-br from-[#F8FAFD] via-white to-blue-50/30 border border-[#E6EDF5] shadow-xs">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
                  {/* Left Column: Overall Score & Rank (5 cols) */}
                  <div className="md:col-span-5 flex items-center gap-4 border-b md:border-b-0 md:border-r border-slate-100 pb-4 md:pb-0 md:pr-4">
                    <div className={`w-20 h-20 rounded-2xl flex flex-col items-center justify-center flex-shrink-0 shadow-sm ${
                      practicedSentencesCount === 0 || finalWeightedScore === 0
                        ? 'bg-gradient-to-br from-slate-400 to-slate-500 text-white'
                        : finalWeightedScore >= 80
                        ? 'bg-gradient-to-br from-[#0878EE] to-[#054EA0] text-white'
                        : finalWeightedScore >= 65
                        ? 'bg-gradient-to-br from-amber-500 to-amber-600 text-white'
                        : 'bg-gradient-to-br from-rose-500 to-rose-600 text-white'
                    }`}>
                      <span className="text-3xl font-black leading-none">{practicedSentencesCount === 0 ? '—' : finalWeightedScore}</span>
                      <span className="text-[10px] uppercase font-bold tracking-wider opacity-85 mt-1">/ 100</span>
                    </div>

                    <div className="space-y-1.5 min-w-0">
                      <div>
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-black tracking-tight ${
                          practicedSentencesCount === 0 || finalWeightedScore === 0
                            ? 'bg-slate-100 text-slate-600 border border-slate-200'
                            : finalWeightedScore >= 90
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : finalWeightedScore >= 80
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : finalWeightedScore >= 65
                            ? 'bg-amber-50 text-amber-800 border border-amber-200'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}>
                          {practicedSentencesCount === 0 || finalWeightedScore === 0
                            ? 'Chưa luyện tập'
                            : finalWeightedScore >= 90
                            ? 'Hạng S · Rất xuất sắc'
                            : finalWeightedScore >= 80
                            ? 'Hạng A · Rất tốt'
                            : finalWeightedScore >= 65
                            ? 'Hạng B · Khá'
                            : 'Cần luyện thêm'}
                        </span>
                      </div>
                      <p className="text-xs text-[#556987] font-medium">
                        Thời gian: <strong className="text-[#071A44]">{Math.floor(sessionDurationSeconds / 60)}m {sessionDurationSeconds % 60}s</strong> · Vai <strong className="text-[#0878EE]">{userRole}</strong>
                      </p>
                      <div className="flex items-center gap-2 text-[11px] text-slate-500 font-medium">
                        <span className="inline-flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                          {finalGreenCount} câu tốt
                        </span>
                        {finalYellowCount > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                            {finalYellowCount} câu khá
                          </span>
                        )}
                        {finalRedCount > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                            {finalRedCount} cần sửa
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right Column: 2 Core Pillars Bars (7 cols) */}
                  <div className="md:col-span-7 space-y-3">
                    {/* Pillar 1: Content Match (đối chiếu văn bản với câu mẫu, chưa phải điểm phát âm) */}
                    <div>
                      <div className="flex justify-between items-center text-xs mb-1">
                        <span className="font-bold text-[#071A44] flex items-center gap-1.5">
                          <span>Độ khớp nội dung</span>
                        </span>
                        <span className="font-extrabold text-[#0878EE] text-xs">
                          {practicedSentencesCount === 0 ? 'Chưa chấm' : `${finalContentMatchScore}%`}
                        </span>
                      </div>
                      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-[#0878EE] h-full rounded-full transition-all duration-500"
                          style={{ width: `${Math.min(100, Math.max(0, finalContentMatchScore))}%` }}
                        />
                      </div>
                    </div>

                    {/* Pillar 2: Fluency — chỉ hiển thị khi đã đo được đáng tin cậy */}
                    <div>
                      <div className="flex justify-between items-center text-xs mb-1">
                        <span className="font-bold text-[#071A44] flex items-center gap-1.5">
                          <span>Độ lưu loát & Ngắt nhịp</span>
                        </span>
                        {finalFluencyScore == null ? (
                          <span className="text-[11px] font-semibold text-slate-400">Chưa đo ở phiên bản này</span>
                        ) : (
                          <span className="font-extrabold text-teal-700 text-xs">{finalFluencyScore}%</span>
                        )}
                      </div>
                      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                        {finalFluencyScore != null && (
                          <div
                            className="bg-teal-500 h-full rounded-full transition-all duration-500"
                            style={{ width: `${Math.min(100, Math.max(0, finalFluencyScore))}%` }}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Subtle mic warning only if mic had an issue */}
                {finalGateStatus === 'needs_retry' && (
                  <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-2 text-xs text-amber-700">
                    <svg className="w-4 h-4 flex-shrink-0 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span>Tín hiệu micro hơi nhỏ hoặc có tạp âm. Bạn nên dùng tai nghe có micro để có kết quả tốt nhất.</span>
                  </div>
                )}
              </div>

            {/* 3. Chi tiết từng câu thoại (Không còn nested scroll!) */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-[#071A44] text-sm">
                    Chi tiết từng câu thoại
                  </h4>
                  <p className="text-xs text-[#556987]">
                    Nghe lại bản thu tốt nhất của bạn và đối chiếu trực tiếp với phát âm câu mẫu.
                  </p>
                </div>
                <span className="text-xs font-semibold text-[#0878EE] bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-100">
                  {sentences.filter(s => s.speakerRole === userRole).length} câu của vai bạn
                </span>
              </div>

              <div className="space-y-3">
                {sentences
                  .filter((s) => s.speakerRole === userRole)
                  .map((s) => {
                    const res = sentenceResults.get(s.id);
                    // Điểm và tier do backend tính; không tái tạo ở client.
                    const sentenceScore = res ? res.overallScore : 0;
                    const tier = res?.evaluationTier ?? 'red';
                    const hasUserRecording = recordedAudioUrls.has(s.id);
                    const isPlayingUser = playingUserAudioSentenceId === s.id;
                    const isPlayingNative = isPlayingAudio && loadingAudioSentenceId === s.id;
                    const attempts = res?.attemptsCount ?? (sentenceAttemptsMap.get(s.id) || 1);

                    return (
                      <div
                        key={s.id}
                        className="p-3.5 sm:p-4 rounded-xl bg-white border border-[#E6EDF5] hover:border-blue-200 transition-all shadow-xs space-y-2.5"
                      >
                        {/* Top row: order, score, buttons */}
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                              #{s.orderIndex}
                            </span>
                            <span
                              className={`text-[11px] font-black px-2 py-0.5 rounded ${
                                !res
                                  ? 'bg-slate-100 text-slate-500 border border-slate-200'
                                  : tier === 'green'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : tier === 'yellow'
                                  ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                  : 'bg-rose-50 text-rose-700 border border-rose-200'
                              }`}
                            >
                              {res ? `${sentenceScore} điểm` : 'Chưa chấm'}
                            </span>
                            {attempts > 1 && (
                              <span className="text-[10px] text-slate-400 font-medium">
                                (thử {attempts} lần)
                              </span>
                            )}
                          </div>

                          {/* Dual Audio Player Buttons */}
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled={!hasUserRecording}
                              onClick={() => playUserRecording(s.id)}
                              className={`h-7 px-2.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                                !hasUserRecording
                                  ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed opacity-50'
                                  : isPlayingUser
                                  ? 'bg-blue-600 text-white shadow-xs'
                                  : 'bg-blue-50 hover:bg-blue-100 text-[#0878EE] border border-blue-200'
                              }`}
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 100-6 3 3 0 000 6z" />
                              </svg>
                              <span>{isPlayingUser ? 'Đang phát...' : 'Nghe bạn'}</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => playAudio(s.nativeAudioUrl, s.japaneseText, undefined, undefined, s.id)}
                              className={`h-7 px-2.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                                isPlayingNative
                                  ? 'bg-slate-800 text-white shadow-xs'
                                  : 'bg-slate-100 hover:bg-slate-200 text-[#071A44] border border-slate-200'
                              }`}
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                              </svg>
                              <span>{isPlayingNative ? 'Đang phát...' : 'Mẫu'}</span>
                            </button>
                          </div>
                        </div>

                        {/* Sentence Diff View */}
                        <div className="bg-[#F8FAFD] p-2.5 rounded-lg border border-slate-100">
                          <JapaneseSentenceDiffView
                            diffTokens={res?.diffTokens}
                            targetText={s.japaneseText}
                            spokenText={res?.recognizedText}
                            size="sm"
                          />
                        </div>

                        {/* Translation and Romaji */}
                        <div className="space-y-0.5 text-xs text-[#556987]">
                          {s.romajiText && (
                            <p className="text-[11px] text-slate-400 font-mono">
                              {s.romajiText}
                            </p>
                          )}
                          <p className="text-slate-600">
                            "{s.vietnameseTranslation}"
                          </p>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>

          </div>

          {/* Sticky / Pinned Footer Bar (Luôn hiển thị cố định ở chân modal) */}
          <div className="p-4 sm:px-7 bg-white/95 backdrop-blur-md border-t border-[#E6EDF5] flex flex-col sm:flex-row items-center justify-between gap-3 flex-shrink-0">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                onClick={() => {
                  handleConfirmRoleChange(userRoleRef.current);
                }}
                className="flex-1 sm:flex-initial text-xs font-bold text-[#556987] hover:text-[#071A44] bg-[#F4F9FE] hover:bg-[#EEF6FE] border border-[#E6EDF5] px-4 py-2.5 rounded-xl transition-all cursor-pointer"
              >
                Luyện lại bài này
              </button>
              <button
                onClick={() => {
                  stopAllAudio();
                  setIsCompletedModalOpen(false);
                  setIsRoleModalOpen(true);
                }}
                className="flex-1 sm:flex-initial text-xs font-bold text-[#0878EE] bg-blue-50 hover:bg-blue-100 border border-[#BCDDFB] px-4 py-2.5 rounded-xl transition-all cursor-pointer"
              >
                Đổi sang vai ({opponentRole})
              </button>
            </div>
            <button
              onClick={handleBackToDialogueList}
              className="w-full sm:w-auto text-xs font-extrabold text-white bg-[#0878EE] hover:bg-[#0662C6] px-6 py-2.5 rounded-xl shadow-xs transition-all cursor-pointer"
            >
              Xong
            </button>
          </div>
        </div>
      </div>
    )}

      <RoleSelectionModal
        isOpen={isRoleModalOpen}
        onClose={() => setIsRoleModalOpen(false)}
        dialogueId={dialogue.id}
        dialogueTitle={dialogue.title}
        roleAName={dialogue.speakerRoleA_Name}
        roleBName={dialogue.speakerRoleB_Name}
        onConfirm={handleConfirmRoleChange}
      />

      {/* 1. Modal Cài đặt thiết bị âm thanh (Microphone & Loa) */}
      <AudioDeviceSettingsModal
        isOpen={isAudioDeviceModalOpen}
        onClose={() => setIsAudioDeviceModalOpen(false)}
        selectedInputId={selectedAudioInputDeviceId}
        selectedOutputId={selectedAudioOutputDeviceId}
        onSave={(inId, outId) => {
          setSelectedAudioInputDeviceId(inId);
          setSelectedAudioOutputDeviceId(outId);
        }}
      />
    </div>
  );
};

