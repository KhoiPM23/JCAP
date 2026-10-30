import React from 'react';

export type AvatarState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'cheering' | 'bowing';
export type MouthViseme = 'closed' | 'A' | 'I' | 'U' | 'E' | 'O' | 'N';
export type ScenarioArchetype =
  | 'culinary'     // Tiệm mì Ramen, quán ăn, nhà hàng, izakaya, đầu bếp
  | 'business'     // Phỏng vấn, baito, công sở, tuyển dụng, giám đốc, đối tác
  | 'transit'      // Nhà ga, tàu điện, mua vé, shinkansen, sân bay
  | 'retail'       // Konbini (cửa hàng tiện lợi), siêu thị, thu ngân, mua sắm
  | 'hospitality'  // Ryokan, khách sạn, onsen, trà đạo, tiếp tân
  | 'medical'      // Bệnh viện, phòng khám, bác sĩ, y tá, dược sĩ
  | 'casual';      // Hằng ngày, bạn bè, bạn học, hàng xóm, dạo phố

export interface LivingAvatarProps {
  avatarState: AvatarState;
  personaName: string;
  personaRole?: string;
  scenarioTitle?: string;
  archetype?: ScenarioArchetype | string;
  currentViseme?: MouthViseme;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  isAizuchiActive?: boolean;
  hideLabel?: boolean;
}

