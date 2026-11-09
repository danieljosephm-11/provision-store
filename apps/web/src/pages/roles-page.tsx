import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Crown, Lock, Pencil, Plus, ShieldCheck, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/contexts/auth';
import type { Permission, PermissionList, Role, Single } from '@/lib/types';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/controls';
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
import { Field, Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const MODULE_ORDER = [
  'dashboard',
  'pos',
  'products',
  'catalog',
  'inventory',
  'customers',
  'suppliers',
  'purchases',
  'invoices',
  'returns',
  'expenses',
  'reports',
  'users',
  'roles',
  'settings',
  'audit',
  'backup',
];

const MODULE_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  pos: 'Point of sale',
  products: 'Products',
  catalog: 'Catalog & tax',
  inventory: 'Inventory',
  customers: 'Customers',
  suppliers: 'Suppliers',
  purchases: 'Purchases',
  invoices: 'Invoices',
  returns: 'Returns',
  expenses: 'Expenses',
  reports: 'Reports',
  users: 'Employees',
  roles: 'Roles & access',
  settings: 'Settings',
  audit: 'Audit log',
  backup: 'Backups',
};

function moduleLabel(module: string) {
  return MODULE_LABELS[module] ?? module.charAt(0).toUpperCase() + module.slice(1);
}

function orderedModules(grouped: Record<string, Permission[]>) {
  const known = MODULE_ORDER.filter((module) => grouped[module]);
  const extra = Object.keys(grouped).filter((module) => !MODULE_ORDER.includes(module)).sort();
  return [...known, ...extra];
}

