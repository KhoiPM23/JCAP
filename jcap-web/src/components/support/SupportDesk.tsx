import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Button, EmptyState, Icon, Toast } from '../jcap';
import {
  feedbackService,
  type CreateFeedbackTicketPayload,
  type FeedbackAttachment,
  type ReplyFeedbackTicketPayload,
} from '../../services/feedbackService';
import { ImageLightbox } from './ImageLightbox';
import { NewTicketModal } from './NewTicketModal';
import { AdminFeedbackGrid, FeedbackForm, FeedbackList } from './Suggestions';
import { SupportHeader, type SupportTab } from './SupportHeader';
import { countByStatus, filterTickets, suggestionTickets, supportTickets, type TicketFilter, type Viewer } from './thread';
import { TicketList } from './TicketList';
import { TicketReplyBox } from './TicketReplyBox';
import { TicketThread } from './TicketThread';
import { useTickets } from './useTickets';
import './support.css';

const loaders = {
  learner: () => feedbackService.getMyTickets(),
  admin: () => feedbackService.getAllTicketsForAdmin(),
};

/** Trang Hỗ trợ & Góp ý (HANDOFF 9i), dùng chung cho học viên và admin; khác nhau theo `viewer` */
export const SupportDesk: React.FC<{ viewer: Viewer; theme: string }> = ({ viewer, theme }) => {
  const admin = viewer === 'admin';
  const navigate = useNavigate();
  const data = useTickets(loaders[viewer]);

  const [tab, setTab] = useState<SupportTab>('issues');
  const [filter, setFilter] = useState<TicketFilter>('ALL');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  /** Điện thoại: danh sách và nội dung phiếu là hai màn */
  const [mobileThread, setMobileThread] = useState(false);
  /** Các phiếu đã mở: giữ ô trả lời của từng phiếu để đổi phiếu không mất chữ đang gõ */
  const [visited, setVisited] = useState<number[]>([]);
  const [composing, setComposing] = useState(false);
  const [image, setImage] = useState<FeedbackAttachment | null>(null);
  const [toast, setToast] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(''), 5000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const issues = supportTickets(data.tickets);
  const ideas = suggestionTickets(data.tickets);
  const shown = filterTickets(issues, filter, query);
  const selected = issues.find((t) => t.id === selectedId) ?? null;

  // Mở trang (hoặc phiếu đang chọn không còn) thì chọn phiếu đầu danh sách
  useEffect(() => {
    if (data.status === 'ok' && !selected && issues.length > 0) setSelectedId(issues[0].id);
  }, [data.status, selected, issues]);

  useEffect(() => {
    if (selected) setVisited((v) => (v.includes(selected.id) ? v : [...v, selected.id]));
  }, [selected]);

  // Admin đang xem một phiếu chưa được xem: đánh dấu đã xem
  const unseenId = admin && tab === 'issues' && selected && !selected.adminSeenAt ? selected.id : null;
  const { put } = data;
  useEffect(() => {
    if (unseenId == null) return;
    // Điện thoại: chỉ tính là đã xem khi thật sự mở màn nội dung
    if (!mobileThread && window.matchMedia('(max-width: 760px)').matches) return;
    feedbackService.markSeenByAdmin(unseenId).then((res) => {
      if (res.success && res.data) put(res.data);
    });
  }, [unseenId, mobileThread, put]);

  const create = async (payload: CreateFeedbackTicketPayload) => {
    const res = await feedbackService.createTicket(payload);
    if (!res.success || !res.data) return false;
    data.put(res.data);
    if (payload.category === 'SUGGESTION') {
      setToast('Góp ý đã được ghi nhận. Cảm ơn bạn!');
    } else {
      setComposing(false);
      setFilter('ALL');
      setSelectedId(res.data.id);
      setMobileThread(true);
      setToast(`Đã gửi phiếu ${res.data.anonymousCode}. Admin sẽ trả lời trong phiếu này.`);
    }
    return true;
  };

  const reply = async (ticketId: number, payload: ReplyFeedbackTicketPayload) => {
    const res = admin ? await feedbackService.replyAsAdmin(ticketId, payload) : await feedbackService.replyAsLearner(ticketId, payload);
    if (!res.success || !res.data) {
      // Có thể admin vừa đóng phiếu: tải lại để khung hiện đúng trạng thái
      void data.refresh();
      return false;
    }
    data.put(res.data);
    return true;
  };

  const toggleClosed = async () => {
    if (!selected || busy) return;
    setBusy(true);
    setActionError('');
    const res =
      selected.status === 'CLOSED'
        ? await feedbackService.reopenTicketAsAdmin(selected.id)
        : await feedbackService.closeTicketAsAdmin(selected.id);
    setBusy(false);
    if (res.success && res.data) data.put(res.data);
    else setActionError(res.message || 'Không cập nhật được trạng thái phiếu.');
  };

  const openNew = () => setComposing(true);

  let body: React.ReactNode;
  if (data.status === 'loading') {
    body = (
      <div className="sup-cols" aria-busy="true" aria-label="Đang tải dữ liệu hỗ trợ">
        <div className="sup-list">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="sup-skel" aria-hidden="true">
              <span className="jc-skel jc-skel--text" style={{ width: '82%' }} />
              <span className="jc-skel jc-skel--text" style={{ width: '48%' }} />
            </div>
          ))}
        </div>
        <div className="sup-thread sup-skel" aria-hidden="true">
          <span className="jc-skel jc-skel--text" style={{ width: '56%', height: 18 }} />
          <span className="jc-skel jc-skel--text" style={{ width: '34%' }} />
          <span className="jc-skel" style={{ width: '62%', height: 84, marginTop: 24 }} />
          <span className="jc-skel" style={{ width: '48%', height: 64, marginLeft: 'auto', marginTop: 12 }} />
        </div>
      </div>
    );
  } else if (data.status === 'error') {
    body = (
      <EmptyState
        className="sup-empty"
        icon="cloud_off"
        title="Chưa tải được dữ liệu hỗ trợ"
        action={
          <Button variant="primary" icon="refresh" onClick={data.retry}>
            Thử lại
          </Button>
        }
      >
        Máy chủ chưa phản hồi. Kiểm tra kết nối mạng rồi thử lại.
      </EmptyState>
    );
  } else if (tab === 'ideas') {
    body = admin ? (
      ideas.length === 0 ? (
        <EmptyState className="sup-empty" icon="lightbulb" title="Chưa có góp ý nào">
          Góp ý của học viên sẽ hiện ở đây.
        </EmptyState>
      ) : (
        <div className="sup-scroll">
          <AdminFeedbackGrid items={ideas} />
        </div>
      )
    ) : (
      <div className="sup-scroll sup-two">
        <FeedbackForm onSubmit={create} />
        <FeedbackList items={ideas} />
      </div>
    );
  } else if (issues.length === 0) {
    body = admin ? (
      <EmptyState className="sup-empty" icon="support_agent" title="Chưa có phiếu sự cố nào">
        Phiếu học viên gửi sẽ hiện ở đây.
      </EmptyState>
    ) : (
      <EmptyState
        className="sup-empty"
        icon="support_agent"
        title="Bạn chưa có phiếu hỗ trợ nào"
        action={
          <Button variant="primary" icon="add" onClick={openNew}>
            Báo sự cố mới
          </Button>
        }
        secondaryAction={
          <Button variant="ghost" icon="groups" onClick={() => navigate('/community')}>
            Hỏi bài tại Diễn đàn
          </Button>
        }
      >
        Báo lỗi Credit, micro, chấm điểm hoặc nội dung bài học và trao đổi với Admin tại đây. Bạn ẩn danh: Admin chỉ thấy mã phiếu.
      </EmptyState>
    );
  } else {
    body = (
      <div className={`sup-cols ${mobileThread ? 'in-thread' : ''}`}>
        <TicketList
          viewer={viewer}
          tickets={shown}
          counts={countByStatus(issues)}
          filter={filter}
          onFilter={setFilter}
          query={query}
          onQuery={admin ? setQuery : undefined}
          selectedId={selected?.id ?? null}
          onSelect={(id) => {
            setSelectedId(id);
            setMobileThread(true);
            setActionError('');
          }}
          onNew={openNew}
        />
        {selected ? (
          <TicketThread
            viewer={viewer}
            ticket={selected}
            onBack={() => setMobileThread(false)}
            onImage={setImage}
            onToggleClosed={admin ? toggleClosed : undefined}
            busy={busy}
          >
            {actionError && (
              <p className="sup-fail" role="alert">
                <Icon name="error" size={18} />
                {actionError}
              </p>
            )}
            {selected.status === 'CLOSED' && (
              <div className="sup-closed">
                <Icon name="task_alt" size={20} />
                <span>{admin ? 'Phiếu đã đóng. Mở lại để trả lời tiếp.' : 'Sự cố này đã được xử lý xong và đóng lại.'}</span>
                <Button variant="secondary" size="sm" icon={admin ? 'lock_open' : 'add'} onClick={admin ? toggleClosed : openNew}>
                  {admin ? 'Mở lại phiếu' : 'Báo sự cố mới'}
                </Button>
              </div>
            )}
            {visited
              .map((id) => issues.find((t) => t.id === id))
              .map(
                (t) =>
                  t && (
                    <TicketReplyBox
                      key={t.id}
                      viewer={viewer}
                      code={t.anonymousCode}
                      hidden={t.id !== selected.id || t.status === 'CLOSED'}
                      onSend={(payload) => reply(t.id, payload)}
                    />
                  ),
              )}
          </TicketThread>
        ) : (
          <div className="sup-thread sup-pickone">
            <Icon name="forum" size={32} />
            <p>Chọn một phiếu để xem trao đổi</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="sup" data-theme={theme}>
      <div className={`sup-wrap ${admin ? 'is-admin' : ''}`}>
        <SupportHeader
          viewer={viewer}
          tab={tab}
          onTab={setTab}
          issues={issues.length}
          ideas={ideas.length}
          onReload={admin ? () => void data.refresh() : undefined}
          onForum={admin ? () => navigate('/admin/community') : undefined}
        />
        {body}
      </div>
      {createPortal(
        <div className="sup" data-theme={theme}>
          <div>
            {!admin && <NewTicketModal open={composing} onClose={() => setComposing(false)} onSubmit={create} />}
            {image && <ImageLightbox src={image.cloudinaryUrl} name={image.fileName} onClose={() => setImage(null)} />}
            {toast && (
              <div className="sup-toast">
                <Toast title={toast} onClose={() => setToast('')} />
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
};
