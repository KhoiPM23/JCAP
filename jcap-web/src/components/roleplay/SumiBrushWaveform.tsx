import React, { useEffect, useRef } from 'react';

export interface SumiBrushWaveformProps {
  isRecording: boolean;
  audioStream?: MediaStream | null;
  silenceCountdownProgress?: number; // 0.0 -> 1.0 (cho Adaptive Silence Ring)
  onCancelRecording: () => void;
  onSubmitRecording: () => void;
  durationSeconds: number;
}

export const SumiBrushWaveform: React.FC<SumiBrushWaveformProps> = ({
  isRecording,
  audioStream,
  silenceCountdownProgress = 0,
  onCancelRecording,
  onSubmitRecording,
  durationSeconds,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  useEffect(() => {
    if (!isRecording || !audioStream) {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      return;
    }

    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioCtx();
      const source = audioCtx.createMediaStreamSource(audioStream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const render = () => {
        analyser.getByteFrequencyData(dataArray);

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Vẽ dải sóng mực thủy mặc mềm mại
        const width = canvas.width;
        const height = canvas.height;
        const centerY = height / 2;

        ctx.beginPath();
        ctx.moveTo(0, centerY);

        const sliceWidth = width / dataArray.length;
        let x = 0;

        for (let i = 0; i < dataArray.length; i++) {
          const v = dataArray[i] / 128.0;
          const y = centerY + Math.sin(i * 0.4 + Date.now() * 0.005) * (v * (height / 2.8));

          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
          x += sliceWidth;
        }

        const shuColor = getComputedStyle(document.documentElement).getPropertyValue('--shu').trim() || '#c63a24';
        ctx.strokeStyle = shuColor; // Màu chu sa (Shu red)
        ctx.lineWidth = 3.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.shadowBlur = 6;
        ctx.shadowColor = 'rgba(198, 58, 36, 0.35)';
        ctx.stroke();

        animFrameRef.current = requestAnimationFrame(render);
      };

      render();

      return () => {
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        void audioCtx.close();
      };
    } catch {
      // AudioContext fallback
    }
  }, [isRecording, audioStream]);

  const formatDuration = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${mins}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="w-full flex items-center justify-between px-4 py-2.5 bg-[var(--paper-50)] border-2 border-[var(--shu)] rounded-2xl shadow-md gap-3">
      {/* Nút Huỷ bản thu */}
      <button
        type="button"
        onClick={onCancelRecording}
        className="p-2 text-[var(--sumi-faint)] hover:text-[var(--sumi)] hover:bg-[var(--paper-200)] rounded-xl transition cursor-pointer"
        title="Huỷ lượt thu âm này"
      >
        <span className="material-symbols-outlined text-lg">close</span>
      </button>

      {/* Hiển thị thời gian và chấm đỏ ghi âm */}
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full bg-[var(--shu)] animate-ping" />
        <span className="text-xs font-mono font-bold text-[var(--shu)]">{formatDuration(durationSeconds)}</span>
      </div>

      {/* Canvas dải sóng mực thủy mặc */}
      <div className="flex-1 h-8 max-w-md mx-2 flex items-center">
        <canvas ref={canvasRef} width={280} height={32} className="w-full h-full" />
      </div>

      {/* Nút Dừng & Gửi kèm Adaptive Silence Ring */}
      <div className="relative flex items-center justify-center">
        {/* Vòng đếm ngược im lặng để tự động gửi lượt nói */}
        {silenceCountdownProgress > 0 && (
          <svg className="absolute -inset-1.5 w-11 h-11 transform -rotate-90 pointer-events-none">
            <circle cx="22" cy="22" r="18" stroke="var(--shu-soft)" strokeWidth="2.5" fill="none" />
            <circle
              cx="22"
              cy="22"
              r="18"
              stroke="var(--shu)"
              strokeWidth="2.5"
              fill="none"
              strokeDasharray={113}
              strokeDashoffset={113 * (1 - silenceCountdownProgress)}
              strokeLinecap="round"
              className="transition-all duration-75"
            />
          </svg>
        )}

        <button
          type="button"
          onClick={onSubmitRecording}
          className="w-8 h-8 rounded-full bg-[var(--shu)] hover:opacity-90 text-white flex items-center justify-center shadow-md active:scale-95 transition cursor-pointer"
          title="Dừng và gửi câu trả lời"
        >
          <span className="material-symbols-outlined text-lg">arrow_upward</span>
        </button>
      </div>
    </div>
  );
};
