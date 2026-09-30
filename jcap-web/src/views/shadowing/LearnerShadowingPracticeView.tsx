import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { shadowingService } from '../../services/shadowingService';
import { getMockDialogueById, getMockTextbooks } from '../../data/mockShadowingData';
import type {
  ShadowingDialogueDetail,
  ShadowingSentenceItem,
  ShadowingSentencePracticeResult,
  ShadowingAiAnalysisResult,
  ShadowingVocabularyItem,
  ShadowingGrammarItem,
} from '../../types/shadowing';
import { RoleSelectionModal } from '../../components/shadowing/RoleSelectionModal';
import { useAuth } from '../../contexts/AuthContext';

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

  // Learner Role selection: 'A' (Yuuri / Tân học sinh) or 'B' (Ran / Tiền bối)
  const roleParam = (searchParams.get('role')?.toUpperCase() as 'A' | 'B') || 'A';
  const [userRole, setUserRole] = useState<'A' | 'B'>(roleParam);
  const [isRoleModalOpen, setIsRoleModalOpen] = useState<boolean>(false);

  // Practice turn tracking: start at sentence index 0 (or sentence 2 if demonstrating active turn like image 2)
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState<number>(0);
  const [sentenceResults, setSentenceResults] = useState<Map<number, ShadowingSentencePracticeResult>>(new Map());
  const [practiceStartTime] = useState<number>(Date.now());
  const [sessionDurationSeconds, setSessionDurationSeconds] = useState<number>(0);

  // Recording & State
  type PracticeState = 'ready' | 'listening' | 'evaluated' | 'completed';
  const [practiceState, setPracticeState] = useState<PracticeState>('ready');
  const [currentRecognizedText, setCurrentRecognizedText] = useState<string>('');
  const [currentScore, setCurrentScore] = useState<number>(85);
  const [currentTier, setCurrentTier] = useState<'green' | 'yellow' | 'red'>('green');
  const [currentFeedback, setCurrentFeedback] = useState<string>('');
  const [micError, setMicError] = useState<string | null>(null);

  // Audio Playback
  const [isPlayingAudio, setIsPlayingAudio] = useState<boolean>(false);
  const [audioPlaybackSpeed, setAudioPlaybackSpeed] = useState<number>(0.8); // Default 0.8x from prototype
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  // MediaRecorder for user playback
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedAudioChunksRef = useRef<Blob[]>([]);
  const [recordedAudioUrls, setRecordedAudioUrls] = useState<Map<number, string>>(new Map());

  // Web Speech Recognition
  const recognitionRef = useRef<any>(null);

  // Modals & Slideovers
  const [isSituationCollapsed, setIsSituationCollapsed] = useState<boolean>(false);
  const [isDialogueContentCollapsed, setIsDialogueContentCollapsed] = useState<boolean>(false);
  const [studyModalTab, setStudyModalTab] = useState<'dialogue' | 'vocab' | 'grammar' | null>(null);
  const [selectedTermDetail, setSelectedTermDetail] = useState<{
    category: string;
    heading: string;
    reading?: string;
    meaning: string;
    example?: string;
  } | null>(null);
  const [isCompletedModalOpen, setIsCompletedModalOpen] = useState<boolean>(false);

  // AI Analysis State
  const [isRequestingAi, setIsRequestingAi] = useState<boolean>(false);
  const [aiAnalysisResult, setAiAnalysisResult] = useState<ShadowingAiAnalysisResult | null>(null);
  const [aiAnalysisError, setAiAnalysisError] = useState<string | null>(null);

  // Translations visibility toggles
  const [showTranslations, setShowTranslations] = useState<Record<number, boolean>>({});

  // 1. Fetch dialogue detail
  useEffect(() => {
    const loadDialogue = async () => {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const targetId = id ? parseInt(id, 10) : 1401;
        const res = await shadowingService.getDetail(targetId);

        if (res.success && res.data) {
          setDialogue(res.data);
          if (res.data.jlptLevel) {
            setSelectedLevel(res.data.jlptLevel);
          }

          // Pre-populate Sentence 1 as completed if viewing Dialogue 1401 initially to match Image 2
          if (targetId === 1401 && res.data.sentences.length > 2) {
            const firstSentence = res.data.sentences[0];
            const initialMap = new Map<number, ShadowingSentencePracticeResult>();
            initialMap.set(firstSentence.id, {
              sentenceId: firstSentence.id,
              orderIndex: firstSentence.orderIndex,
              targetText: firstSentence.japaneseText,
              recognizedText: firstSentence.japaneseText,
              accuracyScore: 96,
              evaluationTier: 'green',
            });
            setSentenceResults(initialMap);
            // In Image 2, the current active sentence is sentence index 2 (sentence #3: いいです、いつでもどうぞ...)
            setCurrentSentenceIndex(2);
          } else {
            setCurrentSentenceIndex(0);
          }
        } else {
          // Fallback to mock dialogue 1401
          const fallback = getMockDialogueById(1401);
          if (fallback) {
            setDialogue(fallback);
          } else {
            setErrorMessage('Không thể tải bài học Shadowing.');
          }
        }
      } catch (err: any) {
        setErrorMessage(err.message || 'Lỗi khi tải bài học.');
      } finally {
        setIsLoading(false);
      }
    };

    loadDialogue();
  }, [id]);

  // Handle changing Level from dropdown in header
  const handleLevelChange = (newLevel: 'N5' | 'N4' | 'N3') => {
    setSelectedLevel(newLevel);
    // Find first dialogue in that level
    const books = getMockTextbooks(newLevel);
    if (books.length > 0) {
      navigate(`/shadowing/textbooks/${books[0].id}`);
    }
  };

  // Back button: returns to dialogue list of the current chapter
  const handleBackToDialogueList = () => {
    if (dialogue?.textbookId && dialogue?.chapterId) {
      navigate(`/shadowing/textbooks/${dialogue.textbookId}/chapters/${dialogue.chapterId}`);
    } else {
      navigate(-1);
    }
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
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
      }
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  // Web Speech Synthesis for high-fidelity native Japanese audio playback
  const speakJapanese = (text: string, rate: number = audioPlaybackSpeed) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'ja-JP';
      utterance.rate = rate;
      const voices = window.speechSynthesis.getVoices();
      const jpVoice = voices.find(v => v.lang.includes('ja') || v.lang.includes('JP'));
      if (jpVoice) utterance.voice = jpVoice;
      utterance.onend = () => setIsPlayingAudio(false);
      utterance.onerror = () => setIsPlayingAudio(false);
      setIsPlayingAudio(true);
      window.speechSynthesis.speak(utterance);
      return true;
    }
    return false;
  };

  // Play audio sample: prefers real audio URL, falls back smoothly to SpeechSynthesis
  const playAudio = (url?: string, text?: string, speed: number = audioPlaybackSpeed) => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }

    if (url && url.startsWith('http')) {
      const audio = new Audio(url);
      audio.playbackRate = speed;
      audioPlayerRef.current = audio;
      setIsPlayingAudio(true);
      audio.onended = () => setIsPlayingAudio(false);
      audio.onerror = () => {
        if (text) speakJapanese(text, speed);
        else setIsPlayingAudio(false);
      };
      audio.play().catch(() => {
        if (text) speakJapanese(text, speed);
        else setIsPlayingAudio(false);
      });
    } else if (text) {
      speakJapanese(text, speed);
    }
  };

  // Toggle speed (0.8x -> 1.0x -> 1.2x)
  const cyclePlaybackSpeed = () => {
    const speeds = [0.8, 1.0, 1.2];
    const nextIdx = (speeds.indexOf(audioPlaybackSpeed) + 1) % speeds.length;
    const nextSpeed = speeds[nextIdx];
    setAudioPlaybackSpeed(nextSpeed);
    if (audioPlayerRef.current) {
      audioPlayerRef.current.playbackRate = nextSpeed;
    }
  };

  // Play user recorded audio
  const playUserRecording = (sentenceId: number) => {
    const url = recordedAudioUrls.get(sentenceId);
    if (url) {
      const audio = new Audio(url);
      audio.play().catch(() => {});
    }
  };

  // Toggle translation
  const toggleTranslation = (sentenceId: number) => {
    setShowTranslations(prev => ({
      ...prev,
      [sentenceId]: !prev[sentenceId],
    }));
  };

  // Start Voice Recording (Learner sentence MVP flow)
  const startRecording = async () => {
    setMicError(null);
    setCurrentRecognizedText('');

    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    // 1. Setup MediaRecorder for voice playback if user has mic
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      recordedAudioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          recordedAudioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(recordedAudioChunksRef.current, { type: 'audio/webm' });
        const audioUrl = URL.createObjectURL(audioBlob);
        if (currentSentence) {
          setRecordedAudioUrls(prev => new Map(prev).set(currentSentence.id, audioUrl));
        }
      };

      mediaRecorder.start();
    } catch {
      // Microphone access denial is non-blocking for mock evaluation
    }

    // 2. Setup SpeechRecognition (ja-JP) or simulated recording
    if (!SpeechRec) {
      setPracticeState('listening');
      return;
    }

    try {
      const recognition = new SpeechRec();
      recognition.lang = 'ja-JP';
      recognition.continuous = false;
      recognition.interimResults = false;
      recognitionRef.current = recognition;

      recognition.onstart = () => {
        setPracticeState('listening');
      };

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        stopRecordingMedia();
        evaluateSpeech(transcript);
      };

      recognition.onerror = () => {
        stopRecordingMedia();
        setPracticeState('listening');
      };

      recognition.onend = () => {
        stopRecordingMedia();
      };

      recognition.start();
    } catch {
      setPracticeState('listening');
    }
  };

  const stopRecordingMedia = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
    }
  };

  // Stop recording manually (Learner triggers "Stop Recording" -> Mock Score = 85)
  const stopRecordingManually = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
    }
    stopRecordingMedia();
    evaluateSpeech(currentSentence?.japaneseText || '');
  };

  // Evaluate speech transcript (Default Mock Score = 85 as specified)
  const evaluateSpeech = (recognized: string) => {
    if (!currentSentence) return;
    setCurrentRecognizedText(recognized || currentSentence.japaneseText);

    // Flow MVP Requirement: Mock Score = 85
    const score = 85;
    const tier: 'green' | 'yellow' | 'red' = 'green';
    const feedback = 'Xuất sắc! Ngữ điệu tự nhiên, trường âm chuẩn xác, khớp nhịp điệu bản xứ.';

    setCurrentScore(score);
    setCurrentTier(tier);
    setCurrentFeedback(feedback);
    setPracticeState('evaluated');

    // Save sentence result in local map
    const resultItem: ShadowingSentencePracticeResult = {
      sentenceId: currentSentence.id,
      orderIndex: currentSentence.orderIndex,
      targetText: currentSentence.japaneseText,
      recognizedText: recognized || currentSentence.japaneseText,
      accuracyScore: score,
      evaluationTier: tier,
    };

    setSentenceResults(prev => new Map(prev).set(currentSentence.id, resultItem));
  };

  // Retry current sentence
  const handleRetryCurrentSentence = () => {
    setPracticeState('ready');
    setCurrentRecognizedText('');
    setMicError(null);
  };

  // Finish current sentence and move to next
  const handleNextSentence = () => {
    if (!dialogue) return;
    const nextIdx = currentSentenceIndex + 1;
    if (nextIdx < dialogue.sentences.length) {
      setCurrentSentenceIndex(nextIdx);
      setPracticeState('ready');
      setCurrentRecognizedText('');
      setMicError(null);

      // If next sentence is System's turn, auto-play native audio
      const nextSentence = dialogue.sentences[nextIdx];
      if (nextSentence.speakerRole !== userRole) {
        setTimeout(() => {
          playAudio(nextSentence.nativeAudioUrl, nextSentence.japaneseText, audioPlaybackSpeed);
        }, 300);
      }
    } else {
      handleFinishDialogue();
    }
  };

  // Complete dialogue
  const handleFinishDialogue = async () => {
    setPracticeState('completed');
    setIsCompletedModalOpen(true);

    const resultsList = Array.from(sentenceResults.values());
    const totalScore = resultsList.reduce((acc, r) => acc + r.accuracyScore, 0);
    const avgScore = resultsList.length > 0 ? Math.round(totalScore / resultsList.length) : 85;

    const greenCount = resultsList.filter(r => r.evaluationTier === 'green').length;
    const yellowCount = resultsList.filter(r => r.evaluationTier === 'yellow').length;
    const redCount = resultsList.filter(r => r.evaluationTier === 'red').length;

    if (dialogue) {
      await shadowingService.completeSession({
        dialogueId: dialogue.id,
        learnerRole: userRole,
        overallAccuracyScore: avgScore,
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
    if (!dialogue) return;
    setIsRequestingAi(true);
    setAiAnalysisError(null);

    const resultsList = Array.from(sentenceResults.values());
    const totalScore = resultsList.reduce((acc, r) => acc + r.accuracyScore, 0);
    const avgScore = resultsList.length > 0 ? Math.round(totalScore / resultsList.length) : 85;

    const res = await shadowingService.requestAiAnalysis({
      dialogueId: dialogue.id,
      learnerRole: userRole,
      overallAccuracyScore: avgScore,
      durationSeconds: sessionDurationSeconds,
      sentenceResults: resultsList,
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
    setIsRoleModalOpen(false);
    setUserRole(newRole);
    setSearchParams({ level: selectedLevel, role: newRole });
    setCurrentSentenceIndex(0);
    setSentenceResults(new Map());
    setPracticeState('ready');
    setIsCompletedModalOpen(false);
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
            className="bg-[#0878EE] text-white px-5 py-2 rounded-full font-bold text-xs hover:bg-[#0662C6]"
          >
            ← Quay lại Thư viện Shadowing
          </button>
        </div>
      </div>
    );
  }

  const sentences = dialogue.sentences || [];
  const currentSentence: ShadowingSentenceItem | undefined = sentences[currentSentenceIndex];

  // Helper names
  const opponentRole = userRole === 'A' ? 'B' : 'A';
  const opponentName = userRole === 'A' ? dialogue.speakerRoleB_Name : dialogue.speakerRoleA_Name;
  const learnerName = userRole === 'A' ? dialogue.speakerRoleA_Name : dialogue.speakerRoleB_Name;

  const activeVocabs: ShadowingVocabularyItem[] = dialogue.targetVocabularies || [];
  const activeGrammars: ShadowingGrammarItem[] = dialogue.targetGrammars || [];

  // Summary results for celebration modal
  const resultsArray = Array.from(sentenceResults.values());
  const finalAvgScore = resultsArray.length > 0
    ? Math.round(resultsArray.reduce((sum, r) => sum + r.accuracyScore, 0) / resultsArray.length)
    : 85;
  const finalGreenCount = resultsArray.filter(r => r.evaluationTier === 'green').length;
  const finalYellowCount = resultsArray.filter(r => r.evaluationTier === 'yellow').length;
  const finalRedCount = resultsArray.filter(r => r.evaluationTier === 'red').length;

  // Render text with interactive underline keywords (matching Image 2)
  const renderAnnotatedSentenceText = (text: string) => {
    // Check vocab
    for (const v of activeVocabs) {
      if (text.includes(v.word)) {
        const parts = text.split(v.word);
        return (
          <>
            {parts[0]}
            <span
              className="annotation-term annotation-term-red"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedTermDetail({
                  category: 'TỪ VỰNG',
                  heading: v.word,
                  reading: v.reading || undefined,
                  meaning: v.meaning,
                  example: v.exampleSentence || undefined,
                });
              }}
            >
              {v.word}
              <span className="term-tooltip bg-[#071A44] text-white p-2.5 rounded-xl shadow-xl border border-blue-400/30 text-left font-sans block pointer-events-none">
                <span className="flex items-center justify-between text-[10px] font-bold mb-1">
                  <span className="text-rose-300">Từ vựng · {v.jlptLevel || dialogue.jlptLevel}</span>
                  {v.reading && <span className="text-blue-200">{v.reading}</span>}
                </span>
                <span className="text-xs font-semibold block text-white font-jp">{v.word}</span>
                <span className="text-[11px] text-gray-200 block mt-0.5 font-normal">{v.meaning}</span>
              </span>
            </span>
            {parts.slice(1).join(v.word)}
          </>
        );
      }
    }

    // Check grammar
    for (const g of activeGrammars) {
      const cleanPattern = g.pattern.replace(/[～Vv\-?\/]/g, '').trim();
      if (cleanPattern && text.includes(cleanPattern)) {
        const parts = text.split(cleanPattern);
        return (
          <>
            {parts[0]}
            <span
              className="annotation-term annotation-term-blue"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedTermDetail({
                  category: 'NGỮ PHÁP',
                  heading: g.pattern,
                  meaning: g.meaning,
                  example: g.exampleSentence,
                });
              }}
            >
              {cleanPattern}
              <span className="term-tooltip bg-[#071A44] text-white p-2.5 rounded-xl shadow-xl border border-blue-400/30 text-left font-sans block pointer-events-none">
                <span className="flex items-center justify-between text-[10px] font-bold mb-1">
                  <span className="text-sky-300">Ngữ pháp · {g.jlptLevel || dialogue.jlptLevel}</span>
                  <span className="text-emerald-300">Trọng tâm</span>
                </span>
                <span className="text-xs font-semibold block text-white font-jp">{g.pattern}</span>
                <span className="text-[11px] text-gray-200 block mt-0.5 font-normal">{g.meaning}</span>
              </span>
            </span>
            {parts.slice(1).join(cleanPattern)}
          </>
        );
      }
    }

    return text;
  };

  return (
    <div
      className="min-h-screen flex flex-col justify-between selection:bg-[#0878EE] selection:text-white bg-[#F4F9FE] text-[#071A44] font-sans"
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
      `}</style>

      {/* TOP HEADER (MATCHES REFERENCE IMAGE 2 EXACTLY) */}
      <header className="w-full bg-[#F4F9FE]/90 backdrop-blur-md sticky top-0 z-40 py-2.5 border-b border-[#E6EDF5] px-6">
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
            <span className="text-gray-700 font-semibold text-xs truncate max-w-[200px]">
              {dialogue.textbookTitle || 'みんなの日本語 II'}
            </span>

            <span className="text-gray-400">/</span>
            <span className="text-[#0878EE] font-bold text-xs truncate max-w-[280px]">
              {dialogue.chapterTitle || 'Bài 14: 学校案内'}
            </span>
          </div>

        </div>
      </header>

      {/* MAIN WORKSPACE CONTENT */}
      <main className="max-w-7xl w-full mx-auto py-4 px-4 sm:px-6 flex-1 flex flex-col justify-between">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* LEFT COLUMN: Context Panel */}
          <section className="lg:col-span-4 flex flex-col gap-4">
            <div className="rounded-[28px] p-5 shadow-sm border border-[#E6EDF5] bg-white relative overflow-hidden backdrop-blur-md">
              {/* Back / End Buttons */}
              <div className="flex items-center justify-between mb-3">
                <button
                  onClick={handleBackToDialogueList}
                  className="flex items-center gap-1.5 text-[#071A44] bg-[#F4F9FE] hover:bg-[#EBF3FB] border border-[#E6EDF5] px-3.5 py-1 rounded-full text-xs font-bold transition-all shadow-xs cursor-pointer"
                >
                  <span>←</span>
                  <span>Quay lại</span>
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
                  <span className="text-2xl">👩‍🏫</span>
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
                  onClick={() => setIsRoleModalOpen(true)}
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
                  <button className="w-6 h-6 rounded-full bg-[#F4F9FE] hover:bg-[#EEF6FE] border border-[#E6EDF5] text-[#556987] flex items-center justify-center text-xs">
                    {isSituationCollapsed ? '▼' : '▲'}
                  </button>
                </div>

                {!isSituationCollapsed && (
                  <div className="space-y-3 pt-1">
                    <p className="text-xs leading-relaxed text-[#4A5D78] text-justify">
                      {dialogue.scenarioDescription ||
                        'Bạn là tân học sinh. Chị khóa trên Ran phụ trách Club Day gọi điện báo về Ngày giới thiệu câu lạc bộ. Hãy hỏi lịch trình, địa điểm nhận đơn, và cách đăng ký câu lạc bộ âm nhạc.'}
                    </p>

                    {activeGrammars.length > 0 && (
                      <div className="mt-2 space-y-1">
                        <span className="text-[10px] font-extrabold text-[#556987] uppercase tracking-wider block">
                          MỤC TIÊU NGỮ PHÁP
                        </span>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {activeGrammars.map((g) => (
                            <span
                              key={g.id}
                              onClick={() => setSelectedTermDetail({
                                category: 'Ngữ pháp mục tiêu',
                                heading: g.pattern,
                                meaning: g.meaning,
                                example: g.exampleSentence || undefined,
                              })}
                              className="text-[11px] font-bold text-[#0878EE] bg-blue-50 border border-[#BCDDFB] px-2.5 py-0.5 rounded-full cursor-pointer hover:bg-blue-100"
                            >
                              {g.pattern}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="h-px bg-[#E6EDF5] my-3"></div>

              {/* NỘI DUNG HỘI THOẠI (3 Buttons) */}
              <div className="space-y-1.5">
                <div
                  className="flex items-center justify-between text-[#071A44] font-bold text-sm cursor-pointer select-none"
                  onClick={() => setIsDialogueContentCollapsed(!isDialogueContentCollapsed)}
                >
                  <span className="font-extrabold tracking-tight">Nội dung hội thoại</span>
                  <button className="w-6 h-6 rounded-full bg-[#F4F9FE] hover:bg-[#EEF6FE] border border-[#E6EDF5] text-[#556987] flex items-center justify-center text-xs">
                    {isDialogueContentCollapsed ? '▼' : '▲'}
                  </button>
                </div>

                {!isDialogueContentCollapsed && (
                  <div className="grid grid-cols-3 gap-2 pt-2">
                    <button
                      onClick={() => setStudyModalTab('dialogue')}
                      className="flex flex-col items-center justify-center py-2 px-1 rounded-xl bg-white hover:bg-[#EEF6FE] border border-[#BCDDFB] text-[#071A44] hover:text-[#0878EE] text-[11px] font-bold shadow-2xs transition-all cursor-pointer"
                    >
                      Đoạn hội thoại
                    </button>
                    <button
                      onClick={() => setStudyModalTab('vocab')}
                      className="flex flex-col items-center justify-center py-2 px-1 rounded-xl bg-white hover:bg-[#EEF6FE] border border-[#BCDDFB] text-[#071A44] hover:text-[#0878EE] text-[11px] font-bold shadow-2xs transition-all cursor-pointer"
                    >
                      Từ vựng
                    </button>
                    <button
                      onClick={() => setStudyModalTab('grammar')}
                      className="flex flex-col items-center justify-center py-2 px-1 rounded-xl bg-white hover:bg-[#EEF6FE] border border-[#BCDDFB] text-[#071A44] hover:text-[#0878EE] text-[11px] font-bold shadow-2xs transition-all cursor-pointer"
                    >
                      Ngữ pháp
                    </button>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* RIGHT COLUMN: Dialogue Stream & Mic Console */}
          <section className="lg:col-span-8 flex flex-col justify-between min-h-[640px] gap-6">
            {/* Dialogue Stream (Matching Image 2 Bubbles) */}
            <div className="space-y-4 w-full">
              {sentences.slice(0, currentSentenceIndex + 1).map((s, idx) => {
                const isOpponent = s.speakerRole !== userRole;
                const isCurrentActive = idx === currentSentenceIndex;
                const prevResult = sentenceResults.get(s.id);
                const hasRecordedAudio = recordedAudioUrls.has(s.id);

                if (isOpponent) {
                  // Opponent speech bubble (Ran / Yui)
                  return (
                    <div key={s.id} className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full border-2 border-white shadow-sm bg-blue-100 text-[#0878EE] font-bold flex items-center justify-center flex-shrink-0 mt-1">
                        👩‍🏫
                      </div>

                      <div className="bg-white rounded-[20px] p-4 shadow-xs border border-[#E6EDF5] max-w-xl flex-1">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-bold text-xs text-[#071A44]">{opponentName}</span>
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => playAudio(s.nativeAudioUrl, s.japaneseText, audioPlaybackSpeed)}
                              className="bg-[#F8FAFD] hover:bg-[#EEF4FB] text-[#4A5D78] border border-[#E6EDF5] text-[11px] font-bold px-3 py-0.5 rounded-full flex items-center gap-1 shadow-2xs transition-all cursor-pointer"
                            >
                              <span>🔊</span> Nghe lại
                            </button>
                            <button
                              onClick={() => toggleTranslation(s.id)}
                              className="bg-[#F8FAFD] hover:bg-[#EEF4FB] text-[#4A5D78] border border-[#E6EDF5] text-[11px] font-bold px-3 py-0.5 rounded-full flex items-center gap-1 shadow-2xs transition-all cursor-pointer"
                            >
                              <span>文A</span> Dịch
                            </button>
                            <button
                              onClick={cyclePlaybackSpeed}
                              className="bg-[#F8FAFD] hover:bg-[#EEF4FB] text-[#4A5D78] border border-[#E6EDF5] text-[11px] font-bold px-2.5 py-0.5 rounded-full shadow-2xs transition-all cursor-pointer"
                            >
                              ⏱️ {audioPlaybackSpeed}x
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
                  );
                } else {
                  // Learner Bubble (MATCHES REFERENCE IMAGE 2 EXACTLY FOR BOTH ACTIVE & COMPLETED TURNS)
                  return (
                    <div key={s.id} className="flex flex-col items-end w-full">
                      {/* Top Header: Yuuri 96% */}
                      <div className="flex items-center gap-2 mb-1.5 text-xs pr-10">
                        <span className="font-bold text-[#071A44]">{learnerName}</span>
                        <span className="font-bold text-[11px] px-2.5 py-0.5 rounded-full border bg-[#ECFDF3] text-[#027A48] border-[#A6F4C5]">
                          {prevResult ? `${prevResult.accuracyScore}%` : '96%'}
                        </span>
                      </div>

                      <div className="flex items-start gap-2.5 justify-end w-full max-w-xl">
                        {/* Dark Navy Bubble */}
                        <div className="rounded-[22px] p-4 sm:p-5 text-white shadow-md flex flex-col justify-between w-full bg-[#071A44] transition-all">
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

                            {/* 2. [🔊 Nghe lại] (White Pill Button) */}
                            <button
                              type="button"
                              onClick={() => playAudio(s.nativeAudioUrl, s.japaneseText, audioPlaybackSpeed)}
                              className="h-7 px-3.5 rounded-full bg-white hover:bg-gray-100 text-[#071A44] font-bold text-xs flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                              title="Nghe phát âm chuẩn câu này"
                            >
                              <svg className="w-3.5 h-3.5 text-[#0878EE] fill-current" viewBox="0 0 24 24">
                                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                              </svg>
                              <span>Nghe lại</span>
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

                        {/* Circular Avatar Y */}
                        <div className="w-8 h-8 rounded-full bg-[#071A44] text-white flex items-center justify-center font-bold text-xs shadow-xs flex-shrink-0 border border-blue-400/30 mt-1">
                          Y
                        </div>
                      </div>
                    </div>
                  );
                }
              })}
            </div>

            {/* ACTION CONSOLE (Recording & Evaluation) */}
            <div className="w-full flex justify-center items-center relative z-10 mt-auto mb-2">
              <div
                className="w-full rounded-[24px] border-2 border-dashed bg-white/80 backdrop-blur-xs py-4 px-6 flex flex-col items-center justify-center shadow-xs transition-all"
                style={{ borderColor: 'rgb(147, 197, 253)' }}
              >
                {micError && (
                  <div className="w-full mb-3 p-2 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-center justify-between">
                    <span>⚠️ {micError}</span>
                    <button onClick={() => setMicError(null)} className="font-bold text-red-500">×</button>
                  </div>
                )}

                {/* State 1: Ready to record (Circle blue mic button matching Image 2) */}
                {practiceState === 'ready' && (
                  <div className="flex flex-col items-center justify-center w-full">
                    <button
                      onClick={startRecording}
                      className="bg-gradient-to-r from-[#0878EE] to-[#054EA0] hover:from-[#0662C6] hover:to-[#043A78] text-white w-14 h-14 rounded-full font-bold shadow-lg shadow-blue-500/30 flex items-center justify-center transition-all transform hover:scale-105 active:scale-95 cursor-pointer"
                      title="Bấm vào micro và nói to câu hội thoại"
                    >
                      <span className="text-2xl">🎤</span>
                    </button>
                    <p className="text-xs text-[#71809A] mt-2 font-medium">Bấm vào micro và nói to câu hội thoại</p>
                  </div>
                )}

                {/* State 2: Listening */}
                {practiceState === 'listening' && (
                  <div className="flex flex-col items-center justify-center gap-2 w-full">
                    <button
                      onClick={stopRecordingManually}
                      className="pulse-recording-btn bg-gradient-to-r from-blue-600 to-blue-800 text-white px-8 py-3 rounded-full font-bold shadow-xl flex items-center gap-3 text-base cursor-pointer"
                    >
                      <span className="w-4 h-4 rounded-full bg-red-500 animate-ping inline-block"></span>
                      <span>Đang nghe bạn nói... (Nhấn để chốt câu)</span>
                    </button>
                    <p className="text-xs text-blue-600 font-semibold animate-pulse">
                      Hệ thống đang đối chiếu sóng âm chuẩn Tokyo...
                    </p>
                  </div>
                )}

                {/* State 3: Evaluated with Mock Score = 85 */}
                {practiceState === 'evaluated' && (
                  <div className="w-full bg-white/95 px-5 py-3 rounded-[20px] border border-[#E6EDF5] shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-3 w-full sm:w-auto">
                      <div className="w-12 h-12 rounded-2xl text-white font-black flex items-center justify-center text-base shadow-sm bg-[#12B76A]">
                        {currentScore}%
                      </div>

                      <div className="text-left">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-extrabold text-[#027A48]">
                            Xuất sắc! (とても良い)
                          </span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-[#ECFDF3] text-[#027A48] border-[#A6F4C5]">
                            🟢 Phát âm chuẩn
                          </span>
                        </div>
                        <p className="text-[11px] text-[#556987] font-medium mt-0.5">{currentFeedback}</p>
                        {currentRecognizedText && (
                          <p className="text-[10px] text-gray-400 mt-0.5 italic">
                            Giọng nhận diện: "{currentRecognizedText}"
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2.5 w-full sm:w-auto flex-shrink-0">
                      <button
                        onClick={handleRetryCurrentSentence}
                        className="text-xs font-bold text-[#4A5D78] hover:text-[#0878EE] bg-white hover:bg-[#EEF6FE] border border-[#E6EDF5] px-3.5 py-1.5 rounded-full transition-all flex items-center gap-1 shadow-2xs cursor-pointer"
                      >
                        <span>🔄</span>
                        <span>Luyện lại câu</span>
                      </button>

                      <button
                        onClick={handleNextSentence}
                        className="text-xs font-extrabold text-white bg-[#0878EE] hover:bg-[#0662C6] px-5 py-1.5 rounded-full shadow-sm flex items-center gap-1.5 transition-all transform hover:scale-102 cursor-pointer"
                      >
                        <span>Chốt & Tiếp tục câu sau ➔</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      </main>

      {/* MODAL 1: StudyCenterModal (Đoạn hội thoại / Từ vựng / Ngữ pháp) */}
      {studyModalTab && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#071A44]/50 backdrop-blur-xs transition-all duration-200"
          onClick={() => setStudyModalTab(null)}
        >
          <div
            className="bg-white rounded-[28px] max-w-2xl w-full max-h-[88vh] shadow-2xl border border-[#E6EDF5] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-5 border-b border-[#E6EDF5] bg-[#F4F9FE] flex items-center justify-between">
              <h3 className="font-extrabold text-[#071A44] text-lg">
                {studyModalTab === 'dialogue' && 'Toàn bộ kịch bản Đoạn hội thoại'}
                {studyModalTab === 'vocab' && 'Bảng Từ vựng trọng tâm'}
                {studyModalTab === 'grammar' && 'Tổng hợp Ngữ pháp bài học'}
              </h3>
              <button
                onClick={() => setStudyModalTab(null)}
                className="w-8 h-8 rounded-full bg-white hover:bg-red-50 text-[#556987] hover:text-[#D92D20] border border-[#E6EDF5] flex items-center justify-center font-bold text-sm transition-colors shadow-2xs"
              >
                ✕
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 flex-1 text-sm bg-white">
              {studyModalTab === 'dialogue' && (
                <div className="space-y-3.5">
                  {sentences.map(s => (
                    <div
                      key={s.id}
                      className={`flex items-start gap-2.5 ${s.speakerRole === userRole ? 'justify-end' : 'justify-start'}`}
                    >
                      {s.speakerRole !== userRole && (
                        <div className="w-8 h-8 rounded-full bg-blue-100 text-[#0878EE] font-bold text-xs flex items-center justify-center flex-shrink-0 mt-1">
                          👩‍🏫
                        </div>
                      )}

                      <div className={`flex flex-col max-w-[80%] ${s.speakerRole === userRole ? 'items-end' : 'items-start'}`}>
                        <div className="flex items-center gap-1.5 mb-1">
                          <button
                            onClick={() => playAudio(s.nativeAudioUrl, s.japaneseText, 1.0)}
                            className="bg-white hover:bg-blue-50 text-[#0878EE] border border-blue-200 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-2xs"
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
                        <div className="w-8 h-8 rounded-full bg-[#071A44] text-white font-bold text-xs flex items-center justify-center flex-shrink-0 mt-1">
                          Y
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {studyModalTab === 'vocab' && (
                <div className="space-y-3">
                  {activeVocabs.map(v => (
                    <div
                      key={v.id}
                      onClick={() => setSelectedTermDetail({
                        category: 'TỪ VỰNG',
                        heading: v.word,
                        reading: v.reading || undefined,
                        meaning: v.meaning,
                        example: v.exampleSentence || undefined,
                      })}
                      className="border border-[#BCDDFB] rounded-2xl p-4 bg-[#F8FAFD] hover:border-[#0878EE] cursor-pointer transition-all shadow-2xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-base text-[#071A44]">{v.word}</h4>
                            {v.reading && (
                              <span className="text-xs text-[#556987]">【{v.reading}】</span>
                            )}
                          </div>
                          {v.wordClass && (
                            <span className="text-[11px] font-bold text-[#0878EE] bg-blue-50 px-2 py-0.5 rounded-full inline-block mt-1">
                              {v.wordClass}
                            </span>
                          )}
                        </div>
                        <span className="text-xs bg-[#0878EE]/10 text-[#0878EE] font-bold px-2 py-0.5 rounded-full">
                          {v.jlptLevel || dialogue.jlptLevel}
                        </span>
                      </div>
                      <p className="text-xs text-[#4A5D78] mt-2 font-medium">
                        <strong>Nghĩa:</strong> {v.meaning}
                      </p>
                      {v.exampleSentence && (
                        <div className="mt-2 p-2 bg-white rounded-xl border border-[#E6EDF5] text-xs">
                          <span className="text-[#071A44] font-medium">Ví dụ: {v.exampleSentence}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {studyModalTab === 'grammar' && (
                <div className="space-y-3">
                  {activeGrammars.map(g => (
                    <div
                      key={g.id}
                      onClick={() => setSelectedTermDetail({
                        category: 'NGỮ PHÁP',
                        heading: g.pattern,
                        meaning: g.meaning,
                        example: g.exampleSentence,
                      })}
                      className="p-4 bg-[#F8FAFD] rounded-2xl border-2 border-dashed border-[#BCDDFB] hover:border-[#0878EE] cursor-pointer transition-all"
                    >
                      <div className="flex items-center justify-between">
                        <h4 className="font-bold text-sm sm:text-base text-[#0878EE]">{g.pattern}</h4>
                        <span className="text-[11px] font-extrabold text-[#0878EE] bg-blue-50 border border-[#BCDDFB] px-2.5 py-0.5 rounded-full">
                          {g.jlptLevel || dialogue.jlptLevel}
                        </span>
                      </div>
                      <p className="text-xs text-[#4A5D78] mt-2 leading-relaxed">
                        <strong>Ý nghĩa:</strong> {g.meaning}
                      </p>
                      {g.exampleSentence && (
                        <div className="mt-2 p-2 bg-white rounded-lg border border-[#E6EDF5] text-xs">
                          <span className="font-medium text-[#071A44]">Ví dụ: {g.exampleSentence}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-[#E6EDF5] bg-[#F4F9FE] flex justify-end">
              <button
                onClick={() => setStudyModalTab(null)}
                className="px-6 py-2 rounded-full bg-[#0878EE] text-white text-xs font-bold"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: TermDetailModal */}
      {selectedTermDetail && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#071A44]/60 backdrop-blur-xs"
          onClick={() => setSelectedTermDetail(null)}
        >
          <div
            className="bg-white rounded-[24px] max-w-lg w-full p-6 shadow-2xl border border-[#E6EDF5] space-y-4 animate-in fade-in zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#E6EDF5] pb-3">
              <div>
                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-blue-50 text-[#0878EE] border border-blue-200">
                  {selectedTermDetail.category}
                </span>
                <h3 className="font-extrabold text-[#071A44] text-xl mt-1">
                  {selectedTermDetail.heading} {selectedTermDetail.reading ? `【${selectedTermDetail.reading}】` : ''}
                </h3>
              </div>
              <button
                onClick={() => setSelectedTermDetail(null)}
                className="w-7 h-7 rounded-full bg-slate-100 hover:bg-red-50 text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="p-3.5 bg-[#F8FAFD] rounded-xl border border-[#E6EDF5] text-xs">
              <span className="font-bold text-[#071A44] block mb-1">Ý nghĩa:</span>
              <p className="text-sm font-semibold text-[#071A44] leading-relaxed">{selectedTermDetail.meaning}</p>
            </div>

            {selectedTermDetail.example && (
              <div className="p-3 bg-white rounded-xl border border-[#BCDDFB] text-xs space-y-1">
                <span className="font-bold text-[#0878EE] block">Ví dụ minh họa:</span>
                <p className="font-medium text-[#071A44]">{selectedTermDetail.example}</p>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedTermDetail(null)}
                className="px-5 py-1.5 rounded-full bg-[#0878EE] text-white text-xs font-bold"
              >
                Đã hiểu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: CompletedModal */}
      {isCompletedModalOpen && (
        <div className="fixed inset-0 bg-[#071A44]/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[28px] max-w-xl w-full p-6 sm:p-7 shadow-2xl border border-[#E6EDF5] max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200">
            <div className="flex flex-col items-center text-center">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#EEF6FE] to-blue-50 text-[#0878EE] flex items-center justify-center text-2xl shadow-xs border border-[#BCDDFB] mb-3">
                🎉
              </div>
              <h3 className="text-xl sm:text-2xl font-black text-[#071A44] tracking-tight">
                Chúc mừng bạn đã hoàn thành!
              </h3>
              <p className="text-xs sm:text-sm text-[#556987] font-medium mt-1">
                {dialogue.title} · <span className="text-[#0878EE] font-semibold">{sentences.length}/{sentences.length} câu hoàn tất</span>
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3 my-5">
              <div className="bg-[#F8FAFD] p-3 rounded-2xl text-center border border-[#E6EDF5] shadow-2xs flex flex-col justify-between">
                <span className="text-[11px] text-[#556987] font-extrabold uppercase">Độ chính xác</span>
                <span className="text-2xl font-black text-[#0878EE] my-1 leading-none">{finalAvgScore}%</span>
                <span className="text-[10px] text-[#027A48] bg-[#ECFDF3] border border-[#A6F4C5] font-bold px-2 py-0.5 rounded-full inline-block mx-auto">
                  JLPT {dialogue.jlptLevel}
                </span>
              </div>
              <div className="bg-[#F8FAFD] p-3 rounded-2xl text-center border border-[#E6EDF5] shadow-2xs flex flex-col justify-between">
                <span className="text-[11px] text-[#556987] font-extrabold uppercase">Thời gian nói</span>
                <span className="text-2xl font-black text-[#071A44] my-1 leading-none">
                  {Math.floor(sessionDurationSeconds / 60)}m {sessionDurationSeconds % 60}s
                </span>
                <span className="text-[10px] text-[#4A5D78] bg-white border border-[#E6EDF5] font-semibold px-2 py-0.5 rounded-full inline-block mx-auto">
                  Tự nhiên
                </span>
              </div>
              <div className="bg-[#F8FAFD] p-3 rounded-2xl text-center border border-[#E6EDF5] shadow-2xs flex flex-col justify-between">
                <span className="text-[11px] text-[#556987] font-extrabold uppercase">Phân loại</span>
                <div className="flex items-center justify-center gap-1.5 my-1 font-black text-sm text-[#071A44] leading-none">
                  <span className="text-emerald-600">{finalGreenCount || 1} 🟢</span>
                  <span className="text-amber-500">{finalYellowCount} 🟡</span>
                  {finalRedCount > 0 && <span className="text-red-500">{finalRedCount} 🔴</span>}
                </div>
                <span className="text-[10px] text-[#556987] bg-white border border-[#E6EDF5] font-semibold px-2 py-0.5 rounded-full inline-block mx-auto">
                  {sentences.length} câu hoàn tất
                </span>
              </div>
            </div>

            {/* AI Deep Diagnostic Banner */}
            {!aiAnalysisResult ? (
              <div className="bg-gradient-to-br from-[#EEF6FE] via-blue-50/50 to-[#F4F9FE] border-2 border-dashed border-[#BCDDFB] rounded-2xl p-4 sm:p-5 mb-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <span className="w-8 h-8 rounded-xl bg-white border border-[#BCDDFB] text-[#0878EE] flex items-center justify-center text-sm shadow-2xs flex-shrink-0 mt-0.5">
                      ✨
                    </span>
                    <div>
                      <h4 className="font-extrabold text-[#071A44] text-xs sm:text-sm tracking-tight">
                        Phân tích phát âm chuyên sâu AI
                      </h4>
                      <p className="text-xs text-[#4A5D78] leading-relaxed mt-1 text-justify">
                        Đánh giá chi tiết ngữ điệu Tokyo, độ mở nguyên âm, trường âm và hướng dẫn sửa lỗi phát âm cụ thể.
                      </p>
                    </div>
                  </div>
                  <span className="text-[11px] font-bold text-[#B54708] bg-[#FFF9EB] border border-[#FEEFC6] px-2.5 py-1 rounded-full whitespace-nowrap flex-shrink-0">
                    {isAdmin ? '🛡️ Miễn phí (Admin)' : '15 Credits'}
                  </span>
                </div>

                {aiAnalysisError && (
                  <p className="text-xs text-red-600 font-bold mt-2">⚠️ {aiAnalysisError}</p>
                )}

                <button
                  disabled={isRequestingAi}
                  onClick={handleRequestAiDiagnostics}
                  className="mt-3.5 w-full bg-[#0878EE] hover:bg-[#0662C6] text-white font-extrabold text-xs py-2.5 rounded-full shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isRequestingAi ? (
                    <span>⏳ Đang phân tích sóng âm & ngữ điệu...</span>
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
              <div className="bg-gradient-to-br from-emerald-50/70 to-blue-50/50 border border-emerald-200 rounded-2xl p-4 sm:p-5 mb-5 space-y-4">
                <div className="flex items-center justify-between border-b border-emerald-200 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🎯</span>
                    <h4 className="font-extrabold text-emerald-900 text-sm">Báo cáo phân tích AI Chuyên Sâu</h4>
                  </div>
                  <span className="text-[10px] font-bold text-emerald-700 bg-white px-2 py-0.5 rounded-full border border-emerald-300">
                    {isAdmin
                      ? '🛡️ Miễn phí (Admin)'
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
                      <span className="text-[#0878EE]">{aiAnalysisResult.tokyoIntonationScore}%</span>
                    </div>
                    <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                      <div className="bg-[#0878EE] h-full rounded-full" style={{ width: `${aiAnalysisResult.tokyoIntonationScore}%` }}></div>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between font-bold text-[#071A44] mb-1">
                      <span>Độ mở nguyên âm (Vowel Clarity)</span>
                      <span className="text-emerald-600">{aiAnalysisResult.vowelClarityScore}%</span>
                    </div>
                    <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                      <div className="bg-emerald-600 h-full rounded-full" style={{ width: `${aiAnalysisResult.vowelClarityScore}%` }}></div>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between font-bold text-[#071A44] mb-1">
                      <span>Độ ngân trường âm (Long Vowels)</span>
                      <span className="text-amber-600">{aiAnalysisResult.longVowelPrecisionScore}%</span>
                    </div>
                    <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                      <div className="bg-amber-500 h-full rounded-full" style={{ width: `${aiAnalysisResult.longVowelPrecisionScore}%` }}></div>
                    </div>
                  </div>
                </div>

                <div className="space-y-2 pt-2 text-xs">
                  <div>
                    <span className="font-extrabold text-emerald-800 block mb-1">✅ Điểm mạnh:</span>
                    <ul className="list-disc pl-4 space-y-1 text-slate-700">
                      {aiAnalysisResult.keyStrengths.map((s, idx) => (
                        <li key={idx}>{s}</li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <span className="font-extrabold text-amber-800 block mb-1">💡 Lời khuyên cải thiện:</span>
                    <ul className="list-disc pl-4 space-y-1 text-slate-700">
                      {aiAnalysisResult.improvementActionItems.map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-center justify-end gap-2.5 pt-1">
              <button
                onClick={() => {
                  setIsCompletedModalOpen(false);
                  setCurrentSentenceIndex(0);
                  setPracticeState('ready');
                  setSentenceResults(new Map());
                }}
                className="w-full sm:w-auto text-xs font-bold text-[#556987] hover:text-[#071A44] bg-[#F4F9FE] hover:bg-[#EEF6FE] border border-[#E6EDF5] px-5 py-2.5 rounded-full transition-all cursor-pointer"
              >
                🔄 Luyện lại bài này
              </button>
              <button
                onClick={() => {
                  setIsCompletedModalOpen(false);
                  setIsRoleModalOpen(true);
                }}
                className="w-full sm:w-auto text-xs font-bold text-[#0878EE] bg-blue-50 hover:bg-blue-100 border border-[#BCDDFB] px-5 py-2.5 rounded-full transition-all cursor-pointer"
              >
                👤 Đổi sang vai khác ({opponentRole})
              </button>
              <button
                onClick={handleBackToDialogueList}
                className="w-full sm:w-auto text-xs font-extrabold text-white bg-gradient-to-r from-[#0878EE] to-[#054EA0] hover:from-[#0662C6] hover:to-[#043A78] px-6 py-2.5 rounded-full shadow-md transition-all cursor-pointer"
              >
                Xong
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Role Selection Modal */}
      <RoleSelectionModal
        isOpen={isRoleModalOpen}
        onClose={() => setIsRoleModalOpen(false)}
        dialogueId={dialogue.id}
        dialogueTitle={dialogue.title}
        roleAName={dialogue.speakerRoleA_Name}
        roleBName={dialogue.speakerRoleB_Name}
        onConfirm={handleConfirmRoleChange}
      />
    </div>
  );
};

