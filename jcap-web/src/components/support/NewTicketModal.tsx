import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button, Icon, Modal, TextField } from '../jcap';
import type { CreateFeedbackTicketPayload, FeedbackCategory } from '../../services/feedbackService';
import { AttachmentList, FileInput, useAttachments } from './AttachmentPicker';
import { CATEGORIES, SUPPORT_CATEGORIES } from './meta';

const TITLE_MAX = 300;
const TITLE_WARN = 270;

/** Khung "Báo sự cố mới". Luôn được dựng nên đóng rồi mở lại vẫn còn bản nháp; chỉ xoá sau khi gửi được. */
export const NewTicketModal: React.FC<{
  open: boolean;
  onClose: () => void;
  /** true = đã gửi */
  onSubmit: (payload: CreateFeedbackTicketPayload) => Promise<boolean>;
}> = ({ open, onClose, onSubmit }) => {
  const [category, setCategory] = useState<FeedbackCategory>('PAYMENT_CREDIT');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const at = useAttachments();

  const missing = !title.trim() || !content.trim();
  const why = at.uploading
    ? 'Đợi tệp tải lên xong rồi gửi.'
    : missing
      ? 'Cần có tiêu đề và mô tả để gửi.'
      : at.hasError
        ? 'Tệp lỗi sẽ không được gửi kèm.'
        : '';

  const submit = async () => {
    if (sending || missing || at.uploading) return;
    setSending(true);
    setFailed(false);
    const ok = await onSubmit({ category, title: title.trim(), content: content.trim(), attachments: at.payload });
    setSending(false);
    if (!ok) {
      setFailed(true);
      return;
    }
    setTitle('');
    setContent('');
    setCategory('PAYMENT_CREDIT');
    at.reset();
  };

  return (
    <Modal
      open={open}
      size="lg"
      className="sup-modal"
      title="Báo sự cố mới"
      onClose={onClose}
      footer={
        <>
          <p className="sup-why" aria-live="polite">
            {why}
          </p>
          <Button variant="ghost" onClick={onClose}>
            Huỷ
          </Button>
          <Button variant="primary" icon="send" loading={sending} disabled={missing || at.uploading} onClick={submit}>
            Gửi yêu cầu
          </Button>
        </>
      }
    >
      <div className="sup-form">
        <div>
          <div className="sup-cats" role="radiogroup" aria-label="Loại sự cố">
            {SUPPORT_CATEGORIES.map((id) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={category === id}
                className={category === id ? 'on' : ''}
                onClick={() => setCategory(id)}
              >
                <span className="ic" aria-hidden="true">
                  <Icon name={CATEGORIES[id].icon} size={20} />
                </span>
                <span className="cx">
                  <b>{CATEGORIES[id].label}</b>
                  <span>{CATEGORIES[id].use}</span>
                </span>
              </button>
            ))}
          </div>
          <p className="sup-hint">
            Hỏi về ngữ pháp, từ vựng? <Link to="/community">Hỏi tại Diễn đàn</Link>
          </p>
        </div>

        <div>
          <TextField
            label="Tiêu đề"
            required
            maxLength={TITLE_MAX}
            placeholder="Đã thanh toán qua PayOS nhưng chưa cộng Credit"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setFailed(false);
            }}
          />
          <p className={`sup-count ${title.length > TITLE_WARN ? 'warn' : ''}`}>{`${title.length}/${TITLE_MAX} ký tự`}</p>
        </div>

        <TextField
          label="Mô tả chi tiết"
          required
          multiline
          rows={4}
          placeholder="Điều gì đã xảy ra? Nếu có, ghi mã giao dịch hoặc tên bài học bị lỗi."
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
            setFailed(false);
          }}
        />

        <div className="sup-att">
          <FileInput at={at} />
          <button type="button" className="sup-drop" onClick={at.open}>
            <Icon name="upload_file" size={24} />
            <span>
              <b>Thêm ảnh hoặc tệp</b>
              <span>Ảnh, PDF, TXT, LOG, JSON, ZIP, DOC, DOCX. Mỗi tệp tối đa 5MB.</span>
            </span>
          </button>
          <AttachmentList at={at} />
        </div>

        <p className="sup-anon">
          <Icon name="shield_person" size={14} />
          Ẩn danh: Admin chỉ thấy mã phiếu (dạng #ANON-1234), không thấy tên hay email của bạn.
        </p>

        {failed && (
          <Alert tone="danger" title="Chưa gửi được yêu cầu">
            Nội dung bạn viết vẫn được giữ nguyên. Bấm Gửi yêu cầu để thử lại.
          </Alert>
        )}
      </div>
    </Modal>
  );
};
