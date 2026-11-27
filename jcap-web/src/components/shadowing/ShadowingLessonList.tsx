import React, { useEffect, useRef, useState } from 'react';
import { Icon, IconButton } from '../jcap';
import type { ShadowingDialogueItem } from '../../types/shadowing';
import type { ShadowingProgress } from '../../types/shadowingProgress';
import { lessonState, scoreTone, topicOf } from './library';
import { LevelMenu } from './LevelMenu';

const RADIUS = 11.5;
const LENGTH = 2 * Math.PI * RADIUS;

export interface LessonRowData {
  item: ShadowingDialogueItem;
  progress: ShadowingProgress | null;
  best?: number;
  saved: boolean;
}

const ShadowingLessonRow: React.FC<LessonRowData & { selected: boolean; showTopic: boolean; tabbable: boolean; onSelect: () => void }> = ({
  item,
  progress,
  best,
  saved,
  selected,
  showTopic,
  tabbable,
  onSelect,
}) => {
  const state = lessonState(progress);
  const done = progress?.completedSentenceCount ?? 0;
  const ratio = Math.min(1, done / Math.max(1, item.totalSentences));
  const meta =
    state === 'progress' && progress
      ? `Vai ${progress.role} · câu ${progress.currentSentenceIndex + 1}/${item.totalSentences}`
      : `${item.jlptLevel} · ${item.totalSentences} câu`;
  const stateLabel = state === 'done' ? 'Đã xong' : state === 'progress' ? 'Đang học' : 'Chưa học';
  return (
    <li role="presentation">
      <button
        type="button"
        role="option"
        aria-selected={selected}
        tabIndex={tabbable ? 0 : -1}
        className={`shl-row ${state} ${selected ? 'on' : ''}`}
        onClick={onSelect}
      >
        <span className="st" role="img" aria-label={stateLabel}>
          <svg viewBox="0 0 28 28" aria-hidden="true">
            <circle cx="14" cy="14" r={RADIUS} className="tr" />
            {state === 'progress' && (
              <circle cx="14" cy="14" r={RADIUS} className="arc" strokeDasharray={`${Math.max(0.04, ratio) * LENGTH} ${LENGTH}`} transform="rotate(-90 14 14)" />
            )}
          </svg>
          {state === 'done' && <Icon name="check" size={18} />}
        </span>
        <span className="tx">
          <span className="t">{item.title}</span>
          <span className="m">
            {showTopic && `${topicOf(item)} · `}
            {meta}
          </span>
        </span>
        {best !== undefined && (
          <span className={`best ${scoreTone(Math.round(best))}`} title="Điểm cao nhất" aria-label={`Điểm cao nhất ${Math.round(best)}`}>
            <b>{Math.round(best)}</b>
          </span>
        )}
        {saved && <Icon name="bookmark" size={18} fill className="bm" label="Đã lưu" />}
        <Icon name="chevron_right" size={20} className="chev" />
      </button>
    </li>
  );
};

/** Cột bài: tên mục, chọn cấp, tìm kiếm thu thành icon, mỗi bài một dòng */
export const ShadowingLessonList: React.FC<{
  heading: string;
  summary: string;
  rows: LessonRowData[];
  showTopic: boolean;
  selectedId: number | null;
  onSelect: (id: number) => void;
  level: string;
  onLevel: (level: string) => void;
  query: string;
  onQuery: (query: string) => void;
  /** Nội dung thay cho danh sách: đang tải, lỗi, mục rỗng */
  placeholder?: React.ReactNode;
}> = ({ heading, summary, rows, showTopic, selectedId, onSelect, level, onLevel, query, onQuery, placeholder }) => {
  const [opened, setOpened] = useState(false);
  const searching = opened || query !== '';
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (opened) inputRef.current?.focus();
  }, [opened]);
  const closeSearch = () => {
    onQuery('');
    setOpened(false);
  };
  const listRef = useRef<HTMLUListElement>(null);
  const tabId = rows.some((r) => r.item.id === selectedId) ? selectedId : (rows[0]?.item.id ?? null);

  // Mũi tên lên xuống chuyển giữa các bài trong danh sách
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const options = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? []);
    const at = options.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0) return;
    e.preventDefault();
    const next = options[Math.max(0, Math.min(options.length - 1, at + (e.key === 'ArrowDown' ? 1 : -1)))];
    next.focus();
    next.click();
  };

  return (
    <section className="shl-list" aria-label={heading}>
      <header>
        {searching ? (
          <label className="jc-input shl-search">
            <Icon name="search" size={18} className="jc-input__icon" />
            <input
              ref={inputRef}
              className="jc-input__el"
              type="search"
              placeholder="Tìm bài trong mọi chủ đề"
              aria-label="Tìm bài trong mọi chủ đề"
              value={query}
              onChange={(e) => onQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Escape') return;
                e.preventDefault();
                closeSearch();
              }}
            />
            <button type="button" className="x" aria-label="Đóng tìm kiếm" onClick={closeSearch}>
              <Icon name="close" size={18} />
            </button>
          </label>
        ) : (
          <h2>{heading}</h2>
        )}
        <LevelMenu value={level} onChange={onLevel} />
        {!searching && <IconButton icon="search" label="Tìm bài học" size="sm" onClick={() => setOpened(true)} />}
      </header>
      <p className="sum" aria-live="polite">
        {summary}
      </p>
      {placeholder ? (
        <div className="ph">{placeholder}</div>
      ) : (
        <ul className="items" role="listbox" aria-label="Danh sách bài" ref={listRef} onKeyDown={onKeyDown}>
          {rows.map((r) => (
            <ShadowingLessonRow
              key={r.item.id}
              {...r}
              showTopic={showTopic}
              selected={r.item.id === selectedId}
              tabbable={r.item.id === tabId}
              onSelect={() => onSelect(r.item.id)}
            />
          ))}
        </ul>
      )}
    </section>
  );
};
