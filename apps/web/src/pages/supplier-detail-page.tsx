import * as React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Building2, CreditCard, Loader2, Receipt, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { supplierPaymentSchema } from '@ps/shared';
import { api, ApiError, buildQuery } from '@/lib/api';
import { formatINR } from '@/lib/shared';
import { formatDate } from '@/lib/utils';
import { useAuth } from '@/contexts/auth';
import type { LedgerEntry, Paginated, Single, SupplierDetail } from '@/lib/types';
import { PageHeader } from '@/components/shared/page-header';
import { DataTable, type Column } from '@/components/shared/data-table';
import { Pagination } from '@/components/shared/pagination';
import { StatCard } from '@/components/shared/stat-card';
import { ErrorState } from '@/components/shared/states';
import { Badge, StatusBadge } from '@/components/ui/badge';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const PAYMENT_METHODS = ['CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'CHEQUE', 'OTHER'] as const;

export function SupplierDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const [payOpen, setPayOpen] = React.useState(false);

  const { data: supplier, isLoading, error, refetch } = useQuery({
    queryKey: ['supplier', id],
    queryFn: () => api.get<Single<SupplierDetail>>(`/suppliers/${id}`).then((res) => res.item),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-52" />
        <div className="grid gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-72" />
      </div>
    );
  }

  if (error || !supplier) {
    return (
      <Card>
        <ErrorState
          title="Supplier not found"
          message={error instanceof ApiError ? error.message : 'It may have been removed or you may not have access.'}
          onRetry={() => void refetch()}
        />
      </Card>
    );
  }

  return (
    <div>
      <PageHeader
        title={supplier.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span>{supplier.mobile}</span>
            {supplier.contactPerson ? <span>· {supplier.contactPerson}</span> : null}
            {supplier.gstin ? <span>· GSTIN {supplier.gstin}</span> : null}
            <Badge variant={supplier.isActive ? 'success' : 'secondary'}>
              {supplier.isActive ? 'Active' : 'Inactive'}
            </Badge>
          </span>
        }
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => navigate('/suppliers')}>
              <ArrowLeft className="h-4 w-4" /> Suppliers
            </Button>
            {can('supplier.payment') || can('purchase.pay') ? (
              <Button size="sm" onClick={() => setPayOpen(true)}>
                <CreditCard className="h-4 w-4" /> Pay supplier
              </Button>
            ) : null}
          </>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Payable"
          value={formatINR(supplier.outstanding)}
          hint={supplier.outstanding > 0 ? 'Amount owed to supplier' : 'No dues'}
          icon={CreditCard}
          tone={supplier.outstanding > 0 ? 'amber' : 'emerald'}
        />
        <StatCard
          label="Purchases"
          value={String(supplier.purchases.length)}
          hint="Recent purchase bills"
          icon={Receipt}
          tone="sky"
        />
        <StatCard
          label="Credit terms"
          value={`${supplier.creditDays} days`}
          hint={`Supplier since ${formatDate(supplier.createdAt)}`}
          icon={Truck}
          tone="violet"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Account activity</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Tabs defaultValue="purchases" className="px-4 pb-4 pt-2">
              <TabsList>
                <TabsTrigger value="purchases">Purchases</TabsTrigger>
                <TabsTrigger value="ledger">Ledger</TabsTrigger>
                <TabsTrigger value="payments">Payments</TabsTrigger>
              </TabsList>

              <TabsContent value="purchases">
                <DataTable
                  columns={[
                    {
                      key: 'no',
                      header: 'Purchase',
                      cell: (row) => (
                        <div>
                          <p className="font-medium">{row.purchaseNumber}</p>
                          <p className="text-[11px] text-muted-foreground">{formatDate(row.invoiceDate)}</p>
                        </div>
                      ),
                    },
                    { key: 'status', header: 'Status', cell: (row) => <StatusBadge status={row.status} /> },
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
                        <span className="tabnum text-amber-700">
                          {row.balanceAmount > 0 ? formatINR(row.balanceAmount) : '—'}
                        </span>
                      ),
                    },
                  ]}
                  rows={supplier.purchases}
                  rowKey={(row) => row.id}
                  onRowClick={(row) => navigate(`/purchases/${row.id}`)}
                  emptyTitle="No purchases yet"
                  emptyDescription="Goods received from this supplier will appear here."
                />
              </TabsContent>

              <TabsContent value="ledger">
                <SupplierLedgerTable supplierId={supplier.id} />
              </TabsContent>

              <TabsContent value="payments">
                {supplier.payments.length === 0 ? (
                  <p className="py-8 text-center text-xs text-muted-foreground">No payments recorded.</p>
                ) : (
                  <div className="divide-y rounded-lg border">
                    {supplier.payments.map((payment) => (
                      <div key={payment.id} className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm">
                        <div className="min-w-0">
                          <p className="font-medium">{payment.method.replace(/_/g, ' ')}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {formatDate(payment.paidAt, true)}
                            {payment.reference ? ` · ${payment.reference}` : ''}
                          </p>
                          {payment.note ? <p className="text-[11px] text-muted-foreground">{payment.note}</p> : null}
                        </div>
                        <span className="tabnum font-medium">{formatINR(payment.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Supplier profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-muted-foreground">
                <Building2 className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="truncate font-medium">{supplier.name}</p>
                <p className="text-[11px] text-muted-foreground">{supplier.mobile}</p>
              </div>
            </div>
            {supplier.email ? <Row label="Email" value={supplier.email} /> : null}
            {supplier.gstin ? <Row label="GSTIN" value={supplier.gstin} /> : null}
            <Row label="Credit terms" value={`${supplier.creditDays} days`} />
            <Row label="Supplier since" value={formatDate(supplier.createdAt)} />
            {supplier.address ? (
              <address className="border-t pt-2 text-xs not-italic leading-5 text-muted-foreground">
                {supplier.address}
                <span className="block">
                  {[supplier.city, supplier.stateCode, supplier.pincode].filter(Boolean).join(', ')}
                </span>
              </address>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <SupplierPaymentDialog open={payOpen} onOpenChange={setPayOpen} supplier={supplier} />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="truncate text-xs font-medium">{value}</span>
    </div>
  );
}

function SupplierLedgerTable({ supplierId }: { supplierId: string }) {
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(15);
  const { data, isLoading } = useQuery({
    queryKey: ['supplier', supplierId, 'ledger', { page, pageSize }],
    queryFn: () =>
      api.get<Paginated<LedgerEntry>>(`/suppliers/${supplierId}/ledger${buildQuery({ page, pageSize })}`),
    placeholderData: keepPreviousData,
  });

  const columns: Column<LedgerEntry>[] = [
    {
      key: 'when',
      header: 'Date',
      cell: (row) => (
        <div>
          <p className="text-xs font-medium">{formatDate(row.entryDate)}</p>
          <p className="text-[10px] text-muted-foreground">#{row.seq}</p>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Entry',
      cell: (row) => (
        <div>
          <Badge variant="outline">{row.type.replace(/_/g, ' ')}</Badge>
          <p className="pt-0.5 text-[11px] text-muted-foreground">{row.description ?? '—'}</p>
        </div>
      ),
    },
    {
      key: 'debit',
      header: 'Paid',
      align: 'right',
      cell: (row) => <span className="tabnum text-xs">{row.debit > 0 ? formatINR(row.debit) : '—'}</span>,
    },
    {
      key: 'credit',
      header: 'Billed',
      align: 'right',
      cell: (row) => <span className="tabnum text-xs">{row.credit > 0 ? formatINR(row.credit) : '—'}</span>,
    },
    {
      key: 'balance',
      header: 'Balance',
      align: 'right',
      cell: (row) => <span className="tabnum font-medium">{formatINR(row.balanceAfter)}</span>,
    },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        rows={data?.items}
        rowKey={(row) => row.id}
        loading={isLoading}
        emptyTitle="No ledger entries"
        emptyDescription="Purchases and payments post to this ledger."
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
    </>
  );
}

function SupplierPaymentDialog({
  open,
  onOpenChange,
  supplier,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplier: SupplierDetail;
}) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = React.useState('');
  const [method, setMethod] = React.useState<(typeof PAYMENT_METHODS)[number]>('CASH');
  const [purchaseId, setPurchaseId] = React.useState('');
  const [reference, setReference] = React.useState('');
  const [note, setNote] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setAmount(supplier.outstanding > 0 ? String(supplier.outstanding) : '');
    setMethod('CASH');
    setPurchaseId('');
    setReference('');
    setNote('');
    setError(null);
  }, [open, supplier.outstanding]);

  const unpaidPurchases = supplier.purchases.filter((purchase) => purchase.balanceAmount > 0 && purchase.status !== 'CANCELLED');

  const record = useMutation({
    mutationFn: (payload: unknown) => api.post<Single<unknown>>(`/suppliers/${supplier.id}/payments`, payload),
    onSuccess: () => {
      toast.success('Supplier payment recorded');
      onOpenChange(false);
      queryClient.invalidateQueries({ queryKey: ['supplier', supplier.id] });
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not record the payment'),
  });

  const submit = () => {
    setError(null);
    const parsed = supplierPaymentSchema.safeParse({
      amount: Number(amount) || 0,
      method,
      purchaseId: purchaseId || null,
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
          <DialogTitle>Pay supplier</DialogTitle>
          <DialogDescription>
            {supplier.name} · payable {formatINR(supplier.outstanding)}
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
              onChange={(event) => setAmount(event.target.value)}
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
          <Field label="Apply to purchase" hint="Optional — settles a specific purchase bill">
            <Select value={purchaseId} onChange={(event) => setPurchaseId(event.target.value)}>
              <option value="">General payment on account</option>
              {unpaidPurchases.map((purchase) => (
                <option key={purchase.id} value={purchase.id}>
                  {purchase.purchaseNumber} · {formatINR(purchase.balanceAmount)} due
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

export function SupplierDetailLoading() {
  return <Loader2 className="h-5 w-5 animate-spin" />;
}
