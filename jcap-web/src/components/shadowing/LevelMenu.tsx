import React, { useEffect, useRef, useState } from 'react';
import { Icon } from '../jcap';

const LEVELS = ['ALL', 'N5', 'N4', 'N3'];
const label = (level: string) => (level === 'ALL' ? 'Mọi cấp' : level);

/** Nút chọn cấp JLPT dạng thả xuống */
export const LevelMenu: React.FC<{ value: string; onChange: (level: string) => void }> = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div className="shl-level" ref={ref}>
      <button
        type="button"
        className={`btn ${value !== 'ALL' ? 'set' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Trình độ: ${label(value)}`}
        onClick={() => setOpen((v) => !v)}
      >
        {label(value)}
        <Icon name="expand_more" size={18} />
      </button>
      {open && (
        <ul role="menu" aria-label="Chọn trình độ">
          {LEVELS.map((level) => (
            <li key={level}>
              <button
                type="button"
                role="menuitemradio"
                aria-checked={value === level}
                onClick={() => {
                  onChange(level);
                  setOpen(false);
                }}
              >
                {label(level)}
                <Icon name="check" size={18} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
