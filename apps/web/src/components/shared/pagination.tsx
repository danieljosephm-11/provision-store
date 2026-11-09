import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Meta } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';

interface PaginationProps {
  meta?: Meta;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
}

export function Pagination({ meta, page, pageSize, onPageChange, onPageSizeChange }: PaginationProps) {
  const total = meta?.total ?? 0;
  const totalPages = meta?.totalPages ?? 1;
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-col items-center justify-between gap-2 border-t px-3 py-2 sm:flex-row">
      <p className="text-xs text-muted-foreground">
        Showing <span className="font-medium text-slate-700">{from}</span>–
        <span className="font-medium text-slate-700">{to}</span> of{' '}
        <span className="font-medium text-slate-700">{total}</span>
      </p>
      <div className="flex items-center gap-2">
        {onPageSizeChange ? (
          <Select
            aria-label="Rows per page"
            className="h-7 w-[86px] text-xs"
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
          >
            {[10, 20, 50, 100].map((size) => (
              <option key={size} value={size}>
                {size} / page
              </option>
            ))}
          </Select>
        ) : null}
        <Button
          variant="outline"
          size="iconSm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="min-w-[72px] text-center text-xs text-muted-foreground">
          Page {page} / {Math.max(1, totalPages)}
        </span>
        <Button
          variant="outline"
          size="iconSm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
