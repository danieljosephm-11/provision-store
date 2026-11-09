import * as React from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Check, Copy, Eye, History, Search, X } from 'lucide-react';
import { api, buildQuery } from '@/lib/api';
import { DEFAULT_FROM, DEFAULT_TO } from '@/lib/display';
import { formatDate } from '@/lib/utils';
import { useDebouncedValue } from '@/lib/hooks';
import { useAuth } from '@/contexts/auth';
import type { AuditLog, Paginated, User } from '@/lib/types';
import { PageHeader } from '@/components/shared/page-header';
import { DataTable, type Column } from '@/components/shared/data-table';
import { Pagination } from '@/components/shared/pagination';
import { DateRange } from '@/components/shared/date-range';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const ENTITY_TYPES = [
  'Invoice',
  'SaleReturn',
  'HeldBill',
  'Product',
  'Category',
  'Brand',
  'Unit',
  'TaxRate',
  'StockMovement',
  'StockTransfer',
  'Location',
  'Customer',
  'CustomerPayment',
  'Supplier',
  'SupplierPayment',
  'Purchase',
  'PurchaseOrder',
  'PurchaseReturn',
  'Expense',
  'ExpenseCategory',
  'User',
  'Role',
  'Store',
  'RefreshToken',
];

function actionTone(action: string): 'success' | 'info' | 'warning' | 'destructive' | 'outline' {
  if (/(CREATED|ADDED|RECEIVED|PAID|LOGIN)/.test(action)) return 'success';
  if (/(UPDATED|ADJUSTED|RESET|TRANSFERRED|PASSWORD)/.test(action)) return 'info';
  if (/(DELETED|CANCELLED|VOID|REVERSED|SUSPENDED|DEACTIVATED|FAILED|LOGOUT)/.test(action)) return 'destructive';
  if (/(HELD|RESUMED|PARTIAL)/.test(action)) return 'warning';
  return 'outline';
}

