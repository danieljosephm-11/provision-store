import * as React from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRightLeft,
  Boxes,
  CalendarClock,
  Factory,
  Pencil,
  Plus,
  Trash2,
  TrendingUp,
  Warehouse,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatQty, inventoryAdjustSchema } from '@ps/shared';
import { api, ApiError, buildQuery } from '@/lib/api';
import { formatINR } from '@/lib/shared';
import { formatDate, todayISO } from '@/lib/utils';
import { useAuth } from '@/contexts/auth';
import type {
  CatalogOptions,
  ExpiringBatch,
  InventoryRow,
  Location,
  Paginated,
  Single,
  StockMovement,
  StockTransfer,
  Valuation,
} from '@/lib/types';
import { PageHeader } from '@/components/shared/page-header';
import { DataTable, type Column } from '@/components/shared/data-table';
import { Pagination } from '@/components/shared/pagination';
import { SearchInput } from '@/components/shared/search-input';
import { DateRange } from '@/components/shared/date-range';
import { ProductSelect } from '@/components/shared/entity-select';
import { StatCard } from '@/components/shared/stat-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { Switch } from '@/components/ui/controls';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useDebouncedValue } from '@/lib/hooks';

const MOVEMENT_TYPES = [
  'OPENING',
  'PURCHASE',
  'SALE',
  'SALE_RETURN',
  'PURCHASE_RETURN',
  'ADJUSTMENT_IN',
  'ADJUSTMENT_OUT',
  'DAMAGE',
  'EXPIRY',
  'TRANSFER_IN',
  'TRANSFER_OUT',
];

export function InventoryPage() {
  const { can } = useAuth();
  const [adjustProduct, setAdjustProduct] = React.useState<InventoryRow | null>(null);
  const [adjustOpen, setAdjustOpen] = React.useState(false);

  const openAdjust = (product?: InventoryRow) => {
    setAdjustProduct(product ?? null);
    setAdjustOpen(true);
  };

  return (
    <div>
      <PageHeader
        title="Stock"
        description="Weighted-average inventory, append-only movement ledger, valuation and inter-location transfers."
        actions={
          can('inventory.adjust') ? (
            <Button size="sm" onClick={() => openAdjust()}>
              <Plus className="h-4 w-4" /> Stock adjustment
            </Button>
          ) : undefined
        }
      />

      <Tabs defaultValue="stock">
        <TabsList>
          <TabsTrigger value="stock">On hand</TabsTrigger>
          <TabsTrigger value="movements">Movements</TabsTrigger>
          <TabsTrigger value="valuation">Valuation</TabsTrigger>
          <TabsTrigger value="expiring">Expiring</TabsTrigger>
          <TabsTrigger value="transfers">Transfers & locations</TabsTrigger>
        </TabsList>

        <TabsContent value="stock">
          <StockTab canAdjust={can('inventory.adjust')} onAdjust={openAdjust} />
        </TabsContent>
        <TabsContent value="movements">
          <MovementsTab />
        </TabsContent>
        <TabsContent value="valuation">
          <ValuationTab />
        </TabsContent>
        <TabsContent value="expiring">
          <ExpiringTab />
        </TabsContent>
        <TabsContent value="transfers">
          <TransfersTab canTransfer={can('inventory.transfer')} />
        </TabsContent>
      </Tabs>

      <AdjustDialog open={adjustOpen} onOpenChange={setAdjustOpen} product={adjustProduct} />
    </div>
  );
}

