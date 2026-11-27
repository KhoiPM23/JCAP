import { Button } from './Button';
import { PracticePanel } from './PracticePanel';

interface PracticeConfirmationProps {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export function PracticeConfirmation({ title, description, confirmLabel, cancelLabel = 'Tiếp tục luyện', onCancel, onConfirm }: PracticeConfirmationProps) {
  return (
    <PracticePanel mobile open label={title} onDismiss={onCancel}>
      <div className="space-y-4 p-4">
        <h2 className="text-lg font-bold">{title}</h2>
        <p className="text-sm leading-relaxed text-sumi-muted">{description}</p>
        <div className="grid gap-2">
          <Button size="lg" variant="primary" autoFocus onClick={onCancel}>{cancelLabel}</Button>
          <Button size="lg" variant="secondary" className="text-danger" onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </PracticePanel>
  );
}
