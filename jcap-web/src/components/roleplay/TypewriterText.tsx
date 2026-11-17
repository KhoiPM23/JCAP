import React, { useState, useEffect, useRef, useMemo } from 'react';

interface TypewriterTextProps {
  text: string;
  baseSpeedMs?: number;
  onComplete?: () => void;
  className?: string;
  isStreaming?: boolean;
}

/**
 * TypewriterText: Mô phỏng nhịp thở tự nhiên (Punctuation-Aware Fluid Typing) phong cách Claude / GPT.
 * - Triệt tiêu 100% rò rỉ thẻ HTML <ruby> <rt> trong quá trình streaming lát cắt chuỗi.
 * - Ký tự thông thường: ~18-22ms
 * - Dấu phẩy / ngắt nhịp (、, ,): nghỉ tự nhiên ~130ms
 * - Dấu chấm câu / dứt ý (。, ., !, ?, ！, ？): nghỉ tự nhiên ~210ms
 */
export const TypewriterText: React.FC<TypewriterTextProps> = ({
  text,
  baseSpeedMs = 20,
  onComplete,
  className = '',
  isStreaming = true,
}) => {
  // Lọc sạch thẻ HTML/Ruby thô để khi cắt lát chuỗi không bao giờ bị lộ text "ruby ruby" ra giao diện
  const cleanText = useMemo(() => {
    return (text || '').replace(/<rt>[^<]*<\/rt>/gi, '').replace(/<[^>]+>/g, '').trim();
  }, [text]);

  const [displayedLength, setDisplayedLength] = useState<number>(() => (isStreaming ? 0 : cleanText.length));
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    if (!isStreaming) {
      setDisplayedLength(cleanText.length);
      return;
    }

    setDisplayedLength(0);
    const totalLength = cleanText.length;

    if (totalLength === 0) {
      onCompleteRef.current?.();
      return;
    }

    let currentIdx = 0;
    let timerId: ReturnType<typeof setTimeout> | null = null;
    let isCancelled = false;

    const tick = () => {
      if (isCancelled) return;

      currentIdx += 1;
      setDisplayedLength(currentIdx);

      if (currentIdx >= totalLength) {
        onCompleteRef.current?.();
        return;
      }

      // Tính toán nhịp nghỉ hữu cơ theo ngữ âm tiếng Nhật
      const lastChar = cleanText[currentIdx - 1];
      let delay = baseSpeedMs;

      if (/[、,]/.test(lastChar)) {
        delay = 130;
      } else if (/[。.!?！？]/.test(lastChar)) {
        delay = 210;
      } else if (/[\s\u3000]/.test(lastChar)) {
        delay = 60;
      }

      timerId = setTimeout(tick, delay);
    };

    timerId = setTimeout(tick, baseSpeedMs);

    return () => {
      isCancelled = true;
      if (timerId) clearTimeout(timerId);
    };
  }, [cleanText, baseSpeedMs, isStreaming]);

  const visibleText = isStreaming ? cleanText.slice(0, displayedLength) : cleanText;
  const isDone = displayedLength >= cleanText.length;

  return (
    <span className={className}>
      {visibleText}
      {isStreaming && !isDone && (
        <span className="inline-block w-1.5 h-4 ml-0.5 -mb-0.5 bg-[var(--ai)] animate-pulse rounded-xs opacity-90 transition-opacity" />
      )}
    </span>
  );
};
