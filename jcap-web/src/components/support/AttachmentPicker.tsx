import React, { useEffect, useRef, useState } from 'react';
import { Icon, IconButton } from '../jcap';
import { feedbackService, formatFileSize, type CreateFeedbackTicketPayload } from '../../services/feedbackService';
import { ACCEPT, fileIcon, fileProblem } from './files';

type Payload = CreateFeedbackTicketPayload['attachments'][number];

export interface PickedFile {
  key: string;
  name: string;
  size: number;
  preview?: string;
  status: 'up' | 'ok' | 'err';
  error?: string;
  payload?: Payload;
}

/** Danh sách tệp đã chọn, kiểm tra ngay khi chọn rồi mới tải lên; dùng cho ô trả lời và khung báo sự cố */
export function useAttachments() {
  const [files, setFiles] = useState<PickedFile[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef(files);
  filesRef.current = files;
  useEffect(() => () => filesRef.current.forEach((f) => f.preview && URL.revokeObjectURL(f.preview)), []);

  const patch = (key: string, change: Partial<PickedFile>) => setFiles((prev) => prev.map((f) => (f.key === key ? { ...f, ...change } : f)));

  const upload = async (key: string, file: File) => {
    const res = await feedbackService.uploadAttachment(file);
    if (res.success && res.data) {
      const d = res.data;
      patch(key, {
        status: 'ok',
        payload: {
          fileName: d.fileName,
          fileSize: d.fileSize,
          fileType: d.fileType,
          mimeType: d.mimeType,
          cloudinaryUrl: d.cloudinaryUrl,
          cloudinaryPublicId: d.cloudinaryPublicId,
        },
      });
    } else {
      patch(key, { status: 'err', error: res.message || 'Chưa tải lên được. Hãy bỏ tệp rồi chọn lại.' });
    }
  };

  const pick = (list: FileList | null) => {
    for (const file of Array.from(list ?? [])) {
      const key = `f-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const problem = fileProblem(file.name, file.size);
      setFiles((prev) => [
        ...prev,
        {
          key,
          name: file.name,
          size: file.size,
          preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
          status: problem ? 'err' : 'up',
          error: problem ?? undefined,
        },
      ]);
      if (!problem) void upload(key, file);
    }
  };

  const remove = (file: PickedFile) => {
    if (file.preview) URL.revokeObjectURL(file.preview);
    setFiles((prev) => prev.filter((f) => f.key !== file.key));
  };
  const reset = () => {
    filesRef.current.forEach((f) => f.preview && URL.revokeObjectURL(f.preview));
    setFiles([]);
  };

  return {
    files,
    pick,
    remove,
    reset,
    inputRef,
    open: () => inputRef.current?.click(),
    uploading: files.some((f) => f.status === 'up'),
    hasError: files.some((f) => f.status === 'err'),
    /** Chỉ các tệp đã tải lên được gửi kèm */
    payload: files.flatMap((f) => (f.status === 'ok' && f.payload ? [f.payload] : [])),
  };
}

export type Attachments = ReturnType<typeof useAttachments>;

export const FileInput: React.FC<{ at: Attachments }> = ({ at }) => (
  <input
    ref={at.inputRef}
    type="file"
    multiple
    accept={ACCEPT}
    hidden
    onChange={(e) => {
      at.pick(e.target.files);
      e.target.value = '';
    }}
  />
);

export const AttachmentList: React.FC<{ at: Attachments }> = ({ at }) =>
  at.files.length === 0 ? null : (
    <ul className="sup-picks">
      {at.files.map((f) => (
        <li key={f.key} className={`sup-pick ${f.status}`}>
          {f.preview ? (
            <img className="th" src={f.preview} alt="" />
          ) : (
            <span className="th" aria-hidden="true">
              <Icon name={fileIcon(f.name)} size={20} />
            </span>
          )}
          <span className="fx">
            <span className="fn">{f.name}</span>
            <span className="fs" role={f.status === 'err' ? 'alert' : undefined}>
              <Icon
                name={f.status === 'err' ? 'error' : f.status === 'up' ? 'progress_activity' : 'check_circle'}
                size={14}
                spin={f.status === 'up'}
              />
              {f.status === 'err' ? f.error : f.status === 'up' ? `Đang tải lên · ${formatFileSize(f.size)}` : `Đã tải lên · ${formatFileSize(f.size)}`}
            </span>
            {f.status === 'up' && (
              <span className="bar" role="progressbar" aria-label={`Đang tải lên ${f.name}`}>
                <i />
              </span>
            )}
          </span>
          <IconButton icon="close" label={`Bỏ tệp ${f.name}`} size="sm" onClick={() => at.remove(f)} />
        </li>
      ))}
    </ul>
  );
