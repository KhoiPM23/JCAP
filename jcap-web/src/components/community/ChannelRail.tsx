import React from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../jcap';
import type { ForumChannel } from '../../types/community';
import { CHANNELS, channelStyle } from './channels';

export const ChannelRail: React.FC<{
  active: 'ALL' | ForumChannel;
  /** Số bài theo kênh, gồm "ALL" */
  counts: Record<string, number>;
  onPick: (channel: 'ALL' | ForumChannel) => void;
  /** Lối sang trang Góp ý (chỉ học viên) */
  showSupport: boolean;
}> = ({ active, counts, onPick, showSupport }) => (
  <nav className="fm-rail" aria-label="Kênh thảo luận">
    <ul className="fm-rc-list">
      {[{ id: 'ALL' as const, label: 'Tất cả', desc: '', icon: 'apps' }, ...CHANNELS].map((c) => (
        <li key={c.id}>
          <button
            type="button"
            className={`fm-rc ${c.id === 'ALL' ? 'all' : 'fm-ch'} ${active === c.id ? 'on' : ''}`}
            style={c.id === 'ALL' ? undefined : channelStyle(c.id)}
            aria-pressed={active === c.id}
            title={c.desc || undefined}
            onClick={() => onPick(c.id)}
          >
            <span className="ct" aria-hidden="true">
              <Icon name={c.icon} size={18} />
            </span>
            <span className="cx">
              <span className="cn">{c.label}</span>
              {c.desc && (
                <span className="cd-wrap" aria-hidden={active !== c.id}>
                  <span className="cd">{c.desc}</span>
                </span>
              )}
            </span>
            <span className="cc" aria-label={`${counts[c.id] ?? 0} bài`}>
              {counts[c.id] ?? 0}
            </span>
          </button>
        </li>
      ))}
    </ul>
    {showSupport && (
      <Link className="fm-help" to="/feedback" title="Báo lỗi ứng dụng hoặc thanh toán">
        <Icon name="support_agent" size={18} />
        Hỗ trợ kỹ thuật
      </Link>
    )}
  </nav>
);
