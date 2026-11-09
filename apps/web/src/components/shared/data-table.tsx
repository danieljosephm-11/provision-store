import * as React from 'react';
import { cn } from '@/lib/utils';
import { TableSkeleton } from '@/components/ui/skeleton';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Inbox } from 'lucide-react';

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  className?: string;
  headerClassName?: string;
  align?: 'left' | 'right' | 'center';
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string;
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: React.ReactNode;
  emptyAction?: React.ReactNode;
  onRowClick?: (row: T) => void;
  footer?: React.ReactNode;
  className?: string;
  skeletonRows?: number;
}

const alignClass = (align?: 'left' | 'right' | 'center') =>
  align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  emptyTitle = 'Nothing here yet',
  emptyDescription,
  emptyAction,
  onRowClick,
  footer,
  className,
  skeletonRows = 6,
}: DataTableProps<T>) {
  if (loading) return <TableSkeleton rows={skeletonRows} cols={Math.min(columns.length, 6)} />;

  if (!rows || rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400">
          <Inbox className="h-5 w-5" />
        </span>
        <p className="text-sm font-medium text-slate-700">{emptyTitle}</p>
        {emptyDescription ? <p className="max-w-sm text-xs text-muted-foreground">{emptyDescription}</p> : null}
        {emptyAction ? <div className="mt-2">{emptyAction}</div> : null}
      </div>
    );
  }

  return (
    <Table className={className}>
      <THead>
        <TR>
          {columns.map((col) => (
            <TH key={col.key} className={cn(alignClass(col.align), col.headerClassName)}>
              {col.header}
            </TH>
          ))}
        </TR>
      </THead>
      <TBody>
        {rows.map((row) => (
          <TR
            key={rowKey(row)}
            className={cn(onRowClick && 'cursor-pointer')}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
          >
            {columns.map((col) => (
              <TD key={col.key} className={cn(alignClass(col.align), col.className)}>
                {col.cell(row)}
              </TD>
            ))}
          </TR>
        ))}
      </TBody>
      {footer ? <tfoot className="border-t bg-slate-50/80 font-medium">{footer}</tfoot> : null}
    </Table>
  );
}
