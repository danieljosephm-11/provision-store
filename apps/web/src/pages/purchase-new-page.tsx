import * as React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Building2, Plus, Trash2, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { purchaseCreateSchema } from '@ps/shared';
import { api, ApiError, buildQuery } from '@/lib/api';
import { formatINR, round2 } from '@/lib/shared';
import type { Paginated, Product, Purchase, PurchaseOrderListRow, Single, Supplier } from '@/lib/types';
import { PageHeader } from '@/components/shared/page-header';
import { ProductSelect, SupplierSelect } from '@/components/shared/entity-select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input, Select, Textarea } from '@/components/ui/input';

interface Line {
  key: string;
  product: Product;
  quantity: string;
  freeQuantity: string;
  unitCost: string;
  discountAmount: string;
  taxRate: string;
  batchNo: string;
  expiryDate: string;
}

const today = () => new Date().toISOString().slice(0, 10);

function makeLine(product: Product): Line {
  return {
    key: crypto.randomUUID(),
    product,
    quantity: '1',
    freeQuantity: '0',
    unitCost: String(product.purchasePrice && product.purchasePrice > 0 ? product.purchasePrice : product.sellingPrice),
    discountAmount: '0',
    taxRate: String(product.taxRate?.rate ?? 0),
    batchNo: '',
    expiryDate: '',
  };
}

function computeTotals(lines: Line[], billDiscountRaw: number) {
  const prepared = lines.map((line) => {
    const gross = round2((Number(line.quantity) || 0) * (Number(line.unitCost) || 0));
    const discount = Math.min(gross, round2(Number(line.discountAmount) || 0));
    return {
      line,
      gross,
      discount,
      taxableBefore: round2(gross - discount),
      rate: Number(line.taxRate) || 0,
    };
  });
  const totalBefore = round2(prepared.reduce((sum, row) => sum + row.taxableBefore, 0));
  const billDiscount = Math.min(totalBefore, round2(billDiscountRaw > 0 ? billDiscountRaw : 0));
  let allocated = 0;
  const detailed = prepared.map((row, index) => {
    let share = 0;
    if (billDiscount > 0 && totalBefore > 0) {
      share =
        index === prepared.length - 1
          ? billDiscount - allocated
          : Math.round((billDiscount * row.taxableBefore) / totalBefore);
      share = Math.max(0, Math.min(share, row.taxableBefore));
      allocated += share;
    }
    const taxable = round2(row.taxableBefore - share);
    const tax = round2((taxable * row.rate) / 100);
    return { ...row, share: round2(share), taxable, tax, lineTotal: round2(taxable + tax) };
  });
  const subtotal = round2(detailed.reduce((sum, row) => sum + row.taxable, 0));
  const taxAmount = round2(detailed.reduce((sum, row) => sum + row.tax, 0));
  return { detailed, subtotal, taxAmount, total: round2(subtotal + taxAmount), billDiscount };
}

