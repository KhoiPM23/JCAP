import React, { useEffect, useRef } from 'react';
import type { RoleplayMessageDto } from '../../types/roleplay';
import { ukiyoSound } from '../../utils/ukiyoSoundEngine';

export interface RoleplayConversationStreamProps {
  messages: RoleplayMessageDto[];
  scenarioContext?: string;
  showFurigana: boolean;
  showVietnamese: boolean;
  playingMessageId: number | null;
  onPlayAudio: (msg: RoleplayMessageDto) => void;
  selectedMessageId: number | null;
  onSelectUserMessage: (msg: RoleplayMessageDto) => void;
  onRedoTurn?: (msg: RoleplayMessageDto) => void;
  aiPersonaName?: string;
}

export const RoleplayConversationStream: React.FC<RoleplayConversationStreamProps> = ({
  messages,
  scenarioContext,
  showFurigana,
  showVietnamese,
  playingMessageId,
  onPlayAudio,
  selectedMessageId,
  onSelectUserMessage,
  onRedoTurn,
  aiPersonaName,
}) => {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const renderJapaneseText = (msg: RoleplayMessageDto, isUser: boolean) => {
    if (showFurigana && msg.furiganaHtml) {
      return (
        <span
          className={isUser ? 'bubble-user text-base font-sans' : 'bubble-ai text-base font-sans'}
          dangerouslySetInnerHTML={{ __html: msg.furiganaHtml }}
        />
      );
    }
    return <span className="text-base font-sans leading-relaxed tracking-wide">{msg.japaneseText}</span>;
  };

  return (
    <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 space-y-5 bg-gradient-to-b from-[var(--paper-100)] to-[var(--paper-50)]">
      {/* Khối Banner Bối cảnh (Scene Context) */}
      {scenarioContext && (
        <div className="max-w-2xl mx-auto p-3.5 bg-white/90 backdrop-blur-xs rounded-2xl border border-[var(--line)] shadow-xs flex items-center gap-3 select-none">
          <div className="w-9 h-9 rounded-xl bg-[var(--ai-soft)] text-[var(--ai)] flex items-center justify-center flex-shrink-0">
            <span className="material-symbols-outlined text-xl">theater_comedy</span>
          </div>
          <p className="text-xs text-[var(--sumi-muted)] leading-relaxed">
            <strong className="text-[var(--sumi)] font-bold">Bối cảnh:</strong> {scenarioContext}
          </p>
        </div>
      )}

      {/* Luồng tin nhắn hội thoại */}
      {messages.map((msg, idx) => {
        const isAi = msg.sender?.toLowerCase() === 'ai';
        const isPlaying = playingMessageId === msg.id;
        const isSelected = selectedMessageId === msg.id;

        return (
          <div
            key={msg.id || idx}
            className={`flex w-full ${isAi ? 'justify-start' : 'justify-end'} animate-slide-up`}
          >
            {/* Tin nhắn của AI */}
            {isAi && (
              <div className="flex items-start gap-2.5 max-w-xl">
                <div className="w-8 h-8 rounded-full bg-[var(--ai-soft)] text-[var(--ai)] flex items-center justify-center flex-shrink-0 border border-[var(--ai)]/20 mt-1">
                  <span className="material-symbols-outlined text-base">smart_toy</span>
                </div>

                <div className="flex flex-col gap-1 items-start">
                  <span className="text-[11px] font-bold text-[var(--sumi-muted)] px-1">
                    {aiPersonaName || 'Nhân vật AI'}
                  </span>

                  <div className="p-4 rounded-2xl rounded-tl-xs bg-white border border-[var(--line)] shadow-xs text-[var(--sumi)] relative group">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">{renderJapaneseText(msg, false)}</div>

                      <button
                        type="button"
                        onClick={() => {
                          ukiyoSound.playSubtleTap();
                          onPlayAudio(msg);
                        }}
                        className={`p-1.5 rounded-lg transition cursor-pointer flex-shrink-0 ${
                          isPlaying
                            ? 'bg-[var(--ai)] text-white'
                            : 'text-[var(--ai)] hover:bg-[var(--ai-soft)]'
                        }`}
                        title="Nghe phát âm"
                      >
                        <span className="material-symbols-outlined text-base">
                          {isPlaying ? 'volume_up' : 'volume_mute'}
                        </span>
                      </button>
                    </div>

                    {/* Dịch nghĩa tiếng Việt */}
                    {showVietnamese && msg.vietnameseMeaning && (
                      <p className="text-xs text-[var(--sumi-muted)] mt-2 pt-2 border-t border-slate-100 italic">
                        {msg.vietnameseMeaning}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Tin nhắn của Người học (User) */}
            {!isAi && (
              <div className="flex flex-col gap-1 items-end max-w-xl">
                <span className="text-[11px] font-bold text-slate-500 px-1">Bạn</span>

                <div
                  onClick={() => {
                    ukiyoSound.playSubtleTap();
                    onSelectUserMessage(msg);
                  }}
                  className={`p-4 rounded-2xl rounded-tr-xs transition cursor-pointer relative shadow-xs border ${
                    isSelected
                      ? 'bg-blue-900 text-white border-blue-950 ring-2 ring-blue-400'
                      : 'bg-slate-900 text-white border-slate-950 hover:bg-slate-800'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">{renderJapaneseText(msg, true)}</div>

                    {/* Huy hiệu điểm lượt nói */}
                    {msg.linguisticFeedback?.speechDelivery?.turnFluencyScore && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-white/20 text-white">
                        {msg.linguisticFeedback.speechDelivery.turnFluencyScore}đ
                      </span>
                    )}
                  </div>

                  {/* Dịch nghĩa tiếng Việt */}
                  {showVietnamese && msg.vietnameseMeaning && (
                    <p className="text-xs text-blue-200/90 mt-2 pt-2 border-t border-white/10 italic">
                      {msg.vietnameseMeaning}
                    </p>
                  )}

                  {/* Nhãn Kintsugi nếu có lỗi chuyển dịch được phát hiện */}
                  {msg.linguisticFeedback?.grammarAccuracy?.errors &&
                    msg.linguisticFeedback.grammarAccuracy.errors.length > 0 && (
                      <div className="mt-2.5 px-2 py-1 rounded-lg bg-amber-500/20 border border-amber-400/40 text-[11px] text-amber-200 flex items-center justify-between">
                        <span className="flex items-center gap-1">
                          <span className="material-symbols-outlined text-xs text-amber-400">auto_fix_high</span>
                          <span>Bấm để xem nhận xét sửa câu</span>
                        </span>
                        {onRedoTurn && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              ukiyoSound.playWoodblockSnap();
                              onRedoTurn(msg);
                            }}
                            className="px-2 py-0.5 rounded bg-amber-400/30 hover:bg-amber-400/50 text-white font-bold text-[10px]"
                          >
                            Nói lại ↻
                          </button>
                        )}
                      </div>
                    )}
                </div>
              </div>
            )}
          </div>
        );
      })}

      <div ref={bottomRef} />
    </div>
  );
};