export const LivingAvatar: React.FC<LivingAvatarProps> = ({
  avatarState,
  personaName = '',
  personaRole = '',
  scenarioTitle = '',
  archetype: propArchetype,
  currentViseme = 'closed',
  size = 'md',
  isAizuchiActive = false,
  hideLabel = false,
}) => {
  // Nhận diện bối cảnh đa dạng và giới tính nhân vật
  const textToAnalyze = `${personaName} ${personaRole} ${scenarioTitle}`.toLowerCase();
  
  const isMale = /nam|ông|anh|bác|thầy|sếp|ryusei|takehiro|cha|chú/.test(textToAnalyze);

  const resolveArchetype = (): ScenarioArchetype => {
    if (propArchetype) {
      const lower = propArchetype.toLowerCase();
      if (lower === 'train' || lower === 'transit') return 'transit';
      if (lower === 'konbini' || lower === 'retail') return 'retail';
      if (lower === 'office' || lower === 'business') return 'business';
      if (lower === 'zen' || lower === 'hospitality') return 'hospitality';
      if (lower === 'ramen' || lower === 'cafe' || lower === 'culinary') return 'culinary';
      if (lower === 'medical') return 'medical';
    }
    if (/ramen|mì|quán ăn|nhà hàng|bếp|đầu bếp|phục vụ|izakaya|sushi|ăn uống|món ăn|cafe|cà phê|pha chế|barista/.test(textToAnalyze)) {
      return 'culinary';
    }
    if (/phỏng vấn|tuyển dụng|baito|công ty|giám đốc|trưởng phòng|nhân sự|đồng nghiệp|văn phòng|kinh doanh|hội nghị|đối tác/.test(textToAnalyze)) {
      return 'business';
    }
    if (/ga|tàu|shinkansen|vé tàu|soát vé|nhà ga|chuyến bay|sân bay|hành khách|lái tàu|trạm|chuyến đi/.test(textToAnalyze)) {
      return 'transit';
    }
    if (/cửa hàng tiện lợi|tiện ích|konbini|siêu thị|thu ngân|tính tiền|mua sắm|cửa hàng|bán hàng|tạp hóa/.test(textToAnalyze)) {
      return 'retail';
    }
    if (/khách sạn|hotel|ryokan|onsen|nghỉ dưỡng|tiếp tân|trà đạo|kimono|yukata|truyền thống/.test(textToAnalyze)) {
      return 'hospitality';
    }
    if (/bệnh viện|phòng khám|bác sĩ|y tá|dược sĩ|thuốc|khám bệnh|nha sĩ|sức khỏe/.test(textToAnalyze)) {
      return 'medical';
    }
    return 'casual';
  };

  const archetype = resolveArchetype();

  // Kích thước container
  const getDimensions = () => {
    switch (size) {
      case 'sm':
        return 'w-9 h-9 sm:w-10 sm:h-10';
      case 'lg':
        return 'w-20 h-20 md:w-24 md:h-24';
      case 'xl':
        return 'w-28 h-28 md:w-32 md:h-32';
      case 'md':
      default:
        return 'w-14 h-14 md:w-16 md:h-16';
    }
  };

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
            d={avatarState === 'cheering' || avatarState === 'bowing' ? 'M45 61 Q50 65 55 61' : 'M46 61.5 Q50 63 54 61.5'}
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
    if (avatarState === 'cheering' || avatarState === 'bowing') {
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
    <div className="flex flex-col items-center select-none shrink-0">
      <div className={`relative shrink-0 aspect-square ${getDimensions()}`}>
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
          } ${avatarState === 'idle' ? 'animate-breathing' : ''} ${
            avatarState === 'bowing' ? 'transform translate-y-1.5 rotate-[2.5deg] scale-95 transition-all duration-500' : ''
          }`}
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
            {archetype === 'culinary' ? (
              // Tạp dề / Đồng phục quán ăn Nhật
              <g>
                <path d="M30 84 L50 92 L70 84 L74 100 L26 100 Z" fill="#0f172a" />
                <path d="M44 86 L50 90 L56 86 L50 84 Z" fill="#e11d48" />
              </g>
            ) : archetype === 'business' ? (
              // Cổ áo sơ mi & Vest công sở lịch thiệp
              <g>
                <path d="M26 84 L50 96 L74 84 L76 100 L24 100 Z" fill="#1e293b" />
                <polygon points="50,88 47,100 53,100" fill="#0284c7" />
                {/* Ghim cài áo corporate */}
                <circle cx="34" cy="88" r="1.5" fill="#f59e0b" />
              </g>
            ) : archetype === 'transit' ? (
              // Đồng phục đường sắt Nhật Bản (JR Railway Uniform) viền vàng
              <g>
                <path d="M26 83 L50 95 L74 83 L76 100 L24 100 Z" fill="#0f172a" />
                <path d="M48 88 L52 88 L52 100 L48 100 Z" fill="#eab308" />
                {/* Cầu vai vàng */}
                <path d="M25 83 L32 86 L30 89 L23 85 Z" fill="#eab308" />
                <path d="M75 83 L68 86 L70 89 L77 85 Z" fill="#eab308" />
              </g>
            ) : archetype === 'retail' ? (
              // Đồng phục Konbini (Cửa hàng tiện lợi) sọc viền kèm thẻ tên
              <g>
                <path d="M27 84 L50 94 L73 84 L76 100 L24 100 Z" fill="#059669" />
                <path d="M46 84 L54 84 L54 100 L46 100 Z" fill="#ffffff" />
                {/* Thẻ tên nhân viên Konbini */}
                <rect x="33" y="87" width="8" height="5" rx="1" fill="#ffffff" stroke="#047857" strokeWidth="0.8" />
                <line x1="35" y1="89.5" x2="39" y2="89.5" stroke="#047857" strokeWidth="0.8" />
              </g>
            ) : archetype === 'hospitality' ? (
              // Kimono / Yukata vạt chéo truyền thống Nhật Bản
              <g>
                <path d="M26 84 L50 98 L74 84 L76 100 L24 100 Z" fill="#881337" />
                <path d="M36 84 L50 98 L44 100 L30 86 Z" fill="#fbcfe8" />
                <path d="M50 98 L64 84 L70 86 L56 100 Z" fill="#f43f5e" />
              </g>
            ) : archetype === 'medical' ? (
              // Áo Blouse bác sĩ trắng khoác ngoài áo scrub y tế
              <g>
                <path d="M34 82 L50 94 L66 82 L66 100 L34 100 Z" fill="#0d9488" />
                <path d="M25 84 L38 88 L38 100 L23 100 Z" fill="#f8fafc" />
                <path d="M75 84 L62 88 L62 100 L77 100 Z" fill="#f8fafc" />
                {/* Ống nghe y tế */}
                <path d="M37 84 Q42 96 50 96 Q58 96 63 84" stroke="#475569" strokeWidth="1.5" fill="none" />
                <circle cx="50" cy="96" r="2" fill="#94a3b8" />
              </g>
            ) : (
              // Trang phục thường nhật thanh lịch
              <path d="M28 85 C36 82 64 82 72 85 L75 100 L25 100 Z" fill="#4f46e5" />
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

            {/* Mũ & Phụ kiện bối cảnh đặc thù */}
            {archetype === 'culinary' && (
              // Băng đô Tenugui quán ăn Nhật Bản
              <g>
                <path d="M26 31 C34 26 66 26 74 31 L75 37 C67 32 33 32 25 37 Z" fill="#0f172a" />
                <circle cx="50" cy="33.5" r="2.2" fill="#e11d48" />
              </g>
            )}
            {archetype === 'transit' && (
              // Mũ kepi Trưởng ga đường sắt Nhật Bản (JR Peaked Cap)
              <g>
                <path d="M25 24 C33 18 67 18 75 24 L77 34 C69 32 31 32 23 34 Z" fill="#0f172a" />
                {/* Viền vàng */}
                <path d="M24 33 C33 30 67 30 76 33 L76 35 C67 32 33 32 24 35 Z" fill="#eab308" />
                {/* Huy hiệu hoa cúc vàng trung tâm */}
                <polygon points="50,26 52,29 55,29 53,31 54,34 50,32 46,34 47,31 45,29 48,29" fill="#f59e0b" />
                {/* Vành mũ da đen bóng */}
                <path d="M23 34 C33 38 67 38 77 34 C72 40 28 40 23 34 Z" fill="#1e293b" opacity="0.9" />
              </g>
            )}
            {archetype === 'hospitality' && (
              // Trâm cài tóc hoa anh đào Kanzashi truyền thống
              <g>
                <circle cx="71" cy="38" r="3.5" fill="#f43f5e" />
                <circle cx="71" cy="38" r="1.5" fill="#fef08a" />
                <path d="M72 41 L74 48" stroke="#f43f5e" strokeWidth="1.2" strokeLinecap="round" />
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
