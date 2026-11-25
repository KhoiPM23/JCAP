import React from 'react';
import { Button, Icon } from '../jcap';
import type { FeedbackTicket } from '../../services/feedbackService';
import { CATEGORIES, FILTERS, statusView, supportTime } from './meta';
import type { TicketFilter, Viewer } from './thread';

export const TicketStatus: React.FC<{ ticket: FeedbackTicket; inLearnerList?: boolean; pill?: boolean }> = ({ ticket, inLearnerList, pill }) => {
  const s = statusView(ticket, inLearnerList);
  return (
    <span className={`sup-status ${s.tone} ${pill ? 'pill' : ''}`}>
      <Icon name={s.icon} size={pill ? 16 : 14} />
      {s.label}
    </span>
  );
};

export const TicketList: React.FC<{
  viewer: Viewer;
  /** Phiếu sau khi lọc */
  tickets: FeedbackTicket[];
  counts: Record<TicketFilter, number>;
  filter: TicketFilter;
  onFilter: (filter: TicketFilter) => void;
  query?: string;
  onQuery?: (query: string) => void;
  selectedId: number | null;
  onSelect: (id: number) => void;
  onNew?: () => void;
}> = ({ viewer, tickets, counts, filter, onFilter, query = '', onQuery, selectedId, onSelect, onNew }) => (
  <aside className="sup-list" aria-label="Danh sách phiếu hỗ trợ">
    {viewer === 'learner' ? (
      <button type="button" className="sup-new" onClick={onNew}>
        <Icon name="add" size={20} />
        Báo sự cố mới
      </button>
    ) : (
      <label className="jc-input sup-search">
        <Icon name="search" size={18} className="jc-input__icon" />
        <input
          className="jc-input__el"
          type="search"
          placeholder="Tìm mã phiếu hoặc tiêu đề"
          aria-label="Tìm theo mã phiếu hoặc tiêu đề"
          value={query}
          onChange={(e) => onQuery?.(e.target.value)}
        />
      </label>
    )}

    <div className="sup-filters" role="radiogroup" aria-label="Lọc theo trạng thái">
      {FILTERS.map((f) => (
        <button key={f.id} type="button" role="radio" aria-checked={filter === f.id} onClick={() => onFilter(f.id)}>
          {f.label} <span className="n">{counts[f.id]}</span>
        </button>
      ))}
    </div>

    {tickets.length === 0 ? (
      <div className="sup-none">
        <p>
          {query.trim()
            ? `Không có phiếu nào khớp với “${query.trim()}”.`
            : counts.ALL === 0
              ? 'Chưa có phiếu nào.'
              : 'Không có phiếu nào ở trạng thái này.'}
        </p>
        {counts.ALL > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onFilter('ALL');
              onQuery?.('');
            }}
          >
            Xem tất cả phiếu
          </Button>
        )}
      </div>
    ) : (
      <ul className="sup-rows">
        {tickets.map((t) => {
          const cat = CATEGORIES[t.category] ?? CATEGORIES.SYSTEM_BUG;
          const status = statusView(t, viewer === 'learner');
          const unseen = viewer === 'admin' && !t.adminSeenAt;
          return (
            <li key={t.id}>
              <button
                type="button"
                className={`sup-row ${selectedId === t.id ? 'on' : ''} ${unseen ? 'unseen' : ''}`}
                aria-current={selectedId === t.id}
                aria-label={`${t.title}. ${cat.label}. ${status.label}. Cập nhật ${supportTime(t.updatedAt)}${unseen ? '. Chưa xem' : ''}`}
                onClick={() => onSelect(t.id)}
              >
                <span className="ic" title={cat.label} aria-hidden="true">
                  <Icon name={cat.icon} size={18} />
                </span>
                <span className="tx">
                  <span className="tt">{t.title}</span>
                  <span className="mt">
                    {viewer === 'admin' && <span className="code">{t.anonymousCode}</span>}
                    <TicketStatus ticket={t} inLearnerList={viewer === 'learner'} />
                    <span className="tm">{supportTime(t.updatedAt)}</span>
                  </span>
                </span>
                {unseen && <i className="dot" aria-hidden="true" />}
              </button>
            </li>
          );
        })}
      </ul>
    )}
  </aside>
);
