import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button, Icon, IconButton } from '../jcap';
import { formatFileSize, type FeedbackAttachment, type FeedbackTicket } from '../../services/feedbackService';
import { fileIcon } from './files';
import { CATEGORIES, otherName, supportTime } from './meta';
import { buildTimeline, lastIncomingId, type Viewer } from './thread';
import { TicketStatus } from './TicketList';

const NEAR_BOTTOM = 48;

export const TicketThread: React.FC<{
  viewer: Viewer;
  ticket: FeedbackTicket;
  /** Điện thoại: quay lại danh sách */
  onBack: () => void;
  onImage: (attachment: FeedbackAttachment) => void;
  /** Admin: đóng hoặc mở lại phiếu */
  onToggleClosed?: () => void;
  busy?: boolean;
  /** Ô trả lời hoặc dòng báo đã đóng */
  children: React.ReactNode;
}> = ({ viewer, ticket, onBack, onImage, onToggleClosed, busy, children }) => {
  const cat = CATEGORIES[ticket.category] ?? CATEGORIES.SYSTEM_BUG;
  const closed = ticket.status === 'CLOSED';
  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const [incoming, setIncoming] = useState(false);

  const toBottom = () => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    atBottom.current = true;
    setIncoming(false);
  };

  // Mở phiếu là thấy tin mới nhất
  const listRef = useRef<HTMLOListElement>(null);
  useLayoutEffect(() => {
    toBottom();
  }, [ticket.id]);
  // Chiều cao đổi sau khi dựng (phông chữ, ảnh tải xong, khung trả lời cao lên): đang ở cuối thì vẫn giữ ở cuối
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (atBottom.current) toBottom();
    });
    if (scrollRef.current) observer.observe(scrollRef.current);
    if (listRef.current) observer.observe(listRef.current);
    return () => observer.disconnect();
  }, []);

  // Tin mới: đang ở cuối thì theo xuống; đang đọc phía trên thì giữ nguyên chỗ, báo bằng nút nổi
  const last = ticket.messages[ticket.messages.length - 1];
  const incomingId = lastIncomingId(ticket, viewer);
  const seenRef = useRef({ ticket: ticket.id, incoming: incomingId, count: ticket.messages.length });
  useEffect(() => {
    const prev = seenRef.current;
    seenRef.current = { ticket: ticket.id, incoming: incomingId, count: ticket.messages.length };
    if (prev.ticket !== ticket.id || prev.count === ticket.messages.length) return;
    const mine = last?.senderRole === (viewer === 'learner' ? 'LEARNER' : 'ADMIN');
    if (atBottom.current || mine) toBottom();
    else if (incomingId > prev.incoming) setIncoming(true);
  }, [ticket.id, ticket.messages.length, incomingId, last, viewer]);

  return (
    <section className="sup-thread" aria-label={`Nội dung phiếu ${ticket.anonymousCode}`}>
      <header className="sup-th">
        <span className="back">
          <IconButton icon="arrow_back" label="Quay lại danh sách phiếu" onClick={onBack} />
        </span>
        <div className="tx">
          <h2>{ticket.title}</h2>
          <p>
            <span className="code">{ticket.anonymousCode}</span>
            <span className="cat">
              <Icon name={cat.icon} size={16} />
              {cat.label}
            </span>
            <span>{`Tạo ${supportTime(ticket.createdAt).toLowerCase()}`}</span>
          </p>
        </div>
        <div className="side">
          <TicketStatus ticket={ticket} pill />
          {onToggleClosed &&
            (closed ? (
              <Button variant="primary" size="sm" icon="lock_open" loading={busy} onClick={onToggleClosed}>
                Mở lại
              </Button>
            ) : (
              <Button variant="secondary" size="sm" icon="task_alt" loading={busy} onClick={onToggleClosed}>
                Đóng phiếu
              </Button>
            ))}
        </div>
      </header>

      <div
        className="sup-msgs"
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM;
          if (atBottom.current) setIncoming(false);
        }}
        tabIndex={0}
        aria-label="Trao đổi trong phiếu"
      >
        <ol ref={listRef}>
          {buildTimeline(ticket).map((item) => {
            if (item.type === 'event')
              return (
                <li key={item.key} className="sup-event">
                  <span>{`${item.text} · ${supportTime(item.at)}`}</span>
                </li>
              );
            const m = item.message;
            const mine = m.senderRole === (viewer === 'learner' ? 'LEARNER' : 'ADMIN');
            return (
              <li key={item.key} className={`sup-msg ${mine ? 'mine' : 'other'}`}>
                {!mine && (
                  <span className={`av ${viewer === 'admin' ? 'anon' : ''}`} aria-hidden="true">
                    <Icon name={viewer === 'admin' ? 'person' : 'support_agent'} size={18} />
                  </span>
                )}
                <div className="col">
                  <p className="who">
                    {!mine && <b>{otherName(viewer, ticket.anonymousCode)}</b>}
                    {mine && <span className="sr-only">Bạn</span>}
                    <time dateTime={m.createdAt}>{supportTime(m.createdAt)}</time>
                  </p>
                  <div className="bubble">
                    <p className="text">{m.content}</p>
                    {m.attachments.length > 0 && (
                      <div className="atts">
                        {m.attachments.map((a) =>
                          a.fileType === 'IMAGE' ? (
                            <button key={a.id} type="button" className="img" onClick={() => onImage(a)} aria-label={`Xem ảnh ${a.fileName}`}>
                              <img src={a.cloudinaryUrl} alt="" loading="lazy" />
                            </button>
                          ) : (
                            <span key={a.id} className="file">
                              <Icon name={fileIcon(a.fileName)} size={20} />
                              <span className="fx">
                                <span className="fn">{a.fileName}</span>
                                <span className="fs">{formatFileSize(a.fileSize)}</span>
                              </span>
                              <a
                                className="jc-iconbtn jc-iconbtn--ghost jc-iconbtn--sm"
                                href={a.cloudinaryUrl}
                                target="_blank"
                                rel="noreferrer"
                                aria-label={`Mở ${a.fileName} ở tab mới`}
                                title="Mở ở tab mới"
                              >
                                <Icon name="open_in_new" size={18} />
                              </a>
                            </span>
                          ),
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="sup-foot">
        {incoming && (
          <button type="button" className="sup-incoming" onClick={toBottom}>
            <Icon name="arrow_downward" size={18} />
            {viewer === 'learner' ? 'Admin vừa trả lời' : 'Học viên vừa trả lời'}
          </button>
        )}
        {children}
      </div>
    </section>
  );
};