export function RolesPage() {
  const { can, user, refreshUser } = useAuth();
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Role | null>(null);
  const [deleting, setDeleting] = React.useState<Role | null>(null);

  const {
    data: roles,
    isLoading: rolesLoading,
    error: rolesError,
    refetch: refetchRoles,
  } = useQuery({
    queryKey: ['roles'],
    queryFn: () => api.get<{ items: Role[] }>('/roles').then((res) => res.items),
  });

  const { data: permissions, error: permissionsError, refetch: refetchPermissions } = useQuery({
    queryKey: ['permissions'],
    queryFn: () => api.get<PermissionList>('/roles/permissions'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/roles/${id}`),
    onSuccess: () => {
      toast.success('Role deleted');
      setDeleting(null);
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not delete the role'),
  });

  const items = roles ?? [];
  const modules = permissions ? orderedModules(permissions.grouped) : [];
  const totalPermissions = permissions?.items.length ?? 0;

  const canManage = can('role.manage');

  return (
    <div>
      <PageHeader
        title="Roles & access"
        description="Define what each role can do. Permissions are enforced by the API on every request."
        actions={
          canManage ? (
            <Button
              size="sm"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
              disabled={!permissions}
            >
              <Plus className="h-4 w-4" /> New role
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5" />
        <span>
          {items.length} role{items.length === 1 ? '' : 's'} · {totalPermissions} permissions across{' '}
          {modules.length} modules
        </span>
        {!canManage ? <span className="text-amber-700">· You can view roles but not change them</span> : null}
      </div>

      {rolesLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-44" />
          ))}
        </div>
      ) : rolesError ? (
        <Card>
          <ErrorState
            title="Could not load roles"
            message={rolesError instanceof ApiError ? rolesError.message : undefined}
            onRetry={() => void refetchRoles()}
          />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((role) => {
            const isAdmin = role.name === 'Admin';
            const isProtected = role.isSystem || isAdmin;
            const isCurrentRole = user?.role.id === role.id;
            return (
              <Card key={role.id} className={cn('flex flex-col', isCurrentRole && 'ring-1 ring-primary/30')}>
                <CardHeader className="flex-row items-start justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle className="flex items-center gap-1.5">
                      {isAdmin ? <Crown className="h-3.5 w-3.5 text-amber-500" /> : null}
                      <span className="truncate">{role.name}</span>
                    </CardTitle>
                    <p className="mt-0.5 min-h-[16px] text-[11px] text-muted-foreground">
                      {role.description ?? 'No description'}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-0.5">
                    {canManage ? (
                      <Button
                        variant="ghost"
                        size="iconSm"
                        title={isAdmin ? 'The Admin role always has every permission' : 'Edit role'}
                        aria-label={`Edit ${role.name}`}
                        disabled={isAdmin}
                        onClick={() => {
                          setEditing(role);
                          setFormOpen(true);
                        }}
                      >
                        {isAdmin ? <Lock className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                      </Button>
                    ) : null}
                    {canManage ? (
                      <Button
                        variant="ghost"
                        size="iconSm"
                        title={
                          role.isSystem
                            ? 'System roles cannot be deleted'
                            : role.userCount > 0
                              ? 'Move employees to another role first'
                              : 'Delete role'
                        }
                        aria-label={`Delete ${role.name}`}
                        disabled={isProtected || role.userCount > 0}
                        onClick={() => setDeleting(role)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-red-500" />
                      </Button>
                    ) : null}
                  </div>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-2.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline" className="gap-1">
                      <Users className="h-3 w-3" />
                      {role.userCount} user{role.userCount === 1 ? '' : 's'}
                    </Badge>
                    <Badge variant={isAdmin ? 'purple' : role.isSystem ? 'info' : 'outline'}>
                      {isAdmin ? 'Full access' : role.isSystem ? 'System role' : 'Custom role'}
                    </Badge>
                    {isCurrentRole ? <Badge variant="success">Your role</Badge> : null}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {isAdmin
                      ? `All ${totalPermissions} permissions, including future ones`
                      : `${role.permissionKeys.length} of ${totalPermissions} permissions`}
                  </p>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-emerald-500"
                      style={{
                        width: isAdmin
                          ? '100%'
                          : `${totalPermissions ? Math.round((role.permissionKeys.length / totalPermissions) * 100) : 0}%`,
                      }}
                    />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {permissionsError ? (
        <p className="mt-3 text-xs text-red-600">
          Could not load the permission catalogue.{' '}
          <button type="button" className="underline" onClick={() => void refetchPermissions()}>
            Retry
          </button>
        </p>
      ) : null}

      <RoleFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        role={editing}
        grouped={permissions?.grouped ?? {}}
        modules={modules}
        onSaved={() => {
          void refreshUser();
        }}
      />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(next) => !next && setDeleting(null)}
        title="Delete role?"
        description={
          deleting
            ? `${deleting.name} will be removed. This cannot be undone.`
            : undefined
        }
        confirmLabel="Delete role"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </div>
  );
}

interface RoleFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: Role | null;
  grouped: Record<string, Permission[]>;
  modules: string[];
  onSaved: () => void;
}

function RoleFormDialog({ open, onOpenChange, role, grouped, modules, onSaved }: RoleFormDialogProps) {
  const queryClient = useQueryClient();
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [search, setSearch] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setName(role?.name ?? '');
    setDescription(role?.description ?? '');
    setSelected(new Set(role?.permissionKeys ?? []));
    setSearch('');
    setError(null);
  }, [open, role]);

  const toggle = (key: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleModule = (module: string, checked: boolean) => {
    const keys = (grouped[module] ?? []).map((permission) => permission.key);
    setSelected((current) => {
      const next = new Set(current);
      for (const key of keys) {
        if (checked) next.add(key);
        else next.delete(key);
      }
      return next;
    });
  };

  const save = useMutation({
    mutationFn: (payload: unknown) =>
      role
        ? api.patch<Single<Role>>(`/roles/${role.id}`, payload)
        : api.post<Single<Role>>('/roles', payload),
    onSuccess: ({ item }) => {
      toast.success(role ? `${item.name} updated` : `${item.name} created`);
      onOpenChange(false);
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      onSaved();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not save the role'),
  });

  const submit = () => {
    setError(null);
    if (name.trim().length < 2) {
      setError('Give the role a name of at least 2 characters');
      return;
    }
    if (name.trim().toLowerCase() === 'admin') {
      setError('That role name is reserved');
      return;
    }
    save.mutate({
      name: name.trim(),
      description: description.trim() || null,
      permissionKeys: Array.from(selected),
    });
  };

  const term = search.trim().toLowerCase();
  const visibleModules = modules
    .map((module) => ({
      module,
      permissions: (grouped[module] ?? []).filter(
        (permission) =>
          !term ||
          permission.key.toLowerCase().includes(term) ||
          permission.description.toLowerCase().includes(term) ||
          module.includes(term),
      ),
    }))
    .filter((group) => group.permissions.length > 0);

  return (
    <Dialog open={open} onOpenChange={(next) => !save.isPending && onOpenChange(next)}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{role ? `Edit ${role.name}` : 'New role'}</DialogTitle>
          <DialogDescription>
            {role
              ? 'Changes apply to every employee assigned to this role on their next request.'
              : 'Pick the permissions this role needs. You can change them later.'}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Role name" required>
              <Input
                value={name}
                maxLength={40}
                autoFocus
                placeholder="e.g. Floor supervisor"
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            <Field label="Description">
              <Input
                value={description}
                maxLength={200}
                placeholder="What this role is responsible for"
                onChange={(event) => setDescription(event.target.value)}
              />
            </Field>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Input
              value={search}
              placeholder="Filter permissions…"
              className="h-8 sm:max-w-xs"
              onChange={(event) => setSearch(event.target.value)}
            />
            <span className="text-[11px] text-muted-foreground">
              {selected.size} permission{selected.size === 1 ? '' : 's'} selected
            </span>
          </div>

          <div className="max-h-[46vh] space-y-3 overflow-y-auto rounded-lg border p-3">
            {visibleModules.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">No permissions match “{search}”.</p>
            ) : (
              visibleModules.map(({ module, permissions }) => {
                const allKeys = (grouped[module] ?? []).map((permission) => permission.key);
                const checkedCount = allKeys.filter((key) => selected.has(key)).length;
                const allChecked = checkedCount === allKeys.length && allKeys.length > 0;
                return (
                  <div key={module} className="rounded-md border bg-slate-50/40">
                    <div className="flex items-center justify-between gap-2 border-b px-3 py-1.5">
                      <p className="text-xs font-semibold text-slate-700">{moduleLabel(module)}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground">
                          {checkedCount}/{allKeys.length}
                        </span>
                        <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground">
                          <Checkbox
                            checked={allChecked}
                            aria-label={`Toggle all ${moduleLabel(module)} permissions`}
                            onCheckedChange={(checked) => toggleModule(module, checked === true)}
                          />
                          All
                        </label>
                      </div>
                    </div>
                    <div className="grid gap-1 p-2 sm:grid-cols-2">
                      {permissions.map((permission) => {
                        const id = `perm-${permission.key}`;
                        return (
                          <label
                            key={permission.key}
                            htmlFor={id}
                            className="flex cursor-pointer items-start gap-2 rounded px-1.5 py-1 hover:bg-white"
                          >
                            <Checkbox
                              id={id}
                              checked={selected.has(permission.key)}
                              className="mt-0.5"
                              onCheckedChange={() => toggle(permission.key)}
                            />
                            <span className="min-w-0">
                              <span className="block truncate text-xs font-medium text-slate-700">
                                {permission.description}
                              </span>
                              <span className="block truncate font-mono text-[10px] text-muted-foreground">
                                {permission.key}
                              </span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
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
            {role ? 'Save changes' : 'Create role'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
