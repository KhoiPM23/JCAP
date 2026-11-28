import React from 'react';
import { IconButton } from '../jcap';
import type { Viewer } from './thread';

export type SupportTab = 'issues' | 'ideas';

/** Đầu trang một dòng: tiêu đề và nút gạt Sự cố / Góp ý */
export const SupportHeader: React.FC<{
  viewer: Viewer;
  tab: SupportTab;
  onTab: (tab: SupportTab) => void;
  issues: number;
  ideas: number;
  onReload?: () => void;
  onForum?: () => void;
}> = ({ viewer, tab, onTab, issues, ideas, onReload, onForum }) => (
  <header className="sup-head">
    <h1>
      {viewer === 'admin' ? 'Quản trị hỗ trợ' : 'Hỗ trợ & Góp ý'}
      {viewer === 'learner' && (
        <span className="kj" lang="ja">
          窓口
        </span>
      )}
    </h1>
    <div className="sup-tabs" role="tablist" aria-label="Phần hỗ trợ">
      <span className="thumb" aria-hidden="true" data-at={tab} />
      {(
        [
          ['issues', 'Sự cố', issues],
          ['ideas', 'Góp ý', ideas],
        ] as const
      ).map(([id, label, n]) => (
        <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => onTab(id)}>
          {label} <span className="n">{n}</span>
        </button>
      ))}
    </div>
    <span className="sup-sp" />
    {onReload && <IconButton icon="refresh" label="Tải lại" onClick={onReload} />}
    {onForum && <IconButton icon="groups" label="Quản lý Diễn đàn" onClick={onForum} />}
  </header>
);
