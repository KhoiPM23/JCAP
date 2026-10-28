import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { roleplayService } from '../services/roleplayService';
import { scenarioVoiceService } from '../services/scenarioVoiceService';
import { ukiyoSound } from '../utils/ukiyoSoundEngine';
import { useAuth } from '../contexts/AuthContext';
import { RoleplayStageHeader } from '../components/roleplay/RoleplayStageHeader';
import { LivingAvatar, type AvatarState, type MouthViseme } from '../components/roleplay/LivingAvatar';
import { SumiBrushWaveform } from '../components/roleplay/SumiBrushWaveform';
import { GraduatedHintCard } from '../components/roleplay/GraduatedHintCard';
import { RoleplayConversationStream } from '../components/roleplay/RoleplayConversationStream';
import { EvaluationDrawer } from '../components/roleplay/EvaluationDrawer';
import { EkiStampOverlay } from '../components/roleplay/EkiStampOverlay';
import type {
  RoleplaySessionDetailsDto,
  RoleplayMessageDto,
  RoleplayHintDto,
} from '../types/roleplay';

export const RoleplayPracticeView: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { sessionId: rawSessionId } = useParams<{ sessionId: string }>();
  const sessionId = Number(rawSessionId);

  // Đường dẫn quay lại (ưu tiên ?return=/explore... nếu mở từ bản đồ)
  const returnUrl = searchParams.get('return') || '/scenarios';
  const isExploreMode = returnUrl.includes('/explore');

  // State Dữ liệu phiên
  const [session, setSession] = useState<RoleplaySessionDetailsDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Toggles hiển thị & Cài đặt hội thoại
  const [showFurigana, setShowFurigana] = useState(false);
  const [showVietnamese, setShowVietnamese] = useState(true);
  const [autoPlayTts, setAutoPlayTts] = useState(true);
  const [voiceSpeed, setVoiceSpeed] = useState(1.0);

  // Panels & Drawers
  const [isMissionsPanelOpen, setIsMissionsPanelOpen] = useState(true);
  const [isEvaluationDrawerOpen, setIsEvaluationDrawerOpen] = useState(false);
  const [selectedMessageId, setSelectedMessageId] = useState<number | null>(null);
  const [activeLeftTab, setActiveLeftTab] = useState<'missions' | 'phrases'>('missions');

  // Living Avatar & Audio Playback States
  const [avatarState, setAvatarState] = useState<AvatarState>('idle');
  const [mouthViseme, setMouthViseme] = useState<MouthViseme>('closed');
  const [isAizuchiActive, setIsAizuchiActive] = useState(false);
  const [playingMessageId, setPlayingMessageId] = useState<number | null>(null);

  // Input & Composer States
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [hint, setHint] = useState<RoleplayHintDto | null>(null);
  const [isLoadingHint, setIsLoadingHint] = useState(false);
  const [showStampCelebration, setShowStampCelebration] = useState(false);

  // Thu âm & Hands-free VAD Loop
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const [silenceProgress, setSilenceProgress] = useState(0); // 0.0 -> 1.0 (Silence Ring)
  const silenceTimerRef = useRef<number | null>(null);
  const recordingTimerRef = useRef<number | null>(null);
  const micStartedAtRef = useRef<number | null>(null);
  const aiFinishedSpeakingAtRef = useRef<number | null>(null);
  const recognitionRef = useRef<any>(null);

  // 1. Tải chi tiết phiên hội thoại
  useEffect(() => {
    let isMounted = true;
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
        // Chọn tin nhắn User mới nhất có nhận xét
        const lastUser = [...res.data.messages].reverse().find((m) => m.sender === 'User' && m.linguisticFeedback);
        if (lastUser) setSelectedMessageId(lastUser.id);

        // Tự phát câu mở đầu của AI nếu chưa có tin nhắn nào từ người học
        const hasUserMsg = res.data.messages.some((m) => m.sender === 'User');
        const opening = res.data.messages.find((m) => m.sender === 'Ai');
        if (!hasUserMsg && opening && autoPlayTts) {
          handlePlayAiVoice(opening);
        }
      } else {
        setLoadError(res.message || 'Không thể tải dữ liệu phiên luyện tập.');
      }
      setIsLoading(false);
    };

    void fetchSession();
    return () => {
      isMounted = false;
      scenarioVoiceService.stopAllAudio();
    };
  }, [sessionId]);

  // 2. Phát âm thanh AI (Mora-synced visemes)
  const handlePlayAiVoice = (msg: RoleplayMessageDto) => {
    scenarioVoiceService.stopAllAudio();
    stopRecording();

    setPlayingMessageId(msg.id);
    setAvatarState('speaking');

    // Giả lập chu kỳ viseme phát âm theo mora
    const visemes: MouthViseme[] = ['A', 'I', 'U', 'E', 'O', 'closed'];
    let vIdx = 0;
    const visemeInterval = setInterval(() => {
      setMouthViseme(visemes[vIdx % visemes.length]);
      vIdx++;
    }, 110);

    const voiceId = session?.recommendedAiVoiceId || 3;
    void scenarioVoiceService.playAiSpeech(
      msg.japaneseText,
      voiceId,
      () => {
        clearInterval(visemeInterval);
        setMouthViseme('closed');
        setAvatarState('idle');
        setPlayingMessageId(null);
        aiFinishedSpeakingAtRef.current = Date.now();
      },
      voiceSpeed
    );
  };

  // 3. Gửi tin nhắn học viên
  const handleSendMessage = async (textToSend?: string) => {
    stopRecording();
    const text = (textToSend || inputText).trim();
    if (!text || isSending || !session) return;

    const currentSessionId = session.sessionId || session.id || sessionId;
    const tempId = Date.now();

    // Optimistic UI update
    const optimisticMsg: RoleplayMessageDto = {
      id: tempId,
      sender: 'User',
      japaneseText: text,
      createdAt: new Date().toISOString(),
    };

    setSession((prev) => (prev ? { ...prev, messages: [...prev.messages, optimisticMsg] } : null));
    setIsSending(true);
    setInputText('');
    setHint(null);
    setAvatarState('thinking');

    const now = Date.now();
    let responseLatencySeconds = 2.0;
    if (aiFinishedSpeakingAtRef.current) {
      responseLatencySeconds = Math.max(0.5, (now - aiFinishedSpeakingAtRef.current) / 1000);
    }

    const res = await roleplayService.sendMessage(currentSessionId, text, {
      responseLatencySeconds,
      speakingDurationSeconds: recordingDuration > 0 ? recordingDuration : undefined,
    });

    if (res.success && res.data) {
      const turn = res.data;
      setSession((prev) => {
        if (!prev) return null;
        const filtered = prev.messages.filter((m) => m.id !== tempId);
        return {
          ...prev,
          messages: [...filtered, turn.userMessage, turn.aiMessage],
          missions: turn.updatedMissions,
          isNaturallyConcluded: turn.isNaturallyConcluded,
          creditBalance: turn.creditBalance ?? prev.creditBalance,
        };
      });

      if (turn.userMessage?.linguisticFeedback) {
        setSelectedMessageId(turn.userMessage.id);
      }

      // Micro-celebration khi hoàn thành nhiệm vụ
      if (turn.newlyCompletedMissionIds && turn.newlyCompletedMissionIds.length > 0) {
        ukiyoSound.playMigotoChime();
        setAvatarState('cheering');
        setTimeout(() => setAvatarState('idle'), 2200);
      }

      // Kiểm tra hoàn thành toàn bộ kịch bản
      const allDone = turn.updatedMissions.length > 0 && turn.updatedMissions.every((m) => m.isCompleted);
      if (allDone || turn.isNaturallyConcluded) {
        setShowStampCelebration(true);
      } else if (autoPlayTts && turn.aiMessage?.japaneseText) {
        handlePlayAiVoice(turn.aiMessage);
      } else {
        setAvatarState('idle');
      }
    } else {
      // Revert optimistic message
      setSession((prev) => (prev ? { ...prev, messages: prev.messages.filter((m) => m.id !== tempId) } : null));
      setInputText(text);
      setAvatarState('idle');
      alert(res.message || 'Gửi tin nhắn thất bại. Vui lòng thử lại.');
    }

    setIsSending(false);
  };

  // 4. Bắt đầu thu âm giọng nói (kèm Hands-free VAD)
  const startRecording = async () => {
    scenarioVoiceService.stopAllAudio();
    ukiyoSound.playWoodblockSnap();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setMediaStream(stream);
      setIsRecording(true);
      setRecordingDuration(0);
      setSilenceProgress(0);
      setAvatarState('listening');
      micStartedAtRef.current = Date.now();

      recordingTimerRef.current = window.setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);

      // Kích hoạt nhận diện tiếng Nhật trực tiếp
      const recognition = scenarioVoiceService.createSpeechRecognition({
        onResult: (transcript: string, isFinal: boolean) => {
          setInputText(transcript);
          // Aizuchi gật đầu khi nghe từ
          setIsAizuchiActive(true);
          setTimeout(() => setIsAizuchiActive(false), 800);

          // Reset Silence Ring
          if (silenceTimerRef.current) clearInterval(silenceTimerRef.current);
          setSilenceProgress(0);

          // Nếu có âm ngưng > 850ms, đếm ngược vòng im lặng để tự động gửi
          let count = 0;
          silenceTimerRef.current = window.setInterval(() => {
            count += 0.1;
            setSilenceProgress(Math.min(1.0, count / 0.85));
            if (count >= 0.85) {
              if (silenceTimerRef.current) clearInterval(silenceTimerRef.current);
              void handleSendMessage(transcript);
            }
          }, 100);
        },
        onError: () => stopRecording(),
        onEnd: () => {},
      });

      if (recognition) {
        recognitionRef.current = recognition;
        try {
          recognition.start();
        } catch {}
      }
    } catch {
      alert('Không thể truy cập microphone. Vui lòng cấp quyền trong trình duyệt.');
      stopRecording();
    }
  };

  const stopRecording = () => {
    setIsRecording(false);
    setAvatarState('idle');
    setSilenceProgress(0);
    if (silenceTimerRef.current) clearInterval(silenceTimerRef.current);
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);

    if (mediaStream) {
      mediaStream.getTracks().forEach((t) => t.stop());
      setMediaStream(null);
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {}
      recognitionRef.current = null;
    }
  };

  // 5. Xin gợi ý (Hint)
  const handleToggleHint = async () => {
    if (hint) {
      setHint(null);
      return;
    }
    ukiyoSound.playPaperRustle();
    setIsLoadingHint(true);
    const currentSessionId = session?.sessionId || session?.id || sessionId;
    const res = await roleplayService.getHint(currentSessionId);
    if (res.success && res.data) {
      setHint(res.data);
    }
    setIsLoadingHint(false);
  };

  // 6. Kết thúc phiên hội thoại
  const handleEndEarly = async () => {
    if (window.confirm('Bạn có chắc muốn kết thúc sớm phiên luyện tập này?')) {
      const currentSessionId = session?.sessionId || session?.id || sessionId;
      await roleplayService.endSession(currentSessionId);
      setShowStampCelebration(true);
    }
  };

  const completedMissionsCount = useMemo(
    () => session?.missions.filter((m) => m.isCompleted).length ?? 0,
    [session?.missions]
  );
  const totalMissionsCount = session?.missions.length ?? 0;

  const selectedMessage = useMemo(() => {
    if (!session || !selectedMessageId) return null;
    return session.messages.find((m) => m.id === selectedMessageId && m.sender === 'User') ?? null;
  }, [session, selectedMessageId]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[var(--paper-100)] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-[var(--ai)]/30 border-t-[var(--ai)] rounded-full animate-spin" />
          <p className="text-xs font-bold text-[var(--sumi-muted)]">Đang vào phòng luyện hội thoại...</p>
        </div>
      </div>
    );
  }

  if (loadError || !session) {
    return (
      <div className="min-h-screen bg-[var(--paper-100)] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white p-6 rounded-3xl border border-[var(--line)] shadow-lg text-center space-y-4">
          <span className="material-symbols-outlined text-4xl text-rose-500">error</span>
          <h3 className="font-bold text-base text-[var(--sumi)]">Không thể mở phòng luyện</h3>
          <p className="text-xs text-[var(--sumi-muted)]">{loadError || 'Đã có lỗi xảy ra.'}</p>
          <button
            type="button"
            onClick={() => navigate(returnUrl)}
            className="w-full py-2.5 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition"
          >
            Quay lại
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      data-theme="phong-luyen"
      className="fixed inset-0 overflow-hidden flex flex-col bg-[var(--paper-50)] text-[var(--sumi)] font-sans"
    >
      {/* 1. Thanh Header Ukiyo-e */}
      <RoleplayStageHeader
        scenarioTitle={session.scenarioTitle}
        jlptLevel={session.jlptLevel || session.level || 'N5'}
        completedMissionsCount={completedMissionsCount}
        totalMissionsCount={totalMissionsCount}
        creditBalance={session.creditBalance ?? 50}
        showFurigana={showFurigana}
        onToggleFurigana={setShowFurigana}
        showVietnamese={showVietnamese}
        onToggleVietnamese={setShowVietnamese}
        autoPlayTts={autoPlayTts}
        onToggleAutoPlayTts={setAutoPlayTts}
        voiceSpeed={voiceSpeed}
        onChangeVoiceSpeed={setVoiceSpeed}
        isMissionsPanelOpen={isMissionsPanelOpen}
        onToggleMissionsPanel={() => setIsMissionsPanelOpen(!isMissionsPanelOpen)}
        isEvaluationDrawerOpen={isEvaluationDrawerOpen}
        onToggleEvaluationDrawer={() => setIsEvaluationDrawerOpen(!isEvaluationDrawerOpen)}
        onEndEarly={handleEndEarly}
        onExit={() => navigate(returnUrl)}
      />

      {/* 2. Thân phòng luyện tập (Layout 2 Cột hoặc 3 Cột) */}
      <div className="flex-1 flex overflow-hidden">
        {/* Cột Trái: Nhân vật AI & Nhiệm vụ (320px) */}
        {isMissionsPanelOpen && (
          <aside className="w-80 border-r border-[var(--line)] bg-[var(--paper-100)] flex flex-col select-none overflow-hidden hidden md:flex">
            {/* Thẻ Persona & Living Avatar */}
            <div className="p-5 border-b border-[var(--line)] flex flex-col items-center text-center bg-white/70">
              <LivingAvatar
                avatarState={avatarState}
                personaName={session.aiPersona || 'Nhân viên phục vụ'}
                personaRole="Hội thoại tương tác giọng nói"
                currentViseme={mouthViseme}
                isAizuchiActive={isAizuchiActive}
                size="md"
              />

              {/* Thanh tiến độ nhiệm vụ */}
              <div className="w-full mt-4 pt-4 border-t border-[var(--line)]">
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="font-bold text-[var(--sumi-muted)]">Tiến độ</span>
                  <span className="font-mono font-bold text-[var(--ai)]">
                    {completedMissionsCount}/{totalMissionsCount} nhiệm vụ
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-[var(--paper-300)] overflow-hidden">
                  <div
                    className="h-full bg-[var(--ai)] transition-all duration-500 rounded-full"
                    style={{
                      width: `${totalMissionsCount > 0 ? (completedMissionsCount / totalMissionsCount) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Tabs: Nhiệm vụ / Mẫu câu */}
            <div className="flex border-b border-[var(--line)] bg-[var(--paper-200)] p-1 m-3 rounded-xl">
              <button
                type="button"
                onClick={() => {
                  ukiyoSound.playSubtleTap();
                  setActiveLeftTab('missions');
                }}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition ${
                  activeLeftTab === 'missions' ? 'bg-white text-[var(--sumi)] shadow-xs' : 'text-[var(--sumi-muted)]'
                }`}
              >
                Nhiệm vụ
              </button>
              <button
                type="button"
                onClick={() => {
                  ukiyoSound.playSubtleTap();
                  setActiveLeftTab('phrases');
                }}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition ${
                  activeLeftTab === 'phrases' ? 'bg-white text-[var(--sumi)] shadow-xs' : 'text-[var(--sumi-muted)]'
                }`}
              >
                Mẫu câu gợi nhớ
              </button>
            </div>

            {/* Nội dung Tab */}
            <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2.5">
              {activeLeftTab === 'missions' &&
                session.missions.map((m, idx) => (
                  <div
                    key={m.id || idx}
                    className={`p-3 rounded-2xl border transition ${
                      m.isCompleted
                        ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                        : 'bg-white border-[var(--line)] text-[var(--sumi)] shadow-xs'
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <span
                        className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5 ${
                          m.isCompleted ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {m.isCompleted ? '✓' : idx + 1}
                      </span>
                      <p className="text-xs font-medium leading-relaxed">{m.content}</p>
                    </div>
                  </div>
                ))}

              {activeLeftTab === 'phrases' && (
                <div className="space-y-2">
                  {(session.targetVocabularies || []).map((v, i) => (
                    <div key={i} className="p-3 bg-white rounded-xl border border-[var(--line)] shadow-xs">
                      <div className="flex items-center justify-between">
                        <strong className="text-sm font-sans text-[var(--sumi)]">{v.word}</strong>
                        <button
                          type="button"
                          onClick={() => scenarioVoiceService.playAiSpeech(v.word, 2)}
                          className="text-[var(--ai)] p-1 rounded-md hover:bg-[var(--ai-soft)]"
                          title="Nghe"
                        >
                          <span className="material-symbols-outlined text-sm">volume_up</span>
                        </button>
                      </div>
                      <span className="text-xs text-[var(--sumi-muted)] block mt-0.5">{v.meaning}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </aside>
        )}

        {/* Khu vực Trung tâm: Luồng Hội thoại & Ô Nhập liệu */}
        <main className="flex-1 flex flex-col overflow-hidden relative">
          {/* Luồng Tin nhắn */}
          <RoleplayConversationStream
            messages={session.messages}
            scenarioContext={session.scenarioContext}
            showFurigana={showFurigana}
            showVietnamese={showVietnamese}
            playingMessageId={playingMessageId}
            onPlayAudio={handlePlayAiVoice}
            selectedMessageId={selectedMessageId}
            onSelectUserMessage={(msg) => {
              setSelectedMessageId(msg.id);
              setIsEvaluationDrawerOpen(true);
            }}
            onRedoTurn={(msg) => {
              setInputText(msg.japaneseText);
            }}
            aiPersonaName={session.aiPersona}
          />

          {/* Hộp Gợi ý Đa cấp độ (Graduated Hint Card) */}
          {hint && (
            <div className="p-4 bg-white/95 border-t border-[var(--line)]">
              <GraduatedHintCard
                missionTitle={hint.contextExplanation || ''}
                fullJapaneseSample={hint.suggestedJapaneseText || hint.japaneseSuggestion || ''}
                vietnameseMeaning={hint.suggestedVietnameseMeaning || hint.vietnameseMeaning}
                onUseHint={(sentence) => {
                  setInputText(sentence);
                  setHint(null);
                }}
                onPlaySampleAudio={() => {
                  const s = hint.suggestedJapaneseText || hint.japaneseSuggestion || '';
                  if (s) scenarioVoiceService.playAiSpeech(s, 2);
                }}
                onClose={() => setHint(null)}
              />
            </div>
          )}

          {/* Thanh Soạn thảo & Ghi âm (Composer Bar) */}
          <div className="p-4 bg-white border-t border-[var(--line)] flex flex-col gap-2">
            {isRecording ? (
              <SumiBrushWaveform
                isRecording={isRecording}
                audioStream={mediaStream}
                silenceCountdownProgress={silenceProgress}
                durationSeconds={recordingDuration}
                onCancelRecording={stopRecording}
                onSubmitRecording={() => handleSendMessage()}
              />
            ) : (
              <div className="flex items-center gap-2">
                {/* Nút Bóng đèn Gợi ý */}
                <button
                  type="button"
                  onClick={handleToggleHint}
                  disabled={isLoadingHint}
                  className={`p-3 rounded-2xl border transition cursor-pointer flex items-center justify-center ${
                    hint
                      ? 'bg-amber-100 text-amber-900 border-amber-300'
                      : 'bg-[var(--paper-100)] text-[var(--sumi-muted)] border-[var(--line)] hover:bg-[var(--paper-200)]'
                  }`}
                  title="Gợi ý câu tiếp theo"
                >
                  <span className="material-symbols-outlined text-xl">lightbulb</span>
                </button>

                {/* Input Text Nhập Tiếng Nhật */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void handleSendMessage();
                  }}
                  className="flex-1 flex items-center bg-[var(--paper-100)] rounded-2xl border border-[var(--line)] px-4 py-1.5 focus-within:border-[var(--ai)] focus-within:ring-2 focus-within:ring-[var(--ai)]/20 transition"
                >
                  <input
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="Nhập câu tiếng Nhật hoặc bấm mic để nói..."
                    className="flex-1 bg-transparent text-sm text-[var(--sumi)] placeholder-slate-400 focus:outline-none"
                    disabled={isSending}
                  />

                  {inputText.trim() && (
                    <button
                      type="submit"
                      disabled={isSending}
                      className="ml-2 w-8 h-8 rounded-xl bg-[var(--ai)] hover:bg-[var(--ai-hover)] text-white flex items-center justify-center transition active:scale-95 cursor-pointer shadow-xs"
                    >
                      <span className="material-symbols-outlined text-base">arrow_upward</span>
                    </button>
                  )}
                </form>

                {/* Nút Mic Bắt đầu nói */}
                <button
                  type="button"
                  onClick={startRecording}
                  disabled={isSending}
                  className="w-12 h-12 rounded-2xl bg-[var(--shu)] hover:bg-[#a82e1a] text-white flex items-center justify-center shadow-md active:scale-95 transition cursor-pointer flex-shrink-0"
                  title="Bấm để nói bằng giọng"
                >
                  <span className="material-symbols-outlined text-2xl">mic</span>
                </button>
              </div>
            )}

            <div className="flex items-center justify-between text-[11px] text-[var(--sumi-muted)] px-1">
              <span>Bấm vào câu của bạn để xem nhận xét chi tiết và luyện lại.</span>
              <span className="hidden sm:inline">Hỗ trợ nhận diện giọng nói tiếng Nhật tự động</span>
            </div>
          </div>
        </main>

        {/* Cột Phải: Drawer Đánh giá Chi tiết (Slide in) */}
        <EvaluationDrawer
          isOpen={isEvaluationDrawerOpen}
          onClose={() => setIsEvaluationDrawerOpen(false)}
          selectedMessage={selectedMessage}
          onRedoTurn={(msg) => {
            setInputText(msg.japaneseText);
            setIsEvaluationDrawerOpen(false);
          }}
        />
      </div>

      {/* 3. Con dấu Eki-Stamp Chúc mừng (Hanko Slam Animation) */}
      <EkiStampOverlay
        isOpen={showStampCelebration}
        scenarioTitle={session.scenarioTitle}
        averageScore={88}
        completedMissionsCount={completedMissionsCount}
        totalMissionsCount={totalMissionsCount}
        onReviewSummary={() => {
          setShowStampCelebration(false);
          setIsEvaluationDrawerOpen(true);
        }}
        onRestart={() => window.location.reload()}
        onExit={() => navigate(returnUrl)}
        isExploreMode={isExploreMode}
      />
    </div>
  );
};
