import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  icon?: LucideIcon;
  hint?: React.ReactNode;
  tone?:
    | 'default'
    | 'success'
    | 'warning'
    | 'danger'
    | 'info'
    | 'amber'
    | 'emerald'
    | 'sky'
    | 'violet'
    | 'rose';
  className?: string;
}

const TONES: Record<NonNullable<StatCardProps['tone']>, string> = {
  default: 'bg-slate-100 text-slate-600',
  success: 'bg-emerald-100 text-emerald-700',
  warning: 'bg-amber-100 text-amber-700',
  danger: 'bg-red-100 text-red-700',
  info: 'bg-sky-100 text-sky-700',
  amber: 'bg-amber-100 text-amber-700',
  emerald: 'bg-emerald-100 text-emerald-700',
  sky: 'bg-sky-100 text-sky-700',
  violet: 'bg-violet-100 text-violet-700',
  rose: 'bg-rose-100 text-rose-700',
};

export function StatCard({ label, value, icon: Icon, hint, tone = 'default', className }: StatCardProps) {
  return (
    <div className={cn('card-surface p-4', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <p className="mt-1.5 truncate text-[22px] font-semibold leading-tight tabnum text-slate-900">{value}</p>
        </div>
        {Icon ? (
          <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', TONES[tone])}>
            <Icon className="h-[18px] w-[18px]" />
          </span>
        ) : null}
      </div>
      {hint ? <div className="mt-2 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}
