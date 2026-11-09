import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, Building2, FileText, Percent, RotateCcw, Save, Sparkles, Warehouse } from 'lucide-react';
import { toast } from 'sonner';
import { storeSchema } from '@ps/shared';
import { api, ApiError } from '@/lib/api';
import { formatINR } from '@/lib/shared';
import { useAuth } from '@/contexts/auth';
import type { Single, Store } from '@/lib/types';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/controls';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const INDIAN_STATES: { code: string; name: string }[] = [
  { code: '01', name: 'Jammu & Kashmir' },
  { code: '02', name: 'Himachal Pradesh' },
  { code: '03', name: 'Punjab' },
  { code: '04', name: 'Chandigarh' },
  { code: '05', name: 'Uttarakhand' },
  { code: '06', name: 'Haryana' },
  { code: '07', name: 'Delhi' },
  { code: '08', name: 'Rajasthan' },
  { code: '09', name: 'Uttar Pradesh' },
  { code: '10', name: 'Bihar' },
  { code: '11', name: 'Sikkim' },
  { code: '12', name: 'Arunachal Pradesh' },
  { code: '13', name: 'Nagaland' },
  { code: '14', name: 'Manipur' },
  { code: '15', name: 'Mizoram' },
  { code: '16', name: 'Tripura' },
  { code: '17', name: 'Meghalaya' },
  { code: '18', name: 'Assam' },
  { code: '19', name: 'West Bengal' },
  { code: '20', name: 'Jharkhand' },
  { code: '21', name: 'Odisha' },
  { code: '22', name: 'Chhattisgarh' },
  { code: '23', name: 'Madhya Pradesh' },
  { code: '24', name: 'Gujarat' },
  { code: '26', name: 'Dadra & Nagar Haveli and Daman & Diu' },
  { code: '27', name: 'Maharashtra' },
  { code: '29', name: 'Karnataka' },
  { code: '30', name: 'Goa' },
  { code: '31', name: 'Lakshadweep' },
  { code: '32', name: 'Kerala' },
  { code: '33', name: 'Tamil Nadu' },
  { code: '34', name: 'Puducherry' },
  { code: '35', name: 'Andaman & Nicobar Islands' },
  { code: '36', name: 'Telangana' },
  { code: '37', name: 'Andhra Pradesh' },
  { code: '38', name: 'Ladakh' },
];

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

interface FormState {
  name: string;
  legalName: string;
  gstin: string;
  stateCode: string;
  address: string;
  city: string;
  pincode: string;
  phone: string;
  email: string;
  logoUrl: string;
  invoicePrefix: string;
  invoiceTerms: string;
  billFooter: string;
  taxEnabled: boolean;
  allowNegativeStock: boolean;
  loyaltyEnabled: boolean;
  loyaltyEarnPerAmount: string;
  loyaltyPointValue: string;
  financialYearStartMonth: string;
}

function toForm(store: Store): FormState {
  return {
    name: store.name,
    legalName: store.legalName ?? '',
    gstin: store.gstin ?? '',
    stateCode: store.stateCode,
    address: store.address ?? '',
    city: store.city ?? '',
    pincode: store.pincode ?? '',
    phone: store.phone ?? '',
    email: store.email ?? '',
    logoUrl: store.logoUrl ?? '',
    invoicePrefix: store.invoicePrefix,
    invoiceTerms: store.invoiceTerms ?? '',
    billFooter: store.billFooter ?? '',
    taxEnabled: store.taxEnabled,
    allowNegativeStock: store.allowNegativeStock,
    loyaltyEnabled: store.loyaltyEnabled,
    loyaltyEarnPerAmount: String(store.loyaltyEarnPerAmount ?? 0),
    loyaltyPointValue: String(store.loyaltyPointValue ?? 0),
    financialYearStartMonth: String(store.financialYearStartMonth ?? 4),
  };
}

