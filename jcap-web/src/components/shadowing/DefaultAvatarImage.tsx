import React, { useState } from 'react';

/** Ảnh đại diện mặc định của JCAP (đi kèm repo ở public/), dùng khi nhân vật chưa có ảnh riêng */
export const DEFAULT_AVATAR_SRC = '/default_avatar.png';

/**
 * Ảnh đại diện mặc định cho nhân vật/người học trong Shadowing. Nếu file ảnh không tải được (thiếu file, mạng lỗi)
 * thì vẽ biểu tượng người bằng SVG ngay trong code, để vòng avatar không bao giờ trống hoặc hiện biểu tượng ảnh hỏng.
 */
export const DefaultAvatarImage: React.FC<{ alt: string; className?: string }> = ({ alt, className }) => {
  const [broken, setBroken] = useState(false);
  if (broken) {
    return (
      <span role="img" aria-label={alt} className={`${className ?? ''} flex items-center justify-center bg-paper-200 text-sumi-faint`}>
        <svg viewBox="0 0 24 24" className="h-3/4 w-3/4" fill="currentColor" aria-hidden="true">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7z" />
        </svg>
      </span>
    );
  }
  return <img src={DEFAULT_AVATAR_SRC} alt={alt} className={className} onError={() => setBroken(true)} />;
};
