import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Plus, ShoppingBag, Truck } from 'lucide-react';
import { api, buildQuery } from '@/lib/api';
import { formatINR } from '@/lib/shared';
import { DEFAULT_FROM, DEFAULT_TO } from '@/lib/display';
import { formatDate } from '@/lib/utils';
import { useDebouncedValue } from '@/lib/hooks';
import { useAuth } from '@/contexts/auth';
import type { Paginated, PurchaseListRow } from '@/lib/types';
import { PageHeader } from '@/components/shared/page-header';
import { DataTable, type Column } from '@/components/shared/data-table';
import { Pagination } from '@/components/shared/pagination';
import { SearchInput } from '@/components/shared/search-input';
import { DateRange } from '@/components/shared/date-range';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select } from '@/components/ui/input';

export function PurchasesPage() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const [search, setSearch] = React.useState('');
  const debounced = useDebouncedValue(search, 250);
  const [status, setStatus] = React.useState('');
  const [range, setRange] = React.useState({ from: DEFAULT_FROM, to: DEFAULT_TO });
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(20);

  const { data, isLoading } = useQuery({
    queryKey: ['purchases', { debounced, status, range, page, pageSize }],
    queryFn: () =>
      api.get<Paginated<PurchaseListRow>>(
        `/purchases${buildQuery({
          search: debounced,
          status,
          from: range.from,
          to: range.to,
          page,
          pageSize,
        })}`,
      ),
    placeholderData: keepPreviousData,
  });

  const rows = data?.items ?? [];
  const pageTotal = rows.reduce((sum, row) => (row.status === 'CANCELLED' ? sum : sum + row.total), 0);
  const pageDue = rows.reduce((sum, row) => (row.status === 'CANCELLED' ? sum : sum + row.balanceAmount), 0);

  const columns: Column<PurchaseListRow>[] = [
    {
      key: 'purchase',
      header: 'Purchase',
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-800">{row.purchaseNumber}</p>
          <p className="text-[11px] text-muted-foreground">
            {row.supplierInvoiceNo ? `Bill ${row.supplierInvoiceNo} · ` : ''}
            {formatDate(row.invoiceDate)}
          </p>
        </div>
      ),
    },
    {
      key: 'supplier',
      header: 'Supplier',
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate text-sm">{row.supplier.name}</p>
          <p className="text-[11px] text-muted-foreground">{row.supplier.mobile}</p>
        </div>
      ),
    },
    {
      key: 'items',
      header: 'Items',
      align: 'right',
      cell: (row) => (
        <div className="text-right">
          <p className="tabnum text-sm">{row.itemCount}</p>
          {row.returnCount > 0 ? (
            <p className="text-[10px] text-amber-700">{row.returnCount} return{row.returnCount === 1 ? '' : 's'}</p>
          ) : null}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'total',
      header: 'Total',
      align: 'right',
      cell: (row) => <span className="tabnum font-medium">{formatINR(row.total)}</span>,
    },
    {
      key: 'balance',
      header: 'Balance',
      align: 'right',
      cell: (row) => (
        <span className={`tabnum font-medium ${row.balanceAmount > 0 ? 'text-amber-700' : 'text-muted-foreground'}`}>
          {row.status === 'CANCELLED' ? '—' : formatINR(row.balanceAmount)}
        </span>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Purchases"
        description="Goods received from suppliers, with landed costs, GST and payables."
        actions={
          can('purchase.create') ? (
            <Button size="sm" onClick={() => navigate('/purchases/new')}>
              <Plus className="h-4 w-4" /> New purchase
            </Button>
          ) : undefined
        }
      />

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-2 border-b p-3 lg:flex-row lg:items-center lg:flex-wrap">
          <SearchInput
            value={search}
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            placeholder="Search purchase no, bill no, supplier…"
            className="w-full lg:max-w-xs"
          />
          <Select
            className="h-9 w-[150px]"
            value={status}
            aria-label="Filter by status"
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            <option value="RECEIVED">Received</option>
            <option value="PARTIAL">Partial</option>
            <option value="CANCELLED">Cancelled</option>
          </Select>
          <DateRange
            from={range.from}
            to={range.to}
            compact
            onChange={(next) => {
              setRange(next);
              setPage(1);
            }}
          />
          <span className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
            <span>
              Page total <span className="font-medium text-slate-700 tabnum">{formatINR(pageTotal)}</span>
            </span>
            <span>
              Balance <span className="font-medium text-amber-700 tabnum">{formatINR(pageDue)}</span>
            </span>
          </span>
        </div>

        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          loading={isLoading}
          onRowClick={(row) => navigate(`/purchases/${row.id}`)}
          emptyTitle="No purchases found"
          emptyDescription="Record a purchase to add stock, track supplier dues and claim GST input credit."
          emptyAction={
            can('purchase.create') ? (
              <Button size="sm" onClick={() => navigate('/purchases/new')}>
                <ShoppingBag className="h-4 w-4" /> New purchase
              </Button>
            ) : undefined
          }
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

      <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Truck className="h-3.5 w-3.5" />
        Purchases post to the supplier ledger and adjust stock immediately. Cancelling reverses both.
      </p>
    </div>
  );
}
