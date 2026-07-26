/**
 * Pure RBAC permission-matrix logic (spec §6.4 3-state 联动 + §7.4/§7.5 route
 * derivation). No React, no side effects — fully unit-testable in isolation.
 *
 * Ports the demo's `RolePermissionTab` `toggleVisible`/`toggleAction` linkage
 * (`design/origin/demo/components/admin/user-permission/role-permission-tab.tsx`)
 * onto the real wire shape (`RolePermission` from `@/lib/api/roles`, itself a
 * mirror of `internal/models/role.go`). The demo splits "visible" into a
 * separate `visibleModules: string[]` array on the `Role` alongside a
 * `permissions: Record<id, ModulePermission>` map; the production model
 * folds `visible` into each `RolePermission` row instead, so the linkage
 * here operates row-at-a-time (a row IS the full unit: visible + the four
 * action bits) rather than draft-array + separate-visible-set.
 *
 * `can*` fields are `boolean | null`: `null` means the action does not apply
 * to that submodule at all (`SubModuleMeta.supportApprove`/`supportDelete`
 * false — rendered as "-" in the UI) and must never become settable, per
 * spec §6.4. `canView`/`canEdit` are never null (every submodule supports
 * view/edit).
 */

import type { Role, RolePermission } from '@/lib/api/roles';
import { rbacSubmodulesForScope, SUBMODULE_ROUTE_MAP, type RbacScope, type SubModuleMeta } from './rbac-modules';

export type PermAction = 'view' | 'edit' | 'approve' | 'delete';

/** The submodule-capability bits the linkage needs — a structural subset of `SubModuleMeta`. */
export interface SubmoduleActionMeta {
  supportApprove: boolean;
  supportDelete: boolean;
}

/**
 * The minimal row shape the row-level linkage functions operate on. `RolePermission`
 * satisfies this structurally (its `visible` is required where this makes it
 * optional, which TS allows), and so does a bare `{ canView, canEdit, canApprove,
 * canDelete }` literal with no `visible`/`submoduleId` at all.
 */
export interface PermissionRow {
  visible?: boolean;
  canView: boolean | null;
  canEdit: boolean | null;
  canApprove: boolean | null;
  canDelete: boolean | null;
}

const ACTION_FIELD: Record<PermAction, keyof PermissionRow> = {
  view: 'canView',
  edit: 'canEdit',
  approve: 'canApprove',
  delete: 'canDelete',
};

/** view/edit always apply; approve/delete only apply per the submodule's capability flags. */
function isActionSupported(action: PermAction, meta: SubmoduleActionMeta): boolean {
  if (action === 'approve') return meta.supportApprove;
  if (action === 'delete') return meta.supportDelete;
  return true;
}

/**
 * Row-level 3-state 联动 for a single action checkbox toggle (spec §6.4):
 *  - Unsupported action (per `meta`) is a no-op — the field stays `null`, never settable.
 *  - Turning an action ON also implies `visible` + `canView` (you cannot have
 *    an active permission bit on a hidden/unviewable row).
 *  - Turning `view` OFF cascades: `canEdit` forced false; `canApprove`/`canDelete`
 *    forced false IF they were already non-null (an already-null/unsupported
 *    field is left untouched — it never becomes settable via this path either).
 */
export function toggleAction<T extends PermissionRow>(perm: T, action: PermAction, meta: SubmoduleActionMeta): T {
  if (!isActionSupported(action, meta)) return perm;

  const field = ACTION_FIELD[action];
  const current = perm[field];
  const next = !current;
  const result: T = { ...perm, [field]: next };

  if (next) {
    result.canView = true;
    result.visible = true;
  } else if (action === 'view') {
    result.canEdit = false;
    if (result.canApprove !== null) result.canApprove = false;
    if (result.canDelete !== null) result.canDelete = false;
  }

  return result;
}

/**
 * Row-level 联动 for the module-visibility checkbox (spec §6.4): turning
 * visibility OFF clears/hides the whole row's action bits (unsupported
 * actions stay `null`); turning it ON only flips `visible` — it does not
 * grant any action, mirroring the demo (`emptyModulePermission` is only
 * applied on the off transition).
 */
export function toggleVisible<T extends PermissionRow>(perm: T, meta: SubmoduleActionMeta): T {
  const nextVisible = !perm.visible;
  if (nextVisible) {
    return { ...perm, visible: true };
  }
  return {
    ...perm,
    visible: false,
    canView: false,
    canEdit: false,
    canApprove: meta.supportApprove ? false : null,
    canDelete: meta.supportDelete ? false : null,
  };
}