export function PurchaseNewPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const initialSupplierId = searchParams.get('supplierId');
  const initialOrderId = searchParams.get('purchaseOrderId');

  const [supplier, setSupplier] = React.useState<Supplier | null>(null);
  const [supplierInvoiceNo, setSupplierInvoiceNo] = React.useState('');
  const [invoiceDate, setInvoiceDate] = React.useState(today);
  const [purchaseOrderId, setPurchaseOrderId] = React.useState('');
  const [discountAmount, setDiscountAmount] = React.useState('0');
  const [paidAmount, setPaidAmount] = React.useState('0');
  const [notes, setNotes] = React.useState('');
  const [lines, setLines] = React.useState<Line[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  const { data: initialSupplier } = useQuery({
    queryKey: ['supplier', initialSupplierId],
    queryFn: () => api.get<Single<Supplier>>(`/suppliers/${initialSupplierId}`).then((res) => res.item),
    enabled: !!initialSupplierId && !supplier,
  });

  React.useEffect(() => {
    if (initialSupplier && !supplier) {
      setSupplier(initialSupplier);
      if (initialOrderId) setPurchaseOrderId(initialOrderId);
    }
  }, [initialSupplier, initialOrderId, supplier]);

  const { data: openOrders } = useQuery({
    queryKey: ['purchase-orders', 'open-for-purchase', supplier?.id],
    queryFn: () =>
      api
        .get<Paginated<PurchaseOrderListRow>>(`/purchase-orders${buildQuery({ pageSize: 100 })}`)
        .then((res) => res.items),
    enabled: !!supplier,
  });

  const orderOptions = React.useMemo(() => {
    if (!supplier) return [];
    return (openOrders ?? []).filter(
      (order) => order.supplierId === supplier.id && (order.status === 'ORDERED' || order.status === 'PARTIAL'),
    );
  }, [openOrders, supplier]);

  const totals = React.useMemo(
    () => computeTotals(lines, Number(discountAmount) || 0),
    [lines, discountAmount],
  );

  const addProduct = (product: Product) => {
    setLines((current) => {
      const existing = current.find((line) => line.product.id === product.id && !line.batchNo);
      if (existing && !product.trackBatches) {
        return current.map((line) =>
          line.key === existing.key ? { ...line, quantity: String((Number(line.quantity) || 0) + 1) } : line,
        );
      }
      return [...current, makeLine(product)];
    });
  };

  const updateLine = (key: string, patch: Partial<Line>) => {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  };

  const removeLine = (key: string) => {
    setLines((current) => current.filter((line) => line.key !== key));
  };

  const create = useMutation({
    mutationFn: (payload: unknown) => api.post<Single<Purchase>>('/purchases', payload),
    onSuccess: ({ item }) => {
      toast.success(`Purchase ${item.purchaseNumber} recorded`);
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      queryClient.invalidateQueries({ queryKey: ['supplier'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      navigate(`/purchases/${item.id}`, { replace: true });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not record the purchase'),
  });

  const submit = () => {
    setError(null);
    if (!supplier) {
      setError('Select the supplier for this purchase');
      return;
    }
    if (lines.length === 0) {
      setError('Add at least one product');
      return;
    }
    const parsed = purchaseCreateSchema.safeParse({
      supplierId: supplier.id,
      supplierInvoiceNo: supplierInvoiceNo || null,
      invoiceDate,
      purchaseOrderId: purchaseOrderId || null,
      discountAmount: Number(discountAmount) || 0,
      paidAmount: Number(paidAmount) || 0,
      notes: notes || null,
      items: lines.map((line) => ({
        productId: line.product.id,
        quantity: Number(line.quantity) || 0,
        freeQuantity: Number(line.freeQuantity) || 0,
        unitCost: Number(line.unitCost) || 0,
        discountAmount: Number(line.discountAmount) || 0,
        taxRate: Number(line.taxRate) || 0,
        batchNo: line.batchNo || null,
        expiryDate: line.expiryDate || null,
      })),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the purchase details');
      return;
    }
    create.mutate(parsed.data);
  };

  return (
    <div>
      <PageHeader
        title="New purchase"
        description="Receive stock, record the supplier bill and capture GST input credit."
        actions={
          <Button variant="outline" size="sm" onClick={() => navigate('/purchases')}>
            <ArrowLeft className="h-4 w-4" /> Purchases
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Supplier & bill</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Supplier" required>
                  <SupplierSelect value={supplier} onChange={(next) => {
                    setSupplier(next);
                    setPurchaseOrderId('');
                  }} />
                </Field>
                <Field label="Supplier bill no" hint="Duplicate bill numbers per supplier are blocked">
                  <Input
                    value={supplierInvoiceNo}
                    maxLength={80}
                    onChange={(event) => setSupplierInvoiceNo(event.target.value)}
                  />
                </Field>
                <Field label="Invoice date" required>
                  <Input type="date" value={invoiceDate} onChange={(event) => setInvoiceDate(event.target.value)} />
                </Field>
                <Field label="Link purchase order" hint="Optional — ties this receipt to an open order">
                  <Select
                    value={purchaseOrderId}
                    disabled={!supplier}
                    onChange={(event) => setPurchaseOrderId(event.target.value)}
                  >
                    <option value="">No purchase order</option>
                    {orderOptions.map((order) => (
                      <option key={order.id} value={order.id}>
                        {order.poNumber} · {formatINR(order.total)}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Items received</CardTitle>
              <Badge variant="outline">{lines.length} line{lines.length === 1 ? '' : 's'}</Badge>
            </CardHeader>
            <CardContent className="space-y-3">
              <ProductSelect onSelect={addProduct} placeholder="Add product by name, SKU or barcode…" />

              {lines.length === 0 ? (
                <p className="rounded-lg border border-dashed px-4 py-8 text-center text-xs text-muted-foreground">
                  Search above to add the products received on this bill.
                </p>
              ) : (
                <div className="space-y-3">
                  {lines.map((line, index) => {
                    const detail = totals.detailed[index];
                    return (
                      <div key={line.key} className="rounded-lg border bg-slate-50/50 p-3">
                        <div className="mb-2 flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{line.product.name}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {line.product.sku} · {line.product.unit.code}
                              {line.product.trackBatches ? ' · batch tracked' : ''}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="iconSm"
                            aria-label={`Remove ${line.product.name}`}
                            onClick={() => removeLine(line.key)}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-red-500" />
                          </Button>
                        </div>

                        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
                          <Field label="Qty" required>
                            <Input
                              type="number"
                              min="0.001"
                              step="0.001"
                              value={line.quantity}
                              className="text-right tabnum"
                              onChange={(event) => updateLine(line.key, { quantity: event.target.value })}
                            />
                          </Field>
                          <Field label="Free qty">
                            <Input
                              type="number"
                              min="0"
                              step="0.001"
                              value={line.freeQuantity}
                              className="text-right tabnum"
                              onChange={(event) => updateLine(line.key, { freeQuantity: event.target.value })}
                            />
                          </Field>
                          <Field label="Unit cost" required>
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={line.unitCost}
                              className="text-right tabnum"
                              onChange={(event) => updateLine(line.key, { unitCost: event.target.value })}
                            />
                          </Field>
                          <Field label="Discount">
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={line.discountAmount}
                              className="text-right tabnum"
                              onChange={(event) => updateLine(line.key, { discountAmount: event.target.value })}
                            />
                          </Field>
                          <Field label="GST %">
                            <Input
                              type="number"
                              min="0"
                              max="100"
                              step="0.01"
                              value={line.taxRate}
                              className="text-right tabnum"
                              onChange={(event) => updateLine(line.key, { taxRate: event.target.value })}
                            />
                          </Field>
                          <div className="flex flex-col justify-end pb-0.5 text-right">
                            <span className="label-base">Line total</span>
                            <span className="tabnum text-sm font-semibold">{formatINR(detail?.lineTotal ?? 0)}</span>
                            <span className="text-[10px] text-muted-foreground">
                              tax {formatINR(detail?.tax ?? 0)}
                            </span>
                          </div>
                        </div>

                        {line.product.trackBatches || line.product.trackExpiry ? (
                          <div className="mt-2 grid gap-2 sm:grid-cols-2">
                            {line.product.trackBatches ? (
                              <Field label="Batch no">
                                <Input
                                  value={line.batchNo}
                                  maxLength={60}
                                  onChange={(event) => updateLine(line.key, { batchNo: event.target.value })}
                                />
                              </Field>
                            ) : null}
                            {line.product.trackExpiry ? (
                              <Field label="Expiry date">
                                <Input
                                  type="date"
                                  value={line.expiryDate}
                                  onChange={(event) => updateLine(line.key, { expiryDate: event.target.value })}
                                />
                              </Field>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={notes}
                maxLength={1000}
                placeholder="Delivery note, transport details, quality remarks…"
                onChange={(event) => setNotes(event.target.value)}
              />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="lg:sticky lg:top-20">
            <CardHeader>
              <CardTitle>Bill summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="Taxable value" value={formatINR(totals.subtotal)} />
              <Row label="GST" value={formatINR(totals.taxAmount)} />
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">Bill discount</span>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={discountAmount}
                  className="h-8 w-28 text-right tabnum"
                  onChange={(event) => setDiscountAmount(event.target.value)}
                />
              </div>
              <div className="flex items-center justify-between border-t pt-2 text-base font-semibold">
                <span>Total</span>
                <span className="tabnum">{formatINR(totals.total)}</span>
              </div>
              <Field label="Paid now" hint="Leave zero to add the full amount to supplier dues">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={paidAmount}
                  className="text-right tabnum"
                  onChange={(event) => setPaidAmount(event.target.value)}
                />
              </Field>
              <Row label="Balance payable" value={formatINR(Math.max(0, totals.total - (Number(paidAmount) || 0)))} />

              {error ? (
                <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
              ) : null}

              <Button className="mt-2 w-full" loading={create.isPending} disabled={lines.length === 0} onClick={submit}>
                <Plus className="h-4 w-4" /> Record purchase
              </Button>
              <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Truck className="h-3.5 w-3.5" /> Stock is updated immediately on save.
              </p>
            </CardContent>
          </Card>

          {supplier ? (
            <Card>
              <CardContent className="space-y-1.5 text-xs text-muted-foreground">
                <p className="flex items-center gap-1.5 font-medium text-slate-700">
                  <Building2 className="h-3.5 w-3.5" /> {supplier.name}
                </p>
                <p>{supplier.mobile}{supplier.gstin ? ` · ${supplier.gstin}` : ''}</p>
                <p>Payable before this bill: {formatINR(supplier.outstanding)}</p>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="tabnum text-sm">{value}</span>
    </div>
  );
}
