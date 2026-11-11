import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LivingAvatar } from '../components/roleplay/LivingAvatar';
import {
  MicIcon,
  VolumeIcon,
  PhoneCallIcon,
  HandIcon,
  ListTodoIcon,
  SettingsIcon,
  BarChartIcon,
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
  PlacementEventEvidenceSummary,
} from '../types/placementTest';

const ALL_PLACEMENT_EVENTS = [
  {
    code: 'EVT-01',
    title: 'Chào hỏi & Xác nhận đặt phòng',
    nextObjective: 'Cung cấp tên khách (Tanaka), đặt 3 đêm và nhắc lại yêu cầu ưu tiên phòng yên tĩnh.',
    targetCriteria: 'Chào hỏi đúng chuẩn, nói rõ tên đặt phòng và mục đích check-in.'
  },
  {
    code: 'EVT-02',
    title: 'Xử lý phòng 512 cạnh thang máy',
    nextObjective: 'Lễ tân thông báo phòng 512 cạnh thang máy. Hãy bày tỏ e ngại tiếng ồn hoặc yêu cầu đổi phòng yên tĩnh.',
    targetCriteria: 'Bày tỏ mong muốn đổi phòng lịch sự (kính ngữ / Teineigo), giải thích lý do thích yên tĩnh.'
  },
  {
    code: 'EVT-03',
    title: 'Lựa chọn phòng Deluxe (+2,000 円)',
    nextObjective: 'Lễ tân báo chỉ còn phòng Deluxe (+2,000 円/đêm). Hãy quyết định: Nâng hạng Deluxe hoặc giữ phòng cũ.',
    targetCriteria: 'Đưa ra quyết định dứt khoát hoặc hỏi thêm chi tiết chi phí; thể hiện sự cân nhắc rõ ràng.'
  },
  {
    code: 'EVT-04',
    title: 'Đăng ký dịch vụ bữa sáng (1,500 円)',
    nextObjective: 'Lễ tân hỏi về bữa sáng (1,500 円/ngày). Hãy quyết định: Đăng ký bữa sáng hoặc từ chối.',
    targetCriteria: 'Phản hồi chấp nhận hoặc từ chối bữa sáng lịch sự; có thể hỏi giờ phục vụ.'
  },
  {
    code: 'EVT-05',
    title: 'Chốt phương án & Trao chìa khóa',
    nextObjective: 'Lễ tân tổng kết phương án và trao chìa khóa. Hãy cảm ơn và xác nhận kết thúc thủ tục nhận phòng.',
    targetCriteria: 'Cảm ơn lễ tân đúng văn phong dịch vụ khách sạn Nhật Bản, xác nhận nhận phòng.'
  }
];