function formatAction(action: string) {
  return action
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function AuditPage() {
  const { can } = useAuth();
  const [search, setSearch] = React.useState('');
  const debounced = useDebouncedValue(search, 250);
  const [entityType, setEntityType] = React.useState('');
  const [userId, setUserId] = React.useState('');
  const [range, setRange] = React.useState({ from: DEFAULT_FROM, to: DEFAULT_TO });
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(20);
  const [selected, setSelected] = React.useState<AuditLog | null>(null);

  const canFilterUsers = can('user.read');

  const { data: users } = useQuery({
    queryKey: ['users', 'audit-filter'],
    queryFn: () =>
      api
        .get<Paginated<User>>(`/users${buildQuery({ pageSize: 100 })}`)
        .then((res) => res.items),
    enabled: canFilterUsers,
  });

  const filters = {
    action: debounced,
    entityType,
    userId,
    from: range.from,
    to: range.to,
    page,
    pageSize,
  };

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['audit-logs', filters],
    queryFn: () => api.get<Paginated<AuditLog>>(`/audit-logs${buildQuery(filters)}`),
    placeholderData: keepPreviousData,
  });

  const activeFilters = [debounced, entityType, userId].filter(Boolean).length +
    (range.from !== DEFAULT_FROM || range.to !== DEFAULT_TO ? 1 : 0);

  const clearFilters = () => {
    setSearch('');
    setEntityType('');
    setUserId('');
    setRange({ from: DEFAULT_FROM, to: DEFAULT_TO });
    setPage(1);
  };

  const columns: Column<AuditLog>[] = [
    {
      key: 'when',
      header: 'When',
      cell: (row) => (
        <div>
          <p className="text-sm">{formatDate(row.createdAt, true)}</p>
          <p className="text-[11px] text-muted-foreground">{row.ip ?? 'unknown IP'}</p>
        </div>
      ),
    },
    {
      key: 'user',
      header: 'By',
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate text-sm">{row.user?.name ?? 'System'}</p>
          <p className="truncate text-[11px] text-muted-foreground">{row.user?.email ?? '—'}</p>
        </div>
      ),
    },
    {
      key: 'action',
      header: 'Action',
      cell: (row) => (
        <div className="space-y-0.5">
          <Badge variant={actionTone(row.action)}>{formatAction(row.action)}</Badge>
          <p className="font-mono text-[10px] text-muted-foreground">{row.action}</p>
        </div>
      ),
    },
    {
      key: 'entity',
      header: 'Entity',
      cell: (row) => (
        <div className="min-w-0">
          <p className="text-xs font-medium">{row.entityType}</p>
          <p className="truncate font-mono text-[10px] text-muted-foreground">{row.entityId ?? '—'}</p>
        </div>
      ),
    },
    {
      key: 'changes',
      header: 'Changes',
      align: 'center',
      cell: (row) => {
        const before = row.before !== null && row.before !== undefined;
        const after = row.after !== null && row.after !== undefined;
        if (!before && !after) return <span className="text-[11px] text-muted-foreground">—</span>;
        return (
          <div className="flex items-center justify-center gap-1">
            {before ? <Badge variant="outline">before</Badge> : null}
            {after ? <Badge variant="info">after</Badge> : null}
          </div>
        );
      },
    },
    {
      key: 'view',
      header: '',
      align: 'right',
      cell: (row) => (
        <Button
          variant="ghost"
          size="iconSm"
          title="View details"
          aria-label="View audit entry"
          onClick={(event) => {
            event.stopPropagation();
            setSelected(row);
          }}
        >
          <Eye className="h-3.5 w-3.5" />
        </Button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Audit log"
        description="Every sensitive change, who made it and what changed. Entries are append-only."
        actions={
          <Badge variant="outline" className="gap-1">
            <History className="h-3 w-3" /> {data?.meta.total ?? 0} entries
          </Badge>
        }
      />

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-2 border-b p-3 lg:flex-row lg:flex-wrap lg:items-center">
          <div className="relative w-full lg:max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              placeholder="Search action, e.g. INVOICE_…"
              className="input-base h-9 pl-8 pr-8"
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
            {search ? (
              <button
                type="button"
                aria-label="Clear action search"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
                onClick={() => setSearch('')}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>

          <Select
            className="h-9 w-[170px]"
            value={entityType}
            aria-label="Filter by entity type"
            onChange={(event) => {
              setEntityType(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All entities</option>
            {ENTITY_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </Select>

          {canFilterUsers ? (
            <Select
              className="h-9 w-[190px]"
              value={userId}
              aria-label="Filter by user"
              onChange={(event) => {
                setUserId(event.target.value);
                setPage(1);
              }}
            >
              <option value="">All users</option>
              {(users ?? []).map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </Select>
          ) : null}

          <DateRange
            from={range.from}
            to={range.to}
            compact
            onChange={(next) => {
              setRange(next);
              setPage(1);
            }}
          />

          {activeFilters > 0 ? (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="h-3.5 w-3.5" /> Clear ({activeFilters})
            </Button>
          ) : null}

          {isFetching ? <span className="ml-auto text-[11px] text-muted-foreground">Refreshing…</span> : null}
        </div>

        <DataTable
          columns={columns}
          rows={data?.items}
          rowKey={(row) => row.id}
          loading={isLoading}
          onRowClick={(row) => setSelected(row)}
          emptyTitle="No audit entries"
          emptyDescription="Changes to products, invoices, customers, settings and access will appear here."
        />
        <Pagination
          meta={data?.meta}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      </Card>

      <p className="mt-3 text-[11px] text-muted-foreground">
        Audit entries cannot be edited or deleted. Use the date range to narrow investigations.
      </p>

      <AuditDetailDialog entry={selected} onOpenChange={(open) => !open && setSelected(null)} />
    </div>
  );
}

function AuditDetailDialog({ entry, onOpenChange }: { entry: AuditLog | null; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={!!entry} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {entry ? formatAction(entry.action) : 'Audit entry'}
            {entry ? <Badge variant={actionTone(entry.action)}>{entry.entityType}</Badge> : null}
          </DialogTitle>
          <DialogDescription>
            {entry
              ? `${entry.user?.name ?? 'System'} · ${formatDate(entry.createdAt, true)}`
              : ''}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          {entry ? (
            <>
              <div className="grid gap-2 rounded-lg border bg-slate-50/60 p-3 text-[11px] sm:grid-cols-2">
                <Meta label="Action" value={entry.action} mono />
                <Meta label="Entity" value={entry.entityType} />
                <Meta label="Entity ID" value={entry.entityId ?? '—'} mono />
                <Meta label="Request ID" value={entry.requestId ?? '—'} mono />
                <Meta label="User" value={entry.user ? `${entry.user.name} (${entry.user.email})` : 'System'} />
                <Meta label="IP address" value={entry.ip ?? '—'} />
                <Meta label="User agent" value={entry.userAgent ?? '—'} className="sm:col-span-2" />
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                <JsonBlock title="Before" value={entry.before} tone="before" />
                <JsonBlock title="After" value={entry.after} tone="after" />
              </div>
            </>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Meta({
  label,
  value,
  mono,
  className,
}: {
  label: string;
  value: string;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn('truncate text-slate-700', mono && 'font-mono text-[10px]')} title={value}>
        {value}
      </p>
    </div>
  );
}

function JsonBlock({ title, value, tone }: { title: string; value: unknown; tone: 'before' | 'after' }) {
  const [copied, setCopied] = React.useState(false);
  const empty = value === null || value === undefined;
  const text = empty ? 'No data' : JSON.stringify(value, null, 2);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="rounded-lg border">
      <div className="flex items-center justify-between gap-2 border-b bg-slate-50/70 px-2.5 py-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</span>
        {!empty ? (
          <button
            type="button"
            className="flex items-center gap-1 rounded px-1 py-0.5 text-[10px] text-muted-foreground hover:bg-white hover:text-foreground"
            onClick={() => void copy()}
          >
            {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        ) : null}
      </div>
      <pre
        className={cn(
          'scroll-thin max-h-56 overflow-auto whitespace-pre-wrap break-words p-2.5 font-mono text-[11px] leading-relaxed',
          empty ? 'text-muted-foreground' : 'text-slate-700',
          tone === 'before' && !empty && 'bg-amber-50/30',
          tone === 'after' && !empty && 'bg-emerald-50/30',
        )}
      >
        {text}
      </pre>
    </div>
  );
}
