import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, PackageSearch, ChevronDown } from 'lucide-react';
import { api, buildQuery } from '@/lib/api';
import { useDebouncedValue } from '@/lib/hooks';
import type { Customer, Paginated, Product, ProductLookup, Supplier } from '@/lib/types';
import { formatINR } from '@/lib/shared';
import { cn } from '@/lib/utils';
import { formatQty } from '@ps/shared';

// ── Product picker ───────────────────────────────────────────────────
interface ProductSelectProps {
  onSelect: (product: Product) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  disabled?: boolean;
}

export function ProductSelect({
  onSelect,
  placeholder = 'Search product by name, SKU or barcode…',
  className,
  autoFocus,
  disabled,
}: ProductSelectProps) {
  const [search, setSearch] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const debounced = useDebouncedValue(search, 250);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const { data, isFetching } = useQuery({
    queryKey: ['product-select', debounced],
    queryFn: () =>
      api.get<Paginated<Product>>(`/products${buildQuery({ search: debounced, pageSize: 12, status: 'ACTIVE' })}`),
    enabled: open,
  });

  const choose = (product: Product) => {
    onSelect(product);
    setSearch('');
    setOpen(false);
  };

  return (
    <div
      ref={containerRef}
      className={cn('relative', className)}
      onBlur={(event) => {
        if (!containerRef.current?.contains(event.relatedTarget as Node)) setOpen(false);
      }}
    >
      <div className="relative">
        <PackageSearch className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          disabled={disabled}
          autoFocus={autoFocus}
          placeholder={placeholder}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setSearch(event.target.value);
            setOpen(true);
          }}
          className="input-base pl-8 pr-8"
        />
        {isFetching && open ? (
          <Loader2 className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        ) : (
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        )}
      </div>
      {open ? (
        <div className="absolute z-40 mt-1 max-h-72 w-full overflow-auto rounded-lg border bg-popover p-1 shadow-pop">
          {(data?.items ?? []).length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              {isFetching ? 'Searching…' : 'No products found'}
            </p>
          ) : (
            data?.items.map((product) => (
              <button
                key={product.id}
                type="button"
                onClick={() => choose(product)}
                className="flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-2 text-left hover:bg-secondary"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{product.name}</span>
                  <span className="block text-[11px] text-muted-foreground">
                    {product.sku} · {product.unit.code} · {formatQty(product.stock)}
                    {product.outOfStock ? ' · out of stock' : ''}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-medium tabnum">{formatINR(product.sellingPrice)}</span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

// ── Customer picker ──────────────────────────────────────────────────
interface CustomerSelectProps {
  value: Customer | null;
  onChange: (customer: Customer | null) => void;
  placeholder?: string;
  className?: string;
  allowClear?: boolean;
  disabled?: boolean;
}

export function CustomerSelect({
  value,
  onChange,
  placeholder = 'Search customer by name or mobile…',
  className,
  allowClear = true,
  disabled,
}: CustomerSelectProps) {
  const [search, setSearch] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const debounced = useDebouncedValue(search, 250);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const { data, isFetching } = useQuery({
    queryKey: ['customer-select', debounced],
    queryFn: () => api.get<Paginated<Customer>>(`/customers${buildQuery({ search: debounced, pageSize: 12 })}`),
    enabled: open,
  });

  if (value) {
    return (
      <div className={cn('flex items-center justify-between gap-2 rounded-md border bg-card px-3 py-2', className)}>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{value.name}</p>
          <p className="text-[11px] text-muted-foreground">
            {value.mobile} · {formatINR(value.outstanding)} due · {value.loyaltyPoints} pts
          </p>
        </div>
        {allowClear ? (
          <button
            type="button"
            className="shrink-0 text-xs font-medium text-primary hover:underline"
            onClick={() => onChange(null)}
          >
            Change
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn('relative', className)}
      onBlur={(event) => {
        if (!containerRef.current?.contains(event.relatedTarget as Node)) setOpen(false);
      }}
    >
      <input
        value={search}
        disabled={disabled}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setSearch(event.target.value);
          setOpen(true);
        }}
        className="input-base"
      />
      {open ? (
        <div className="absolute z-40 mt-1 max-h-64 w-full overflow-auto rounded-lg border bg-popover p-1 shadow-pop">
          {(data?.items ?? []).length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              {isFetching ? 'Searching…' : 'No customers found'}
            </p>
          ) : (
            data?.items.map((customer) => (
              <button
                key={customer.id}
                type="button"
                onClick={() => {
                  onChange(customer);
                  setSearch('');
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-2 text-left hover:bg-secondary"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{customer.name}</span>
                  <span className="block text-[11px] text-muted-foreground">
                    {customer.mobile} · {customer.code}
                  </span>
                </span>
                <span className="shrink-0 text-right text-[11px] text-muted-foreground">
                  {formatINR(customer.outstanding)} due
                </span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

// ── Supplier picker ─────────────────────────────────────────────────
interface SupplierSelectProps {
  value: Supplier | null;
  onChange: (supplier: Supplier | null) => void;
  placeholder?: string;
  className?: string;
  allowClear?: boolean;
  disabled?: boolean;
}

export function SupplierSelect({
  value,
  onChange,
  placeholder = 'Search supplier by name, mobile or GSTIN…',
  className,
  allowClear = true,
  disabled,
}: SupplierSelectProps) {
  const [search, setSearch] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const debounced = useDebouncedValue(search, 250);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const { data, isFetching } = useQuery({
    queryKey: ['supplier-select', debounced],
    queryFn: () => api.get<Paginated<Supplier>>(`/suppliers${buildQuery({ search: debounced, pageSize: 12 })}`),
    enabled: open,
  });

  if (value) {
    return (
      <div className={cn('flex items-center justify-between gap-2 rounded-md border bg-card px-3 py-2', className)}>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{value.name}</p>
          <p className="text-[11px] text-muted-foreground">
            {value.mobile}
            {value.gstin ? ` · ${value.gstin}` : ''}
            {value.outstanding > 0 ? ` · ${formatINR(value.outstanding)} payable` : ''}
          </p>
        </div>
        {allowClear ? (
          <button
            type="button"
            className="shrink-0 text-xs font-medium text-primary hover:underline"
            onClick={() => onChange(null)}
          >
            Change
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn('relative', className)}
      onBlur={(event) => {
        if (!containerRef.current?.contains(event.relatedTarget as Node)) setOpen(false);
      }}
    >
      <input
        value={search}
        disabled={disabled}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setSearch(event.target.value);
          setOpen(true);
        }}
        className="input-base"
      />
      {open ? (
        <div className="absolute z-40 mt-1 max-h-64 w-full overflow-auto rounded-lg border bg-popover p-1 shadow-pop">
          {(data?.items ?? []).length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              {isFetching ? 'Searching…' : 'No suppliers found'}
            </p>
          ) : (
            data?.items.map((supplier) => (
              <button
                key={supplier.id}
                type="button"
                onClick={() => {
                  onChange(supplier);
                  setSearch('');
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-2 text-left hover:bg-secondary"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{supplier.name}</span>
                  <span className="block text-[11px] text-muted-foreground">
                    {supplier.mobile}
                    {supplier.gstin ? ` · ${supplier.gstin}` : ''}
                    {!supplier.isActive ? ' · inactive' : ''}
                  </span>
                </span>
                <span className="shrink-0 text-right text-[11px] text-muted-foreground">
                  {supplier.outstanding > 0 ? `${formatINR(supplier.outstanding)} due` : 'No dues'}
                </span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

// ── Lookup by barcode/SKU ────────────────────────────────────────────
export async function lookupProduct(code: string): Promise<ProductLookup | null> {
  const { item } = await api.get<{ item: ProductLookup | null }>(
    `/products/lookup/${encodeURIComponent(code)}`,
  );
  return item;
}
