import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { PracticePanel } from '../../components/jcap/PracticePanel';
import { PracticeConfirmation } from '../../components/jcap/PracticeConfirmation';
import { usePracticeViewport } from '../../hooks/usePracticeViewport';
import { Badge as JBadge, Button as JButton, Icon as JIcon, IconButton as JIconButton, JlptBadge as JJlptBadge, Logo as JLogo } from '../../components/jcap';
import type { ShadowingSentenceItem } from '../../types/shadowing';
import { RoleSelectionModal } from '../../components/shadowing/RoleSelectionModal';
import { AudioDeviceSettingsModal } from '../../components/shadowing/AudioDeviceSettingsModal';
import RecordingBar from '../../components/shadowing/RecordingBar';
import { describeDeviceStatus } from '../../utils/audioDevice';
import RecordingReviewBar from '../../components/shadowing/RecordingReviewBar';
import SessionSummaryPanel from '../../components/shadowing/SessionSummaryPanel';
import { matchingFurigana } from '../../utils/furigana';
import { RecordingDevTools } from '../../components/shadowing/RecordingDevTools';
import { sessionRankTitle, summarizeSessionScores } from '../../utils/shadowingSessionScores';
import { JapaneseSentenceDiffView } from '../../components/shadowing/JapaneseSentenceDiffView';
import { ShadowingSentenceResultCard } from '../../components/shadowing/ShadowingSentenceResultCard';
import { useTheme } from '../../contexts/ThemeContext';
import { DefaultAvatarImage } from '../../components/shadowing/DefaultAvatarImage';
import { useShadowingSession, displayRoleName } from '../../hooks/useShadowingSession';

