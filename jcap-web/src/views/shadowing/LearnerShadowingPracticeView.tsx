import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { shadowingService } from '../../services/shadowingService';
import { shadowingStorageService } from '../../services/shadowingStorageService';
import type {
  ShadowingDialogueDetail,
  ShadowingSentenceItem,
  ShadowingSentencePracticeResult,
  ShadowingAiAnalysisResult,
  ShadowingVocabularyItem,
  ShadowingGrammarItem,
} from '../../types/shadowing';
import { RoleSelectionModal } from '../../components/shadowing/RoleSelectionModal';
import { AudioDeviceSettingsModal } from '../../components/shadowing/AudioDeviceSettingsModal';
import { voicevoxService, type VoiceOption } from '../../services/voicevoxService';
import { audioMetricsService, type AudioQualityMetrics, type AudioGateStatus } from '../../services/audioMetricsService';
import { useAuth } from '../../contexts/AuthContext';
import {
  compareJapaneseSpeechTokens,
  type JapaneseDiffToken,
} from '../../utils/japaneseDiffUtils';
import { JapaneseSentenceDiffView } from '../../components/shadowing/JapaneseSentenceDiffView';
import { ShadowingSentenceResultCard } from '../../components/shadowing/ShadowingSentenceResultCard';

export const LearnerShadowingPracticeView: React.FC = () => {
  const { id } = useParams<{ id?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role?.toLowerCase() === 'admin';

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
  const [liveTranscript, setLiveTranscript] = useState<string>('');
  const liveTranscriptRef = useRef<string>('');
  const [currentRecognizedText, setCurrentRecognizedText] = useState<string>('');
  const [currentScore, setCurrentScore] = useState<number>(0);
  const [currentContentMatchScore, setCurrentContentMatchScore] = useState<number>(0);
  const [currentTier, setCurrentTier] = useState<'green' | 'yellow' | 'red'>('red');
  const [currentFeedback, setCurrentFeedback] = useState<string>('');
  const [currentFluencyScore, setCurrentFluencyScore] = useState<number>(0);
  const [currentIntonationScore, setCurrentIntonationScore] = useState<number>(0);
  const [currentQualityScore, setCurrentQualityScore] = useState<number>(0);
  const [currentQualityLabel, setCurrentQualityLabel] = useState<string>('Rất rõ ràng, ít tạp âm');
  const [currentGateStatus, setCurrentGateStatus] = useState<AudioGateStatus>('good');
  const [currentGateLabel, setCurrentGateLabel] = useState<string>('Tốt (Tín hiệu rõ nét)');
  const [currentGateDetail, setCurrentGateDetail] = useState<string>('');
  const [currentDiffTokens, setCurrentDiffTokens] = useState<JapaneseDiffToken[]>([]);
  const [currentEvaluationStatus, setCurrentEvaluationStatus] = useState<'completed' | 'partial' | 'unavailable' | 'failed'>('completed');
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
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // Modals & Slideovers (Mặc định ẩn nội dung khi lần đầu vào trang, mũi tên hướng xuống)
  const [isSituationCollapsed, setIsSituationCollapsed] = useState<boolean>(true);
  const [isDialogueContentCollapsed, setIsDialogueContentCollapsed] = useState<boolean>(true);
  const [isFullScriptModalOpen, setIsFullScriptModalOpen] = useState<boolean>(false);
  const [isCompletedModalOpen, setIsCompletedModalOpen] = useState<boolean>(false);
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

  // AI Analysis State
  const [isRequestingAi, setIsRequestingAi] = useState<boolean>(false);
  const [aiAnalysisResult, setAiAnalysisResult] = useState<ShadowingAiAnalysisResult | null>(null);
  const [aiAnalysisError, setAiAnalysisError] = useState<string | null>(null);

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
          setLiveTranscript('');
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
      stopAllAudio();
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
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
        setLiveTranscript('');
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

  // Text normalization & comparison for Japanese speech evaluation
  const normalizeJapanese = (str: string): string => {
    return str
      .normalize('NFKC')
      .replace(/[\s。、！？!?.,\-_~—「」『』()（）]/g, '')
      .toLowerCase();
  };

  const compareJapaneseSpeech = (target: string, spoken: string) => {
    const cleanTarget = normalizeJapanese(target);
    const cleanSpoken = normalizeJapanese(spoken);

    if (!cleanSpoken) {
      return {
        score: 50,
        tier: 'red' as const,
        feedback: 'Chưa phát hiện được giọng nói rõ ràng. Hãy bấm Micro và nói to câu tiếng Nhật mẫu nhé.',
        similarity: 0,
        hasSpoken: false,
      };
    }

    if (cleanTarget === cleanSpoken) {
      return {
        score: 98,
        tier: 'green' as const,
        feedback: 'Hoàn hảo! Phát âm và trường âm chính xác 100% so với câu mẫu chuẩn Tokyo.',
        similarity: 1.0,
        hasSpoken: true,
      };
    }

    const m = cleanTarget.length;
    const n = cleanSpoken.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = cleanTarget[i - 1] === cleanSpoken[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + cost
        );
      }
    }

    const distance = dp[m][n];
    const maxLen = Math.max(m, n);
    const similarity = Math.max(0, 1 - distance / maxLen);

    if (similarity >= 0.80) {
      const score = Math.round(85 + (similarity - 0.80) * 65);
      return {
        score: Math.min(96, Math.max(85, score)),
        tier: 'green' as const,
        feedback: 'Xuất sắc! Ngữ điệu tự nhiên, trường âm chuẩn xác, khớp nhịp điệu bản xứ.',
        similarity,
        hasSpoken: true,
      };
    } else if (similarity >= 0.52) {
      const score = Math.round(65 + (similarity - 0.52) * 68);
      return {
        score: Math.min(84, Math.max(65, score)),
        tier: 'yellow' as const,
        feedback: 'Khá tốt! Một số từ hoặc trợ từ chưa thật chuẩn xác, hãy nghe lại câu mẫu để hoàn thiện.',
        similarity,
        hasSpoken: true,
      };
    } else {
      const score = Math.max(35, Math.round(similarity * 90));
      return {
        score: Math.min(64, score),
        tier: 'red' as const,
        feedback: 'Cần luyện thêm. Câu nói phát âm chưa rõ hoặc khác biệt nhiều so với câu mẫu.',
        similarity,
        hasSpoken: true,
      };
    }
  };

  // Toggle translation
  const toggleTranslation = (sentenceId: number) => {
    setShowTranslations(prev => ({
      ...prev,
      [sentenceId]: !prev[sentenceId],
    }));
  };

  // Start Voice Recording (CHỈ ghi âm khi tới câu của người học: speakerRole === userRole)
  const startRecording = async () => {
    if (!currentSentence || currentSentence.speakerRole !== userRole) return;

    isRecordingRef.current = true;
    setMicError(null);
    setLiveTranscript('');
    liveTranscriptRef.current = '';
    setCurrentRecognizedText('');

    if (audioPlayerRef.current) audioPlayerRef.current.pause();
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    if (userAudioPlayerRef.current) userAudioPlayerRef.current.pause();
    setPlayingUserAudioSentenceId(null);

    // 1. Setup MediaRecorder với cấu hình lọc âm phần cứng tối ưu
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
      // Bắt đầu phân tích Web Audio API các chỉ số vật lý (RMS, Tạp âm, Ngắt nghỉ)
      audioMetricsService.startAnalysis(stream);

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      recordedAudioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedAudioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        if (recordedAudioChunksRef.current.length > 0) {
          const audioBlob = new Blob(recordedAudioChunksRef.current, { type: 'audio/webm' });
          const audioUrl = URL.createObjectURL(audioBlob);
          if (currentSentence && currentSentence.speakerRole === userRole) {
            setRecordedAudioUrls(prev => {
              if (latestAttemptIsBestRef.current || !prev.has(currentSentence.id)) {
                return new Map(prev).set(currentSentence.id, audioUrl);
              }
              return prev;
            });
          }
        }
        stream.getTracks().forEach(t => t.stop());
      };

      mediaRecorder.start(100);
    } catch (err: any) {
      console.warn('Microphone access denied:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setMicError('Quyền truy cập micro đã bị từ chối.');
      }
    }

    // 2. Setup SpeechRecognition (ja-JP) with Live Sync & Auto Keepalive
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      setPracticeState('listening');
      return;
    }

    try {
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch {}
      }
      const recognition = new SpeechRec();
      recognition.lang = 'ja-JP';
      recognition.continuous = true;
      recognition.interimResults = true;
      recognitionRef.current = recognition;

      recognition.onstart = () => {
        setPracticeState('listening');
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
        const liveText = (final + ' ' + interim).trim();
        liveTranscriptRef.current = liveText;
        setLiveTranscript(liveText);
      };

      recognition.onerror = (err: any) => {
        console.warn('Recognition error:', err);
      };

      recognition.onend = () => {
        // Tự động giữ kết nối liên tục nếu đang trong trạng thái ghi âm câu dài
        if (isRecordingRef.current) {
          try {
            recognition.start();
          } catch {}
        }
      };

      recognition.start();
    } catch (err) {
      console.warn('Recognition start error:', err);
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

  // Áp dụng kết quả đánh giá từ Backend Gemini AI Audio
  const applyAiEvaluation = (
    aiData: {
      recognizedText: string;
      contentMatchScore?: number | null;
      fluencyScore?: number | null;
      overallScore?: number | null;
      tier?: 'green' | 'yellow' | 'red' | string;
      feedback?: string;
      source: string;
      evaluationStatus?: 'completed' | 'partial' | 'unavailable' | 'failed';
      missingWords?: string[];
      mismatchedWords?: string[];
    },
    metrics?: AudioQualityMetrics
  ) => {
    if (!currentSentence || currentSentence.speakerRole !== userRole) return;
    const target = currentSentence.japaneseText;

    const evaluationStatus = aiData.evaluationStatus || 'completed';
    setCurrentEvaluationStatus(evaluationStatus);

    const isAudioInvalid = evaluationStatus === 'unavailable' || evaluationStatus === 'failed';
    // KHÔNG BAO GIỜ gán recognized = target nếu recognizedText rỗng!
    const fallbackSpoken = (liveTranscriptRef.current || liveTranscript).trim();
    const recognized = aiData.recognizedText?.trim() || (isAudioInvalid ? '' : fallbackSpoken);

    if (!recognized && !isAudioInvalid) {
      // Cả hai nguồn đều không có text -> chuyển thành unavailable (State C)
      setCurrentEvaluationStatus('unavailable');
      setCurrentRecognizedText('');
      setCurrentScore(0);
      setCurrentContentMatchScore(0);
      setCurrentFluencyScore(0);
      setCurrentTier('red');
      setCurrentGateStatus('needs_retry');
      setCurrentGateLabel('Cần thu lại');
      setCurrentGateDetail('Chưa nhận diện được giọng nói trong bản thu âm');
      setPracticeState('evaluated');
      return;
    }

    const comparison = compareJapaneseSpeechTokens(target, recognized);
    const contentMatch = (aiData.contentMatchScore != null)
      ? aiData.contentMatchScore
      : comparison.contentMatchScore;
    const fluency = (aiData.fluencyScore != null && aiData.fluencyScore > 0)
      ? aiData.fluencyScore
      : (metrics ? metrics.fluencyScore : 88);

    // NGUYÊN TẮC: Nếu sai toàn bộ nội dung (contentMatch === 0), điểm tổng kết BẮT BUỘC = 0!
    let overallScore = 0;
    if (contentMatch > 0) {
      if (aiData.overallScore != null && aiData.overallScore > 0 && aiData.source === 'gemini') {
        overallScore = Math.min(aiData.overallScore, Math.round(contentMatch * 0.60 + fluency * 0.40));
      } else {
        overallScore = contentMatch < 30
          ? Math.min(contentMatch, Math.round(contentMatch * 0.60 + fluency * 0.40))
          : Math.round(contentMatch * 0.60 + fluency * 0.40);
      }
    }

    const tier: 'green' | 'yellow' | 'red' = (aiData.tier === 'green' || aiData.tier === 'yellow' || aiData.tier === 'red')
      ? (overallScore === 0 ? 'red' : aiData.tier as 'green' | 'yellow' | 'red')
      : (overallScore >= 80 ? 'green' : overallScore >= 65 ? 'yellow' : 'red');

    const prevAttempts = sentenceAttemptsMap.get(currentSentence.id) || 0;
    const nextAttempts = prevAttempts + 1;
    setSentenceAttemptsMap(prev => new Map(prev).set(currentSentence.id, nextAttempts));

    const gateStatus: AudioGateStatus = isAudioInvalid ? 'needs_retry' : 'good';
    const gateLabel = isAudioInvalid ? 'Cần thu lại' : 'Tốt (AI đã thẩm định)';
    const gateDetail = isAudioInvalid
      ? (aiData.feedback || 'Không phát hiện giọng nói hoặc âm thanh chưa đạt chuẩn')
      : 'Âm thanh rõ nét, AI đã phân tích giọng nói';

    setCurrentRecognizedText(recognized);
    setCurrentScore(overallScore);
    setCurrentContentMatchScore(contentMatch);
    setCurrentFluencyScore(fluency);
    setCurrentTier(tier);
    setCurrentFeedback(aiData.feedback || comparison.feedback);
    setCurrentGateStatus(gateStatus);
    setCurrentGateLabel(gateLabel);
    setCurrentGateDetail(gateDetail);
    setCurrentDiffTokens(comparison.diffTokens);
    setCurrentQualityScore(isAudioInvalid ? 30 : 96);
    setCurrentQualityLabel(gateLabel);
    setPracticeState('evaluated');

    const prevResult = sentenceResults.get(currentSentence.id);
    const prevScore = prevResult ? (prevResult.overallScore ?? prevResult.accuracyScore) : -1;

    if (!isAudioInvalid) {
      latestAttemptIsBestRef.current = (!prevResult || !prevResult.isValidForBestAttempt || overallScore >= prevScore);
      const resultItem: ShadowingSentencePracticeResult = {
        sentenceId: currentSentence.id,
        orderIndex: currentSentence.orderIndex,
        targetText: target,
        recognizedText: recognized,
        contentMatchScore: contentMatch,
        fluencyScore: fluency,
        overallScore: overallScore,
        accuracyScore: overallScore,
        intonationScore: contentMatch === 0 ? 0 : Math.round(contentMatch * 0.5 + fluency * 0.5),
        evaluationStatus,
        feedback: aiData.feedback || comparison.feedback,
        missingWords: aiData.missingWords,
        mismatchedWords: aiData.mismatchedWords,
        audioGateStatus: 'good',
        audioGateLabel: 'Tốt (AI đã thẩm định)',
        audioQualityScore: 96,
        isValidForBestAttempt: true,
        attemptsCount: nextAttempts,
        evaluationTier: tier,
        diffTokens: comparison.diffTokens,
        durationMs: metrics?.durationMs || 2000,
        targetAudioUrl: currentSentence.nativeAudioUrl,
        romajiText: currentSentence.romajiText,
        vietnameseTranslation: currentSentence.vietnameseTranslation,
      };
      setSentenceResults(prev => new Map(prev).set(currentSentence.id, resultItem));
    } else {
      latestAttemptIsBestRef.current = false;
      setSentenceResults(prev => {
        const existing = prev.get(currentSentence.id);
        if (!existing) return prev;
        return new Map(prev).set(currentSentence.id, {
          ...existing,
          attemptsCount: nextAttempts,
        });
      });
    }
  };

  // Stop recording manually: evaluate speech transcript
  const stopRecordingManually = () => {
    isRecordingRef.current = false;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
    }
    stopRecordingMedia();
    setPracticeState('analyzing');

    setTimeout(async () => {
      const metrics = audioMetricsService.stopAnalysis(currentSentence?.audioDurationMs);
      const spoken = (liveTranscriptRef.current || liveTranscript).trim();
      const target = currentSentence?.japaneseText || '';

      // 1. Thử gửi audio lên Backend Gemini Audio Assessment
      if (recordedAudioChunksRef.current.length > 0 && target) {
        try {
          const audioBlob = new Blob(recordedAudioChunksRef.current, { type: 'audio/webm' });
          const aiRes = await shadowingService.evaluateAudio(audioBlob, target);
          if (aiRes.success && aiRes.data) {
            const d = aiRes.data;
            // Chỉ dùng kết quả AI nếu backend thực sự hoàn tất phân tích và có điểm số hợp lệ
            if (d.evaluationStatus === 'completed' && d.recognizedText && d.overallScore != null && d.overallScore > 0) {
              applyAiEvaluation(d, metrics);
              return;
            } else if (d.evaluationStatus === 'unavailable' && !spoken) {
              // Cả AI backend và Speech recognition đều không phát hiện giọng nói
              applyAiEvaluation(d, metrics);
              return;
            }
            // Nếu AI backend trả về 'partial' / 'client_fallback' (chưa cấu hình API key, timeout, v.v.):
            // TỰ ĐỘNG CHUYỂN TIẾP xuống evaluateSpeech(spoken, metrics) để dùng nhận diện cục bộ chính xác!
          }
        } catch (err) {
          console.warn('[Gemini Audio Assessment] Tự động fallback sang Client Local Assessment:', err);
        }
      }

      // 2. Graceful Fallback sang đánh giá cục bộ nếu AI không phản hồi hoặc đang ở chế độ client_fallback
      evaluateSpeech(spoken, metrics);
    }, 180);
  };

  // Evaluate speech transcript by comparing with target text (CHỈ đánh giá câu của người học)
  const evaluateSpeech = (recognized: string, metrics?: AudioQualityMetrics) => {
    if (!currentSentence || currentSentence.speakerRole !== userRole) return;
    const target = currentSentence.japaneseText;

    // 1. Phân tích so khớp câu chữ chuyên biệt (Content Match) & Diff Highlighting
    const comparison = compareJapaneseSpeechTokens(target, recognized);
    const contentMatch = comparison.contentMatchScore;

    // 2. Phân tích chỉ số vật lý âm thanh & Lưu loát (Fluency) qua Web Audio API
    const m = metrics || audioMetricsService.stopAnalysis(currentSentence.audioDurationMs);
    const fluency = m.fluencyScore;

    // QUAN TRỌNG: Nếu Web Speech API hoặc comparison đã nhận diện ra câu chữ:
    // Chứng minh chắc chắn micro đã thu được giọng nói!
    // Không bao giờ để lỗi AudioContext/Volume đánh rớt thành "needs_retry" khi đã có text!
    const cleanSpoken = (recognized || comparison.cleanSpoken || '').trim();
    const hasSpokenWords = cleanSpoken.length > 0;
    const localEvalStatus: 'completed' | 'partial' | 'unavailable' | 'failed' = hasSpokenWords ? 'partial' : 'unavailable';
    setCurrentEvaluationStatus(localEvalStatus);

    let gateStatus = m.gateStatus;
    let gateLabel = m.gateLabel;
    let gateDetail = m.gateDetail;
    let isValid = m.isValidForAssessment;

    if (hasSpokenWords) {
      if (gateStatus === 'needs_retry') {
        gateStatus = 'good';
        gateLabel = 'Tốt (Tín hiệu rõ nét)';
        gateDetail = 'Tín hiệu rõ nét, micro đã nhận diện câu thoại';
        isValid = true;
      }
    } else {
      gateStatus = 'needs_retry';
      gateLabel = 'Cần thu lại';
      gateDetail = m.gateDetail || 'Âm lượng mic quá nhỏ hoặc chưa thu được tiếng';
      isValid = false;
    }

    // 3. Mô hình tính điểm 2 Trụ cột cốt lõi: 60% Khớp nội dung + 40% Lưu loát
    // NGUYÊN TẮC: Nếu sai toàn bộ nội dung (contentMatch === 0), điểm tổng kết BẮT BUỘC = 0!
    // Tuyệt đối không cộng điểm lưu loát khi phát âm sai toàn bộ hoặc nói câu không liên quan.
    let weightedScore = 0;
    if (contentMatch > 0) {
      if (contentMatch < 30) {
        // Chỉ đúng 1-2 trợ từ nhỏ ngẫu nhiên (<30%): Giới hạn điểm không vượt quá độ khớp nội dung
        weightedScore = Math.min(contentMatch, Math.round(contentMatch * 0.60 + fluency * 0.40));
      } else {
        weightedScore = Math.round(contentMatch * 0.60 + fluency * 0.40);
      }
    }
    const tier: 'green' | 'yellow' | 'red' = weightedScore >= 80 ? 'green' : weightedScore >= 65 ? 'yellow' : 'red';

    // Đếm số lần thử câu này (Attempts Tracking)
    const prevAttempts = sentenceAttemptsMap.get(currentSentence.id) || 0;
    const nextAttempts = prevAttempts + 1;
    setSentenceAttemptsMap(prev => new Map(prev).set(currentSentence.id, nextAttempts));

    // Cập nhật state hiển thị thanh trạng thái
    setCurrentRecognizedText(cleanSpoken);
    setCurrentScore(weightedScore);
    setCurrentContentMatchScore(contentMatch);
    setCurrentFluencyScore(fluency);
    setCurrentTier(tier);
    setCurrentFeedback(comparison.feedback);
    setCurrentGateStatus(gateStatus);
    setCurrentGateLabel(gateLabel);
    setCurrentGateDetail(gateDetail);
    setCurrentDiffTokens(comparison.diffTokens);
    setCurrentQualityScore(m.overallQualityScore);
    setCurrentQualityLabel(gateLabel);
    setPracticeState('evaluated');

    // 4. Quản lý bản ghi điểm cao nhất (Best Attempt Management):
    // Chỉ chọn trong các bản ghi hợp lệ (isValidForAssessment = true)
    const prevResult = sentenceResults.get(currentSentence.id);
    const prevScore = prevResult ? (prevResult.overallScore ?? prevResult.accuracyScore) : -1;

    if (isValid) {
      latestAttemptIsBestRef.current = (!prevResult || !prevResult.isValidForBestAttempt || weightedScore >= prevScore);
      const resultItem: ShadowingSentencePracticeResult = {
        sentenceId: currentSentence.id,
        orderIndex: currentSentence.orderIndex,
        targetText: target,
        recognizedText: recognized || target,
        contentMatchScore: contentMatch,
        fluencyScore: fluency,
        overallScore: weightedScore,
        accuracyScore: weightedScore,
        intonationScore: contentMatch === 0 ? 0 : Math.round(contentMatch * 0.5 + fluency * 0.5),
        evaluationStatus: localEvalStatus,
        feedback: comparison.feedback,
        audioGateStatus: gateStatus,
        audioGateLabel: gateLabel,
        audioQualityScore: m.overallQualityScore,
        isValidForBestAttempt: true,
        attemptsCount: nextAttempts,
        evaluationTier: tier,
        diffTokens: comparison.diffTokens,
        durationMs: m.durationMs,
        targetAudioUrl: currentSentence.nativeAudioUrl,
        romajiText: currentSentence.romajiText,
        vietnameseTranslation: currentSentence.vietnameseTranslation,
      };
      setSentenceResults(prev => new Map(prev).set(currentSentence.id, resultItem));
    } else {
      // Âm thanh không đạt chuẩn (needs_retry) -> Không lưu làm best attempt!
      latestAttemptIsBestRef.current = false;
      if (!prevResult) {
        const invalidItem: ShadowingSentencePracticeResult = {
          sentenceId: currentSentence.id,
          orderIndex: currentSentence.orderIndex,
          targetText: target,
          recognizedText: recognized || target,
          contentMatchScore: contentMatch,
          fluencyScore: fluency,
          overallScore: weightedScore,
          accuracyScore: contentMatch,
          intonationScore: Math.round(contentMatch * 0.5 + fluency * 0.5),
          evaluationStatus: localEvalStatus,
          feedback: comparison.feedback,
          audioGateStatus: gateStatus,
          audioGateLabel: gateLabel,
          audioQualityScore: m.overallQualityScore,
          isValidForBestAttempt: false,
          attemptsCount: nextAttempts,
          evaluationTier: 'red',
          diffTokens: comparison.diffTokens,
          durationMs: m.durationMs,
          targetAudioUrl: currentSentence.nativeAudioUrl,
          romajiText: currentSentence.romajiText,
          vietnameseTranslation: currentSentence.vietnameseTranslation,
        };
        setSentenceResults(prev => new Map(prev).set(currentSentence.id, invalidItem));
      } else {
        setSentenceResults(prev => {
          const existing = prev.get(currentSentence.id);
          if (!existing) return prev;
          return new Map(prev).set(currentSentence.id, {
            ...existing,
            attemptsCount: nextAttempts,
          });
        });
      }
    }
  };

  // Retry current sentence
  const handleRetryCurrentSentence = () => {
    stopAllAudio();
    setPracticeState('ready');
    setLiveTranscript('');
    setCurrentRecognizedText('');
    setMicError(null);
    setCurrentEvaluationStatus('completed');
  };

  // Finish current sentence and move to next
  const handleNextSentence = () => {
    stopAllAudio();
    const currentDialogue = dialogueRef.current || dialogue;
    if (!currentDialogue) return;

    const nextIdx = currentSentenceIndex + 1;
    const learnerId = user?.id || user?.email || 'guest_learner';

    if (nextIdx < currentDialogue.sentences.length) {
      setCurrentSentenceIndex(nextIdx);
      setLiveTranscript('');
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

    const learnerSentences = sentences.filter(s => s.speakerRole === userRole);
    const totalLearnerCount = learnerSentences.length;

    const practicedResults = learnerSentences
      .map(s => sentenceResults.get(s.id))
      .filter((r): r is ShadowingSentencePracticeResult => r != null && r.isValidForBestAttempt !== false);

    const totalContentMatchSum = learnerSentences.reduce((sum, s) => {
      const r = sentenceResults.get(s.id);
      if (r && r.isValidForBestAttempt !== false) {
        return sum + (r.contentMatchScore ?? r.accuracyScore ?? 0);
      }
      return sum;
    }, 0);

    const totalFluencySum = learnerSentences.reduce((sum, s) => {
      const r = sentenceResults.get(s.id);
      if (r && r.isValidForBestAttempt !== false) {
        return sum + (r.fluencyScore ?? 0);
      }
      return sum;
    }, 0);

    const overallContentMatch = totalLearnerCount > 0 && practicedResults.length > 0
      ? Math.round(totalContentMatchSum / totalLearnerCount)
      : 0;
    const overallFluency = totalLearnerCount > 0 && practicedResults.length > 0
      ? Math.round(totalFluencySum / totalLearnerCount)
      : 0;
    const weightedOverallScore = Math.round(
      overallContentMatch * 0.60 + overallFluency * 0.40
    );

    const resultsList = Array.from(sentenceResults.values());
    const overallAccuracy = overallContentMatch;
    const overallIntonation = Math.round(overallContentMatch * 0.5 + overallFluency * 0.5);

    const hasRetry = resultsList.some(r => r.audioGateStatus === 'needs_retry');
    const hasAcceptable = resultsList.some(r => r.audioGateStatus === 'acceptable');
    const overallGateStatus: AudioGateStatus = hasRetry
      ? 'needs_retry'
      : hasAcceptable
      ? 'acceptable'
      : 'good';

    const gateLabel =
      overallGateStatus === 'good'
        ? 'Tốt (Tín hiệu rõ nét)'
        : overallGateStatus === 'acceptable'
        ? 'Chấp nhận được (Tạp âm / Âm lượng vừa)'
        : 'Cần kiểm tra micro';

    const overallAudioQuality = practicedResults.length > 0
      ? Math.round(practicedResults.reduce((acc, r) => acc + (r.audioQualityScore ?? (overallGateStatus === 'good' ? 92 : 72)), 0) / practicedResults.length)
      : 0;

    const greenCount = resultsList.filter(r => r.evaluationTier === 'green').length;
    const yellowCount = resultsList.filter(r => r.evaluationTier === 'yellow').length;
    const redCount = resultsList.filter(r => r.evaluationTier === 'red').length;

    let qualityStatus = 'clear';
    if (overallGateStatus === 'needs_retry') qualityStatus = 'noisy';
    else if (overallGateStatus === 'acceptable') qualityStatus = 'moderate_noise';

    const currentDialogue = dialogueRef.current || dialogue;
    if (currentDialogue) {
      const learnerId = user?.id || user?.email || 'guest_learner';
      const savedProgress = shadowingStorageService.getProgress(learnerId, currentDialogue.id);

      // 1. Cập nhật trạng thái hoàn thành vào progress storage
      shadowingStorageService.completeProgress(
        learnerId,
        currentDialogue.id,
        currentDialogue.sentences.length
      );

      // 2. Thêm một bản ghi lịch sử buổi luyện tập mới (không xóa / đè lịch sử cũ)
      shadowingStorageService.addHistorySession({
        sessionId: savedProgress?.sessionId || `session_${Date.now()}`,
        learnerId,
        dialogueId: currentDialogue.id,
        dialogueTitle: currentDialogue.title,
        scenarioTitle: currentDialogue.scenarioTitle,
        textbookTitle: currentDialogue.textbookTitle,
        chapterTitle: currentDialogue.chapterTitle,
        jlptLevel: currentDialogue.jlptLevel,
        role: userRoleRef.current,
        startedAt: new Date(practiceStartTime).toISOString(),
        completedAt: new Date().toISOString(),
        sentenceScores: resultsList.map((r) =>
          r.overallScore ?? Math.round((r.contentMatchScore ?? r.accuracyScore) * 0.60 + r.fluencyScore * 0.40)
        ),
        averageScore: weightedOverallScore,
        contentMatchScore: overallContentMatch,
        accuracyScore: overallAccuracy,
        fluencyScore: overallFluency,
        intonationScore: overallIntonation,
        audioGateStatus: overallGateStatus,
        audioGateLabel: gateLabel,
        audioQualityScore: overallAudioQuality,
        audioQualityStatus: qualityStatus,
        durationSeconds: sessionDurationSeconds,
        totalSentences: currentDialogue.sentences.length,
        completed: true,
        sentenceResults: resultsList,
      });

      // 3. Gửi đồng bộ sang API backend nếu có kết nối
      await shadowingService.completeSession({
        dialogueId: currentDialogue.id,
        learnerRole: userRoleRef.current,
        overallContentMatchScore: overallContentMatch,
        overallFluencyScore: overallFluency,
        weightedOverallScore: weightedOverallScore,
        overallAccuracyScore: overallAccuracy,
        overallIntonationScore: overallIntonation,
        overallAudioGateStatus: overallGateStatus,
        audioGateLabel: gateLabel,
        overallAudioQualityScore: overallAudioQuality,
        audioQualityStatus: qualityStatus,
        durationSeconds: sessionDurationSeconds,
        sentencesPracticed: resultsList.length,
        totalGreenSentences: greenCount,
        totalYellowSentences: yellowCount,
        totalRedSentences: redCount,
        sentenceResults: resultsList,
      });
    }
  };

  // Request AI Deep Diagnostics (15 credits)
  const handleRequestAiDiagnostics = async () => {
    const currentDialogue = dialogueRef.current || dialogue;
    if (!currentDialogue) return;
    setIsRequestingAi(true);
    setAiAnalysisError(null);

    const learnerSentences = sentences.filter(s => s.speakerRole === userRole);
    const totalLearnerCount = learnerSentences.length;

    const practicedResults = learnerSentences
      .map(s => sentenceResults.get(s.id))
      .filter((r): r is ShadowingSentencePracticeResult => r != null && r.isValidForBestAttempt !== false);

    const totalContentMatchSum = learnerSentences.reduce((sum, s) => {
      const r = sentenceResults.get(s.id);
      if (r && r.isValidForBestAttempt !== false) {
        return sum + (r.contentMatchScore ?? r.accuracyScore ?? 0);
      }
      return sum;
    }, 0);

    const totalFluencySum = learnerSentences.reduce((sum, s) => {
      const r = sentenceResults.get(s.id);
      if (r && r.isValidForBestAttempt !== false) {
        return sum + (r.fluencyScore ?? 0);
      }
      return sum;
    }, 0);

    const overallContentMatch = totalLearnerCount > 0 && practicedResults.length > 0
      ? Math.round(totalContentMatchSum / totalLearnerCount)
      : 0;
    const overallFluency = totalLearnerCount > 0 && practicedResults.length > 0
      ? Math.round(totalFluencySum / totalLearnerCount)
      : 0;
    const overallAccuracy = overallContentMatch;
    const overallIntonation = Math.round(overallContentMatch * 0.5 + overallFluency * 0.5);
    const overallAudioQuality = practicedResults.length > 0
      ? Math.round(practicedResults.reduce((acc, r) => acc + (r.audioQualityScore ?? 92), 0) / practicedResults.length)
      : 0;

    const res = await shadowingService.requestAiAnalysis({
      dialogueId: currentDialogue.id,
      learnerRole: userRoleRef.current,
      overallContentMatchScore: overallContentMatch,
      overallAccuracyScore: overallAccuracy,
      overallFluencyScore: overallFluency,
      overallIntonationScore: overallIntonation,
      overallAudioQualityScore: overallAudioQuality,
      durationSeconds: sessionDurationSeconds,
      sentenceResults: Array.from(sentenceResults.values()),
    });

    if (res.success && res.data) {
      setAiAnalysisResult(res.data);
    } else {
      setAiAnalysisError(res.message || 'Không thể tạo báo cáo AI.');
    }
    setIsRequestingAi(false);
  };

  // Role selection change
  const handleConfirmRoleChange = (newRole: 'A' | 'B') => {
    // 1. Dừng ngay lập tức toàn bộ audio, speech synthesis và timers đang chạy dở
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
    setLiveTranscript('');
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


  // Summary results for celebration modal
  const learnerSentences = sentences.filter(s => s.speakerRole === userRole);
  const totalLearnerSentencesCount = learnerSentences.length;

  const practicedResults = learnerSentences
    .map(s => sentenceResults.get(s.id))
    .filter((r): r is ShadowingSentencePracticeResult => r != null && r.isValidForBestAttempt !== false);
  const practicedSentencesCount = practicedResults.length;

  const totalContentMatchSum = learnerSentences.reduce((sum, s) => {
    const r = sentenceResults.get(s.id);
    if (r && r.isValidForBestAttempt !== false) {
      return sum + (r.contentMatchScore ?? r.accuracyScore ?? 0);
    }
    return sum;
  }, 0);

  const totalFluencySum = learnerSentences.reduce((sum, s) => {
    const r = sentenceResults.get(s.id);
    if (r && r.isValidForBestAttempt !== false) {
      return sum + (r.fluencyScore ?? 0);
    }
    return sum;
  }, 0);

  const finalContentMatchScore = totalLearnerSentencesCount > 0 && practicedSentencesCount > 0
    ? Math.round(totalContentMatchSum / totalLearnerSentencesCount)
    : 0;
  const finalFluencyScore = totalLearnerSentencesCount > 0 && practicedSentencesCount > 0
    ? Math.round(totalFluencySum / totalLearnerSentencesCount)
    : 0;
  const finalAccuracyScore = finalContentMatchScore;
  const finalIntonationScore = Math.round(finalContentMatchScore * 0.5 + finalFluencyScore * 0.5);

  // Điểm tổng kết buổi học theo 2 Trụ cột cốt lõi: 60% Khớp nội dung + 40% Lưu loát
  const finalWeightedScore = Math.round(
    finalContentMatchScore * 0.60 + finalFluencyScore * 0.40
  );
  const finalAvgScore = finalWeightedScore;

  const resultsArray = Array.from(sentenceResults.values());
  const hasRetrySentences = resultsArray.some(r => r.audioGateStatus === 'needs_retry');
  const hasAcceptableSentences = resultsArray.some(r => r.audioGateStatus === 'acceptable');
  const finalGateStatus: AudioGateStatus = hasRetrySentences
    ? 'needs_retry'
    : hasAcceptableSentences
    ? 'acceptable'
    : 'good';

  const finalGateLabel =
    finalGateStatus === 'good'
      ? 'Tốt (Tín hiệu rõ nét)'
      : finalGateStatus === 'acceptable'
      ? 'Chấp nhận được (Tạp âm / Âm lượng vừa)'
      : 'Cần kiểm tra micro';

  const finalAudioQualityScore = practicedResults.length > 0
    ? Math.round(practicedResults.reduce((sum, r) => sum + (r.audioQualityScore ?? (finalGateStatus === 'good' ? 92 : 72)), 0) / practicedResults.length)
    : 0;

  const finalGreenCount = resultsArray.filter(r => r.evaluationTier === 'green').length;
  const finalYellowCount = resultsArray.filter(r => r.evaluationTier === 'yellow').length;
  const finalRedCount = resultsArray.filter(r => r.evaluationTier === 'red').length;

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
        @keyframes pulseRecord {
          0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.7); }
          70% { transform: scale(1.05); box-shadow: 0 0 0 15px rgba(59, 130, 246, 0); }
          100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(59, 130, 246, 0); }
        }
        .pulse-recording-btn {
          animation: pulseRecord 1.5s infinite;
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
                const prevResult = sentenceResults.get(s.id);
                const hasRecordedAudio = recordedAudioUrls.has(s.id);

                if (isOpponent) {
                  // Opponent speech bubble (Ran / Yui)
                  return (
                    <div key={s.id} className="flex items-start gap-3 w-full max-w-xl">
                      <div className="w-10 h-10 rounded-full border-2 border-white shadow-sm bg-blue-100 overflow-hidden flex-shrink-0 mt-0.5">
                        <img src="/default_avatar.png" alt={opponentName} className="w-full h-full object-cover" />
                      </div>

                      <div className="flex flex-col flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5 ml-1">
                          <span className="font-bold text-xs text-[#071A44]">{opponentName}</span>
                        </div>

                        <div className="bg-white rounded-[20px] p-4 shadow-xs border border-[#E6EDF5] w-full">
                          <div className="flex items-center justify-start mb-2">
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => toggleTranslation(s.id)}
                                className="bg-[#F8FAFD] hover:bg-[#EEF4FB] text-[#4A5D78] border border-[#E6EDF5] text-[11px] font-bold px-3 py-0.5 rounded-full flex items-center gap-1 shadow-2xs transition-all cursor-pointer"
                              >
                                <span>文A</span> Dịch
                              </button>
                              <button
                                onClick={() => playAudio(s.nativeAudioUrl, s.japaneseText, undefined, undefined, s.id)}
                                disabled={loadingAudioSentenceId === s.id}
                                className="bg-[#F8FAFD] hover:bg-[#EEF4FB] text-[#4A5D78] border border-[#E6EDF5] text-[11px] font-bold px-3 py-0.5 rounded-full flex items-center gap-1 shadow-2xs transition-all cursor-pointer disabled:opacity-60"
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

                          <p className="text-base text-[#071A44] font-medium leading-relaxed">
                            {renderAnnotatedSentenceText(s.japaneseText)}
                          </p>

                          {showTranslations[s.id] && (
                            <div className="mt-2 pt-2 border-t border-[#E6EDF5] text-xs text-[#556987] italic">
                              "{s.vietnameseTranslation}"
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                } else {
                  // Learner Bubble (MATCHES REFERENCE IMAGE 2 EXACTLY FOR BOTH ACTIVE & COMPLETED TURNS)
                  return (
                    <div key={s.id} className="flex flex-col items-end w-full">
                      {/* LIVE SYNC: Displayed on/above the learner bubble during recording (Ảnh 3) */}
                      {isCurrentActive && practiceState === 'listening' && (
                        <div className="w-full max-w-xl mr-10 mb-2.5 animate-in fade-in slide-in-from-bottom-2 duration-200">
                          <div className="bg-[#071A44] text-white rounded-[20px] p-3.5 border border-cyan-400/40 shadow-xl flex flex-col items-center">
                            {/* <div className="flex items-center justify-between w-full mb-1.5 text-[11px] text-cyan-300 font-bold px-1">
                              <span className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                                Đang nhận diện giọng nói
                              </span>
                              <span className="text-[10px] text-gray-400">ja-JP</span>
                            </div> */}
                            <div className="w-full bg-[#030D22] rounded-xl px-4 py-2.5 min-h-[42px] flex items-center justify-center border border-slate-700/60 text-center">
                              <p className="text-base sm:text-lg font-bold text-cyan-300 font-jp tracking-wide">
                                {liveTranscript ? (
                                  <span>
                                    {liveTranscript}
                                    <span className="inline-block w-1.5 h-4 ml-1 bg-cyan-400 animate-pulse rounded-full align-middle"></span>
                                  </span>
                                ) : (
                                  <span className="text-slate-400 font-normal text-xs sm:text-sm italic">
                                    Đang lắng nghe...
                                  </span>
                                )}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

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
                        <div className={`rounded-[22px] p-4 sm:p-5 text-white shadow-md flex flex-col justify-between w-full bg-[#071A44] transition-all ${
                          isCurrentActive && practiceState === 'listening' ? 'ring-2 ring-cyan-400 shadow-cyan-500/20' : ''
                        }`}>
                          {/* Top 3 Buttons */}
                          <div className="flex items-center gap-2 mb-2 w-full justify-end">
                            {/* 1. Mic Button */}
                            <button
                              type="button"
                              onClick={() => {
                                if (hasRecordedAudio) {
                                  playUserRecording(s.id);
                                } else {
                                  startRecording();
                                }
                              }}
                              className="h-7 w-8 sm:w-9 rounded-full bg-[#14316D] hover:bg-[#1F4289] text-[#38BDF8] hover:text-white border border-[#2B54A6] flex items-center justify-center transition-all shadow-2xs cursor-pointer"
                              title={hasRecordedAudio ? "Nghe lại giọng ghi âm của bạn" : "Bấm để ghi âm câu này"}
                            >
                              <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                              </svg>
                            </button>

                            {/* 2. [🔊 Nghe mẫu] (White Pill Button) */}
                            <button
                              type="button"
                              onClick={() => playAudio(s.nativeAudioUrl, s.japaneseText, undefined, undefined, s.id)}
                              disabled={loadingAudioSentenceId === s.id}
                              className="h-7 px-3.5 rounded-full bg-white hover:bg-gray-100 text-[#071A44] font-bold text-xs flex items-center gap-1.5 transition-all shadow-xs cursor-pointer disabled:opacity-60"
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

                            {/* 3. [文A Dịch] */}
                            <button
                              type="button"
                              onClick={() => toggleTranslation(s.id)}
                              className="h-7 px-3 rounded-full bg-[#14316D] hover:bg-[#1F4289] text-blue-200 hover:text-white border border-[#2B54A6] text-xs font-bold flex items-center gap-1 transition-all shadow-2xs cursor-pointer"
                              title="Xem bản dịch tiếng Việt"
                            >
                              <span>文A Dịch</span>
                            </button>
                          </div>

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
                        <button
                          type="button"
                          onClick={stopRecordingManually}
                          className="pulse-recording-btn bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-700 hover:to-rose-800 text-white px-7 py-2.5 rounded-full font-bold shadow-xl flex items-center gap-2.5 text-sm sm:text-base cursor-pointer transition-all transform hover:scale-102 active:scale-98"
                        >
                          <span className="w-2.5 h-2.5 rounded-full bg-white animate-ping"></span>
                          <span>Dừng và Chấm điểm câu thoại</span>
                        </button>
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
                        contentMatchScore={currentContentMatchScore}
                        fluencyScore={currentFluencyScore}
                        tier={currentTier}
                        gateStatus={currentGateStatus}
                        gateLabel={currentGateLabel}
                        gateDetail={currentGateDetail}
                        diffTokens={currentDiffTokens}
                        attemptsCount={sentenceAttemptsMap.get(currentSentence.id) || 1}
                        hasRecording={recordedAudioUrls.has(currentSentence.id)}
                        isPlayingUserAudio={playingUserAudioSentenceId === currentSentence.id}
                        feedback={currentFeedback}
                        evaluationStatus={currentEvaluationStatus}
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
                      <span className="text-3xl font-black leading-none">{finalWeightedScore}</span>
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
                            ? 'Hạng A · Lưu loát'
                            : finalWeightedScore >= 65
                            ? 'Hạng B · Đạt chuẩn'
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
                    {/* Pillar 1: Content Match (60%) */}
                    <div>
                      <div className="flex justify-between items-center text-xs mb-1">
                        <span className="font-bold text-[#071A44] flex items-center gap-1.5">
                          <span>Độ khớp từ vựng & ngữ pháp</span>
                          <span className="text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded font-semibold border border-blue-100">60%</span>
                        </span>
                        <span className="font-extrabold text-[#0878EE] text-xs">{finalContentMatchScore}%</span>
                      </div>
                      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-[#0878EE] h-full rounded-full transition-all duration-500"
                          style={{ width: `${Math.min(100, Math.max(0, finalContentMatchScore))}%` }}
                        />
                      </div>
                    </div>

                    {/* Pillar 2: Fluency (40%) */}
                    <div>
                      <div className="flex justify-between items-center text-xs mb-1">
                        <span className="font-bold text-[#071A44] flex items-center gap-1.5">
                          <span>Độ lưu loát & Ngắt nhịp</span>
                          <span className="text-[10px] text-teal-600 bg-teal-50 px-1.5 py-0.5 rounded font-semibold border border-teal-100">40%</span>
                        </span>
                        <span className="font-extrabold text-teal-700 text-xs">{finalFluencyScore}%</span>
                      </div>
                      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-teal-500 h-full rounded-full transition-all duration-500"
                          style={{ width: `${Math.min(100, Math.max(0, finalFluencyScore))}%` }}
                        />
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
                    const sentenceScore = res
                      ? (res.overallScore ?? Math.round((res.contentMatchScore ?? res.accuracyScore) * 0.60 + res.fluencyScore * 0.40))
                      : 0;
                    const tier = res?.evaluationTier ?? (sentenceScore >= 80 ? 'green' : sentenceScore >= 65 ? 'yellow' : 'red');
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
                                tier === 'green'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : tier === 'yellow'
                                  ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                  : 'bg-rose-50 text-rose-700 border border-rose-200'
                              }`}
                            >
                              {sentenceScore} điểm
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
                            showLegend={false}
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

            {/* 4. AI Deep Diagnostic Banner */}
            {!aiAnalysisResult ? (
              <div className="bg-gradient-to-br from-[#EEF6FE] via-blue-50/40 to-[#F4F9FE] border border-[#BCDDFB] rounded-2xl p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span className="w-8 h-8 rounded-xl bg-white border border-[#BCDDFB] text-[#0878EE] flex items-center justify-center text-sm shadow-xs flex-shrink-0 mt-0.5">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </span>
                    <div>
                      <h4 className="font-extrabold text-[#071A44] text-xs sm:text-sm tracking-tight">
                        Phân tích phát âm chuyên sâu AI
                      </h4>
                      <p className="text-xs text-[#4A5D78] leading-relaxed mt-1">
                        Đánh giá chi tiết ngữ điệu Tokyo, độ mở nguyên âm, trường âm và hướng dẫn sửa lỗi phát âm cụ thể.
                      </p>
                    </div>
                  </div>
                  <span className="text-[11px] font-bold text-[#B54708] bg-[#FFF9EB] border border-[#FEEFC6] px-2.5 py-1 rounded-full whitespace-nowrap flex-shrink-0">
                    {isAdmin ? 'Miễn phí (Admin)' : '15 Credits'}
                  </span>
                </div>

                {aiAnalysisError && (
                  <p className="text-xs text-red-600 font-bold mt-2">Lỗi: {aiAnalysisError}</p>
                )}

                <button
                  disabled={isRequestingAi}
                  onClick={handleRequestAiDiagnostics}
                  className="mt-3.5 w-full bg-[#0878EE] hover:bg-[#0662C6] text-white font-extrabold text-xs py-2.5 rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isRequestingAi ? (
                    <span>Đang phân tích sóng âm & ngữ điệu...</span>
                  ) : (
                    <span>
                      {isAdmin
                        ? 'Mở khóa báo cáo phân tích AI chuyên sâu (Miễn phí Admin)'
                        : 'Mở khóa báo cáo phân tích AI chuyên sâu (15 Credits)'}
                    </span>
                  )}
                </button>
              </div>
            ) : (
              <div className="bg-gradient-to-br from-emerald-50/70 to-blue-50/50 border border-emerald-200 rounded-2xl p-4 sm:p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-emerald-200 pb-2">
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-emerald-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <h4 className="font-extrabold text-emerald-900 text-sm">Báo cáo phân tích AI Chuyên Sâu</h4>
                  </div>
                  <span className="text-[10px] font-bold text-emerald-700 bg-white px-2 py-0.5 rounded-full border border-emerald-300">
                    {isAdmin
                      ? 'Miễn phí (Admin)'
                      : `-15 Credits (Còn ${aiAnalysisResult.remainingCreditBalance})`}
                  </span>
                </div>

                <p className="text-xs font-semibold text-[#071A44] leading-relaxed">
                  {aiAnalysisResult.overallDiagnosis}
                </p>

                <div className="space-y-2 text-xs">
                  <div>
                    <div className="flex justify-between font-bold text-[#071A44] mb-1">
                      <span>Ngữ điệu chuẩn Tokyo</span>
                      <span className="text-[#0878EE] font-bold">{aiAnalysisResult.tokyoIntonationScore}%</span>
                    </div>
                    <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                      <div className="bg-[#0878EE] h-full rounded-full" style={{ width: `${aiAnalysisResult.tokyoIntonationScore}%` }}></div>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between font-bold text-[#071A44] mb-1">
                      <span>Độ mở nguyên âm (Vowel Clarity)</span>
                      <span className="text-emerald-600 font-bold">{aiAnalysisResult.vowelClarityScore}%</span>
                    </div>
                    <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                      <div className="bg-emerald-600 h-full rounded-full" style={{ width: `${aiAnalysisResult.vowelClarityScore}%` }}></div>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between font-bold text-[#071A44] mb-1">
                      <span>Độ ngân trường âm (Long Vowels)</span>
                      <span className="text-amber-600 font-bold">{aiAnalysisResult.longVowelPrecisionScore}%</span>
                    </div>
                    <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                      <div className="bg-amber-500 h-full rounded-full" style={{ width: `${aiAnalysisResult.longVowelPrecisionScore}%` }}></div>
                    </div>
                  </div>
                </div>

                <div className="space-y-2 pt-2 text-xs">
                  <div>
                    <span className="font-extrabold text-emerald-800 block mb-1">Điểm mạnh:</span>
                    <ul className="list-disc pl-4 space-y-1 text-slate-700">
                      {aiAnalysisResult.keyStrengths.map((s, idx) => (
                        <li key={idx}>{s}</li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <span className="font-extrabold text-amber-800 block mb-1">Lời khuyên cải thiện:</span>
                    <ul className="list-disc pl-4 space-y-1 text-slate-700">
                      {aiAnalysisResult.improvementActionItems.map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}
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

