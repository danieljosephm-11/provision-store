import * as React from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Pencil, Plus, ShieldCheck, Trash2, UserCog, Users } from 'lucide-react';
import { toast } from 'sonner';
import { userCreateSchema } from '@ps/shared';
import { api, ApiError, buildQuery } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { useDebouncedValue } from '@/lib/hooks';
import { useAuth } from '@/contexts/auth';
import type { Paginated, Role, Single, User } from '@/lib/types';
import { PageHeader } from '@/components/shared/page-header';
import { DataTable, type Column } from '@/components/shared/data-table';
import { Pagination } from '@/components/shared/pagination';
import { SearchInput } from '@/components/shared/search-input';
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
import { Field, Input, Select } from '@/components/ui/input';

const STATUSES = ['ACTIVE', 'INACTIVE', 'SUSPENDED'] as const;

export function UsersPage() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = React.useState('');
  const debounced = useDebouncedValue(search, 250);
  const [status, setStatus] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(20);
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<User | null>(null);
  const [resetting, setResetting] = React.useState<User | null>(null);
  const [deleting, setDeleting] = React.useState<User | null>(null);

  const { data: roles } = useQuery({
    queryKey: ['roles'],
    queryFn: () => api.get<{ items: Role[] }>('/roles').then((res) => res.items),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['users', { debounced, status, page, pageSize }],
    queryFn: () =>
      api.get<Paginated<User>>(`/users${buildQuery({ search: debounced, status, page, pageSize })}`),
    placeholderData: keepPreviousData,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/users/${id}`),
    onSuccess: () => {
      toast.success('Employee removed');
      setDeleting(null);
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['roles'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not remove the employee'),
  });

  const columns: Column<User>[] = [
    {
      key: 'employee',
      header: 'Employee',
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-800">{row.name}</p>
          <p className="text-[11px] text-muted-foreground">{row.email}</p>
        </div>
      ),
    },
    {
      key: 'phone',
      header: 'Phone',
      cell: (row) => <span className="text-xs text-muted-foreground">{row.phone ?? '—'}</span>,
    },
    {
      key: 'role',
      header: 'Role',
      cell: (row) => (
        <span className="inline-flex items-center gap-1 text-xs">
          <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
          {row.role.name}
        </span>
      ),
    },
    { key: 'status', header: 'Status', cell: (row) => <StatusBadge status={row.status} /> },
    {
      key: 'lastLogin',
      header: 'Last login',
      cell: (row) => (
        <span className="text-xs text-muted-foreground">
          {row.lastLoginAt ? formatDate(row.lastLoginAt, true) : 'Never'}
        </span>
      ),
    },
    {
      key: 'mustChange',
      header: 'Password',
      cell: (row) =>
        row.mustChangePassword ? (
          <span className="text-[11px] font-medium text-amber-700">Change pending</span>
        ) : (
          <span className="text-[11px] text-muted-foreground">Set</span>
        ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (row) => (
        <div className="flex justify-end gap-1">
          {can('user.update') ? (
            <>
              <Button
                variant="ghost"
                size="iconSm"
                title="Edit employee"
                aria-label={`Edit ${row.name}`}
                onClick={() => {
                  setEditing(row);
                  setFormOpen(true);
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="iconSm"
                title="Reset password"
                aria-label={`Reset password for ${row.name}`}
                onClick={() => setResetting(row)}
              >
                <KeyRound className="h-3.5 w-3.5" />
              </Button>
            </>
          ) : null}
          {can('user.delete') ? (
            <Button
              variant="ghost"
              size="iconSm"
              title="Remove employee"
              aria-label={`Remove ${row.name}`}
              onClick={() => setDeleting(row)}
            >
              <Trash2 className="h-3.5 w-3.5 text-red-500" />
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Employees"
        description="Staff accounts, roles and access. Every protected action is permission-checked server-side."
        actions={
          can('user.create') ? (
            <Button
              size="sm"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="h-4 w-4" /> Add employee
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
            placeholder="Search name, email or phone…"
            className="w-full lg:max-w-xs"
          />
          <Select
            className="h-9 w-[150px]"
            value={status}
            aria-label="Filter by status"
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            {STATUSES.map((option) => (
              <option key={option} value={option}>
                {option.charAt(0) + option.slice(1).toLowerCase()}
              </option>
            ))}
          </Select>
        </div>

        <DataTable
          columns={columns}
          rows={data?.items}
          rowKey={(row) => row.id}
          loading={isLoading}
          emptyTitle="No employees found"
          emptyDescription="Add staff accounts and assign a role to control what they can access."
          emptyAction={
            can('user.create') ? (
              <Button
                size="sm"
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                <Users className="h-4 w-4" /> Add employee
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

      <UserFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        user={editing}
        roles={roles ?? []}
      />
      <ResetPasswordDialog user={resetting} onOpenChange={(open) => !open && setResetting(null)} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(next) => !next && setDeleting(null)}
        title="Remove employee?"
        description={
          deleting
            ? `${deleting.name} will no longer be able to sign in. Historical records stay intact.`
            : undefined
        }
        confirmLabel="Remove"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </div>
  );
}

function UserFormDialog({
  open,
  onOpenChange,
  user,
  roles,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: User | null;
  roles: Role[];
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = React.useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    roleId: '',
    status: 'ACTIVE' as (typeof STATUSES)[number],
  });
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setError(null);
    if (user) {
      setForm({
        name: user.name,
        email: user.email,
        phone: user.phone ?? '',
        password: '',
        roleId: user.role.id,
        status: user.status,
      });
    } else {
      setForm({
        name: '',
        email: '',
        phone: '',
        password: '',
        roleId: roles[0]?.id ?? '',
        status: 'ACTIVE',
      });
    }
  }, [open, user, roles]);

  const save = useMutation({
    mutationFn: (payload: unknown) =>
      user ? api.patch<Single<User>>(`/users/${user.id}`, payload) : api.post<Single<User>>('/users', payload),
    onSuccess: ({ item }) => {
      toast.success(user ? `${item.name} updated` : `${item.name} added`);
      onOpenChange(false);
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['roles'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not save the employee'),
  });

  const submit = () => {
    setError(null);
    if (!form.roleId) {
      setError('Select a role');
      return;
    }
    if (user) {
      save.mutate({
        name: form.name,
        email: form.email,
        phone: form.phone || null,
        roleId: form.roleId,
        status: form.status,
      });
      return;
    }
    const parsed = userCreateSchema.safeParse({
      name: form.name,
      email: form.email,
      phone: form.phone || null,
      password: form.password,
      roleId: form.roleId,
      status: form.status,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the employee details');
      return;
    }
    save.mutate(parsed.data);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !save.isPending && onOpenChange(next)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{user ? `Edit ${user.name}` : 'Add employee'}</DialogTitle>
          <DialogDescription>
            {user ? 'Use reset password to change their credentials.' : 'They can sign in immediately with this password.'}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Full name" required>
              <Input
                value={form.name}
                maxLength={120}
                autoFocus
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              />
            </Field>
            <Field label="Email" required>
              <Input
                type="email"
                value={form.email}
                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              />
            </Field>
            <Field label="Phone">
              <Input
                value={form.phone}
                inputMode="numeric"
                maxLength={10}
                onChange={(event) =>
                  setForm((current) => ({ ...current, phone: event.target.value.replace(/\D/g, '') }))
                }
              />
            </Field>
            <Field label="Role" required>
              <Select
                value={form.roleId}
                onChange={(event) => setForm((current) => ({ ...current, roleId: event.target.value }))}
              >
                <option value="">Select role</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Status">
              <Select
                value={form.status}
                onChange={(event) =>
                  setForm((current) => ({ ...current, status: event.target.value as (typeof STATUSES)[number] }))
                }
              >
                {STATUSES.map((option) => (
                  <option key={option} value={option}>
                    {option.charAt(0) + option.slice(1).toLowerCase()}
                  </option>
                ))}
              </Select>
            </Field>
            {!user ? (
              <Field label="Temporary password" required hint="At least 10 characters">
                <Input
                  type="password"
                  value={form.password}
                  autoComplete="new-password"
                  onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                />
              </Field>
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
            {user ? 'Save changes' : 'Add employee'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({ user, onOpenChange }: { user: User | null; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  const [password, setPassword] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!user) return;
    setPassword('');
    setConfirm('');
    setError(null);
  }, [user]);

  const reset = useMutation({
    mutationFn: (newPassword: string) => api.post(`/users/${user?.id}/reset-password`, { newPassword }),
    onSuccess: () => {
      toast.success(`Password reset for ${user?.name ?? 'employee'}`);
      onOpenChange(false);
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not reset the password'),
  });

  const submit = () => {
    setError(null);
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    if (
      password.length < 10 ||
      !/[A-Z]/.test(password) ||
      !/[a-z]/.test(password) ||
      !/[0-9]/.test(password)
    ) {
      setError('Use 10+ characters with upper case, lower case and a number');
      return;
    }
    reset.mutate(password);
  };

  return (
    <Dialog open={!!user} onOpenChange={(next) => !reset.isPending && onOpenChange(next)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Reset password</DialogTitle>
          <DialogDescription>
            {user ? `${user.name} will be asked to sign in with the new password.` : ''}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <Field label="New password" required hint="10+ characters with upper case, lower case and a number">
            <Input
              type="password"
              value={password}
              autoComplete="new-password"
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>
          <Field label="Confirm password" required>
            <Input
              type="password"
              value={confirm}
              autoComplete="new-password"
              onChange={(event) => setConfirm(event.target.value)}
            />
          </Field>
          {error ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={reset.isPending}>
            Cancel
          </Button>
          <Button loading={reset.isPending} disabled={!password || !confirm} onClick={submit}>
            Reset password
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function UsersIcon() {
  return <UserCog className="h-4 w-4" />;
}
