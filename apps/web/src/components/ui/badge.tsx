import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-5 transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary/10 text-primary',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        outline: 'border-border text-muted-foreground',
        success: 'border-transparent bg-emerald-100 text-emerald-800',
        warning: 'border-transparent bg-amber-100 text-amber-800',
        destructive: 'border-transparent bg-red-100 text-red-700',
        info: 'border-transparent bg-sky-100 text-sky-800',
        purple: 'border-transparent bg-violet-100 text-violet-800',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

const STATUS_MAP: Record<string, VariantProps<typeof badgeVariants>['variant']> = {
  ACTIVE: 'success',
  PAID: 'success',
  RECEIVED: 'success',
  COMPLETED: 'success',
  INACTIVE: 'secondary',
  SUSPENDED: 'destructive',
  VOID: 'destructive',
  CANCELLED: 'destructive',
  REVERSED: 'destructive',
  PARTIAL: 'warning',
  PENDING: 'warning',
  HELD: 'info',
  ORDERED: 'info',
  SENT: 'info',
  DRAFT: 'secondary',
};

export function StatusBadge({ status, className }: { status?: string | null; className?: string }) {
  if (!status) return <span className="text-muted-foreground">—</span>;
  return (
    <Badge variant={STATUS_MAP[status] ?? 'outline'} className={className}>
      {status.replace(/_/g, ' ')}
    </Badge>
  );
}
