import { Button } from '../jcap';

interface RecordingReviewBarProps {
  /** Đang phát bản thu chưa gửi. */
  isPlaying: boolean;
  onPlay: () => void;
  /** Thu lại: bỏ bản thu hiện tại và ghi mới. */
  onReRecord: () => void;
  /** Gửi bản thu này để backend chấm điểm. */
  onSubmit: () => void;
  /** Bỏ bản thu, quay về trạng thái sẵn sàng. */
  onDiscard: () => void;
  /** Lỗi của lần gửi trước (mạng/quá hạn): bản thu vẫn được giữ để gửi lại. */
  error?: string | null;
}

/**
 * Bước nghe lại sau khi dừng ghi: bản thu CHƯA được gửi. Người học nghe lại, thu lại hoặc gửi chấm.
 * Gửi lỗi thì nút chính thành "Gửi lại" (cùng bản thu, cùng mã lần gửi nên server không lưu trùng).
 */
export default function RecordingReviewBar({ isPlaying, onPlay, onReRecord, onSubmit, onDiscard, error }: RecordingReviewBarProps) {
  return (
    <div className="w-full flex flex-col gap-2 py-1 animate-in fade-in" role="group" aria-label="Nghe lại bản thu trước khi gửi">
      {error && (
        <p role="alert" className="text-xs text-danger bg-danger-soft rounded-xl px-3 py-1.5 text-center">
          {error}
        </p>
      )}
      <p className="text-xs text-sumi-muted text-center">Bản thu chưa được gửi. Nghe lại để chắc chắn rồi gửi chấm.</p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button variant="ghost" size="sm" icon={isPlaying ? 'stop' : 'play_arrow'} onClick={onPlay}>
          {isPlaying ? 'Dừng nghe' : 'Nghe lại'}
        </Button>
        <Button variant="secondary" size="sm" icon="mic" onClick={onReRecord}>
          Thu lại
        </Button>
        <Button variant="ghost" size="sm" icon="delete" onClick={onDiscard}>
          Bỏ
        </Button>
        <Button variant="primary" size="sm" icon={error ? 'refresh' : 'send'} onClick={onSubmit}>
          {error ? 'Gửi lại' : 'Gửi chấm'}
        </Button>
      </div>
    </div>
  );
}
