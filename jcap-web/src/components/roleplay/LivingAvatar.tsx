import React from 'react';

export type AvatarState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'cheering';
export type MouthViseme = 'closed' | 'A' | 'I' | 'U' | 'E' | 'O' | 'N';

export interface LivingAvatarProps {
  avatarState: AvatarState;
  personaName: string;
  personaRole?: string;
  currentViseme?: MouthViseme;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  isAizuchiActive?: boolean;
  hideLabel?: boolean;
}

export const LivingAvatar: React.FC<LivingAvatarProps> = ({
  avatarState,
  personaName = '',
  personaRole = '',
  currentViseme = 'closed',
  size = 'md',
  isAizuchiActive = false,
  hideLabel = false,
}) => {
  // Nhận diện bối cảnh và giới tính nhân vật từ tên/vai trò
  const textToAnalyze = `${personaName} ${personaRole}`.toLowerCase();
  
  const isMale = /nam|ông|anh|bác|thầy|sếp|ryusei|takehiro/.test(textToAnalyze);
  const isElderly = /cụ|già|ông lão|bà lão|trưởng bối/.test(textToAnalyze);
  const isRamenChef = /ramen|mì|quán ăn|nhà hàng|bếp|đầu bếp/.test(textToAnalyze);
  const isBusiness = /phỏng vấn|công ty|giám đốc|trưởng phòng|baito|tuyển dụng|đồng nghiệp/.test(textToAnalyze);

  // Kích thước container
  const getDimensions = () => {
    switch (size) {
      case 'sm':
        return 'w-9 h-9';
      case 'lg':
        return 'w-20 h-20 md:w-24 md:h-24';
      case 'xl':
        return 'w-28 h-28 md:w-32 md:h-32';
      case 'md':
      default:
        return 'w-14 h-14 md:w-16 md:h-16';
    }
  };

  // Đối với kích thước nhỏ (size sm trong chat bubble):
  // Render Huy hiệu Persona tinh tế (Neo-Tokyo / Ukiyo-e Kanji Badge) kèm Aura phát âm
  if (size === 'sm') {
    const getBadgeIcon = () => {
      if (isRamenChef) return '🍜';
      if (isBusiness) return '💼';
      if (isElderly) return '🍵';
      return isMale ? '🧑‍💼' : '👩‍💼';
    };

    return (
      <div className="relative flex items-center justify-center select-none">
        {avatarState === 'speaking' && (
          <span className="absolute -inset-1 rounded-full bg-sky-400/30 animate-ping opacity-75" />
        )}
        <div
          className={`relative ${getDimensions()} rounded-full flex items-center justify-center text-sm font-bold shadow-xs transition-transform duration-200 border-2 ${
            avatarState === 'speaking'
              ? 'border-sky-500 bg-gradient-to-tr from-sky-500 to-indigo-600 text-white scale-105 shadow-md shadow-sky-500/20'
              : 'border-slate-200/80 bg-gradient-to-tr from-slate-100 to-white text-slate-700 hover:border-slate-300'
          }`}
          title={personaName || 'AI Persona'}
        >
          <span className="text-base leading-none select-none">{getBadgeIcon()}</span>
        </div>
      </div>
    );
  }

  // --- RENDERING SVG CHO SIZE MD, LG, XL (SÂN KHẤU CHÍNH & BANNER) ---

  // Miệng chuẩn Anime/Manga theo Viseme
  const renderMouth = () => {
    switch (currentViseme) {
      case 'A':
        return (
          <g>
            <ellipse cx="50" cy="62" rx="4.5" ry="5.5" fill="#e11d48" />
            <path d="M46 60 Q50 62 54 60" stroke="#881337" strokeWidth="1" fill="none" />
            <ellipse cx="50" cy="64.5" rx="3.2" ry="2" fill="#f43f5e" opacity="0.8" />
          </g>
        );
      case 'I':
        return (
          <g>
            <path d="M44 61.5 C46 60.5 54 60.5 56 61.5 C55 63.5 45 63.5 44 61.5 Z" fill="#e11d48" />
            <path d="M43 61.5 Q50 63 57 61.5" stroke="#9f1239" strokeWidth="1.2" fill="none" strokeLinecap="round" />
          </g>
        );
      case 'U':
        return (
          <g>
            <circle cx="50" cy="62" r="3" fill="#e11d48" />
            <circle cx="50" cy="62" r="1.5" fill="#881337" />
          </g>
        );
      case 'E':
        return (
          <g>
            <ellipse cx="50" cy="61.5" rx="4.8" ry="3.5" fill="#e11d48" />
            <path d="M45 60.5 Q50 62 55 60.5" stroke="#881337" strokeWidth="1" fill="none" />
          </g>
        );
      case 'O':
        return (
          <g>
            <ellipse cx="50" cy="62.5" rx="4" ry="4.8" fill="#e11d48" />
            <ellipse cx="50" cy="63.5" rx="2.5" ry="2" fill="#881337" />
          </g>
        );
      case 'N':
      case 'closed':
      default:
        return (
          <path
            d={avatarState === 'cheering' ? 'M45 61 Q50 65 55 61' : 'M46 61.5 Q50 63 54 61.5'}
            stroke="#be123c"
            strokeWidth="1.8"
            strokeLinecap="round"
            fill="none"
          />
        );
    }
  };

  // Đôi mắt Anime/Manga có chiều sâu và cảm xúc
  const renderEyes = () => {
    if (avatarState === 'cheering') {
      // Mắt cười híp hình cung trăng đáng yêu (^ ^)
      return (
        <g>
          <path d="M36 46 C38 41 43 41 45 46" stroke="#0f172a" strokeWidth="2.4" strokeLinecap="round" fill="none" />
          <path d="M55 46 C57 41 62 41 64 46" stroke="#0f172a" strokeWidth="2.4" strokeLinecap="round" fill="none" />
          {/* Lông mi nhẹ */}
          <path d="M44.5 43.5 L46.5 41.5" stroke="#0f172a" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M63.5 43.5 L65.5 41.5" stroke="#0f172a" strokeWidth="1.5" strokeLinecap="round" />
        </g>
      );
    }

    if (avatarState === 'thinking') {
      // Mắt ngước nhìn suy nghĩ
      return (
        <g>
          {/* Mắt trái */}
          <ellipse cx="40" cy="45" rx="4.5" ry="5.5" fill="#1e293b" />
          <ellipse cx="40" cy="44" rx="3.5" ry="4" fill="#0284c7" />
          <circle cx="41.5" cy="42.5" r="1.6" fill="#ffffff" />
          <circle cx="38.5" cy="45.5" r="0.9" fill="#ffffff" opacity="0.8" />
          <path d="M35 40.5 Q40 39.5 45 41" stroke="#0f172a" strokeWidth="2" strokeLinecap="round" fill="none" />

          {/* Mắt phải */}
          <ellipse cx="60" cy="45" rx="4.5" ry="5.5" fill="#1e293b" />
          <ellipse cx="60" cy="44" rx="3.5" ry="4" fill="#0284c7" />
          <circle cx="61.5" cy="42.5" r="1.6" fill="#ffffff" />
          <circle cx="58.5" cy="45.5" r="0.9" fill="#ffffff" opacity="0.8" />
          <path d="M55 41 Q60 39.5 65 40.5" stroke="#0f172a" strokeWidth="2" strokeLinecap="round" fill="none" />
        </g>
      );
    }

    // Mắt mở sáng ngời (Listening, Speaking, Idle)
    return (
      <g>
        {/* Mắt trái */}
        <ellipse cx="40" cy="46" rx="4.8" ry="6" fill="#0f172a" />
        <ellipse cx="40" cy="46.5" rx="3.8" ry="4.5" fill={isMale ? '#1e3a8a' : '#0369a1'} />
        {/* Điểm sáng catchlight lung linh */}
        <circle cx="41.8" cy="44" r="1.8" fill="#ffffff" />
        <circle cx="38.5" cy="48" r="0.9" fill="#ffffff" opacity="0.75" />
        {/* Viền mi mắt trên thanh tú */}
        <path d="M35 42 C37 40 43 40 45.5 42" stroke="#0f172a" strokeWidth="2.2" strokeLinecap="round" fill="none" />
        {!isMale && <path d="M45 41.5 L47 39.5" stroke="#0f172a" strokeWidth="1.5" strokeLinecap="round" />}

        {/* Mắt phải */}
        <ellipse cx="60" cy="46" rx="4.8" ry="6" fill="#0f172a" />
        <ellipse cx="60" cy="46.5" rx="3.8" ry="4.5" fill={isMale ? '#1e3a8a' : '#0369a1'} />
        <circle cx="61.8" cy="44" r="1.8" fill="#ffffff" />
        <circle cx="58.5" cy="48" r="0.9" fill="#ffffff" opacity="0.75" />
        <path d="M54.5 42 C57 40 63 40 65 42" stroke="#0f172a" strokeWidth="2.2" strokeLinecap="round" fill="none" />
        {!isMale && <path d="M64.5 41.5 L66.5 39.5" stroke="#0f172a" strokeWidth="1.5" strokeLinecap="round" />}
      </g>
    );
  };

  return (
    <div className="flex flex-col items-center select-none">
      <div className={`relative ${getDimensions()}`}>
        {/* Vòng hào quang tương tác khi nói / nghe */}
        {avatarState === 'speaking' && (
          <div className="absolute -inset-1.5 rounded-full bg-gradient-to-r from-sky-400 to-indigo-500 animate-ping opacity-40 pointer-events-none" />
        )}
        {avatarState === 'listening' && (
          <div className="absolute -inset-1 rounded-full border-2 border-emerald-400 animate-pulse pointer-events-none" />
        )}

        {/* Khung Portrait Tròn Ukiyo-e */}
        <div
          className={`w-full h-full rounded-full bg-gradient-to-b from-amber-50/80 via-white to-sky-50/60 border-2 shadow-sm overflow-hidden flex items-center justify-center transition-all duration-300 ${
            avatarState === 'speaking'
              ? 'border-sky-500 shadow-md shadow-sky-200'
              : 'border-slate-200 hover:border-slate-300'
          } ${avatarState === 'idle' ? 'animate-breathing' : ''}`}
        >
          <svg viewBox="0 0 100 100" className="w-full h-full">
            <defs>
              <linearGradient id="skinGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#fffbf5" />
                <stop offset="100%" stopColor="#ffeedd" />
              </linearGradient>
              <linearGradient id="hairGradFemale" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#334155" />
                <stop offset="100%" stopColor="#1e293b" />
              </linearGradient>
              <linearGradient id="hairGradMale" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#1e293b" />
                <stop offset="100%" stopColor="#0f172a" />
              </linearGradient>
            </defs>

            {/* Tóc sau (Back hair) */}
            {!isMale ? (
              <path
                d="M23 45 C21 28 35 15 50 15 C65 15 79 28 77 45 C78 68 74 86 66 94 C50 96 34 94 24 86 Z"
                fill="url(#hairGradFemale)"
              />
            ) : (
              <path
                d="M26 44 C24 28 36 18 50 18 C64 18 76 28 74 44 C75 62 72 75 66 84 C50 86 34 84 26 75 Z"
                fill="url(#hairGradMale)"
              />
            )}

            {/* Cổ áo & Trang phục theo bối cảnh */}
            <path d="M38 78 L50 86 L62 78 L62 100 L38 100 Z" fill="#f8fafc" />
            {isRamenChef ? (
              // Tạp dề / Đồng phục quán ăn Nhật
              <g>
                <path d="M30 84 L50 92 L70 84 L74 100 L26 100 Z" fill="#0f172a" />
                <path d="M44 86 L50 90 L56 86 L50 84 Z" fill="#e11d48" />
              </g>
            ) : isBusiness ? (
              // Cổ áo sơ mi & Vest công sở
              <g>
                <path d="M26 84 L50 96 L74 84 L76 100 L24 100 Z" fill="#1e293b" />
                <polygon points="50,88 47,100 53,100" fill="#0284c7" />
              </g>
            ) : (
              // Trang phục thường nhật thanh lịch
              <path d="M28 85 C36 82 64 82 72 85 L75 100 L25 100 Z" fill="#3b82f6" />
            )}

            {/* Khuôn mặt V-line thanh tú (Thon gọn, tỷ lệ chuẩn anime) */}
            <path
              d="M27 42 C27 26 40 22 50 22 C60 22 73 26 73 42 C73 60 62 74 50 77 C38 74 27 60 27 42 Z"
              fill="url(#skinGrad)"
            />

            {/* Má hồng Sakura e ấp dịu dàng */}
            <ellipse cx="33" cy="53" rx="4.5" ry="2.2" fill="#fb7185" opacity="0.45" />
            <ellipse cx="67" cy="53" rx="4.5" ry="2.2" fill="#fb7185" opacity="0.45" />

            {/* Lông mày thanh tú */}
            <path
              d={avatarState === 'thinking' ? 'M35 37 Q40 34 45 37' : 'M35 37.5 Q40 36 45 37.5'}
              stroke="#334155"
              strokeWidth="1.6"
              strokeLinecap="round"
              fill="none"
            />
            <path
              d={avatarState === 'thinking' ? 'M55 37 Q60 34 65 37' : 'M55 37.5 Q60 36 65 37.5'}
              stroke="#334155"
              strokeWidth="1.6"
              strokeLinecap="round"
              fill="none"
            />

            {/* Mũ / Băng đô quán Ramen (Tenugui) nếu là tiệm mì */}
            {isRamenChef && (
              <g>
                <path d="M26 31 C34 26 66 26 74 31 L75 37 C67 32 33 32 25 37 Z" fill="#0f172a" />
                <circle cx="50" cy="33.5" r="2.2" fill="#e11d48" />
              </g>
            )}

            {/* Đôi mắt */}
            {renderEyes()}

            {/* Sống mũi nhỏ chuẩn Anime */}
            <path d="M50 51 L49 54" stroke="#e2b997" strokeWidth="1.2" strokeLinecap="round" fill="none" />

            {/* Miệng biến đổi linh hoạt theo Viseme */}
            {renderMouth()}

            {/* Tóc mái phía trước (Front Bangs) tinh xảo */}
            {!isMale ? (
              <g fill="url(#hairGradFemale)">
                {/* Lọn tóc mái rẽ ngôi tự nhiên */}
                <path d="M26 36 C34 26 66 26 74 36 C71 39 67 43 64 42 C58 38 56 46 51 45 C46 46 43 38 37 42 C33 44 29 40 26 36 Z" />
                {/* Tóc mai hai bên thon thả */}
                <path d="M26 38 C28 48 29 58 31 62 C29 60 27 50 25 40 Z" />
                <path d="M74 38 C72 48 71 58 69 62 C71 60 73 50 75 40 Z" />
              </g>
            ) : (
              <g fill="url(#hairGradMale)">
                <path d="M26 36 C32 27 68 27 74 36 C69 40 62 38 56 42 C51 39 46 43 40 40 C34 43 28 39 26 36 Z" />
              </g>
            )}
          </svg>
        </div>

        {/* Bong bóng Aizuchi ("うんうん...") */}
        {isAizuchiActive && (
          <div className="absolute -top-2.5 -right-2 px-2 py-0.5 rounded-full bg-white border border-sky-400 text-[10px] font-bold text-sky-700 shadow-sm animate-bounce whitespace-nowrap">
            うんうん..
          </div>
        )}
      </div>

      {!hideLabel && (
        <div className="text-center mt-2 max-w-[180px]">
          <h4 className="text-xs md:text-sm font-bold text-slate-800 leading-tight">
            {personaName || 'AI Persona'}
          </h4>
          {personaRole && (
            <p className="text-[10px] md:text-[11px] text-slate-500 mt-0.5">{personaRole}</p>
          )}
        </div>
      )}
    </div>
  );
};
