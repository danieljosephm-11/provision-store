import * as React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ErrorState({
  title = 'Could not load this data',
  message,
  onRetry,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-red-50 text-red-500">
        <AlertTriangle className="h-5 w-5" />
      </span>
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {message ? <p className="max-w-md text-xs text-muted-foreground">{message}</p> : null}
      {onRetry ? (
        <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
          <RefreshCw className="h-3.5 w-3.5" /> Try again
        </Button>
      ) : null}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      {icon ? (
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400">
          {icon}
        </span>
      ) : null}
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {description ? <p className="max-w-sm text-xs text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
