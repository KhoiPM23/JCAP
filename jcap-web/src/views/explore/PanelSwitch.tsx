import React, { cloneElement, useEffect, useLayoutEffect, useRef, useState } from 'react';

/** Lớp cũ được gỡ sau khoảng này (dài hơn animation rời đi trong prefecturePanel.css) */
const LEAVE_MS = 200;

export interface PanelSwitchProps {
  /** Đổi id là đổi trang trong ngăn */
  id: string;
  /** Thứ tự trang: tăng thì trượt tới (từ phải sang), giảm thì trượt lùi. -1 = danh sách */
  order: number;
  /** Props ghi đè cho trang đang rời đi, để nó không giữ ref và id tiêu đề của trang mới */
  leavingProps: object;
  children: React.ReactElement;
}

interface Seen {
  id: string;
  order: number;
  /** 0 = lần hiện đầu tiên, không chuyển cảnh */
  dir: -1 | 0 | 1;
  /** Chuyển giữa hai mốc: thanh trên đứng yên, chỉ nội dung trượt */
  swap: boolean;
  leaving: { id: string; node: React.ReactElement } | null;
}

/**
 * Chuyển cảnh giữa các trang trong ngăn tỉnh: trang cũ mờ đi trong lúc trang mới trượt vào.
 * Trang cũ giữ nguyên component (cả vị trí cuộn, bước đang mở) cho tới khi gỡ, nên không chớp lại.
 */
export const PanelSwitch: React.FC<PanelSwitchProps> = ({ id, order, leavingProps, children }) => {
  const [seen, setSeen] = useState<Seen>({ id, order, dir: 0, swap: false, leaving: null });
  /** Trang đã vẽ ở lần commit gần nhất */
  const latest = useRef(children);
  if (seen.id !== id) {
    setSeen({
      id,
      order,
      dir: order > seen.order ? 1 : -1,
      swap: order >= 0 && seen.order >= 0,
      leaving: { id: seen.id, node: latest.current },
    });
  }
  useLayoutEffect(() => {
    latest.current = children;
  });
  useEffect(() => {
    if (!seen.leaving) return;
    const t = window.setTimeout(() => setSeen((s) => ({ ...s, leaving: null })), LEAVE_MS);
    return () => window.clearTimeout(t);
  }, [seen.leaving]);

  const style = { '--dx': `${seen.dir * 28}px` } as React.CSSProperties;
  const swap = seen.swap ? ' is-swap' : '';

  return (
    <div className="jm-pp-stage">
      {seen.leaving && seen.leaving.id !== id && (
        <div key={seen.leaving.id} className={`jm-pp-layer is-leaving${swap}`} style={style} inert aria-hidden="true">
          {cloneElement(seen.leaving.node, leavingProps)}
        </div>
      )}
      <div key={id} className={`jm-pp-layer${seen.dir ? ` is-entering${swap}` : ''}`} style={style}>
        {children}
      </div>
    </div>
  );
};
