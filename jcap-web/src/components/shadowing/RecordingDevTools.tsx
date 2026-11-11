import React from 'react';
import { Button } from '../jcap';

/** Bản ghi gần nhất để tải về làm dữ liệu đo độ chính xác nhận dạng (chỉ chế độ phát triển). */
export interface DevRecordingTake {
  sentenceId: number;
  /** WAV 16 kHz mono đúng như bản backend nhận dạng. */
  wav: Blob;
  meta: Record<string, unknown>;
}

interface RecordingDevToolsProps {
  take: DevRecordingTake | null;
  voiceProcessing: boolean;
  onToggleVoiceProcessing: () => void;
}

const pad = (n: number) => String(n).padStart(2, '0');

function stamp(d: Date): string {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Công cụ thu dữ liệu thật cho việc đo nhận dạng: tải bản ghi (WAV + JSON câu mẫu/kết quả) và bật/tắt khử nhiễu.
 * Chỉ hiện khi chạy `npm run dev`; bản ghi chỉ tải về máy người đang thử, không gửi hay lưu thêm ở đâu.
 */
export const RecordingDevTools: React.FC<RecordingDevToolsProps> = ({ take, voiceProcessing, onToggleVoiceProcessing }) => {
  const handleDownload = () => {
    if (!take) return;
    const base = `jcap-s${take.sentenceId}-${stamp(new Date())}`;
    download(take.wav, `${base}.wav`);
    download(new Blob([JSON.stringify(take.meta, null, 2)], { type: 'application/json' }), `${base}.json`);
  };

  return (
    <div className="w-full flex flex-wrap items-center gap-2 px-3 py-2 rounded-xl border border-dashed border-line bg-paper-100 text-xs text-sumi-muted">
      <span className="font-bold">Thử nghiệm (dev)</span>
      <Button size="sm" variant="ghost" icon="download" disabled={!take} onClick={handleDownload}>
        Tải bản ghi
      </Button>
      <Button size="sm" variant="ghost" icon={voiceProcessing ? 'noise_aware' : 'noise_control_off'} onClick={onToggleVoiceProcessing}>
        Khử nhiễu + tự chỉnh âm lượng: {voiceProcessing ? 'Bật' : 'Tắt'}
      </Button>
    </div>
  );
};
