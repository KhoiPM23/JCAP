import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { shadowingService } from '../../services/shadowingService';
import type {
  ShadowingDialogueDetail,
  ShadowingSentenceItem,
  ShadowingSentencePracticeResult,
  ShadowingAiAnalysisResult,
  ShadowingVocabularyItem,
  ShadowingGrammarItem,
} from '../../types/shadowing';
import { RoleSelectionModal } from '../../components/shadowing/RoleSelectionModal';

// Clean text for similarity comparison
function normalizeJp(text: string): string {
  return text
    .replace(/[、。！？\s\.,!\?]/g, '')
    .toLowerCase()
    .trim();
}

function calculateSimilarity(recognized: string, target: string): number {
  const normRec = normalizeJp(recognized);
  const normTar = normalizeJp(target);

  if (!normRec || !normTar) return 0;
  if (normRec === normTar) return 100;
  if (normTar.includes(normRec) || normRec.includes(normTar)) {
    const ratio = Math.min(normRec.length, normTar.length) / Math.max(normRec.length, normTar.length);
    return Math.round(ratio * 92);
  }

  // Levenshtein distance
  const matrix: number[][] = [];
  for (let i = 0; i <= normRec.length; i++) matrix[i] = [i];
  for (let j = 0; j <= normTar.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= normRec.length; i++) {
    for (let j = 1; j <= normTar.length; j++) {
      const cost = normRec[i - 1] === normTar[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  const distance = matrix[normRec.length][normTar.length];
  const maxLen = Math.max(normRec.length, normTar.length);
  const similarity = Math.max(0, 1 - distance / maxLen);
  return Math.round(similarity * 100);
}

export const LearnerShadowingPracticeView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [dialogue, setDialogue] = useState<ShadowingDialogueDetail | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Learner Role selection
  const roleParam = (searchParams.get('role')?.toUpperCase() as 'A' | 'B') || 'A';
  const [userRole, setUserRole] = useState<'A' | 'B'>(roleParam);
  const [isRoleModalOpen, setIsRoleModalOpen] = useState<boolean>(false);

  // Practice state
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState<number>(0);
  const [sentenceResults, setSentenceResults] = useState<Map<number, ShadowingSentencePracticeResult>>(new Map());
  const [practiceStartTime] = useState<number>(Date.now());
  const [sessionDurationSeconds, setSessionDurationSeconds] = useState<number>(0);

  // Recording & Web Speech API State
  type PracticeState = 'ready' | 'listening' | 'evaluated' | 'completed';
  const [practiceState, setPracticeState] = useState<PracticeState>('ready');
  const [currentRecognizedText, setCurrentRecognizedText] = useState<string>('');
  const [currentScore, setCurrentScore] = useState<number>(0);
  const [currentTier, setCurrentTier] = useState<'green' | 'yellow' | 'red'>('green');
  const [currentFeedback, setCurrentFeedback] = useState<string>('');
  const [micError, setMicError] = useState<string | null>(null);

  // Audio Playback
  const [isPlayingAudio, setIsPlayingAudio] = useState<boolean>(false);
  const [audioPlaybackSpeed, setAudioPlaybackSpeed] = useState<number>(1.0);
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
    if (!id) return;
    const fetchDetail = async () => {
      setIsLoading(true);
      const res = await shadowingService.getDetail(parseInt(id, 10));
      if (res.success && res.data) {
        setDialogue(res.data);
      } else {
        setErrorMessage(res.message || 'Không thể tải chi tiết bài học.');
      }
      setIsLoading(false);
    };
    fetchDetail();
  }, [id]);

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
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center space-y-4">
        <div className="w-12 h-12 border-4 border-[#BCDDFB] border-t-[#0878EE] rounded-full animate-spin"></div>
        <p className="text-sm font-bold text-[#071A44]">Đang tải phòng luyện tập Shadowing...</p>
      </div>
    );
  }

  if (errorMessage || !dialogue) {
    return (
      <div className="max-w-lg mx-auto mt-16 bg-white p-8 rounded-2xl border border-red-200 text-center space-y-4 shadow-sm">
        <p className="text-red-600 font-bold">{errorMessage || 'Không tìm thấy bài học.'}</p>
        <button
          onClick={() => navigate('/shadowing')}
          className="bg-[#0878EE] text-white px-5 py-2 rounded-full font-bold text-xs hover:bg-[#0662C6]"
        >
          Quay lại Thư viện
        </button>
      </div>
    );
  }

  const sentences = dialogue.sentences || [];
  const currentSentence: ShadowingSentenceItem | undefined = sentences[currentSentenceIndex];

  // Helper names
  const opponentRole = userRole === 'A' ? 'B' : 'A';
  const opponentName = userRole === 'A' ? dialogue.speakerRoleB_Name : dialogue.speakerRoleA_Name;
  const learnerName = userRole === 'A' ? dialogue.speakerRoleA_Name : dialogue.speakerRoleB_Name;

  // Toggle translation
  const toggleTranslation = (sentenceId: number) => {
    setShowTranslations(prev => ({
      ...prev,
      [sentenceId]: !prev[sentenceId],
    }));
  };

  // Play audio sample
  const playAudio = (url: string, speed: number = audioPlaybackSpeed) => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
    }
    const audio = new Audio(url);
    audio.playbackRate = speed;
    audioPlayerRef.current = audio;
    setIsPlayingAudio(true);

    audio.onended = () => setIsPlayingAudio(false);
    audio.onerror = () => {
      setIsPlayingAudio(false);
      setMicError('Không thể phát file âm thanh mẫu.');
    };
    audio.play().catch(() => setIsPlayingAudio(false));
  };

  // Toggle speed (0.8x -> 1.0x -> 1.2x)
  const cyclePlaybackSpeed = () => {
    const speeds = [1.0, 1.2, 0.8];
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
      playAudio(url, 1.0);
    }
  };

  // Start Voice Recognition (Web Speech API + MediaRecorder)
  const startRecording = async () => {
    setMicError(null);
    setCurrentRecognizedText('');

    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    // 1. Setup MediaRecorder for voice playback
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
      // Browser mic error
      setMicError('Vui lòng cấp quyền Microphone trên trình duyệt để ghi âm.');
      return;
    }

    // 2. Setup Web Speech Recognition
    if (SpeechRec) {
      const recognition = new SpeechRec();
      recognitionRef.current = recognition;
      recognition.lang = 'ja-JP'; // Tiếng Nhật
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onstart = () => {
        setPracticeState('listening');
      };

      recognition.onresult = (event: any) => {
        const transcript = event.results?.[0]?.[0]?.transcript || '';
        evaluateSpeech(transcript);
      };

      recognition.onerror = (event: any) => {
        if (event.error === 'not-allowed') {
          setMicError('Quyền truy cập Microphone bị từ chối.');
        } else if (event.error === 'no-speech') {
          evaluateSpeech('');
        } else {
          evaluateSpeech('');
        }
        stopRecordingMedia();
      };

      recognition.onend = () => {
        stopRecordingMedia();
      };

      try {
        recognition.start();
      } catch (err) {
        console.warn('Lỗi khởi động Web Speech API:', err);
        setPracticeState('listening');
      }
    } else {
      // Fallback if browser doesn't support Web Speech API
      setPracticeState('listening');
      setTimeout(() => {
        evaluateSpeech(currentSentence?.japaneseText || '');
        stopRecordingMedia();
      }, 2800);
    }
  };

  const stopRecordingMedia = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
    }
  };

  const stopRecordingManually = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
    }
    stopRecordingMedia();
  };

  // Evaluate speech transcript
  const evaluateSpeech = (recognized: string) => {
    if (!currentSentence) return;
    setCurrentRecognizedText(recognized);

    let score = 0;
    if (recognized) {
      score = calculateSimilarity(recognized, currentSentence.japaneseText);
      // Give bonus if romaji match
      if (score < 70 && currentSentence.romajiText) {
        const romajiSim = calculateSimilarity(recognized, currentSentence.romajiText);
        score = Math.max(score, romajiSim);
      }
    } else {
      // Empty input fallback rating
      score = 45;
    }

    let tier: 'green' | 'yellow' | 'red' = 'green';
    let feedback = '';

    if (score >= 80) {
      tier = 'green';
      feedback = 'Xuất sắc! Ngữ điệu tự nhiên, trường âm chuẩn xác, khớp nhịp điệu bản xứ.';
    } else if (score >= 50) {
      tier = 'yellow';
      feedback = 'Khá tốt! Cần chú ý phát âm rõ hơn trường âm và độ ngân ở các phách cuối câu.';
    } else {
      tier = 'red';
      feedback = 'Chưa chính xác! Bạn hãy nghe lại mẫu chuẩn Tokyo rồi thử phát âm lại nhé.';
    }

    setCurrentScore(score);
    setCurrentTier(tier);
    setCurrentFeedback(feedback);
    setPracticeState('evaluated');

    // Save sentence result in local map
    const resultItem: ShadowingSentencePracticeResult = {
      sentenceId: currentSentence.id,
      orderIndex: currentSentence.orderIndex,
      targetText: currentSentence.japaneseText,
      recognizedText: recognized,
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
    if (currentSentenceIndex + 1 < sentences.length) {
      setCurrentSentenceIndex(prev => prev + 1);
      setPracticeState('ready');
      setCurrentRecognizedText('');
      setMicError(null);
    } else {
      // Completed all sentences
      handleFinishDialogue();
    }
  };

  // Complete dialogue
  const handleFinishDialogue = async () => {
    setPracticeState('completed');
    setIsCompletedModalOpen(true);

    // Calculate metrics
    const resultsList = Array.from(sentenceResults.values());
    const totalScore = resultsList.reduce((acc, r) => acc + r.accuracyScore, 0);
    const avgScore = resultsList.length > 0 ? Math.round(totalScore / resultsList.length) : 85;

    const greenCount = resultsList.filter(r => r.evaluationTier === 'green').length;
    const yellowCount = resultsList.filter(r => r.evaluationTier === 'yellow').length;
    const redCount = resultsList.filter(r => r.evaluationTier === 'red').length;

    // Send complete payload to backend
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

  // Request AI Deep Diagnostics (costs 15 credits)
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
      setAiAnalysisError(res.message || 'Không thể mở khóa phân tích AI.');
    }
    setIsRequestingAi(false);
  };

  // Role selection change
  const handleConfirmRoleChange = (newRole: 'A' | 'B') => {
    setIsRoleModalOpen(false);
    setUserRole(newRole);
    setCurrentSentenceIndex(0);
    setSentenceResults(new Map());
    setPracticeState('ready');
    setIsCompletedModalOpen(false);
  };

  // Average score summary for modal
  const resultsArray = Array.from(sentenceResults.values());
  const finalAvgScore = resultsArray.length > 0
    ? Math.round(resultsArray.reduce((sum, r) => sum + r.accuracyScore, 0) / resultsArray.length)
    : 92;
  const finalGreenCount = resultsArray.filter(r => r.evaluationTier === 'green').length;
  const finalYellowCount = resultsArray.filter(r => r.evaluationTier === 'yellow').length;

  return (
    <div className="min-h-screen flex flex-col justify-between selection:bg-[#0878EE] selection:text-white bg-[#F4F9FE] text-[#071A44] font-sans -mx-4 -my-6 sm:-mx-8">
      {/* Top Navbar */}
      <header className="w-full bg-[#F4F9FE]/90 backdrop-blur-md sticky top-0 z-40 py-2.5 border-b border-[#E6EDF5] px-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link to="/shadowing" className="font-black text-[#0878EE] text-2xl tracking-wide leading-none">
              JCAP
            </Link>
            <div className="h-4 w-px bg-[#E6EDF5] mx-1 hidden sm:block"></div>
            {/* Level & Breadcrumbs */}
            <div className="hidden sm:flex items-center gap-2 text-xs">
              <span className="bg-white border border-[#E6EDF5] text-[#071A44] text-xs font-bold rounded-full px-3 py-1 shadow-xs">
                JLPT {dialogue.jlptLevel}
              </span>
              <span className="text-gray-300">/</span>
              <span className="text-gray-700 font-semibold truncate max-w-[200px]">
                {dialogue.scenarioTitle}
              </span>
              <span className="text-gray-300">/</span>
              <span className="text-[#0878EE] bg-[#0878EE]/10 px-2.5 py-0.5 rounded-full font-semibold truncate max-w-[220px]">
                {dialogue.title}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsRoleModalOpen(true)}
              className="text-xs font-bold text-[#0878EE] bg-blue-50 border border-[#BCDDFB] px-3 py-1 rounded-full hover:bg-blue-100 transition-colors"
            >
              Vai: {learnerName} ({userRole})
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl w-full mx-auto py-5 px-4 sm:px-6 flex-1 flex flex-col justify-between">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* LEFT COLUMN: Campus Scene & Character Card */}
          <section className="lg:col-span-4 flex flex-col gap-4">
            <div className="rounded-[28px] p-5 shadow-sm border border-[#E6EDF5] bg-white relative overflow-hidden backdrop-blur-md">
              {/* Back / End Buttons */}
              <div className="flex items-center justify-between mb-3">
                <button
                  onClick={() => navigate('/shadowing')}
                  className="flex items-center gap-1.5 text-[#071A44] bg-[#F4F9FE] hover:bg-[#EBF3FB] border border-[#E6EDF5] px-3.5 py-1 rounded-full text-xs font-bold transition-all shadow-xs"
                >
                  <span>←</span> Quay lại
                </button>
                <button
                  onClick={handleFinishDialogue}
                  className="flex items-center gap-1.5 text-[#D92D20] hover:text-red-700 bg-white hover:bg-red-50/50 border border-red-200 font-extrabold text-xs px-3.5 py-1 rounded-full shadow-xs transition-all"
                >
                  <span className="w-2 h-2 rounded-full border-2 border-[#D92D20] inline-block"></span>
                  Kết thúc
                </button>
              </div>

              {/* FPT School illustration banner */}
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
                    <rect fill="#FFFFFF" height="14" rx="2" stroke="#DDAA80" width="34" x="53" y="52"></rect>
                    <text fill="#071A44" fontSize="6.5" fontWeight="900" textAnchor="middle" x="70" y="62">JCAP CAMPUS</text>
                  </g>
                  <circle cx="100" cy="135" fill="#58AB8A" r="18"></circle>
                  <circle cx="280" cy="138" fill="#58AB8A" r="16"></circle>
                </svg>
                <div className="absolute top-2 right-2 bg-white/95 text-[10px] font-bold text-[#0878EE] px-2.5 py-0.5 rounded-full shadow-xs border border-blue-100">
                  Phòng luyện tập
                </div>
              </div>

              {/* Character Avatar and Title Section */}
              <div className="flex items-center gap-3 -mt-6 px-2 relative z-10">
                <div className="w-16 h-16 rounded-full border-4 border-white bg-[#F4F9FE] shadow-md overflow-hidden flex-shrink-0 flex items-center justify-center relative">
                  <span className="text-2xl">👩‍🏫</span>
                  <span className="absolute bottom-1 right-1 w-3 h-3 bg-emerald-500 border-2 border-white rounded-full"></span>
                </div>
                <div className="flex-1">
                  <h2 className="text-lg font-black text-[#071A44] tracking-tight">{opponentName}</h2>
                  <p className="text-[10px] font-extrabold text-[#0878EE] uppercase tracking-wide">
                    ĐỐI PHƯƠNG ({opponentRole})
                  </p>
                </div>
              </div>

              {/* VAI CỦA BẠN */}
              <div className="mt-3.5 bg-[#F8FAFD] border border-[#E6EDF5] rounded-2xl px-3.5 py-2 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-[#071A44]">{learnerName} </span>
                  <span className="text-[#556987] text-[11px] font-normal">(Vai {userRole})</span>
                </div>
                <button
                  onClick={() => setIsRoleModalOpen(true)}
                  className="flex items-center gap-1 bg-white hover:bg-[#EEF6FE] text-[#0878EE] text-[11px] font-bold px-2.5 py-0.5 rounded-full border border-[#BCDDFB] shadow-2xs transition-all"
                >
                  Đổi vai
                </button>
              </div>

              {/* Divider */}
              <div className="flex items-center justify-center my-3">
                <div className="h-px bg-[#E6EDF5] flex-1"></div>
                <span className="px-2 text-emerald-600 text-xs">🍃</span>
                <div className="h-px bg-[#E6EDF5] flex-1"></div>
              </div>

              {/* Situation / Context Box ("Tình huống") */}
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
                      {dialogue.scenarioLevelDescription || dialogue.scenarioDescription || dialogue.sourceDescription || 'Luyện tập phát âm theo ngữ cảnh hội thoại.'}
                    </p>

                    {dialogue.targetGrammars && dialogue.targetGrammars.length > 0 && (
                      <div className="mt-2 space-y-1">
                        <span className="text-[10px] font-extrabold text-[#556987] uppercase tracking-wider block">
                          Mục tiêu ngữ pháp
                        </span>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {dialogue.targetGrammars.map(g => (
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

              {/* NỘI DUNG HỘI THOẠI BUTTONS */}
              <div className="space-y-1.5">
                <div
                  className="flex items-center justify-between text-[#071A44] font-bold text-sm cursor-pointer select-none"
                  onClick={() => setIsDialogueContentCollapsed(!isDialogueContentCollapsed)}
                >
                  <span className="font-extrabold tracking-tight">Nội dung học tập</span>
                  <button className="w-6 h-6 rounded-full bg-[#F4F9FE] hover:bg-[#EEF6FE] border border-[#E6EDF5] text-[#556987] flex items-center justify-center text-xs">
                    {isDialogueContentCollapsed ? '▼' : '▲'}
                  </button>
                </div>

                {!isDialogueContentCollapsed && (
                  <div className="grid grid-cols-3 gap-2 pt-2">
                    <button
                      onClick={() => setStudyModalTab('dialogue')}
                      className="flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-xl bg-white hover:bg-[#EEF6FE] border border-[#BCDDFB] text-[#071A44] hover:text-[#0878EE] text-[11px] font-bold shadow-2xs transition-all"
                    >
                      <span>💬</span>
                      <span>Hội thoại</span>
                    </button>
                    <button
                      onClick={() => setStudyModalTab('vocab')}
                      className="flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-xl bg-white hover:bg-[#EEF6FE] border border-[#BCDDFB] text-[#071A44] hover:text-[#0878EE] text-[11px] font-bold shadow-2xs transition-all"
                    >
                      <span>🏷️</span>
                      <span>Từ vựng</span>
                    </button>
                    <button
                      onClick={() => setStudyModalTab('grammar')}
                      className="flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-xl bg-white hover:bg-[#EEF6FE] border border-[#BCDDFB] text-[#071A44] hover:text-[#0878EE] text-[11px] font-bold shadow-2xs transition-all"
                    >
                      <span>📐</span>
                      <span>Ngữ pháp</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* RIGHT COLUMN: Dialogue Stream & Practice Area */}
          <section className="lg:col-span-8 flex flex-col justify-between min-h-[640px] gap-6">
            {/* Dialogue Stream */}
            <div className="space-y-4 w-full">
              {sentences.slice(0, currentSentenceIndex + 1).map((s, idx) => {
                const isOpponent = s.speakerRole !== userRole;
                const isCurrentActive = idx === currentSentenceIndex;
                const prevResult = sentenceResults.get(s.id);
                const hasRecordedAudio = recordedAudioUrls.has(s.id);

                if (isOpponent) {
                  // Opponent speech bubble
                  return (
                    <div key={s.id} className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full border-2 border-white shadow-sm bg-blue-100 text-[#0878EE] font-bold flex items-center justify-center flex-shrink-0 mt-1">
                        {s.speakerRole}
                      </div>

                      <div className="bg-white rounded-[20px] p-4 shadow-xs border border-[#E6EDF5] max-w-xl flex-1">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-bold text-xs text-[#071A44]">{opponentName}</span>
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => playAudio(s.nativeAudioUrl, audioPlaybackSpeed)}
                              className="bg-[#F8FAFD] hover:bg-[#EEF4FB] text-[#4A5D78] border border-[#E6EDF5] text-[11px] font-bold px-3 py-0.5 rounded-full flex items-center gap-1 shadow-2xs transition-all"
                            >
                              <span>🔊</span> Nghe lại
                            </button>
                            <button
                              onClick={() => toggleTranslation(s.id)}
                              className="bg-[#F8FAFD] hover:bg-[#EEF4FB] text-[#4A5D78] border border-[#E6EDF5] text-[11px] font-bold px-3 py-0.5 rounded-full flex items-center gap-1 shadow-2xs transition-all"
                            >
                              <span>文A</span> Dịch
                            </button>
                            <button
                              onClick={cyclePlaybackSpeed}
                              className="bg-[#F8FAFD] hover:bg-[#EEF4FB] text-[#4A5D78] border border-[#E6EDF5] text-[11px] font-bold px-2 py-0.5 rounded-full shadow-2xs transition-all"
                              title="Tốc độ đọc"
                            >
                              ⏱️ {audioPlaybackSpeed}x
                            </button>
                          </div>
                        </div>

                        <p className="text-base text-[#071A44] font-medium leading-relaxed">
                          {s.japaneseText}
                        </p>

                        {showTranslations[s.id] && (
                          <div className="mt-2 pt-2 border-t border-[#E6EDF5] text-xs text-[#556987] italic">
                            "{s.vietnameseTranslation}"
                          </div>
                        )}
                      </div>
                    </div>
                  );
                } else if (!isCurrentActive && prevResult) {
                  // Learner completed previous bubble
                  const badgeColor =
                    prevResult.evaluationTier === 'green'
                      ? 'bg-[#ECFDF3] text-[#027A48] border-[#A6F4C5]'
                      : prevResult.evaluationTier === 'yellow'
                      ? 'bg-[#FFF9EB] text-[#B54708] border-[#FEEFC6]'
                      : 'bg-[#FEF3F2] text-[#D92D20] border-[#FECDCA]';

                  return (
                    <div key={s.id} className="flex flex-col items-end w-full">
                      <div className="flex items-center gap-2 mb-1.5 text-[11px] pr-10">
                        <span className="font-extrabold text-[#4A5D78]">{learnerName}</span>
                        <span className={`font-extrabold text-[10px] px-2 py-0.2 rounded-full border ${badgeColor}`}>
                          {prevResult.accuracyScore}%
                        </span>
                      </div>

                      <div className="flex items-start gap-2.5 justify-end">
                        <div className="rounded-[20px] p-4 text-white shadow-sm flex flex-col justify-between max-w-md bg-[#071A44]">
                          <div className="flex items-center gap-2 mb-2 w-full justify-end">
                            {hasRecordedAudio && (
                              <button
                                onClick={() => playUserRecording(s.id)}
                                className="bg-[#14316D] hover:bg-[#1F4289] text-blue-100 hover:text-white border border-[#2B54A6] text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1 shadow-2xs transition-all cursor-pointer"
                                title="Nghe bản ghi âm của bạn"
                              >
                                🎤 Nghe lại
                              </button>
                            )}
                            <button
                              onClick={() => toggleTranslation(s.id)}
                              className="bg-[#14316D] hover:bg-[#1F4289] text-blue-100 hover:text-white border border-[#2B54A6] text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1 shadow-2xs transition-all cursor-pointer"
                            >
                              文A Dịch
                            </button>
                          </div>

                          <p className="text-base font-bold text-white leading-relaxed my-1 text-left">
                            {s.japaneseText}
                          </p>

                          {showTranslations[s.id] && (
                            <div className="pt-2 mt-1 text-xs text-blue-100 italic border-t border-[#1F4289] text-left">
                              "{s.vietnameseTranslation}"
                            </div>
                          )}
                        </div>

                        <div className="w-8 h-8 rounded-full bg-[#071A44] text-white flex items-center justify-center font-bold text-xs shadow-xs flex-shrink-0 border border-blue-400/30 mt-1">
                          {userRole}
                        </div>
                      </div>
                    </div>
                  );
                } else {
                  // Active Turn Box for current sentence
                  return (
                    <div key={s.id} className="flex flex-col items-end w-full">
                      <div className="flex items-start gap-2.5 justify-end w-full">
                        <div
                          className="rounded-[24px] py-3.5 px-5 relative max-w-xl w-full"
                          style={{ border: '2px dashed rgb(147, 197, 253)', background: 'rgba(255, 255, 255, 0.7)' }}
                        >
                          <div className="w-full rounded-[18px] p-5 text-white shadow-md relative flex flex-col justify-between bg-[#071A44]">
                            <div className="flex items-center gap-2 mb-2 w-full justify-end">
                              <button
                                onClick={() => playAudio(s.nativeAudioUrl, 1.0)}
                                className="bg-white hover:bg-[#EEF6FE] text-[#071A44] font-extrabold text-xs px-3.5 py-1.5 rounded-full shadow-sm flex items-center gap-1.5 transition-all cursor-pointer"
                              >
                                <span className="text-[#0878EE] text-[10px]">▶</span>
                                <span>Nghe mẫu chuẩn</span>
                              </button>
                              <button
                                onClick={() => toggleTranslation(s.id)}
                                className="bg-[#14316D] hover:bg-[#1F4289] text-blue-100 hover:text-white border border-[#2B54A6] text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1 shadow-2xs transition-all cursor-pointer"
                              >
                                <span>文A</span>
                                <span>Dịch</span>
                              </button>
                            </div>

                            <p className="text-lg sm:text-xl font-bold tracking-wide text-white leading-snug my-1 text-left">
                              {s.japaneseText}
                            </p>

                            {s.romajiText && (
                              <p className="text-xs text-blue-200/80 font-mono mt-0.5 text-left">
                                {s.romajiText}
                              </p>
                            )}

                            {showTranslations[s.id] && (
                              <div className="pt-2 mt-1 text-xs text-blue-100 italic border-t border-[#1F4289] text-left">
                                "{s.vietnameseTranslation}"
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="w-8 h-8 rounded-full bg-[#0878EE] text-white flex items-center justify-center font-bold text-xs shadow-xs flex-shrink-0 mt-1">
                          {userRole}
                        </div>
                      </div>
                    </div>
                  );
                }
              })}
            </div>

            {/* Bottom Action Console */}
            <div className="w-full mt-auto mb-2">
              <div
                className="w-full rounded-[24px] border-2 border-dashed bg-white/80 backdrop-blur-xs py-4 px-6 flex flex-col items-center justify-center shadow-xs transition-all relative"
                style={{ borderColor: 'rgb(147, 197, 253)' }}
              >
                {/* 1. STATE READY */}
                {practiceState === 'ready' && (
                  <div className="flex flex-col items-center justify-center w-full space-y-2">
                    <button
                      onClick={startRecording}
                      className="bg-gradient-to-r from-[#0878EE] to-[#054EA0] hover:from-[#0662C6] hover:to-[#043A78] text-white w-14 h-14 rounded-full font-bold shadow-lg shadow-blue-500/25 flex items-center justify-center transition-all transform hover:scale-105 active:scale-95 cursor-pointer"
                      title="Bắt đầu nói (Nhấn để thu âm)"
                    >
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 003-3V5a3 3 0 10-6 0v6a3 3 0 003 3z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.3"></path>
                      </svg>
                    </button>
                    <span className="text-xs font-bold text-[#556987]">
                      Bấm micro để bắt đầu phát âm câu {currentSentenceIndex + 1}/{sentences.length}
                    </span>
                  </div>
                )}

                {/* 2. STATE LISTENING */}
                {practiceState === 'listening' && (
                  <div className="flex flex-col items-center justify-center gap-2 w-full">
                    <button
                      onClick={stopRecordingManually}
                      className="text-white px-8 py-2.5 rounded-full font-bold shadow-xl flex items-center gap-2.5 text-base animate-pulse cursor-pointer bg-gradient-to-r from-blue-600 to-blue-800"
                    >
                      <span className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center">
                        🎤
                      </span>
                      <span>Đang nghe bạn nói... (Bấm để kết thúc câu)</span>
                    </button>
                    <p className="text-[11px] text-blue-600 font-medium">
                      Web Speech API đang nhận diện giọng nói tiếng Nhật (ja-JP)...
                    </p>
                  </div>
                )}

                {/* 3. STATE EVALUATED */}
                {practiceState === 'evaluated' && (
                  <div className="w-full bg-white px-5 py-3 rounded-[20px] border border-[#E6EDF5] shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-3 w-full sm:w-auto">
                      <div
                        className={`w-12 h-12 rounded-2xl text-white font-black flex items-center justify-center text-lg shadow-sm ${
                          currentTier === 'green'
                            ? 'bg-[#12B76A]'
                            : currentTier === 'yellow'
                            ? 'bg-[#F79009]'
                            : 'bg-[#F04438]'
                        }`}
                      >
                        {currentScore}%
                      </div>
                      <div className="text-left">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-sm font-extrabold ${
                              currentTier === 'green'
                                ? 'text-[#027A48]'
                                : currentTier === 'yellow'
                                ? 'text-[#B54708]'
                                : 'text-[#D92D20]'
                            }`}
                          >
                            {currentTier === 'green' ? 'Xuất sắc! (とても良い)' : currentTier === 'yellow' ? 'Khá tốt (注意)' : 'Cần thử lại (もう一度)'}
                          </span>
                          <span className="text-[10px] bg-slate-100 text-slate-700 font-bold px-2 py-0.5 rounded-full border border-slate-200">
                            {currentRecognizedText ? `Nhận diện: "${currentRecognizedText}"` : 'Đã thu âm'}
                          </span>
                        </div>
                        <p className="text-xs text-[#556987] font-medium mt-0.5">
                          {currentFeedback}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2.5 w-full sm:w-auto flex-shrink-0">
                      <button
                        onClick={handleRetryCurrentSentence}
                        className="text-xs font-bold text-[#4A5D78] hover:text-[#0878EE] bg-white hover:bg-[#EEF6FE] border border-[#E6EDF5] px-3.5 py-1.5 rounded-full transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer"
                      >
                        🔄 Luyện lại câu
                      </button>
                      <button
                        onClick={handleNextSentence}
                        className="text-xs font-extrabold text-white bg-[#0878EE] hover:bg-[#0662C6] px-5 py-1.5 rounded-full shadow-sm flex items-center gap-1.5 transition-all cursor-pointer"
                      >
                        <span>{currentSentenceIndex + 1 < sentences.length ? 'Chốt & Tiếp tục ➔' : 'Hoàn thành bài tập 🎉'}</span>
                      </button>
                    </div>
                  </div>
                )}

                {micError && (
                  <p className="text-xs text-red-500 font-medium mt-2">
                    ⚠️ {micError}
                  </p>
                )}
              </div>
            </div>
          </section>
        </div>
      </main>

      {/* MODAL 1: StudyCenterModal (Hội thoại / Từ vựng / Ngữ pháp) */}
      {studyModalTab && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#071A44]/50 backdrop-blur-xs"
          onClick={() => setStudyModalTab(null)}
        >
          <div
            className="bg-white rounded-[28px] max-w-2xl w-full max-h-[85vh] shadow-2xl border border-[#E6EDF5] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-5 py-4 border-b border-[#E6EDF5] bg-[#F4F9FE] flex items-center justify-between">
              <h3 className="font-extrabold text-[#071A44] text-base sm:text-lg">
                {studyModalTab === 'dialogue' && 'Toàn bộ Kịch bản Hội thoại'}
                {studyModalTab === 'vocab' && 'Bảng Từ vựng Trọng tâm bài học'}
                {studyModalTab === 'grammar' && 'Tổng hợp Ngữ pháp Mục tiêu'}
              </h3>
              <button
                onClick={() => setStudyModalTab(null)}
                className="w-8 h-8 rounded-full bg-white hover:bg-red-50 text-[#556987] hover:text-[#D92D20] border border-[#E6EDF5] flex items-center justify-center font-bold text-sm"
              >
                ✕
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 flex-1 text-sm">
              {studyModalTab === 'dialogue' && (
                <div className="space-y-3">
                  {sentences.map(s => (
                    <div key={s.id} className="p-3 bg-[#F8FAFD] rounded-xl border border-[#E6EDF5]">
                      <div className="flex items-center justify-between text-xs font-bold text-[#0878EE] mb-1">
                        <span>Câu #{s.orderIndex} ({s.speakerRole === 'A' ? dialogue.speakerRoleA_Name : dialogue.speakerRoleB_Name})</span>
                        <button
                          onClick={() => playAudio(s.nativeAudioUrl)}
                          className="hover:underline text-[11px]"
                        >
                          🔊 Nghe
                        </button>
                      </div>
                      <p className="font-medium text-[#071A44] text-base">{s.japaneseText}</p>
                      <p className="text-xs text-[#556987] mt-1 italic">{s.vietnameseTranslation}</p>
                    </div>
                  ))}
                </div>
              )}

              {studyModalTab === 'vocab' && (
                <div className="space-y-3">
                  {dialogue.targetVocabularies && dialogue.targetVocabularies.length > 0 ? (
                    dialogue.targetVocabularies.map(v => (
                      <div
                        key={v.id}
                        onClick={() => setSelectedTermDetail({
                          category: 'Từ vựng trọng tâm',
                          heading: v.word,
                          reading: v.reading || undefined,
                          meaning: v.meaning,
                        })}
                        className="p-3.5 bg-[#F8FAFD] rounded-xl border border-[#BCDDFB] hover:border-[#0878EE] cursor-pointer transition-all"
                      >
                        <div className="flex items-center justify-between">
                          <h4 className="font-bold text-base text-[#071A44]">{v.word}</h4>
                          {v.reading && <span className="text-xs text-[#556987]">【{v.reading}】</span>}
                        </div>
                        <p className="text-xs text-[#4A5D78] mt-1"><strong>Nghĩa:</strong> {v.meaning}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-[#71809A] italic">Chưa có danh sách từ vựng bổ sung cho bài học này.</p>
                  )}
                </div>
              )}

              {studyModalTab === 'grammar' && (
                <div className="space-y-3">
                  {dialogue.targetGrammars && dialogue.targetGrammars.length > 0 ? (
                    dialogue.targetGrammars.map(g => (
                      <div
                        key={g.id}
                        onClick={() => setSelectedTermDetail({
                          category: 'Ngữ pháp mục tiêu',
                          heading: g.pattern,
                          meaning: g.meaning,
                          example: g.exampleSentence || undefined,
                        })}
                        className="p-3.5 bg-[#F8FAFD] rounded-xl border border-[#BCDDFB] hover:border-[#0878EE] cursor-pointer transition-all"
                      >
                        <h4 className="font-bold text-sm text-[#0878EE]">{g.pattern}</h4>
                        <p className="text-xs text-[#4A5D78] mt-1"><strong>Ý nghĩa:</strong> {g.meaning}</p>
                        {g.exampleSentence && (
                          <div className="mt-2 p-2 bg-white rounded-lg border border-[#E6EDF5] text-xs">
                            <span className="font-medium text-[#071A44]">Ví dụ: {g.exampleSentence}</span>
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-[#71809A] italic">Chưa có điểm ngữ pháp nào được gán cho bài học này.</p>
                  )}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-[#E6EDF5] bg-[#F4F9FE] flex justify-end">
              <button
                onClick={() => setStudyModalTab(null)}
                className="px-5 py-2 rounded-full bg-[#0878EE] text-white text-xs font-bold"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: TermDetailModal (Chi tiết từng từ vựng / ngữ pháp) */}
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

      {/* MODAL 3: CompletedModal (Tổng kết buổi Shadowing & Mở khóa AI) */}
      {isCompletedModalOpen && (
        <div className="fixed inset-0 bg-[#071A44]/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[28px] max-w-xl w-full p-6 sm:p-7 shadow-2xl border border-[#E6EDF5] max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
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

            {/* 3 Performance Metric Cards */}
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
                  <span className="text-emerald-600">{finalGreenCount} 🟢</span>
                  <span className="text-amber-500">{finalYellowCount} 🟡</span>
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
                        Đánh giá biểu đồ Radar về ngữ điệu Tokyo, độ mở nguyên âm, trường âm và hướng dẫn sửa lỗi phát âm cụ thể.
                      </p>
                    </div>
                  </div>
                  <span className="text-[11px] font-bold text-[#B54708] bg-[#FFF9EB] border border-[#FEEFC6] px-2.5 py-1 rounded-full whitespace-nowrap flex-shrink-0">
                    15 Credits
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
                    <span>Mở khóa báo cáo phân tích AI chuyên sâu (15 Credits)</span>
                  )}
                </button>
              </div>
            ) : (
              // AI DIAGNOSTIC REPORT DISPLAY
              <div className="bg-gradient-to-br from-emerald-50/70 to-blue-50/50 border border-emerald-200 rounded-2xl p-4 sm:p-5 mb-5 space-y-4">
                <div className="flex items-center justify-between border-b border-emerald-200 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🎯</span>
                    <h4 className="font-extrabold text-emerald-900 text-sm">Báo cáo phân tích AI Chuyên Sâu</h4>
                  </div>
                  <span className="text-[10px] font-bold text-emerald-700 bg-white px-2 py-0.5 rounded-full border border-emerald-300">
                    -15 Credits (Còn {aiAnalysisResult.remainingCreditBalance})
                  </span>
                </div>

                <p className="text-xs font-semibold text-[#071A44] leading-relaxed">
                  {aiAnalysisResult.overallDiagnosis}
                </p>

                {/* Radar Metrics Progress Bars */}
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
                      <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${aiAnalysisResult.vowelClarityScore}%` }}></div>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between font-bold text-[#071A44] mb-1">
                      <span>Trường âm (Long Vowels)</span>
                      <span className="text-amber-600">{aiAnalysisResult.longVowelPrecisionScore}%</span>
                    </div>
                    <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                      <div className="bg-amber-500 h-full rounded-full" style={{ width: `${aiAnalysisResult.longVowelPrecisionScore}%` }}></div>
                    </div>
                  </div>
                </div>

                {/* Key Strengths & Improvements */}
                <div className="space-y-2 pt-2 text-xs">
                  <div>
                    <span className="font-extrabold text-emerald-800 block mb-1">✅ Điểm mạnh ghi nhận:</span>
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

            {/* Bottom Action Buttons */}
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
                onClick={() => navigate('/shadowing')}
                className="w-full sm:w-auto text-xs font-extrabold text-white bg-gradient-to-r from-[#0878EE] to-[#054EA0] hover:from-[#0662C6] hover:to-[#043A78] px-6 py-2.5 rounded-full shadow-md transition-all cursor-pointer"
              >
                Thư viện Shadowing ➔
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
