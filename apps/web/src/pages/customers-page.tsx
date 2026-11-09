import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  BadgeIndianRupee,
  BookUser,
  Download,
  Pencil,
  Plus,
  Upload,
  UserPlus,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { customerSchema, GST_STATES } from '@ps/shared';
import { api, ApiError, buildQuery, openDocument } from '@/lib/api';
import { formatINR } from '@/lib/shared';
import { formatDate } from '@/lib/utils';
import { useDebouncedValue } from '@/lib/hooks';
import { useAuth } from '@/contexts/auth';
import type { Customer, Paginated, Single } from '@/lib/types';
import { PageHeader } from '@/components/shared/page-header';
import { DataTable, type Column } from '@/components/shared/data-table';
import { Pagination } from '@/components/shared/pagination';
import { SearchInput } from '@/components/shared/search-input';
import { StatCard } from '@/components/shared/stat-card';
import { Badge } from '@/components/ui/badge';
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
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { Switch } from '@/components/ui/controls';

const SEGMENTS = [
  { value: 'NEW', label: 'New' },
  { value: 'REGULAR', label: 'Regular' },
  { value: 'LOYAL', label: 'Loyal' },
  { value: 'HIGH_VALUE', label: 'High value' },
  { value: 'INACTIVE', label: 'Inactive' },
] as const;

interface CustomerFormState {
  name: string;
  mobile: string;
  email: string;
  gstin: string;
  creditLimit: string;
  creditDays: string;
  notes: string;
  birthday: string;
  anniversary: string;
  tags: string;
  isActive: boolean;
  line1: string;
  line2: string;
  city: string;
  stateCode: string;
  pincode: string;
}

const emptyForm: CustomerFormState = {
  name: '',
  mobile: '',
  email: '',
  gstin: '',
  creditLimit: '0',
  creditDays: '0',
  notes: '',
  birthday: '',
  anniversary: '',
  tags: '',
  isActive: true,
  line1: '',
  line2: '',
  city: '',
  stateCode: '33',
  pincode: '',
};

const parseTags = (value: string) =>
  value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 20);