function StockTab({
  canAdjust,
  onAdjust,
}: {
  canAdjust: boolean;
  onAdjust: (product: InventoryRow) => void;
}) {
  const [search, setSearch] = React.useState('');
  const debounced = useDebouncedValue(search, 250);
  const [stockStatus, setStockStatus] = React.useState('');
  const [categoryId, setCategoryId] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(20);

  const { data: options } = useQuery({
    queryKey: ['catalog-options'],
    queryFn: () => api.get<Single<CatalogOptions>>('/catalog/options').then((res) => res.item),
    staleTime: 5 * 60_000,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['inventory', { debounced, stockStatus, categoryId, page, pageSize }],
    queryFn: () =>
      api.get<Paginated<InventoryRow>>(
        `/inventory${buildQuery({ search: debounced, stockStatus, categoryId, page, pageSize, sortBy: 'name' })}`,
      ),
    placeholderData: keepPreviousData,
  });

  const rows = data?.items ?? [];
  const pageValue = rows.reduce((sum, row) => sum + row.costValue, 0);

  const columns: Column<InventoryRow>[] = [
    {
      key: 'product',
      header: 'Product',
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-800">{row.name}</p>
          <p className="text-[11px] text-muted-foreground">
            {row.sku} · {row.unit.code}
            {row.category ? ` · ${row.category.name}` : ''}
          </p>
        </div>
      ),
    },
    {
      key: 'onHand',
      header: 'On hand',
      align: 'right',
      cell: (row) => (
        <div className="text-right">
          <p className={`tabnum font-medium ${row.outOfStock ? 'text-red-600' : row.lowStock ? 'text-amber-600' : ''}`}>
            {formatQty(row.quantity)}
          </p>
          <p className="text-[10px] text-muted-foreground">min {formatQty(row.minStock)}</p>
        </div>
      ),
    },
    {
      key: 'avgCost',
      header: 'Avg cost',
      align: 'right',
      cell: (row) => <span className="tabnum text-sm">{formatINR(row.avgCost)}</span>,
    },
    {
      key: 'costValue',
      header: 'Stock value',
      align: 'right',
      cell: (row) => <span className="tabnum text-sm font-medium">{formatINR(row.costValue)}</span>,
    },
    {
      key: 'retail',
      header: 'Retail value',
      align: 'right',
      cell: (row) => <span className="tabnum text-xs text-muted-foreground">{formatINR(row.retailValue)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (row) =>
        row.outOfStock ? (
          <Badge variant="destructive">Out of stock</Badge>
        ) : row.lowStock ? (
          <Badge variant="warning">Low stock</Badge>
        ) : (
          <Badge variant="success">In stock</Badge>
        ),
    },
    ...(canAdjust
      ? [
          {
            key: 'actions',
            header: '',
            align: 'right' as const,
            cell: (row: InventoryRow) => (
              <Button variant="outline" size="sm" onClick={() => onAdjust(row)}>
                Adjust
              </Button>
            ),
          },
        ]
      : []),
  ];

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-2 border-b p-3 lg:flex-row lg:items-center">
        <SearchInput
          value={search}
          onChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          placeholder="Search product, SKU or barcode…"
          className="w-full lg:max-w-xs"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Select
            className="h-9 w-[150px]"
            value={stockStatus}
            aria-label="Filter by stock status"
            onChange={(event) => {
              setStockStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="">Any stock</option>
            <option value="in">In stock</option>
            <option value="low">Low stock</option>
            <option value="out">Out of stock</option>
          </Select>
          <Select
            className="h-9 w-[170px]"
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
        </div>
        <span className="ml-auto text-xs text-muted-foreground">
          Cost value on page <span className="font-medium text-slate-700 tabnum">{formatINR(pageValue)}</span>
        </span>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        loading={isLoading}
        emptyTitle="No stock records"
        emptyDescription="Stock appears here after purchases or opening adjustments."
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
  );
}

function MovementsTab() {
  const [search, setSearch] = React.useState('');
  const debounced = useDebouncedValue(search, 250);
  const [type, setType] = React.useState('');
  const [range, setRange] = React.useState({ from: '', to: '' });
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(20);

  const { data, isLoading } = useQuery({
    queryKey: ['inventory', 'movements', { debounced, type, range, page, pageSize }],
    queryFn: () =>
      api.get<Paginated<StockMovement>>(
        `/inventory/movements${buildQuery({
          search: debounced,
          type,
          from: range.from,
          to: range.to,
          page,
          pageSize,
        })}`,
      ),
    placeholderData: keepPreviousData,
  });

  const columns: Column<StockMovement>[] = [
    {
      key: 'when',
      header: 'When',
      cell: (row) => (
        <div>
          <p className="text-xs font-medium">{formatDate(row.createdAt, true)}</p>
          <p className="text-[10px] text-muted-foreground">#{row.seq}</p>
        </div>
      ),
    },
    {
      key: 'product',
      header: 'Product',
      cell: (row) => (
        <div>
          <p className="truncate text-sm font-medium">{row.product.name}</p>
          <p className="text-[11px] text-muted-foreground">
            {row.product.sku}
            {row.batch ? ` · batch ${row.batch.batchNo}` : ''}
          </p>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      cell: (row) => <Badge variant="outline">{row.type.replace(/_/g, ' ')}</Badge>,
    },
    {
      key: 'quantity',
      header: 'Qty',
      align: 'right',
      cell: (row) => (
        <span className={`tabnum font-medium ${row.quantity < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
          {row.quantity > 0 ? '+' : ''}
          {formatQty(row.quantity)}
        </span>
      ),
    },
    {
      key: 'balance',
      header: 'Balance',
      align: 'right',
      cell: (row) => <span className="tabnum text-sm">{formatQty(row.balanceAfter)}</span>,
    },
    {
      key: 'note',
      header: 'Reference',
      cell: (row) => (
        <div className="max-w-[260px]">
          <p className="truncate text-xs">{row.note ?? row.referenceType?.replace(/_/g, ' ') ?? '—'}</p>
          <p className="text-[10px] text-muted-foreground">{row.user?.name ?? 'System'}</p>
        </div>
      ),
    },
  ];

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-2 border-b p-3 lg:flex-row lg:items-center">
        <SearchInput
          value={search}
          onChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          placeholder="Search product, SKU…"
          className="w-full lg:max-w-xs"
        />
        <Select
          className="h-9 w-[170px]"
          value={type}
          aria-label="Filter by movement type"
          onChange={(event) => {
            setType(event.target.value);
            setPage(1);
          }}
        >
          <option value="">All movement types</option>
          {MOVEMENT_TYPES.map((option) => (
            <option key={option} value={option}>
              {option.replace(/_/g, ' ')}
            </option>
          ))}
        </Select>
        <DateRange
          from={range.from}
          to={range.to}
          compact
          onChange={(next) => {
            setRange(next);
            setPage(1);
          }}
        />
      </div>

      <DataTable
        columns={columns}
        rows={data?.items}
        rowKey={(row) => row.id}
        loading={isLoading}
        emptyTitle="No stock movements"
        emptyDescription="Sales, purchases, returns and adjustments all post to this ledger."
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
  );
}

function ValuationTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['inventory', 'valuation'],
    queryFn: () => api.get<Single<Valuation>>('/inventory/valuation').then((res) => res.item),
  });

  if (isLoading || !data) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="h-24 animate-pulse bg-slate-100/70" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Cost value" value={formatINR(data.totals.costValue)} icon={Warehouse} tone="emerald" />
        <StatCard label="Retail value" value={formatINR(data.totals.retailValue)} icon={TrendingUp} tone="sky" />
        <StatCard
          label="Potential margin"
          value={formatINR(data.totals.potentialMargin)}
          hint={
            data.totals.retailValue > 0
              ? `${((data.totals.potentialMargin / data.totals.retailValue) * 100).toFixed(1)}% of retail`
              : undefined
          }
          icon={TrendingUp}
          tone="violet"
        />
        <StatCard
          label="Units on hand"
          value={formatQty(data.totals.quantity)}
          hint={`${data.totals.products} products`}
          icon={Boxes}
          tone="amber"
        />
      </div>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Valuation by category</CardTitle>
        </CardHeader>
        <DataTable
          columns={[
            { key: 'category', header: 'Category', cell: (row: Valuation['byCategory'][number]) => <span className="font-medium">{row.category}</span> },
            { key: 'products', header: 'Products', align: 'right', cell: (row: Valuation['byCategory'][number]) => <span className="tabnum">{row.products}</span> },
            { key: 'qty', header: 'Units', align: 'right', cell: (row: Valuation['byCategory'][number]) => <span className="tabnum">{formatQty(row.quantity)}</span> },
            { key: 'cost', header: 'Cost value', align: 'right', cell: (row: Valuation['byCategory'][number]) => <span className="tabnum font-medium">{formatINR(row.costValue)}</span> },
            { key: 'retail', header: 'Retail value', align: 'right', cell: (row: Valuation['byCategory'][number]) => <span className="tabnum text-muted-foreground">{formatINR(row.retailValue)}</span> },
          ]}
          rows={data.byCategory}
          rowKey={(row) => row.category}
          emptyTitle="No inventory to value"
        />
      </Card>
    </div>
  );
}

function ExpiringTab() {
  const [days, setDays] = React.useState(30);
  const { data, isLoading } = useQuery({
    queryKey: ['inventory', 'expiring', days],
    queryFn: () => api.get<{ items: ExpiringBatch[] }>(`/inventory/expiring?days=${days}`).then((res) => res.items),
  });

  const columns: Column<ExpiringBatch>[] = [
    {
      key: 'product',
      header: 'Product',
      cell: (row) => (
        <div>
          <p className="text-sm font-medium">{row.product.name}</p>
          <p className="text-[11px] text-muted-foreground">
            {row.product.sku} · batch {row.batchNo}
          </p>
        </div>
      ),
    },
    {
      key: 'expiry',
      header: 'Expiry',
      cell: (row) => (
        <div>
          <p className="text-sm">{formatDate(row.expiryDate)}</p>
          <p className={`text-[11px] ${row.expired ? 'text-red-600' : 'text-muted-foreground'}`}>
            {row.expired ? 'Expired' : `${row.daysRemaining} days left`}
          </p>
        </div>
      ),
    },
    {
      key: 'quantity',
      header: 'Qty',
      align: 'right',
      cell: (row) => <span className="tabnum">{formatQty(row.quantity)} {row.product.unit.code}</span>,
    },
    {
      key: 'value',
      header: 'Cost value',
      align: 'right',
      cell: (row) => <span className="tabnum">{formatINR(row.quantity * row.purchasePrice)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (row) =>
        row.expired ? <Badge variant="destructive">Expired</Badge> : <Badge variant="warning">Expiring soon</Badge>,
    },
  ];

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b p-3">
        <p className="text-xs text-muted-foreground">Batches with stock that expire within the window.</p>
        <Select
          className="h-9 w-[150px]"
          value={days}
          aria-label="Expiry window"
          onChange={(event) => setDays(Number(event.target.value))}
        >
          <option value={7}>Next 7 days</option>
          <option value={30}>Next 30 days</option>
          <option value={60}>Next 60 days</option>
          <option value={90}>Next 90 days</option>
        </Select>
      </div>
      <DataTable
        columns={columns}
        rows={data}
        rowKey={(row) => row.id}
        loading={isLoading}
        emptyTitle="Nothing expiring soon"
        emptyDescription="Only products with expiry tracking and remaining stock appear here."
      />
    </Card>
  );
}

function TransfersTab({ canTransfer }: { canTransfer: boolean }) {
  const queryClient = useQueryClient();
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(20);
  const [transferOpen, setTransferOpen] = React.useState(false);
  const [locationOpen, setLocationOpen] = React.useState(false);
  const [editingLocation, setEditingLocation] = React.useState<Location | null>(null);
  const [locationForm, setLocationForm] = React.useState({ name: '', isDefault: false });
  const [deleteLocation, setDeleteLocation] = React.useState<Location | null>(null);

  const transfers = useQuery({
    queryKey: ['inventory', 'transfers', page, pageSize],
    queryFn: () => api.get<Paginated<StockTransfer>>(`/inventory/transfers${buildQuery({ page, pageSize })}`),
    placeholderData: keepPreviousData,
  });

  const locations = useQuery({
    queryKey: ['inventory', 'locations'],
    queryFn: () => api.get<{ items: Location[] }>('/inventory/locations').then((res) => res.items),
  });

  const saveLocation = useMutation({
    mutationFn: () =>
      editingLocation
        ? api.patch(`/inventory/locations/${editingLocation.id}`, locationForm)
        : api.post('/inventory/locations', locationForm),
    onSuccess: () => {
      toast.success(editingLocation ? 'Location updated' : 'Location created');
      setLocationOpen(false);
      queryClient.invalidateQueries({ queryKey: ['inventory', 'locations'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not save the location'),
  });

  const removeLocation = useMutation({
    mutationFn: (location: Location) => api.del(`/inventory/locations/${location.id}`),
    onSuccess: () => {
      toast.success('Location deleted');
      setDeleteLocation(null);
      queryClient.invalidateQueries({ queryKey: ['inventory', 'locations'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not delete the location'),
  });

  const openLocation = (location: Location | null) => {
    setEditingLocation(location);
    setLocationForm({ name: location?.name ?? '', isDefault: location?.isDefault ?? false });
    setLocationOpen(true);
  };

  const locationName = (id: string) => locations.data?.find((location) => location.id === id)?.name ?? id;

  const columns: Column<StockTransfer>[] = [
    {
      key: 'ref',
      header: 'Transfer',
      cell: (row) => (
        <div>
          <p className="font-medium">{row.referenceNo}</p>
          <p className="text-[11px] text-muted-foreground">{formatDate(row.createdAt, true)}</p>
        </div>
      ),
    },
    {
      key: 'route',
      header: 'Route',
      cell: (row) => (
        <div className="flex items-center gap-1.5 text-xs">
          <span>{locationName(row.fromLocationId)}</span>
          <ArrowRightLeft className="h-3 w-3 text-muted-foreground" />
          <span>{locationName(row.toLocationId)}</span>
        </div>
      ),
    },
    {
      key: 'items',
      header: 'Items',
      cell: (row) => (
        <div className="text-xs">
          <p>{row.items.length} product{row.items.length === 1 ? '' : 's'}</p>
          <p className="text-[11px] text-muted-foreground">
            {row.items
              .slice(0, 2)
              .map((item) => item.product?.name ?? 'Product')
              .join(', ')}
            {row.items.length > 2 ? ` +${row.items.length - 2}` : ''}
          </p>
        </div>
      ),
    },
    {
      key: 'qty',
      header: 'Units',
      align: 'right',
      cell: (row) => (
        <span className="tabnum">{formatQty(row.items.reduce((sum, item) => sum + item.quantity, 0))}</span>
      ),
    },
    {
      key: 'note',
      header: 'Note',
      cell: (row) => <span className="text-xs text-muted-foreground">{row.note ?? '—'}</span>,
    },
  ];

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <Card className="overflow-hidden">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Stock transfers</CardTitle>
          {canTransfer ? (
            <Button size="sm" onClick={() => setTransferOpen(true)}>
              <Plus className="h-4 w-4" /> New transfer
            </Button>
          ) : null}
        </CardHeader>
        <DataTable
          columns={columns}
          rows={transfers.data?.items}
          rowKey={(row) => row.id}
          loading={transfers.isLoading}
          emptyTitle="No transfers yet"
          emptyDescription="Move stock between shop floor, godown or warehouse locations."
        />
        <Pagination
          meta={transfers.data?.meta}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Locations</CardTitle>
          {canTransfer ? (
            <Button size="sm" variant="outline" onClick={() => openLocation(null)}>
              <Plus className="h-3.5 w-3.5" /> Add
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="p-0">
          {locations.isLoading ? (
            <p className="px-4 py-8 text-center text-xs text-muted-foreground">Loading locations…</p>
          ) : (locations.data?.length ?? 0) === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-muted-foreground">No locations configured.</p>
          ) : (
            <div className="divide-y">
              {locations.data?.map((location) => (
                <div key={location.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{location.name}</p>
                    {location.isDefault ? <Badge variant="info">Default</Badge> : null}
                  </div>
                  {canTransfer ? (
                    <div className="flex shrink-0 items-center gap-0.5">
                      <Button variant="ghost" size="iconSm" aria-label={`Edit ${location.name}`} onClick={() => openLocation(location)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="iconSm"
                        disabled={location.isDefault}
                        aria-label={`Delete ${location.name}`}
                        onClick={() => setDeleteLocation(location)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <TransferDialog open={transferOpen} onOpenChange={setTransferOpen} locations={locations.data ?? []} />

      <Dialog open={locationOpen} onOpenChange={(next) => !saveLocation.isPending && setLocationOpen(next)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingLocation ? 'Edit location' : 'New location'}</DialogTitle>
            <DialogDescription>Locations split stock without changing its total value.</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <Field label="Name" required>
              <Input
                value={locationForm.name}
                autoFocus
                maxLength={80}
                onChange={(event) => setLocationForm((current) => ({ ...current, name: event.target.value }))}
              />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={locationForm.isDefault}
                onCheckedChange={(checked) => setLocationForm((current) => ({ ...current, isDefault: checked }))}
              />
              Make this the default location
            </label>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLocationOpen(false)} disabled={saveLocation.isPending}>
              Cancel
            </Button>
            <Button
              loading={saveLocation.isPending}
              disabled={!locationForm.name.trim()}
              onClick={() => saveLocation.mutate()}
            >
              {editingLocation ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteLocation}
        onOpenChange={(open) => !open && setDeleteLocation(null)}
        title={`Delete ${deleteLocation?.name}?`}
        description="Only locations with no stock history can be deleted."
        confirmLabel="Delete"
        loading={removeLocation.isPending}
        onConfirm={() => deleteLocation && removeLocation.mutate(deleteLocation)}
      />
    </div>
  );
}

function AdjustDialog({
  open,
  onOpenChange,
  product,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: InventoryRow | null;
}) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = React.useState<InventoryRow | null>(product);
  const [type, setType] = React.useState<'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT' | 'DAMAGE' | 'EXPIRY' | 'OPENING'>(
    'ADJUSTMENT_IN',
  );
  const [quantity, setQuantity] = React.useState('');
  const [note, setNote] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setSelected(product);
    setType('ADJUSTMENT_IN');
    setQuantity('');
    setNote('');
    setError(null);
  }, [open, product]);

  const save = useMutation({
    mutationFn: (payload: unknown) => api.post('/inventory/adjust', payload),
    onSuccess: () => {
      toast.success('Stock adjusted');
      onOpenChange(false);
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not adjust stock'),
  });

  const submit = () => {
    setError(null);
    const parsed = inventoryAdjustSchema.safeParse({
      productId: selected?.id ?? '',
      type,
      quantity: Number(quantity) || 0,
      note: note.trim(),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the form');
      return;
    }
    save.mutate(parsed.data);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !save.isPending && onOpenChange(next)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Stock adjustment</DialogTitle>
          <DialogDescription>
            Every adjustment writes an append-only movement and an audit entry. Use damages and expiry for write-offs.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          {selected ? (
            <div className="rounded-lg border bg-slate-50 px-3 py-2">
              <p className="text-sm font-medium">{selected.name}</p>
              <p className="text-[11px] text-muted-foreground">
                {selected.sku} · on hand {formatQty(selected.quantity)} {selected.unit.code} · avg cost{' '}
                {formatINR(selected.avgCost)}
              </p>
              <button
                type="button"
                className="mt-1 text-[11px] font-medium text-primary hover:underline"
                onClick={() => setSelected(null)}
              >
                Choose a different product
              </button>
            </div>
          ) : (
            <Field label="Product" required>
              <ProductSelect
                onSelect={(product) =>
                  setSelected({
                    id: product.id,
                    name: product.name,
                    sku: product.sku,
                    barcode: product.barcode,
                    unit: product.unit,
                    category: product.category,
                    brand: product.brand,
                    taxRate: product.taxRate,
                    sellingPrice: product.sellingPrice,
                    purchasePrice: product.purchasePrice ?? 0,
                    priceIncludesTax: product.priceIncludesTax,
                    trackBatches: product.trackBatches,
                    trackExpiry: product.trackExpiry,
                    quantity: product.stock,
                    minStock: product.minStock,
                    avgCost: 0,
                    costValue: 0,
                    retailValue: 0,
                    lowStock: product.lowStock,
                    outOfStock: product.outOfStock,
                    updatedAt: null,
                  })
                }
              />
            </Field>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Movement type" required>
              <Select value={type} onChange={(event) => setType(event.target.value as typeof type)}>
                <option value="ADJUSTMENT_IN">Stock in</option>
                <option value="ADJUSTMENT_OUT">Stock out</option>
                <option value="DAMAGE">Damage</option>
                <option value="EXPIRY">Expiry write-off</option>
                <option value="OPENING">Opening stock</option>
              </Select>
            </Field>
            <Field label="Quantity" required>
              <Input
                type="number"
                min="0.001"
                step="any"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                className="text-right tabnum"
              />
            </Field>
          </div>

          <Field label="Reason" required>
            <Textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Physical count correction, breakage, expired stock…"
              className="min-h-[64px]"
            />
          </Field>

          {error ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>
            Cancel
          </Button>
          <Button loading={save.isPending} disabled={!selected || !quantity} onClick={submit}>
            Post adjustment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TransferDialog({
  open,
  onOpenChange,
  locations,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locations: Location[];
}) {
  const queryClient = useQueryClient();
  const [from, setFrom] = React.useState('');
  const [to, setTo] = React.useState('');
  const [note, setNote] = React.useState('');
  const [items, setItems] = React.useState<{ key: string; product: { id: string; name: string; sku: string }; quantity: string }[]>(
    [],
  );
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    const defaultLocation = locations.find((location) => location.isDefault) ?? locations[0];
    setFrom(defaultLocation?.id ?? '');
    setTo(locations.find((location) => location.id !== defaultLocation?.id)?.id ?? '');
    setNote('');
    setItems([]);
    setError(null);
  }, [open, locations]);

  const create = useMutation({
    mutationFn: () =>
      api.post('/inventory/transfers', {
        fromLocationId: from,
        toLocationId: to,
        note: note.trim() || null,
        items: items.map((item) => ({ productId: item.product.id, quantity: Number(item.quantity) || 0 })),
      }),
    onSuccess: () => {
      toast.success('Stock transferred');
      onOpenChange(false);
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not create the transfer'),
  });

  const invalid =
    !from ||
    !to ||
    from === to ||
    items.length === 0 ||
    items.some((item) => !(Number(item.quantity) > 0));

  return (
    <Dialog open={open} onOpenChange={(next) => !create.isPending && onOpenChange(next)}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>New stock transfer</DialogTitle>
          <DialogDescription>Stock leaves the source location and arrives at the destination in one transaction.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="From" required>
              <Select value={from} onChange={(event) => setFrom(event.target.value)}>
                <option value="">Select location</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="To" required error={from && from === to ? 'Choose a different destination' : undefined}>
              <Select value={to} onChange={(event) => setTo(event.target.value)}>
                <option value="">Select location</option>
                {locations
                  .filter((location) => location.id !== from)
                  .map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
              </Select>
            </Field>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium">Products</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setItems((current) => [
                    ...current,
                    { key: crypto.randomUUID(), product: { id: '', name: '', sku: '' }, quantity: '' },
                  ])
                }
              >
                <Plus className="h-3.5 w-3.5" /> Add product
              </Button>
            </div>
            {items.length === 0 ? (
              <p className="rounded-md border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
                Add at least one product to transfer.
              </p>
            ) : (
              <div className="space-y-2">
                {items.map((item, index) => (
                  <div key={item.key} className="grid grid-cols-[minmax(0,1fr)_100px_28px] items-start gap-2">
                    {item.product.id ? (
                      <div className="flex h-9 items-center justify-between rounded-md border bg-slate-50 px-2.5 text-xs">
                        <span className="truncate">{item.product.name}</span>
                        <button
                          type="button"
                          className="ml-2 text-[10px] text-primary hover:underline"
                          onClick={() =>
                            setItems((current) =>
                              current.map((entry, i) =>
                                i === index ? { ...entry, product: { id: '', name: '', sku: '' } } : entry,
                              ),
                            )
                          }
                        >
                          Change
                        </button>
                      </div>
                    ) : (
                      <ProductSelect
                        onSelect={(product) =>
                          setItems((current) =>
                            current.map((entry, i) =>
                              i === index
                                ? { ...entry, product: { id: product.id, name: product.name, sku: product.sku } }
                                : entry,
                            ),
                          )
                        }
                        placeholder="Select product…"
                      />
                    )}
                    <Input
                      type="number"
                      min="0.001"
                      step="any"
                      placeholder="Qty"
                      value={item.quantity}
                      onChange={(event) =>
                        setItems((current) =>
                          current.map((entry, i) => (i === index ? { ...entry, quantity: event.target.value } : entry)),
                        )
                      }
                      className="text-right tabnum"
                      aria-label={`Quantity for ${item.product.name || `product ${index + 1}`}`}
                    />
                    <Button
                      variant="ghost"
                      size="iconSm"
                      aria-label="Remove product"
                      onClick={() => setItems((current) => current.filter((_, i) => i !== index))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Field label="Note">
            <Input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Replenishing the shop floor…"
              maxLength={500}
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
          <Button loading={create.isPending} disabled={invalid} onClick={() => create.mutate()}>
            <ArrowRightLeft className="h-4 w-4" /> Transfer stock
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
