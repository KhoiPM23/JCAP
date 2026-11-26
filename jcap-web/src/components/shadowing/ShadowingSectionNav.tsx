import React from 'react';
import { Icon } from '../jcap';
import { SAVED, type Topic } from './library';

const RADIUS = 17;
const LENGTH = 2 * Math.PI * RADIUS;

const Ring: React.FC<{ done: number; total: number }> = ({ done, total }) => (
  <span className="pring" aria-hidden="true">
    <svg viewBox="0 0 40 40">
      <circle cx="20" cy="20" r={RADIUS} className="tr" />
      {done > 0 && (
        <circle cx="20" cy="20" r={RADIUS} className="arc" strokeDasharray={`${(done / Math.max(1, total)) * LENGTH} ${LENGTH}`} transform="rotate(-90 20 20)" />
      )}
    </svg>
    <b>{`${done}/${total}`}</b>
  </span>
);

/** Cột mục: các chủ đề kèm vòng tiến độ và Đã lưu; điện thoại thành hàng chip */
export const ShadowingSectionNav: React.FC<{
  active: string | null;
  topics: Topic[];
  savedCount: number;
  onPick: (key: string) => void;
}> = ({ active, topics, savedCount, onPick }) => {
  const row = (key: string, label: string, sub: string, lead: React.ReactNode, aria?: string) => (
    <li key={key}>
      <button type="button" className={`shl-sec ${active === key ? 'on' : ''}`} aria-current={active === key} aria-label={aria} onClick={() => onPick(key)}>
        {lead}
        <span className="tx">
          <span className="n">{label}</span>
          <span className="m">{sub}</span>
        </span>
      </button>
    </li>
  );
  return (
    <nav className="shl-nav" aria-label="Mục bài học">
      <ul>
        <li className="cap" aria-hidden="true">
          Chủ đề
        </li>
        {topics.map((t) =>
          row(
            t.key,
            t.name,
            `${t.levels.join(', ')}${t.inProgress ? ` · ${t.inProgress} đang học` : ''}`,
            <Ring done={t.done} total={t.total} />,
            `${t.name}: xong ${t.done} trên ${t.total} bài`,
          ),
        )}
        <li className="div" aria-hidden="true" />
        {row(
          SAVED,
          'Đã lưu',
          `${savedCount} bài`,
          <span className="ic" aria-hidden="true">
            <Icon name="bookmark" size={22} />
          </span>,
        )}
      </ul>
    </nav>
  );
};
