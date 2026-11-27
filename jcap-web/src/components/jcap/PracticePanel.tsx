import { useEffect, useRef, type ReactNode } from 'react';

interface PracticePanelProps {
  mobile: boolean;
  open: boolean;
  label: string;
  onDismiss: () => void;
  children: ReactNode;
}

export function PracticePanel({ mobile, open, label, onDismiss, children }: PracticePanelProps) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const panel = dialog.current;
    if (!panel) return;
    if (open && !panel.open) panel.showModal();
    if (!open && panel.open) panel.close();
  }, [open, mobile]);

  if (!mobile) return <>{children}</>;

  return (
    <dialog
      ref={dialog}
      className="jx-practice-panel"
      aria-label={label}
      onCancel={event => {
        event.preventDefault();
        onDismiss();
      }}
      onClick={event => {
        if (event.target === event.currentTarget) onDismiss();
      }}
    >
      {children}
    </dialog>
  );
}
