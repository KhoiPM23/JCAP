import React, { useState, useEffect, useRef } from 'react';

interface TypewriterTextProps {
  text: string;
  baseSpeedMs?: number;
  onComplete?: () => void;
  className?: string;
  isStreaming?: boolean;
}

/**
 * TypewriterText: Mô phỏng nhịp thở tự nhiên (Punctuation-Aware Fluid Typing) phong cách Claude / GPT.
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
  const [displayedLength, setDisplayedLength] = useState<number>(() => (isStreaming ? 0 : text.length));
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    if (!isStreaming) {
      setDisplayedLength(text.length);
      return;
    }

    setDisplayedLength(0);
    const totalLength = text.length;

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
      const lastChar = text[currentIdx - 1];
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
  }, [text, baseSpeedMs, isStreaming]);

  const visibleText = isStreaming ? text.slice(0, displayedLength) : text;
  const isDone = displayedLength >= text.length;

  return (
    <span className={className}>
      {visibleText}
      {isStreaming && !isDone && (
        <span className="inline-block w-1.5 h-4 ml-0.5 -mb-0.5 bg-[var(--ai)] animate-pulse rounded-xs opacity-90 transition-opacity" />
      )}
    </span>
  );
};
