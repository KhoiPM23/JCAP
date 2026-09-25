import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { roleplayService } from '../services/roleplayService';
import type {
  RoleplaySessionDetailsDto,
  RoleplayMessageDto,
  RoleplayMissionDto,
  RoleplayHintDto,
  LinguisticFeedbackDto,
} from '../types/roleplay';

export const RoleplayPracticeView: React.FC = () => {
  const navigate = useNavigate();
  const { sessionId: rawSessionId } = useParams<{ sessionId: string }>();
  const sessionId = Number(rawSessionId);

  // Dữ liệu chính của session
  const [session, setSession] = useState<RoleplaySessionDetailsDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Toggles hiển thị
  const [showTranslation, setShowTranslation] = useState(true);
  const [showFurigana, setShowFurigana] = useState(false); // Mặc định TẮT theo yêu cầu
  const [isLeftOpen, setIsLeftOpen] = useState(true); // Cột Trái (Nhiệm vụ & Cheat Sheet)
  const [isRightOpen, setIsRightOpen] = useState(false); // Cột Phải (Chi tiết Đánh giá)

  // Tin nhắn & Chat
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [selectedMessageId, setSelectedMessageId] = useState<number | null>(null);

  // Gợi ý Hint
  const [hint, setHint] = useState<RoleplayHintDto | null>(null);
  const [isLoadingHint, setIsLoadingHint] = useState(false);

  // Modal kết thúc
  const [showEndModal, setShowEndModal] = useState(false);
  const [isEnding, setIsEnding] = useState(false);

  // Toast mock Flashcard
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Tab Cheat Sheet (Từ vựng vs Ngữ pháp)
  const [cheatSheetTab, setCheatSheetTab] = useState<'vocab' | 'grammar'>('vocab');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Helper an toàn lấy trạng thái đánh giá (tránh crash khi trường status/quickStatus null/undefined)
  const getFeedbackStatus = (feedback?: LinguisticFeedbackDto | null) => {
    if (!feedback) return 'good';
    const s = feedback.quickStatus || feedback.status || 'good';
    return s.toLowerCase();
  };

  // 1. Tải chi tiết phiên
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
        // Tự động chọn tin nhắn học viên mới nhất có feedback (nếu có)
        const lastUserMsg = [...res.data.messages]
          .reverse()
          .find((m) => m.sender === 'User' && m.linguisticFeedback);
        if (lastUserMsg) {
          setSelectedMessageId(lastUserMsg.id);
        }
      } else {
        setLoadError(res.message || 'Không thể tải dữ liệu phiên luyện tập.');
      }

      setIsLoading(false);
    };

    void fetchSession();

    return () => {
      isMounted = false;
    };
  }, [sessionId]);

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

  // Lấy tin nhắn người dùng được chọn để hiển thị ở Cột Phải
  const selectedMessage = useMemo(() => {
    if (!session || !selectedMessageId) return null;
    return session.messages.find((m) => m.id === selectedMessageId && m.sender === 'User') ?? null;
  }, [session, selectedMessageId]);

  // 2. Gửi tin nhắn học viên
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = inputText.trim();
    if (!trimmed || isSending || !session) return;

    setIsSending(true);
    setInputText('');
    setHint(null); // Đóng hint nếu đang mở

    const currentSessionId = session.sessionId || session.id || sessionId;
    const res = await roleplayService.sendMessage(currentSessionId, trimmed);

    if (res.success && res.data) {
      const turn = res.data;
      setSession((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          messages: [...prev.messages, turn.userMessage, turn.aiMessage],
          missions: turn.updatedMissions,
          isNaturallyConcluded: turn.isNaturallyConcluded,
          creditBalance: turn.creditBalance ?? prev.creditBalance,
        };
      });

      // Ghi nhận ID tin nhắn mới (không tự động ép mở cột phải)
      if (turn.userMessage.linguisticFeedback) {
        setSelectedMessageId(turn.userMessage.id);
      }
    } else {
      alert(res.message || 'Gửi tin nhắn thất bại. Vui lòng thử lại.');
    }

    setIsSending(false);
    inputRef.current?.focus();
  };

  // 3. Xin gợi ý (Hint)
  const handleGetHint = async () => {
    if (!session || isLoadingHint) return;
    setIsLoadingHint(true);
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

    const currentSessionId = session.sessionId || session.id || sessionId;
    const res = await roleplayService.endSession(currentSessionId);
    if (res.success) {
      setShowEndModal(false);
      navigate(`/scenarios/${session.scenarioId}`);
    } else {
      alert(res.message || 'Không thể kết thúc phiên.');
      setIsEnding(false);
    }
  };

  // 6. Mock toast thêm vào Flashcard
  const handleAddToFlashcard = (text: string) => {
    setToastMessage(`Đã thêm cụm từ "${text}" vào Flashcard ôn tập!`);
    setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  };

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
    <div className="flex h-screen flex-col overflow-hidden bg-[#F4F9FE] text-[#071A44]">
      {/* Toast Notification (Flashcard mock) */}
      {toastMessage && (
        <div className="fixed top-20 right-6 z-50 flex items-center gap-2 rounded-xl bg-[#071A44] px-4 py-3 text-xs font-semibold text-white shadow-xl animate-fade-in">
          <span>⭐</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* TOP HEADER BAR */}
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-[#E6EDF5] bg-white px-4 md:px-6 shadow-sm z-20">
        {/* Left: Back button & Scenario title */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowEndModal(true)}
            className="inline-flex items-center gap-1 rounded-lg border border-[#E6EDF5] px-3 py-1.5 text-xs font-semibold text-[#71809A] transition hover:border-[#0878EE] hover:text-[#0878EE]"
            title="Thoát phòng luyện tập"
          >
            <span>←</span>
            <span className="hidden sm:inline">Rời phòng</span>
          </button>

          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-tr from-[#0878EE] to-[#4FA3FF] text-xs font-bold text-white shadow-sm">
              {session.aiPersona.slice(0, 1) || 'AI'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold leading-tight text-[#071A44] line-clamp-1">
                  {session.scenarioTitle}
                </h1>
                <span className="rounded-full bg-[#EAF4FF] px-2 py-0.5 text-[10px] font-bold text-[#0878EE]">
                  JLPT {session.level || session.jlptLevel}
                </span>
              </div>
              <p className="text-[11px] text-[#71809A]">
                Đối thoại cùng: <span className="font-semibold text-[#071A44]">{session.aiPersona}</span>
              </p>
            </div>
          </div>
        </div>

        {/* Center/Right: Toggles, Credits, End Action */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Toggles: Dịch & Furigana */}
          <div className="hidden lg:flex items-center gap-2 rounded-xl border border-[#E6EDF5] bg-[#F8FAFC] p-1 text-xs">
            <button
              type="button"
              onClick={() => setShowTranslation(!showTranslation)}
              className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                showTranslation ? 'bg-white text-[#0878EE] shadow-xs' : 'text-[#71809A]'
              }`}
            >
              Dịch: {showTranslation ? 'BẬT' : 'TẮT'}
            </button>
            <button
              type="button"
              onClick={() => setShowFurigana(!showFurigana)}
              className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                showFurigana ? 'bg-white text-[#0878EE] shadow-xs' : 'text-[#71809A]'
              }`}
            >
              Furigana: {showFurigana ? 'BẬT' : 'TẮT'}
            </button>
          </div>

          {/* Credit balance pill */}
          <Link
            to="/credits"
            className="flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700 transition hover:bg-amber-100"
            title="Số dư credit hiện tại"
          >
            <span>🪙</span>
            <span>{session.creditBalance ?? 0}</span>
            <span className="hidden sm:inline">Credits</span>
          </Link>

          {/* Sidebar toggles on desktop */}
          <button
            type="button"
            onClick={() => setIsLeftOpen(!isLeftOpen)}
            className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
              isLeftOpen
                ? 'border-[#0878EE] bg-[#EAF4FF] text-[#0878EE]'
                : 'border-[#E6EDF5] bg-white text-[#71809A] hover:border-[#0878EE]'
            }`}
            title="Ẩn/Hiện Nhiệm vụ & Cheat Sheet"
          >
            📋 <span className="hidden xl:inline">Nhiệm vụ</span>
          </button>

          <button
            type="button"
            onClick={() => setIsRightOpen(!isRightOpen)}
            className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
              isRightOpen
                ? 'border-[#0878EE] bg-[#EAF4FF] text-[#0878EE]'
                : 'border-[#E6EDF5] bg-white text-[#71809A] hover:border-[#0878EE]'
            }`}
            title="Ẩn/Hiện Đánh giá ngôn ngữ"
          >
            🔍 <span className="hidden xl:inline">Đánh giá</span>
          </button>

          {/* End Session Button: Biến thành màu XANH LÁ khi tự nhiên kết thúc */}
          {session.isNaturallyConcluded ? (
            <button
              type="button"
              onClick={() => setShowEndModal(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700 animate-pulse"
              title="Kịch bản đã đạt kết thúc tự nhiên! Bấm để hoàn thành."
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
        {isLeftOpen && (
          <aside className="w-80 shrink-0 border-r border-[#E6EDF5] bg-white flex flex-col z-10 transition-all duration-200">
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
                      key={mission.id}
                      className={`flex gap-3 rounded-xl border p-3 transition ${
                        mission.isCompleted
                          ? 'border-emerald-200 bg-emerald-50/60'
                          : 'border-[#E6EDF5] bg-white'
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
                              Đã đạt
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
          </aside>
        )}

        {/* Nút Dock mở rộng Cột Trái khi đang bị thu gọn */}
        {!isLeftOpen && (
          <button
            type="button"
            onClick={() => setIsLeftOpen(true)}
            className="absolute top-4 left-0 z-30 flex items-center gap-2 rounded-r-xl border border-l-0 border-[#0878EE]/30 bg-white px-3 py-2.5 text-xs font-bold text-[#0878EE] shadow-md hover:bg-[#EAF4FF] hover:pr-4 transition-all"
            title="Mở rộng danh sách nhiệm vụ & Cheat sheet"
          >
            <span>📋</span>
            <span>Nhiệm vụ ({completedMissionsCount}/{totalMissionsCount})</span>
            <span>▶</span>
          </button>
        )}

        {/* ============================================================ */}
        {/* 2. CENTER COLUMN: Chat Stream (Max Width 760px Centered)    */}
        {/* ============================================================ */}
        <main className="flex flex-1 flex-col overflow-hidden bg-[#F4F9FE]">
          {/* Scrollable messages container */}
          <div className="flex-1 overflow-y-auto p-4 md:p-6">
            <div className="mx-auto w-full max-w-[760px] space-y-4">
              {/* Scenario Context Card */}
              <div className="rounded-2xl border border-[#B9D9FF]/60 bg-gradient-to-r from-[#EAF4FF] to-white p-4 text-xs shadow-xs">
                <div className="flex items-center gap-2 font-bold text-[#0878EE]">
                  <span>⛩️</span>
                  <span>BỐI CẢNH LUYỆN TẬP</span>
                </div>
                <p className="mt-1 text-[#71809A] leading-relaxed">{session.scenarioContext}</p>
              </div>

              {/* Message List */}
              {session.messages.map((msg: RoleplayMessageDto) => {
                const isAi = msg.sender === 'Ai';
                const isSelected = selectedMessageId === msg.id;

                return (
                  <div
                    key={msg.id}
                    className={`flex items-start gap-3 ${isAi ? '' : 'flex-row-reverse'}`}
                  >
                    {/* Avatar */}
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold shadow-xs ${
                        isAi
                          ? 'bg-gradient-to-tr from-[#0878EE] to-[#4FA3FF] text-white'
                          : 'bg-[#071A44] text-white'
                      }`}
                    >
                      {isAi ? session.aiPersona.slice(0, 1) || 'AI' : 'Bạn'}
                    </div>

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
                          ? 'rounded-tl-xs border border-[#E6EDF5] bg-white text-[#071A44]'
                          : `rounded-tr-xs bg-[#0878EE] text-white cursor-pointer ${
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
                      <p className="text-base font-medium leading-relaxed tracking-wide">
                        {showFurigana && msg.furiganaText ? msg.furiganaText : msg.japaneseText}
                      </p>

                      {/* Vietnamese translation (with translation toggle support) */}
                      {showTranslation && msg.vietnameseMeaning && (
                        <p
                          className={`mt-2 border-t pt-2 text-xs leading-relaxed ${
                            isAi ? 'border-[#F1F5F9] text-[#71809A]' : 'border-blue-400/40 text-blue-100'
                          }`}
                        >
                          {msg.vietnameseMeaning}
                        </p>
                      )}

                      {/* AI Audio button (TODO for Sprint 3) */}
                      {isAi && (
                        <div className="mt-2 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              alert('Tính năng âm thanh AI (TTS) đang được hoàn thiện cho Sprint 3!');
                            }}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#71809A] hover:text-[#0878EE]"
                            title="// TODO: Sprint 3 Audio integration"
                          >
                            <span>🔊</span>
                            <span>Nghe lại</span>
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

                {/* Text input */}
                <input
                  ref={inputRef}
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Nhập câu trả lời bằng tiếng Nhật... (Enter để gửi)"
                  disabled={isSending}
                  className="flex-1 rounded-xl border border-[#E6EDF5] bg-[#F8FAFC] px-4 py-2.5 text-sm text-[#071A44] outline-none transition focus:border-[#0878EE] focus:bg-white focus:ring-2 focus:ring-[#0878EE]/20"
                />

                {/* Send Button */}
                <button
                  type="submit"
                  disabled={!inputText.trim() || isSending}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[#0878EE] px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#0768D0] disabled:opacity-50 disabled:cursor-not-allowed"
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
        {isRightOpen && (
          <aside className="w-80 lg:w-[330px] xl:w-[350px] max-w-[30vw] shrink-0 border-l border-[#E6EDF5] bg-white flex flex-col z-10 transition-all duration-200">
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

                  {/* Flashcard Action */}
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() =>
                        handleAddToFlashcard(
                          selectedMessage.linguisticFeedback?.naturalAlternative ||
                            selectedMessage.japaneseText
                        )
                      }
                      className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-[#0878EE] bg-white py-2.5 text-xs font-bold text-[#0878EE] shadow-xs transition hover:bg-[#EAF4FF]"
                    >
                      <span>⭐</span>
                      <span>Thêm cụm từ này vào Flashcard</span>
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
          </aside>
        )}

        {/* Nút Dock mở rộng Cột Phải khi đang bị thu gọn */}
        {!isRightOpen && (
          <button
            type="button"
            onClick={() => setIsRightOpen(true)}
            className="absolute top-4 right-0 z-30 flex items-center gap-2 rounded-l-xl border border-r-0 border-[#0878EE]/30 bg-white px-3 py-2.5 text-xs font-bold text-[#0878EE] shadow-md hover:bg-[#EAF4FF] hover:pl-4 transition-all"
            title="Mở rộng bảng đánh giá ngôn ngữ"
          >
            <span>◀</span>
            <span>🔍 Đánh giá</span>
          </button>
        )}
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
                  session.isNaturallyConcluded
                    ? 'bg-emerald-100 text-emerald-600'
                    : 'bg-amber-100 text-amber-600'
                }`}
              >
                {session.isNaturallyConcluded ? '🎉' : '⚠️'}
              </div>
              <div>
                <h3 className="text-base font-bold text-[#071A44]">
                  {session.isNaturallyConcluded ? 'Hoàn thành phiên luyện tập' : 'Kết thúc phiên sớm?'}
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
              {session.isNaturallyConcluded && (
                <p className="mt-2 text-emerald-700 font-semibold text-[11px]">
                  ✨ Kịch bản đã đạt kết thúc tự nhiên một cách xuất sắc!
                </p>
              )}
            </div>

            <p className="text-xs text-[#71809A] leading-relaxed">
              {session.isNaturallyConcluded
                ? 'Bạn đã hoàn tất cuộc hội thoại. Bấm "Xác nhận kết thúc" để lưu kết quả và quay về thông tin kịch bản.'
                : 'Nếu bạn kết thúc sớm, phiên luyện tập sẽ dừng lại tại đây và credit đã trừ sẽ không được hoàn trả.'}
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
                  session.isNaturallyConcluded
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
    </div>
  );
};
