import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Banknote,
  Barcode,
  CheckCircle2,
  CreditCard,
  Loader2,
  Minus,
  PauseCircle,
  Plus,
  Printer,
  Receipt,
  RefreshCw,
  Search,
  ShoppingCart,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { computeInvoice, formatQty, round2, type DiscountInput } from '@ps/shared';
import { api, ApiError, buildQuery, openDocument } from '@/lib/api';
import { formatINR } from '@/lib/shared';
import { formatDate } from '@/lib/utils';
import { useDebouncedValue } from '@/lib/hooks';
import { useAuth } from '@/contexts/auth';
import type {
  CreateInvoiceResponse,
  Customer,
  HeldBill,
  Invoice,
  Paginated,
  Product,
  ProductLookup,
} from '@/lib/types';
import { PageHeader } from '@/components/shared/page-header';
import { CustomerSelect, lookupProduct } from '@/components/shared/entity-select';
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
  ConfirmDialog,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { PermissionGate } from '@/components/shared/permission-gate';
import { cn } from '@/lib/utils';

// ── Cart model ───────────────────────────────────────────────────────
interface CartLine {
  key: string;
  product: ProductLookup;
  quantity: number;
  unitPrice: number;
  discount: DiscountInput | null;
}

interface PaymentLine {
  method: 'CASH' | 'UPI' | 'CARD' | 'BANK_TRANSFER' | 'CHEQUE' | 'OTHER';
  amount: number;
  reference: string;
}

interface HeldPayload {
  lines: CartLine[];
  customer: Customer | null;
  billDiscount: DiscountInput | null;
  redeemPoints: number;
  notes: string;
  roundToRupee: boolean;
}

