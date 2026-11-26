import React, { useState } from 'react';
import { Alert, Button, Icon, TextField } from '../jcap';
import type { CreateFeedbackTicketPayload, FeedbackTicket } from '../../services/feedbackService';
import { supportTime } from './meta';

const TITLE_MAX = 300;
const TITLE_WARN = 270;

/** Góp ý một chiều: không có đính kèm, không có trả lời hay trạng thái xử lý */
export const FeedbackForm: React.FC<{ onSubmit: (payload: CreateFeedbackTicketPayload) => Promise<boolean> }> = ({ onSubmit }) => {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const missing = !title.trim() || !content.trim();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sending || missing) return;
    setSending(true);
    setFailed(false);
    const ok = await onSubmit({ category: 'SUGGESTION', title: title.trim(), content: content.trim(), attachments: [] });
    setSending(false);
    if (!ok) {
      setFailed(true);
      return;
    }
    setTitle('');
    setContent('');
  };

  return (
    <form className="sup-card sup-form" onSubmit={submit}>
      <div>
        <h2>Gửi góp ý</h2>
        <p className="sup-sub">Đội ngũ đọc mọi góp ý, nhưng không trả lời riêng.</p>
      </div>
      <div>
        <TextField
          label="Chủ đề góp ý"
          required
          maxLength={TITLE_MAX}
          placeholder="Thêm tốc độ đọc 0,75x cho bài Shadowing"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setFailed(false);
          }}
        />
        <p className={`sup-count ${title.length > TITLE_WARN ? 'warn' : ''}`}>{`${title.length}/${TITLE_MAX} ký tự`}</p>
      </div>
      <TextField
        label="Chi tiết đề xuất"
        required
        multiline
        rows={5}
        placeholder="Bạn chưa hài lòng chỗ nào, hoặc muốn JCAP có thêm gì?"
        value={content}
        onChange={(e) => {
          setContent(e.target.value);
          setFailed(false);
        }}
      />
      {failed && (
        <Alert tone="danger" title="Chưa gửi được góp ý">
          Nội dung bạn viết vẫn được giữ nguyên. Hãy thử lại.
        </Alert>
      )}
      <div className="sup-formfoot">
        <span className="sup-anon">
          <Icon name="shield_person" size={14} />
          Ẩn danh
        </span>
        <Button type="submit" variant="primary" icon="send" loading={sending} disabled={missing}>
          Gửi góp ý
        </Button>
      </div>
    </form>
  );
};

export const FeedbackList: React.FC<{ items: FeedbackTicket[] }> = ({ items }) => (
  <section className="sup-ideas" aria-label="Góp ý đã gửi">
    <h2>
      Góp ý đã gửi <span className="n">{items.length}</span>
    </h2>
    {items.length === 0 ? (
      <p className="sup-sub">Chưa gửi góp ý nào. Góp ý đầu tiên của bạn sẽ hiện ở đây.</p>
    ) : (
      <ul>
        {items.map((t) => (
          <li key={t.id}>
            <b>{t.title}</b>
            <p>{t.messages[0]?.content}</p>
            <span className="mt">
              <span>{supportTime(t.createdAt)}</span>
              <span className="ok">
                <Icon name="check_circle" size={14} />
                Đã ghi nhận
              </span>
            </span>
          </li>
        ))}
      </ul>
    )}
  </section>
);

/** Màn admin: chỉ đọc, chỉ có mã ẩn danh */
export const AdminFeedbackGrid: React.FC<{ items: FeedbackTicket[] }> = ({ items }) => (
  <ul className="sup-grid">
    {items.map((t) => (
      <li key={t.id} className="sup-card">
        <p className="mt">
          <span className="code">{t.anonymousCode}</span>
          <span>{supportTime(t.createdAt)}</span>
        </p>
        <h2>{t.title}</h2>
        <p className="body">{t.messages[0]?.content}</p>
      </li>
    ))}
  </ul>
);
