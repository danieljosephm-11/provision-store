import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface DateRangeProps {
  from: string;
  to: string;
  onChange: (range: { from: string; to: string }) => void;
  className?: string;
  compact?: boolean;
}

export function DateRange({ from, to, onChange, className, compact }: DateRangeProps) {
  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <Input
        type="date"
        aria-label="From date"
        value={from}
        max={to || undefined}
        onChange={(event) => onChange({ from: event.target.value, to })}
        className={cn(compact && 'h-8 w-[140px] text-xs')}
      />
      <span className="text-xs text-muted-foreground">to</span>
      <Input
        type="date"
        aria-label="To date"
        value={to}
        min={from || undefined}
        onChange={(event) => onChange({ from, to: event.target.value })}
        className={cn(compact && 'h-8 w-[140px] text-xs')}
      />
    </div>
  );
}
