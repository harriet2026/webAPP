'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  useCreateRole,
  useUpdateRole,
  type Role,
  type RolePermission,
} from '@/lib/api/roles';
import {
  visibleModulesForScope,
  rbacSubmodulesForScope,
  findSubModule,
  SUBMODULE_ROUTE_MAP,
  type RbacScope,
  type SubModuleMeta,
} from '@/lib/rbac/rbac-modules';
import {
  updatePermissionsAction,
  updatePermissionsVisible,
  emptyPermissionRow,
  type PermAction,
} from '@/lib/rbac/role-permissions';
import { useProductForm } from '@/contexts/product-form-context';
import { FALLBACK_FEATURE_REGISTRY } from '@/lib/product-form/fallback-registry';
import { visibleNavIds, isItemVisibleByForm } from '@/components/layout/sidebar-visibility';
import { useApiErrorMessage } from '@/lib/api/use-api-error-message';

const ACTION_COLS: PermAction[] = ['view', 'edit', 'approve', 'delete'];
const ACTION_FIELD: Record<PermAction, keyof RolePermission> = {
  view: 'canView',
  edit: 'canEdit',
  approve: 'canApprove',
  delete: 'canDelete',
};

/** Every submodule the drawer's scope covers, one row per id, filling in any
 * id absent from the role's saved matrix (module tree grown since the role
 * was last saved) with an empty/unset row. */
function mergePermissions(scope: RbacScope, existing: RolePermission[] | undefined): RolePermission[] {
  const byId = new Map((existing ?? []).map((p) => [p.submoduleId, p]));
  return rbacSubmodulesForScope(scope).map((meta) => byId.get(meta.id) ?? emptyPermissionRow(meta));
}

export interface RoleDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Module scope this drawer edits (platform admin vs tenant admin matrix). */
  scope: RbacScope;
  /** null => create mode. A role with `permissions` populated (from `useRole` detail) => edit/view mode. */
  role: Role | null;
  /** Sibling role names (same scope, excluding this role) — for the duplicate-name check. */
  existingNames: string[];
  onSaved?: () => void;
}

/**
 * Create/edit surface for a single role: name + remark + the two-part
 * permission matrix (module-visible checkboxes, then an action table scoped
 * to whatever is currently visible). System-default / tenant global-template
 * roles (`role.isSystemDefault`) render fully read-only — the API rejects
 * writes to them anyway (internal/api/roles.go UpdateRole/DeleteRole), this
 * just keeps the UI honest about it up front.
 */
