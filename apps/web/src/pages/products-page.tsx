import * as React from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  Barcode,
  Download,
  Loader2,
  Package,
  Pencil,
  Plus,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatQty, productSchema } from '@ps/shared';
import { api, ApiError, buildQuery, openDocument } from '@/lib/api';
import { formatINR } from '@/lib/shared';
import { useDebouncedValue } from '@/lib/hooks';
import { useAuth } from '@/contexts/auth';
import type { CatalogOptions, Paginated, Product, Single } from '@/lib/types';
import { PageHeader } from '@/components/shared/page-header';
import { DataTable, type Column } from '@/components/shared/data-table';
import { Pagination } from '@/components/shared/pagination';
import { SearchInput } from '@/components/shared/search-input';
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
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { Switch } from '@/components/ui/controls';

interface ImportResult {
  imported: number;
  updated: number;
  skipped: number;
  errors: { row: number; message: string }[];
}

export function ProductsPage() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const fileRef = React.useRef<HTMLInputElement>(null);

  const [search, setSearch] = React.useState('');
  const debounced = useDebouncedValue(search, 250);
  const [status, setStatus] = React.useState('ACTIVE');
  const [stockStatus, setStockStatus] = React.useState('');
  const [categoryId, setCategoryId] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(20);

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Product | null>(null);
  const [archiveTarget, setArchiveTarget] = React.useState<Product | null>(null);
  const [importResult, setImportResult] = React.useState<ImportResult | null>(null);

  const { data: options } = useQuery({
    queryKey: ['catalog-options'],
    queryFn: () => api.get<Single<CatalogOptions>>('/catalog/options').then((res) => res.item),
    staleTime: 5 * 60_000,
  });

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['products', { debounced, status, stockStatus, categoryId, page, pageSize }],
    queryFn: () =>
      api.get<Paginated<Product>>(
        `/products${buildQuery({ search: debounced, status, stockStatus, categoryId, page, pageSize })}`,
      ),
    placeholderData: keepPreviousData,
  });

  const archive = useMutation({
    mutationFn: (product: Product) =>
      api.post(`/products/${product.id}/${product.status === 'ARCHIVED' ? 'restore' : 'archive'}`),
    onSuccess: (_res, product) => {
      toast.success(product.status === 'ARCHIVED' ? 'Product restored' : 'Product archived');
      setArchiveTarget(null);
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['catalog-options'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not update the product'),
  });

  const importFile = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return api.upload<ImportResult>('/products/import', form);
    },
    onSuccess: (result) => {
      setImportResult(result);
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['catalog-options'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Import failed'),
  });

  const rows = data?.items ?? [];

  const columns: Column<Product>[] = [
    {
      key: 'product',
      header: 'Product',
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-800">{row.name}</p>
          <p className="text-[11px] text-muted-foreground">
            {row.sku}
            {row.barcode ? ` · ${row.barcode}` : ''}
          </p>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      cell: (row) => (
        <div className="text-xs">
          <p>{row.category?.name ?? 'Uncategorised'}</p>
          <p className="text-[11px] text-muted-foreground">{row.brand?.name ?? 'No brand'}</p>
        </div>
      ),
    },
    {
      key: 'gst',
      header: 'GST',
      align: 'center',
      cell: (row) => (
        <div className="text-center">
          <p className="text-xs font-medium">{row.taxRate ? `${row.taxRate.rate}%` : '—'}</p>
          <p className="text-[10px] text-muted-foreground">{row.priceIncludesTax ? 'incl.' : 'excl.'}</p>
        </div>
      ),
    },
    {
      key: 'selling',
      header: 'Selling',
      align: 'right',
      cell: (row) => (
        <div className="text-right">
          <p className="tabnum font-medium">{formatINR(row.sellingPrice)}</p>
          <p className="text-[10px] text-muted-foreground">
            MRP {formatINR(row.mrp)} · {row.unit.code}
          </p>
        </div>
      ),
    },
    {
      key: 'stock',
      header: 'Stock',
      align: 'right',
      cell: (row) => (
        <div className="text-right">
          <p className={`tabnum ${row.outOfStock ? 'text-red-600' : row.lowStock ? 'text-amber-600' : ''}`}>
            {formatQty(row.stock)}
          </p>
          {row.lowStock || row.outOfStock ? (
            <p className="text-[10px] text-muted-foreground">min {formatQty(row.minStock)}</p>
          ) : null}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (row) => (
        <div className="flex items-center justify-end gap-1">
          {can('product.update') ? (
            <Button
              variant="ghost"
              size="iconSm"
              title="Edit product"
              aria-label={`Edit ${row.name}`}
              onClick={(event) => {
                event.stopPropagation();
                setEditing(row);
                setFormOpen(true);
              }}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="iconSm"
            title="Print barcode"
            aria-label={`Print barcode for ${row.name}`}
            onClick={(event) => {
              event.stopPropagation();
              void openDocument(`/products/barcode/${encodeURIComponent(row.barcode || row.sku)}`, 'open');
            }}
          >
            <Barcode className="h-3.5 w-3.5" />
          </Button>
          {can('product.archive') ? (
            <Button
              variant="ghost"
              size="iconSm"
              title={row.status === 'ARCHIVED' ? 'Restore product' : 'Archive product'}
              aria-label={row.status === 'ARCHIVED' ? `Restore ${row.name}` : `Archive ${row.name}`}
              onClick={(event) => {
                event.stopPropagation();
                setArchiveTarget(row);
              }}
            >
              <Archive className="h-3.5 w-3.5" />
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Products"
        description="Per-product GST, pricing, stock thresholds, barcodes and batch tracking."
        actions={
          <>
            {can('product.import') ? (
              <>
                <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} loading={importFile.isPending}>
                  <Upload className="h-4 w-4" /> Import
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void openDocument('/products/import-template', 'download', 'product-import-template.xlsx')}
                >
                  Template
                </Button>
              </>
            ) : null}
            {can('product.export') ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void openDocument('/products/export', 'download', `products-${new Date().toISOString().slice(0, 10)}.xlsx`)}
              >
                <Download className="h-4 w-4" /> Export
              </Button>
            ) : null}
            {can('product.create') && options ? (
              <Button
                size="sm"
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                <Plus className="h-4 w-4" /> Add product
              </Button>
            ) : null}
          </>
        }
      />

      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) importFile.mutate(file);
        }}
      />

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-2 border-b p-3 lg:flex-row lg:items-center">
          <SearchInput
            value={search}
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            placeholder="Search name, SKU or barcode…"
            className="w-full lg:max-w-xs"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Select
              className="h-9 w-[150px]"
              value={status}
              aria-label="Filter by product status"
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            >
              <option value="ACTIVE">Active</option>
              <option value="ARCHIVED">Archived</option>
            </Select>
            <Select
              className="h-9 w-[150px]"
              value={categoryId}
              aria-label="Filter by category"
              onChange={(event) => {
                setCategoryId(event.target.value);
                setPage(1);
              }}
            >
              <option value="">All categories</option>
              {options?.categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
            <Select
              className="h-9 w-[140px]"
              value={stockStatus}
              aria-label="Filter by stock level"
              onChange={(event) => {
                setStockStatus(event.target.value);
                setPage(1);
              }}
            >
              <option value="">Any stock</option>
              <option value="low">Low stock</option>
              <option value="out">Out of stock</option>
            </Select>
          </div>
          {isFetching && !isLoading ? (
            <span className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Refreshing
            </span>
          ) : null}
        </div>

        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          loading={isLoading}
          emptyTitle={status === 'ARCHIVED' ? 'No archived products' : 'No products found'}
          emptyDescription="Add a product, import your catalogue from Excel, or clear the filters."
          emptyAction={
            can('product.create') ? (
              <Button
                size="sm"
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                <Plus className="h-4 w-4" /> Add product
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

      <ProductFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        product={editing}
        options={options}
      />

      <ConfirmDialog
        open={!!archiveTarget}
        onOpenChange={(open) => !open && setArchiveTarget(null)}
        title={archiveTarget?.status === 'ARCHIVED' ? `Restore ${archiveTarget?.name}?` : `Archive ${archiveTarget?.name}?`}
        description={
          archiveTarget?.status === 'ARCHIVED'
            ? 'The product will be sellable again and visible at the POS.'
            : 'Archived products disappear from the POS but past invoices and stock history stay intact.'
        }
        confirmLabel={archiveTarget?.status === 'ARCHIVED' ? 'Restore' : 'Archive'}
        loading={archive.isPending}
        onConfirm={() => archiveTarget && archive.mutate(archiveTarget)}
      />

      <Dialog open={!!importResult} onOpenChange={(open) => !open && setImportResult(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Import finished</DialogTitle>
            <DialogDescription>Rows are matched by SKU. Existing SKUs are updated.</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <Summary label="Imported" value={importResult?.imported ?? 0} />
              <Summary label="Updated" value={importResult?.updated ?? 0} />
              <Summary label="Skipped" value={importResult?.skipped ?? 0} />
            </div>
            {importResult && importResult.errors.length > 0 ? (
              <div className="max-h-52 overflow-auto rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-800">
                <p className="mb-1 font-medium">Rows with problems</p>
                <ul className="space-y-1">
                  {importResult.errors.map((err, index) => (
                    <li key={index}>
                      Row {err.row}: {err.message}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No row-level errors.</p>
            )}
          </DialogBody>
          <DialogFooter>
            <Button onClick={() => setImportResult(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-slate-50 px-3 py-2 text-center">
      <p className="text-lg font-semibold tabnum">{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}

interface ProductFormState {
  name: string;
  sku: string;
  barcode: string;
  categoryId: string;
  brandId: string;
  unitId: string;
  taxRateId: string;
  description: string;
  imageUrl: string;
  purchasePrice: string;
  sellingPrice: string;
  mrp: string;
  priceIncludesTax: boolean;
  hsnCode: string;
  minStock: string;
  trackBatches: boolean;
  trackExpiry: boolean;
}

const emptyForm: ProductFormState = {
  name: '',
  sku: '',
  barcode: '',
  categoryId: '',
  brandId: '',
  unitId: '',
  taxRateId: '',
  description: '',
  imageUrl: '',
  purchasePrice: '',
  sellingPrice: '',
  mrp: '',
  priceIncludesTax: true,
  hsnCode: '',
  minStock: '0',
  trackBatches: false,
  trackExpiry: false,
};

function ProductFormDialog({
  open,
  onOpenChange,
  product,
  options,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: Product | null;
  options?: CatalogOptions;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = React.useState<ProductFormState>(emptyForm);
  const [error, setError] = React.useState<string | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const imageRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!open) return;
    setError(null);
    if (product) {
      setForm({
        name: product.name,
        sku: product.sku,
        barcode: product.barcode ?? '',
        categoryId: product.category?.id ?? '',
        brandId: product.brand?.id ?? '',
        unitId: product.unit.id,
        taxRateId: product.taxRate?.id ?? '',
        description: product.description ?? '',
        imageUrl: product.imageUrl ?? '',
        purchasePrice: product.purchasePrice !== undefined ? String(product.purchasePrice) : '',
        sellingPrice: String(product.sellingPrice),
        mrp: String(product.mrp),
        priceIncludesTax: product.priceIncludesTax,
        hsnCode: product.hsnCode ?? '',
        minStock: String(product.minStock),
        trackBatches: product.trackBatches,
        trackExpiry: product.trackExpiry,
      });
    } else {
      setForm({
        ...emptyForm,
        unitId: options?.units[0]?.id ?? '',
        taxRateId: options?.taxRates.find((tax) => tax.isDefault)?.id ?? options?.taxRates[0]?.id ?? '',
      });
    }
  }, [open, product, options]);

  const save = useMutation({
    mutationFn: (payload: unknown) =>
      product
        ? api.patch<Single<Product>>(`/products/${product.id}`, payload)
        : api.post<Single<Product>>('/products', payload),
    onSuccess: ({ item }) => {
      toast.success(product ? `${item.name} updated` : `${item.name} created`);
      onOpenChange(false);
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['catalog-options'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['pos-search'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not save the product'),
  });

  const uploadImage = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const result = await api.upload<{ url: string }>('/products/import-image', formData);
      setForm((current) => ({ ...current, imageUrl: result.url }));
      toast.success('Image uploaded');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not upload the image');
    } finally {
      setUploading(false);
    }
  };

  const submit = () => {
    setError(null);
    const parsed = productSchema.safeParse({
      name: form.name,
      sku: form.sku,
      barcode: form.barcode || null,
      categoryId: form.categoryId || null,
      brandId: form.brandId || null,
      unitId: form.unitId,
      taxRateId: form.taxRateId || null,
      description: form.description || null,
      imageUrl: form.imageUrl || null,
      purchasePrice: Number(form.purchasePrice) || 0,
      sellingPrice: Number(form.sellingPrice) || 0,
      mrp: Number(form.mrp) || 0,
      priceIncludesTax: form.priceIncludesTax,
      hsnCode: form.hsnCode || null,
      minStock: Number(form.minStock) || 0,
      trackBatches: form.trackBatches,
      trackExpiry: form.trackExpiry,
      status: product?.status ?? 'ACTIVE',
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the highlighted fields');
      return;
    }
    if (!form.taxRateId) {
      setError('Choose a GST rate — tax is configured per product, not per store');
      return;
    }
    save.mutate(parsed.data);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !save.isPending && onOpenChange(next)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{product ? `Edit ${product.name}` : 'Add product'}</DialogTitle>
          <DialogDescription>
            GST is chosen per product. Inclusive pricing is the Indian retail default.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Product name" required>
              <Input
                value={form.name}
                autoFocus
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                maxLength={160}
              />
            </Field>
            <Field label="SKU" required>
              <Input
                value={form.sku}
                onChange={(event) => setForm((current) => ({ ...current, sku: event.target.value }))}
                maxLength={60}
              />
            </Field>
            <Field label="Barcode" hint="Leave blank to use the SKU for scanning">
              <Input
                value={form.barcode}
                onChange={(event) => setForm((current) => ({ ...current, barcode: event.target.value }))}
                maxLength={80}
              />
            </Field>
            <Field label="HSN code" hint="4–8 digits">
              <Input
                value={form.hsnCode}
                onChange={(event) => setForm((current) => ({ ...current, hsnCode: event.target.value }))}
                maxLength={8}
                inputMode="numeric"
              />
            </Field>
            <Field label="Category">
              <Select
                value={form.categoryId}
                onChange={(event) => setForm((current) => ({ ...current, categoryId: event.target.value }))}
              >
                <option value="">Uncategorised</option>
                {options?.categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Brand">
              <Select
                value={form.brandId}
                onChange={(event) => setForm((current) => ({ ...current, brandId: event.target.value }))}
              >
                <option value="">No brand</option>
                {options?.brands.map((brand) => (
                  <option key={brand.id} value={brand.id}>
                    {brand.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Selling unit" required>
              <Select
                value={form.unitId}
                onChange={(event) => setForm((current) => ({ ...current, unitId: event.target.value }))}
              >
                <option value="">Select unit</option>
                {options?.units.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.name} ({unit.code})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="GST rate" required hint="Applies to this product only">
              <Select
                value={form.taxRateId}
                onChange={(event) => setForm((current) => ({ ...current, taxRateId: event.target.value }))}
              >
                <option value="">Select GST rate</option>
                {options?.taxRates.map((tax) => (
                  <option key={tax.id} value={tax.id}>
                    {tax.name} · {tax.rate}%{tax.cessRate > 0 ? ` + ${tax.cessRate}% cess` : ''}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Purchase price" hint="Cost to you">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.purchasePrice}
                onChange={(event) => setForm((current) => ({ ...current, purchasePrice: event.target.value }))}
                className="text-right tabnum"
              />
            </Field>
            <Field label="Selling price" required>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.sellingPrice}
                onChange={(event) => setForm((current) => ({ ...current, sellingPrice: event.target.value }))}
                className="text-right tabnum"
              />
            </Field>
            <Field label="MRP">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.mrp}
                onChange={(event) => setForm((current) => ({ ...current, mrp: event.target.value }))}
                className="text-right tabnum"
              />
            </Field>
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border bg-slate-50 px-3 py-2.5">
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={form.priceIncludesTax}
                onCheckedChange={(checked) => setForm((current) => ({ ...current, priceIncludesTax: checked }))}
              />
              Selling price includes GST
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={form.trackBatches}
                onCheckedChange={(checked) => setForm((current) => ({ ...current, trackBatches: checked }))}
              />
              Track batches
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={form.trackExpiry}
                onCheckedChange={(checked) => setForm((current) => ({ ...current, trackExpiry: checked }))}
              />
              Track expiry
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
            <Field label="Minimum stock" hint="Low-stock alert level">
              <Input
                type="number"
                min="0"
                step="any"
                value={form.minStock}
                onChange={(event) => setForm((current) => ({ ...current, minStock: event.target.value }))}
                className="text-right tabnum"
              />
            </Field>
            <Field label="Description">
              <Textarea
                value={form.description}
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                className="min-h-[64px]"
                maxLength={2000}
              />
            </Field>
          </div>

          <div className="flex items-center gap-3 rounded-lg border p-2.5">
            {form.imageUrl ? (
              <img src={form.imageUrl} alt="Product" className="h-12 w-12 rounded-md border object-cover" />
            ) : (
              <span className="flex h-12 w-12 items-center justify-center rounded-md bg-slate-100 text-slate-400">
                <Package className="h-5 w-5" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium">Product image</p>
              <p className="truncate text-[11px] text-muted-foreground">{form.imageUrl || 'No image uploaded'}</p>
            </div>
            <input
              ref={imageRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) void uploadImage(file);
              }}
            />
            <Button variant="outline" size="sm" loading={uploading} onClick={() => imageRef.current?.click()}>
              <Upload className="h-3.5 w-3.5" /> Upload
            </Button>
            {form.imageUrl ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setForm((current) => ({ ...current, imageUrl: '' }))}
              >
                Remove
              </Button>
            ) : null}
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
            {product ? 'Save changes' : 'Create product'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
