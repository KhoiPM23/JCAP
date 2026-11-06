import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LivingAvatar } from '../components/roleplay/LivingAvatar';

interface ChatMessage {
  id: number;
  sender: 'Ai' | 'User';
  japaneseText: string;
  vietnameseMeaning?: string;
  furiganaHtml?: string;
  isCurrentSpeaking?: boolean;
}

export const PlacementTestRoomView: React.FC = () => {
  const navigate = useNavigate();

  // State điều khiển giao diện
  const [isLeftOpen, setIsLeftOpen] = useState(true);
  const [isHandsFreeMode, setIsHandsFreeMode] = useState(true);
  const [showTranslation, setShowTranslation] = useState(true);
  const [showFurigana, setShowFurigana] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [inputText, setInputText] = useState('');

  // Mock lịch sử hội thoại chuẩn của bài Placement Test (Kịch bản Khách sạn Sakura)
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 1,
      sender: 'Ai',
      japaneseText: 'いらっしゃいませ。ホテルさくらへようこそ。本日のチェックインでいらっしゃいますか？',
      vietnameseMeaning:
        'Xin kính chào quý khách! Chào mừng quý khách đến với Khách sạn Sakura. Quý khách làm thủ tục nhận phòng hôm nay phải không ạ?',
      furiganaHtml:
        'いらっしゃいませ。ホテルさくらへようこそ。<ruby>本日<rt>ほんじつ</rt></ruby>のチェックインでいらっしゃいますか？',
    },
    {
      id: 2,
      sender: 'User',
      japaneseText: 'はい、チェックインをお願いします。3泊で予約している田中です。',
      vietnameseMeaning: 'Vâng, tôi muốn làm thủ tục nhận phòng. Tôi là Tanaka, đã đặt phòng 3 đêm.',
    },
    {
      id: 3,
      sender: 'Ai',
      japaneseText:
        '田中様、ご予約ありがとうございます。現在のお部屋は512号室で、エレベーターのすぐ近くにございますが、こちらでよろしいでしょうか？',
      vietnameseMeaning:
        'Cảm ơn quý khách Tanaka. Hiện phòng chuẩn bị là phòng 512 cạnh thang máy, quý khách thấy phòng này có ổn không ạ?',
      furiganaHtml:
        '<ruby>田中<rt>たなか</rt></ruby><ruby>様<rt>さま</rt></ruby>、ご<ruby>予約<rt>よやく</rt></ruby>ありがとうございます。<ruby>現在<rt>げんざい</rt></ruby>のお<ruby>部屋<rt>へや</rt></ruby>は<span class="font-bold text-red-600">512号室</span>で、<span class="font-bold text-amber-600">エレベーターのすぐ近く</span>にございますが、こちらのお部屋でよろしいでしょうか？',
      isCurrentSpeaking: true,
    },
  ]);

  // Xử lý gửi tin nhắn mock để người dùng tương tác thử
  const handleSendMessage = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim()) return;

    const newMsg: ChatMessage = {
      id: Date.now(),
      sender: 'User',
      japaneseText: inputText.trim(),
      vietnameseMeaning: 'Tin nhắn gửi thử từ người dùng.',
    };

    setMessages((prev) => [...prev, newMsg]);
    setInputText('');
  };

  // Click vào gợi ý mẫu câu để điền nhanh vào ô nhập
  const handleSelectCue = (cueText: string) => {
    setInputText(cueText);
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-50 font-sans text-slate-800">
      {/* ========================================================================= */}
      {/* 1. TOP HEADER BAR (Chuẩn theo RoleplayPracticeView)                        */}
      {/* ========================================================================= */}
      <header className="z-30 flex h-14 sm:h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white/95 px-3 sm:px-4 md:px-6 shadow-xs backdrop-blur-sm">
        {/* Left: Nút rời phòng & Thông tin kịch bản */}
        <div className="mr-2 sm:mr-4 flex min-w-0 flex-1 items-center gap-2 overflow-hidden sm:gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-blue-500 hover:text-blue-600 active:scale-95 cursor-pointer"
            title="Quay lại danh sách kịch bản"
          >
            <span>←</span>
            <span>Rời phòng</span>
          </button>

          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3 overflow-hidden">
            <div className="shrink-0 aspect-square flex items-center justify-center rounded-full border border-stone-200 bg-white p-1 shadow-2xs">
              <LivingAvatar
                size="sm"
                avatarState="idle"
                personaName="フロント 山田"
                personaRole="Lễ tân"
                scenarioTitle="Khách sạn Sakura"
                archetype="hospitality"
                hideLabel
              />
            </div>
            <div className="min-w-0 flex-1 overflow-hidden">
              <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
                <h1 className="truncate text-xs font-bold leading-tight text-slate-900 sm:text-sm">
                  Khách sạn Sakura (ホテルさくら)
                </h1>
                <span className="shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                  N5 〜 N3
                </span>
              </div>
              <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] text-slate-500">
                <span className="hidden shrink-0 sm:inline">Đối thoại cùng:</span>
                <span className="truncate font-semibold text-slate-700">Lễ tân Yamada (フロント 山田)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Controls chuẩn Scenario */}
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          {/* Nút Rảnh tay */}
          <button
            type="button"
            onClick={() => setIsHandsFreeMode(!isHandsFreeMode)}
            className={`inline-flex shrink-0 items-center gap-1 sm:gap-1.5 rounded-xl border px-2 sm:px-2.5 py-1.5 text-xs font-bold transition shadow-2xs cursor-pointer ${
              isHandsFreeMode
                ? 'border-blue-500 bg-blue-50 text-blue-700 ring-1 ring-blue-500/30'
                : 'border-slate-200 bg-white text-slate-500 hover:border-blue-400'
            }`}
          >
            <span>📞</span>
            <span className="hidden sm:inline">Rảnh tay</span>
            <span
              className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                isHandsFreeMode ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'
              }`}
            >
              {isHandsFreeMode ? 'BẬT' : 'TẮT'}
            </span>
          </button>

          {/* Toggle Cột Bối cảnh bên trái */}
          <button
            type="button"
            onClick={() => setIsLeftOpen(!isLeftOpen)}
            className={`inline-flex shrink-0 items-center gap-1 sm:gap-1.5 rounded-xl border px-2 sm:px-2.5 py-1.5 text-xs font-semibold transition cursor-pointer ${
              isLeftOpen
                ? 'border-blue-500 bg-blue-50 text-blue-700'
                : 'border-slate-200 bg-white text-slate-600 hover:border-blue-400'
            }`}
            title="Ẩn/Hiện Bảng bối cảnh phòng & khách sạn"
          >
            <span>🏨</span>
            <span className="hidden lg:inline">Bối cảnh</span>
          </button>

          {/* Dropdown Cài đặt */}
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setIsSettingsOpen(!isSettingsOpen)}
              className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-blue-400 cursor-pointer"
            >
              <span>⚙️</span>
              <span className="hidden lg:inline">Cài đặt</span>
            </button>

            {isSettingsOpen && (
              <div className="absolute right-0 top-full mt-2 z-50 w-72 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl text-xs space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="font-bold text-slate-800">Cài đặt hiển thị</span>
                  <button
                    type="button"
                    onClick={() => setIsSettingsOpen(false)}
                    className="text-slate-400 hover:text-slate-700 cursor-pointer font-bold"
                  >
                    ✕
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <span>Dịch nghĩa tiếng Việt</span>
                  <input
                    type="checkbox"
                    checked={showTranslation}
                    onChange={(e) => setShowTranslation(e.target.checked)}
                    className="cursor-pointer"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span>Phiên âm Furigana</span>
                  <input
                    type="checkbox"
                    checked={showFurigana}
                    onChange={(e) => setShowFurigana(e.target.checked)}
                    className="cursor-pointer"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Nút Tạm dừng rời phòng */}
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="inline-flex shrink-0 items-center rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 cursor-pointer"
          >
            Tạm dừng
          </button>
        </div>
      </header>

      {/* ========================================================================= */}
      {/* 2. BODY WORKSPACE (2-COLUMN LAYOUT)                                       */}
      {/* ========================================================================= */}
      <div className="relative flex flex-1 overflow-hidden">
        {/* ============================================================ */}
        {/* 2.A. LEFT SIDEBAR: BỐI CẢNH ĐẶT PHÒNG KHÁCH SẠN             */}
        {/* ============================================================ */}
        <aside
          className={`shrink-0 border-r border-slate-200 bg-white flex flex-col z-10 overflow-hidden transition-all duration-300 ease-in-out ${
            isLeftOpen ? 'w-80 opacity-100 shadow-xs' : 'w-0 border-r-0 opacity-0 pointer-events-none'
          }`}
        >
          <div className="w-80 flex flex-col h-full shrink-0">
            {/* Header sidebar */}
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 bg-slate-50">
              <div>
                <h2 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  BỐI CẢNH TÌNH HUỐNG
                </h2>
                <p className="text-xs font-bold text-slate-800 mt-0.5">
                  Phiếu Đặt Phòng &amp; Phòng Nghỉ
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsLeftOpen(false)}
                className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-500 hover:text-blue-600 cursor-pointer"
                title="Thu gọn cột bối cảnh"
              >
                <span>◀</span>
                <span>Thu gọn</span>
              </button>
            </div>

            {/* Content List: Voucher + 3 Room Options */}
            <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5 text-xs">
              {/* Card 1: Voucher Card */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 shadow-2xs space-y-2">
                <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
                  <span className="font-bold text-[10.5px] text-slate-600">PHIẾU ĐẶT: #SKR-9921</span>
                  <span className="text-[10px] font-semibold text-blue-600">Khách sạn Sakura</span>
                </div>
                <div className="space-y-1 text-[11.5px]">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Tên khách:</span>
                    <span className="font-bold text-slate-900">Tanaka (田中 様)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Thời gian:</span>
                    <span className="font-semibold text-slate-800">11/10 ～ 11/13 (3 đêm)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Loại phòng:</span>
                    <span className="font-semibold text-slate-800">Standard Room (18m²)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Bữa sáng:</span>
                    <span className="font-semibold text-rose-600">Chưa gồm (1,500¥/ngày)</span>
                  </div>
                </div>

                {/* Yêu cầu đặc biệt Callout */}
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-amber-900">
                  <p className="font-bold text-[10px] uppercase tracking-wide text-amber-700">
                    ⚠️ YÊU CẦU ĐẶC BIỆT KHI ĐẶT:
                  </p>
                  <p className="font-bold text-xs mt-0.5 text-amber-900">
                    「静かな部屋を希望」
                    <span className="font-normal text-[11px] text-amber-800 ml-1">
                      (Ưu tiên phòng yên tĩnh)
                    </span>
                  </p>
                  <p className="text-[10px] text-amber-700 mt-0.5">
                    Hãy lưu ý điểm này khi lễ tân xếp phòng cho bạn.
                  </p>
                </div>
              </div>

              {/* Card 2: 3 Room Options Comparison */}
              <div className="space-y-2">
                <span className="font-bold text-[11px] text-slate-600 uppercase tracking-wide">
                  Tình trạng các loại phòng
                </span>

                {/* Standard Room Card */}
                <div className="rounded-xl border border-amber-300 bg-amber-50/70 p-2.5 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900">Standard Room (18m²)</span>
                    <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[9.5px] font-bold text-rose-700">
                      Đang xếp: P.512
                    </span>
                  </div>
                  <p className="text-[11px] font-semibold text-amber-800">
                    📍 Cạnh thang máy (エレベーターの近く)
                  </p>
                  <p className="text-[10.5px] text-amber-900/80">Có thể bị ồn do khách qua lại.</p>
                  <p className="text-[10.5px] font-bold text-emerald-700">Phụ phí: +0 円</p>
                </div>

                {/* Deluxe Room Card */}
                <div className="rounded-xl border border-emerald-300 bg-emerald-50/70 p-2.5 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900">Deluxe Room (28m²)</span>
                    <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[9.5px] font-bold text-emerald-800">
                      Còn phòng trống
                    </span>
                  </div>
                  <p className="text-[11px] font-semibold text-emerald-800">
                    🌿 Rất yên tĩnh • Xa thang máy • Giường đôi
                  </p>
                  <p className="text-[10.5px] text-emerald-900/80">Đúng nguyện vọng phòng yên tĩnh của bạn.</p>
                  <p className="text-[10.5px] font-bold text-blue-600">
                    Phụ phí nâng hạng: +2,000 円 / đêm (+6,000 円/3 đêm)
                  </p>
                </div>

                {/* Twin Room Card */}
                <div className="rounded-xl border border-slate-200 bg-slate-100/70 p-2.5 space-y-1 opacity-75">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-600">Twin Room (25m²)</span>
                    <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[9.5px] font-bold text-slate-600">
                      Hết phòng (満室)
                    </span>
                  </div>
                  <p className="text-[10.5px] text-slate-500">2 giường đơn • Không thể xếp thêm</p>
                </div>
              </div>

              {/* Policy Note Footer */}
              <div className="rounded-xl bg-slate-100 p-2.5 text-[11px] text-slate-600 space-y-1">
                <p className="font-bold text-slate-700">Quy định khách sạn:</p>
                <p>• Nhận phòng từ 15:00 | Trả phòng trước 11:00</p>
                <p>• Bữa sáng: 7:00 – 10:00 (1,500 円/người)</p>
                <p className="text-[10.5px] font-semibold text-blue-600 pt-0.5">
                  Mẹo: Nói 「もう一度お願いします」 nếu cần nghe lại.
                </p>
              </div>
            </div>
          </div>
        </aside>

        {/* Nút mở rộng Sidebar khi đang thu gọn */}
        {!isLeftOpen && (
          <button
            type="button"
            onClick={() => setIsLeftOpen(true)}
            className="absolute top-4 left-0 z-30 flex items-center gap-1.5 rounded-r-xl border border-l-0 border-blue-200 bg-white px-3 py-2 text-xs font-bold text-blue-600 shadow-md hover:bg-blue-50 cursor-pointer"
            title="Mở rộng bối cảnh đặt phòng"
          >
            <span>🏨</span>
            <span>Bối cảnh phòng</span>
            <span>▶</span>
          </button>
        )}

        {/* ============================================================ */}
        {/* 2.B. CENTER COLUMN: UNIFIED SCENARIO CHAT STREAM             */}
        {/* ============================================================ */}
        <main className="flex flex-1 flex-col overflow-hidden bg-slate-100/50">
          {/* Vùng cuộn tin nhắn */}
          <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6">
            <div className="mx-auto w-full max-w-[780px] space-y-4">
              {/* Context Summary Banner (Giống kịch bản thường) */}
              <div className="rounded-2xl border border-slate-200 bg-white/90 px-4 py-2.5 shadow-2xs text-xs">
                <span className="font-bold text-[10px] uppercase tracking-wide text-blue-600">
                  BỐI CẢNH TÌNH HUỐNG
                </span>
                <p className="text-slate-700 text-[11.5px] leading-relaxed mt-0.5">
                  Bạn vừa đến sảnh khách sạn Sakura tại Tokyo sau chuyến bay dài và đến quầy lễ tân để làm thủ tục nhận phòng (Check-in).
                </p>
              </div>

              {/* Danh sách tin nhắn đối thoại */}
              {messages.map((msg) => {
                const isAi = msg.sender === 'Ai';

                return (
                  <div
                    key={msg.id}
                    className={`flex items-start gap-3 transition-all animate-fade-in ${
                      isAi ? '' : 'justify-end'
                    }`}
                  >
                    {/* Avatar AI bên trái bubble */}
                    {isAi && (
                      <div className="shrink-0 pt-0.5">
                        <LivingAvatar
                          size="sm"
                          avatarState={msg.isCurrentSpeaking ? 'speaking' : 'idle'}
                          personaName="フロント 山田"
                          scenarioTitle="Khách sạn Sakura"
                          archetype="hospitality"
                          hideLabel
                        />
                      </div>
                    )}

                    {/* Chat Bubble */}
                    <div
                      className={`relative max-w-[82%] rounded-2xl p-4 shadow-2xs ${
                        isAi
                          ? `rounded-tl-xs border bg-white text-slate-900 ${
                              msg.isCurrentSpeaking
                                ? 'border-blue-400 ring-2 ring-blue-100 shadow-md'
                                : 'border-slate-200'
                            }`
                          : 'rounded-tr-xs bg-blue-600 text-white shadow-sm'
                      }`}
                    >
                      {/* Bubble Header */}
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span
                          className={`text-[10px] font-bold ${
                            isAi ? 'text-slate-500' : 'text-blue-100'
                          }`}
                        >
                          {isAi ? 'Lễ tân Yamada' : 'Bạn (Tanaka)'}
                        </span>

                        {isAi && (
                          <div className="flex items-center gap-1.5">
                            {msg.isCurrentSpeaking && (
                              <span className="rounded bg-emerald-100 px-1.5 py-0.2 text-[9px] font-bold text-emerald-800">
                                ĐANG NÓI
                              </span>
                            )}
                            <button
                              type="button"
                              className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-200 cursor-pointer"
                              title="Nghe lại câu nói này"
                            >
                              🔊 Nghe lại
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Japanese Utterance with Furigana */}
                      <div className="text-sm sm:text-[15px] font-semibold leading-relaxed tracking-wide">
                        {showFurigana && msg.furiganaHtml ? (
                          <div
                            dangerouslySetInnerHTML={{ __html: msg.furiganaHtml }}
                            className="[&_rt]:text-[9px] [&_rt]:text-blue-500 [&_rt]:font-normal"
                          />
                        ) : (
                          <span>{msg.japaneseText}</span>
                        )}
                      </div>

                      {/* Vietnamese Meaning */}
                      {showTranslation && msg.vietnameseMeaning && (
                        <div
                          className={`mt-2 rounded-lg p-2 text-xs leading-relaxed ${
                            isAi ? 'bg-slate-50 text-slate-600' : 'bg-blue-700/60 text-blue-50'
                          }`}
                        >
                          💬 {msg.vietnameseMeaning}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Dải phân cách Lượt của bạn & Gợi ý câu nói chiến lược */}
              <div className="pt-2 space-y-2">
                <div className="relative flex items-center justify-center">
                  <div className="w-full border-t border-slate-200" />
                  <span className="absolute bg-slate-100/90 px-3 text-[10px] font-bold tracking-wider text-slate-500 rounded-full">
                    LƯỢT CỦA BẠN
                  </span>
                </div>

                {/* Gợi ý chiến lược giao tiếp (Bấm vào để điền thử vào ô nhập) */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="text-[11px] font-semibold text-slate-500">Mẫu câu tham khảo:</span>
                  <button
                    type="button"
                    onClick={() => handleSelectCue('ほかの静かな部屋はありますか？')}
                    className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:border-blue-400 hover:bg-blue-50/50 transition cursor-pointer"
                  >
                    「ほかの静かな部屋はありますか？」
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectCue('エレベーターから離れた部屋がいいです。')}
                    className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:border-blue-400 hover:bg-blue-50/50 transition cursor-pointer"
                  >
                    「エレベーターから離れた部屋がいいです」
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectCue('すみません、もう一度お願いします。')}
                    className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:border-blue-400 hover:bg-blue-50/50 transition cursor-pointer"
                  >
                    「もう一度お願いします」
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* ============================================================ */}
          {/* 2.C. BOTTOM STICKY INPUT BAR                                 */}
          {/* ============================================================ */}
          <div className="border-t border-slate-200 bg-white p-3 sm:p-4 shadow-lg">
            <div className="mx-auto w-full max-w-[780px] space-y-2">
              <form onSubmit={handleSendMessage} className="flex items-center gap-2 sm:gap-3">
                {/* Input Text Field */}
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="Nhập câu trả lời bằng tiếng Nhật... (Ví dụ: ほかの部屋に変えてもらえますか？)"
                    className="w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 pr-12 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
                  />
                  <button
                    type="submit"
                    disabled={!inputText.trim()}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-blue-700 disabled:opacity-40 cursor-pointer"
                  >
                    Gửi
                  </button>
                </div>

                {/* Big Mic Button */}
                <button
                  type="button"
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-blue-600 to-sky-600 text-white shadow-md hover:from-blue-700 hover:to-sky-700 active:scale-95 transition cursor-pointer"
                  title="Nhấn để nói (Chế độ Mic)"
                >
                  <span className="text-xl">🎤</span>
                </button>
              </form>

              {/* Sub-bar helper text */}
              <div className="flex items-center justify-between text-[11px] text-slate-500 px-1">
                <span>⌨️ Bạn có thể tự do gõ phím hoặc bấm Mic để nói. Hệ thống hỗ trợ cả hai phương thức.</span>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};
