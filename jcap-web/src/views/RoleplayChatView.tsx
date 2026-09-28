import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Scenario } from './ScenarioListView';
import { roleplayResultService } from '../services/roleplayResultService';

interface Message {
  id: number;
  sender: 'ai' | 'user';
  japaneseText: string;
  vietnameseMeaning: string;
  score?: number; // Điểm phát âm mô phỏng (cho lượt nói của user)
}

interface RoleplayChatViewProps {
  scenario: Scenario;
  onBack: () => void;
}

export const RoleplayChatView: React.FC<RoleplayChatViewProps> = ({ scenario, onBack }) => {
  const navigate = useNavigate();
  // 1. Danh sách tin nhắn hội thoại ban đầu
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1,
      sender: 'ai',
      japaneseText: 'いらっしゃいませ！何名様ですか？',
      vietnameseMeaning: 'Kính chào quý khách! Quý khách đi mấy người ạ?',
    },
  ]);

  // 2. Trạng thái thu âm (Đang bật hay tắt mic)
  const [isRecording, setIsRecording] = useState(false);
  const [inputCustomText, setInputCustomText] = useState('');
  const [isCompleting, setIsCompleting] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);

  // 3. Hàm mô phỏng bấm Micro ghi âm
  const handleToggleMic = () => {
    if (!isRecording) {
      // Bắt đầu thu âm
      setIsRecording(true);
    } else {
      // Dừng thu âm: Giả lập sinh ra câu nói của User và AI phản hồi
      setIsRecording(false);
      simulateUserSpeech('一人です。とんこつラーメンをください。', 'Tôi đi 1 người. Cho tôi 1 tô Tonkotsu Ramen.');
    }
  };

  // Giả lập đưa câu nói của user vào chat và AI tự động trả lời lại sau 1 giây
  const simulateUserSpeech = (jaText: string, viMeaning: string) => {
    const userMsgId = Date.now();
    const newUserMsg: Message = {
      id: userMsgId,
      sender: 'user',
      japaneseText: jaText,
      vietnameseMeaning: viMeaning,
      score: 92, // Giả lập điểm Azure Speech: 92/100
    };

    setMessages((prev) => [...prev, newUserMsg]);

    // Giả lập AI trả lời sau 1 giây
    setTimeout(() => {
      const newAiMsg: Message = {
        id: userMsgId + 1,
        sender: 'ai',
        japaneseText: 'かしこまりました。麺の硬さはいかがなさいますか？',
        vietnameseMeaning: 'Dạ tôi đã rõ. Quý khách muốn độ cứng của mì như thế nào ạ?',
      };
      setMessages((prev) => [...prev, newAiMsg]);
    }, 1200);
  };

  const handleSendText = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputCustomText.trim()) return;
    simulateUserSpeech(inputCustomText, '(Câu gõ tự do)');
    setInputCustomText('');
  };

  const handleCompleteSession = async () => {
    setIsCompleting(true);
    setCompleteError(null);

    // Phase 1: dùng scenario.id làm mock session id. Khi module của Hoàng merge,
    // thay giá trị này bằng id của RoleplaySession thật.
    const response = await roleplayResultService.completeSession(scenario.id);
    if (response.success && response.data) {
      navigate(`/roleplay/results/${response.data.resultId}`);
      return;
    }

    setCompleteError(response.message || 'Không thể hoàn tất phiên luyện tập.');
    setIsCompleting(false);
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      {/* Header phòng luyện nói */}
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center space-x-3">
          <button
            onClick={onBack}
            className="text-slate-600 hover:text-slate-900 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold hover:bg-slate-50 transition"
          >
            ← Quay lại
          </button>
          <div>
            <h2 className="text-sm font-bold text-slate-800 leading-tight">
              {scenario.title} ({scenario.level})
            </h2>
            <p className="text-[11px] text-slate-500">
              Đối thoại cùng: <span className="text-red-600 font-semibold">{scenario.aiRole}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <span className="text-[11px] bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full font-bold border border-emerald-200">
            ● AI Đang trực tuyến
          </span>
          <button
            type="button"
            onClick={handleCompleteSession}
            disabled={isCompleting}
            className="rounded-lg bg-[#0878EE] px-3 py-1.5 text-xs font-bold text-white transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isCompleting ? 'Đang tổng kết...' : 'Kết thúc phiên'}
          </button>
        </div>
      </header>

      {completeError ? (
        <div className="mx-auto mt-3 w-full max-w-2xl rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-700">
          {completeError}
        </div>
      ) : null}

      {/* Khung hiển thị các bong bóng chat */}
      <div className="flex-1 max-w-2xl w-full mx-auto p-4 space-y-4 overflow-y-auto">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex items-start space-x-3 ${
              msg.sender === 'user' ? 'flex-row-reverse space-x-reverse' : ''
            }`}
          >
            {/* Avatar */}
            <div
              className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                msg.sender === 'ai'
                  ? 'bg-red-600 text-white shadow-sm'
                  : 'bg-slate-800 text-white shadow-sm'
              }`}
            >
              {msg.sender === 'ai' ? 'AI' : 'Bạn'}
            </div>

            {/* Bong bóng tin nhắn */}
            <div
              className={`max-w-[78%] rounded-2xl p-3.5 shadow-sm ${
                msg.sender === 'ai'
                  ? 'bg-white text-slate-800 border border-slate-200 rounded-tl-none'
                  : 'bg-red-600 text-white rounded-tr-none'
              }`}
            >
              <p className="text-sm font-medium leading-relaxed">{msg.japaneseText}</p>
              <p
                className={`text-xs mt-1 border-t pt-1 ${
                  msg.sender === 'ai'
                    ? 'text-slate-400 border-slate-100'
                    : 'text-red-200 border-red-500/50'
                }`}
              >
                {msg.vietnameseMeaning}
              </p>

              {/* Nếu là user: Hiển thị điểm phát âm mẫu */}
              {msg.score && (
                <div className="mt-2 inline-flex items-center space-x-1 bg-white/20 px-2 py-0.5 rounded text-[10px] font-bold">
                  <span>🎯 Điểm phát âm:</span>
                  <span>{msg.score}/100</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Thanh điều khiển Micro & Gõ phím dưới đáy màn hình */}
      <footer className="bg-white border-t border-slate-200 p-4 sticky bottom-0">
        <div className="max-w-2xl mx-auto flex flex-col items-center space-y-3">
          {/* Nút bấm Micro Tương Tác */}
          <div className="flex items-center space-x-4">
            <button
              type="button"
              onClick={handleToggleMic}
              className={`flex items-center space-x-2 px-6 py-3 rounded-full font-bold text-sm shadow-lg transition-all transform active:scale-95 ${
                isRecording
                  ? 'bg-red-600 text-white animate-pulse shadow-red-300 ring-4 ring-red-100'
                  : 'bg-slate-900 hover:bg-red-600 text-white shadow-slate-300'
              }`}
            >
              <span className="text-base">{isRecording ? '⏹' : '🎙️'}</span>
              <span>{isRecording ? 'Đang nghe... (Bấm để gửi)' : 'Bấm Micro để nói tiếng Nhật'}</span>
            </button>
          </div>

          {/* Ô gõ text phụ trợ (nếu không dùng micro) */}
          <form onSubmit={handleSendText} className="w-full flex space-x-2">
            <input
              type="text"
              value={inputCustomText}
              onChange={(e) => setInputCustomText(e.target.value)}
              placeholder="Hoặc gõ câu tiếng Nhật vào đây để thử..."
              className="flex-1 px-4 py-2 border border-slate-200 rounded-xl text-xs outline-none focus:border-red-500 transition"
            />
            <button
              type="submit"
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
            >
              Gửi
            </button>
          </form>

          <p className="text-[11px] text-slate-400">
            * Bấm nút Micro ➔ bấm lại lần nữa để giả lập hoàn thành 1 lượt nói với AI.
          </p>
        </div>
      </footer>
    </div>
  );
};
