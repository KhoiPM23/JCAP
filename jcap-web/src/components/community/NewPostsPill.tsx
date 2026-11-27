import React from 'react';
import { Icon } from '../jcap';

/** Nút nổi ở đầu cột bài: chèn các bài mới vừa tải về */
export const NewPostsPill: React.FC<{ count: number; onTake: () => void }> = ({ count, onTake }) => (
  <div className="fm-newwrap" aria-live="polite">
    {count > 0 && (
      <button type="button" className="fm-new" onClick={onTake}>
        <Icon name="arrow_upward" size={18} />
        {`Có ${count} bài thảo luận mới`}
      </button>
    )}
  </div>
);
