import React, { useEffect, useRef } from 'react';
import { Icon, IconButton } from '../jcap';

/** Xem ảnh lớn: Esc hoặc bấm nền để đóng, đóng xong trả focus về ảnh vừa bấm */
export const ImageLightbox: React.FC<{ src: string; name: string; onClose: () => void }> = ({ src, name, onClose }) => {
  const boxRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    boxRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      closeRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      before?.focus?.();
    };
  }, []);
  return (
    <div className="sup-lb" role="dialog" aria-modal="true" aria-label={`Ảnh ${name}`} ref={boxRef} tabIndex={-1}>
      <div className="bar">
        <p>
          <Icon name="image" size={20} />
          {name}
        </p>
        <span>Esc để đóng</span>
        <IconButton icon="close" label="Đóng" onClick={onClose} />
      </div>
      <div className="fig" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <img src={src} alt={name} />
      </div>
    </div>
  );
};
