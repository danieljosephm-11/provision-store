import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Loader2, Plus, Undo2 } from 'lucide-react';
import { api, buildQuery } from '@/lib/api';
import { formatINR } from '@/lib/shared';
import { formatDate } from '@/lib/utils';
import { DEFAULT_FROM, DEFAULT_TO } from '@/lib/display';
import type { InvoiceListRow, Paginated, SaleReturn, Single } from '@/lib/types';
import { useAuth } from '@/contexts/auth';
import { PageHeader } from '@/components/shared/page-header';
import { DataTable, type Column } from '@/components/shared/data-table';
import { Pagination } from '@/components/shared/pagination';
import { SearchInput } from '@/components/shared/search-input';
import { DateRange } from '@/components/shared/date-range';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';

export function ReturnsPage() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const [search, setSearch] = React.useState('');
  const [range, setRange] = React.useState({ from: DEFAULT_FROM, to: DEFAULT_TO });
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(20);
  const [detailId, setDetailId] = React.useState<string | null>(null);
  const [startOpen, setStartOpen] = React.useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['returns', { search, range, page, pageSize }],
    queryFn: () =>
      api.get<Paginated<SaleReturn>>(
        `/returns${buildQuery({ search, from: range.from, to: range.to, page, pageSize })}`,
      ),
    placeholderData: keepPreviousData,
  });

  const rows = data?.items ?? [];
  const total = rows.reduce((sum, row) => sum + row.total, 0);

  const columns: Column<SaleReturn>[] = [
    {
      key: 'returnNo',
      header: 'Return',
      cell: (row) => (
        <div>
          <p className="font-medium text-slate-800">{row.returnNo}</p>
          <p className="text-[11px] text-muted-foreground">{formatDate(row.createdAt, true)}</p>
        </div>
      ),
    },
    {
      key: 'invoice',
      header: 'Invoice',
      cell: (row) => (
        <button
          type="button"
          className="text-sm font-medium text-primary hover:underline"
          onClick={(event) => {
            event.stopPropagation();
            navigate(`/invoices/${row.invoiceId}`);
          }}
        >
          {row.invoiceNo ?? '—'}
        </button>
      ),
    },
    {
      key: 'customer',
      header: 'Customer',
      cell: (row) => (
        <div>
          <p className="text-sm">{row.customer?.name ?? 'Walk-in customer'}</p>
          <p className="text-[11px] text-muted-foreground">{row.customer?.mobile ?? '—'}</p>
        </div>
      ),
    },
    {
      key: 'items',
      header: 'Items',
      align: 'center',
      cell: (row) => <span className="text-xs text-muted-foreground">{row.items.length}</span>,
    },
    {
      key: 'method',
      header: 'Refund',
      cell: (row) => (
        <div className="flex items-center gap-1.5">
          <Badge variant={row.refundMethod === 'CREDIT' ? 'purple' : 'outline'}>
            {row.refundMethod === 'CREDIT' ? 'Store credit' : row.refundMethod.replace(/_/g, ' ')}
          </Badge>
          {row.restock ? <Badge variant="success">Restocked</Badge> : <Badge variant="secondary">Not restocked</Badge>}
        </div>
      ),
    },
    {
      key: 'total',
      header: 'Refund',
      align: 'right',
      cell: (row) => <span className="tabnum font-medium">{formatINR(row.total)}</span>,
    },
    {
      key: 'by',
      header: 'By',
      cell: (row) => <span className="text-xs text-muted-foreground">{row.createdByUser?.name ?? '—'}</span>,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Returns & refunds"
        description="Refunds against invoices, with restocking, ledger adjustment and GST reversal."
        actions={
          can('return.create') || can('pos.return') ? (
            <Button size="sm" onClick={() => setStartOpen(true)}>
              <Plus className="h-4 w-4" /> Start a return
            </Button>
          ) : undefined
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
            placeholder="Search return no, invoice, customer…"
            className="w-full lg:max-w-xs"
          />
          <DateRange
            from={range.from}
            to={range.to}
            compact
            onChange={(next) => {
              setRange(next);
              setPage(1);
            }}
          />
          <span className="ml-auto text-xs text-muted-foreground">
            Refunded on page <span className="font-medium text-slate-700 tabnum">{formatINR(total)}</span>
          </span>
        </div>

        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          loading={isLoading}
          onRowClick={(row) => setDetailId(row.id)}
          emptyTitle="No returns in this period"
          emptyDescription="Returns created against invoices will appear here."
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

      <ReturnDetailDialog id={detailId} onClose={() => setDetailId(null)} />
      <StartReturnDialog
        open={startOpen}
        onOpenChange={setStartOpen}
        onPick={(invoiceId) => {
          setStartOpen(false);
          navigate(`/invoices/${invoiceId}`);
        }}
      />
    </div>
  );
}

function ReturnDetailDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['return', id],
    queryFn: () => api.get<Single<SaleReturn>>(`/returns/${id}`).then((res) => res.item),
    enabled: !!id,
  });

  return (
    <Dialog open={!!id} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{data?.returnNo ?? 'Return details'}</DialogTitle>
          <DialogDescription>
            {data
              ? `${data.invoiceNo ? `Against ${data.invoiceNo}` : 'Against invoice'} · ${formatDate(data.createdAt, true)}`
              : 'Loading return…'}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {isLoading || !data ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Summary label="Refund total" value={formatINR(data.total)} />
                <Summary label="GST reversed" value={formatINR(data.taxAmount)} />
                <Summary
                  label="Method"
                  value={data.refundMethod === 'CREDIT' ? 'Store credit' : data.refundMethod.replace(/_/g, ' ')}
                />
                <Summary label="Restocked" value={data.restock ? 'Yes' : 'No'} />
              </div>
              {data.reason ? (
                <p className="rounded-md border bg-slate-50 px-3 py-2 text-xs text-muted-foreground">{data.reason}</p>
              ) : null}
              <div className="overflow-hidden rounded-lg border">
                <Table>
                  <THead>
                    <TR>
                      <TH>Item</TH>
                      <TH className="text-right">Qty</TH>
                      <TH className="text-right">Rate</TH>
                      <TH className="text-right">GST</TH>
                      <TH className="text-right">Refund</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {data.items.map((item) => (
                      <TR key={item.id}>
                        <TD>
                          <p className="text-sm font-medium">{item.productName ?? 'Item'}</p>
                          <p className="text-[11px] text-muted-foreground">{item.sku ?? '—'}</p>
                        </TD>
                        <TD className="text-right tabnum">{item.quantity}</TD>
                        <TD className="text-right tabnum">{formatINR(item.unitPrice)}</TD>
                        <TD className="text-right tabnum">{formatINR(item.taxAmount)}</TD>
                        <TD className="text-right tabnum font-medium">{formatINR(item.lineTotal)}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Processed by {data.createdByUser?.name ?? '—'}
                {data.payout !== undefined ? ` · payout ${formatINR(data.payout)}` : ''}
                {data.creditApplied !== undefined ? ` · credit applied ${formatINR(data.creditApplied)}` : ''}
              </p>
            </>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-slate-50 px-2.5 py-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-medium tabnum">{value}</p>
    </div>
  );
}

function StartReturnDialog({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (invoiceId: string) => void;
}) {
  const [search, setSearch] = React.useState('');

  const { data, isFetching } = useQuery({
    queryKey: ['invoice-picker', search],
    queryFn: () =>
      api.get<Paginated<InvoiceListRow>>(
        `/invoices${buildQuery({ search, status: 'COMPLETED', pageSize: 10 })}`,
      ),
    enabled: open,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Start a return</DialogTitle>
          <DialogDescription>Find the original invoice, then choose the items coming back.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Invoice number, customer name or mobile…"
            autoFocus
          />
          <div className="max-h-80 divide-y overflow-auto rounded-lg border">
            {isFetching && !data ? (
              <div className="flex items-center justify-center py-10 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : (data?.items.length ?? 0) === 0 ? (
              <div className="flex flex-col items-center gap-1 px-4 py-10 text-center">
                <Undo2 className="h-6 w-6 text-slate-300" />
                <p className="text-sm font-medium text-slate-600">No completed invoices found</p>
                <p className="text-xs text-muted-foreground">Try a different search term.</p>
              </div>
            ) : (
              data?.items.map((invoice) => (
                <button
                  key={invoice.id}
                  type="button"
                  onClick={() => onPick(invoice.id)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-secondary/60"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{invoice.invoiceNo}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {invoice.customerName ?? 'Walk-in'} · {formatDate(invoice.createdAt, true)} ·{' '}
                      {invoice.itemCount} items
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-medium tabnum">{formatINR(invoice.grandTotal)}</span>
                </button>
              ))
            )}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
