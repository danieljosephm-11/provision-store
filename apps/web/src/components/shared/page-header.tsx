import * as React from 'react';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, description, actions, children, className }: PageHeaderProps) {
  return (
    <div className={cn('mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between', className)}>
      <div className="min-w-0">
        <h1 className="truncate text-xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {description ? <p className="mt-0.5 text-sm text-muted-foreground">{description}</p> : null}
        {children}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2 sm:justify-end">{actions}</div> : null}
    </div>
  );
}
