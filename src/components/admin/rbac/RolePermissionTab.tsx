'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { ColumnDef } from '@tanstack/react-table';
import { Plus, Pencil, Trash2, Eye, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/shared/data-table';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { StatusBadge } from '@/components/shared/status-badge';
import { formatDate } from '@/lib/utils';
import {
  useRoles,
  useRole,
  useDeleteRole,
  useSetRoleStatus,
  type Role,
} from '@/lib/api/roles';
import type { RbacScope } from '@/lib/rbac/rbac-modules';
import { RoleDrawer } from './RoleDrawer';
import { useApiErrorMessage } from '@/lib/api/use-api-error-message';

export interface RolePermissionTabProps {
  scope: RbacScope;
}

/**
 * 角色权限 tab (spec §6.3/§6.4): a role list scoped to the caller's admin
 * level (platform vs tenant, mirroring `getScopedModules`'s own scoping),
 * plus the create/edit drawer (`RoleDrawer`) and delete/status controls.
 * System-default / tenant global-template roles (`isSystemDefault`) render
 * without edit/delete actions — the API itself rejects those writes
 * (internal/api/roles.go), this just keeps the row honest about it.
 */
export function RolePermissionTab({ scope }: RolePermissionTabProps) {
  const t = useTranslations('users');
  const apiErrorMessage = useApiErrorMessage();
  const { data: roles, isLoading } = useRoles(scope);
  const deleteRole = useDeleteRole();
  const setRoleStatus = useSetRoleStatus();

  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<number | 'new' | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Role | null>(null);

  // list responses omit `permissions` (see lib/api/roles.ts) — fetch the
  // detail for whichever role is being edited/viewed so the drawer's matrix
  // has real data, not an empty draft.
  const { data: roleDetail } = useRole(typeof editingId === 'number' ? editingId : null);
  const drawerRole: Role | null =
    editingId === 'new' ? null : roleDetail && roleDetail.id === editingId ? roleDetail : null;
  const drawerReady = editingId === 'new' || !!drawerRole;

  const scopedRoles = useMemo(() => (roles ?? []).filter((r) => r.scope === scope), [roles, scope]);
  const filteredRoles = useMemo(() => {
    const kw = search.trim().toLowerCase();
    if (!kw) return scopedRoles;
    return scopedRoles.filter((r) => r.name.toLowerCase().includes(kw));
  }, [scopedRoles, search]);

  const openCreate = () => {
    setEditingId('new');
    setDialogOpen(true);
  };
  const openRole = (role: Role) => {
    setEditingId(role.id);
    setDialogOpen(true);
  };

  const existingNames = useMemo(
    () => scopedRoles.filter((r) => r.id !== (typeof editingId === 'number' ? editingId : -1)).map((r) => r.name),
    [scopedRoles, editingId],
  );

  const doDelete = (role: Role) => {
    deleteRole.mutate(role.id, {
      onSuccess: () => {
        toast.success(t('rbac.toast.deleted'));
        setDeleteTarget(null);
      },
      onError: (e) => {
        // GT-... a role still holding admins 409s with a server-composed
        // "reassign them first" message (internal/api/roles.go DeleteRole) —
        // surface it verbatim rather than a generic failure.
        toast.error(apiErrorMessage(e, t('rbac.toast.deleteFailed')));
        setDeleteTarget(null);
      },
    });
  };

  const toggleStatus = (role: Role) => {
    const next = role.status === 'disabled' ? 'normal' : 'disabled';
    setRoleStatus.mutate(
      { id: role.id, status: next },
      {
        onSuccess: () => toast.success(t('rbac.toast.statusUpdated')),
        onError: (e) => toast.error(apiErrorMessage(e, t('rbac.toast.saveFailed'))),
      },
    );
  };

  const columns: ColumnDef<Role>[] = [
    {
      accessorKey: 'name',
      header: t('rbac.columns.name'),
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <span className="font-medium">{row.original.name}</span>
          {row.original.isSystemDefault && (
            <Badge variant="secondary">{t('rbac.systemDefaultBadge')}</Badge>
          )}
        </div>
      ),
    },
    {
      id: 'status',
      header: t('rbac.columns.status'),
      cell: ({ row }) => {
        const role = row.original;
        const isDisabled = role.status === 'disabled';
        const lockStatus = role.isSystemDefault || role.isSuperAdmin;
        return (
          <div className="flex items-center gap-2">
            <StatusBadge
              status={isDisabled ? t('disabled') : t('normal')}
              variant={isDisabled ? 'error' : 'success'}
            />
            <Switch
              data-testid={`role-status-toggle-${role.id}`}
              checked={!isDisabled}
              disabled={lockStatus || setRoleStatus.isPending}
              onCheckedChange={() => toggleStatus(role)}
            />
          </div>
        );
      },
    },
    {
      accessorKey: 'remark',
      header: t('rbac.columns.remark'),
      cell: ({ row }) => row.original.remark || <span className="text-muted-foreground">-</span>,
    },
    {
      accessorKey: 'updatedAt',
      header: t('rbac.columns.updatedAt'),
      cell: ({ row }) => (row.original.updatedAt ? formatDate(row.original.updatedAt) : '-'),
    },
    {
      id: 'actions',
      header: t('rbac.columns.actions'),
      cell: ({ row }) => {
        const role = row.original;
        return (
          <div className="flex items-center gap-0.5">
            {role.isSystemDefault ? (
              <Button variant="ghost" size="sm" className="h-7 gap-1" onClick={() => openRole(role)}>
                <Eye className="h-3.5 w-3.5" />
                {t('rbac.rowActions.view')}
              </Button>
            ) : (
              <>
                <Button variant="ghost" size="sm" className="h-7 gap-1" onClick={() => openRole(role)}>
                  <Pencil className="h-3.5 w-3.5" />
                  {t('rbac.rowActions.edit')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 text-destructive"
                  onClick={() => setDeleteTarget(role)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {t('rbac.rowActions.delete')}
                </Button>
              </>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            data-testid="role-search"
            placeholder={t('rbac.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button data-testid="create-role" className="ml-auto gap-1.5" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          {t('rbac.createRole')}
        </Button>
      </div>

      {!isLoading && (
        <DataTable
          columns={columns}
          data={filteredRoles}
          rowTestId={(role) => `role-row-${role.id}`}
          noDataText={t('rbac.emptyState')}
        />
      )}

      <RoleDrawer
        open={dialogOpen && drawerReady}
        onOpenChange={(o) => {
          setDialogOpen(o);
          if (!o) setEditingId(null);
        }}
        scope={scope}
        role={drawerRole}
        existingNames={existingNames}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title={t('rbac.deleteConfirm.title', { name: deleteTarget?.name ?? '' })}
        description={t('rbac.deleteConfirm.description')}
        onConfirm={() => deleteTarget && doDelete(deleteTarget)}
        variant="destructive"
      />
    </div>
  );
}