export const PlacementTestRoomView: React.FC = () => {
  const navigate = useNavigate();

  // 1. Trạng thái phiên kiểm tra
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  // 2. Dữ liệu hội thoại & Bối cảnh
  const [messages, setMessages] = useState<PlacementTestTurnMessageDto[]>([]);
  const [contextPackage, setContextPackage] = useState<HotelContextPackageDto | null>(null);

  // 3. Tiến trình & Tiêu chí đánh giá trực tiếp (Live Rubric Inspector)
  const [currentEvent, setCurrentEvent] = useState<string>('EVT-01');
  const [currentDifficultyBand, setCurrentDifficultyBand] = useState<string>('N4');
  const [demonstratedBand, setDemonstratedBand] = useState<string>('Unobserved');
  const [scaffoldingStep, setScaffoldingStep] = useState<number>(0);
  const [eventSummaries, setEventSummaries] = useState<PlacementEventEvidenceSummary[]>([]);
  const [latestTurnScores, setLatestTurnScores] = useState<{
    task: number;
    grammar: number;
    vocab: number;
    pragmatics: number;
    note: string;
    classification: string;
    detectedIntent: string;
    demonstratedBand: string;
    estimatedLevelSoFar?: string;
  } | null>(null);

  const [strikeWarning, setStrikeWarning] = useState<string | null>(null);
  const [isConcluded, setIsConcluded] = useState(false);
  const [finalResult, setFinalResult] = useState<PlacementTestCompleteResponseDto | null>(null);
  const [showResultModal, setShowResultModal] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);

  // 4. State điều khiển hiển thị & Nhập liệu
  const [isLeftOpen, setIsLeftOpen] = useState(true);
  const [isRightOpen, setIsRightOpen] = useState(true); // Bật mặc định để tester quan sát tiêu chí chấm trực tiếp
  const [isHandsFreeMode, setIsHandsFreeMode] = useState(false);
  const [showTranslation, setShowTranslation] = useState(true);
  const [showFurigana, setShowFurigana] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [inputText, setInputText] = useState('');
  const [isRecordingMic, setIsRecordingMic] = useState(false);
  const [playingMessageId, setPlayingMessageId] = useState<number | null>(null);

  const recognitionRef = useRef<any>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const turnStartTimeRef = useRef<number>(Date.now());

  // Tự động cuộn xuống cuối khi có tin nhắn mới
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSending]);

  // Khởi tạo hoặc tải phiên làm bài kiểm tra từ Backend
  const loadPlacementSession = async (reset: boolean = false) => {
    setIsLoading(true);
    setLoadError(null);
    setStrikeWarning(null);
    setIsConcluded(false);
    setFinalResult(null);
    setShowResultModal(false);

    try {
      const res = await placementTestService.startOrResume(reset);
      if (res.success && res.data) {
        setSessionId(res.data.sessionId);
        setCurrentEvent(res.data.currentEvent || 'EVT-01');
        setCurrentDifficultyBand(res.data.currentDifficultyBand || 'N4');
        setContextPackage(res.data.contextPackage);

        if (res.data.eventSummaries) {
          setEventSummaries(res.data.eventSummaries);
        }
        if (res.data.messageHistory && res.data.messageHistory.length > 0) {
          setMessages(res.data.messageHistory);
        } else if (res.data.openingMessage) {
          setMessages([res.data.openingMessage]);
        }
        turnStartTimeRef.current = Date.now();
      } else {
        setLoadError(res.message || 'Không thể tải phiên kiểm tra xếp lớp.');
      }
    } catch (err: any) {
      setLoadError(err.message || 'Lỗi kết nối máy chủ.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadPlacementSession(false);
  }, []);

  // Xử lý gửi tin nhắn của học viên lên Backend
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || isSending || !sessionId) return;

    const userText = inputText.trim();
    setInputText('');
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
        fallbackToTextInput: !isRecordingMic,
        responseLatencySeconds: latencySeconds,
        speakingDurationSeconds: isRecordingMic ? 3.0 : 0,
      });

      if (res.success && res.data) {
        const turnData = res.data;

        // Cập nhật lại tin nhắn chuẩn từ backend (bao gồm cả phân tích furigana & dịch)
        setMessages((prev) => [
          ...prev.slice(0, -1),
          turnData.userMessage,
          turnData.aiMessage,
        ]);

        // Cập nhật trạng thái sự kiện & tiêu chí chấm điểm trực tiếp
        setCurrentEvent(turnData.currentEvent);
        setCurrentDifficultyBand(turnData.currentDifficultyBand);
        setDemonstratedBand(turnData.demonstratedBand);
        setScaffoldingStep(turnData.scaffoldingStep);

        if (turnData.eventSummaries) {
          setEventSummaries(turnData.eventSummaries);
        }

        if (turnData.taskFulfillmentScore != null) {
          setLatestTurnScores({
            task: turnData.taskFulfillmentScore,
            grammar: turnData.grammarAccuracyScore ?? 0,
            vocab: turnData.vocabularyRangeScore ?? 0,
            pragmatics: turnData.pragmaticsScore ?? 0,
            note: turnData.evidenceNote || '',
            classification: turnData.inputClassification || 'Valid',
            detectedIntent: turnData.detectedIntent || 'GeneralResponse',
            demonstratedBand: turnData.demonstratedBand || 'N4',
            estimatedLevelSoFar: turnData.estimatedLevelSoFar || undefined,
          });
        }

        // Cảnh báo nếu học viên nói lạc đề hoặc vi phạm nguyên tắc
        if (turnData.isStrikeWarning && turnData.strikeWarningMessage) {
          setStrikeWarning(turnData.strikeWarningMessage);
        }

        // Tự động phát âm thanh câu trả lời của AI nếu bật
        if (turnData.aiMessage?.japaneseText) {
          void handlePlayAiSpeech(turnData.aiMessage.id, turnData.aiMessage.japaneseText);
        }

        // Kiểm tra kết thúc phiên
        if (turnData.isConcluded) {
          setIsConcluded(true);
          await handleConcludeAndFetchResult();
        }

        turnStartTimeRef.current = Date.now();
      } else {
        setStrikeWarning(res.message || 'Lỗi xử lý phản hồi từ AI.');
      }
    } catch (err: any) {
      setStrikeWarning(err.message || 'Lỗi gửi tin nhắn đến máy chủ.');
    } finally {
      setIsSending(false);
    }
  };

  // Phát giọng đọc tiếng Nhật cho tin nhắn của AI
  const handlePlayAiSpeech = async (msgId: number, text: string) => {
    try {
      setPlayingMessageId(msgId);
      await scenarioVoiceService.playAiSpeech(text);
    } catch (err) {
      console.warn('Playback error:', err);
    } finally {
      setPlayingMessageId(null);
    }
  };

  // Toggle Micro thu âm (Web Speech API)
  const handleToggleMic = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert('Trình duyệt của bạn chưa hỗ trợ nhận diện giọng nói Web Speech API. Vui lòng nhập bằng bàn phím.');
      return;
    }

    if (isRecordingMic) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsRecordingMic(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'ja-JP';
      recognition.continuous = false;
      recognition.interimResults = true;

      recognition.onstart = () => {
        setIsRecordingMic(true);
      };

      recognition.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          .map((result: any) => result[0].transcript)
          .join('');
        setInputText(transcript);
      };

      recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsRecordingMic(false);
      };

      recognition.onend = () => {
        setIsRecordingMic(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.error('Cannot start speech recognition:', err);
      setIsRecordingMic(false);
    }
  };

  // Kết thúc bài kiểm tra và lấy kết quả tổng hợp
  const handleConcludeAndFetchResult = async () => {
    if (!sessionId) return;
    try {
      const res = await placementTestService.complete(sessionId);
      if (res.success && res.data) {
        setFinalResult(res.data);
        setShowResultModal(true);
      }
    } catch (err) {
      console.error('Cannot complete session:', err);
    }
  };

  // Helper hiển thị thẻ tiêu chí chấm trực quan
  const renderCriterionCard = (
    name: string,
    score: number,
    standardText: string,
    passThreshold = 70
  ) => {
    const isPass = score >= passThreshold;
    const isHigh = score >= 75;
    return (
      <div className="rounded-xl border border-[var(--line)] bg-white p-2.5 space-y-1.5 shadow-2xs">
        <div className="flex justify-between items-center">
          <span className="font-bold text-[11px] text-[var(--sumi)]">{name}</span>
          <div className="flex items-center gap-1.5">
            <span
              className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${
                isHigh
                  ? 'bg-emerald-100 text-emerald-800'
                  : isPass
                  ? 'bg-blue-100 text-blue-800'
                  : 'bg-rose-100 text-rose-800'
              }`}
            >
              {isHigh ? 'Đạt cao' : isPass ? 'Đạt' : 'Cần cải thiện'}
            </span>
            <span className="font-mono font-bold text-xs text-[var(--sumi)]">{score}/100</span>
          </div>
        </div>
        <div className="h-1.5 w-full rounded-full bg-[var(--paper-200)] overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ${
              isHigh ? 'bg-emerald-600' : isPass ? 'bg-blue-600' : 'bg-rose-500'
            }`}
            style={{ width: `${Math.min(100, Math.max(5, score))}%` }}
          />
        </div>
        <p className="text-[10px] text-[var(--sumi-faint)] leading-tight">{standardText}</p>
      </div>
    );
  };

  // Ánh xạ tên sự kiện dễ hiểu cho Tester
  const getEventName = (code: string) => {
    switch (code) {
      case 'EVT-01':
        return 'EVT-01: Nhận diện & Xác nhận đặt phòng';
      case 'EVT-02':
        return 'EVT-02: Lễ tân xếp phòng 512 cạnh thang máy';
      case 'EVT-03':
        return 'EVT-03: Đổi phòng & Thương lượng nâng hạng Deluxe';
      case 'EVT-04':
        return 'EVT-04: Quyết định gói bữa sáng (1,500¥)';
      case 'EVT-05':
        return 'EVT-05: Chốt thủ tục, nhận chìa khóa & kết thúc';
      case 'CONCLUDED':
        return 'Hoàn tất toàn bộ kịch bản';
      default:
        return code;
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

                {/* Badge chỉ định màn hình kiểm thử */}
                <span className="shrink-0 rounded-full bg-amber-100 border border-amber-300 px-2 py-0.5 text-[10px] font-extrabold text-amber-900 whitespace-nowrap">
                  🧪 TESTING ONLY
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
          {/* Nút Làm lại bài mới (Dành cho Tester thử lại kịch bản sạch) */}
          <button
            type="button"
            onClick={() => void loadPlacementSession(true)}
            className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-[var(--line)] bg-white px-2 sm:px-2.5 py-1.5 text-xs font-semibold text-[var(--sumi)] hover:border-[var(--ai)] hover:text-[var(--ai)] transition active:scale-95 cursor-pointer shadow-2xs"
            title="Bắt đầu lại bài kiểm tra từ đầu (Reset)"
          >
            <RefreshIcon className="w-3.5 h-3.5 text-[var(--ai)]" />
            <span className="hidden md:inline">Làm lại</span>
          </button>

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

          {/* Toggle Cột Bối cảnh bên trái */}
          <button
            type="button"
            onClick={() => setIsLeftOpen(!isLeftOpen)}
            className={`inline-flex items-center gap-1 sm:gap-1.5 rounded-xl border px-2 sm:px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap shrink-0 transition cursor-pointer ${
              isLeftOpen
                ? 'border-[var(--ai)] bg-[var(--ai-soft)] text-[var(--ai)]'
                : 'border-[var(--line)] bg-white text-[var(--sumi-muted)] hover:border-[var(--ai)]'
            }`}
            title="Ẩn/Hiện Bảng bối cảnh phòng & khách sạn"
          >
            <ListTodoIcon className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Bối cảnh</span>
          </button>

          {/* Toggle Cột Tiêu chí đánh giá lượt bên phải (Rubric Inspector) */}
          <button
            type="button"
            onClick={() => setIsRightOpen(!isRightOpen)}
            className={`inline-flex items-center gap-1 sm:gap-1.5 rounded-xl border px-2 sm:px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap shrink-0 transition cursor-pointer ${
              isRightOpen
                ? 'border-[var(--ai)] bg-[var(--ai-soft)] text-[var(--ai)]'
                : 'border-[var(--line)] bg-white text-[var(--sumi-muted)] hover:border-[var(--ai)]'
            }`}
            title="Ẩn/Hiện Bảng tiêu chí đánh giá & trình độ thích ứng"
          >
            <BarChartIcon className="w-3.5 h-3.5 text-[var(--ai)]" />
            <span className="hidden lg:inline">Tiêu chí chấm</span>
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
              title="Cài đặt hỗ trợ (Dịch, Furigana)"
            >
              <SettingsIcon className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">Cài đặt</span>
              {(showTranslation || showFurigana) && (
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
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-[var(--sumi)]">Phiên âm Furigana</p>
                    <p className="text-[11px] text-[var(--sumi-faint)]">Cách đọc trên chữ Hán</p>
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
      {/* 2. BODY WORKSPACE (3-COLUMN LAYOUT)                                       */}
      {/* ========================================================================= */}
      <div className="relative flex flex-1 overflow-hidden">
        {/* ============================================================ */}
        {/* 2.A. LEFT SIDEBAR: BỐI CẢNH ĐẶT PHÒNG KHÁCH SẠN             */}
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
                  Bối cảnh tình huống
                </h2>
                <p className="text-xs font-bold text-[var(--sumi)] mt-0.5">
                  Phiếu Đặt Phòng &amp; Phòng Nghỉ
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsLeftOpen(false)}
                className="inline-flex items-center gap-1 rounded-xl border border-[var(--line)] px-2.5 py-1 text-xs font-semibold text-[var(--sumi-faint)] hover:bg-[var(--paper-100)] hover:text-[var(--ai)] transition active:scale-95 cursor-pointer"
                title="Thu gọn"
              >
                <span>◀</span>
                <span>Thu gọn</span>
              </button>
            </div>

            {/* Content List: Voucher + Room Options */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3.5 text-xs">
              {/* Card 1: Voucher Card */}
              <div className="rounded-xl border border-[var(--line)] bg-white p-3 shadow-xs space-y-2">
                <div className="flex items-center justify-between border-b border-[var(--line)] pb-1.5">
                  <span className="font-bold text-[10.5px] text-[var(--sumi-muted)]">MÃ ĐẶT: #SKR-9921</span>
                  <span className="text-[10px] font-semibold text-[var(--ai)]">
                    {contextPackage?.hotelName || 'Khách sạn Sakura'}
                  </span>
                </div>
                <div className="space-y-1 text-[11.5px]">
                  <div className="flex justify-between">
                    <span className="text-[var(--sumi-faint)]">Tên khách:</span>
                    <span className="font-bold text-[var(--sumi)]">
                      {contextPackage?.guestName || 'Tanaka (田中 様)'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--sumi-faint)]">Thời gian:</span>
                    <span className="font-semibold text-[var(--sumi)]">
                      {contextPackage?.bookingDates || '11/10 ～ 11/13 (3 đêm)'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--sumi-faint)]">Loại phòng:</span>
                    <span className="font-semibold text-[var(--sumi)]">
                      {contextPackage?.bookedRoomType || 'Standard Room (18m²)'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--sumi-faint)]">Bữa sáng:</span>
                    <span className="font-semibold text-rose-600">
                      {contextPackage?.breakfastPolicy || 'Chưa bao gồm (1,500¥/ngày)'}
                    </span>
                  </div>
                </div>

                {/* Yêu cầu đặc biệt Callout */}
                <div className="rounded-lg border border-amber-300 bg-amber-50/80 p-2 text-amber-900">
                  <p className="font-bold text-[10px] uppercase tracking-wide text-amber-700">
                    ⚠️ YÊU CẦU ĐẶC BIỆT KHI ĐẶT:
                  </p>
                  <p className="font-bold text-xs mt-0.5 text-amber-900">
                    {contextPackage?.specialRequest || '「静かな部屋を希望」 (Ưu tiên phòng yên tĩnh)'}
                  </p>
                  <p className="text-[10px] text-amber-700 mt-0.5">
                    Hãy lưu ý điểm này khi lễ tân xếp phòng cho bạn.
                  </p>
                </div>
              </div>

              {/* Card 2: 3 Room Options Comparison */}
              <div className="space-y-2">
                <span className="font-bold text-[11px] text-[var(--sumi-muted)] uppercase tracking-wide">
                  Tình trạng các loại phòng
                </span>

                {contextPackage?.roomOptions && contextPackage.roomOptions.length > 0 ? (
                  contextPackage.roomOptions.map((room) => (
                    <div
                      key={room.code}
                      className={`rounded-xl border p-2.5 space-y-1 ${
                        room.code === 'Standard'
                          ? 'border-amber-300 bg-amber-50/60'
                          : room.code === 'Deluxe'
                          ? 'border-emerald-300 bg-emerald-50/60'
                          : 'border-[var(--line)] bg-[var(--paper-100)] opacity-75'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-[var(--sumi)]">{room.name}</span>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[9.5px] font-bold ${
                            room.code === 'Standard'
                              ? 'bg-rose-100 text-rose-700'
                              : room.code === 'Deluxe'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-[var(--paper-200)] text-[var(--sumi-faint)]'
                          }`}
                        >
                          {room.status}
                        </span>
                      </div>
                      <p className="text-[10.5px] text-[var(--sumi-muted)]">{room.bedType}</p>
                      <p
                        className={`text-[10.5px] font-bold ${
                          room.surchargePerNight > 0 ? 'text-[var(--ai)]' : 'text-emerald-700'
                        }`}
                      >
                        Phụ phí: +{room.surchargePerNight.toLocaleString()} 円 / đêm
                      </p>
                    </div>
                  ))
                ) : (
                  <>
                    <div className="rounded-xl border border-amber-300 bg-amber-50/60 p-2.5 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-[var(--sumi)]">Standard Room (18m²)</span>
                        <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[9.5px] font-bold text-rose-700">
                          Đang xếp: P.512
                        </span>
                      </div>
                      <p className="text-[11px] font-semibold text-amber-800">
                        📍 Cạnh thang máy (エレベーターの近く)
                      </p>
                      <p className="text-[10.5px] font-bold text-emerald-700">Phụ phí: +0 円</p>
                    </div>

                    <div className="rounded-xl border border-emerald-300 bg-emerald-50/60 p-2.5 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-[var(--sumi)]">Deluxe Room (28m²)</span>
                        <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[9.5px] font-bold text-emerald-800">
                          Còn phòng trống
                        </span>
                      </div>
                      <p className="text-[11px] font-semibold text-emerald-800">
                        🌿 Rất yên tĩnh • Xa thang máy • Giường đôi
                      </p>
                      <p className="text-[10.5px] font-bold text-[var(--ai)]">
                        Phụ phí nâng hạng: +2,000 円 / đêm (+6,000 円/3 đêm)
                      </p>
                    </div>
                  </>
                )}
              </div>

              {/* Policy Note Footer */}
              <div className="rounded-xl bg-white border border-[var(--line)] p-2.5 text-[11px] text-[var(--sumi-muted)] space-y-1">
                <p className="font-bold text-[var(--sumi)]">Quy định khách sạn:</p>
                <p>• Nhận phòng từ 15:00 | Trả phòng trước 11:00</p>
                <p>• Bữa sáng: 7:00 – 10:00 (1,500 円/người)</p>
                <p className="text-[10.5px] font-semibold text-[var(--ai)] pt-0.5">
                  Mẹo: Nói 「もう一度お願いします」 nếu cần nghe lại.
                </p>
              </div>
            </div>
          </div>
        </aside>

        {/* Nút Dock mở rộng Cột Trái khi đang bị thu gọn */}
        <button
          type="button"
          onClick={() => setIsLeftOpen(true)}
          className={`absolute top-4 left-0 z-30 flex items-center gap-2 rounded-r-xl border border-l-0 border-[var(--ai)]/30 bg-white px-3 py-2.5 text-xs font-bold text-[var(--ai)] shadow-md hover:bg-[var(--ai-soft)] hover:pr-4 transition-all duration-300 ease-in-out cursor-pointer ${
            !isLeftOpen
              ? 'translate-x-0 opacity-100 pointer-events-auto'
              : '-translate-x-full opacity-0 pointer-events-none'
          }`}
          title="Mở rộng bối cảnh phòng"
        >
          <ListTodoIcon className="w-3.5 h-3.5" />
          <span>Bối cảnh phòng</span>
          <span>▶</span>
        </button>

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
              <div className="rounded-2xl border border-[var(--line)] bg-white/80 backdrop-blur-xs px-4 py-2.5 shadow-2xs text-xs font-sans">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 font-bold text-[var(--ai)] text-[10px] tracking-wide uppercase">
                      <span>Bối cảnh tình huống</span>
                    </div>
                    <p className="mt-0.5 text-[var(--sumi)] text-[11px] leading-relaxed">
                      Bạn vừa đến sảnh khách sạn Sakura tại Tokyo sau chuyến bay dài và đến quầy lễ tân để làm thủ tục nhận phòng (Check-in).
                    </p>
                  </div>
                </div>
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
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-center text-xs text-red-700 space-y-2">
                  <p className="font-bold">Không thể tải phiên kiểm tra:</p>
                  <p>{loadError}</p>
                  <button
                    type="button"
                    onClick={() => void loadPlacementSession(true)}
                    className="mt-2 inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-red-700 cursor-pointer"
                  >
                    <span>🔄 Bắt đầu bài kiểm tra mới</span>
                  </button>
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
                          ? 'bubble-ai rounded-tl-sm border border-[var(--line)] bg-white text-[var(--sumi)] shadow-xs'
                          : 'bubble-user rounded-tr-sm bg-[var(--ai)] text-white shadow-sm'
                      }`}
                    >
                      {/* Bubble Header */}
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span
                          className={`text-[10px] font-bold ${
                            isAi ? 'text-[var(--sumi-faint)]' : 'text-blue-100'
                          }`}
                        >
                          {isAi ? 'フロント 山田' : 'Bạn (Tanaka)'}
                        </span>

                        {isAi && (
                          <div className="flex items-center gap-1.5">
                            {playingMessageId === msg.id && (
                              <span className="rounded bg-emerald-100 px-1.5 py-0.2 text-[9px] font-bold text-emerald-800">
                                ĐANG NÓI
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => void handlePlayAiSpeech(msg.id, msg.japaneseText)}
                              className="rounded-full bg-[var(--paper-100)] px-2 py-0.5 text-[10px] font-semibold text-[var(--sumi-muted)] hover:bg-[var(--line)] hover:text-[var(--sumi)] transition active:scale-95 cursor-pointer flex items-center gap-1"
                              title="Nghe lại câu nói này"
                            >
                              <VolumeIcon className="w-3 h-3 text-[var(--ai)]" />
                              <span>Nghe lại</span>
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Japanese Utterance with Furigana */}
                      <div className="text-base font-medium leading-relaxed tracking-wide min-h-[1.75rem]">
                        {showFurigana && msg.furiganaHtml ? (
                          <div
                            dangerouslySetInnerHTML={{ __html: msg.furiganaHtml }}
                            className="[&_rt]:text-[9px] [&_rt]:text-[var(--ai)] [&_rt]:font-normal"
                          />
                        ) : (
                          <p>{msg.japaneseText}</p>
                        )}
                      </div>

                      {/* Vietnamese Meaning */}
                      {showTranslation && msg.vietnameseMeaning && (
                        <div
                          className={`mt-2 border-t pt-2 text-xs leading-relaxed transition-all duration-300 ${
                            isAi
                              ? 'border-[var(--line)] text-[var(--sumi-muted)]'
                              : 'border-white/20 text-white/90'
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
                    disabled={isSending}
                    className={`relative z-10 inline-flex items-center justify-center gap-1.5 rounded-2xl px-3.5 py-2.5 text-xs font-bold transition-all shadow-xs cursor-pointer select-none overflow-hidden ${
                      isRecordingMic
                        ? 'border border-rose-500 bg-rose-600 text-white ring-4 ring-rose-400/25 shadow-md min-w-[96px] animate-pulse'
                        : 'border border-[var(--line)] bg-white text-[var(--sumi)] hover:border-[var(--ai)] hover:text-[var(--ai)] hover:bg-[var(--ai-soft)] hover:shadow-sm active:scale-95 min-w-[80px]'
                    }`}
                    title="Bấm để nói tiếng Nhật bằng micro"
                  >
                    <span className="flex items-center gap-1.5">
                      <MicIcon
                        className={`w-3.5 h-3.5 shrink-0 ${
                          isRecordingMic ? 'text-white' : 'text-[var(--ai)]'
                        }`}
                      />
                      <span className="whitespace-nowrap flex items-center gap-1.5">
                        <span>{isRecordingMic ? 'Đang nghe...' : 'Nói'}</span>
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
                  onChange={(e) => setInputText(e.target.value)}
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

                {/* Send Button */}
                <button
                  type="submit"
                  disabled={!inputText.trim() || isSending}
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

                {/* ============================================================ */}
        {/* 2.D. RIGHT DRAWER: LIVE ASSESSMENT RUBRIC INSPECTOR          */}
        {/* ============================================================ */}
        <aside
          className={`shrink-0 border-l border-[var(--line)] bg-white flex flex-col z-10 overflow-hidden transition-all duration-300 ease-in-out ${
            isRightOpen ? 'w-80 lg:w-96 opacity-100 shadow-md' : 'w-0 border-l-0 opacity-0 pointer-events-none'
          }`}
        >
          <div className="w-80 lg:w-96 flex flex-col h-full shrink-0">
            {/* Header Inspector */}
            <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3 bg-[var(--paper-50)]">
              <div className="flex items-center gap-2">
                <BarChartIcon className="w-4 h-4 text-[var(--ai)]" />
                <div>
                  <div className="flex items-center gap-1.5">
                    <h2 className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--sumi-faint)]">
                      Giám sát chấm điểm
                    </h2>
                    <span className="rounded bg-amber-100 px-1 py-0.2 text-[9px] font-black text-amber-900 border border-amber-200">
                      TEST ONLY
                    </span>
                  </div>
                  <p className="text-xs font-bold text-[var(--sumi)] mt-0.5">
                    Live Rubric &amp; Lộ trình đánh giá
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsRightOpen(false)}
                className="inline-flex items-center gap-1 rounded-xl border border-[var(--line)] px-2 py-1 text-xs font-semibold text-[var(--sumi-faint)] hover:bg-[var(--paper-100)] hover:text-[var(--ai)] transition active:scale-95 cursor-pointer"
                title="Thu gọn bảng tiêu chí"
              >
                <span>✕</span>
              </button>
            </div>

            {/* Nội dung giám sát */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
              {/* Cảnh báo chế độ nghiệm thu nội bộ */}
              <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-2.5 text-[10.5px] text-amber-900 leading-relaxed shadow-2xs">
                <span className="font-bold flex items-center gap-1 text-[11px] text-amber-950 mb-0.5">
                  <span>🧪</span> Màn hình Kiểm thử Nghiệm thu (Testing Only)
                </span>
                <span>
                  Bảng theo dõi tiêu chí chấm, điểm số theo lượt và tiến trình Can-do này chỉ phục vụ kiểm thử kỹ thuật nội bộ, <strong>không hiển thị cho học viên trên bản deploy chính thức</strong>.
                </span>
              </div>

              {/* 1. Nhiệm vụ tiếp theo của bạn (Next Actionable Objective) */}
              <div className="rounded-xl border border-[var(--ai)]/30 bg-[var(--ai-soft)]/50 p-3 space-y-1.5 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--ai)] flex items-center gap-1">
                    <span>🎯</span> Nhiệm vụ tiếp theo của bạn
                  </span>
                  <span className="rounded bg-[var(--ai)] px-1.5 py-0.5 text-[9px] font-bold text-white">
                    {currentEvent}
                  </span>
                </div>
                <p className="text-xs font-bold text-[var(--sumi)] leading-snug">
                  {ALL_PLACEMENT_EVENTS.find((e) => e.code === currentEvent)?.nextObjective ||
                    'Lắng nghe phản hồi từ lễ tân và tiếp tục thủ tục nhận phòng.'}
                </p>
                <p className="text-[10.5px] text-[var(--sumi-muted)] italic pt-0.5">
                  Mục tiêu đạt:{' '}
                  {ALL_PLACEMENT_EVENTS.find((e) => e.code === currentEvent)?.targetCriteria ||
                    'Phản hồi lịch thiệp theo đúng tình huống dịch vụ khách sạn.'}
                </p>
              </div>

              {/* 2. Lộ trình 5 Sự kiện nhận phòng (Event Progression Roadmap) */}
              <div className="rounded-xl border border-[var(--line)] bg-[var(--paper-50)] p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10.5px] font-bold uppercase tracking-wide text-[var(--sumi-faint)]">
                    Lộ trình 5 tình huống
                  </span>
                  <span className="text-[10px] font-bold font-mono text-[var(--ai)]">
                    {eventSummaries.length}/5 sự kiện đã hoàn thành
                  </span>
                </div>

                <div className="space-y-1.5">
                  {ALL_PLACEMENT_EVENTS.map((evt, idx) => {
                    const summary = eventSummaries.find((s) => s.eventCode === evt.code);
                    const isCompleted = !!summary && summary.outcomeStatus === 'Fulfilled';
                    const isCurrent = currentEvent === evt.code;

                    return (
                      <div
                        key={evt.code}
                        className={`rounded-lg border p-2.5 text-[11px] transition ${
                          isCompleted
                            ? 'border-emerald-200 bg-emerald-50/60'
                            : isCurrent
                            ? 'border-[var(--ai)] bg-blue-50/40 ring-1 ring-[var(--ai)]/30 shadow-2xs'
                            : 'border-[var(--line)] bg-white/70'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2 flex-1">
                            <span
                              className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-mono shrink-0 font-bold mt-0.5 ${
                                isCompleted
                                  ? 'bg-emerald-600 text-white'
                                  : isCurrent
                                  ? 'bg-[var(--ai)] text-white animate-pulse'
                                  : 'bg-slate-200 text-slate-600'
                              }`}
                            >
                              {isCompleted ? '✓' : idx + 1}
                            </span>
                            <span
                              className={`font-bold leading-snug break-words ${
                                isCompleted
                                  ? 'text-emerald-950'
                                  : isCurrent
                                  ? 'text-[var(--ai)] font-extrabold'
                                  : 'text-[var(--sumi-muted)]'
                              }`}
                            >
                              {evt.code}: {evt.title}
                            </span>
                          </div>
                          <div className="shrink-0">
                            {isCompleted ? (
                              <span className="rounded bg-emerald-100 px-1.5 py-0.2 text-[9px] font-bold text-emerald-800 font-mono">
                                Đạt {summary?.highestDemonstratedBand || 'N4'}
                              </span>
                            ) : isCurrent ? (
                              <span className="rounded bg-[var(--ai)] px-1.5 py-0.2 text-[9px] font-bold text-white">
                                Đang diễn ra
                              </span>
                            ) : (
                              <span className="rounded bg-slate-100 px-1.5 py-0.2 text-[9px] font-medium text-[var(--sumi-faint)]">
                                Chưa tới
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Chi tiết nhiệm vụ theo trạng thái (Hiển thị đầy đủ, không bị cắt dấu ...) */}
                        {isCompleted && summary?.summaryExplanation && (
                          <p className="text-[10px] text-emerald-800 mt-1.5 pl-6 leading-relaxed border-t border-emerald-200/50 pt-1">
                            {summary.summaryExplanation}
                          </p>
                        )}

                        {isCurrent && (
                          <div className="mt-2 pl-6 pt-1.5 border-t border-[var(--ai)]/20 text-[10.5px] space-y-1">
                            <div className="text-[var(--ai)] font-bold flex items-start gap-1">
                              <span className="shrink-0">🎯</span>
                              <span className="leading-snug">{evt.nextObjective}</span>
                            </div>
                            <div className="text-[var(--sumi-muted)] italic leading-tight pl-4">
                              Mục tiêu: {evt.targetCriteria}
                            </div>
                          </div>
                        )}

                        {!isCompleted && !isCurrent && (
                          <div className="mt-1 pl-6 text-[10px] text-[var(--sumi-faint)] leading-snug">
                            {evt.nextObjective}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 3. Phân tích lượt đối thoại vừa nói (Latest Turn Analysis & Rubric Scores) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="font-bold text-[10.5px] uppercase tracking-wide text-[var(--sumi-faint)]">
                    Đánh giá lượt đối thoại gần nhất
                  </p>
                  {latestTurnScores && (
                    <span className="text-[10px] font-bold font-mono text-emerald-700">
                      Bậc thể hiện: {latestTurnScores.demonstratedBand}
                    </span>
                  )}
                </div>

                {latestTurnScores ? (
                  <div className="space-y-2">
                    {/* Ý định nhận diện & Phân loại câu nói */}
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div className="rounded-xl bg-[var(--paper-50)] p-2.5 border border-[var(--line)]">
                        <span className="text-[10px] text-[var(--sumi-faint)] block">Ý định (Intent):</span>
                        <span className="font-bold text-[var(--ai)] font-mono truncate block mt-0.5" title={latestTurnScores.detectedIntent}>
                          {latestTurnScores.detectedIntent}
                        </span>
                      </div>
                      <div className="rounded-xl bg-[var(--paper-50)] p-2.5 border border-[var(--line)]">
                        <span className="text-[10px] text-[var(--sumi-faint)] block">Phân loại câu nói:</span>
                        <span className="font-bold text-emerald-700 block mt-0.5">
                          {latestTurnScores.classification === 'Valid'
                            ? 'Hợp lệ (Valid)'
                            : latestTurnScores.classification}
                        </span>
                      </div>
                    </div>

                    {/* 4 Tiêu chí Rubric Đạt / Cần cải thiện */}
                    <div className="space-y-2">
                      {/* Tiêu chí 1: Nhiệm vụ */}
                      {renderCriterionCard(
                        '1. Hoàn thành nhiệm vụ',
                        latestTurnScores.task,
                        'Đạt mục tiêu giao tiếp của sự kiện, trả lời đúng trọng tâm câu hỏi của lễ tân.',
                        70
                      )}

                      {/* Tiêu chí 2: Ngữ pháp */}
                      {renderCriterionCard(
                        '2. Ngữ pháp & Cấu trúc',
                        latestTurnScores.grammar,
                        'Dùng đúng thể lịch sự Teineigo (desu/masu) hoặc kính ngữ Keigo, không sai trợ từ.',
                        70
                      )}

                      {/* Tiêu chí 3: Từ vựng */}
                      {renderCriterionCard(
                        '3. Vốn từ vựng',
                        latestTurnScores.vocab,
                        'Vốn từ phù hợp văn cảnh nhận phòng (đặt phòng, loại phòng, đêm, bữa sáng).',
                        70
                      )}

                      {/* Tiêu chí 4: Văn phong lễ tân */}
                      {renderCriterionCard(
                        '4. Văn phong xã hội (Pragmatics)',
                        latestTurnScores.pragmatics,
                        'Văn phong lịch thiệp, thái độ đúng mực, sử dụng câu đệm (sumimasen, onegaishimasu).',
                        70
                      )}
                    </div>

                    {/* AI Evidence Note */}
                    {latestTurnScores.note && (
                      <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3 text-[11px] text-blue-900 space-y-1 shadow-2xs">
                        <p className="font-bold text-[10px] uppercase tracking-wide text-blue-800 flex items-center gap-1">
                          <span>🔍</span> Ghi chú đánh giá của AI:
                        </p>
                        <p className="leading-relaxed">{latestTurnScores.note}</p>
                      </div>
                    )}

                    {/* Cơ chế thích ứng tiếp theo */}
                    <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-2.5 text-[10.5px] text-indigo-900 space-y-1">
                      <span className="font-bold text-[10px] uppercase tracking-wider text-indigo-800 block">
                        Cơ chế thích ứng cho lượt tiếp theo:
                      </span>
                      <p className="leading-relaxed">
                        {latestTurnScores.task >= 75 && latestTurnScores.grammar >= 75 && latestTurnScores.demonstratedBand === 'N3'
                          ? '🚀 Thể hiện chuẩn N3 xuất sắc (>=75đ) -> AI nâng câu hỏi lên bậc N3 ở tình huống tới.'
                          : latestTurnScores.task >= 60
                          ? '⚖️ Thể hiện đạt mức N4 vững vàng -> AI duy trì câu hỏi ở bậc N4 để thẩm định thêm.'
                          : '🎯 AI duy trì câu hỏi thích ứng để tiếp tục thu thập bằng chứng đánh giá.'}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-[var(--line)] p-4 text-center text-[11px] text-[var(--sumi-faint)]">
                    Chưa có lượt đối thoại nào được gửi. Hãy nhập câu chào hoặc bấm Mic để kiểm tra cách AI phân tích và chấm điểm 4 tiêu chí.
                  </div>
                )}
              </div>
            </div>
          </div>
        </aside>
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
            <div className="flex gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => void loadPlacementSession(true)}
                className="flex-1 rounded-xl border border-[var(--line)] py-2.5 text-xs font-bold text-[var(--sumi)] hover:border-[var(--ai)] hover:text-[var(--ai)] transition active:scale-95 cursor-pointer"
              >
                🔄 Thử lại bài mới
              </button>
              <button
                type="button"
                onClick={() => navigate('/scenarios')}
                className="flex-1 rounded-xl bg-[var(--ai)] py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[var(--ai-hover)] transition active:scale-95 cursor-pointer"
              >
                Về danh sách kịch bản
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
                onClick={() => navigate('/scenarios')}
                className="flex-1 rounded-xl bg-red-600 py-2 text-xs font-semibold text-white hover:bg-red-700 transition cursor-pointer"
              >
                Rời phòng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
