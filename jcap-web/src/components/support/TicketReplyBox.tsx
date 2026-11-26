import React, { useRef, useState } from 'react';
import { Button, Icon, IconButton } from '../jcap';
import type { ReplyFeedbackTicketPayload } from '../../services/feedbackService';
import { AttachmentList, FileInput, useAttachments } from './AttachmentPicker';
import type { Viewer } from './thread';

const MAX_HEIGHT = 160;

/** Một khung trả lời: đính kèm, ô nhập tự giãn, nút Gửi. Gửi lỗi thì giữ nguyên chữ và tệp. */
export const TicketReplyBox: React.FC<{
  viewer: Viewer;
  code: string;
  hidden?: boolean;
  /** true = server đã nhận */
  onSend: (payload: ReplyFeedbackTicketPayload) => Promise<boolean>;
}> = ({ viewer, code, hidden, onSend }) => {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const at = useAttachments();
  const areaRef = useRef<HTMLTextAreaElement>(null);

  const grow = () => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
    el.style.overflowY = el.scrollHeight > MAX_HEIGHT ? 'auto' : 'hidden';
  };

  const canSend = !sending && !at.uploading && (text.trim() !== '' || at.payload.length > 0);
  const send = async () => {
    if (!canSend) return;
    setSending(true);
    setFailed(false);
    const ok = await onSend({ content: text.trim() || '(Đính kèm tệp/ảnh)', attachments: at.payload });
    setSending(false);
    if (!ok) {
      setFailed(true);
      return;
    }
    setText('');
    at.reset();
    if (areaRef.current) areaRef.current.style.height = 'auto';
  };

  return (
    <div className="sup-reply" hidden={hidden}>
      {failed && (
        <p className="sup-fail" role="alert">
          <Icon name="error" size={18} />
          Chưa gửi được. Nội dung và tệp bạn chọn vẫn còn ở đây.
          <button type="button" onClick={send}>
            Gửi lại
          </button>
        </p>
      )}
      <AttachmentList at={at} />
      <FileInput at={at} />
      <div className="sup-box">
        <IconButton icon="attach_file" label="Đính kèm ảnh hoặc tệp" size="sm" onClick={at.open} />
        <textarea
          ref={areaRef}
          rows={1}
          value={text}
          placeholder={viewer === 'learner' ? 'Bổ sung thông tin cho Admin…' : `Trả lời ${code}…`}
          aria-label={viewer === 'learner' ? 'Nội dung gửi Admin' : `Trả lời ${code}`}
          onChange={(e) => {
            setText(e.target.value);
            setFailed(false);
            grow();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <Button variant="primary" size="sm" icon="send" loading={sending} disabled={!canSend} onClick={send}>
          Gửi
        </Button>
      </div>
      {viewer === 'learner' && (
        <p className="sup-anon">
          <Icon name="shield_person" size={14} />
          {`Bạn đang ẩn danh. Admin chỉ thấy mã ${code}.`}
        </p>
      )}
    </div>
  );
};
