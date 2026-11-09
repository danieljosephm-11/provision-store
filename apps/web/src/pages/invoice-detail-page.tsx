import * as React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Ban,
  CheckCircle2,
  CreditCard,
  Loader2,
  Printer,
  Receipt,
  Undo2,
  User,
} from 'lucide-react';
import { toast } from 'sonner';
import { refundForReturn } from '@ps/shared';
import { api, ApiError, openDocument } from '@/lib/api';
import { formatINR } from '@/lib/shared';
import { formatDate } from '@/lib/utils';
import { useAuth } from '@/contexts/auth';
import type { Invoice, SaleReturn, Single } from '@/lib/types';
import { PageHeader } from '@/components/shared/page-header';
import { ConfirmReasonDialog } from '@/components/shared/confirm-reason-dialog';
import { ErrorState } from '@/components/shared/states';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/controls';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';

const PAYMENT_METHODS = ['CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'CHEQUE', 'OTHER'] as const;
const REFUND_METHODS = ['CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'CHEQUE', 'CREDIT', 'OTHER'] as const;

export function InvoiceDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { can } = useAuth();

  const [payOpen, setPayOpen] = React.useState(false);
  const [voidOpen, setVoidOpen] = React.useState(false);
  const [returnOpen, setReturnOpen] = React.useState(false);

  const { data: invoice, isLoading, error, refetch } = useQuery({
    queryKey: ['invoice', id],
    queryFn: () => api.get<Single<Invoice>>(`/invoices/${id}`).then((res) => res.item),
    enabled: !!id,
  });

  const voidInvoice = useMutation({
    mutationFn: (reason: string) => api.post(`/invoices/${id}/void`, { reason }),
    onSuccess: () => {
      toast.success('Invoice voided — stock and ledgers reversed');
      setVoidOpen(false);
      queryClient.invalidateQueries({ queryKey: ['invoice', id] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not void the invoice'),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-52" />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <Card>
        <ErrorState
          title="Invoice not found"
          message={error instanceof ApiError ? error.message : 'It may have been removed or you may not have access.'}
          onRetry={() => void refetch()}
        />
      </Card>
    );
  }

  const isVoid = invoice.status === 'VOID';
  const canPay = (can('customer.payment') || can('pos.sell')) && !isVoid && invoice.balanceDue > 0;
  const canVoid = (can('pos.void') || can('invoice.void')) && !isVoid;
  const canReturn = (can('return.create') || can('pos.return')) && !isVoid;
  const interState = invoice.igst > 0;

  return (
    <div>
      <PageHeader
        title={invoice.invoiceNo}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span>{formatDate(invoice.createdAt, true)}</span>
            <StatusBadge status={invoice.status} />
            <StatusBadge status={invoice.paymentStatus} />
            {invoice.returns.length > 0 ? (
              <Badge variant="warning">
                <Undo2 className="h-3 w-3" /> {invoice.returns.length} return{invoice.returns.length === 1 ? '' : 's'}
              </Badge>
            ) : null}
          </span>
        }
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => navigate('/invoices')}>
              <ArrowLeft className="h-4 w-4" /> Invoices
            </Button>
            <Button variant="outline" size="sm" onClick={() => void openDocument(`/invoices/${invoice.id}/pdf`, 'open')}>
              <Printer className="h-4 w-4" /> A4
            </Button>
            <Button variant="outline" size="sm" onClick={() => void openDocument(`/invoices/${invoice.id}/thermal`, 'open')}>
              <Receipt className="h-4 w-4" /> Thermal
            </Button>
            {canReturn ? (
              <Button variant="outline" size="sm" onClick={() => setReturnOpen(true)}>
                <Undo2 className="h-4 w-4" /> Create return
              </Button>
            ) : null}
            {canPay ? (
              <Button size="sm" onClick={() => setPayOpen(true)}>
                <CreditCard className="h-4 w-4" /> Record payment
              </Button>
            ) : null}
            {canVoid ? (
              <Button variant="destructive" size="sm" onClick={() => setVoidOpen(true)}>
                <Ban className="h-4 w-4" /> Void
              </Button>
            ) : null}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Items</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <THead>
                  <TR>
                    <TH>Item</TH>
                    <TH className="text-right">Qty</TH>
                    <TH className="text-right">Rate</TH>
                    <TH className="text-right">Disc.</TH>
                    <TH className="text-right">Taxable</TH>
                    <TH className="text-right">GST</TH>
                    <TH className="text-right">Total</TH>
                  </TR>
                </THead>
                <TBody>
                  {invoice.items.map((item) => (
                    <TR key={item.id}>
                      <TD>
                        <p className="font-medium text-slate-800">{item.productName}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {item.sku ?? '—'}
                          {item.hsn ? ` · HSN ${item.hsn}` : ''} · {item.unit}
                          {item.returnedQuantity > 0 ? (
                            <span className="ml-1 text-amber-700">· {item.returnedQuantity} returned</span>
                          ) : null}
                        </p>
                      </TD>
                      <TD className="text-right tabnum">{item.quantity}</TD>
                      <TD className="text-right tabnum">{formatINR(item.unitPrice)}</TD>
                      <TD className="text-right tabnum text-muted-foreground">
                        {item.discountAmount > 0 ? `− ${formatINR(item.discountAmount)}` : '—'}
                        {item.billDiscountShare > 0 ? (
                          <span className="block text-[10px]">+ bill {formatINR(item.billDiscountShare)}</span>
                        ) : null}
                      </TD>
                      <TD className="text-right tabnum">{formatINR(item.taxableAmount)}</TD>
                      <TD className="text-right tabnum text-muted-foreground">
                        {item.taxRate}%
                        <span className="block text-[10px]">{formatINR(item.taxAmount)}</span>
                      </TD>
                      <TD className="text-right tabnum font-medium">{formatINR(item.lineTotal)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>Payments</CardTitle>
                <Badge variant="outline">{invoice.payments.length} tender{invoice.payments.length === 1 ? '' : 's'}</Badge>
              </CardHeader>
              <CardContent className="p-0">
                {invoice.payments.length === 0 ? (
                  <p className="px-5 py-6 text-center text-xs text-muted-foreground">No payments recorded yet.</p>
                ) : (
                  <div className="divide-y">
                    {invoice.payments.map((payment) => (
                      <div key={payment.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                        <div className="min-w-0">
                          <p className="font-medium">{payment.method.replace(/_/g, ' ')}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {formatDate(payment.receivedAt, true)}
                            {payment.reference ? ` · ${payment.reference}` : ''}
                          </p>
                        </div>
                        <span className="tabnum font-medium">{formatINR(payment.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>Returns</CardTitle>
                <Badge variant="outline">{invoice.returns.length}</Badge>
              </CardHeader>
              <CardContent className="p-0">
                {invoice.returns.length === 0 ? (
                  <p className="px-5 py-6 text-center text-xs text-muted-foreground">
                    Nothing returned against this invoice.
                  </p>
                ) : (
                  <div className="divide-y">
                    {invoice.returns.map((ret) => (
                      <button
                        key={ret.id}
                        type="button"
                        onClick={() => navigate('/returns')}
                        className="flex w-full items-center justify-between gap-3 px-5 py-2.5 text-left text-sm hover:bg-secondary/50"
                      >
                        <div className="min-w-0">
                          <p className="font-medium">{ret.returnNo}</p>
                          <p className="text-[11px] text-muted-foreground">{formatDate(ret.createdAt, true)}</p>
                        </div>
                        <span className="tabnum font-medium">{formatINR(ret.total)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Customer</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-muted-foreground">
                  <User className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  {invoice.customer ? (
                    <button
                      type="button"
                      className="truncate font-medium text-primary hover:underline"
                      onClick={() => navigate(`/customers/${invoice.customer!.id}`)}
                    >
                      {invoice.customer.name}
                    </button>
                  ) : (
                    <p className="font-medium">{invoice.customerName ?? 'Walk-in customer'}</p>
                  )}
                  <p className="text-[11px] text-muted-foreground">
                    {invoice.customer?.mobile ?? invoice.customerMobile ?? 'No mobile'}
                  </p>
                </div>
              </div>
              {invoice.customer?.gstin ? (
                <p className="pt-1 text-[11px] text-muted-foreground">GSTIN {invoice.customer.gstin}</p>
              ) : null}
              {invoice.dueDate ? (
                <p className="text-[11px] text-muted-foreground">Due {formatDate(invoice.dueDate)}</p>
              ) : null}
              {invoice.notes ? <p className="border-t pt-2 text-xs text-muted-foreground">{invoice.notes}</p> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Bill summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 text-sm">
              <Row label="Subtotal" value={formatINR(invoice.subtotal)} />
              {invoice.itemDiscount > 0 ? (
                <Row label="Item discounts" value={`− ${formatINR(invoice.itemDiscount)}`} tone="text-emerald-700" />
              ) : null}
              {invoice.billDiscount > 0 ? (
                <Row label="Bill discount" value={`− ${formatINR(invoice.billDiscount)}`} tone="text-emerald-700" />
              ) : null}
              <Row label="Taxable value" value={formatINR(invoice.taxableAmount)} muted />
              {interState ? (
                <Row label="IGST" value={formatINR(invoice.igst)} muted />
              ) : (
                <>
                  <Row label="CGST" value={formatINR(invoice.cgst)} muted />
                  <Row label="SGST" value={formatINR(invoice.sgst)} muted />
                </>
              )}
              {invoice.cess > 0 ? <Row label="Cess" value={formatINR(invoice.cess)} muted /> : null}
              {invoice.roundOff !== 0 ? <Row label="Round off" value={formatINR(invoice.roundOff)} muted /> : null}
              {invoice.loyaltyDiscount > 0 ? (
                <Row
                  label={`Loyalty (${invoice.loyaltyPointsRedeemed} pts)`}
                  value={`− ${formatINR(invoice.loyaltyDiscount)}`}
                  tone="text-emerald-700"
                />
              ) : null}
              <div className="flex items-end justify-between border-t pt-2">
                <span className="font-medium">Grand total</span>
                <span className="text-xl font-semibold tabnum text-slate-900">{formatINR(invoice.grandTotal)}</span>
              </div>
              <Row label="Paid" value={formatINR(invoice.amountPaid)} />
              <div className="flex items-center justify-between font-medium">
                <span>Balance due</span>
                <span className={invoice.balanceDue > 0 ? 'tabnum text-amber-700' : 'tabnum text-emerald-700'}>
                  {formatINR(invoice.balanceDue)}
                </span>
              </div>
              {invoice.pointsEarned > 0 ? (
                <p className="border-t pt-2 text-[11px] text-muted-foreground">
                  {invoice.pointsEarned} loyalty points earned by the customer.
                </p>
              ) : null}
              <p className="pt-1 text-[11px] text-muted-foreground">
                Billed by {invoice.createdByUser?.name ?? '—'} · {invoice.financialYear}
              </p>
            </CardContent>
          </Card>

          {isVoid ? (
            <Card className="border-red-200 bg-red-50/60">
              <CardContent className="space-y-1 p-4 text-sm">
                <p className="font-medium text-red-800">Voided invoice</p>
                <p className="text-xs text-red-700">{invoice.voidReason ?? 'No reason recorded.'}</p>
                <p className="text-[11px] text-red-600">{formatDate(invoice.voidedAt, true)}</p>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      <PaymentDialog open={payOpen} onOpenChange={setPayOpen} invoice={invoice} />
      <ReturnDialog open={returnOpen} onOpenChange={setReturnOpen} invoice={invoice} />

      <ConfirmReasonDialog
        open={voidOpen}
        onOpenChange={setVoidOpen}
        title={`Void ${invoice.invoiceNo}?`}
        description="Stock is returned, the customer ledger is adjusted and loyalty points are reversed. This cannot be undone."
        label="Reason for voiding"
        confirmLabel="Void invoice"
        loading={voidInvoice.isPending}
        onConfirm={(reason) => voidInvoice.mutate(reason)}
      />
    </div>
  );
}

function Row({ label, value, muted, tone }: { label: string; value: string; muted?: boolean; tone?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className={muted ? 'text-xs text-muted-foreground' : 'text-muted-foreground'}>{label}</span>
      <span className={`tabnum ${tone ?? (muted ? 'text-xs text-muted-foreground' : '')}`}>{value}</span>
    </div>
  );
}

function PaymentDialog({
  open,
  onOpenChange,
  invoice,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: Invoice;
}) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = React.useState(invoice.balanceDue);
  const [method, setMethod] = React.useState<(typeof PAYMENT_METHODS)[number]>('CASH');
  const [reference, setReference] = React.useState('');

  React.useEffect(() => {
    if (open) {
      setAmount(invoice.balanceDue);
      setMethod('CASH');
      setReference('');
    }
  }, [open, invoice.balanceDue]);

  const record = useMutation({
    mutationFn: () =>
      api.post(`/invoices/${invoice.id}/payments`, {
        amount: Number(amount) || 0,
        method,
        reference: reference.trim() || null,
      }),
    onSuccess: () => {
      toast.success('Payment recorded');
      onOpenChange(false);
      queryClient.invalidateQueries({ queryKey: ['invoice', invoice.id] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not record the payment'),
  });

  const value = Number(amount) || 0;
  const invalid = value <= 0 || value > invoice.balanceDue;

  return (
    <Dialog open={open} onOpenChange={(next) => !record.isPending && onOpenChange(next)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Record payment</DialogTitle>
          <DialogDescription>
            {invoice.invoiceNo} · balance {formatINR(invoice.balanceDue)}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <Field label="Amount" required error={value > invoice.balanceDue ? 'Amount exceeds the balance due' : undefined}>
            <Input
              type="number"
              min="0.01"
              step="0.01"
              max={invoice.balanceDue}
              value={amount}
              onChange={(event) => setAmount(Number(event.target.value))}
              autoFocus
              className="text-right tabnum"
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
          <Field label="Reference" hint="UPI ID, cheque number, card last 4…">
            <Input value={reference} onChange={(event) => setReference(event.target.value)} maxLength={120} />
          </Field>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setAmount(invoice.balanceDue)}>
              Full balance
            </Button>
            <Button variant="outline" size="sm" onClick={() => setAmount(Math.round((invoice.balanceDue / 2) * 100) / 100)}>
              Half
            </Button>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={record.isPending}>
            Cancel
          </Button>
          <Button
            loading={record.isPending}
            disabled={invalid}
            onClick={() => record.mutate()}
          >
            <CheckCircle2 className="h-4 w-4" /> Record {formatINR(value || 0)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReturnDialog({
  open,
  onOpenChange,
  invoice,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: Invoice;
}) {
  const queryClient = useQueryClient();
  const [quantities, setQuantities] = React.useState<Record<string, string>>({});
  const [refundMethod, setRefundMethod] = React.useState<(typeof REFUND_METHODS)[number]>('CASH');
  const [restock, setRestock] = React.useState(true);
  const [reason, setReason] = React.useState('');

  React.useEffect(() => {
    if (open) {
      setQuantities({});
      setRefundMethod('CASH');
      setRestock(true);
      setReason('');
    }
  }, [open]);

  const returnable = invoice.items.filter((item) => item.quantity - item.returnedQuantity > 0);

  const selected = returnable
    .map((item) => ({ item, quantity: Number(quantities[item.id]) || 0 }))
    .filter((entry) => entry.quantity > 0);

  const preview = React.useMemo(() => {
    let amount = 0;
    let tax = 0;
    for (const entry of selected) {
      const remaining = entry.item.quantity - entry.item.returnedQuantity;
      const qty = Math.min(entry.quantity, remaining);
      const result = refundForReturn(
        { quantity: entry.item.quantity, lineTotal: entry.item.lineTotal, taxAmount: entry.item.taxAmount },
        qty,
      );
      amount += result.amount;
      tax += result.taxAmount;
    }
    return { amount: Math.round(amount * 100) / 100, tax: Math.round(tax * 100) / 100 };
  }, [selected]);

  const invalidSelection = selected.some((entry) => {
    const remaining = entry.item.quantity - entry.item.returnedQuantity;
    return entry.quantity <= 0 || entry.quantity > remaining;
  });

  const createReturn = useMutation({
    mutationFn: () =>
      api.post<Single<SaleReturn>>('/returns', {
        invoiceId: invoice.id,
        reason: reason.trim() || null,
        refundMethod,
        restock,
        items: selected.map((entry) => ({ invoiceItemId: entry.item.id, quantity: entry.quantity })),
      }),
    onSuccess: (result) => {
      toast.success(`Return ${result.item.returnNo} created`);
      onOpenChange(false);
      queryClient.invalidateQueries({ queryKey: ['invoice', invoice.id] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['returns'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not create the return'),
  });

  return (
    <Dialog open={open} onOpenChange={(next) => !createReturn.isPending && onOpenChange(next)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Return against {invoice.invoiceNo}</DialogTitle>
          <DialogDescription>
            Enter the quantity coming back. Refunds are calculated pro-rata from the billed line value.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {returnable.length === 0 ? (
            <p className="rounded-md border bg-slate-50 px-3 py-6 text-center text-sm text-muted-foreground">
              Every item on this invoice has already been returned.
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg border">
              <Table>
                <THead>
                  <TR>
                    <TH>Item</TH>
                    <TH className="text-right">Billed</TH>
                    <TH className="text-right">Returned</TH>
                    <TH className="w-[110px] text-right">Return qty</TH>
                  </TR>
                </THead>
                <TBody>
                  {returnable.map((item) => {
                    const remaining = item.quantity - item.returnedQuantity;
                    return (
                      <TR key={item.id}>
                        <TD>
                          <p className="text-sm font-medium">{item.productName}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {formatINR(item.lineTotal)} · GST {item.taxRate}%
                          </p>
                        </TD>
                        <TD className="text-right tabnum">{item.quantity}</TD>
                        <TD className="text-right tabnum text-muted-foreground">{item.returnedQuantity}</TD>
                        <TD className="text-right">
                          <Input
                            type="number"
                            min="0"
                            max={remaining}
                            step="any"
                            value={quantities[item.id] ?? ''}
                            placeholder="0"
                            aria-label={`Return quantity for ${item.productName}`}
                            onChange={(event) =>
                              setQuantities((current) => ({ ...current, [item.id]: event.target.value }))
                            }
                            className="h-8 w-[92px] px-2 text-right tabnum"
                          />
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Refund method" required>
              <Select
                value={refundMethod}
                onChange={(event) => setRefundMethod(event.target.value as typeof refundMethod)}
              >
                {REFUND_METHODS.map((option) => (
                  <option key={option} value={option}>
                    {option === 'CREDIT' ? 'Store credit (no cash out)' : option.replace(/_/g, ' ')}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={restock} onCheckedChange={setRestock} />
                Put stock back on the shelf
              </label>
            </div>
          </div>

          <Field label="Reason">
            <Textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Damaged pack, wrong item, customer changed mind…"
              className="min-h-[60px]"
            />
          </Field>

          <div className="flex items-center justify-between rounded-lg border bg-slate-50 px-3 py-2.5">
            <div>
              <p className="text-sm font-medium">Refund preview</p>
              <p className="text-[11px] text-muted-foreground">Including {formatINR(preview.tax)} of GST</p>
            </div>
            <span className="text-lg font-semibold tabnum">{formatINR(preview.amount)}</span>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={createReturn.isPending}>
            Cancel
          </Button>
          <Button
            loading={createReturn.isPending}
            disabled={selected.length === 0 || invalidSelection}
            onClick={() => createReturn.mutate()}
          >
            <Undo2 className="h-4 w-4" /> Create return
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function InvoiceDetailLoading() {
  return <Loader2 className="h-5 w-5 animate-spin" />;
}