/**
 * Matrix-level convenience for Task 7's UI state (a `RolePermission[]` array
 * keyed by `submoduleId`): applies {@link toggleAction} to the one row
 * matching `subId` and returns a new array (other rows untouched, same
 * references — cheap to diff).
 */
export function updatePermissionsAction(
  permissions: RolePermission[],
  subId: string,
  action: PermAction,
  meta: SubmoduleActionMeta,
): RolePermission[] {
  return permissions.map((p) => (p.submoduleId === subId ? toggleAction(p, action, meta) : p));
}

/** Matrix-level convenience mirroring {@link updatePermissionsAction} for {@link toggleVisible}. */
export function updatePermissionsVisible(
  permissions: RolePermission[],
  subId: string,
  meta: SubmoduleActionMeta,
): RolePermission[] {
  return permissions.map((p) => (p.submoduleId === subId ? toggleVisible(p, meta) : p));
}

/** Build one empty row for a submodule (`visible`/`canView`/`canEdit` false, unsupported actions null). */
export function emptyPermissionRow(meta: SubModuleMeta): RolePermission {
  return {
    submoduleId: meta.id,
    visible: false,
    canView: false,
    canEdit: false,
    canApprove: meta.supportApprove ? false : null,
    canDelete: meta.supportDelete ? false : null,
  };
}

/**
 * Full empty/default permission matrix for a scope — one row per submodule
 * assignable within it (reuses Task 3's `rbacSubmodulesForScope`), matching
 * the demo's `emptyDraft` matrix initialization.
 */
export function buildEmptyPermissionMatrix(scope: RbacScope): RolePermission[] {
  return rbacSubmodulesForScope(scope).map(emptyPermissionRow);
}

/** The set of submodule ids a role can SEE: `visible && canView` (spec §6.4/§7.4). */
export function visibleSubmoduleIds(role: Pick<Role, 'permissions'>): Set<string> {
  const ids = new Set<string>();
  for (const p of role.permissions ?? []) {
    if (p.visible && p.canView) ids.add(p.submoduleId);
  }
  return ids;
}

/**
 * The set of webapp routes (hrefs) a role's visible+viewable submodules map
 * to, via Task 3's `SUBMODULE_ROUTE_MAP` — for sidebar menu-visibility
 * (Task 6). Submodules with no route yet (`route()` with no `href`) are
 * skipped.
 */
export function deriveVisibleRoutes(role: Pick<Role, 'permissions'>): Set<string> {
  const routes = new Set<string>();
  for (const id of visibleSubmoduleIds(role)) {
    const href = SUBMODULE_ROUTE_MAP[id]?.href;
    if (href) routes.add(href);
  }
  return routes;
}

/** Alias for {@link deriveVisibleRoutes} matching the Task 4 brief's alternate naming. */
export const visibleRoutesForRole = deriveVisibleRoutes;

/**
 * Has this role's permission matrix actually been configured?
 *
 * A role with ZERO permission rows is **unconfigured**, not "denied everything".
 * The distinction matters because `init.sql` seeds the four system default roles
 * (super_admin / platform_auditor / tenant_ops / tenant_auditor) without seeding
 * any `role_permissions` rows, so every non-super account starts with an empty
 * matrix. Treating that as deny-all makes `deriveVisibleRoutes` return {} and
 * `canOnSubmodule` return false for everything, which empties the sidebar for a
 * real tenant admin.
 *
 * `users/page.tsx` already draws the same distinction for its tabs (the coarse
 * `|| isTenantAdmin` fallbacks); this exposes it so menu visibility can stay
 * consistent with it instead of diverging.
 *
 * Once ANY row exists the matrix is authoritative and is honoured strictly — so
 * an administrator who deliberately restricts a role still gets exactly that.
 */
export function hasConfiguredMatrix(role: Pick<Role, 'permissions'> | null | undefined): boolean {
  return (role?.permissions?.length ?? 0) > 0;
}

/**
 * Page-level operation-availability query: can this role perform `action` on
 * `subId`? False when the submodule row is missing, not visible, or the
 * action is unset/unsupported (`null`/`false`).
 */
export function canOnSubmodule(role: Pick<Role, 'permissions'>, subId: string, action: PermAction): boolean {
  const row = (role.permissions ?? []).find((p) => p.submoduleId === subId);
  if (!row || !row.visible) return false;
  return Boolean(row[ACTION_FIELD[action]]);
}
