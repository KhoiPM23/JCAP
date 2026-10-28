import React from 'react';

export type AvatarState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'cheering';
export type MouthViseme = 'closed' | 'A' | 'I' | 'U' | 'E' | 'O' | 'N';

export interface LivingAvatarProps {
  avatarState: AvatarState;
  personaName: string;
  personaRole?: string;
  currentViseme?: MouthViseme;
  size?: 'sm' | 'md' | 'lg';
  isAizuchiActive?: boolean;
}

export const LivingAvatar: React.FC<LivingAvatarProps> = ({
  avatarState,
  personaName,
  personaRole,
  currentViseme = 'closed',
  size = 'md',
  isAizuchiActive = false,
}) => {
  const getContainerDimensions = () => {
    switch (size) {
      case 'sm':
        return 'w-12 h-12';
      case 'lg':
        return 'w-24 h-24 md:w-32 md:h-32';
      case 'md':
      default:
        return 'w-16 h-16 md:w-20 md:h-20';
    }
  };

  // Tính toán hình dáng miệng dựa trên viseme
  const renderMouth = () => {
    switch (currentViseme) {
      case 'A': // Miệng mở rộng hình oval dọc
        return <ellipse cx="50" cy="62" rx="7" ry="6" fill="#c63a24" />;
      case 'I': // Miệng mở rộng ngang dẹt
        return <rect x="42" y="60" width="16" height="3.5" rx="1.8" fill="#c63a24" />;
      case 'U': // Miệng chúm tròn nhỏ
        return <circle cx="50" cy="62" r="4" fill="#c63a24" />;
      case 'E': // Miệng hơi mở ngang
        return <rect x="44" y="60.5" width="12" height="4.5" rx="2.2" fill="#c63a24" />;
      case 'O': // Miệng tròn to
        return <ellipse cx="50" cy="62" rx="6" ry="6.5" fill="#c63a24" />;
      case 'N': // Môi khép nhẹ
      case 'closed':
      default:
        return <path d="M44 61 Q50 64 56 61" stroke="#13204a" strokeWidth="2.2" fill="none" strokeLinecap="round" />;
    }
  };

  // Tính toán đôi mắt
  const renderEyes = () => {
    if (avatarState === 'cheering') {
      // Đôi mắt cười híp dạng cong (^ ^)
      return (
        <>
          <path d="M35 45 Q40 40 45 45" stroke="#13204a" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          <path d="M55 45 Q60 40 65 45" stroke="#13204a" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        </>
      );
    }

    if (avatarState === 'thinking') {
      // Mắt liếc nhẹ lên trên
      return (
        <>
          <ellipse cx="40" cy="43" rx="4" ry="4.5" fill="#13204a" />
          <ellipse cx="60" cy="43" rx="4" ry="4.5" fill="#13204a" />
          <circle cx="41.5" cy="41.5" r="1.5" fill="#ffffff" />
          <circle cx="61.5" cy="41.5" r="1.5" fill="#ffffff" />
        </>
      );
    }

    // Bình thường / Listening / Speaking: mắt mở sáng ngời
    return (
      <>
        <ellipse cx="40" cy="45" rx="4.5" ry="5" fill="#13204a" />
        <ellipse cx="60" cy="45" rx="4.5" ry="5" fill="#13204a" />
        <circle cx="41.5" cy="43" r="1.8" fill="#ffffff" />
        <circle cx="61.5" cy="43" r="1.8" fill="#ffffff" />
      </>
    );
  };

  return (
    <div className="flex flex-col items-center select-none">
      <div className={`relative ${getContainerDimensions()}`}>
        {/* Vòng hào quang tương tác khi AI đang nói hoặc lắng nghe */}
        {avatarState === 'speaking' && (
          <div className="absolute inset-0 rounded-full bg-[var(--ai-soft)] animate-ping opacity-60 pointer-events-none" />
        )}
        {avatarState === 'listening' && (
          <div className="absolute inset-0 rounded-full border-2 border-emerald-400 animate-pulse pointer-events-none" />
        )}

        {/* Khối Avatar SVG chính */}
        <div
          className={`w-full h-full rounded-full bg-gradient-to-br from-[var(--paper-100)] to-[var(--paper-200)] border-2 border-[var(--line)] shadow-sm overflow-hidden flex items-center justify-center transition-transform duration-300 ${
            avatarState === 'idle' ? 'animate-breathing' : ''
          } ${avatarState === 'listening' ? 'rotate-2 scale-102' : ''}`}
        >
          <svg viewBox="0 0 100 100" className="w-full h-full">
            {/* Tóc sau */}
            <path d="M22 45 Q50 18 78 45 Q82 72 70 88 Q50 92 30 88 Q18 72 22 45 Z" fill="#274a78" />

            {/* Khuôn mặt */}
            <circle cx="50" cy="52" r="28" fill="#fff7ed" />

            {/* Má hồng Ukiyo-e */}
            <ellipse cx="33" cy="54" rx="4" ry="2.5" fill="#fecaca" opacity="0.65" />
            <ellipse cx="67" cy="54" rx="4" ry="2.5" fill="#fecaca" opacity="0.65" />

            {/* Mắt */}
            {renderEyes()}

            {/* Lông mày */}
            <path
              d={avatarState === 'thinking' ? 'M35 37 Q40 35 45 38' : 'M35 38 Q40 37 45 38'}
              stroke="#13204a"
              strokeWidth="1.8"
              strokeLinecap="round"
              fill="none"
            />
            <path
              d={avatarState === 'thinking' ? 'M55 38 Q60 35 65 37' : 'M55 38 Q60 37 65 38'}
              stroke="#13204a"
              strokeWidth="1.8"
              strokeLinecap="round"
              fill="none"
            />

            {/* Miệng biến đổi theo viseme */}
            {renderMouth()}

            {/* Tóc mái trước */}
            <path d="M28 35 Q50 25 72 35 Q65 42 58 40 Q50 44 42 40 Q35 43 28 35 Z" fill="#274a78" />
          </svg>
        </div>

        {/* Bong bóng biểu cảm Aizuchi (頷き) khi người học đang nói: "なるほど", "うんうん" */}
        {isAizuchiActive && (
          <div className="absolute -top-3 -right-2 px-2 py-0.5 rounded-full bg-white border border-[var(--ai)]/30 text-[10px] font-bold text-[var(--ai)] shadow-sm animate-bounce whitespace-nowrap">
            うんうん..
          </div>
        )}
      </div>

      {size !== 'sm' && (
        <div className="text-center mt-2">
          <h4 className="text-sm font-bold text-[var(--sumi)] leading-tight">{personaName || 'Nhân vật AI'}</h4>
          {personaRole && <p className="text-[11px] text-[var(--sumi-muted)]">{personaRole}</p>}
        </div>
      )}
    </div>
  );
};
