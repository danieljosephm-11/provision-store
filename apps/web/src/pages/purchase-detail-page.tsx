import * as React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CreditCard, Loader2, RotateCcw, Truck, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { purchaseReturnCreateSchema, supplierPaymentSchema } from '@ps/shared';
import { api, ApiError } from '@/lib/api';
import { formatINR } from '@/lib/shared';
import { formatDate } from '@/lib/utils';
import { useAuth } from '@/contexts/auth';
import type { Purchase, Single } from '@/lib/types';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard } from '@/components/shared/stat-card';
import { ErrorState } from '@/components/shared/states';
import { ConfirmReasonDialog } from '@/components/shared/confirm-reason-dialog';
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

const PAYMENT_METHODS = ['CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'CHEQUE', 'OTHER'] as const;

export function PurchaseDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [payOpen, setPayOpen] = React.useState(false);
  const [returnOpen, setReturnOpen] = React.useState(false);
  const [cancelOpen, setCancelOpen] = React.useState(false);

  const { data: purchase, isLoading, error, refetch } = useQuery({
    queryKey: ['purchase', id],
    queryFn: () => api.get<Single<Purchase>>(`/purchases/${id}`).then((res) => res.item),
    enabled: !!id,
  });

  const cancel = useMutation({
    mutationFn: (reason: string) => api.post(`/purchases/${id}/cancel`, { reason }),
    onSuccess: () => {
      toast.success('Purchase cancelled and stock reversed');
      setCancelOpen(false);
      queryClient.invalidateQueries({ queryKey: ['purchase', id] });
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not cancel the purchase'),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-72" />
      </div>
    );
  }

  if (error || !purchase) {
    return (
      <Card>
        <ErrorState
          title="Purchase not found"
          message={error instanceof ApiError ? error.message : 'It may have been removed or you may not have access.'}
          onRetry={() => void refetch()}
        />
      </Card>
    );
  }

  const canReturn = can('purchase.return') && purchase.status !== 'CANCELLED';

  return (
    <div>
      <PageHeader
        title={purchase.purchaseNumber}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span>{purchase.supplier.name}</span>
            <span>· {formatDate(purchase.invoiceDate)}</span>
            {purchase.supplierInvoiceNo ? <span>· Bill {purchase.supplierInvoiceNo}</span> : null}
            {purchase.purchaseOrder ? <span>· PO {purchase.purchaseOrder.poNumber}</span> : null}
            <StatusBadge status={purchase.status} />
          </span>
        }
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => navigate('/purchases')}>
              <ArrowLeft className="h-4 w-4" /> Purchases
            </Button>
            {canReturn ? (
              <Button variant="outline" size="sm" onClick={() => setReturnOpen(true)}>
                <RotateCcw className="h-4 w-4" /> Return
              </Button>
            ) : null}
            {(can('purchase.pay') || can('supplier.payment')) && purchase.balanceAmount > 0 && purchase.status !== 'CANCELLED' ? (
              <Button size="sm" onClick={() => setPayOpen(true)}>
                <CreditCard className="h-4 w-4" /> Record payment
              </Button>
            ) : null}
            {can('purchase.create') && purchase.status !== 'CANCELLED' && purchase.returns.length === 0 ? (
              <Button variant="outline" size="sm" onClick={() => setCancelOpen(true)}>
                <XCircle className="h-4 w-4 text-red-500" /> Cancel
              </Button>
            ) : null}
          </>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Bill total"
          value={formatINR(purchase.total)}
          hint={`Tax ${formatINR(purchase.taxAmount)} · discount ${formatINR(purchase.discountAmount)}`}
          icon={Truck}
          tone="sky"
        />
        <StatCard
          label="Paid"
          value={formatINR(purchase.paidAmount)}
          hint={`${purchase.items.length} items received`}
          icon={CreditCard}
          tone="emerald"
        />
        <StatCard
          label="Balance payable"
          value={formatINR(purchase.balanceAmount)}
          hint={purchase.balanceAmount > 0 ? 'Still owed to supplier' : 'Settled'}
          icon={CreditCard}
          tone={purchase.balanceAmount > 0 ? 'amber' : 'emerald'}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle>Items</CardTitle>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-slate-50/80 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">Product</th>
                    <th className="px-3 py-2 text-right font-medium">Qty</th>
                    <th className="px-3 py-2 text-right font-medium">Cost</th>
                    <th className="px-3 py-2 text-right font-medium">Disc.</th>
                    <th className="px-3 py-2 text-right font-medium">GST</th>
                    <th className="px-4 py-2 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {purchase.items.map((item) => (
                    <tr key={item.id}>
                      <td className="px-4 py-2">
                        <p className="font-medium">{item.product.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {item.product.sku}
                          {item.freeQuantity > 0 ? ` · ${item.freeQuantity} free` : ''}
                          {item.expiryDate ? ` · exp ${formatDate(item.expiryDate)}` : ''}
                        </p>
                      </td>
                      <td className="px-3 py-2 text-right tabnum">{item.quantity}</td>
                      <td className="px-3 py-2 text-right tabnum">{formatINR(item.unitCost)}</td>
                      <td className="px-3 py-2 text-right tabnum text-muted-foreground">
                        {item.discountAmount > 0 ? formatINR(item.discountAmount) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span className="tabnum text-xs">{formatINR(item.taxAmount)}</span>
                        <span className="block text-[10px] text-muted-foreground">{item.taxRate}%</span>
                      </td>
                      <td className="px-4 py-2 text-right tabnum font-medium">{formatINR(item.lineTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Returns against this purchase</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {purchase.returns.length === 0 ? (
                <p className="px-5 pb-4 text-xs text-muted-foreground">No returns recorded.</p>
              ) : (
                <div className="divide-y">
                  {purchase.returns.map((entry) => (
                    <div key={entry.id} className="flex items-center justify-between gap-2 px-5 py-2.5 text-sm">
                      <div>
                        <p className="font-medium">{entry.returnNumber}</p>
                        <p className="text-[11px] text-muted-foreground">{formatDate(entry.returnDate)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={entry.status} />
                        <span className="tabnum font-medium">{formatINR(entry.total)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {purchase.notes ? (
            <Card>
              <CardHeader>
                <CardTitle>Notes</CardTitle>
              </CardHeader>
              <CardContent className="whitespace-pre-wrap text-sm text-muted-foreground">{purchase.notes}</CardContent>
            </Card>
          ) : null}
        </div>

        <div className="space-y-4">
          <Card className="lg:sticky lg:top-20">
            <CardHeader>
              <CardTitle>Bill summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="Taxable value" value={formatINR(purchase.subtotal)} />
              <Row label="GST" value={formatINR(purchase.taxAmount)} />
              <Row label="Discount" value={`− ${formatINR(purchase.discountAmount)}`} />
              <div className="flex items-center justify-between border-t pt-2 text-base font-semibold">
                <span>Total</span>
                <span className="tabnum">{formatINR(purchase.total)}</span>
              </div>
              <Row label="Paid" value={formatINR(purchase.paidAmount)} />
              <Row label="Balance" value={formatINR(purchase.balanceAmount)} />
              <div className="border-t pt-2 text-xs text-muted-foreground">
                <p>Recorded by {purchase.createdByUser?.name ?? '—'}</p>
                <p>{formatDate(purchase.createdAt, true)}</p>
                {purchase.receivedDate ? <p>Received {formatDate(purchase.receivedDate)}</p> : null}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <PurchasePaymentDialog open={payOpen} onOpenChange={setPayOpen} purchase={purchase} />
      <PurchaseReturnDialog open={returnOpen} onOpenChange={setReturnOpen} purchase={purchase} />
      <ConfirmReasonDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancel purchase?"
        description="Stock will be reversed and the supplier ledger credited. This cannot be undone."
        confirmLabel="Cancel purchase"
        loading={cancel.isPending}
        onConfirm={(reason) => cancel.mutate(reason)}
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="tabnum">{value}</span>
    </div>
  );
}

function PurchasePaymentDialog({
  open,
  onOpenChange,
  purchase,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  purchase: Purchase;
}) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = React.useState('');
  const [method, setMethod] = React.useState<(typeof PAYMENT_METHODS)[number]>('CASH');
  const [reference, setReference] = React.useState('');
  const [note, setNote] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setAmount(String(purchase.balanceAmount));
    setMethod('CASH');
    setReference('');
    setNote('');
    setError(null);
  }, [open, purchase.balanceAmount]);

  const record = useMutation({
    mutationFn: (payload: unknown) => api.post(`/purchases/${purchase.id}/payments`, payload),
    onSuccess: () => {
      toast.success('Payment recorded');
      onOpenChange(false);
      queryClient.invalidateQueries({ queryKey: ['purchase', purchase.id] });
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      queryClient.invalidateQueries({ queryKey: ['supplier'] });
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not record the payment'),
  });

  const submit = () => {
    setError(null);
    const parsed = supplierPaymentSchema.safeParse({
      amount: Number(amount) || 0,
      method,
      purchaseId: purchase.id,
      reference: reference || null,
      note: note || null,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the payment details');
      return;
    }
    record.mutate(parsed.data);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !record.isPending && onOpenChange(next)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Record supplier payment</DialogTitle>
          <DialogDescription>
            {purchase.purchaseNumber} · balance {formatINR(purchase.balanceAmount)}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <Field label="Amount" required>
            <Input
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              autoFocus
              className="text-right tabnum"
              onChange={(event) => setAmount(event.target.value)}
            />
          </Field>
          <Field label="Method" required>
            <Select value={method} onChange={(event) => setMethod(event.target.value as typeof method)}>
              {PAYMENT_METHODS.map((option) => (
                <option key={option} value={option}>
                  {option.replace(/_/g, ' ')}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Reference">
            <Input value={reference} maxLength={120} onChange={(event) => setReference(event.target.value)} />
          </Field>
          <Field label="Note">
            <Textarea
              value={note}
              maxLength={500}
              className="min-h-[56px]"
              onChange={(event) => setNote(event.target.value)}
            />
          </Field>
          {error ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={record.isPending}>
            Cancel
          </Button>
          <Button loading={record.isPending} disabled={!(Number(amount) > 0)} onClick={submit}>
            Record payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PurchaseReturnDialog({
  open,
  onOpenChange,
  purchase,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  purchase: Purchase;
}) {
  const queryClient = useQueryClient();
  const [quantities, setQuantities] = React.useState<Record<string, string>>({});
  const [reason, setReason] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setQuantities({});
    setReason('');
    setError(null);
  }, [open]);

  const create = useMutation({
    mutationFn: (payload: unknown) => api.post('/purchase-returns', payload),
    onSuccess: () => {
      toast.success('Purchase return recorded');
      onOpenChange(false);
      queryClient.invalidateQueries({ queryKey: ['purchase', purchase.id] });
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      queryClient.invalidateQueries({ queryKey: ['purchase-returns'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not record the return'),
  });

  const selected = purchase.items
    .map((item) => ({ item, quantity: Number(quantities[item.id]) || 0 }))
    .filter((entry) => entry.quantity > 0);

  const submit = () => {
    setError(null);
    const parsed = purchaseReturnCreateSchema.safeParse({
      purchaseId: purchase.id,
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
          <DialogTitle>Return goods to supplier</DialogTitle>
          <DialogDescription>
            {purchase.purchaseNumber} · {purchase.supplier.name}. Stock is reduced and the supplier ledger credited.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <div className="divide-y rounded-lg border">
            {purchase.items.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{item.product.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    Bought {item.quantity} {item.product.sku ? `· ${item.product.sku}` : ''} · {formatINR(item.lineTotal)}
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
          <Field label="Reason">
            <Textarea
              value={reason}
              maxLength={500}
              className="min-h-[56px]"
              placeholder="Damaged, expired, wrong item…"
              onChange={(event) => setReason(event.target.value)}
            />
          </Field>
          {error ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={create.isPending}>
            Cancel
          </Button>
          <Button loading={create.isPending} disabled={selected.length === 0} onClick={submit}>
            Record return
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PurchaseDetailLoading() {
  return <Loader2 className="h-5 w-5 animate-spin" />;
}
