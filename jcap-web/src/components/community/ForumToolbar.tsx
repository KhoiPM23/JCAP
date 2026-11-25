import React, { useEffect, useRef, useState } from 'react';
import { Icon, IconButton, SegmentedControl } from '../jcap';
import type { ForumSort } from './feed';

export const ForumToolbar: React.FC<{
  sort: ForumSort;
  onSort: (sort: ForumSort) => void;
  query: string;
  onQuery: (query: string) => void;
}> = ({ sort, onSort, query, onQuery }) => {
  const [opened, setOpened] = useState(false);
  // Còn từ khoá thì ô tìm luôn mở
  const open = opened || query !== '';
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (opened) inputRef.current?.focus();
  }, [opened]);
  const close = () => {
    onQuery('');
    setOpened(false);
  };
  return (
    <div className="fm-tools">
      {open ? (
        <label className="jc-input fm-search">
          <Icon name="search" size={18} className="jc-input__icon" />
          <input
            ref={inputRef}
            className="jc-input__el"
            type="search"
            placeholder="Tìm bài hoặc tác giả"
            aria-label="Tìm theo tiêu đề, nội dung hoặc tên tác giả"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Escape') return;
              e.preventDefault();
              close();
            }}
          />
          <button type="button" className="fm-x" aria-label="Đóng tìm kiếm" onClick={close}>
            <Icon name="close" size={18} />
          </button>
        </label>
      ) : (
        <span className="fm-sp" />
      )}
      <SegmentedControl
        size="sm"
        ariaLabel="Sắp xếp bài"
        className="fm-sort"
        value={sort}
        onChange={(v) => onSort(v as ForumSort)}
        options={[
          { value: 'HOT', label: 'Nổi bật', icon: 'local_fire_department' },
          { value: 'NEW', label: 'Mới nhất', icon: 'schedule' },
        ]}
      />
      {!open && <IconButton icon="search" label="Tìm bài hoặc tác giả" size="sm" onClick={() => setOpened(true)} />}
    </div>
  );
};