const PAYMENT_METHODS: PaymentLine['method'][] = ['CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'CHEQUE', 'OTHER'];

function toLookup(product: Product): ProductLookup {
  return {
    id: product.id,
    name: product.name,
    sku: product.sku,
    barcode: product.barcode,
    sellingPrice: product.sellingPrice,
    mrp: product.mrp,
    priceIncludesTax: product.priceIncludesTax,
    taxRate: product.taxRate?.rate ?? 0,
    taxRateId: product.taxRate?.id ?? null,
    unit: product.unit,
    stock: product.stock,
    trackBatches: product.trackBatches,
    imageUrl: product.imageUrl,
    hsnCode: product.hsnCode,
  };
}

let lineCounter = 0;
const nextLineKey = () => `line_${Date.now()}_${lineCounter++}`;

export function PosPage() {
  const { can, user } = useAuth();
  const queryClient = useQueryClient();

  const [lines, setLines] = React.useState<CartLine[]>([]);
  const [customer, setCustomer] = React.useState<Customer | null>(null);
  const [billDiscount, setBillDiscount] = React.useState<DiscountInput>({ type: 'percent', value: 0 });
  const [redeemPoints, setRedeemPoints] = React.useState(0);
  const [notes, setNotes] = React.useState('');
  const [roundToRupee, setRoundToRupee] = React.useState(true);
  const [query, setQuery] = React.useState('');
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [lookingUp, setLookingUp] = React.useState(false);
  const [customerDialog, setCustomerDialog] = React.useState(false);
  const [paymentOpen, setPaymentOpen] = React.useState(false);
  const [payments, setPayments] = React.useState<PaymentLine[]>([]);
  const [heldOpen, setHeldOpen] = React.useState(false);
  const [holdDialog, setHoldDialog] = React.useState(false);
  const [holdName, setHoldName] = React.useState('');
  const [heldBillId, setHeldBillId] = React.useState<string | null>(null);
  const [receipt, setReceipt] = React.useState<{ invoice: Invoice; changeDue: number } | null>(null);
  const [deleteHeld, setDeleteHeld] = React.useState<HeldBill | null>(null);
  const clientRef = React.useRef<string>(crypto.randomUUID());
  const searchRef = React.useRef<HTMLInputElement>(null);

  const debouncedQuery = useDebouncedValue(query, 220);

  const { data: searchResults, isFetching: searching } = useQuery({
    queryKey: ['pos-search', debouncedQuery],
    queryFn: () =>
      api.get<Paginated<Product>>(
        `/products${buildQuery({ search: debouncedQuery, pageSize: 8, status: 'ACTIVE' })}`,
      ),
    enabled: searchOpen && debouncedQuery.trim().length > 0,
  });

  const heldQuery = useQuery({
    queryKey: ['held-bills'],
    queryFn: () => api.get<Paginated<HeldBill>>('/held-bills?pageSize=50'),
    enabled: heldOpen,
  });

  const addProduct = React.useCallback((product: ProductLookup, quantity = 1) => {
    setLines((current) => {
      const existing = current.find((line) => line.product.id === product.id);
      if (existing) {
        return current.map((line) =>
          line.product.id === product.id
            ? { ...line, quantity: round2(line.quantity + quantity) }
            : line,
        );
      }
      return [
        ...current,
        {
          key: nextLineKey(),
          product,
          quantity,
          unitPrice: product.sellingPrice,
          discount: null,
        },
      ];
    });
    setQuery('');
    setSearchOpen(false);
    searchRef.current?.focus();
  }, []);

  const interState = !!customer?.gstin && customer.gstin.slice(0, 2) !== user?.store.stateCode;

  const calculation = React.useMemo(() => {
    if (lines.length === 0) return null;
    try {
      return computeInvoice(
        lines.map((line) => ({
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          priceIncludesTax: line.product.priceIncludesTax,
          taxRate: line.product.taxRate,
          discount: line.discount,
        })),
        {
          interState,
          billDiscount: billDiscount.value > 0 ? billDiscount : null,
          roundToRupee,
        },
      );
    } catch {
      return null;
    }
  }, [lines, interState, billDiscount, roundToRupee]);

  const pointValue = user?.store.loyaltyPointValue ?? 1;
  const loyaltyEnabled = user?.store.loyaltyEnabled ?? false;
  const maxRedeemable = customer && loyaltyEnabled ? Math.min(customer.loyaltyPoints, Math.floor((calculation?.grandTotal ?? 0) / Math.max(pointValue, 0.01))) : 0;
  const loyaltyDiscount = Math.min(
    round2(Math.max(0, redeemPoints) * pointValue),
    calculation?.grandTotal ?? 0,
  );
  const payable = Math.max(0, round2((calculation?.grandTotal ?? 0) - loyaltyDiscount));
  const tendered = round2(payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0));
  const outstanding = Math.max(0, round2(payable - tendered));
  const changeDue = Math.max(0, round2(tendered - payable));

  const updateLine = (key: string, patch: Partial<CartLine>) => {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  };

  const removeLine = (key: string) => setLines((current) => current.filter((line) => line.key !== key));

  const resetBill = React.useCallback(() => {
    setLines([]);
    setCustomer(null);
    setBillDiscount({ type: 'percent', value: 0 });
    setRedeemPoints(0);
    setNotes('');
    setRoundToRupee(true);
    setHeldBillId(null);
    clientRef.current = crypto.randomUUID();
    searchRef.current?.focus();
  }, []);

  // ── Product search / barcode ───────────────────────────────────────
  const handleSearchKey = async (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setSearchOpen(false);
      return;
    }
    if (event.key !== 'Enter') return;
    const code = query.trim();
    if (!code) return;
    if (searchResults && searchResults.items.length === 1) {
      addProduct(toLookup(searchResults.items[0]!));
      return;
    }
    setLookingUp(true);
    try {
      const found = await lookupProduct(code);
      if (found) {
        addProduct(found);
      } else if (searchResults && searchResults.items.length > 1) {
        setSearchOpen(true);
      } else {
        toast.error('No product matches that barcode or SKU');
      }
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Lookup failed');
    } finally {
      setLookingUp(false);
    }
  };

  // ── Keyboard shortcuts ─────────────────────────────────────────────
  React.useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'F2') {
        event.preventDefault();
        searchRef.current?.focus();
      } else if (event.key === 'F4') {
        event.preventDefault();
        document.getElementById('pos-customer')?.focus();
      } else if (event.key === 'F8') {
        event.preventDefault();
        if (lines.length > 0) setHoldDialog(true);
      } else if (event.key === 'F9') {
        event.preventDefault();
        if (lines.length > 0 && calculation) openPayment();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  // ── Customer creation ──────────────────────────────────────────────
  const [newCustomer, setNewCustomer] = React.useState({ name: '', mobile: '', creditLimit: '' });
  const [customerError, setCustomerError] = React.useState<string | null>(null);
  const createCustomer = useMutation({
    mutationFn: () =>
      api.post<{ item: Customer }>('/customers', {
        name: newCustomer.name.trim(),
        mobile: newCustomer.mobile.trim(),
        creditLimit: Number(newCustomer.creditLimit) || 0,
        creditDays: 0,
        isActive: true,
      }),
    onSuccess: ({ item }) => {
      setCustomer(item);
      setCustomerDialog(false);
      setNewCustomer({ name: '', mobile: '', creditLimit: '' });
      toast.success(`${item.name} added`);
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
    onError: (error) =>
      setCustomerError(error instanceof ApiError ? error.message : 'Could not create customer'),
  });

  // ── Checkout ───────────────────────────────────────────────────────
  function openPayment() {
    setPayments([{ method: 'CASH', amount: payable, reference: '' }]);
    setPaymentOpen(true);
  }

  const checkout = useMutation({
    mutationFn: () =>
      api.post<CreateInvoiceResponse>('/invoices', {
        customerId: customer?.id ?? null,
        customerName: customer?.name ?? null,
        customerMobile: customer?.mobile ?? null,
        placeOfSupplyState: customer?.gstin ? customer.gstin.slice(0, 2) : user?.store.stateCode,
        items: lines.map((line) => ({
          productId: line.product.id,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          discount: line.discount && line.discount.value > 0 ? line.discount : null,
        })),
        billDiscount: billDiscount.value > 0 ? billDiscount : null,
        payments: payments
          .filter((p) => Number(p.amount) > 0)
          .map((p) => ({ method: p.method, amount: Number(p.amount), reference: p.reference || null })),
        redeemPoints,
        notes: notes || null,
        clientRef: clientRef.current,
        roundToRupee,
      }),
    onSuccess: (result) => {
      setPaymentOpen(false);
      setReceipt({ invoice: result.item, changeDue: result.changeDue });
      resetBill();
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['held-bills'] });
      toast.success(`Invoice ${result.item.invoiceNo} completed`);
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Could not complete the sale'),
  });

  // ── Hold / resume ──────────────────────────────────────────────────
  const holdBill = useMutation({
    mutationFn: () => {
      const payload: HeldPayload = {
        lines,
        customer,
        billDiscount: billDiscount.value > 0 ? billDiscount : null,
        redeemPoints,
        notes,
        roundToRupee,
      };
      const body = {
        name: holdName.trim() || `Bill ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`,
        customerId: customer?.id ?? null,
        payload,
        subtotal: calculation?.grandTotal ?? 0,
      };
      return heldBillId
        ? api.patch<{ item: HeldBill }>(`/held-bills/${heldBillId}`, body)
        : api.post<{ item: HeldBill }>('/held-bills', body);
    },
    onSuccess: () => {
      toast.success('Bill held — resume it from Held bills');
      setHoldDialog(false);
      setHoldName('');
      resetBill();
      queryClient.invalidateQueries({ queryKey: ['held-bills'] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Could not hold the bill'),
  });

  const deleteHeldMutation = useMutation({
    mutationFn: (id: string) => api.del(`/held-bills/${id}`),
    onSuccess: () => {
      setDeleteHeld(null);
      queryClient.invalidateQueries({ queryKey: ['held-bills'] });
      toast.success('Held bill discarded');
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Could not discard the bill'),
  });

  const resume = (bill: HeldBill) => {
    const payload = bill.payload as unknown as HeldPayload;
    if (!payload || !Array.isArray(payload.lines)) {
      toast.error('This held bill is not compatible with this terminal');
      return;
    }
    setLines(payload.lines);
    setCustomer(payload.customer ?? null);
    setBillDiscount(payload.billDiscount ?? { type: 'percent', value: 0 });
    setRedeemPoints(payload.redeemPoints ?? 0);
    setNotes(payload.notes ?? '');
    setRoundToRupee(payload.roundToRupee ?? true);
    setHeldBillId(bill.id);
    setHoldName(bill.name);
    setHeldOpen(false);
    toast.success(`Resumed ${bill.name}`);
  };

  const isCreditSale = outstanding > 0;
  const canCredit = can('pos.credit');
  const submitDisabled =
    checkout.isPending ||
    lines.length === 0 ||
    !calculation ||
    (isCreditSale && (!customer || !canCredit));

  return (
    <div>
      <PageHeader
        title="Point of sale"
        description="Scan, search and bill in seconds. Stock and GST post automatically."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setHeldOpen(true)}>
              <PauseCircle className="h-4 w-4" /> Held bills
              {heldQuery.data?.meta.total ? <Badge variant="secondary">{heldQuery.data.meta.total}</Badge> : null}
            </Button>
            <Button variant="outline" size="sm" disabled={lines.length === 0} onClick={() => setHoldDialog(true)}>
              Hold <span className="kbd">F8</span>
            </Button>
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_390px]">
        <div className="space-y-3">
          {/* Scanner / search */}
          <Card>
            <CardContent className="space-y-3 p-4">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  ref={searchRef}
                  autoFocus
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setSearchOpen(true);
                  }}
                  onFocus={() => setSearchOpen(true)}
                  onKeyDown={handleSearchKey}
                  placeholder="Scan barcode or search product by name / SKU…"
                  className="input-base h-11 pl-9 pr-24"
                  aria-label="Scan or search products"
                />
                <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
                  {lookingUp || searching ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : null}
                  <span className="kbd">F2</span>
                </div>

                {searchOpen && debouncedQuery.trim().length > 0 ? (
                  <div className="absolute z-30 mt-1 max-h-80 w-full overflow-auto rounded-lg border bg-popover p-1 shadow-pop">
                    {searching && !searchResults ? (
                      <p className="px-3 py-6 text-center text-xs text-muted-foreground">Searching…</p>
                    ) : (searchResults?.items.length ?? 0) === 0 ? (
                      <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                        No products match “{debouncedQuery}”
                      </p>
                    ) : (
                      searchResults?.items.map((product) => (
                        <button
                          key={product.id}
                          type="button"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => addProduct(toLookup(product))}
                          className="flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-2 text-left hover:bg-secondary"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium">{product.name}</span>
                            <span className="block text-[11px] text-muted-foreground">
                              {product.sku} · GST {product.taxRate?.rate ?? 0}% · stock {formatQty(product.stock)}
                            </span>
                          </span>
                          <span className="shrink-0 text-sm font-medium tabnum">{formatINR(product.sellingPrice)}</span>
                        </button>
                      ))
                    )}
                  </div>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="min-w-[220px] flex-1" id="pos-customer">
                  <CustomerSelect value={customer} onChange={setCustomer} />
                </div>
                <PermissionGate permission="customer.create">
                  <Button variant="outline" size="sm" onClick={() => setCustomerDialog(true)}>
                    <UserPlus className="h-4 w-4" /> New customer
                  </Button>
                </PermissionGate>
                {customer ? (
                  <Badge variant={customer.outstanding > 0 ? 'warning' : 'success'}>
                    {customer.loyaltyPoints} pts · {formatINR(customer.availableCredit)} credit
                  </Badge>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1"><Barcode className="h-3.5 w-3.5" /> Scan or type, then Enter</span>
                <span><span className="kbd">F9</span> Charge</span>
                <span><span className="kbd">F4</span> Customer</span>
                <span><span className="kbd">F8</span> Hold</span>
              </div>
            </CardContent>
          </Card>

          {/* Cart */}
          <Card className="overflow-hidden">
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <ShoppingCart className="h-4 w-4 text-primary" /> Current bill
                {lines.length > 0 ? <Badge variant="secondary">{lines.length} item{lines.length === 1 ? '' : 's'}</Badge> : null}
              </CardTitle>
              {lines.length > 0 ? (
                <Button variant="ghost" size="sm" onClick={() => setLines([])}>
                  <Trash2 className="h-3.5 w-3.5" /> Clear
                </Button>
              ) : null}
            </CardHeader>
            <CardContent className="p-0">
              {lines.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                    <ShoppingCart className="h-6 w-6" />
                  </span>
                  <p className="text-sm font-medium text-slate-700">The bill is empty</p>
                  <p className="max-w-xs text-xs text-muted-foreground">
                    Scan a barcode or search for a product to start billing. Press{' '}
                    <span className="kbd">F2</span> to jump back to search.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="table-header">
                      <tr>
                        <th className="px-3 py-2 text-left">Item</th>
                        <th className="w-[104px] px-2 py-2 text-right">Qty</th>
                        <th className="w-[110px] px-2 py-2 text-right">Rate</th>
                        {can('pos.discount') ? <th className="w-[132px] px-2 py-2 text-right">Disc.</th> : null}
                        <th className="w-[64px] px-2 py-2 text-right">GST</th>
                        <th className="w-[104px] px-3 py-2 text-right">Total</th>
                        <th className="w-9 px-1" />
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((line, index) => {
                        const computed = calculation?.lines[index];
                        const short = line.quantity > line.product.stock;
                        return (
                          <tr key={line.key} className="border-b last:border-0">
                            <td className="px-3 py-2">
                              <p className="max-w-[240px] truncate font-medium">{line.product.name}</p>
                              <p className="text-[11px] text-muted-foreground">
                                {line.product.sku} · {line.product.unit.code}
                                {short ? <span className="ml-1 text-amber-600">· stock {formatQty(line.product.stock)}</span> : null}
                              </p>
                            </td>
                            <td className="px-2 py-2">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  type="button"
                                  className="flex h-6 w-6 items-center justify-center rounded border text-muted-foreground hover:bg-secondary"
                                  onClick={() => updateLine(line.key, { quantity: Math.max(0.001, round2(line.quantity - 1)) })}
                                  aria-label="Decrease quantity"
                                >
                                  <Minus className="h-3 w-3" />
                                </button>
                                <Input
                                  type="number"
                                  min="0.001"
                                  step="any"
                                  value={line.quantity}
                                  onChange={(event) => updateLine(line.key, { quantity: Number(event.target.value) })}
                                  className="h-7 w-16 px-1 text-right tabnum"
                                  aria-label={`Quantity for ${line.product.name}`}
                                />
                                <button
                                  type="button"
                                  className="flex h-6 w-6 items-center justify-center rounded border text-muted-foreground hover:bg-secondary"
                                  onClick={() => updateLine(line.key, { quantity: round2(line.quantity + 1) })}
                                  aria-label="Increase quantity"
                                >
                                  <Plus className="h-3 w-3" />
                                </button>
                              </div>
                            </td>
                            <td className="px-2 py-2">
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={line.unitPrice}
                                onChange={(event) => updateLine(line.key, { unitPrice: Number(event.target.value) })}
                                className="h-7 w-[96px] px-1 text-right tabnum"
                                aria-label={`Unit price for ${line.product.name}`}
                              />
                            </td>
                            {can('pos.discount') ? (
                              <td className="px-2 py-2">
                                <div className="flex items-center justify-end gap-1">
                                  <Select
                                    value={line.discount?.type ?? 'percent'}
                                    onChange={(event) =>
                                      updateLine(line.key, {
                                        discount: {
                                          type: event.target.value as 'percent' | 'flat',
                                          value: line.discount?.value ?? 0,
                                        },
                                      })
                                    }
                                    className="h-7 w-[42px] px-1 text-[10px]"
                                    aria-label="Discount type"
                                  >
                                    <option value="percent">%</option>
                                    <option value="flat">₹</option>
                                  </Select>
                                  <Input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={line.discount?.value ?? ''}
                                    placeholder="0"
                                    onChange={(event) =>
                                      updateLine(line.key, {
                                        discount: {
                                          type: line.discount?.type ?? 'percent',
                                          value: Number(event.target.value) || 0,
                                        },
                                      })
                                    }
                                    className="h-7 w-[64px] px-1 text-right tabnum"
                                    aria-label={`Discount for ${line.product.name}`}
                                  />
                                </div>
                              </td>
                            ) : null}
                            <td className="px-2 py-2 text-right text-xs text-muted-foreground tabnum">{line.product.taxRate}%</td>
                            <td className="px-3 py-2 text-right font-medium tabnum">
                              {computed ? formatINR(computed.lineTotal) : '—'}
                            </td>
                            <td className="px-1 py-2">
                              <button
                                type="button"
                                onClick={() => removeLine(line.key)}
                                className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-red-50 hover:text-red-600"
                                aria-label={`Remove ${line.product.name}`}
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Totals / tender */}
        <div className="space-y-3">
          <Card className="sticky top-16">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Bill summary</span>
                {interState ? <Badge variant="info">IGST · inter-state</Badge> : <Badge variant="outline">CGST + SGST</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="tabnum">{formatINR(calculation?.subtotal ?? 0)}</span>
                </div>
                {(calculation?.itemDiscount ?? 0) > 0 ? (
                  <div className="flex justify-between text-emerald-700">
                    <span>Item discounts</span>
                    <span className="tabnum">− {formatINR(calculation?.itemDiscount ?? 0)}</span>
                  </div>
                ) : null}
                {(calculation?.billDiscount ?? 0) > 0 ? (
                  <div className="flex justify-between text-emerald-700">
                    <span>Bill discount</span>
                    <span className="tabnum">− {formatINR(calculation?.billDiscount ?? 0)}</span>
                  </div>
                ) : null}
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Taxable value</span>
                  <span className="tabnum">{formatINR(calculation?.taxableAmount ?? 0)}</span>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>GST</span>
                  <span className="tabnum">{formatINR(calculation?.taxAmount ?? 0)}</span>
                </div>
                {(calculation?.roundOff ?? 0) !== 0 ? (
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Round off</span>
                    <span className="tabnum">{formatINR(calculation?.roundOff ?? 0)}</span>
                  </div>
                ) : null}
                {loyaltyDiscount > 0 ? (
                  <div className="flex justify-between text-emerald-700">
                    <span>Loyalty redemption</span>
                    <span className="tabnum">− {formatINR(loyaltyDiscount)}</span>
                  </div>
                ) : null}
              </div>

              <div className="flex items-end justify-between border-t pt-3">
                <span className="text-sm font-medium">Payable</span>
                <span className="text-2xl font-semibold tabnum text-slate-900">{formatINR(payable)}</span>
              </div>

              {can('pos.discount') ? (
                <div className="grid grid-cols-[1fr_92px] gap-2">
                  <Field label="Bill discount">
                    <div className="flex gap-1.5">
                      <Select
                        value={billDiscount.type}
                        onChange={(event) =>
                          setBillDiscount((current) => ({
                            ...current,
                            type: event.target.value as 'percent' | 'flat',
                          }))
                        }
                        className="w-[76px]"
                      >
                        <option value="percent">Percent</option>
                        <option value="flat">Flat ₹</option>
                      </Select>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={billDiscount.value || ''}
                        placeholder="0"
                        onChange={(event) =>
                          setBillDiscount((current) => ({ ...current, value: Number(event.target.value) || 0 }))
                        }
                      />
                    </div>
                  </Field>
                  <Field label="Round">
                    <Select value={roundToRupee ? 'yes' : 'no'} onChange={(event) => setRoundToRupee(event.target.value === 'yes')}>
                      <option value="yes">To ₹1</option>
                      <option value="no">Exact</option>
                    </Select>
                  </Field>
                </div>
              ) : null}

              {customer && loyaltyEnabled && customer.loyaltyPoints > 0 ? (
                <Field
                  label={`Redeem loyalty points (${customer.loyaltyPoints} available)`}
                  hint={`1 point = ${formatINR(pointValue)} · up to ${maxRedeemable} points on this bill`}
                >
                  <Input
                    type="number"
                    min="0"
                    max={maxRedeemable}
                    step="1"
                    value={redeemPoints || ''}
                    placeholder="0"
                    onChange={(event) =>
                      setRedeemPoints(Math.max(0, Math.min(maxRedeemable, Math.floor(Number(event.target.value) || 0))))
                    }
                  />
                </Field>
              ) : null}

              <Field label="Bill note (optional)">
                <Textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Delivery instruction, reference…"
                  className="min-h-[58px]"
                />
              </Field>

              {!calculation && lines.length > 0 ? (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-800">
                  Check quantities and prices — the bill cannot be calculated yet.
                </p>
              ) : null}

              <Button
                size="lg"
                className="w-full"
                disabled={lines.length === 0 || !calculation}
                onClick={openPayment}
              >
                <CreditCard className="h-4 w-4" /> Charge {formatINR(payable)} <span className="kbd">F9</span>
              </Button>
              <p className="text-center text-[11px] text-muted-foreground">
                {heldBillId ? 'Editing a held bill — completing it removes it from hold.' : 'Payments, split tender and credit are handled at checkout.'}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Payment dialog */}
      <Dialog open={paymentOpen} onOpenChange={(open) => !checkout.isPending && setPaymentOpen(open)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Take payment</DialogTitle>
            <DialogDescription>
              Payable {formatINR(payable)} · split across as many tenders as you need.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <div className="rounded-lg border bg-slate-50 px-3 py-2.5">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Tendered</span>
                <span className="font-medium tabnum">{formatINR(tendered)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Balance</span>
                <span className={cn('font-medium tabnum', outstanding > 0 ? 'text-amber-600' : 'text-emerald-700')}>
                  {formatINR(outstanding)}
                </span>
              </div>
              {changeDue > 0 ? (
                <div className="mt-1 flex justify-between border-t pt-1 text-sm font-semibold text-emerald-700">
                  <span>Change due</span>
                  <span className="tabnum">{formatINR(changeDue)}</span>
                </div>
              ) : null}
            </div>

            <div className="space-y-2">
              {payments.map((payment, index) => (
                <div key={index} className="grid grid-cols-[1fr_116px_28px] gap-2">
                  <div className="space-y-1.5">
                    <Select
                      value={payment.method}
                      onChange={(event) =>
                        setPayments((current) =>
                          current.map((p, i) => (i === index ? { ...p, method: event.target.value as PaymentLine['method'] } : p)),
                        )
                      }
                      aria-label={`Payment method ${index + 1}`}
                    >
                      {PAYMENT_METHODS.map((method) => (
                        <option key={method} value={method}>
                          {method.replace(/_/g, ' ')}
                        </option>
                      ))}
                    </Select>
                    <Input
                      value={payment.reference}
                      onChange={(event) =>
                        setPayments((current) =>
                          current.map((p, i) => (i === index ? { ...p, reference: event.target.value } : p)),
                        )
                      }
                      placeholder="Reference (UPI ID, card last 4…)"
                      className="h-7 text-xs"
                    />
                  </div>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={payment.amount}
                    onChange={(event) =>
                      setPayments((current) =>
                        current.map((p, i) => (i === index ? { ...p, amount: Number(event.target.value) || 0 } : p)),
                      )
                    }
                    className="text-right tabnum"
                    aria-label={`Amount for payment ${index + 1}`}
                  />
                  <Button
                    variant="ghost"
                    size="iconSm"
                    onClick={() => setPayments((current) => current.filter((_, i) => i !== index))}
                    disabled={payments.length === 1}
                    aria-label="Remove payment line"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPayments((current) => [...current, { method: 'UPI', amount: Math.max(0, outstanding), reference: '' }])}
              >
                <Plus className="h-3.5 w-3.5" /> Split tender
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPayments([{ method: 'CASH', amount: payable, reference: '' }])}
              >
                <Banknote className="h-3.5 w-3.5" /> Exact cash
              </Button>
            </div>

            {outstanding > 0 ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                {!customer
                  ? 'A customer is required to leave a balance due.'
                  : !canCredit
                    ? 'You do not have permission to sell on credit. Collect the full amount.'
                    : `${formatINR(outstanding)} will be added to ${customer.name}'s credit ledger. Available credit ${formatINR(customer.availableCredit)}.`}
              </div>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentOpen(false)} disabled={checkout.isPending}>
              Back to bill
            </Button>
            <Button onClick={() => checkout.mutate()} loading={checkout.isPending} disabled={submitDisabled}>
              <CheckCircle2 className="h-4 w-4" /> Complete sale
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Receipt dialog */}
      <Dialog open={!!receipt} onOpenChange={(open) => !open && setReceipt(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Sale completed</DialogTitle>
            <DialogDescription>{receipt?.invoice.invoiceNo} · {formatINR(receipt?.invoice.grandTotal ?? 0)}</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="flex flex-col items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-5 text-center">
              <CheckCircle2 className="h-9 w-9 text-emerald-600" />
              <p className="text-sm font-medium text-emerald-900">Payment recorded</p>
              <p className="text-xs text-emerald-700">
                {receipt?.invoice.paymentStatus === 'PAID'
                  ? 'Fully paid'
                  : `${formatINR(receipt?.invoice.balanceDue ?? 0)} left on credit`}
              </p>
              {(receipt?.changeDue ?? 0) > 0 ? (
                <p className="mt-1 text-lg font-semibold text-emerald-900 tabnum">
                  Return change {formatINR(receipt?.changeDue ?? 0)}
                </p>
              ) : null}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => receipt && openDocument(`/invoices/${receipt.invoice.id}/pdf`, 'open')}>
                <Printer className="h-4 w-4" /> A4 invoice
              </Button>
              <Button variant="outline" onClick={() => receipt && openDocument(`/invoices/${receipt.invoice.id}/thermal`, 'open')}>
                <Receipt className="h-4 w-4" /> Thermal slip
              </Button>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button className="w-full" onClick={() => setReceipt(null)}>
              Start next sale
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New customer */}
      <Dialog open={customerDialog} onOpenChange={(open) => !createCustomer.isPending && setCustomerDialog(open)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Register customer</DialogTitle>
            <DialogDescription>Customers unlock credit, loyalty points and purchase history.</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <Field label="Name" required>
              <Input
                value={newCustomer.name}
                onChange={(event) => setNewCustomer((current) => ({ ...current, name: event.target.value }))}
                placeholder="Customer name"
                autoFocus
              />
            </Field>
            <Field label="Mobile" required hint="10-digit Indian mobile number">
              <Input
                value={newCustomer.mobile}
                onChange={(event) => setNewCustomer((current) => ({ ...current, mobile: event.target.value }))}
                placeholder="9876543210"
                inputMode="numeric"
              />
            </Field>
            <Field label="Credit limit" hint="Leave at 0 for cash-only customers">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={newCustomer.creditLimit}
                onChange={(event) => setNewCustomer((current) => ({ ...current, creditLimit: event.target.value }))}
                placeholder="0.00"
              />
            </Field>
            {customerError ? (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{customerError}</p>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCustomerDialog(false)} disabled={createCustomer.isPending}>
              Cancel
            </Button>
            <Button
              loading={createCustomer.isPending}
              disabled={!newCustomer.name.trim() || !/^[6-9][0-9]{9}$/.test(newCustomer.mobile.trim())}
              onClick={() => {
                setCustomerError(null);
                createCustomer.mutate();
              }}
            >
              Add customer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Held bills */}
      <Dialog open={heldOpen} onOpenChange={setHeldOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Held bills</DialogTitle>
            <DialogDescription>Resume a parked bill or discard it. Held bills survive a page refresh.</DialogDescription>
          </DialogHeader>
          <DialogBody className="p-0">
            <div className="flex items-center justify-end border-b px-4 py-2">
              <Button variant="ghost" size="sm" onClick={() => heldQuery.refetch()} loading={heldQuery.isFetching}>
                <RefreshCw className="h-3.5 w-3.5" /> Refresh
              </Button>
            </div>
            {heldQuery.isLoading ? (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">Loading held bills…</p>
            ) : (heldQuery.data?.items.length ?? 0) === 0 ? (
              <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
                <PauseCircle className="h-8 w-8 text-slate-300" />
                <p className="text-sm font-medium text-slate-600">No held bills</p>
                <p className="text-xs text-muted-foreground">Use Hold (F8) to park a bill while a customer fetches something.</p>
              </div>
            ) : (
              <div className="max-h-[52vh] divide-y overflow-auto">
                {heldQuery.data?.items.map((bill) => (
                  <div key={bill.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{bill.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {bill.customer ? `${bill.customer.name} · ${bill.customer.mobile}` : 'Walk-in'} ·{' '}
                        {formatDate(bill.createdAt, true)} · {formatINR(bill.subtotal)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Button size="sm" variant="outline" onClick={() => resume(bill)}>
                        Resume
                      </Button>
                      <Button
                        size="iconSm"
                        variant="ghost"
                        onClick={() => setDeleteHeld(bill)}
                        aria-label={`Discard ${bill.name}`}
                        className="text-muted-foreground hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </DialogBody>
        </DialogContent>
      </Dialog>

      {/* Hold dialog */}
      <Dialog open={holdDialog} onOpenChange={(open) => !holdBill.isPending && setHoldDialog(open)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{heldBillId ? 'Update held bill' : 'Hold this bill'}</DialogTitle>
            <DialogDescription>Give it a recognisable name, then start a fresh bill.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Field label="Bill name" required>
              <Input
                value={holdName}
                onChange={(event) => setHoldName(event.target.value)}
                placeholder="e.g. Sharma ji — rice order"
                autoFocus
              />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHoldDialog(false)} disabled={holdBill.isPending}>
              Cancel
            </Button>
            <Button onClick={() => holdBill.mutate()} loading={holdBill.isPending} disabled={!holdName.trim()}>
              <PauseCircle className="h-4 w-4" /> Hold bill
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteHeld}
        onOpenChange={(open) => !open && setDeleteHeld(null)}
        title="Discard held bill?"
        description={deleteHeld ? `“${deleteHeld.name}” will be permanently removed.` : undefined}
        confirmLabel="Discard"
        loading={deleteHeldMutation.isPending}
        onConfirm={() => deleteHeld && deleteHeldMutation.mutate(deleteHeld.id)}
      />
    </div>
  );
}