export function CustomersPage() {
  const navigate = useNavigate();
  const { can } = useAuth();

  const [search, setSearch] = React.useState('');
  const [tag, setTag] = React.useState('');
  const debounced = useDebouncedValue(search, 250);
  const debouncedTag = useDebouncedValue(tag, 250);
  const [segment, setSegment] = React.useState('');
  const [hasDues, setHasDues] = React.useState(false);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(20);

  const [formOpen, setFormOpen] = React.useState(false);
  const [importOpen, setImportOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Customer | null>(null);

  const { data: summary } = useQuery({
    queryKey: ['customers', 'summary'],
    queryFn: () =>
      api
        .get<Single<{ totalOutstanding: number; customersWithDues: number }>>('/customers/summary')
        .then((res) => res.item),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['customers', { debounced, segment, hasDues, page, pageSize, tag: debouncedTag }],
    queryFn: () =>
      api.get<Paginated<Customer>>(
        `/customers${buildQuery({
          search: debounced,
          segment,
          tag: debouncedTag,
          hasDues: hasDues || undefined,
          page,
          pageSize,
        })}`,
      ),
    placeholderData: keepPreviousData,
  });

  const rows = data?.items ?? [];

  const columns: Column<Customer>[] = [
    {
      key: 'customer',
      header: 'Customer',
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-800">{row.name}</p>
          <p className="text-[11px] text-muted-foreground">
            {row.code} · {row.mobile}
          </p>
          {row.tags.length > 0 ? (
            <div className="mt-1 flex flex-wrap gap-1">
              {row.tags.slice(0, 3).map((item) => (
                <Badge key={item} variant="info" className="px-1.5 py-0 text-[10px]">
                  {item}
                </Badge>
              ))}
              {row.tags.length > 3 ? (
                <span className="text-[10px] text-muted-foreground">+{row.tags.length - 3}</span>
              ) : null}
            </div>
          ) : null}
        </div>
      ),
    },
    {
      key: 'segment',
      header: 'Segment',
      cell: (row) => <Badge variant="outline">{row.segment.replace(/_/g, ' ')}</Badge>,
    },
    {
      key: 'loyalty',
      header: 'Loyalty',
      align: 'right',
      cell: (row) => <span className="tabnum text-sm">{row.loyaltyPoints} pts</span>,
    },
    {
      key: 'purchases',
      header: 'Lifetime spend',
      align: 'right',
      cell: (row) => (
        <div className="text-right">
          <p className="tabnum font-medium">{formatINR(row.totalSpent)}</p>
          <p className="text-[10px] text-muted-foreground">
            {row.totalPurchases} purchase{row.totalPurchases === 1 ? '' : 's'}
          </p>
        </div>
      ),
    },
    {
      key: 'outstanding',
      header: 'Outstanding',
      align: 'right',
      cell: (row) => (
        <div className="text-right">
          <p className={`tabnum font-medium ${row.outstanding > 0 ? 'text-amber-700' : 'text-muted-foreground'}`}>
            {formatINR(row.outstanding)}
          </p>
          <p className="text-[10px] text-muted-foreground">limit {formatINR(row.creditLimit)}</p>
        </div>
      ),
    },
    {
      key: 'last',
      header: 'Last purchase',
      cell: (row) => (
        <span className="text-xs text-muted-foreground">
          {row.lastPurchaseAt ? formatDate(row.lastPurchaseAt) : 'Never'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (row) =>
        can('customer.update') ? (
          <Button
            variant="ghost"
            size="iconSm"
            title="Edit customer"
            aria-label={`Edit ${row.name}`}
            onClick={(event) => {
              event.stopPropagation();
              setEditing(row);
              setFormOpen(true);
            }}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        ) : null,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Customers"
        description="Customer 360 with credit limits, loyalty, tags, occasions and campaign history."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate('/crm')}>
              <BookUser className="h-4 w-4" /> CRM command centre
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void openDocument(
                  '/customers/export',
                  'download',
                  `customers-${new Date().toISOString().slice(0, 10)}.csv`,
                )
              }
            >
              <Download className="h-4 w-4" /> Export CSV
            </Button>
            {can('customer.create') ? (
              <>
                <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
                  <Upload className="h-4 w-4" /> Import
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    setEditing(null);
                    setFormOpen(true);
                  }}
                >
                  <UserPlus className="h-4 w-4" /> Add customer
                </Button>
              </>
            ) : null}
          </div>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Outstanding receivables"
          value={formatINR(summary?.totalOutstanding ?? 0)}
          hint="Across all active customers"
          icon={BadgeIndianRupee}
          tone="amber"
        />
        <StatCard
          label="Customers with dues"
          value={String(summary?.customersWithDues ?? 0)}
          hint="Credit-due alerts live in the CRM"
          icon={Users}
          tone="rose"
        />
        <StatCard
          label="Customer base"
          value={String(data?.meta.total ?? 0)}
          hint={hasDues || tag ? 'Matching the current filters' : 'All active customers'}
          icon={BookUser}
          tone="emerald"
        />
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-2 border-b p-3 lg:flex-row lg:items-center">
          <SearchInput
            value={search}
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            placeholder="Search name, mobile, code, GSTIN…"
            className="w-full lg:max-w-xs"
          />
          <Select
            className="h-9 w-[170px]"
            value={segment}
            aria-label="Filter by segment"
            onChange={(event) => {
              setSegment(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All segments</option>
            {SEGMENTS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <Input
            className="h-9 w-[170px]"
            value={tag}
            placeholder="Filter by tag"
            aria-label="Filter by tag"
            onChange={(event) => {
              setTag(event.target.value);
              setPage(1);
            }}
          />
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={hasDues}
              onCheckedChange={(checked) => {
                setHasDues(checked);
                setPage(1);
              }}
            />
            Only with dues
          </label>
        </div>

        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          loading={isLoading}
          onRowClick={(row) => navigate(`/customers/${row.id}`)}
          emptyTitle={hasDues ? 'No customers with dues' : 'No customers found'}
          emptyDescription="Add a customer, import a CSV, or clear the filters."
          emptyAction={
            can('customer.create') ? (
              <Button
                size="sm"
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                <Plus className="h-4 w-4" /> Add customer
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

      <CustomerFormDialog open={formOpen} onOpenChange={setFormOpen} customer={editing} />
      <CustomerImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}

function CustomerFormDialog({
  open,
  onOpenChange,
  customer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: Customer | null;
}) {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [form, setForm] = React.useState<CustomerFormState>(emptyForm);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setError(null);
    if (customer) {
      setForm({
        ...emptyForm,
        name: customer.name,
        mobile: customer.mobile,
        email: customer.email ?? '',
        gstin: customer.gstin ?? '',
        creditLimit: String(customer.creditLimit),
        creditDays: String(customer.creditDays),
        notes: customer.notes ?? '',
        birthday: customer.birthday ?? '',
        anniversary: customer.anniversary ?? '',
        tags: customer.tags.join(', '),
        isActive: customer.isActive,
      });
    } else {
      setForm(emptyForm);
    }
  }, [open, customer]);

  const save = useMutation({
    mutationFn: (payload: unknown) =>
      customer
        ? api.patch<Single<Customer>>(`/customers/${customer.id}`, payload)
        : api.post<Single<Customer>>('/customers', payload),
    onSuccess: ({ item }) => {
      toast.success(customer ? `${item.name} updated` : `${item.name} added`);
      onOpenChange(false);
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['crm'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['customer-select'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not save the customer'),
  });

  const submit = () => {
    setError(null);
    const parsed = customerSchema.safeParse({
      name: form.name,
      mobile: form.mobile,
      email: form.email || null,
      gstin: form.gstin || null,
      creditLimit: Number(form.creditLimit) || 0,
      creditDays: Number(form.creditDays) || 0,
      notes: form.notes || null,
      birthday: form.birthday || null,
      anniversary: form.anniversary || null,
      tags: parseTags(form.tags),
      isActive: form.isActive,
      address: form.line1.trim()
        ? {
            line1: form.line1,
            line2: form.line2 || null,
            city: form.city || null,
            stateCode: form.stateCode || null,
            pincode: form.pincode || null,
          }
        : null,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the highlighted fields');
      return;
    }
    save.mutate(parsed.data);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !save.isPending && onOpenChange(next)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{customer ? `Edit ${customer.name}` : 'Add customer'}</DialogTitle>
          <DialogDescription>
            Birthdays and anniversaries power the occasion reminders in the CRM command centre.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Full name" required>
              <Input
                value={form.name}
                autoFocus
                maxLength={120}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              />
            </Field>
            <Field label="Mobile" required hint="10-digit Indian mobile, unique per customer">
              <Input
                value={form.mobile}
                inputMode="numeric"
                maxLength={10}
                onChange={(event) => setForm((current) => ({ ...current, mobile: event.target.value.replace(/\D/g, '') }))}
              />
            </Field>
            <Field label="Email">
              <Input
                type="email"
                value={form.email}
                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              />
            </Field>
            <Field label="GSTIN" hint="For B2B invoices">
              <Input
                value={form.gstin}
                maxLength={15}
                onChange={(event) => setForm((current) => ({ ...current, gstin: event.target.value.toUpperCase() }))}
              />
            </Field>
            <Field label="Birthday">
              <Input
                type="date"
                value={form.birthday}
                onChange={(event) => setForm((current) => ({ ...current, birthday: event.target.value }))}
              />
            </Field>
            <Field label="Anniversary">
              <Input
                type="date"
                value={form.anniversary}
                onChange={(event) => setForm((current) => ({ ...current, anniversary: event.target.value }))}
              />
            </Field>
            <Field label="Credit limit" hint={can('customer.credit.manage') ? 'Maximum outstanding allowed' : 'You cannot change credit limits'}>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.creditLimit}
                disabled={!!customer && !can('customer.credit.manage')}
                onChange={(event) => setForm((current) => ({ ...current, creditLimit: event.target.value }))}
                className="text-right tabnum"
              />
            </Field>
            <Field label="Credit days" hint="Default due date window">
              <Input
                type="number"
                min="0"
                max="365"
                value={form.creditDays}
                onChange={(event) => setForm((current) => ({ ...current, creditDays: event.target.value }))}
                className="text-right tabnum"
              />
            </Field>
            <Field label="Tags" hint="Comma separated, e.g. wholesale, festival, VIP" className="sm:col-span-2">
              <Input
                value={form.tags}
                maxLength={400}
                placeholder="wholesale, festival, VIP"
                onChange={(event) => setForm((current) => ({ ...current, tags: event.target.value }))}
              />
            </Field>
          </div>

          <div className="space-y-3 rounded-lg border bg-slate-50/60 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Address (optional)</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Address line 1">
                <Input
                  value={form.line1}
                  maxLength={200}
                  onChange={(event) => setForm((current) => ({ ...current, line1: event.target.value }))}
                />
              </Field>
              <Field label="Address line 2">
                <Input
                  value={form.line2}
                  maxLength={200}
                  onChange={(event) => setForm((current) => ({ ...current, line2: event.target.value }))}
                />
              </Field>
              <Field label="City">
                <Input
                  value={form.city}
                  maxLength={80}
                  onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="State">
                  <Select
                    value={form.stateCode}
                    onChange={(event) => setForm((current) => ({ ...current, stateCode: event.target.value }))}
                  >
                    {GST_STATES.map((state) => (
                      <option key={state.code} value={state.code}>
                        {state.code} · {state.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="PIN code">
                  <Input
                    value={form.pincode}
                    inputMode="numeric"
                    maxLength={6}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, pincode: event.target.value.replace(/\D/g, '') }))
                    }
                  />
                </Field>
              </div>
            </div>
          </div>

          <Field label="Notes">
            <Textarea
              value={form.notes}
              maxLength={1000}
              className="min-h-[64px]"
              onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
            />
          </Field>

          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={form.isActive}
              onCheckedChange={(checked) => setForm((current) => ({ ...current, isActive: checked }))}
            />
            Active customer
          </label>

          {error ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>
            Cancel
          </Button>
          <Button loading={save.isPending} onClick={submit}>
            {customer ? 'Save changes' : 'Add customer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CustomerImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  const [csv, setCsv] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<{
    created: number;
    updated: number;
    skipped: number;
    errors: { row: number; message: string }[];
  } | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!open) return;
    setCsv('');
    setError(null);
    setResult(null);
  }, [open]);

  const runImport = useMutation({
    mutationFn: () => api.post<Single<typeof result>>('/customers/import', { csv }),
    onSuccess: ({ item }) => {
      setResult(item);
      toast.success(`Import finished: ${item?.created ?? 0} added, ${item?.updated ?? 0} updated`);
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['crm'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not import the file'),
  });

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    setCsv(text);
    setResult(null);
    setError(null);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !runImport.isPending && onOpenChange(next)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import customers from CSV</DialogTitle>
          <DialogDescription>
            Existing mobiles are updated, new mobiles are created. Required columns: name, mobile. Optional: email,
            gstin, creditLimit, creditDays, notes, tags, birthday, anniversary, address, city, stateCode, pincode.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(event) => void pickFile(event.target.files?.[0])}
          />
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4" /> Choose CSV file
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setCsv(
                  [
                    'name,mobile,email,tags,birthday,anniversary,creditLimit,creditDays,city,stateCode',
                    'Ravi Kumar,9876543210,ravi@example.com,"wholesale,VIP",1990-05-12,2018-02-14,25000,30,Chennai,33',
                  ].join('\n'),
                )
              }
            >
              Load sample
            </Button>
          </div>
          <Field label="CSV contents" hint="You can paste here after copying from Excel or Google Sheets.">
            <Textarea
              value={csv}
              onChange={(event) => setCsv(event.target.value)}
              className="min-h-[180px] font-mono text-xs"
              placeholder="name,mobile,email,tags,birthday,anniversary"
            />
          </Field>
          {error ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
          ) : null}
          {result ? (
            <div className="space-y-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              <p className="font-medium">
                {result.created} created · {result.updated} updated · {result.skipped} skipped
              </p>
              {result.errors.length > 0 ? (
                <ul className="max-h-32 space-y-0.5 overflow-y-auto text-red-700">
                  {result.errors.map((item) => (
                    <li key={`${item.row}-${item.message}`}>
                      Row {item.row}: {item.message}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={runImport.isPending}>
            Close
          </Button>
          <Button loading={runImport.isPending} disabled={!csv.trim()} onClick={() => runImport.mutate()}>
            Import customers
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
