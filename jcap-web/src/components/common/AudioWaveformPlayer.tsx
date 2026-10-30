import React, { useState, useEffect, useRef, useCallback } from 'react';

interface AudioWaveformPlayerProps {
  /** Đường dẫn file âm thanh trực tiếp (ví dụ: /audio/roleplay/stt_xxx.webm) */
  audioUrl?: string;
  /** Callback phát fallback nếu không có file âm thanh tĩnh (như Web Speech / TTS) */
  onPlayFallback?: () => void;
  /** Callback khi tua trên sóng âm ở chế độ fallback */
  onSeekFallback?: (targetRatio: number, targetTime: number) => void;
  /** Trạng thái fallback đang phát từ component cha */
  isFallbackPlaying?: boolean;
  /** Thời lượng ước tính cho fallback (giây) để thanh tiến độ và kim tua di chuyển mượt */
  fallbackDuration?: number;
  /** Nhãn mô tả (ví dụ: 'Giọng bạn', 'Mẫu Tokyo') */
  label?: string;
  /** Giao diện theo vai: 'user' (xanh lục emerald) hoặc 'model' (xanh dương blue/indigo) */
  variant?: 'user' | 'model';
  /** Chế độ thu gọn */
  compact?: boolean;
  className?: string;
}

// 18 thanh sóng chuẩn hoá, biểu diễn dải tần số từ âm trầm (Bass) tới âm bổng (Treble)
const BAR_COUNT = 18;

// Dáng phổ âm điệu chuẩn Tokyo (Pitch Accent Contour tự nhiên của người Nhật)
const DEFAULT_ENVELOPE = [
  0.28, 0.45, 0.68, 0.88, 0.96, 0.82, 0.65, 0.78, 1.0, 0.85,
  0.90, 0.75, 0.62, 0.70, 0.55, 0.42, 0.50, 0.32
];

// Singleton AudioContext để tránh chạm giới hạn số lượng Context của trình duyệt
let sharedAudioContext: AudioContext | null = null;
function getSharedAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedAudioContext || sharedAudioContext.state === 'closed') {
    sharedAudioContext = new AudioCtx();
  }
  return sharedAudioContext;
}