export function RoleDrawer({ open, onOpenChange, scope, role, existingNames, onSaved }: RoleDrawerProps) {
  const t = useTranslations('users');
  const apiErrorMessage = useApiErrorMessage();
  const tRoot = useTranslations();
  const createRole = useCreateRole();
  const updateRole = useUpdateRole();

  const readonly = !!role?.isSystemDefault;
  const roleIdToken = role?.id ?? 'new';

  // Product-form gate — the SAME registry resolver the sidebar uses
  // (sidebar-visibility.ts), so the assignable matrix matches the real nav of
  // the current product form instead of over-granting form-specific pages
  // (e.g. forwarding is hidden in every multi-tenant form; MULTI_ONLY
  // platform-security-policy/tenant-management in single-tenant).
  //
  // IMPORTANT: the product-form viewer used for this gate is derived from the
  // ROLE's `scope` being edited (platform-role matrix → 'platform' viewer),
  // NOT from the logged-in admin's own viewer. A platform admin impersonating a
  // tenant still edits platform roles against the platform nav; using their
  // 'tenant' viewer here would wrongly hide every platform-only page (proxysvr,
  // DKIM, tenant-management …) and collapse the whole 系统管理 group.
  const { capabilities, registry, registryReady, grants } = useProductForm();
  const gateViewer: 'platform' | 'tenant' = scope === 'tenant' ? 'tenant' : 'platform';
  const gateRegistry = registryReady ? registry : FALLBACK_FEATURE_REGISTRY;
  const formVisible = useMemo(
    () => (capabilities ? new Set(visibleNavIds(gateRegistry, capabilities, gateViewer, grants)) : null),
    [gateRegistry, capabilities, gateViewer, grants],
  );
  const isSubmoduleVisible = useMemo(
    () => (subId: string) => {
      if (!formVisible) return true;
      const href = SUBMODULE_ROUTE_MAP[subId]?.href;
      return isItemVisibleByForm({ id: subId, href }, gateRegistry, formVisible);
    },
    [formVisible, gateRegistry],
  );
  const scopedModules = useMemo(
    () => visibleModulesForScope(scope, isSubmoduleVisible),
    [scope, isSubmoduleVisible],
  );

  const [name, setName] = useState('');
  const [remark, setRemark] = useState('');
  const [permissions, setPermissions] = useState<RolePermission[]>([]);

  // Reset the draft whenever the drawer opens (or is re-targeted at a
  // different role) — matches the demo's openNew/openEdit deep-copy reset.
  useEffect(() => {
    if (!open) return;
    setName(role?.name ?? '');
    setRemark(role?.remark ?? '');
    setPermissions(mergePermissions(scope, role?.permissions));
  }, [open, role, scope]);

  const permBySubId = useMemo(() => new Map(permissions.map((p) => [p.submoduleId, p])), [permissions]);

  const trimmedName = name.trim();
  const nameError = readonly
    ? ''
    : !trimmedName
      ? t('rbac.drawer.nameRequired')
      : existingNames.includes(trimmedName)
        ? t('rbac.drawer.nameDuplicate')
        : '';

  const metaFor = (subId: string): SubModuleMeta => findSubModule(subId) ?? { id: subId, labelKey: subId, supportApprove: false, supportDelete: false };

  const onToggleVisible = (subId: string) => {
    if (readonly) return;
    setPermissions((prev) => updatePermissionsVisible(prev, subId, metaFor(subId)));
  };

  const onToggleAction = (subId: string, action: PermAction) => {
    if (readonly) return;
    setPermissions((prev) => updatePermissionsAction(prev, subId, action, metaFor(subId)));
  };

  const isSaving = createRole.isPending || updateRole.isPending;

  const handleSave = () => {
    if (readonly) return;
    if (nameError) {
      toast.error(t('rbac.drawer.fixValidationErrors'));
      return;
    }
    const body = { name: trimmedName, remark: remark.trim() || undefined, permissions };
    if (role) {
      updateRole.mutate(
        { id: role.id, data: body },
        {
          onSuccess: () => {
            toast.success(t('rbac.toast.updated'));
            onOpenChange(false);
            onSaved?.();
          },
          onError: (e) => toast.error(apiErrorMessage(e, t('rbac.toast.saveFailed'))),
        },
      );
    } else {
      createRole.mutate(
        { scope, ...body },
        {
          onSuccess: () => {
            toast.success(t('rbac.toast.created'));
            onOpenChange(false);
            onSaved?.();
          },
          onError: (e) => toast.error(apiErrorMessage(e, t('rbac.toast.saveFailed'))),
        },
      );
    }
  };

  const anyVisible = scopedModules.some((m) => m.children.some((s) => permBySubId.get(s.id)?.visible));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent data-testid="role-drawer" className="flex w-full flex-col overflow-y-auto p-0 sm:max-w-2xl">
        <SheetHeader className="border-b border-border px-6 pt-6 pb-3">
          <SheetTitle>
            {readonly ? t('rbac.drawer.viewTitle') : role ? t('rbac.drawer.editTitle') : t('rbac.drawer.createTitle')}
          </SheetTitle>
          <SheetDescription>
            {readonly ? t('rbac.drawer.readonlyDescription') : t('rbac.drawer.createDescription')}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="role-name-input">{t('rbac.drawer.nameLabel')}</Label>
              <Input
                id="role-name-input"
                data-testid="role-name-input"
                value={name}
                disabled={readonly}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('rbac.drawer.namePlaceholder')}
              />
              {!readonly && nameError && <p className="text-xs text-destructive">{nameError}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="role-remark-input">{t('rbac.drawer.remarkLabel')}</Label>
              <Input
                id="role-remark-input"
                data-testid="role-remark-input"
                value={remark}
                disabled={readonly}
                onChange={(e) => setRemark(e.target.value)}
                placeholder={t('rbac.drawer.remarkPlaceholder')}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 border-b border-border pb-1.5">
              <span className="text-sm font-medium text-foreground">{t('rbac.drawer.visibleSectionTitle')}</span>
              <span className="text-xs text-muted-foreground">{t('rbac.drawer.visibleSectionHint')}</span>
            </div>
            <div className="space-y-3">
              {scopedModules.map((m) => (
                <div key={m.key} className="rounded-lg border border-border">
                  <div className="rounded-t-lg bg-muted/40 px-3 py-2 text-sm font-medium text-foreground">
                    {tRoot(m.labelKey)}
                    <span className="ml-1 text-xs font-normal text-muted-foreground">({m.children.length})</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2 px-4 py-2.5 sm:grid-cols-3">
                    {m.children.map((s) => (
                      <label key={s.id} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          data-testid={`role-perm-${roleIdToken}-${s.id}-visible`}
                          checked={!!permBySubId.get(s.id)?.visible}
                          disabled={readonly}
                          onCheckedChange={() => onToggleVisible(s.id)}
                        />
                        <span className="text-foreground/90">{tRoot(s.labelKey)}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 border-b border-border pb-1.5">
              <span className="text-sm font-medium text-foreground">{t('rbac.drawer.actionSectionTitle')}</span>
              <span className="text-xs text-muted-foreground">{t('rbac.matrix.unsupportedHint')}</span>
            </div>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>{t('rbac.matrix.moduleColumn')}</TableHead>
                  {ACTION_COLS.map((a) => (
                    <TableHead key={a} className="w-[72px] text-center">
                      {t(`rbac.matrix.${a}`)}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {scopedModules.map((m) => {
                  const visibleChildren = m.children.filter((s) => permBySubId.get(s.id)?.visible);
                  if (visibleChildren.length === 0) return null;
                  return (
                    <Fragment key={m.key}>
                      <TableRow className="bg-muted/30 hover:bg-muted/30">
                        <TableCell colSpan={5} className="py-1.5 text-xs font-medium text-muted-foreground">
                          {tRoot(m.labelKey)}
                        </TableCell>
                      </TableRow>
                      {visibleChildren.map((s) => {
                        const row = permBySubId.get(s.id)!;
                        return (
                          <TableRow key={s.id}>
                            <TableCell className="py-2 pl-6 text-foreground/90">{tRoot(s.labelKey)}</TableCell>
                            {ACTION_COLS.map((a) => {
                              const val = row[ACTION_FIELD[a]];
                              return (
                                <TableCell key={a} className="py-2 text-center">
                                  {val === null ? (
                                    <span
                                      data-testid={`role-perm-${roleIdToken}-${s.id}-${a}`}
                                      className="text-muted-foreground"
                                    >
                                      -
                                    </span>
                                  ) : (
                                    <Checkbox
                                      data-testid={`role-perm-${roleIdToken}-${s.id}-${a}`}
                                      checked={!!val}
                                      disabled={readonly}
                                      onCheckedChange={() => onToggleAction(s.id, a)}
                                    />
                                  )}
                                </TableCell>
                              );
                            })}
                          </TableRow>
                        );
                      })}
                    </Fragment>
                  );
                })}
                {!anyVisible && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">
                      {t('rbac.drawer.noVisibleModules')}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        <div className="flex items-center gap-2 border-t border-border px-6 py-3">
          {!readonly && (
            <Button data-testid="role-save" onClick={handleSave} disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('rbac.drawer.save')}
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {readonly ? t('rbac.drawer.close') : t('rbac.drawer.cancel')}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
