import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/contexts/auth';
import { formatINR } from '@/lib/shared';
import type { Brand, Category, TaxRate, Unit } from '@/lib/types';
import { PageHeader } from '@/components/shared/page-header';
import { DataTable, type Column } from '@/components/shared/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/dialog';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/input';
import { Switch } from '@/components/ui/controls';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

type DeleteTarget = { kind: 'category' | 'brand' | 'unit' | 'tax'; id: string; name: string };

export function CatalogPage() {
  const { can } = useAuth();
  const [deleteTarget, setDeleteTarget] = React.useState<DeleteTarget | null>(null);
  const queryClient = useQueryClient();

  const remove = useMutation({
    mutationFn: (target: DeleteTarget) =>
      api.del(`/catalog/${target.kind === 'category' ? 'categories' : target.kind === 'brand' ? 'brands' : target.kind === 'unit' ? 'units' : 'tax-rates'}/${target.id}`),
    onSuccess: (_res, target) => {
      toast.success(`${target.name} removed`);
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ['catalog'] });
      queryClient.invalidateQueries({ queryKey: ['catalog-options'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not delete this item'),
  });

  return (
    <div>
      <PageHeader
        title="Catalog"
        description="Categories, brands, selling units and GST rates shared by every product."
      />

      <Tabs defaultValue="categories">
        <TabsList>
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="brands">Brands</TabsTrigger>
          <TabsTrigger value="units">Units</TabsTrigger>
          <TabsTrigger value="tax">GST rates</TabsTrigger>
        </TabsList>

        <TabsContent value="categories">
          <CategoriesTab canManage={can('category.manage')} onDelete={setDeleteTarget} />
        </TabsContent>
        <TabsContent value="brands">
          <BrandsTab canManage={can('brand.manage')} onDelete={setDeleteTarget} />
        </TabsContent>
        <TabsContent value="units">
          <UnitsTab canManage={can('unit.manage')} onDelete={setDeleteTarget} />
        </TabsContent>
        <TabsContent value="tax">
          <TaxRatesTab canManage={can('tax.manage')} onDelete={setDeleteTarget} />
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={`Remove ${deleteTarget?.name}?`}
        description={
          deleteTarget?.kind === 'tax'
            ? 'The GST rate will be deactivated. Products already using it keep their configuration.'
            : 'Items still used by products cannot be removed — reassign those products first.'
        }
        confirmLabel="Remove"
        loading={remove.isPending}
        onConfirm={() => deleteTarget && remove.mutate(deleteTarget)}
      />
    </div>
  );
}

function CategoriesTab({
  canManage,
  onDelete,
}: {
  canManage: boolean;
  onDelete: (target: DeleteTarget) => void;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Category | null>(null);
  const [form, setForm] = React.useState({ name: '', parentId: '', isActive: true });
  const [error, setError] = React.useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['catalog', 'categories'],
    queryFn: () => api.get<{ items: Category[] }>('/catalog/categories').then((res) => res.items),
  });

  const save = useMutation({
    mutationFn: () =>
      editing
        ? api.patch(`/catalog/categories/${editing.id}`, {
            name: form.name,
            parentId: form.parentId || null,
            isActive: form.isActive,
          })
        : api.post('/catalog/categories', {
            name: form.name,
            parentId: form.parentId || null,
            isActive: form.isActive,
          }),
    onSuccess: () => {
      toast.success(editing ? 'Category updated' : 'Category created');
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ['catalog'] });
      queryClient.invalidateQueries({ queryKey: ['catalog-options'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not save the category'),
  });

  const openForm = (category: Category | null) => {
    setEditing(category);
    setError(null);
    setForm({ name: category?.name ?? '', parentId: category?.parentId ?? '', isActive: category?.isActive ?? true });
    setOpen(true);
  };

  const columns: Column<Category>[] = [
    {
      key: 'name',
      header: 'Category',
      cell: (row) => (
        <div>
          <p className="font-medium text-slate-800">{row.name}</p>
          {row.parentId ? (
            <p className="text-[11px] text-muted-foreground">
              under {data?.find((entry) => entry.id === row.parentId)?.name ?? 'another category'}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      key: 'products',
      header: 'Products',
      align: 'right',
      cell: (row) => <span className="tabnum text-sm">{row.productCount}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (row) => <Badge variant={row.isActive ? 'success' : 'secondary'}>{row.isActive ? 'Active' : 'Inactive'}</Badge>,
    },
    ...(canManage
      ? [
          {
            key: 'actions',
            header: '',
            align: 'right' as const,
            cell: (row: Category) => (
              <div className="flex items-center justify-end gap-1">
                <Button variant="ghost" size="iconSm" aria-label={`Edit ${row.name}`} onClick={() => openForm(row)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="iconSm"
                  aria-label={`Delete ${row.name}`}
                  onClick={() => onDelete({ kind: 'category', id: row.id, name: row.name })}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ),
          },
        ]
      : []),
  ];

  return (
    <>
      <Card className="overflow-hidden">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Product categories</CardTitle>
          {canManage ? (
            <Button size="sm" onClick={() => openForm(null)}>
              <Plus className="h-4 w-4" /> New category
            </Button>
          ) : null}
        </CardHeader>
        <DataTable
          columns={columns}
          rows={data}
          rowKey={(row) => row.id}
          loading={isLoading}
          emptyTitle="No categories yet"
          emptyDescription="Group products so reports and the POS stay navigable."
        />
      </Card>

      <Dialog open={open} onOpenChange={(next) => !save.isPending && setOpen(next)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit category' : 'New category'}</DialogTitle>
            <DialogDescription>Categories can be nested one level deep for simple store layouts.</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <Field label="Name" required>
              <Input
                value={form.name}
                autoFocus
                maxLength={80}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              />
            </Field>
            <Field label="Parent category">
              <Select
                value={form.parentId}
                onChange={(event) => setForm((current) => ({ ...current, parentId: event.target.value }))}
              >
                <option value="">Top level</option>
                {data
                  ?.filter((category) => category.id !== editing?.id)
                  .map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
              </Select>
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={form.isActive}
                onCheckedChange={(checked) => setForm((current) => ({ ...current, isActive: checked }))}
              />
              Active
            </label>
            {error ? (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={save.isPending}>
              Cancel
            </Button>
            <Button loading={save.isPending} disabled={!form.name.trim()} onClick={() => save.mutate()}>
              {editing ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function BrandsTab({ canManage, onDelete }: { canManage: boolean; onDelete: (target: DeleteTarget) => void }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Brand | null>(null);
  const [name, setName] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['catalog', 'brands'],
    queryFn: () => api.get<{ items: Brand[] }>('/catalog/brands').then((res) => res.items),
  });

  const save = useMutation({
    mutationFn: () =>
      editing ? api.patch(`/catalog/brands/${editing.id}`, { name }) : api.post('/catalog/brands', { name }),
    onSuccess: () => {
      toast.success(editing ? 'Brand updated' : 'Brand created');
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ['catalog'] });
      queryClient.invalidateQueries({ queryKey: ['catalog-options'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not save the brand'),
  });

  const openForm = (brand: Brand | null) => {
    setEditing(brand);
    setName(brand?.name ?? '');
    setError(null);
    setOpen(true);
  };

  const columns: Column<Brand>[] = [
    { key: 'name', header: 'Brand', cell: (row) => <span className="font-medium text-slate-800">{row.name}</span> },
    {
      key: 'products',
      header: 'Products',
      align: 'right',
      cell: (row) => <span className="tabnum text-sm">{row.productCount}</span>,
    },
    ...(canManage
      ? [
          {
            key: 'actions',
            header: '',
            align: 'right' as const,
            cell: (row: Brand) => (
              <div className="flex items-center justify-end gap-1">
                <Button variant="ghost" size="iconSm" aria-label={`Edit ${row.name}`} onClick={() => openForm(row)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="iconSm"
                  aria-label={`Delete ${row.name}`}
                  onClick={() => onDelete({ kind: 'brand', id: row.id, name: row.name })}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ),
          },
        ]
      : []),
  ];

  return (
    <>
      <Card className="overflow-hidden">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Brands</CardTitle>
          {canManage ? (
            <Button size="sm" onClick={() => openForm(null)}>
              <Plus className="h-4 w-4" /> New brand
            </Button>
          ) : null}
        </CardHeader>
        <DataTable
          columns={columns}
          rows={data}
          rowKey={(row) => row.id}
          loading={isLoading}
          emptyTitle="No brands yet"
          emptyDescription="Brands help customers find products faster."
        />
      </Card>

      <Dialog open={open} onOpenChange={(next) => !save.isPending && setOpen(next)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit brand' : 'New brand'}</DialogTitle>
            <DialogDescription>Keep brand names consistent for search and reporting.</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <Field label="Brand name" required>
              <Input value={name} autoFocus maxLength={80} onChange={(event) => setName(event.target.value)} />
            </Field>
            {error ? (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={save.isPending}>
              Cancel
            </Button>
            <Button loading={save.isPending} disabled={!name.trim()} onClick={() => save.mutate()}>
              {editing ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function UnitsTab({ canManage, onDelete }: { canManage: boolean; onDelete: (target: DeleteTarget) => void }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Unit | null>(null);
  const [form, setForm] = React.useState({ name: '', code: '', allowsDecimal: false });
  const [error, setError] = React.useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['catalog', 'units'],
    queryFn: () => api.get<{ items: Unit[] }>('/catalog/units').then((res) => res.items),
  });

  const save = useMutation({
    mutationFn: () =>
      editing
        ? api.patch(`/catalog/units/${editing.id}`, form)
        : api.post('/catalog/units', form),
    onSuccess: () => {
      toast.success(editing ? 'Unit updated' : 'Unit created');
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ['catalog'] });
      queryClient.invalidateQueries({ queryKey: ['catalog-options'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not save the unit'),
  });

  const openForm = (unit: Unit | null) => {
    setEditing(unit);
    setError(null);
    setForm({ name: unit?.name ?? '', code: unit?.code ?? '', allowsDecimal: unit?.allowsDecimal ?? false });
    setOpen(true);
  };

  const columns: Column<Unit>[] = [
    {
      key: 'name',
      header: 'Unit',
      cell: (row) => (
        <div>
          <p className="font-medium text-slate-800">{row.name}</p>
          <p className="text-[11px] text-muted-foreground">
            {row.code}
            {row.isSystem ? ' · system unit' : ''}
          </p>
        </div>
      ),
    },
    {
      key: 'decimal',
      header: 'Decimal qty',
      cell: (row) => (row.allowsDecimal ? <Badge variant="info">Allowed</Badge> : <span className="text-xs text-muted-foreground">Whole only</span>),
    },
    {
      key: 'products',
      header: 'Products',
      align: 'right',
      cell: (row) => <span className="tabnum text-sm">{row.productCount}</span>,
    },
    ...(canManage
      ? [
          {
            key: 'actions',
            header: '',
            align: 'right' as const,
            cell: (row: Unit) => (
              <div className="flex items-center justify-end gap-1">
                <Button variant="ghost" size="iconSm" aria-label={`Edit ${row.name}`} onClick={() => openForm(row)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="iconSm"
                  disabled={row.isSystem}
                  aria-label={`Delete ${row.name}`}
                  onClick={() => onDelete({ kind: 'unit', id: row.id, name: row.name })}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ),
          },
        ]
      : []),
  ];

  return (
    <>
      <Card className="overflow-hidden">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Selling units</CardTitle>
          {canManage ? (
            <Button size="sm" onClick={() => openForm(null)}>
              <Plus className="h-4 w-4" /> New unit
            </Button>
          ) : null}
        </CardHeader>
        <DataTable
          columns={columns}
          rows={data}
          rowKey={(row) => row.id}
          loading={isLoading}
          emptyTitle="No units yet"
          emptyDescription="Units are required before you can create products."
        />
      </Card>

      <Dialog open={open} onOpenChange={(next) => !save.isPending && setOpen(next)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit unit' : 'New unit'}</DialogTitle>
            <DialogDescription>For loose items such as sugar or dal, enable decimal quantities.</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <Field label="Name" required>
              <Input
                value={form.name}
                autoFocus
                maxLength={40}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              />
            </Field>
            <Field label="Short code" required hint="Printed on bills, e.g. kg, pcs, ltr">
              <Input
                value={form.code}
                maxLength={10}
                onChange={(event) => setForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))}
              />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={form.allowsDecimal}
                onCheckedChange={(checked) => setForm((current) => ({ ...current, allowsDecimal: checked }))}
              />
              Allow decimal quantities
            </label>
            {error ? (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={save.isPending}>
              Cancel
            </Button>
            <Button loading={save.isPending} disabled={!form.name.trim() || !form.code.trim()} onClick={() => save.mutate()}>
              {editing ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function TaxRatesTab({ canManage, onDelete }: { canManage: boolean; onDelete: (target: DeleteTarget) => void }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<TaxRate | null>(null);
  const [form, setForm] = React.useState({
    name: '',
    rate: '',
    cessRate: '0',
    hsnCode: '',
    isDefault: false,
    isActive: true,
  });
  const [error, setError] = React.useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['catalog', 'tax-rates'],
    queryFn: () => api.get<{ items: TaxRate[] }>('/catalog/tax-rates').then((res) => res.items),
  });

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        name: form.name,
        rate: Number(form.rate),
        cessRate: Number(form.cessRate) || 0,
        hsnCode: form.hsnCode || null,
        isDefault: form.isDefault,
        isActive: form.isActive,
      };
      return editing ? api.patch(`/catalog/tax-rates/${editing.id}`, payload) : api.post('/catalog/tax-rates', payload);
    },
    onSuccess: () => {
      toast.success(editing ? 'GST rate updated' : 'GST rate created');
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ['catalog'] });
      queryClient.invalidateQueries({ queryKey: ['catalog-options'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not save the GST rate'),
  });

  const openForm = (tax: TaxRate | null) => {
    setEditing(tax);
    setError(null);
    setForm({
      name: tax?.name ?? '',
      rate: tax ? String(tax.rate) : '',
      cessRate: tax ? String(tax.cessRate) : '0',
      hsnCode: tax?.hsnCode ?? '',
      isDefault: tax?.isDefault ?? false,
      isActive: tax?.isActive ?? true,
    });
    setOpen(true);
  };

  const columns: Column<TaxRate>[] = [
    {
      key: 'name',
      header: 'GST rate',
      cell: (row) => (
        <div>
          <p className="font-medium text-slate-800">{row.name}</p>
          {row.hsnCode ? <p className="text-[11px] text-muted-foreground">HSN {row.hsnCode}</p> : null}
        </div>
      ),
    },
    {
      key: 'rate',
      header: 'Rate',
      align: 'right',
      cell: (row) => <span className="tabnum font-medium">{row.rate}%</span>,
    },
    {
      key: 'cess',
      header: 'Cess',
      align: 'right',
      cell: (row) => <span className="tabnum text-xs text-muted-foreground">{row.cessRate}%</span>,
    },
    {
      key: 'products',
      header: 'Products',
      align: 'right',
      cell: (row) => <span className="tabnum text-sm">{row.productCount}</span>,
    },
    {
      key: 'flags',
      header: '',
      cell: (row) => (
        <div className="flex items-center gap-1.5">
          {row.isDefault ? <Badge variant="info">Default</Badge> : null}
          <Badge variant={row.isActive ? 'success' : 'secondary'}>{row.isActive ? 'Active' : 'Inactive'}</Badge>
        </div>
      ),
    },
    ...(canManage
      ? [
          {
            key: 'actions',
            header: '',
            align: 'right' as const,
            cell: (row: TaxRate) => (
              <div className="flex items-center justify-end gap-1">
                <Button variant="ghost" size="iconSm" aria-label={`Edit ${row.name}`} onClick={() => openForm(row)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="iconSm"
                  aria-label={`Deactivate ${row.name}`}
                  onClick={() => onDelete({ kind: 'tax', id: row.id, name: row.name })}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ),
          },
        ]
      : []),
  ];

  return (
    <>
      <Card className="overflow-hidden">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>GST rates</CardTitle>
          {canManage ? (
            <Button size="sm" onClick={() => openForm(null)}>
              <Plus className="h-4 w-4" /> New GST rate
            </Button>
          ) : null}
        </CardHeader>
        <DataTable
          columns={columns}
          rows={data}
          rowKey={(row) => row.id}
          loading={isLoading}
          emptyTitle="No GST rates configured"
          emptyDescription="Add the rates you sell at — 0%, 5%, 12%, 18%, 28% — before creating products."
        />
      </Card>

      <Dialog open={open} onOpenChange={(next) => !save.isPending && setOpen(next)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit GST rate' : 'New GST rate'}</DialogTitle>
            <DialogDescription>GST is always chosen per product; this list is the allowed set.</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <Field label="Display name" required hint="e.g. GST 5% — Packaged food">
              <Input
                value={form.name}
                autoFocus
                maxLength={60}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              />
            </Field>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Rate %" required>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={form.rate}
                  onChange={(event) => setForm((current) => ({ ...current, rate: event.target.value }))}
                  className="text-right tabnum"
                />
              </Field>
              <Field label="Cess %">
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={form.cessRate}
                  onChange={(event) => setForm((current) => ({ ...current, cessRate: event.target.value }))}
                  className="text-right tabnum"
                />
              </Field>
              <Field label="HSN code">
                <Input
                  value={form.hsnCode}
                  maxLength={8}
                  inputMode="numeric"
                  onChange={(event) => setForm((current) => ({ ...current, hsnCode: event.target.value }))}
                  className="text-right tabnum"
                />
              </Field>
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={form.isDefault}
                  onCheckedChange={(checked) => setForm((current) => ({ ...current, isDefault: checked }))}
                />
                Default for new products
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={form.isActive}
                  onCheckedChange={(checked) => setForm((current) => ({ ...current, isActive: checked }))}
                />
                Active
              </label>
            </div>
            {form.rate ? (
              <p className="rounded-md border bg-slate-50 px-3 py-2 text-xs text-muted-foreground">
                Example: a {formatINR(100)} exclusive sale at {form.rate}% collects{' '}
                {formatINR((100 * Number(form.rate)) / 100)} GST.
              </p>
            ) : null}
            {error ? (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={save.isPending}>
              Cancel
            </Button>
            <Button
              loading={save.isPending}
              disabled={!form.name.trim() || form.rate === ''}
              onClick={() => save.mutate()}
            >
              {editing ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