export function SettingsPage() {
  const { can, refreshUser } = useAuth();
  const queryClient = useQueryClient();
  const [form, setForm] = React.useState<FormState | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const { data: store, isLoading, error: loadError, refetch } = useQuery({
    queryKey: ['store'],
    queryFn: () => api.get<Single<Store>>('/store').then((res) => res.item),
  });

  React.useEffect(() => {
    if (store) {
      setForm(toForm(store));
      setError(null);
    }
  }, [store]);

  const save = useMutation({
    mutationFn: (payload: unknown) => api.patch<Single<Store>>('/store', payload),
    onSuccess: ({ item }) => {
      toast.success('Store settings saved');
      queryClient.setQueryData(['store'], item);
      queryClient.invalidateQueries({ queryKey: ['store'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setError(null);
      void refreshUser();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not save the settings'),
  });

  const editable = can('settings.update');
  const dirty = !!store && !!form && JSON.stringify(form) !== JSON.stringify(toForm(store));

  if (isLoading || !form) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (loadError) {
    return (
      <Card>
        <ErrorState
          title="Could not load store settings"
          message={loadError instanceof ApiError ? loadError.message : undefined}
          onRetry={() => void refetch()}
        />
      </Card>
    );
  }

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => (current ? { ...current, [key]: value } : current));

  const reset = () => {
    if (!store) return;
    setForm(toForm(store));
    setError(null);
  };

  const submit = () => {
    setError(null);
    const parsed = storeSchema.safeParse({
      name: form.name,
      legalName: form.legalName || null,
      gstin: form.gstin || null,
      stateCode: form.stateCode,
      address: form.address || null,
      city: form.city || null,
      pincode: form.pincode || null,
      phone: form.phone || null,
      email: form.email || null,
      invoicePrefix: form.invoicePrefix,
      invoiceTerms: form.invoiceTerms || null,
      billFooter: form.billFooter || null,
      taxEnabled: form.taxEnabled,
      allowNegativeStock: form.allowNegativeStock,
      loyaltyEnabled: form.loyaltyEnabled,
      loyaltyEarnPerAmount: Number(form.loyaltyEarnPerAmount) || 0,
      loyaltyPointValue: Number(form.loyaltyPointValue) || 0,
      financialYearStartMonth: Number(form.financialYearStartMonth) || 4,
      logoUrl: form.logoUrl || null,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the highlighted settings');
      return;
    }
    save.mutate(parsed.data);
  };

  const stateName = INDIAN_STATES.find((state) => state.code === form.stateCode)?.name;
  const sampleInvoice = `${form.invoicePrefix || 'INV'}/2026-27/00001`;
  const earnRate = Number(form.loyaltyEarnPerAmount) || 0;
  const pointValue = Number(form.loyaltyPointValue) || 0;

  return (
    <div className="pb-16">
      <PageHeader
        title="Store settings"
        description="Business identity, GST details, invoicing, loyalty and stock behaviour."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={reset} disabled={!dirty || save.isPending}>
              <RotateCcw className="h-4 w-4" /> Reset
            </Button>
            <Button size="sm" onClick={submit} loading={save.isPending} disabled={!editable || !dirty}>
              <Save className="h-4 w-4" /> Save changes
            </Button>
          </div>
        }
      />

      {!editable ? (
        <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          You can view these settings but not change them. Ask an administrator for the settings.update permission.
        </p>
      ) : null}

      {error ? (
        <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" /> Business profile
              </CardTitle>
              <CardDescription>Shown on invoices, receipts and the login screen.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <Field label="Store name" required>
                <Input
                  value={form.name}
                  maxLength={160}
                  disabled={!editable}
                  onChange={(event) => update('name', event.target.value)}
                />
              </Field>
              <Field label="Legal / registered name">
                <Input
                  value={form.legalName}
                  maxLength={160}
                  disabled={!editable}
                  onChange={(event) => update('legalName', event.target.value)}
                />
              </Field>
              <Field label="Phone">
                <Input
                  value={form.phone}
                  maxLength={20}
                  inputMode="tel"
                  disabled={!editable}
                  onChange={(event) => update('phone', event.target.value)}
                />
              </Field>
              <Field label="Email">
                <Input
                  type="email"
                  value={form.email}
                  disabled={!editable}
                  onChange={(event) => update('email', event.target.value)}
                />
              </Field>
              <Field label="Address" className="sm:col-span-2">
                <Input
                  value={form.address}
                  maxLength={300}
                  disabled={!editable}
                  onChange={(event) => update('address', event.target.value)}
                />
              </Field>
              <Field label="City">
                <Input
                  value={form.city}
                  maxLength={80}
                  disabled={!editable}
                  onChange={(event) => update('city', event.target.value)}
                />
              </Field>
              <Field label="PIN code">
                <Input
                  value={form.pincode}
                  inputMode="numeric"
                  maxLength={6}
                  disabled={!editable}
                  onChange={(event) => update('pincode', event.target.value.replace(/\D/g, ''))}
                />
              </Field>
              <Field label="Logo URL" hint="Square image works best" className="sm:col-span-2">
                <Input
                  value={form.logoUrl}
                  maxLength={500}
                  placeholder="https://…"
                  disabled={!editable}
                  onChange={(event) => update('logoUrl', event.target.value)}
                />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Percent className="h-4 w-4 text-muted-foreground" /> GST & tax
              </CardTitle>
              <CardDescription>
                Tax rates live on each product. These details decide how CGST/SGST and IGST split.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <Field label="GSTIN" hint="15 characters, e.g. 33ABCDE1234F1Z5">
                <Input
                  value={form.gstin}
                  maxLength={15}
                  className="uppercase tabnum"
                  placeholder="33ABCDE1234F1Z5"
                  disabled={!editable}
                  onChange={(event) => update('gstin', event.target.value.toUpperCase())}
                />
              </Field>
              <Field label="Place of supply / state" required>
                <Select
                  value={form.stateCode}
                  disabled={!editable}
                  onChange={(event) => update('stateCode', event.target.value)}
                >
                  {INDIAN_STATES.map((state) => (
                    <option key={state.code} value={state.code}>
                      {state.code} · {state.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 sm:col-span-2">
                <div>
                  <p className="text-sm font-medium">Charge GST on sales</p>
                  <p className="text-[11px] text-muted-foreground">
                    Turn off only for non-GST stores. Product tax rates are kept.
                  </p>
                </div>
                <Switch
                  checked={form.taxEnabled}
                  disabled={!editable}
                  aria-label="Charge GST on sales"
                  onCheckedChange={(checked) => update('taxEnabled', checked)}
                />
              </div>
              <p className="text-[11px] text-muted-foreground sm:col-span-2">
                Sales inside {stateName ?? 'your state'} split into CGST + SGST. Sales to other states use IGST.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" /> Invoicing
              </CardTitle>
              <CardDescription>Numbering, terms of sale and the footer printed on every bill.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <Field label="Invoice prefix" required hint="Numbers look like the sample below">
                <Input
                  value={form.invoicePrefix}
                  maxLength={10}
                  className="uppercase"
                  disabled={!editable}
                  onChange={(event) => update('invoicePrefix', event.target.value.toUpperCase().replace(/\s/g, ''))}
                />
              </Field>
              <div className="flex flex-col justify-end pb-0.5">
                <span className="label-base">Next number looks like</span>
                <span className="tabnum text-sm font-semibold text-slate-800">{sampleInvoice}</span>
                <span className="text-[10px] text-muted-foreground">Financial year is added automatically</span>
              </div>
              <Field label="Terms of sale" className="sm:col-span-2">
                <Textarea
                  value={form.invoiceTerms}
                  maxLength={1000}
                  className="min-h-[64px]"
                  placeholder="Goods once sold will not be taken back…"
                  disabled={!editable}
                  onChange={(event) => update('invoiceTerms', event.target.value)}
                />
              </Field>
              <Field label="Bill footer" className="sm:col-span-2">
                <Textarea
                  value={form.billFooter}
                  maxLength={500}
                  className="min-h-[56px]"
                  placeholder="Thank you for shopping with us!"
                  disabled={!editable}
                  onChange={(event) => update('billFooter', event.target.value)}
                />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-muted-foreground" /> Loyalty programme
              </CardTitle>
              <CardDescription>Points are earned on paid sales and redeemed at checkout.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 sm:col-span-2">
                <div>
                  <p className="text-sm font-medium">Enable loyalty points</p>
                  <p className="text-[11px] text-muted-foreground">
                    Customers earn points automatically. Redemption is available in the POS.
                  </p>
                </div>
                <Switch
                  checked={form.loyaltyEnabled}
                  disabled={!editable}
                  aria-label="Enable loyalty points"
                  onCheckedChange={(checked) => update('loyaltyEnabled', checked)}
                />
              </div>
              <Field label="Spend per point" hint="Rupees a customer must spend to earn one point">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.loyaltyEarnPerAmount}
                  className="text-right tabnum"
                  disabled={!editable || !form.loyaltyEnabled}
                  onChange={(event) => update('loyaltyEarnPerAmount', event.target.value)}
                />
              </Field>
              <Field label="Value of one point" hint="Rupee discount when a point is redeemed">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.loyaltyPointValue}
                  className="text-right tabnum"
                  disabled={!editable || !form.loyaltyEnabled}
                  onChange={(event) => update('loyaltyPointValue', event.target.value)}
                />
              </Field>
              <p className="text-[11px] text-muted-foreground sm:col-span-2">
                Example: spending {formatINR(earnRate * 10 || 0)} earns{' '}
                <span className="font-medium text-slate-700">{earnRate > 0 ? 10 : 0} points</span>, worth{' '}
                {formatINR((earnRate > 0 ? 10 : 0) * pointValue)} at checkout.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Warehouse className="h-4 w-4 text-muted-foreground" /> Stock & financial year
              </CardTitle>
              <CardDescription>How stock is controlled and when your financial year starts.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 sm:col-span-2">
                <div>
                  <p className="text-sm font-medium">Allow negative stock</p>
                  <p className="text-[11px] text-muted-foreground">
                    When off, billing is blocked if stock is unavailable. Keep this off for accurate stock.
                  </p>
                </div>
                <Switch
                  checked={form.allowNegativeStock}
                  disabled={!editable}
                  aria-label="Allow negative stock"
                  onCheckedChange={(checked) => update('allowNegativeStock', checked)}
                />
              </div>
              <Field label="Financial year starts in" required hint="Indian stores usually start in April">
                <Select
                  value={form.financialYearStartMonth}
                  disabled={!editable}
                  onChange={(event) => update('financialYearStartMonth', event.target.value)}
                >
                  {MONTHS.map((month, index) => (
                    <option key={month} value={String(index + 1)}>
                      {month}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="flex flex-col justify-end pb-0.5 text-[11px] text-muted-foreground">
                <span>
                  Current financial year:{' '}
                  <span className="font-medium text-slate-700">
                    {financialYearLabel(Number(form.financialYearStartMonth) || 4)}
                  </span>
                </span>
                <span>Document numbers reset each financial year.</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="lg:sticky lg:top-20">
            <CardHeader>
              <CardTitle>At a glance</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5 text-sm">
              <SummaryRow label="GSTIN" value={form.gstin || 'Not set'} ok={!!form.gstin} />
              <SummaryRow label="State" value={stateName ?? form.stateCode} />
              <SummaryRow label="Invoice prefix" value={form.invoicePrefix || '—'} />
              <SummaryRow label="GST on sales" value={form.taxEnabled ? 'Enabled' : 'Disabled'} ok={form.taxEnabled} />
              <SummaryRow
                label="Loyalty"
                value={form.loyaltyEnabled ? `${formatINR(earnRate)} per point` : 'Disabled'}
                ok={form.loyaltyEnabled}
              />
              <SummaryRow
                label="Negative stock"
                value={form.allowNegativeStock ? 'Allowed' : 'Blocked'}
                ok={!form.allowNegativeStock}
              />
              <SummaryRow label="Financial year" value={financialYearLabel(Number(form.financialYearStartMonth) || 4)} />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-start gap-2 py-4 text-[11px] text-muted-foreground">
              <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
              <span>
                Every change is written to the audit log with the before and after values. GST is configured per
                product, never store-wide.
              </span>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function SummaryRow({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={cn(
          'max-w-[65%] truncate text-right text-xs font-medium',
          ok === false ? 'text-amber-700' : 'text-slate-800',
        )}
      >
        {value}
      </span>
    </div>
  );
}

function financialYearLabel(startMonth: number) {
  const now = new Date();
  const year = now.getMonth() + 1 >= startMonth ? now.getFullYear() : now.getFullYear() - 1;
  const end = String((year + 1) % 100).padStart(2, '0');
  return `${year}-${end}`;
}
