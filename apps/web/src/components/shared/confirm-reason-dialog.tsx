import * as React from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, Textarea } from '@/components/ui/input';

interface ConfirmReasonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  label?: string;
  confirmLabel?: string;
  loading?: boolean;
  minLength?: number;
  onConfirm: (reason: string) => void;
  children?: React.ReactNode;
}

/** For actions that must record a reason: voiding invoices, cancelling, reversing expenses. */
export function ConfirmReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  label = 'Reason',
  confirmLabel = 'Confirm',
  loading,
  minLength = 3,
  onConfirm,
  children,
}: ConfirmReasonDialogProps) {
  const [reason, setReason] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setReason('');
      setError(null);
    }
  }, [open]);

  const submit = () => {
    if (reason.trim().length < minLength) {
      setError(`Enter at least ${minLength} characters`);
      return;
    }
    onConfirm(reason.trim());
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <DialogBody className="space-y-3">
          {children}
          <Field label={label} required error={error}>
            <Textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Required for the audit trail"
              autoFocus
            />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button variant="destructive" loading={loading} onClick={submit}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