export const LearnerShadowingPracticeView: React.FC = () => {
  const { mobile, room } = usePracticeViewport();
  const [showContext, setShowContext] = useState(false);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const { themeFor } = useTheme();
  const { id } = useParams<{ id?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  /**
   * Mở từ trang Khám phá (?return=/explore?...): bấm "Xong"/"Quay lại" thì về lại đúng địa điểm trên bản đồ, nơi con dấu
   * được cấp. Chỉ nhận đường dẫn nội bộ của Khám phá (không cho chuyển hướng ra ngoài).
   */
  const returnParam = searchParams.get('return');
  const returnTo =
    returnParam && (returnParam.startsWith('/explore') || returnParam.startsWith('/roleplay/results'))
      ? returnParam
      : null;
  const initialLevel = (searchParams.get('level')?.toUpperCase() as 'N5' | 'N4' | 'N3') || 'N4';
  const [selectedLevel, setSelectedLevel] = useState<'N5' | 'N4' | 'N3'>(initialLevel);
  const roleParam = (searchParams.get('role')?.toUpperCase() as 'A' | 'B') || 'A';
  const [isRoleModalOpen, setIsRoleModalOpen] = useState<boolean>(false);
  // Modals & Slideovers (Mặc định ẩn nội dung khi lần đầu vào trang, mũi tên hướng xuống)
  const [isSituationCollapsed, setIsSituationCollapsed] = useState<boolean>(true);
  const [isDialogueContentCollapsed, setIsDialogueContentCollapsed] = useState<boolean>(true);
  const [isFullScriptModalOpen, setIsFullScriptModalOpen] = useState<boolean>(false);
  const [isCompletedModalOpen, setIsCompletedModalOpen] = useState<boolean>(false);
  // Chi tiết từng câu ở màn tổng kết: mặc định thu gọn, bấm từng câu để mở
  const [openSentenceIds, setOpenSentenceIds] = useState<Set<number>>(new Set());
  const [isAudioDeviceModalOpen, setIsAudioDeviceModalOpen] = useState<boolean>(false);
  const toggleSentenceDetail = (id: number) =>
    setOpenSentenceIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const session = useShadowingSession({
    dialogueId: id,
    initialRole: roleParam,
    resume: searchParams.get('resume') === 'true',
    restart: searchParams.get('restart') === 'true',
    onStartFlagsConsumed: () =>
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete('restart');
          next.delete('resume');
          return next;
        },
        { replace: true },
      ),
    onFinish: () => {
      setOpenSentenceIds(new Set());
      setIsCompletedModalOpen(true);
    },
    onRoleChange: (newRole) => {
      setIsRoleModalOpen(false);
      setIsCompletedModalOpen(false);
      setSearchParams({ level: selectedLevel, role: newRole, ...(returnTo ? { return: returnTo } : {}) });
    },
  });
  const {
    cancelRecording,
    completedSessionId,
    currentDiffTokens,
    currentDimensions,
    currentEvaluationStatus,
    currentFluencyMetrics,
    currentGateDetail,
    currentRecognitionSource,
    currentRecognizedText,
    currentScore,
    currentScoreBasis,
    currentSentenceIndex,
    devTake,
    dialogue,
    dialogueScrollRef,
    discardRecordedTake,
    errorMessage,
    finishRecording,
    furiganaMap,
    handleConfirmRoleChange,
    handleFinishDialogue,
    handleNextSentence,
    handlePlayResumedOpponentSentence,
    handleRetryCurrentSentence,
    handleSkipOpponentSpeech,
    hasMicrophone,
    historySaveMessage,
    historySaveState,
    isLoading,
    isOpponentPausedForResume,
    isPlayingAudio,
    isTranslationShown,
    loadingAudioSentenceId,
    micError,
    micNotice,
    playAudio,
    playPendingTake,
    playUserRecording,
    playingUserAudioSentenceId,
    practiceState,
    progressSyncError,
    recordedAudioUrls,
    selectedAudioInputDeviceId,
    selectedAudioOutputDeviceId,
    sentenceAttemptsMap,
    sentenceResults,
    sentenceStates,
    serverOverall,
    serverProgress,
    serverSummary,
    sessionDurationSeconds,
    setMicError,
    setMicNotice,
    setPlayingUserAudioSentenceId,
    setProgressSyncError,
    setSelectedAudioInputDeviceId,
    setSelectedAudioOutputDeviceId,
    showFurigana,
    startRecording,
    stopAllAudio,
    submitError,
    submitPendingTake,
    toggleTranslation,
    userAudioPlayerRef,
    userRole,
    userRoleRef,
  } = session;

  // Cấp độ hiển thị theo bài vừa tải
  useEffect(() => {
    if (dialogue?.jlptLevel) setSelectedLevel(dialogue.jlptLevel as 'N5' | 'N4' | 'N3');
  }, [dialogue?.jlptLevel]);

  // Sync role if changed via URL query params (e.g. browser back/forward)
  useEffect(() => {
    const roleInUrl = (searchParams.get('role')?.toUpperCase() as 'A' | 'B') || 'A';
    if (roleInUrl !== userRoleRef.current) {
      handleConfirmRoleChange(roleInUrl);
    }
  }, [searchParams]);

  // Back button: returns to dialogue catalog (mở từ Khám phá thì về lại đúng chỗ đó trên bản đồ)
  const handleBackToDialogueList = () => {
    if (returnTo) navigate(returnTo, { replace: true });
    else navigate('/shadowing');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-paper-100 flex flex-col items-center justify-center space-y-4">
        <div className="w-12 h-12 border-4 border-line-strong border-t-ai rounded-full animate-spin"></div>
        <p className="text-sm font-bold text-sumi">Đang chuẩn bị phòng luyện Shadowing...</p>
      </div>
    );
  }

  if (errorMessage || !dialogue) {
    return (
      <div className="min-h-screen bg-paper-100 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-paper-50 p-8 rounded-2xl border border-danger-soft text-center space-y-4 shadow-sm">
          <p className="text-danger font-bold">{errorMessage || 'Không tìm thấy bài học.'}</p>
          <button
            onClick={handleBackToDialogueList}
            className="bg-ai text-white px-5 py-2 rounded-full font-bold text-xs hover:bg-ai-hover cursor-pointer"
          >
            {returnTo ? 'Quay lại Khám phá' : 'Quay lại Thư viện Shadowing'}
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
  const opponentName = displayRoleName(userRole === 'A' ? dialogue.speakerRoleB_Name : dialogue.speakerRoleA_Name);
  const learnerName = displayRoleName(userRole === 'A' ? dialogue.speakerRoleA_Name : dialogue.speakerRoleB_Name);


  // Summary results for celebration modal (trung bình các điểm do backend chấm; không áp lại công thức)
  const learnerSentences = sentences.filter(s => s.speakerRole === userRole);
  const totalLearnerSentencesCount = learnerSentences.length;

  const sessionSummary = summarizeSessionScores(learnerSentences.map(s => s.id), sentenceResults);
  // Có tổng kết của backend thì dùng số của backend (gồm cả các câu đã chấm trước khi tiếp tục phiên ở đây)
  const practicedSentencesCount = serverSummary?.evaluatedSentenceCount ?? sessionSummary.practicedSentences;
  const finalContentMatchScore = serverSummary?.contentAccuracy ?? sessionSummary.contentMatch;
  const finalWeightedScore = serverOverall ?? sessionSummary.overall;
  const finalGateStatus = sessionSummary.gateStatus;
  const finalGreenCount = sessionSummary.greenCount;
  const finalYellowCount = sessionSummary.yellowCount;
  const finalRedCount = sessionSummary.redCount;
  const hasScoredSentence = practicedSentencesCount > 0;

  // Render text directly without popup annotations (Bỏ qua popup từ vựng/ngữ pháp theo yêu cầu)
  // Câu tiếng Nhật kèm Furigana trên chữ Hán (khi bật và có dữ liệu khớp đúng chữ của câu)
  const renderAnnotatedSentenceText = (text: string, sentenceId?: number) => {
    const segments = showFurigana && sentenceId != null ? matchingFurigana(text, furiganaMap.get(sentenceId)) : null;
    if (!segments) return text;
    return segments.map((seg, i) =>
      seg.reading ? (
        <ruby key={i}>
          {seg.text}
          <rt className="text-[0.5em] font-medium opacity-80">{seg.reading}</rt>
        </ruby>
      ) : (
        <span key={i}>{seg.text}</span>
      ),
    );
  };

  return (
    <div
      data-theme={themeFor('room')}
      ref={room}
      className={`jx-room min-h-screen lg:h-screen lg:max-h-screen flex flex-col justify-between selection:bg-ai selection:text-white text-sumi font-sans lg:overflow-hidden${mobile ? ' jx-mobile-shadowing jx-mobile-practice' : ''}`}
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
          border-bottom-color: var(--danger);
        }
        .annotation-term-red:hover {
          background-color: var(--danger-soft);
        }
        .annotation-term-blue {
          border-bottom-color: var(--info);
        }
        .annotation-term-blue:hover {
          background-color: var(--info-soft);
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
          background-color: var(--line);
          border-radius: 9999px;
        }
        .dialogue-scroll-container::-webkit-scrollbar-thumb:hover {
          background-color: var(--line-strong);
        }
      `}</style>

      {/* Thanh trên: logo, đường dẫn (kịch bản › bài), cấp độ của bài, cài đặt âm thanh */}
      <header className="jx-rm-bar">
        {mobile ? <JIconButton icon="arrow_back" label="Quay lại" onClick={handleBackToDialogueList} /> : <Link to={returnTo ?? '/shadowing'} aria-label="JCAP, về thư viện Shadowing" className="flex-none">
          <JLogo size={28} withName={false} />
        </Link>}
        <span className="jx-rm-div" aria-hidden="true" />
        <nav aria-label="Vị trí" className="jx-rm-crumb min-w-0">
          <button type="button" onClick={handleBackToDialogueList} title={dialogue.scenarioTitle}>
            {dialogue.scenarioTitle || 'Shadowing'}
          </button>
          <JIcon name="chevron_right" size={18} />
          <span className="jx-rm-title" aria-current="page" title={dialogue.title}>
            {dialogue.title}
          </span>
        </nav>
        {/* Cấp độ của bài: chỉ hiển thị, không đổi được ở đây */}
        <JJlptBadge level={(dialogue.jlptLevel || selectedLevel) as 'N5' | 'N4' | 'N3'} size="sm" />
        {!mobile && <div className="flex-auto" />}
        {mobile && <JIconButton icon="menu_book" label="Thông tin bài luyện" onClick={() => setShowContext(true)} />}
        {mobile && <JIconButton icon="stop_circle" label="Kết thúc bài luyện" onClick={() => setConfirmFinish(true)} />}
        <JIconButton icon="tune" label="Cài đặt âm thanh" onClick={() => setIsAudioDeviceModalOpen(true)} />
      </header>

      {/* MAIN WORKSPACE CONTENT */}
      <main className="max-w-7xl w-full mx-auto py-3 px-4 sm:px-6 flex-1 flex flex-col min-h-0 lg:overflow-hidden">
        {/* Hàng lưới cao đúng bằng khung (minmax(0,1fr)): các cột không được cao hơn màn hình */}
        <div className="jx-shadow-workspace grid grid-cols-1 lg:grid-cols-12 lg:grid-rows-[minmax(0,1fr)] gap-6 lg:gap-8 items-start lg:h-full min-h-0 lg:overflow-hidden">
          {/* LEFT COLUMN: Context Panel (Hình 3) - Cố định vị trí, không cuộn theo đoạn chat */}
          <PracticePanel mobile={mobile} open={showContext} label="Thông tin bài luyện" onDismiss={() => setShowContext(false)}>
          <section className="jx-shadow-context lg:col-span-4 flex flex-col gap-4 lg:h-full lg:overflow-y-auto pr-1">
            <div className="rounded-[28px] p-5 border border-line bg-paper-50 relative overflow-hidden" style={{ boxShadow: '0 10px 30px rgba(15,37,56,.06)' }}>
              {/* Quay lại / Kết thúc */}
              {mobile ? <div className="mb-3 flex justify-end"><JIconButton icon="close" label="Đóng thông tin bài luyện" onClick={() => setShowContext(false)} /></div> : <div className="flex items-center justify-between mb-4">
                <JButton variant="secondary" size="sm" icon="arrow_back" onClick={handleBackToDialogueList}>
                  Quay lại
                </JButton>
                <JButton variant="danger" size="sm" icon="stop_circle" onClick={handleFinishDialogue}>
                  Kết thúc
                </JButton>
              </div>}

              {/* Ảnh bối cảnh + nhân vật đè góc */}
              <div className="relative pb-10">
                <div className="jx-scene" aria-hidden="true">
                  <span className="jx-cloud" style={{ left: 26, top: 40, width: 70 }} />
                  <span className="jx-cloud" style={{ right: 30, top: 92, width: 56 }} />
                  <span className="jx-ground" />
                  <span className="jx-win">
                    <JIcon name="forum" size={36} />
                  </span>
                </div>
                {dialogue.scenarioTitle && (
                  <span className="absolute right-3 top-3 max-w-[60%] truncate rounded-full bg-paper-50 px-3 py-1 text-xs font-bold text-ai shadow-jc-sm">
                    {dialogue.scenarioTitle}
                  </span>
                )}
                <div className="absolute bottom-0 left-3.5 flex items-end gap-3">
                  <span className="relative inline-flex h-[76px] w-[76px] items-center justify-center overflow-hidden rounded-full border-4 border-paper-50 bg-paper-200 shadow-jc-md">
                    <DefaultAvatarImage alt={opponentName} className="h-full w-full object-cover" />
                    <span className="absolute bottom-1 right-0.5 h-3.5 w-3.5 rounded-full border-2 border-paper-50 bg-success" title="AI đang sẵn sàng" />
                  </span>
                  <span className="pb-1.5 text-xl font-bold leading-[26px]">{opponentName}</span>
                </div>
              </div>

              {/* Vai của người học + Đổi vai */}
              <div className="mt-4 flex items-center gap-2.5 rounded-2xl border border-line bg-paper-100 py-2.5 pl-4 pr-2.5">
                <span className="flex-auto text-sm leading-5">
                  <span className="text-sumi-muted">Vai của bạn: </span>
                  <strong>{learnerName}</strong>
                </span>
                <JButton
                  variant="secondary"
                  size="sm"
                  icon="swap_horiz"
                  onClick={() => {
                    stopAllAudio();
                    setShowContext(false);
                    setIsRoleModalOpen(true);
                  }}
                >
                  Đổi vai
                </JButton>
              </div>

              <div className="h-px bg-line my-4"></div>

              {/* Situation ("Tình huống") */}
              <div className="space-y-1.5">
                <div
                  className="flex items-center justify-between text-sumi font-bold text-sm cursor-pointer select-none"
                  onClick={() => setIsSituationCollapsed(!isSituationCollapsed)}
                >
                  <span className="font-extrabold tracking-tight">Tình huống</span>
                  <button
                    type="button"
                    aria-label={isSituationCollapsed ? 'Mở rộng' : 'Thu gọn'}
                    className="w-6 h-6 rounded-full bg-paper-100 hover:bg-ai-soft border border-line text-sumi-muted flex items-center justify-center transition-colors cursor-pointer"
                  >
                    {isSituationCollapsed ? (
                      <svg className="w-3.5 h-3.5 text-sumi-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M19 9l-7 7-7-7" />
                      </svg>
                    ) : (
                      <svg className="w-3.5 h-3.5 text-sumi-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 15l7-7 7 7" />
                      </svg>
                    )}
                  </button>
                </div>

                {!isSituationCollapsed && (
                  <div className="space-y-3 pt-1">
                    <p className="text-xs leading-relaxed text-sumi-muted text-justify">
                      {dialogue.scenarioDescription ||
                        'Bạn là tân học sinh. Chị khóa trên Ran phụ trách Club Day gọi điện báo về Ngày giới thiệu câu lạc bộ. Hãy hỏi lịch trình, địa điểm nhận đơn, và cách đăng ký câu lạc bộ âm nhạc.'}
                    </p>
                  </div>
                )}
              </div>

              <div className="h-px bg-paper-200 my-3"></div>

              {/* NỘI DUNG BÀI HỌC (3 Buttons: Toàn bộ hội thoại, Từ vựng, Ngữ pháp) */}
              <div className="space-y-1.5">
                <div
                  className="flex items-center justify-between text-sumi font-bold text-sm cursor-pointer select-none"
                  onClick={() => setIsDialogueContentCollapsed(!isDialogueContentCollapsed)}
                >
                  <span className="font-extrabold tracking-tight">Nội dung bài học</span>
                  <button
                    type="button"
                    aria-label={isDialogueContentCollapsed ? 'Mở rộng' : 'Thu gọn'}
                    className="w-6 h-6 rounded-full bg-paper-100 hover:bg-ai-soft border border-line text-sumi-muted flex items-center justify-center transition-colors cursor-pointer"
                  >
                    {isDialogueContentCollapsed ? (
                      <svg className="w-3.5 h-3.5 text-sumi-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M19 9l-7 7-7-7" />
                      </svg>
                    ) : (
                      <svg className="w-3.5 h-3.5 text-sumi-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 15l7-7 7 7" />
                      </svg>
                    )}
                  </button>
                </div>

                {!isDialogueContentCollapsed && (
                  <div className="grid grid-cols-3 gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowContext(false);
                        setIsFullScriptModalOpen(true);
                      }}
                      className="flex flex-col items-center justify-center py-2 px-1 rounded-xl bg-paper-50 hover:bg-ai-soft border border-line-strong text-sumi hover:text-ai text-[11px] font-bold shadow-2xs transition-all cursor-pointer text-center leading-tight"
                    >
                      Toàn bộ hội thoại
                    </button>
                    <button
                      type="button"
                      onClick={() => {}}
                      className="flex flex-col items-center justify-center py-2 px-1 rounded-xl bg-paper-50 hover:bg-ai-soft border border-line-strong text-sumi hover:text-ai text-[11px] font-bold shadow-2xs transition-all cursor-pointer text-center leading-tight"
                    >
                      Từ vựng
                    </button>
                    <button
                      type="button"
                      onClick={() => {}}
                      className="flex flex-col items-center justify-center py-2 px-1 rounded-xl bg-paper-50 hover:bg-ai-soft border border-line-strong text-sumi hover:text-ai text-[11px] font-bold shadow-2xs transition-all cursor-pointer text-center leading-tight"
                    >
                      Ngữ pháp
                    </button>
                  </div>
                )}
              </div>
            </div>
          </section>
          </PracticePanel>

          {/* RIGHT COLUMN: Dialogue Stream & Mic Console */}
          <section className="jx-shadow-dialogue lg:col-span-8 flex flex-col justify-between lg:h-full min-h-0 lg:overflow-hidden gap-2">
            {/* Dialogue Stream - CHỈ PHẦN NÀY ĐƯỢC CUỘN */}
            <div ref={dialogueScrollRef} className="dialogue-scroll-container flex-1 overflow-y-auto min-h-0 pr-2 space-y-4 pb-2">
              {sentences.slice(0, currentSentenceIndex + 1).map((s, idx) => {
                const isOpponent = s.speakerRole !== userRole;
                const isCurrentActive = idx === currentSentenceIndex;
                const hasRecordedAudio = recordedAudioUrls.has(s.id);

                if (isOpponent) {
                  // Opponent speech bubble (Ran / Yui)
                  return (
                    <div key={s.id} className="flex items-start gap-3 w-full max-w-xl">
                      <div className="w-10 h-10 rounded-full border-2 border-paper-50 shadow-sm bg-ai-soft overflow-hidden flex-shrink-0 mt-0.5">
                        <DefaultAvatarImage alt={opponentName} className="w-full h-full object-cover" />
                      </div>

                      <div className="flex flex-col items-start min-w-0">
                        <div className="flex items-center gap-2 mb-1.5 ml-1">
                          <span className="font-bold text-xs text-sumi">{opponentName}</span>
                        </div>

                        <div className="bg-paper-50 rounded-[20px] p-4 shadow-xs border border-line max-w-full">
                          <p className="text-base text-sumi font-medium leading-relaxed">
                            {renderAnnotatedSentenceText(s.japaneseText, s.id)}
                          </p>

                          {isTranslationShown(s.id) && (
                            <div className="mt-2 pt-2 border-t border-line text-xs text-sumi-muted italic">
                              "{s.vietnameseTranslation}"
                            </div>
                          )}
                        </div>

                        {/* Nút hành động nằm NGOÀI bong bóng, góc dưới phía avatar (bên trái) */}
                        <div className="jx-shadow-sentence-actions flex items-center justify-start gap-1.5 mt-1.5 ml-1">
                          <button
                            type="button"
                            onClick={() => toggleTranslation(s.id)}
                            className="bg-paper-50 hover:bg-paper-200 text-sumi-muted border border-line text-[11px] font-bold px-3 py-1 rounded-full flex items-center gap-1 shadow-2xs transition-all cursor-pointer"
                          >
                            <span>文A</span> Dịch
                          </button>
                          <button
                            type="button"
                            onClick={() => playAudio(s.nativeAudioUrl, s.japaneseText, undefined, undefined, s.id)}
                            disabled={loadingAudioSentenceId === s.id}
                            className="bg-paper-50 hover:bg-paper-200 text-sumi-muted border border-line text-[11px] font-bold px-3 py-1 rounded-full flex items-center gap-1 shadow-2xs transition-all cursor-pointer disabled:opacity-60"
                          >
                            {loadingAudioSentenceId === s.id ? (
                              <>
                                <span className="w-2.5 h-2.5 border-2 border-ai border-t-transparent rounded-full animate-spin"></span>
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
                        <span className="font-bold text-sumi">{learnerName}</span>
                        {(() => {
                          // Trạng thái câu: chưa gửi / đang chấm / chưa chấm được (đã chấm thì hiện điểm bên dưới)
                          const entry = sentenceStates.get(s.id);
                          if (entry?.state === 'RECORDED') return <JBadge tone="warning" dot>Chưa gửi</JBadge>;
                          if (entry?.state === 'EVALUATING') return <JBadge tone="info" dot>Đang chấm</JBadge>;
                          if (entry?.state === 'RECORDING') return <JBadge tone="ai" dot>Đang ghi</JBadge>;
                          if (entry?.state === 'EVALUATION_FAILED' && !(isCurrentActive && practiceState === 'evaluated'))
                            return <JBadge tone="danger" dot>Chưa chấm được</JBadge>;
                          return null;
                        })()}
                        {(() => {
                          const sentenceResult = sentenceResults.get(s.id);
                          // Tiếp tục phiên (tải lại trang, máy khác): điểm cao nhất của câu đã lưu ở server
                          const serverBest = serverProgress?.sentences.find((x) => x.sentenceId === s.id)?.bestScore ?? null;
                          const activeScore = (isCurrentActive && practiceState === 'evaluated')
                            ? currentScore
                            : (sentenceResult ? (sentenceResult.overallScore ?? sentenceResult.accuracyScore) : serverBest);

                          if (activeScore === null || activeScore === undefined) return null;

                          return (
                            <span className={`font-bold text-[11px] px-2.5 py-0.5 rounded-full border transition-all duration-300 ${
                              activeScore >= 80
                                ? 'bg-success-soft text-success border-success'
                                : activeScore >= 65
                                ? 'bg-warning-soft text-warning border-warning-soft'
                                : 'bg-danger-soft text-danger border-danger-soft'
                            }`}>
                              {activeScore}%
                            </span>
                          );
                        })()}
                      </div>

                      <div className="flex items-start gap-2.5 justify-end w-full max-w-xl">
                        {/* Dark Navy Bubble */}
                        <div className={`jx-me-bubble rounded-[22px] p-4 sm:p-5 text-white shadow-md flex flex-col justify-between min-w-0 max-w-full bg-sumi transition-all ${
                          isCurrentActive && practiceState === 'listening' ? 'ring-2 ring-cyan-400 shadow-cyan-500/20' : ''
                        }`}>
                          {/* Japanese Text */}
                          <p className="text-lg sm:text-xl font-bold tracking-wide text-white leading-relaxed my-1 text-left">
                            {renderAnnotatedSentenceText(s.japaneseText, s.id)}
                          </p>

                          {/* Vietnamese Translation (if toggled) */}
                          {isTranslationShown(s.id) && (
                            <div className="pt-2 mt-2 text-xs sm:text-sm text-on-ai italic border-t border-sumi text-left">
                              "{s.vietnameseTranslation}"
                            </div>
                          )}
                        </div>

                        {/* Circular Avatar */}
                        <div className="w-8 h-8 rounded-full border border-line overflow-hidden flex-shrink-0 shadow-xs mt-1">
                          <DefaultAvatarImage alt={learnerName} className="w-full h-full object-cover" />
                        </div>
                      </div>

                      {/* Nút hành động nằm NGOÀI bong bóng, góc dưới bên phải (phía avatar) */}
                      <div className="jx-shadow-sentence-actions flex items-center justify-end gap-1.5 mt-1.5 w-full max-w-xl pr-10">
                        {/* 1. Mic: ghi âm / nghe lại giọng của bạn */}
                        {(!mobile || hasRecordedAudio) && <button
                          type="button"
                          onClick={() => {
                            if (hasRecordedAudio) {
                              playUserRecording(s.id);
                            } else {
                              startRecording();
                            }
                          }}
                          className="h-7 w-8 sm:w-9 rounded-full bg-paper-50 hover:bg-ai-soft text-ai border border-line-strong flex items-center justify-center transition-all shadow-2xs cursor-pointer"
                          title={hasRecordedAudio ? "Nghe lại giọng ghi âm của bạn" : "Bấm để ghi âm câu này"}
                          aria-label={hasRecordedAudio ? 'Nghe lại bản thu' : 'Ghi âm câu này'}
                        >
                          <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                            <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                          </svg>
                        </button>}

                        {/* 2. Nghe mẫu */}
                        <button
                          type="button"
                          onClick={() => playAudio(s.nativeAudioUrl, s.japaneseText, undefined, undefined, s.id)}
                          disabled={loadingAudioSentenceId === s.id}
                          className="h-7 px-3.5 rounded-full bg-paper-50 hover:bg-ai-soft text-sumi border border-line font-bold text-xs flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer disabled:opacity-60"
                          title="Nghe phát âm chuẩn câu này"
                        >
                          {loadingAudioSentenceId === s.id ? (
                            <>
                              <span className="w-2.5 h-2.5 border-2 border-ai border-t-transparent rounded-full animate-spin"></span>
                              <span>Đang nạp...</span>
                            </>
                          ) : (
                            <>
                              <svg className="w-3.5 h-3.5 text-ai fill-current" viewBox="0 0 24 24">
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
                          className="h-7 px-3 rounded-full bg-paper-50 hover:bg-ai-soft text-sumi-muted border border-line text-xs font-bold flex items-center gap-1 transition-all shadow-2xs cursor-pointer"
                          title="Xem bản dịch tiếng Việt"
                        >
                          <span>文A Dịch</span>
                        </button>
                      </div>
                    </div>
                  );
                }
              })}
            </div>

            {/* ACTION CONSOLE (Recording & Evaluation) (Hình 4) - Cố định vị trí ở đáy */}
            {/* Cao tối đa 70% cột để khung hội thoại luôn còn chỗ; nhận xét dài thì cuộn bên trong */}
            <div className="jx-practice-composer w-full flex-shrink-0 pt-2 pb-1 z-10 lg:max-h-[70%] lg:overflow-y-auto">
              <div
                className="w-full rounded-[24px] border-2 border-dashed bg-paper-50 backdrop-blur-xs py-3.5 px-6 flex flex-col items-center justify-center shadow-xs transition-all"
                style={{ borderColor: 'rgb(147, 197, 253)' }}
              >
                {micError && (
                  <div className="w-full mb-3 p-2 bg-danger-soft border border-danger-soft rounded-xl text-danger text-xs flex items-center justify-between">
                    <span>⚠️ {micError}</span>
                    <button onClick={() => setMicError(null)} className="font-bold text-danger">×</button>
                  </div>
                )}
                {micNotice && (
                  <div role="status" className="w-full mb-3 p-2 bg-warning-soft rounded-xl text-warning text-xs flex items-center justify-between gap-2">
                    <span>{micNotice}</span>
                    <button onClick={() => setMicNotice(null)} aria-label="Đóng thông báo" className="font-bold text-warning">×</button>
                  </div>
                )}
                {progressSyncError && (
                  <div role="status" className="w-full mb-3 p-2 bg-warning-soft rounded-xl text-warning text-xs flex items-center justify-between gap-2">
                    <span>{progressSyncError}</span>
                    <button onClick={() => setProgressSyncError(null)} aria-label="Đóng thông báo" className="font-bold text-warning">×</button>
                  </div>
                )}

                {/* CHỈ THU ÂM CÂU CỦA NGƯỜI HỌC (userRole) - KHÔNG THU ÂM CÂU CỦA ĐỐI PHƯƠNG */}
                {currentSentence?.speakerRole !== userRole ? (
                  isOpponentPausedForResume ? (
                    <div className="w-full flex flex-col items-center justify-center py-2 px-4 gap-2.5 animate-in fade-in">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-ai-soft border border-line-strong overflow-hidden flex items-center justify-center font-bold text-base shadow-sm">
                          <DefaultAvatarImage alt={opponentName} className="w-full h-full object-cover" />
                        </div>
                        <div className="text-left">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-sumi">{opponentName} (Đối phương)</span>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-warning-soft text-warning border border-warning-soft">
                              Tạm dừng (Tiếp tục học)
                            </span>
                          </div>
                          <p className="text-xs font-semibold text-sumi font-jp mt-0.5 line-clamp-1">
                            "{currentSentence?.japaneseText}"
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 my-1">
                        <button
                          type="button"
                          onClick={handlePlayResumedOpponentSentence}
                          className="text-xs font-bold text-white bg-ai hover:bg-ai-hover px-5 py-2 rounded-full transition-all cursor-pointer shadow-sm flex items-center gap-1.5"
                        >
                          <span>Nghe câu đối thoại</span>
                        </button>
                        {hasNextLearnerSentence && (
                          <button
                            type="button"
                            onClick={handleSkipOpponentSpeech}
                            className="text-xs font-bold text-sumi bg-paper-100 hover:bg-paper-200 px-4 py-2 rounded-full transition-all cursor-pointer"
                          >
                            <span>Sang lượt nói của bạn</span>
                          </button>
                        )}
                      </div>
                      <p className="text-[11px] text-sumi-muted">
                        {hasNextLearnerSentence
                          ? '* Bấm để nghe câu thoại mẫu của đối phương trước khi chuyển sang lượt nói của bạn.'
                          : '* Bấm để nghe câu đối thoại kết thúc của đối phương.'}
                      </p>
                    </div>
                  ) : (
                    <div className="w-full flex flex-col items-center justify-center py-2 px-4 gap-2.5 animate-in fade-in">
                      {/* Audio wave indicator */}
                      <div className="flex items-center gap-1 my-0.5">
                        <span className="w-1 h-2.5 bg-ai rounded-full animate-bounce"></span>
                        <span className="w-1 h-4 bg-ai rounded-full animate-bounce [animation-delay:0.1s]"></span>
                        <span className="w-1 h-5 bg-ai rounded-full animate-bounce [animation-delay:0.2s]"></span>
                        <span className="w-1 h-3.5 bg-ai rounded-full animate-bounce [animation-delay:0.3s]"></span>
                        <span className="w-1 h-2 bg-ai rounded-full animate-bounce [animation-delay:0.4s]"></span>
                      </div>
                      {hasNextLearnerSentence && (
                        <button
                          onClick={handleSkipOpponentSpeech}
                          className="text-xs font-bold text-white bg-ai hover:bg-ai-hover px-5 py-1.5 rounded-full transition-all cursor-pointer shadow-sm flex items-center gap-1.5"
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
                      <div className="flex flex-col items-center justify-center w-full py-1 gap-1.5">
                        {hasMicrophone === false && (
                          <p role="status" className="text-xs text-warning bg-warning-soft rounded-xl px-3 py-1.5 text-center">
                            {describeDeviceStatus('audioinput', 'NOT_FOUND')}
                          </p>
                        )}
                        <button
                          onClick={startRecording}
                          disabled={hasMicrophone === false}
                          className="group bg-gradient-to-r from-ai to-ai-hover hover:from-ai-hover hover:to-sumi text-white w-14 h-14 rounded-full font-bold shadow-lg shadow-blue-500/30 flex items-center justify-center transition-all transform hover:scale-105 active:scale-95 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
                          title={
                            hasMicrophone === false
                              ? describeDeviceStatus('audioinput', 'NOT_FOUND')
                              : 'Bấm để ghi âm câu thoại của bạn'
                          }
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
                        <RecordingBar onCancel={cancelRecording} onStop={finishRecording} />
                      </div>
                    )}

                    {/* LƯỢT CỦA BẠN - Đã thu, chưa gửi: nghe lại / thu lại / bỏ / gửi chấm */}
                    {practiceState === 'recorded' && (
                      <RecordingReviewBar
                        isPlaying={playingUserAudioSentenceId === -1}
                        onPlay={() => {
                          if (playingUserAudioSentenceId === -1) {
                            userAudioPlayerRef.current?.pause();
                            setPlayingUserAudioSentenceId(null);
                          } else {
                            playPendingTake();
                          }
                        }}
                        onReRecord={startRecording}
                        onSubmit={submitPendingTake}
                        onDiscard={discardRecordedTake}
                        error={submitError}
                      />
                    )}

                    {/* LƯỢT CỦA BẠN - State B: Analyzing / Processing (Đang phân tích bản ghi) */}
                    {practiceState === 'analyzing' && (
                      <div className="w-full flex items-center justify-center gap-3 py-6 bg-paper-50 rounded-2xl border border-line shadow-2xs text-sumi font-bold text-sm animate-pulse">
                        <div className="w-5 h-5 border-2 border-ai border-t-transparent rounded-full animate-spin"></div>
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
                        dimensions={currentDimensions}
                        overallScoreBasis={currentScoreBasis}
                        onPlayUserAudio={() => playUserRecording(currentSentence.id)}
                        onRetry={handleRetryCurrentSentence}
                        onNext={handleNextSentence}
                        extraAction={
                          // Chỉ chế độ phát triển: tải bản ghi để đo nhận dạng bằng giọng thật
                          import.meta.env.DEV ? (
                            <RecordingDevTools take={devTake && devTake.sentenceId === currentSentence.id ? devTake : null} />
                          ) : undefined
                        }
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
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[color-mix(in_srgb,var(--sumi)_50%,transparent)] backdrop-blur-xs transition-all duration-200"
          onClick={() => setIsFullScriptModalOpen(false)}
        >
          <div
            className="bg-paper-50 rounded-[28px] max-w-2xl w-full max-h-[88vh] shadow-2xl border border-line flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-5 border-b border-line bg-paper-100 flex items-center justify-between">
              <h3 className="font-extrabold text-sumi text-lg">
                Toàn bộ kịch bản hội thoại
              </h3>
              <button
                onClick={() => setIsFullScriptModalOpen(false)}
                className="w-8 h-8 rounded-full bg-paper-50 hover:bg-danger-soft text-sumi-muted hover:text-danger border border-line flex items-center justify-center font-bold text-sm transition-colors shadow-2xs cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 flex-1 text-sm bg-paper-50">
              <div className="space-y-3.5">
                {sentences.map(s => (
                  <div
                    key={s.id}
                    className={`flex items-start gap-2.5 ${s.speakerRole === userRole ? 'justify-end' : 'justify-start'}`}
                  >
                    {s.speakerRole !== userRole && (
                      <div className="w-8 h-8 rounded-full bg-ai-soft overflow-hidden flex-shrink-0 mt-1">
                        <DefaultAvatarImage alt="Opponent" className="w-full h-full object-cover" />
                      </div>
                    )}

                    <div className={`flex flex-col max-w-[80%] ${s.speakerRole === userRole ? 'items-end' : 'items-start'}`}>
                      <div className="flex items-center gap-1.5 mb-1">
                        <button
                          onClick={() => playAudio(s.nativeAudioUrl, s.japaneseText)}
                          className="bg-paper-50 hover:bg-ai-soft text-ai border border-line-strong text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-2xs cursor-pointer"
                        >
                          <span>🔊</span> Nghe
                        </button>
                        <span className="text-[10px] text-sumi-muted">Câu #{s.orderIndex}</span>
                        <span className="font-bold text-xs text-sumi">
                          {displayRoleName(s.speakerRole === 'A' ? dialogue.speakerRoleA_Name : dialogue.speakerRoleB_Name)}
                        </span>
                      </div>

                      <div
                        className={`p-3 rounded-2xl border text-sm ${
                          s.speakerRole === userRole
                            ? 'bg-ai-soft border-line-strong text-right'
                            : 'bg-paper-100 border-line text-left'
                        }`}
                      >
                        <p className="font-semibold text-sumi leading-relaxed">{s.japaneseText}</p>
                        <p className="text-xs text-sumi-muted mt-1 italic">"{s.vietnameseTranslation}"</p>
                      </div>
                    </div>

                    {s.speakerRole === userRole && (
                      <div className="w-8 h-8 rounded-full border border-line overflow-hidden flex-shrink-0 mt-1">
                        <DefaultAvatarImage alt="Learner" className="w-full h-full object-cover" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="p-4 border-t border-line bg-paper-100 flex justify-end">
              <button
                onClick={() => setIsFullScriptModalOpen(false)}
                className="px-6 py-2 rounded-full bg-ai text-white text-xs font-bold hover:bg-ai-hover cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Tổng kết buổi luyện (chỉ số liệu thật do backend chấm) */}
      {isCompletedModalOpen && (
        <div className="fixed inset-0 bg-[color-mix(in_srgb,var(--sumi)_50%,transparent)] backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="completed-modal-title" className="bg-paper-50 rounded-[28px] max-w-3xl w-full shadow-2xl border border-line max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95 duration-200 overflow-hidden">
            {/* Nội dung cuộn (trục cuộn duy nhất của modal) */}
            <div className="flex-1 overflow-y-auto p-5 sm:p-7 space-y-6">
              {/* 1. Tiêu đề: chỉ chúc mừng khi thật sự có câu được chấm */}
              <div className="text-center">
                <h3 id="completed-modal-title" className="text-xl sm:text-2xl font-black text-sumi tracking-tight">
                  {hasScoredSentence ? 'Hoàn thành bài luyện!' : 'Buổi luyện đã kết thúc'}
                </h3>
                <p className="text-sm text-sumi-muted font-medium mt-1">
                  {dialogue.title} · JLPT {dialogue.jlptLevel} · Vai {userRole} ({learnerName})
                </p>
                <div role="status" className="min-h-[18px] mt-1">
                  {historySaveState === 'saving' && (
                    <p className="text-xs text-sumi-muted">Đang lưu buổi luyện vào lịch sử...</p>
                  )}
                  {historySaveState === 'saved' && (
                    <p className="text-xs text-success font-semibold">Đã lưu buổi luyện vào lịch sử.</p>
                  )}
                  {historySaveState === 'failed' && (
                    <p className="text-xs text-danger font-semibold">{historySaveMessage}</p>
                  )}
                </div>
              </div>

              {/* 2. Tổng kết: số liệu thật từ kết quả backend đã chấm */}
              {hasScoredSentence ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className={`col-span-2 sm:col-span-1 rounded-2xl p-4 flex flex-col items-center justify-center text-white ${
                    finalWeightedScore >= 80
                      ? 'bg-gradient-to-br from-ai to-ai-hover'
                      : finalWeightedScore >= 65
                      ? 'bg-gradient-to-br from-score-mid to-score-mid'
                      : 'bg-gradient-to-br from-score-low to-score-low'
                  }`}>
                    <span className="text-4xl font-black leading-none">{finalWeightedScore}</span>
                    <span className="text-[11px] font-bold opacity-90 mt-1">/ 100 điểm</span>
                    <span className="text-xs font-bold mt-2 text-center">{sessionRankTitle(finalWeightedScore)}</span>
                  </div>

                  <div className="rounded-2xl border border-line bg-paper-100 p-4">
                    <p className="text-xs font-semibold text-sumi-muted">Câu đã chấm</p>
                    <p className="text-2xl font-black text-sumi mt-1">
                      {practicedSentencesCount}<span className="text-base text-sumi-faint font-bold">/{totalLearnerSentencesCount}</span>
                    </p>
                    <ul className="mt-2 space-y-0.5 text-xs text-sumi-muted">
                      <li className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-score-good" aria-hidden="true" />{finalGreenCount} khớp tốt</li>
                      <li className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-warning" aria-hidden="true" />{finalYellowCount} khớp một phần</li>
                      <li className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-score-low" aria-hidden="true" />{finalRedCount} cần luyện lại</li>
                    </ul>
                  </div>

                  <div className="rounded-2xl border border-line bg-paper-100 p-4">
                    <p className="text-xs font-semibold text-sumi-muted">Độ khớp nội dung</p>
                    <p className="text-2xl font-black text-ai mt-1">{finalContentMatchScore}%</p>
                    <div className="w-full bg-paper-200 h-1.5 rounded-full overflow-hidden mt-3" aria-hidden="true">
                      <div className="bg-ai h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, finalContentMatchScore))}%` }} />
                    </div>
                    <p className="text-[11px] text-sumi-faint mt-2 leading-snug">Tính trên tất cả câu của vai bạn, câu chưa chấm tính 0.</p>
                  </div>

                  <div className="rounded-2xl border border-line bg-paper-100 p-4">
                    <p className="text-xs font-semibold text-sumi-muted">Thời gian luyện</p>
                    <p className="text-2xl font-black text-sumi mt-1">
                      {Math.floor(sessionDurationSeconds / 60)}:{String(sessionDurationSeconds % 60).padStart(2, '0')}
                    </p>
                    <p className="text-[11px] text-sumi-faint mt-2">phút : giây</p>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-line-strong bg-paper-100 p-5 text-center">
                  <p className="font-bold text-sumi">Chưa có câu nào được chấm điểm</p>
                  <p className="text-sm text-sumi-muted mt-1">
                    Bấm <strong>Luyện lại bài này</strong>, ghi âm từng câu của vai bạn rồi gửi để nhận điểm và lưu vào lịch sử.
                  </p>
                </div>
              )}

              {serverSummary && (
                <SessionSummaryPanel summary={serverSummary} sessionId={completedSessionId} />
              )}

              {finalGateStatus === 'needs_retry' && (
                <div className="flex items-start gap-2 rounded-xl border border-warning-soft bg-warning-soft p-3 text-xs text-warning">
                  <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span>Tín hiệu micro hơi nhỏ hoặc có tạp âm ở một số câu. Dùng tai nghe có micro sẽ cho kết quả ổn định hơn.</span>
                </div>
              )}

              {/* 3. Chi tiết từng câu của vai người học */}
              <section aria-labelledby="completed-sentences-title" className="space-y-3">
                <h4 id="completed-sentences-title" className="font-bold text-sumi text-sm">Chi tiết từng câu</h4>

                <ol className="space-y-3">
                  {learnerSentences.map((s, index) => {
                    const res = sentenceResults.get(s.id);
                    // Điểm và tier do backend tính; không tái tạo ở client.
                    const tier = res?.evaluationTier;
                    const hasUserRecording = recordedAudioUrls.has(s.id);
                    const isPlayingUser = playingUserAudioSentenceId === s.id;
                    const isPlayingNative = isPlayingAudio && loadingAudioSentenceId === s.id;
                    const attempts = res?.attemptsCount ?? sentenceAttemptsMap.get(s.id) ?? 0;
                    const isOpen = openSentenceIds.has(s.id);
                    const detailId = `sentence-detail-${s.id}`;

                    return (
                      <li key={s.id} className="p-4 rounded-xl bg-paper-50 border border-line">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          {/* Bấm cả dòng để mở/thu gọn chi tiết câu */}
                          <button
                            type="button"
                            onClick={() => toggleSentenceDetail(s.id)}
                            aria-expanded={isOpen}
                            aria-controls={detailId}
                            className="flex min-w-0 flex-1 items-center gap-2 rounded-lg text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ai"
                          >
                            <JIcon name="expand_more" size={20} className={`jc-chev flex-shrink-0 text-sumi-muted ${isOpen ? 'is-open' : ''}`} />
                            <span className="text-xs font-bold text-sumi-muted flex-shrink-0">Câu {index + 1}/{totalLearnerSentencesCount}</span>
                            <span
                              className={`text-xs font-bold px-2 py-0.5 rounded-full border ${
                                !res
                                  ? 'bg-paper-100 text-sumi-muted border-line'
                                  : tier === 'green'
                                  ? 'bg-score-good-soft text-score-good border-score-good-soft'
                                  : tier === 'yellow'
                                  ? 'bg-warning-soft text-warning border-warning-soft'
                                  : 'bg-score-low-soft text-score-low border-score-low-soft'
                              }`}
                            >
                              {res ? `${res.overallScore} điểm` : 'Chưa chấm'}
                            </span>
                            {attempts > 1 && <span className="text-xs text-sumi-faint flex-shrink-0">thử {attempts} lần</span>}
                            <span className="min-w-0 truncate font-jp text-sm text-sumi">{s.japaneseText}</span>
                          </button>

                          <div className="flex items-center gap-2">
                            {hasUserRecording && (
                              <button
                                type="button"
                                onClick={() => playUserRecording(s.id)}
                                className={`h-8 px-3 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                                  isPlayingUser
                                    ? 'bg-ai text-white'
                                    : 'bg-ai-soft hover:bg-ai-soft text-ai border border-line-strong'
                                }`}
                              >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 100-6 3 3 0 000 6z" />
                                </svg>
                                <span>{isPlayingUser ? 'Đang phát...' : 'Nghe bạn'}</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => playAudio(s.nativeAudioUrl, s.japaneseText, undefined, undefined, s.id)}
                              className={`h-8 px-3 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                                isPlayingNative
                                  ? 'bg-sumi text-white'
                                  : 'bg-paper-50 hover:bg-paper-100 text-sumi border border-line'
                              }`}
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                              </svg>
                              <span>{isPlayingNative ? 'Đang phát...' : 'Nghe mẫu'}</span>
                            </button>
                          </div>
                        </div>

                        <div
                          id={detailId}
                          className={`jc-collapse ${isOpen ? 'is-open' : ''}`}
                          style={{ '--collapse-gap': '0px' } as React.CSSProperties}
                          inert={!isOpen}
                        >
                          <div className="jc-collapse__in">
                            <div className="space-y-2.5 pt-3">
                              <div className="bg-paper-100 p-3 rounded-lg border border-line">
                                <JapaneseSentenceDiffView
                                  diffTokens={res?.diffTokens}
                                  targetText={s.japaneseText}
                                  spokenText={res?.recognizedText}
                                  size="sm"
                                />
                              </div>

                              <div className="space-y-0.5 text-xs">
                                {s.romajiText && <p className="text-sumi-faint font-mono">{s.romajiText}</p>}
                                {s.vietnameseTranslation && <p className="text-sumi-muted">{s.vietnameseTranslation}</p>}
                              </div>
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </section>
            </div>

          {/* Sticky / Pinned Footer Bar (Luôn hiển thị cố định ở chân modal) */}
          <div className="p-4 sm:px-7 bg-paper-50 backdrop-blur-md border-t border-line flex flex-col sm:flex-row items-center justify-between gap-3 flex-shrink-0">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                onClick={() => {
                  handleConfirmRoleChange(userRoleRef.current);
                }}
                className="flex-1 sm:flex-initial text-xs font-bold text-sumi-muted hover:text-sumi bg-paper-100 hover:bg-ai-soft border border-line px-4 py-2.5 rounded-xl transition-all cursor-pointer"
              >
                Luyện lại bài này
              </button>
              <button
                onClick={() => {
                  stopAllAudio();
                  setIsCompletedModalOpen(false);
                  setIsRoleModalOpen(true);
                }}
                className="flex-1 sm:flex-initial text-xs font-bold text-ai bg-ai-soft hover:bg-ai-soft border border-line-strong px-4 py-2.5 rounded-xl transition-all cursor-pointer"
              >
                Đổi sang vai ({opponentRole})
              </button>
            </div>
            <button
              onClick={handleBackToDialogueList}
              className="w-full sm:w-auto text-xs font-extrabold text-white bg-ai hover:bg-ai-hover px-6 py-2.5 rounded-xl shadow-xs transition-all cursor-pointer"
            >
              Xong
            </button>
          </div>
        </div>
      </div>
    )}

      {mobile && confirmFinish && practiceState !== 'completed' && (
        <PracticeConfirmation
          title="Kết thúc bài Shadowing?"
          description="Bạn sẽ rời phần luyện và xem tổng kết các câu đã hoàn thành."
          confirmLabel="Kết thúc bài luyện"
          onCancel={() => setConfirmFinish(false)}
          onConfirm={() => {
            setConfirmFinish(false);
            void handleFinishDialogue();
          }}
        />
      )}

      <RoleSelectionModal
        isOpen={isRoleModalOpen}
        onClose={() => setIsRoleModalOpen(false)}
        dialogueId={dialogue.id}
        dialogueTitle={dialogue.title}
        roleAName={displayRoleName(dialogue.speakerRoleA_Name)}
        roleBName={displayRoleName(dialogue.speakerRoleB_Name)}
        currentRole={userRole}
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

