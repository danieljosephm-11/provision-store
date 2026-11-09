import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Pencil, Plus, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { GST_STATES, supplierSchema } from '@ps/shared';
import { api, ApiError, buildQuery } from '@/lib/api';
import { formatINR } from '@/lib/shared';
import { useDebouncedValue } from '@/lib/hooks';
import { useAuth } from '@/contexts/auth';
import type { Paginated, Single, Supplier } from '@/lib/types';
import { PageHeader } from '@/components/shared/page-header';
import { DataTable, type Column } from '@/components/shared/data-table';
import { Pagination } from '@/components/shared/pagination';
import { SearchInput } from '@/components/shared/search-input';
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

interface SupplierFormState {
  name: string;
  contactPerson: string;
  mobile: string;
  email: string;
  gstin: string;
  address: string;
  city: string;
  stateCode: string;
  pincode: string;
  openingBalance: string;
  creditDays: string;
  isActive: boolean;
}

const emptyForm: SupplierFormState = {
  name: '',
  contactPerson: '',
  mobile: '',
  email: '',
  gstin: '',
  address: '',
  city: '',
  stateCode: '33',
  pincode: '',
  openingBalance: '0',
  creditDays: '0',
  isActive: true,
};

export function SuppliersPage() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const [search, setSearch] = React.useState('');
  const debounced = useDebouncedValue(search, 250);
  const [includeInactive, setIncludeInactive] = React.useState(false);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(20);
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Supplier | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['suppliers', { debounced, includeInactive, page, pageSize }],
    queryFn: () =>
      api.get<Paginated<Supplier>>(
        `/suppliers${buildQuery({ search: debounced, includeInactive: includeInactive || undefined, page, pageSize })}`,
      ),
    placeholderData: keepPreviousData,
  });

  const rows = data?.items ?? [];
  const owed = rows.reduce((sum, row) => (row.isActive ? sum + row.outstanding : sum), 0);

  const columns: Column<Supplier>[] = [
    {
      key: 'supplier',
      header: 'Supplier',
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-800">{row.name}</p>
          <p className="text-[11px] text-muted-foreground">
            {row.contactPerson ? `${row.contactPerson} · ` : ''}
            {row.mobile}
          </p>
        </div>
      ),
    },
    {
      key: 'gstin',
      header: 'GSTIN',
      cell: (row) => <span className="text-xs text-muted-foreground">{row.gstin ?? '—'}</span>,
    },
    {
      key: 'city',
      header: 'Location',
      cell: (row) => (
        <span className="text-xs text-muted-foreground">
          {[row.city, row.pincode].filter(Boolean).join(' · ') || '—'}
        </span>
      ),
    },
    {
      key: 'purchases',
      header: 'Purchases',
      align: 'right',
      cell: (row) => <span className="tabnum text-sm">{row.purchaseCount}</span>,
    },
    {
      key: 'terms',
      header: 'Terms',
      cell: (row) => <span className="text-xs text-muted-foreground">{row.creditDays} days</span>,
    },
    {
      key: 'outstanding',
      header: 'Payable',
      align: 'right',
      cell: (row) => (
        <span className={`tabnum font-medium ${row.outstanding > 0 ? 'text-amber-700' : 'text-muted-foreground'}`}>
          {formatINR(row.outstanding)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (row) => (
        <Badge variant={row.isActive ? 'success' : 'secondary'}>{row.isActive ? 'Active' : 'Inactive'}</Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (row) =>
        can('supplier.update') ? (
          <Button
            variant="ghost"
            size="iconSm"
            title="Edit supplier"
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
        title="Suppliers"
        description="Vendor directory with payables, credit terms and purchase history."
        actions={
          can('supplier.create') ? (
            <Button
              size="sm"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="h-4 w-4" /> Add supplier
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
            placeholder="Search supplier, mobile, GSTIN…"
            className="w-full lg:max-w-xs"
          />
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={includeInactive}
              onCheckedChange={(checked) => {
                setIncludeInactive(checked);
                setPage(1);
              }}
            />
            Include inactive
          </label>
          <span className="ml-auto text-xs text-muted-foreground">
            Payable on page <span className="font-medium text-slate-700 tabnum">{formatINR(owed)}</span>
          </span>
        </div>

        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          loading={isLoading}
          onRowClick={(row) => navigate(`/suppliers/${row.id}`)}
          emptyTitle="No suppliers yet"
          emptyDescription="Add suppliers before recording purchases so payables stay accurate."
          emptyAction={
            can('supplier.create') ? (
              <Button
                size="sm"
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                <Truck className="h-4 w-4" /> Add supplier
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

      <SupplierFormDialog open={formOpen} onOpenChange={setFormOpen} supplier={editing} />
    </div>
  );
}

function SupplierFormDialog({
  open,
  onOpenChange,
  supplier,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplier: Supplier | null;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = React.useState<SupplierFormState>(emptyForm);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setError(null);
    if (supplier) {
      setForm({
        ...emptyForm,
        name: supplier.name,
        contactPerson: supplier.contactPerson ?? '',
        mobile: supplier.mobile,
        email: supplier.email ?? '',
        gstin: supplier.gstin ?? '',
        address: supplier.address ?? '',
        city: supplier.city ?? '',
        stateCode: supplier.stateCode ?? '33',
        pincode: supplier.pincode ?? '',
        openingBalance: String(supplier.openingBalance),
        creditDays: String(supplier.creditDays),
        isActive: supplier.isActive,
      });
    } else {
      setForm(emptyForm);
    }
  }, [open, supplier]);

  const save = useMutation({
    mutationFn: (payload: unknown) =>
      supplier
        ? api.patch<Single<Supplier>>(`/suppliers/${supplier.id}`, payload)
        : api.post<Single<Supplier>>('/suppliers', payload),
    onSuccess: ({ item }) => {
      toast.success(supplier ? `${item.name} updated` : `${item.name} added`);
      onOpenChange(false);
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not save the supplier'),
  });

  const submit = () => {
    setError(null);
    const parsed = supplierSchema.safeParse({
      name: form.name,
      contactPerson: form.contactPerson || null,
      mobile: form.mobile,
      email: form.email || null,
      gstin: form.gstin || null,
      address: form.address || null,
      city: form.city || null,
      stateCode: form.stateCode || null,
      pincode: form.pincode || null,
      openingBalance: Number(form.openingBalance) || 0,
      creditDays: Number(form.creditDays) || 0,
      isActive: form.isActive,
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
          <DialogTitle>{supplier ? `Edit ${supplier.name}` : 'Add supplier'}</DialogTitle>
          <DialogDescription>
            Opening balance is posted to the supplier ledger once, at creation.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Business name" required>
              <Input
                value={form.name}
                autoFocus
                maxLength={160}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              />
            </Field>
            <Field label="Contact person">
              <Input
                value={form.contactPerson}
                maxLength={120}
                onChange={(event) => setForm((current) => ({ ...current, contactPerson: event.target.value }))}
              />
            </Field>
            <Field label="Mobile" required hint="Unique per supplier">
              <Input
                value={form.mobile}
                inputMode="numeric"
                maxLength={10}
                onChange={(event) =>
                  setForm((current) => ({ ...current, mobile: event.target.value.replace(/\D/g, '') }))
                }
              />
            </Field>
            <Field label="Email">
              <Input
                type="email"
                value={form.email}
                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              />
            </Field>
            <Field label="GSTIN">
              <Input
                value={form.gstin}
                maxLength={15}
                onChange={(event) => setForm((current) => ({ ...current, gstin: event.target.value.toUpperCase() }))}
              />
            </Field>
            <Field label="Credit days">
              <Input
                type="number"
                min="0"
                max="365"
                value={form.creditDays}
                onChange={(event) => setForm((current) => ({ ...current, creditDays: event.target.value }))}
                className="text-right tabnum"
              />
            </Field>
            <Field
              label="Opening balance"
              hint={supplier ? 'Locked after creation' : 'Amount already owed to this supplier'}
            >
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.openingBalance}
                disabled={!!supplier}
                onChange={(event) => setForm((current) => ({ ...current, openingBalance: event.target.value }))}
                className="text-right tabnum"
              />
            </Field>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={form.isActive}
                  onCheckedChange={(checked) => setForm((current) => ({ ...current, isActive: checked }))}
                />
                Active supplier
              </label>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Address">
              <Textarea
                value={form.address}
                maxLength={500}
                className="min-h-[64px]"
                onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="City">
                <Input
                  value={form.city}
                  maxLength={80}
                  onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))}
                />
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
              <div className="col-span-2">
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
              </div>
            </div>
          </div>

          {error ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>
            Cancel
          </Button>
          <Button loading={save.isPending} onClick={submit}>
            {supplier ? 'Save changes' : 'Add supplier'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SupplierIcon() {
  return <Building2 className="h-4 w-4" />;
}
