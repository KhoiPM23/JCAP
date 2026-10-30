import React from 'react';
import { pictogramUrl } from '../../data/japanPictograms';

/** Biểu tượng tô màu bằng CSS mask: giữ nguyên hình, chỉ đổi màu (đúng điều khoản của bộ icon) */
export const PictogramIcon: React.FC<{ id: string; color: string; className?: string }> = ({ id, color, className }) => {
  const url = `url("${pictogramUrl(id)}")`;
  return (
    <span
      aria-hidden="true"
      className={`block ${className ?? ''}`}
      style={{
        backgroundColor: color,
        WebkitMaskImage: url,
        maskImage: url,
        WebkitMaskSize: 'contain',
        maskSize: 'contain',
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center',
        maskPosition: 'center',
      }}
    />
  );
};

export function ChatIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  );
}

export function MicIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
    </svg>
  );
}

export function SpeakerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5L6 9H3v6h3l5 4V5zM15.5 8.5a5 5 0 010 7M18.5 5.5a9 9 0 010 13" />
    </svg>
  );
}

/** Nút nghe: bấm để đọc `kana` bằng giọng Nhật */
export const ListenButton: React.FC<{ onClick: () => void; label: string; size?: number; color?: string }> = ({
  onClick,
  label,
  size = 28,
  color,
}) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    onClick={(e) => {
      e.stopPropagation();
      onClick();
    }}
    className="jm-focus shrink-0 inline-flex items-center justify-center rounded-full border border-[var(--rule)] bg-[var(--paper)] text-[var(--ink-2)] transition-colors hover:bg-[var(--paper-2)] hover:text-[var(--ink)]"
    style={{ width: size, height: size, color }}
  >
    <SpeakerIcon className="w-4 h-4" />
  </button>
);
