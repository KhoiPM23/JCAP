import React from 'react';
import { Badge, Button } from '../jcap';

/** Bản ghi gần nhất để tải về làm dữ liệu đo độ chính xác nhận dạng (chỉ chế độ phát triển). */
export interface DevRecordingTake {
  sentenceId: number;
  /** WAV 16 kHz mono đúng như bản backend nhận dạng. */
  wav: Blob;
  meta: Record<string, unknown>;
}

interface RecordingDevToolsProps {
  take: DevRecordingTake | null;
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
 * Công cụ thu dữ liệu thật cho việc đo nhận dạng: tải bản ghi (WAV + JSON câu mẫu/kết quả).
 * Chỉ hiện khi chạy `npm run dev` (không có trong bản build triển khai); bản ghi chỉ tải về máy người đang thử.
 */
export const RecordingDevTools: React.FC<RecordingDevToolsProps> = ({ take }) => {
  const handleDownload = () => {
    if (!take) return;
    const base = `jcap-s${take.sentenceId}-${stamp(new Date())}`;
    download(take.wav, `${base}.wav`);
    download(new Blob([JSON.stringify(take.meta, null, 2)], { type: 'application/json' }), `${base}.json`);
  };

  // Chỉ hiện khi đã có bản ghi để tải: một nút nhỏ canh phải, không chiếm cả một khối
  if (!take) return null;
  return (
    <div className="flex w-full justify-end">
      <Button size="sm" variant="ghost" icon="download" onClick={handleDownload} title="Chỉ có khi chạy npm run dev">
        Tải bản ghi <Badge tone="neutral" className="ml-1">dev</Badge>
      </Button>
    </div>
  );
};