export const AudioWaveformPlayer: React.FC<AudioWaveformPlayerProps> = ({
  audioUrl,
  onPlayFallback,
  onSeekFallback,
  isFallbackPlaying = false,
  fallbackDuration = 2.4,
  label,
  variant = 'user',
  compact = false,
  className = '',
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [peaks, setPeaks] = useState<number[]>(DEFAULT_ENVELOPE);
  const [liveFrequencies, setLiveFrequencies] = useState<number[]>(new Array(BAR_COUNT).fill(0));
  const [isHovering, setIsHovering] = useState(false);
  const [hoverFraction, setHoverFraction] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const needleRef = useRef<HTMLDivElement | null>(null);
  const timeTextRef = useRef<HTMLSpanElement | null>(null);
  const isDraggingRef = useRef(false);
  const animationFrameRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const fallbackStartTimeRef = useRef<number | null>(null);

  const isUser = variant === 'user';
  const effectivePlaying = audioUrl ? isPlaying : isFallbackPlaying;
  const effectiveDuration = duration > 0 ? duration : (fallbackDuration > 0 ? fallbackDuration : 2.4);

  // Định dạng thời gian mm:ss
  const formatTime = (secs: number) => {
    if (!Number.isFinite(secs) || secs < 0) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Cập nhật vị trí kim thời gian và mốc giây trực tiếp ở 60fps
  const updateDirectPlayhead = useCallback(
    (timeSec: number, totalDuration: number) => {
      const safeTotal = totalDuration > 0 ? totalDuration : 2.4;
      const ratio = Math.min(1, Math.max(0, timeSec / safeTotal));

      if (needleRef.current) {
        needleRef.current.style.left = `${ratio * 100}%`;
      }
      if (timeTextRef.current) {
        timeTextRef.current.textContent = formatTime(timeSec);
      }

      if (trackRef.current) {
        const activeIdx = Math.floor(ratio * BAR_COUNT);
        const bars = trackRef.current.querySelectorAll<HTMLDivElement>('[data-bar-idx]');
        bars.forEach((bar) => {
          const idx = Number(bar.getAttribute('data-bar-idx'));
          if (idx <= activeIdx && timeSec > 0) {
            bar.classList.add(isUser ? 'bg-[var(--score-good)]' : 'bg-[var(--ai)]');
            bar.classList.remove(isUser ? 'bg-[var(--score-good-soft)]' : 'bg-[var(--ai-soft)]');
          } else {
            bar.classList.remove(isUser ? 'bg-[var(--score-good)]' : 'bg-[var(--ai)]');
            bar.classList.add(isUser ? 'bg-[var(--score-good-soft)]' : 'bg-[var(--ai-soft)]');
          }
        });
      }
    },
    [isUser]
  );

  // 1. KHỞI TẠO DUY NHẤT 1 BỘ AUDIO ELEMENT & ANALYSER
  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'metadata';
    audio.crossOrigin = 'anonymous';
    audioRef.current = audio;

    const ctx = getSharedAudioContext();
    if (ctx) {
      try {
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 64;
        analyser.smoothingTimeConstant = 0.75;
        analyserRef.current = analyser;

        const source = ctx.createMediaElementSource(audio);
        mediaSourceRef.current = source;
        source.connect(analyser);
        analyser.connect(ctx.destination);
      } catch (e) {
        console.warn('[Waveform] Khởi tạo Web Audio Analyser:', e);
      }
    }

    return () => {
      audio.pause();
      audio.src = '';
      if (mediaSourceRef.current) {
        try {
          mediaSourceRef.current.disconnect();
        } catch {}
      }
    };
  }, []);

  // 2. TRÍCH XUẤT BIÊN ĐỘ VÀ CAO ĐỘ THẬT TỪ FILE AUDIO (Acoustic Buffer Decoding)
  useEffect(() => {
    if (!audioUrl) {
      setPeaks(DEFAULT_ENVELOPE);
      setDuration(fallbackDuration || 2.4);
      return;
    }

    let isCancelled = false;
    const ctx = getSharedAudioContext();
    if (!ctx) return;

    fetch(audioUrl)
      .then((res) => (res.ok ? res.arrayBuffer() : Promise.reject('Fetch failed')))
      .then((arrayBuffer) => ctx.decodeAudioData(arrayBuffer))
      .then((audioBuffer) => {
        if (isCancelled) return;

        const rawData = audioBuffer.getChannelData(0);
        const sampleSize = Math.floor(rawData.length / BAR_COUNT);
        const extracted: number[] = [];

        for (let i = 0; i < BAR_COUNT; i++) {
          const start = i * sampleSize;
          let sum = 0;
          for (let j = 0; j < sampleSize; j++) {
            sum += Math.abs(rawData[start + j]);
          }
          extracted.push(sum / sampleSize);
        }

        const maxVal = Math.max(...extracted, 0.001);
        const normalized = extracted.map((val) => {
          const ratio = val / maxVal;
          return Math.max(0.2, Math.min(1.0, ratio));
        });

        setPeaks(normalized);
        if (Number.isFinite(audioBuffer.duration) && audioBuffer.duration > 0) {
          setDuration(audioBuffer.duration);
        }
      })
      .catch((err) => {
        console.warn('[Waveform] Dùng envelope chuẩn hóa:', err);
        if (!isCancelled) setPeaks(DEFAULT_ENVELOPE);
      });

    return () => {
      isCancelled = true;
    };
  }, [audioUrl, fallbackDuration]);

  // 3. ĐIỀU PHỐI AUDIO ELEMENT KHI ĐỔI URL HOẶC HOÀN TẤT PHÁT
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!audioUrl) {
      audio.pause();
      audio.src = '';
      setIsPlaying(false);
      setCurrentTime(0);
      updateDirectPlayhead(0, effectiveDuration);
      return;
    }

    audio.src = audioUrl;
    audio.currentTime = 0;

    const handleLoadedMetadata = () => {
      if (audio.duration === Infinity) {
        audio.currentTime = 1e101;
        audio.ontimeupdate = () => {
          audio.ontimeupdate = handleTimeUpdate;
          audio.currentTime = 0;
          if (Number.isFinite(audio.duration) && audio.duration > 0) {
            setDuration(audio.duration);
          }
        };
      } else if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
      }
    };

    const handleTimeUpdate = () => {
      if (!isDraggingRef.current) {
        setCurrentTime(audio.currentTime);
        updateDirectPlayhead(audio.currentTime, audio.duration || duration);
      }
      if (Number.isFinite(audio.duration) && audio.duration > 0 && duration <= 0) {
        setDuration(audio.duration);
      }
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      updateDirectPlayhead(0, audio.duration || duration);
    };

    const handleError = () => {
      setIsPlaying(false);
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
      audio.pause();
    };
  }, [audioUrl, effectiveDuration, updateDirectPlayhead]);

  // 4. VÒNG LẶP RENDER CAO ĐỘ THỜI GIAN THỰC & TIẾN TRÌNH SÓNG (60FPS)
  useEffect(() => {
    if (!effectivePlaying) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      fallbackStartTimeRef.current = null;
      setLiveFrequencies(new Array(BAR_COUNT).fill(0));
      if (!audioUrl) {
        setCurrentTime(0);
        updateDirectPlayhead(0, effectiveDuration);
      }
      return;
    }

    fallbackStartTimeRef.current = performance.now() - (currentTime * 1000);

    const analyser = analyserRef.current;
    const freqDataArray = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;
    let tick = 0;

    const renderLoop = () => {
      tick++;

      if (audioUrl && audioRef.current) {
        if (!isDraggingRef.current) {
          const cur = audioRef.current.currentTime;
          setCurrentTime(cur);
          updateDirectPlayhead(cur, duration > 0 ? duration : audioRef.current.duration);
        }

        if (analyser && freqDataArray) {
          analyser.getByteFrequencyData(freqDataArray);
          const mapped: number[] = [];
          const step = Math.max(1, Math.floor(freqDataArray.length / BAR_COUNT));
          for (let i = 0; i < BAR_COUNT; i++) {
            const val = freqDataArray[i * step] || 0;
            mapped.push(val / 255);
          }
          setLiveFrequencies(mapped);
        }
      } else {
        if (fallbackStartTimeRef.current !== null && !isDraggingRef.current) {
          const elapsed = (performance.now() - fallbackStartTimeRef.current) / 1000;
          const targetDuration = effectiveDuration;
          const safeElapsed = Math.min(targetDuration, elapsed);

          setCurrentTime(safeElapsed);
          updateDirectPlayhead(safeElapsed, targetDuration);

          const progress = targetDuration > 0 ? safeElapsed / targetDuration : 0;
          const pitchEnvelope = Math.sin(progress * Math.PI) * 0.45 + 0.55;
          const fallbackWaves = peaks.map((base, idx) => {
            const dynamicRipple = Math.sin((idx * 0.55) + (tick * 0.16)) * 0.35;
            return Math.min(1.0, Math.max(0.1, (base * pitchEnvelope) + dynamicRipple));
          });
          setLiveFrequencies(fallbackWaves);
        }
      }

      animationFrameRef.current = requestAnimationFrame(renderLoop);
    };

    animationFrameRef.current = requestAnimationFrame(renderLoop);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [effectivePlaying, audioUrl, effectiveDuration, peaks, updateDirectPlayhead]);

  // 5. ĐIỀU KHIỂN PHÁT / TẠM DỪNG
  const togglePlay = () => {
    const ctx = getSharedAudioContext();
    if (ctx && ctx.state === 'suspended') {
      void ctx.resume();
    }

    if (!audioUrl) {
      if (currentTime >= effectiveDuration - 0.05 || !effectivePlaying) {
        setCurrentTime(0);
        fallbackStartTimeRef.current = performance.now();
        updateDirectPlayhead(0, effectiveDuration);
      }
      onPlayFallback?.();
      return;
    }

    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      if (audio.currentTime >= (audio.duration || duration) - 0.05) {
        audio.currentTime = 0;
        setCurrentTime(0);
        updateDirectPlayhead(0, audio.duration || duration);
      }
      audio
        .play()
        .then(() => setIsPlaying(true))
        .catch((err) => {
          console.warn('[AudioWaveformPlayer] Lỗi phát audio, chuyển fallback:', err);
          setIsPlaying(false);
          onPlayFallback?.();
        });
    }
  };

  // 5b. NHẤP ĐÚP VÀO NÚT PLAY ĐỂ TUA VỀ ĐẦU (0:00) VÀ PHÁT LẠI NGAY LẬP TỨC
  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    const ctx = getSharedAudioContext();
    if (ctx && ctx.state === 'suspended') {
      void ctx.resume();
    }

    setCurrentTime(0);
    updateDirectPlayhead(0, effectiveDuration);

    if (audioUrl && audioRef.current) {
      const audio = audioRef.current;
      audio.currentTime = 0;
      audio
        .play()
        .then(() => setIsPlaying(true))
        .catch((err) => {
          console.warn('[AudioWaveformPlayer] Lỗi phát lại từ đầu:', err);
          setIsPlaying(false);
          onPlayFallback?.();
        });
    } else {
      fallbackStartTimeRef.current = performance.now();
      if (onSeekFallback) {
        onSeekFallback(0, 0);
      } else {
        onPlayFallback?.();
      }
    }
  };

  // 6. CƠ CHẾ TUA ÂM THANH CHÍNH XÁC (Click & Drag Scrubbing across track)
  const applySeekFromEvent = useCallback(
    (clientX: number) => {
      if (!trackRef.current) return;
      const rect = trackRef.current.getBoundingClientRect();
      const clickX = clientX - rect.left;
      const ratio = Math.max(0, Math.min(1, clickX / rect.width));
      const targetTime = ratio * effectiveDuration;

      setCurrentTime(targetTime);
      updateDirectPlayhead(targetTime, effectiveDuration);

      if (audioUrl && audioRef.current && Number.isFinite(effectiveDuration) && effectiveDuration > 0) {
        audioRef.current.currentTime = targetTime;
      } else if (!audioUrl) {
        fallbackStartTimeRef.current = performance.now() - (targetTime * 1000);
        onSeekFallback?.(ratio, targetTime);
      }
    },
    [effectiveDuration, audioUrl, onSeekFallback, updateDirectPlayhead]
  );

  const handleTrackMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    isDraggingRef.current = true;
    applySeekFromEvent(e.clientX);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (isDraggingRef.current) {
        applySeekFromEvent(moveEvent.clientX);
      }
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleTrackMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setHoverFraction(ratio);
    setIsHovering(true);
  };

  const currentRatio = effectiveDuration > 0 ? Math.min(1, Math.max(0, currentTime / effectiveDuration)) : 0;
  const activeBarIndex = Math.floor(currentRatio * BAR_COUNT);

  // Bảng màu giao diện chuẩn hóa JCAP theo Gia Khôi Design System
  const theme = isUser
    ? {
        bg: 'bg-[var(--score-good-soft)]/50 hover:bg-[var(--score-good-soft)]/75 border-[var(--line)] shadow-2xs',
        btnBg: effectivePlaying
          ? 'bg-[var(--score-good)] text-white ring-2 ring-[var(--score-good)]/60 shadow-sm'
          : 'bg-[var(--score-good)] text-white hover:opacity-90 shadow-sm',
        barActive: 'bg-[var(--score-good)]',
        barInactive: 'bg-[var(--score-good-soft)]',
        barHover: 'bg-[var(--score-good)]/70',
        needle: 'bg-[var(--score-good)] shadow-xs',
        badgeBg: 'bg-[var(--score-good-soft)] text-[var(--score-good)] border border-[var(--score-good)]/30',
        timeColor: 'text-[var(--score-good)]',
      }
    : {
        bg: 'bg-[var(--ai-soft)]/50 hover:bg-[var(--ai-soft)]/75 border-[var(--line)] shadow-2xs',
        btnBg: effectivePlaying
          ? 'bg-[var(--ai)] text-white ring-2 ring-[var(--ai)]/60 shadow-sm'
          : 'bg-[var(--ai)] text-white hover:opacity-90 shadow-sm',
        barActive: 'bg-[var(--ai)]',
        barInactive: 'bg-[var(--ai-soft)]',
        barHover: 'bg-[var(--ai)]/70',
        needle: 'bg-[var(--ai)] shadow-xs',
        badgeBg: 'bg-[var(--ai-soft)] text-[var(--ai)] border border-[var(--ai)]/30',
        timeColor: 'text-[var(--ai)]',
      };

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-xl border transition-all ${theme.bg} ${
        compact ? 'py-1 px-2 text-xs' : 'py-1.5 px-3 text-xs'
      } ${className}`}
    >
      {/* 1. NÚT PLAY/PAUSE CANH CHÍNH GIỮA TUYỆT ĐỐI (KHÔNG LỆCH PHẢI) */}
      <button
        type="button"
        onClick={togglePlay}
        onDoubleClick={handleDoubleClick}
        className={`flex shrink-0 items-center justify-center rounded-full transition-all active:scale-90 cursor-pointer outline-none ${
          compact ? 'h-6 w-6' : 'h-7 w-7'
        } ${theme.btnBg}`}
        title={effectivePlaying ? 'Nhấp: Tạm dừng • Nhấp đúp: Phát lại từ 0:00' : 'Nhấp: Nghe phát âm • Nhấp đúp: Phát lại từ 0:00'}
      >
        {effectivePlaying ? (
          <svg className="w-2.5 h-2.5 fill-current" viewBox="0 0 24 24">
            <rect x="6" y="5" width="4" height="14" rx="1" />
            <rect x="14" y="5" width="4" height="14" rx="1" />
          </svg>
        ) : (
          <svg className="w-2.5 h-2.5 fill-current" viewBox="0 0 24 24">
            <polygon points="7,5 18.5,12 7,19" />
          </svg>
        )}
      </button>

      {/* Nhãn vai nói */}
      {label && (
        <span
          className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap ${theme.badgeBg}`}
        >
          {label}
        </span>
      )}

      {/* 2. DẢI SÓNG ÂM THANH RÚT GỌN VỪA VẶN, CÁC CỘT SÓNG DÀY DẶN MỊN MÀNG (KHÔNG THƯA / KHÔNG DÀI LÊ THÊ) */}
      <div
        ref={trackRef}
        onMouseDown={handleTrackMouseDown}
        onMouseMove={handleTrackMouseMove}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
        className={`relative ${compact ? 'w-[72px] sm:w-[84px]' : 'w-[96px] sm:w-[110px]'} shrink-0 h-6 flex items-center justify-between px-0.5 cursor-pointer select-none rounded-lg hover:bg-black/5 transition`}
        title="Nhấp hoặc kéo chuột trên sóng âm để tua vị trí phát"
      >
        {/* Render 18 thanh sóng âm */}
        {peaks.map((baseHeight, idx) => {
          const liveBoost = effectivePlaying ? (liveFrequencies[idx] || 0) * 0.45 : 0;
          const dynamicRatio = Math.min(1.0, baseHeight + liveBoost);
          const barHeightPx = Math.max(3, Math.round(dynamicRatio * (compact ? 14 : 18)));

          const isPassed = idx <= activeBarIndex && (effectivePlaying || currentTime > 0);
          const isHoverHighlight = isHovering && idx <= Math.floor(hoverFraction * BAR_COUNT);

          return (
            <div
              key={idx}
              data-bar-idx={idx}
              className={`w-[2px] sm:w-[2.5px] rounded-full transition-all duration-75 ${
                isPassed
                  ? theme.barActive
                  : isHoverHighlight
                  ? theme.barHover
                  : theme.barInactive
              }`}
              style={{
                height: `${barHeightPx}px`,
              }}
            />
          );
        })}

        {/* Kim thời gian phát âm (Playhead Needle) di chuyển đồng bộ 100% không delay */}
        <div
          ref={needleRef}
          className="absolute top-0.5 bottom-0.5 w-[2px] pointer-events-none z-10"
          style={{
            left: `${currentRatio * 100}%`,
          }}
        >
          <div className={`w-full h-full rounded-full ${theme.needle}`} />
          <div className={`absolute -top-1 -left-[2.5px] w-1.5 h-1.5 rounded-full shadow-xs ${theme.needle}`} />
        </div>

        {/* Tooltip hiển thị mốc giây khi rê chuột tua */}
        {isHovering && effectiveDuration > 0 && (
          <div
            className="absolute -top-6 -translate-x-1/2 pointer-events-none rounded bg-[var(--sumi)] px-1.5 py-0.5 text-[9px] font-mono font-bold text-[var(--paper-50)] shadow-md z-20 whitespace-nowrap"
            style={{
              left: `${hoverFraction * 100}%`,
            }}
          >
            {formatTime(hoverFraction * effectiveDuration)}
          </div>
        )}
      </div>

      {/* 3. ĐỒNG HỒ THỜI LƯỢNG (Gọn gàng, không bao giờ tràn lề hay đè lên viền) */}
      <div className={`shrink-0 text-right text-[10px] font-mono font-bold whitespace-nowrap tabular-nums min-w-[38px] ${theme.timeColor}`}>
        <span ref={timeTextRef}>{formatTime(currentTime)}</span>
        <span className="opacity-60 text-[9px]">/{formatTime(effectiveDuration)}</span>
      </div>
    </div>
  );
};
