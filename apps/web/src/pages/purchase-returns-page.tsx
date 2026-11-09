import * as React from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, RotateCcw, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { purchaseReturnCreateSchema } from '@ps/shared';
import { api, ApiError, buildQuery } from '@/lib/api';
import { formatINR } from '@/lib/shared';
import { formatDate } from '@/lib/utils';
import { useDebouncedValue } from '@/lib/hooks';
import { useAuth } from '@/contexts/auth';
import type { Paginated, Purchase, PurchaseListRow, PurchaseReturn, Single } from '@/lib/types';
import { PageHeader } from '@/components/shared/page-header';
import { DataTable, type Column } from '@/components/shared/data-table';
import { Pagination } from '@/components/shared/pagination';
import { SearchInput } from '@/components/shared/search-input';
import { StatusBadge } from '@/components/ui/badge';
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
import { Field, Input, Textarea } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';

export function PurchaseReturnsPage() {
  const { can } = useAuth();
  const [search, setSearch] = React.useState('');
  const debounced = useDebouncedValue(search, 250);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(20);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<PurchaseReturn | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['purchase-returns', { debounced, page, pageSize }],
    queryFn: () =>
      api.get<Paginated<PurchaseReturn>>(
        `/purchase-returns${buildQuery({ search: debounced, page, pageSize })}`,
      ),
    placeholderData: keepPreviousData,
  });

  const columns: Column<PurchaseReturn>[] = [
    {
      key: 'return',
      header: 'Return',
      cell: (row) => (
        <div>
          <p className="font-medium text-slate-800">{row.returnNumber}</p>
          <p className="text-[11px] text-muted-foreground">
            {formatDate(row.returnDate)} · against {row.purchaseNumber}
          </p>
        </div>
      ),
    },
    {
      key: 'supplier',
      header: 'Supplier',
      cell: (row) => (
        <div>
          <p className="text-sm">{row.supplier.name}</p>
          <p className="text-[11px] text-muted-foreground">{row.supplier.mobile}</p>
        </div>
      ),
    },
    {
      key: 'items',
      header: 'Items',
      align: 'right',
      cell: (row) => <span className="tabnum text-sm">{row.items.length}</span>,
    },
    { key: 'status', header: 'Status', cell: (row) => <StatusBadge status={row.status} /> },
    {
      key: 'total',
      header: 'Value',
      align: 'right',
      cell: (row) => <span className="tabnum font-medium">{formatINR(row.total)}</span>,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Purchase returns"
        description="Goods sent back to suppliers, with stock and payable adjustments."
        actions={
          can('purchase.return') ? (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> New return
            </Button>
          ) : undefined
        }
      />

      <Card className="overflow-hidden">
        <div className="border-b p-3">
          <SearchInput
            value={search}
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            placeholder="Search return no, purchase no, supplier…"
            className="w-full lg:max-w-xs"
          />
        </div>

        <DataTable
          columns={columns}
          rows={data?.items}
          rowKey={(row) => row.id}
          loading={isLoading}
          onRowClick={(row) => setSelected(row)}
          emptyTitle="No purchase returns"
          emptyDescription="Return damaged or near-expiry stock to a supplier from the purchase detail page."
          emptyAction={
            can('purchase.return') ? (
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <RotateCcw className="h-4 w-4" /> New return
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

      <PurchaseReturnViewDialog entry={selected} onOpenChange={(open) => !open && setSelected(null)} />
      <PurchaseReturnCreateDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

function PurchaseReturnViewDialog({
  entry,
  onOpenChange,
}: {
  entry: PurchaseReturn | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={!!entry} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{entry?.returnNumber ?? 'Purchase return'}</DialogTitle>
          <DialogDescription>
            {entry
              ? `${entry.supplier.name} · ${formatDate(entry.returnDate, true)} · against ${entry.purchaseNumber}`
              : ''}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          {entry ? (
            <>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <StatusBadge status={entry.status} />
                {entry.reason ? <span>{entry.reason}</span> : null}
              </div>
              <div className="divide-y rounded-lg border">
                {entry.items.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{item.product.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {item.quantity} × {formatINR(item.unitCost)} · GST {item.taxRate}%
                      </p>
                    </div>
                    <span className="tabnum font-medium">{formatINR(item.lineTotal)}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between border-t pt-2 text-sm">
                <span className="text-muted-foreground">
                  Taxable {formatINR(entry.subtotal)} · GST {formatINR(entry.taxAmount)}
                </span>
                <span className="font-semibold">Total {formatINR(entry.total)}</span>
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

function PurchaseReturnCreateDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [search, setSearch] = React.useState('');
  const debounced = useDebouncedValue(search, 250);
  const [purchaseId, setPurchaseId] = React.useState<string | null>(null);
  const [quantities, setQuantities] = React.useState<Record<string, string>>({});
  const [reason, setReason] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setSearch('');
    setPurchaseId(null);
    setQuantities({});
    setReason('');
    setError(null);
  }, [open]);

  const { data: results, isFetching } = useQuery({
    queryKey: ['purchase-return-picker', debounced],
    queryFn: () =>
      api
        .get<Paginated<PurchaseListRow>>(`/purchases${buildQuery({ search: debounced, pageSize: 8 })}`)
        .then((res) => res.items.filter((row) => row.status !== 'CANCELLED')),
    enabled: open,
  });

  const { data: purchase, isLoading: loadingPurchase } = useQuery({
    queryKey: ['purchase', purchaseId],
    queryFn: () => api.get<Single<Purchase>>(`/purchases/${purchaseId}`).then((res) => res.item),
    enabled: !!purchaseId,
  });

  const create = useMutation({
    mutationFn: (payload: unknown) => api.post<Single<PurchaseReturn>>('/purchase-returns', payload),
    onSuccess: ({ item }) => {
      toast.success(`Purchase return ${item.returnNumber} recorded`);
      onOpenChange(false);
      queryClient.invalidateQueries({ queryKey: ['purchase-returns'] });
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      queryClient.invalidateQueries({ queryKey: ['purchase'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not record the return'),
  });

  const selected = (purchase?.items ?? [])
    .map((item) => ({ item, quantity: Number(quantities[item.id]) || 0 }))
    .filter((entry) => entry.quantity > 0);

  const submit = () => {
    setError(null);
    if (!purchaseId) {
      setError('Choose the purchase to return against');
      return;
    }
    const parsed = purchaseReturnCreateSchema.safeParse({
      purchaseId,
      reason: reason || null,
      items: selected.map((entry) => ({ purchaseItemId: entry.item.id, quantity: entry.quantity })),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Enter at least one return quantity');
      return;
    }
    create.mutate(parsed.data);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !create.isPending && onOpenChange(next)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>New purchase return</DialogTitle>
          <DialogDescription>Select the purchase, then enter the quantity going back to the supplier.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          {!purchase ? (
            <>
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Search purchase number, bill or supplier…"
                autoFocus
              />
              <div className="max-h-72 divide-y overflow-y-auto rounded-lg border">
                {isFetching && !results ? (
                  <Skeleton className="h-24" />
                ) : (results ?? []).length === 0 ? (
                  <p className="px-3 py-8 text-center text-xs text-muted-foreground">No matching purchases.</p>
                ) : (
                  (results ?? []).map((row) => (
                    <button
                      key={row.id}
                      type="button"
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-secondary"
                      onClick={() => {
                        setPurchaseId(row.id);
                        setQuantities({});
                        setError(null);
                      }}
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">{row.purchaseNumber}</span>
                        <span className="block text-[11px] text-muted-foreground">
                          {row.supplier.name} · {formatDate(row.invoiceDate)}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-sm tabnum">{formatINR(row.total)}</span>
                        <span className="block text-[10px] text-muted-foreground">{row.itemCount} items</span>
                      </span>
                    </button>
                  ))
                )}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2 rounded-lg border bg-slate-50/60 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{purchase.purchaseNumber}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {purchase.supplier.name} · {formatDate(purchase.invoiceDate)}
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setPurchaseId(null)}>
                  Change
                </Button>
              </div>

              {loadingPurchase ? (
                <Skeleton className="h-40" />
              ) : (
                <div className="divide-y rounded-lg border">
                  {purchase.items.map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-3 px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{item.product.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          Bought {item.quantity} · {formatINR(item.lineTotal)}
                        </p>
                      </div>
                      <Input
                        type="number"
                        min="0"
                        max={item.quantity}
                        step="0.001"
                        value={quantities[item.id] ?? ''}
                        placeholder="0"
                        aria-label={`Return quantity for ${item.product.name}`}
                        className="h-8 w-24 text-right tabnum"
                        onChange={(event) =>
                          setQuantities((current) => ({ ...current, [item.id]: event.target.value }))
                        }
                      />
                    </div>
                  ))}
                </div>
              )}

              <Field label="Reason">
                <Textarea
                  value={reason}
                  maxLength={500}
                  className="min-h-[56px]"
                  placeholder="Damaged, expired, wrong item…"
                  onChange={(event) => setReason(event.target.value)}
                />
              </Field>
            </>
          )}

          {error ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={create.isPending}>
            Cancel
          </Button>
          <Button
            loading={create.isPending}
            disabled={!purchase || selected.length === 0}
            onClick={submit}
          >
            <Truck className="h-4 w-4" /> Record return
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
