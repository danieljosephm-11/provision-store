import * as React from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FolderCog, Pencil, Plus, Receipt, RotateCcw, Trash2, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { expenseSchema } from '@ps/shared';
import { api, ApiError, buildQuery } from '@/lib/api';
import { formatINR } from '@/lib/shared';
import { DEFAULT_FROM, DEFAULT_TO } from '@/lib/display';
import { formatDate } from '@/lib/utils';
import { useDebouncedValue } from '@/lib/hooks';
import { useAuth } from '@/contexts/auth';
import type { Expense, ExpenseCategory, ExpenseSummary, Paginated, Single } from '@/lib/types';
import { PageHeader } from '@/components/shared/page-header';
import { DataTable, type Column } from '@/components/shared/data-table';
import { Pagination } from '@/components/shared/pagination';
import { SearchInput } from '@/components/shared/search-input';
import { DateRange } from '@/components/shared/date-range';
import { StatCard } from '@/components/shared/stat-card';
import { ConfirmReasonDialog } from '@/components/shared/confirm-reason-dialog';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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

const paymentMethods = ['CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'CHEQUE', 'OTHER'] as const;
const today = () => new Date().toISOString().slice(0, 10);

export function ExpensesPage() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = React.useState('');
  const debounced = useDebouncedValue(search, 250);
  const [categoryId, setCategoryId] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [range, setRange] = React.useState({ from: DEFAULT_FROM, to: DEFAULT_TO });
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(20);

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Expense | null>(null);
  const [categoriesOpen, setCategoriesOpen] = React.useState(false);
  const [reversing, setReversing] = React.useState<Expense | null>(null);

  const { data: categoriesData } = useQuery({
    queryKey: ['expense-categories'],
    queryFn: () => api.get<{ items: ExpenseCategory[] }>('/expense-categories').then((res) => res.items),
  });

  const { data: summary } = useQuery({
    queryKey: ['expenses', 'summary', range],
    queryFn: () =>
      api
        .get<Single<ExpenseSummary>>(`/expenses/summary${buildQuery({ from: range.from, to: range.to })}`)
        .then((res) => res.item),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['expenses', { debounced, categoryId, status, range, page, pageSize }],
    queryFn: () =>
      api.get<Paginated<Expense>>(
        `/expenses${buildQuery({
          search: debounced,
          categoryId,
          status,
          from: range.from,
          to: range.to,
          page,
          pageSize,
        })}`,
      ),
    placeholderData: keepPreviousData,
  });

  const reverse = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => api.post(`/expenses/${id}/reverse`, { reason }),
    onSuccess: () => {
      toast.success('Expense reversed');
      setReversing(null);
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not reverse the expense'),
  });

  const topCategory = summary?.items[0];

  const columns: Column<Expense>[] = [
    {
      key: 'expense',
      header: 'Expense',
      cell: (row) => (
        <div>
          <p className="font-medium text-slate-800">{row.expenseNumber}</p>
          <p className="text-[11px] text-muted-foreground">{formatDate(row.expenseDate)}</p>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      cell: (row) => <span className="text-sm">{row.category.name}</span>,
    },
    {
      key: 'vendor',
      header: 'Vendor / reference',
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate text-sm">{row.vendor ?? '—'}</p>
          {row.reference ? <p className="text-[11px] text-muted-foreground">{row.reference}</p> : null}
        </div>
      ),
    },
    {
      key: 'method',
      header: 'Paid via',
      cell: (row) => <span className="text-xs text-muted-foreground">{row.paymentMethod.replace(/_/g, ' ')}</span>,
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      cell: (row) => (
        <span className={`tabnum font-medium ${row.status === 'REVERSED' ? 'text-muted-foreground line-through' : ''}`}>
          {formatINR(row.amount)}
        </span>
      ),
    },
    { key: 'status', header: 'Status', cell: (row) => <StatusBadge status={row.status} /> },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (row) => (
        <div className="flex justify-end gap-1">
          {row.status === 'ACTIVE' && can('expense.update') ? (
            <Button
              variant="ghost"
              size="iconSm"
              title="Edit expense"
              aria-label={`Edit ${row.expenseNumber}`}
              onClick={() => {
                setEditing(row);
                setFormOpen(true);
              }}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          ) : null}
          {row.status === 'ACTIVE' && can('expense.delete') ? (
            <Button
              variant="ghost"
              size="iconSm"
              title="Reverse expense"
              aria-label={`Reverse ${row.expenseNumber}`}
              onClick={() => setReversing(row)}
            >
              <RotateCcw className="h-3.5 w-3.5 text-red-500" />
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  const categories = categoriesData ?? [];

  return (
    <div>
      <PageHeader
        title="Expenses"
        description="Track operating costs, manage categories and keep an auditable expense register."
        actions={
          <>
            {can('expense.category.manage') ? (
              <Button variant="outline" size="sm" onClick={() => setCategoriesOpen(true)}>
                <FolderCog className="h-4 w-4" /> Categories
              </Button>
            ) : null}
            {can('expense.create') ? (
              <Button
                size="sm"
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                <Plus className="h-4 w-4" /> New expense
              </Button>
            ) : null}
          </>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Expenses in range"
          value={formatINR(summary?.total ?? 0)}
          hint={`${formatDate(range.from)} – ${formatDate(range.to)}`}
          icon={Wallet}
          tone="amber"
        />
        <StatCard
          label="Top category"
          value={topCategory?.category ?? '—'}
          hint={topCategory ? `${formatINR(topCategory.total)} across ${topCategory.count} entries` : 'No expenses yet'}
          icon={Receipt}
          tone="violet"
        />
        <StatCard
          label="Entries in range"
          value={String(summary?.items.reduce((sum, row) => sum + row.count, 0) ?? 0)}
          hint={`${categories.length} categories configured`}
          icon={FolderCog}
          tone="sky"
        />
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-2 border-b p-3 lg:flex-row lg:items-center lg:flex-wrap">
          <SearchInput
            value={search}
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            placeholder="Search expense no, vendor, reference, notes…"
            className="w-full lg:max-w-xs"
          />
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
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
          <Select
            className="h-9 w-[140px]"
            value={status}
            aria-label="Filter by status"
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="REVERSED">Reversed</option>
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
          emptyTitle="No expenses found"
          emptyDescription="Record rent, utilities, salaries and other operating costs here."
          emptyAction={
            can('expense.create') ? (
              <Button
                size="sm"
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                <Plus className="h-4 w-4" /> New expense
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

      <ExpenseFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        expense={editing}
        categories={categories.filter((category) => category.isActive || category.id === editing?.categoryId)}
      />
      <ExpenseCategoriesDialog open={categoriesOpen} onOpenChange={setCategoriesOpen} categories={categories} />
      <ConfirmReasonDialog
        open={!!reversing}
        onOpenChange={(open) => !open && setReversing(null)}
        title="Reverse expense?"
        description={reversing ? `${reversing.expenseNumber} · ${formatINR(reversing.amount)} will be excluded from reports.` : undefined}
        confirmLabel="Reverse expense"
        loading={reverse.isPending}
        onConfirm={(reason) => reversing && reverse.mutate({ id: reversing.id, reason })}
      />
    </div>
  );
}

function ExpenseFormDialog({
  open,
  onOpenChange,
  expense,
  categories,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense: Expense | null;
  categories: ExpenseCategory[];
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = React.useState({
    categoryId: '',
    expenseDate: today(),
    amount: '',
    paymentMethod: 'CASH' as (typeof paymentMethods)[number],
    vendor: '',
    reference: '',
    notes: '',
    receiptUrl: '',
  });
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setError(null);
    if (expense) {
      setForm({
        categoryId: expense.categoryId,
        expenseDate: expense.expenseDate.slice(0, 10),
        amount: String(expense.amount),
        paymentMethod: (expense.paymentMethod as (typeof paymentMethods)[number]) ?? 'CASH',
        vendor: expense.vendor ?? '',
        reference: expense.reference ?? '',
        notes: expense.notes ?? '',
        receiptUrl: expense.receiptUrl ?? '',
      });
    } else {
      setForm({
        categoryId: categories[0]?.id ?? '',
        expenseDate: today(),
        amount: '',
        paymentMethod: 'CASH',
        vendor: '',
        reference: '',
        notes: '',
        receiptUrl: '',
      });
    }
  }, [open, expense, categories]);

  const save = useMutation({
    mutationFn: (payload: unknown) =>
      expense
        ? api.patch<Single<Expense>>(`/expenses/${expense.id}`, payload)
        : api.post<Single<Expense>>('/expenses', payload),
    onSuccess: ({ item }) => {
      toast.success(expense ? `${item.expenseNumber} updated` : `Expense ${item.expenseNumber} recorded`);
      onOpenChange(false);
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not save the expense'),
  });

  const submit = () => {
    setError(null);
    const parsed = expenseSchema.safeParse({
      categoryId: form.categoryId,
      expenseDate: form.expenseDate,
      amount: Number(form.amount) || 0,
      paymentMethod: form.paymentMethod,
      vendor: form.vendor || null,
      reference: form.reference || null,
      notes: form.notes || null,
      receiptUrl: form.receiptUrl || null,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the expense details');
      return;
    }
    save.mutate(parsed.data);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !save.isPending && onOpenChange(next)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{expense ? `Edit ${expense.expenseNumber}` : 'New expense'}</DialogTitle>
          <DialogDescription>
            {expense ? 'Changes are recorded in the audit log.' : 'Post an operating cost to the expense register.'}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Category" required>
              <Select
                value={form.categoryId}
                onChange={(event) => setForm((current) => ({ ...current, categoryId: event.target.value }))}
              >
                <option value="">Select category</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Date" required>
              <Input
                type="date"
                value={form.expenseDate}
                max={today()}
                onChange={(event) => setForm((current) => ({ ...current, expenseDate: event.target.value }))}
              />
            </Field>
            <Field label="Amount" required>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={form.amount}
                autoFocus
                className="text-right tabnum"
                onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))}
              />
            </Field>
            <Field label="Paid via" required>
              <Select
                value={form.paymentMethod}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    paymentMethod: event.target.value as (typeof paymentMethods)[number],
                  }))
                }
              >
                {paymentMethods.map((method) => (
                  <option key={method} value={method}>
                    {method.replace(/_/g, ' ')}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Vendor / payee">
              <Input
                value={form.vendor}
                maxLength={120}
                onChange={(event) => setForm((current) => ({ ...current, vendor: event.target.value }))}
              />
            </Field>
            <Field label="Reference" hint="Bill no, UPI ref, cheque no…">
              <Input
                value={form.reference}
                maxLength={120}
                onChange={(event) => setForm((current) => ({ ...current, reference: event.target.value }))}
              />
            </Field>
          </div>
          <Field label="Receipt URL" hint="Optional link to the scanned bill or receipt">
            <Input
              value={form.receiptUrl}
              maxLength={500}
              placeholder="https://…"
              onChange={(event) => setForm((current) => ({ ...current, receiptUrl: event.target.value }))}
            />
          </Field>
          <Field label="Notes">
            <Textarea
              value={form.notes}
              maxLength={1000}
              className="min-h-[64px]"
              onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
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
          <Button loading={save.isPending} disabled={!(Number(form.amount) > 0)} onClick={submit}>
            {expense ? 'Save changes' : 'Record expense'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ExpenseCategoriesDialog({
  open,
  onOpenChange,
  categories,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: ExpenseCategory[];
}) {
  const queryClient = useQueryClient();
  const [name, setName] = React.useState('');
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editName, setEditName] = React.useState('');
  const [deleting, setDeleting] = React.useState<ExpenseCategory | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setName('');
    setEditingId(null);
    setEditName('');
    setDeleting(null);
  }, [open]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['expense-categories'] });
    queryClient.invalidateQueries({ queryKey: ['expenses'] });
  };

  const create = useMutation({
    mutationFn: () => api.post('/expense-categories', { name: name.trim() }),
    onSuccess: () => {
      toast.success('Category added');
      setName('');
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not add the category'),
  });

  const update = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: unknown }) => api.patch(`/expense-categories/${id}`, payload),
    onSuccess: () => {
      toast.success('Category updated');
      setEditingId(null);
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not update the category'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/expense-categories/${id}`),
    onSuccess: () => {
      toast.success('Category deleted');
      setDeleting(null);
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not delete the category'),
  });

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Expense categories</DialogTitle>
            <DialogDescription>
              System categories can be deactivated but not deleted. Categories with entries must be deactivated.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <div className="flex gap-2">
              <Input
                value={name}
                maxLength={80}
                placeholder="New category name"
                onChange={(event) => setName(event.target.value)}
              />
              <Button
                size="sm"
                loading={create.isPending}
                disabled={name.trim().length < 1}
                onClick={() => create.mutate()}
              >
                <Plus className="h-4 w-4" /> Add
              </Button>
            </div>

            <div className="divide-y rounded-lg border">
              {categories.length === 0 ? (
                <p className="px-3 py-6 text-center text-xs text-muted-foreground">No categories yet.</p>
              ) : (
                categories.map((category) => (
                  <div key={category.id} className="flex items-center gap-2 px-3 py-2">
                    {editingId === category.id ? (
                      <>
                        <Input
                          value={editName}
                          maxLength={80}
                          className="h-8"
                          onChange={(event) => setEditName(event.target.value)}
                        />
                        <Button
                          size="sm"
                          loading={update.isPending}
                          disabled={editName.trim().length < 1}
                          onClick={() =>
                            update.mutate({ id: category.id, payload: { name: editName.trim() } })
                          }
                        >
                          Save
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{category.name}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {category.expenseCount} expense{category.expenseCount === 1 ? '' : 's'}
                            {category.isSystem ? ' · system' : ''}
                          </p>
                        </div>
                        <Switch
                          checked={category.isActive}
                          aria-label={`Toggle ${category.name}`}
                          onCheckedChange={(checked) =>
                            update.mutate({ id: category.id, payload: { isActive: checked } })
                          }
                        />
                        <Button
                          variant="ghost"
                          size="iconSm"
                          aria-label={`Rename ${category.name}`}
                          onClick={() => {
                            setEditingId(category.id);
                            setEditName(category.name);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="iconSm"
                          disabled={category.isSystem || category.expenseCount > 0}
                          title={
                            category.isSystem
                              ? 'System categories cannot be deleted'
                              : category.expenseCount > 0
                                ? 'Deactivate instead'
                                : 'Delete category'
                          }
                          aria-label={`Delete ${category.name}`}
                          onClick={() => setDeleting(category)}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-red-500" />
                        </Button>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(next) => !next && setDeleting(null)}
        title="Delete category?"
        description={deleting ? `${deleting.name} will be removed permanently.` : undefined}
        confirmLabel="Delete"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </>
  );
}
