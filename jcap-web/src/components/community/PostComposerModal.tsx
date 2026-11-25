import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Alert, Button, Icon, IconButton, Modal, Switch, TextField } from '../jcap';
import { feedbackService, formatFileSize } from '../../services/feedbackService';
import type { ForumAttachment, ForumChannel } from '../../types/community';
import { CHANNELS, channelStyle } from './channels';

const MAX_BYTES = 5 * 1024 * 1024;
const TITLE_MAX = 290;
const TITLE_WARN = 260;
const ACCEPT = 'image/*,.pdf,.txt,.doc,.docx';

export interface PostDraft {
  channel: ForumChannel;
  title: string;
  content: string;
  isAnonymous: boolean;
  attachments: ForumAttachment[];
}

/** Một tệp đã chọn: đang tải lên, đã tải lên, hoặc lỗi (quá 5MB, máy chủ không nhận) */
interface PickedFile {
  key: string;
  name: string;
  size: number;
  isImage: boolean;
  preview?: string;
  status: 'up' | 'ok' | 'err';
  error?: string;
  attachment?: ForumAttachment;
}

const sizeMb = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;

/**
 * Khung soạn bài. Luôn được dựng (chỉ ẩn khi đóng) nên đóng rồi mở lại vẫn còn bản nháp; chỉ xoá sau khi đăng được.
 */
