import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardList, Plus, Trash2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { purchaseOrderCreateSchema } from '@ps/shared';
import { api, ApiError, buildQuery } from '@/lib/api';
import { formatINR, round2 } from '@/lib/shared';
import { formatDate } from '@/lib/utils';
import { useDebouncedValue } from '@/lib/hooks';
import { useAuth } from '@/contexts/auth';
import type { Paginated, Product, PurchaseOrder, PurchaseOrderListRow, Single, Supplier } from '@/lib/types';
import { PageHeader } from '@/components/shared/page-header';
import { DataTable, type Column } from '@/components/shared/data-table';
import { Pagination } from '@/components/shared/pagination';
import { SearchInput } from '@/components/shared/search-input';
import { ProductSelect, SupplierSelect } from '@/components/shared/entity-select';
import { ConfirmReasonDialog } from '@/components/shared/confirm-reason-dialog';
import { ErrorState } from '@/components/shared/states';
import { StatusBadge } from '@/components/ui/badge';
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
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';

const today = () => new Date().toISOString().slice(0, 10);

export function PurchaseOrdersPage() {
  const { can } = useAuth();
  const [search, setSearch] = React.useState('');
  const debounced = useDebouncedValue(search, 250);
  const [status, setStatus] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(20);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [viewId, setViewId] = React.useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['purchase-orders', { debounced, status, page, pageSize }],
    queryFn: () =>
      api.get<Paginated<PurchaseOrderListRow>>(
        `/purchase-orders${buildQuery({ search: debounced, status, page, pageSize })}`,
      ),
    placeholderData: keepPreviousData,
  });

  const columns: Column<PurchaseOrderListRow>[] = [
    {
      key: 'po',
      header: 'Order',
      cell: (row) => (
        <div>
          <p className="font-medium text-slate-800">{row.poNumber}</p>
          <p className="text-[11px] text-muted-foreground">
            {formatDate(row.orderDate)}
            {row.expectedDate ? ` · expected ${formatDate(row.expectedDate)}` : ''}
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
      cell: (row) => (
        <div className="text-right">
          <p className="tabnum text-sm">{row.itemCount}</p>
          {row.purchaseCount > 0 ? (
            <p className="text-[10px] text-emerald-700">{row.purchaseCount} received</p>
          ) : null}
        </div>
      ),
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
        title="Purchase orders"
        description="Plan replenishment, send orders to suppliers and receive against them."
        actions={
          can('purchase.create') ? (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> New order
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
            placeholder="Search PO number or supplier…"
            className="w-full lg:max-w-xs"
          />
          <Select
            className="h-9 w-[160px]"
            value={status}
            aria-label="Filter purchase orders by status"
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="ORDERED">Ordered</option>
            <option value="PARTIAL">Partial</option>
            <option value="RECEIVED">Received</option>
            <option value="CANCELLED">Cancelled</option>
          </Select>
        </div>

        <DataTable
          columns={columns}
          rows={data?.items}
          rowKey={(row) => row.id}
          loading={isLoading}
          onRowClick={(row) => setViewId(row.id)}
          emptyTitle="No purchase orders"
          emptyDescription="Create an order to track what you expect from suppliers."
          emptyAction={
            can('purchase.create') ? (
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <ClipboardList className="h-4 w-4" /> New order
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

      <PurchaseOrderCreateDialog open={createOpen} onOpenChange={setCreateOpen} />
      <PurchaseOrderViewDialog id={viewId} onOpenChange={(open) => !open && setViewId(null)} />
    </div>
  );
}

interface OrderLine {
  key: string;
  product: Product;
  quantity: string;
  unitCost: string;
  taxRate: string;
}

function PurchaseOrderCreateDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [supplier, setSupplier] = React.useState<Supplier | null>(null);
  const [orderDate, setOrderDate] = React.useState(today);
  const [expectedDate, setExpectedDate] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [lines, setLines] = React.useState<OrderLine[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setSupplier(null);
    setOrderDate(today());
    setExpectedDate('');
    setNotes('');
    setLines([]);
    setError(null);
  }, [open]);

  const addProduct = (product: Product) => {
    setLines((current) => [
      ...current,
      {
        key: crypto.randomUUID(),
        product,
        quantity: '1',
        unitCost: String(product.purchasePrice && product.purchasePrice > 0 ? product.purchasePrice : product.sellingPrice),
        taxRate: String(product.taxRate?.rate ?? 0),
      },
    ]);
  };

  const totals = lines.reduce(
    (acc, line) => {
      const taxable = round2((Number(line.quantity) || 0) * (Number(line.unitCost) || 0));
      const tax = round2((taxable * (Number(line.taxRate) || 0)) / 100);
      return { subtotal: round2(acc.subtotal + taxable), tax: round2(acc.tax + tax) };
    },
    { subtotal: 0, tax: 0 },
  );

  const create = useMutation({
    mutationFn: (payload: unknown) => api.post<Single<PurchaseOrder>>('/purchase-orders', payload),
    onSuccess: ({ item }) => {
      toast.success(`Purchase order ${item.poNumber} created`);
      onOpenChange(false);
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not create the order'),
  });

  const submit = () => {
    setError(null);
    if (!supplier) {
      setError('Select a supplier');
      return;
    }
    const parsed = purchaseOrderCreateSchema.safeParse({
      supplierId: supplier.id,
      orderDate,
      expectedDate: expectedDate || null,
      notes: notes || null,
      items: lines.map((line) => ({
        productId: line.product.id,
        quantity: Number(line.quantity) || 0,
        unitCost: Number(line.unitCost) || 0,
        taxRate: Number(line.taxRate) || 0,
      })),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the order details');
      return;
    }
    create.mutate(parsed.data);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !create.isPending && onOpenChange(next)}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>New purchase order</DialogTitle>
          <DialogDescription>Orders do not affect stock until goods are received.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Supplier" required>
              <SupplierSelect value={supplier} onChange={setSupplier} />
            </Field>
            <Field label="Order date" required>
              <Input type="date" value={orderDate} onChange={(event) => setOrderDate(event.target.value)} />
            </Field>
            <Field label="Expected date">
              <Input type="date" value={expectedDate} onChange={(event) => setExpectedDate(event.target.value)} />
            </Field>
            <Field label="Notes">
              <Input value={notes} maxLength={1000} onChange={(event) => setNotes(event.target.value)} />
            </Field>
          </div>

          <div className="space-y-2">
            <ProductSelect onSelect={addProduct} placeholder="Add a product to order…" />
            {lines.length === 0 ? (
              <p className="rounded-lg border border-dashed px-4 py-6 text-center text-xs text-muted-foreground">
                No items yet.
              </p>
            ) : (
              <div className="space-y-2">
                {lines.map((line) => (
                  <div key={line.key} className="grid grid-cols-[minmax(0,1fr)_80px_100px_70px_28px] items-end gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium">{line.product.name}</p>
                      <p className="text-[10px] text-muted-foreground">{line.product.sku}</p>
                    </div>
                    <Input
                      type="number"
                      min="0.001"
                      step="0.001"
                      value={line.quantity}
                      className="h-8 text-right tabnum"
                      aria-label="Quantity"
                      onChange={(event) =>
                        setLines((current) =>
                          current.map((row) => (row.key === line.key ? { ...row, quantity: event.target.value } : row)),
                        )
                      }
                    />
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={line.unitCost}
                      className="h-8 text-right tabnum"
                      aria-label="Unit cost"
                      onChange={(event) =>
                        setLines((current) =>
                          current.map((row) => (row.key === line.key ? { ...row, unitCost: event.target.value } : row)),
                        )
                      }
                    />
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={line.taxRate}
                      className="h-8 text-right tabnum"
                      aria-label="GST rate"
                      onChange={(event) =>
                        setLines((current) =>
                          current.map((row) => (row.key === line.key ? { ...row, taxRate: event.target.value } : row)),
                        )
                      }
                    />
                    <Button
                      variant="ghost"
                      size="iconSm"
                      aria-label="Remove line"
                      onClick={() => setLines((current) => current.filter((row) => row.key !== line.key))}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-red-500" />
                    </Button>
                  </div>
                ))}
                <div className="flex justify-end gap-6 border-t pt-2 text-sm">
                  <span className="text-muted-foreground">
                    Taxable <span className="tabnum text-slate-800">{formatINR(totals.subtotal)}</span>
                  </span>
                  <span className="text-muted-foreground">
                    GST <span className="tabnum text-slate-800">{formatINR(totals.tax)}</span>
                  </span>
                  <span className="font-semibold">
                    Total <span className="tabnum">{formatINR(round2(totals.subtotal + totals.tax))}</span>
                  </span>
                </div>
              </div>
            )}
          </div>

          {error ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={create.isPending}>
            Cancel
          </Button>
          <Button loading={create.isPending} disabled={lines.length === 0} onClick={submit}>
            Create order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PurchaseOrderViewDialog({ id, onOpenChange }: { id: string | null; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [cancelOpen, setCancelOpen] = React.useState(false);

  const { data: order, isLoading, error, refetch } = useQuery({
    queryKey: ['purchase-order', id],
    queryFn: () => api.get<Single<PurchaseOrder>>(`/purchase-orders/${id}`).then((res) => res.item),
    enabled: !!id,
  });

  const cancel = useMutation({
    mutationFn: (reason: string) => api.post(`/purchase-orders/${id}/cancel`, { reason }),
    onSuccess: () => {
      toast.success('Purchase order cancelled');
      setCancelOpen(false);
      queryClient.invalidateQueries({ queryKey: ['purchase-order', id] });
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not cancel the order'),
  });

  return (
    <>
      <Dialog open={!!id} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{order?.poNumber ?? 'Purchase order'}</DialogTitle>
            <DialogDescription>
              {order ? `${order.supplier.name} · ordered ${formatDate(order.orderDate)}` : 'Loading order…'}
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3">
            {isLoading ? (
              <Skeleton className="h-40" />
            ) : error || !order ? (
              <ErrorState
                title="Could not load the order"
                message={error instanceof ApiError ? error.message : undefined}
                onRetry={() => void refetch()}
              />
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <StatusBadge status={order.status} />
                  {order.expectedDate ? <span>Expected {formatDate(order.expectedDate)}</span> : null}
                  {order.notes ? <span>· {order.notes}</span> : null}
                </div>
                <div className="divide-y rounded-lg border">
                  {order.items.map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{item.product.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {item.quantity} × {formatINR(item.unitCost)} · GST {item.taxRate}%
                          {item.receivedQuantity > 0 ? ` · ${item.receivedQuantity} received` : ''}
                        </p>
                      </div>
                      <span className="tabnum font-medium">{formatINR(item.lineTotal)}</span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between border-t pt-2 text-sm">
                  <span className="text-muted-foreground">
                    Taxable {formatINR(order.subtotal)} · GST {formatINR(order.taxAmount)}
                  </span>
                  <span className="font-semibold">Total {formatINR(order.total)}</span>
                </div>
                {order.purchases.length > 0 ? (
                  <div className="rounded-lg border bg-slate-50/60 p-3 text-xs">
                    <p className="mb-1 font-medium text-slate-700">Receipts</p>
                    {order.purchases.map((purchase) => (
                      <button
                        key={purchase.id}
                        type="button"
                        className="flex w-full items-center justify-between gap-2 py-0.5 text-left hover:underline"
                        onClick={() => {
                          onOpenChange(false);
                          navigate(`/purchases/${purchase.id}`);
                        }}
                      >
                        <span>{purchase.purchaseNumber}</span>
                        <span className="tabnum">{formatINR(purchase.total)}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            {order && order.status !== 'CANCELLED' && order.purchases.length === 0 && can('purchase.create') ? (
              <>
                <Button variant="outline" onClick={() => setCancelOpen(true)}>
                  <XCircle className="h-4 w-4 text-red-500" /> Cancel order
                </Button>
                <Button
                  onClick={() => {
                    onOpenChange(false);
                    navigate(
                      `/purchases/new?supplierId=${encodeURIComponent(order.supplierId)}&purchaseOrderId=${encodeURIComponent(order.id)}`,
                    );
                  }}
                >
                  Receive goods
                </Button>
              </>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmReasonDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancel purchase order?"
        description="The supplier will no longer be expected to fulfil this order."
        confirmLabel="Cancel order"
        loading={cancel.isPending}
        onConfirm={(reason) => cancel.mutate(reason)}
      />
    </>
  );
}
