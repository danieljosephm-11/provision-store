import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { FileText, Printer, Receipt, Undo2 } from 'lucide-react';
import { api, buildQuery, openDocument } from '@/lib/api';
import { formatINR } from '@/lib/shared';
import { formatDate } from '@/lib/utils';
import { DEFAULT_FROM, DEFAULT_TO } from '@/lib/display';
import type { InvoiceListRow, Paginated } from '@/lib/types';
import { PageHeader } from '@/components/shared/page-header';
import { DataTable, type Column } from '@/components/shared/data-table';
import { Pagination } from '@/components/shared/pagination';
import { SearchInput } from '@/components/shared/search-input';
import { DateRange } from '@/components/shared/date-range';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select } from '@/components/ui/input';

export function InvoicesPage() {
  const navigate = useNavigate();
  const [search, setSearch] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [paymentStatus, setPaymentStatus] = React.useState('');
  const [range, setRange] = React.useState({ from: DEFAULT_FROM, to: DEFAULT_TO });
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(20);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['invoices', { search, status, paymentStatus, range, page, pageSize }],
    queryFn: () =>
      api.get<Paginated<InvoiceListRow>>(
        `/invoices${buildQuery({
          search,
          status,
          paymentStatus,
          from: range.from,
          to: range.to,
          page,
          pageSize,
        })}`,
      ),
    placeholderData: keepPreviousData,
  });

  const rows = data?.items ?? [];
  const totals = rows.reduce(
    (acc, row) => ({
      grandTotal: acc.grandTotal + (row.status === 'VOID' ? 0 : row.grandTotal),
      balance: acc.balance + (row.status === 'VOID' ? 0 : row.balanceDue),
    }),
    { grandTotal: 0, balance: 0 },
  );

  const columns: Column<InvoiceListRow>[] = [
    {
      key: 'invoiceNo',
      header: 'Invoice',
      cell: (row) => (
        <div>
          <p className="font-medium text-slate-800">{row.invoiceNo}</p>
          <p className="text-[11px] text-muted-foreground">{formatDate(row.createdAt, true)}</p>
        </div>
      ),
    },
    {
      key: 'customer',
      header: 'Customer',
      cell: (row) => (
        <div>
          <p className="font-medium text-slate-700">{row.customerName ?? 'Walk-in customer'}</p>
          <p className="text-[11px] text-muted-foreground">{row.customerMobile ?? '—'}</p>
        </div>
      ),
    },
    {
      key: 'items',
      header: 'Items',
      align: 'center',
      cell: (row) => (
        <span className="text-xs text-muted-foreground">
          {row.itemCount}
          {row.returnCount > 0 ? (
            <span className="ml-1 inline-flex items-center gap-0.5 text-amber-700">
              <Undo2 className="h-3 w-3" />
              {row.returnCount}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: 'tax',
      header: 'GST',
      align: 'right',
      cell: (row) => <span className="tabnum text-xs text-muted-foreground">{formatINR(row.taxAmount)}</span>,
    },
    {
      key: 'grandTotal',
      header: 'Total',
      align: 'right',
      cell: (row) => <span className="tabnum font-medium">{formatINR(row.grandTotal)}</span>,
    },
    {
      key: 'balance',
      header: 'Balance',
      align: 'right',
      cell: (row) => (
        <span className={row.balanceDue > 0 ? 'tabnum text-amber-700' : 'tabnum text-muted-foreground'}>
          {formatINR(row.balanceDue)}
        </span>
      ),
    },
    {
      key: 'paymentStatus',
      header: 'Payment',
      cell: (row) =>
        row.status === 'VOID' ? <StatusBadge status="VOID" /> : <StatusBadge status={row.paymentStatus} />,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (row) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="iconSm"
            title="Open A4 invoice"
            aria-label={`Open A4 invoice ${row.invoiceNo}`}
            onClick={(event) => {
              event.stopPropagation();
              void openDocument(`/invoices/${row.id}/pdf`, 'open');
            }}
          >
            <Printer className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="iconSm"
            title="Open thermal receipt"
            aria-label={`Open thermal receipt ${row.invoiceNo}`}
            onClick={(event) => {
              event.stopPropagation();
              void openDocument(`/invoices/${row.id}/thermal`, 'open');
            }}
          >
            <Receipt className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Invoices"
        description="Every completed sale with its GST breakup, payments, returns and credit balance."
        actions={
          <Button variant="outline" size="sm" onClick={() => navigate('/pos')}>
            <FileText className="h-4 w-4" /> New sale
          </Button>
        }
      />

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-2 border-b p-3 lg:flex-row lg:items-center">
          <SearchInput
            value={search}
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            placeholder="Search invoice no, customer, mobile…"
            className="w-full lg:max-w-xs"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Select
              className="h-9 w-[140px]"
              value={status}
              aria-label="Filter by invoice status"
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            >
              <option value="">All statuses</option>
              <option value="COMPLETED">Completed</option>
              <option value="VOID">Void</option>
            </Select>
            <Select
              className="h-9 w-[150px]"
              value={paymentStatus}
              aria-label="Filter by payment status"
              onChange={(event) => {
                setPaymentStatus(event.target.value);
                setPage(1);
              }}
            >
              <option value="">All payments</option>
              <option value="PAID">Paid</option>
              <option value="PARTIAL">Partial</option>
              <option value="UNPAID">Unpaid</option>
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
          </div>
          <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
            <span>
              Sales on page <span className="font-medium text-slate-700 tabnum">{formatINR(totals.grandTotal)}</span>
            </span>
            <span>
              Due <span className="font-medium text-amber-700 tabnum">{formatINR(totals.balance)}</span>
            </span>
            {isFetching && !isLoading ? <span className="text-[11px]">Refreshing…</span> : null}
          </div>
        </div>

        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          loading={isLoading}
          onRowClick={(row) => navigate(`/invoices/${row.id}`)}
          emptyTitle="No invoices in this period"
          emptyDescription="Adjust the date range or complete a sale from the POS."
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
    </div>
  );
}