export const PostComposerModal: React.FC<{
  open: boolean;
  /** Kênh đang lọc (hoặc Hỏi đáp): chọn sẵn khi bản nháp còn trống */
  defaultChannel: ForumChannel;
  isAdmin: boolean;
  /** data-theme của Diễn đàn: hộp thoại nằm ngoài khung trang nên phải đặt lại */
  theme: string;
  onClose: () => void;
  /** true = đã đăng */
  onSubmit: (draft: PostDraft) => Promise<boolean>;
}> = ({ open, defaultChannel, isAdmin, theme, onClose, onSubmit }) => {
  const [channel, setChannel] = useState<ForumChannel>(defaultChannel);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [posting, setPosting] = useState(false);
  const [failed, setFailed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && !title.trim() && !content.trim()) setChannel(defaultChannel);
    // Chỉ chọn lại kênh lúc mở hộp, không đổi khi đang gõ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Thu hồi ảnh xem trước khi rời trang
  const filesRef = useRef(files);
  filesRef.current = files;
  useEffect(() => () => filesRef.current.forEach((f) => f.preview && URL.revokeObjectURL(f.preview)), []);

  const patch = (key: string, change: Partial<PickedFile>) => setFiles((prev) => prev.map((f) => (f.key === key ? { ...f, ...change } : f)));

  const upload = async (key: string, file: File) => {
    const res = await feedbackService.uploadAttachment(file);
    if (res.success && res.data) {
      patch(key, {
        status: 'ok',
        attachment: {
          id: key,
          fileName: res.data.fileName,
          fileSize: res.data.fileSize,
          fileType: res.data.fileType,
          url: res.data.cloudinaryUrl,
        },
      });
    } else {
      patch(key, { status: 'err', error: res.message || 'Chưa tải lên được. Hãy bỏ tệp rồi chọn lại.' });
    }
  };

  const pick = (list: FileList | null) => {
    for (const file of Array.from(list ?? [])) {
      const key = `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const isImage = file.type.startsWith('image/');
      const tooBig = file.size > MAX_BYTES;
      setFiles((prev) => [
        ...prev,
        {
          key,
          name: file.name,
          size: file.size,
          isImage,
          preview: isImage ? URL.createObjectURL(file) : undefined,
          status: tooBig ? 'err' : 'up',
          error: tooBig ? `Tệp ${sizeMb(file.size)}, lớn hơn 5MB. Hãy chọn tệp nhỏ hơn.` : undefined,
        },
      ]);
      if (!tooBig) void upload(key, file);
    }
  };

  const remove = (file: PickedFile) => {
    if (file.preview) URL.revokeObjectURL(file.preview);
    setFiles((prev) => prev.filter((f) => f.key !== file.key));
  };

  const uploading = files.some((f) => f.status === 'up');
  const missing = !title.trim() || !content.trim();
  const why = uploading
    ? 'Đợi tệp tải lên xong rồi đăng.'
    : missing
      ? 'Cần có tiêu đề và nội dung để đăng.'
      : files.some((f) => f.status === 'err')
        ? 'Tệp lỗi sẽ không được đính kèm.'
        : '';

  const submit = async () => {
    if (posting || uploading || missing) return;
    setPosting(true);
    setFailed(false);
    const ok = await onSubmit({
      channel,
      title: title.trim(),
      content: content.trim(),
      isAnonymous: !isAdmin && anonymous,
      attachments: files.flatMap((f) => (f.status === 'ok' && f.attachment ? [f.attachment] : [])),
    });
    setPosting(false);
    if (!ok) {
      setFailed(true);
      return;
    }
    files.forEach((f) => f.preview && URL.revokeObjectURL(f.preview));
    setTitle('');
    setContent('');
    setAnonymous(false);
    setFiles([]);
  };

  return createPortal(
    <div className="fm" data-theme={theme}>
      <Modal
        open={open}
        size="lg"
        className="fm-composer"
        title="Đăng bài thảo luận"
        onClose={onClose}
        footer={
          <>
            <p className="fm-cp-why" aria-live="polite">
              {why}
            </p>
            <Button variant="ghost" onClick={onClose}>
              Huỷ
            </Button>
            <Button variant="primary" icon="send" loading={posting} disabled={missing || uploading} onClick={submit}>
              Đăng bài
            </Button>
          </>
        }
      >
        <div className="fm-cp">
          <fieldset className="fm-cp-set">
            <legend className="jc-field__label">Chọn kênh</legend>
            <div className="fm-cp-grid" role="radiogroup" aria-label="Kênh">
              {CHANNELS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={channel === c.id}
                  className={`fm-cp-ch fm-ch ${channel === c.id ? 'on' : ''}`}
                  style={channelStyle(c.id)}
                  onClick={() => setChannel(c.id)}
                >
                  <span className="ct" aria-hidden="true">
                    <Icon name={c.icon} size={20} />
                  </span>
                  <span className="cx">
                    <span className="cn">{c.label}</span>
                    <span className="cd">{c.desc}</span>
                  </span>
                  <span className="ck" aria-hidden="true">
                    <Icon name="check_circle" size={20} fill />
                  </span>
                </button>
              ))}
            </div>
          </fieldset>

          <div>
            <TextField
              label="Tiêu đề"
              required
              maxLength={TITLE_MAX}
              placeholder="Ví dụ: は và が khác nhau thế nào?"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setFailed(false);
              }}
            />
            <p className={`fm-cp-count ${title.length > TITLE_WARN ? 'warn' : ''}`}>{`${title.length}/${TITLE_MAX} ký tự`}</p>
          </div>

          <TextField
            label="Nội dung"
            required
            multiline
            rows={5}
            placeholder="Chép nguyên câu tiếng Nhật, ghi tên bài học và chỗ bạn chưa hiểu."
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              setFailed(false);
            }}
          />

          <div className="fm-cp-att">
            <p className="jc-field__label">Ảnh hoặc tệp đính kèm</p>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={ACCEPT}
              hidden
              onChange={(e) => {
                pick(e.target.files);
                e.target.value = '';
              }}
            />
            <button type="button" className="fm-cp-drop" onClick={() => inputRef.current?.click()}>
              <Icon name="upload_file" size={26} />
              <span className="dx">
                <span className="dt">Thêm ảnh hoặc tệp</span>
                <span className="dd">Ảnh, PDF, TXT, DOC, DOCX. Mỗi tệp tối đa 5MB, chọn được nhiều tệp.</span>
              </span>
            </button>
            {files.length > 0 && (
              <ul className="fm-cp-files">
                {files.map((f) => (
                  <li key={f.key} className={`fm-cp-file ${f.status}`}>
                    {f.preview ? (
                      <img className="th" src={f.preview} alt="" />
                    ) : (
                      <span className="th" aria-hidden="true">
                        <Icon name={f.name.toLowerCase().endsWith('.pdf') ? 'picture_as_pdf' : 'description'} size={22} />
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
                        {f.status === 'err'
                          ? f.error
                          : f.status === 'up'
                            ? `Đang tải lên · ${formatFileSize(f.size)}`
                            : `Đã tải lên · ${formatFileSize(f.size)}`}
                      </span>
                      {f.status === 'up' && (
                        <span className="bar" role="progressbar" aria-label={`Đang tải lên ${f.name}`}>
                          <i />
                        </span>
                      )}
                    </span>
                    <IconButton icon="close" label={`Bỏ tệp ${f.name}`} size="sm" onClick={() => remove(f)} />
                  </li>
                ))}
              </ul>
            )}
          </div>

          {!isAdmin && (
            <div className="fm-cp-anon">
              <Switch
                label="Đăng ẩn danh"
                description="Mọi người sẽ thấy “Thành viên ẩn danh #…”, không thấy tên và ảnh đại diện của bạn."
                checked={anonymous}
                onChange={setAnonymous}
              />
            </div>
          )}

          {failed && (
            <Alert tone="danger" title="Chưa đăng được bài">
              Nội dung bạn viết vẫn được giữ nguyên. Bấm Đăng bài để thử lại.
            </Alert>
          )}
        </div>
      </Modal>
    </div>,
    document.body,
  );
};
