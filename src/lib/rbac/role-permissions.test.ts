import { describe, it, expect } from 'vitest';
import {
  toggleAction,
  toggleVisible,
  updatePermissionsAction,
  updatePermissionsVisible,
  visibleSubmoduleIds,
  deriveVisibleRoutes,
  visibleRoutesForRole,
  canOnSubmodule,
  buildEmptyPermissionMatrix,
  emptyPermissionRow,
  hasConfiguredMatrix,
} from './role-permissions';
import type { Role, RolePermission } from '@/lib/api/roles';
import { findSubModule } from './rbac-modules';

const meta = { supportApprove: true, supportDelete: true };
const noApproveNoDelete = { supportApprove: false, supportDelete: false };

describe('3-state 联动 (spec §6.4)', () => {
  it('(brief a) ticking edit auto-ticks view', () => {
    const perm = { canView: false, canEdit: false, canApprove: false, canDelete: false };
    const next = toggleAction(perm, 'edit', meta);
    expect(next.canEdit).toBe(true);
    expect(next.canView).toBe(true);
  });

  it('(brief b) un-ticking view clears edit/approve/delete but keeps already-null fields null', () => {
    const perm = { canView: true, canEdit: true, canApprove: true, canDelete: null };
    const next = toggleAction(perm, 'view', meta);
    expect(next.canView).toBe(false);
    expect(next.canEdit).toBe(false);
    expect(next.canApprove).toBe(false);
    expect(next.canDelete).toBeNull();
  });

  it('(a) toggling visible off clears/hides the row\'s actions (unsupported stay null)', () => {
    const row: RolePermission = {
      submoduleId: 'disposal-center', visible: true, canView: true, canEdit: true, canApprove: true, canDelete: true,
    };
    const next = toggleVisible(row, meta);
    expect(next.visible).toBe(false);
    expect(next.canView).toBe(false);
    expect(next.canEdit).toBe(false);
    expect(next.canApprove).toBe(false);
    expect(next.canDelete).toBe(false);

    // unsupported actions must stay null through the same transition
    const noApproveRow: RolePermission = {
      submoduleId: 'monitor-dashboard', visible: true, canView: true, canEdit: true, canApprove: null, canDelete: null,
    };
    const next2 = toggleVisible(noApproveRow, noApproveNoDelete);
    expect(next2.canApprove).toBeNull();
    expect(next2.canDelete).toBeNull();
  });

  it('toggling visible ON does not itself grant any action', () => {
    const row: RolePermission = {
      submoduleId: 'disposal-center', visible: false, canView: false, canEdit: false, canApprove: false, canDelete: false,
    };
    const next = toggleVisible(row, meta);
    expect(next.visible).toBe(true);
    expect(next.canView).toBe(false);
    expect(next.canEdit).toBe(false);
  });

  it('(b) setting canEdit true on a visible+view row stays consistent (view stays true)', () => {
    const perm = { canView: true, canEdit: false, canApprove: false, canDelete: false, visible: true };
    const next = toggleAction(perm, 'edit', meta);
    expect(next.canEdit).toBe(true);
    expect(next.canView).toBe(true);
    expect(next.visible).toBe(true);
  });

  it('(c) canView false forces edit/approve/delete off', () => {
    const perm = { canView: true, canEdit: true, canApprove: true, canDelete: true, visible: true };
    const next = toggleAction(perm, 'view', meta);
    expect(next.canView).toBe(false);
    expect(next.canEdit).toBe(false);
    expect(next.canApprove).toBe(false);
    expect(next.canDelete).toBe(false);
  });

  it('(d) an unsupported action can never be set true and stays null', () => {
    const perm = { canView: true, canEdit: true, canApprove: null, canDelete: null, visible: true };
    const next = toggleAction(perm, 'approve', noApproveNoDelete);
    expect(next.canApprove).toBeNull();
    // row otherwise untouched
    expect(next.canView).toBe(true);
    expect(next.canEdit).toBe(true);

    const next2 = toggleAction(perm, 'delete', noApproveNoDelete);
    expect(next2.canDelete).toBeNull();
  });

  it('matrix-level updatePermissionsAction/updatePermissionsVisible only touch the targeted row', () => {
    const rows: RolePermission[] = [
      { submoduleId: 'disposal-center', visible: false, canView: false, canEdit: false, canApprove: false, canDelete: false },
      { submoduleId: 'disposal-settings', visible: false, canView: false, canEdit: false, canApprove: false, canDelete: false },
    ];
    const afterAction = updatePermissionsAction(rows, 'disposal-center', 'edit', meta);
    expect(afterAction.find((r) => r.submoduleId === 'disposal-center')?.canEdit).toBe(true);
    expect(afterAction.find((r) => r.submoduleId === 'disposal-settings')).toBe(rows[1]); // untouched, same reference

    const afterVisible = updatePermissionsVisible(rows, 'disposal-settings', meta);
    expect(afterVisible.find((r) => r.submoduleId === 'disposal-settings')?.visible).toBe(true);
    expect(afterVisible.find((r) => r.submoduleId === 'disposal-center')).toBe(rows[0]); // untouched, same reference
  });
});

describe('visible-route derivation (spec §7.4, for Task 6 menu visibility)', () => {
  it('(brief c) deriveVisibleRoutes maps visible submodules to hrefs', () => {
    const role = {
      permissions: [{ submoduleId: 'disposal-center', visible: true, canView: true, canEdit: null, canApprove: null, canDelete: null }],
    } as unknown as Role;
    expect(visibleSubmoduleIds(role).has('disposal-center')).toBe(true);
    expect(deriveVisibleRoutes(role).has('/email-disposal/center')).toBe(true);
    // alias
    expect(visibleRoutesForRole(role).has('/email-disposal/center')).toBe(true);
  });

  it('(e) visibleSubmoduleIds returns exactly the visible+canView submodules', () => {
    const role = {
      permissions: [
        { submoduleId: 'disposal-center', visible: true, canView: true, canEdit: true, canApprove: true, canDelete: true },
        { submoduleId: 'disposal-settings', visible: true, canView: false, canEdit: false, canApprove: false, canDelete: false }, // visible but not viewable
        { submoduleId: 'grey-mail-policy', visible: false, canView: true, canEdit: true, canApprove: true, canDelete: true }, // viewable but hidden
        { submoduleId: 'grey-mail-queue', visible: false, canView: false, canEdit: false, canApprove: false, canDelete: false },
      ],
    } as unknown as Role;
    const ids = visibleSubmoduleIds(role);
    expect(ids).toEqual(new Set(['disposal-center']));
  });

  it('maps the detection-engine status submodule to its dedicated route', () => {
    const role = {
      permissions: [{ submoduleId: 'monitor-security', visible: true, canView: true, canEdit: null, canApprove: null, canDelete: null }],
    } as unknown as Role;
    expect(deriveVisibleRoutes(role)).toEqual(new Set(['/monitoring/security']));
  });

  it('empty permissions yields empty sets, not a throw', () => {
    const role = { permissions: undefined } as unknown as Role;
    expect(visibleSubmoduleIds(role).size).toBe(0);
    expect(deriveVisibleRoutes(role).size).toBe(0);
  });
});

describe('canOnSubmodule', () => {
  it('true only when the row is visible and the action bit is truthy', () => {
    const role = {
      permissions: [
        { submoduleId: 'disposal-center', visible: true, canView: true, canEdit: true, canApprove: false, canDelete: null },
      ],
    } as unknown as Role;
    expect(canOnSubmodule(role, 'disposal-center', 'view')).toBe(true);
    expect(canOnSubmodule(role, 'disposal-center', 'edit')).toBe(true);
    expect(canOnSubmodule(role, 'disposal-center', 'approve')).toBe(false);
    expect(canOnSubmodule(role, 'disposal-center', 'delete')).toBe(false);
    expect(canOnSubmodule(role, 'unknown-submodule', 'view')).toBe(false);
  });

  it('false when the row exists but is not visible, even if canView is true', () => {
    const role = {
      permissions: [{ submoduleId: 'disposal-center', visible: false, canView: true, canEdit: true, canApprove: true, canDelete: true }],
    } as unknown as Role;
    expect(canOnSubmodule(role, 'disposal-center', 'view')).toBe(false);
  });
});

describe('buildEmptyPermissionMatrix / emptyPermissionRow', () => {
  it('produces one all-false row per submodule assignable in the scope, unsupported actions null', () => {
    const rows = buildEmptyPermissionMatrix('tenant');
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.visible).toBe(false);
      expect(r.canView).toBe(false);
      expect(r.canEdit).toBe(false);
      const sub = findSubModule(r.submoduleId);
      expect(sub).toBeDefined();
      expect(r.canApprove).toBe(sub!.supportApprove ? false : null);
      expect(r.canDelete).toBe(sub!.supportDelete ? false : null);
    }
    // platform-only module must not appear in the tenant-scope matrix
    expect(rows.some((r) => r.submoduleId === 'tenant-management')).toBe(false);
  });

  it('emptyPermissionRow mirrors buildEmptyPermissionMatrix for a single submodule', () => {
    const sub = findSubModule('disposal-center')!;
    const row = emptyPermissionRow(sub);
    expect(row).toEqual({
      submoduleId: 'disposal-center', visible: false, canView: false, canEdit: false, canApprove: false, canDelete: false,
    });
  });
});


describe('hasConfiguredMatrix — empty matrix means unconfigured, not deny-all', () => {
  // init.sql seeds the four system default roles but seeds NO role_permissions
  // rows, so every non-super account starts with permissions: []. Treating that
  // as deny-all empties the sidebar for a real tenant admin (GT-11586).
  it('is false for a role with no permission rows', () => {
    expect(hasConfiguredMatrix({ permissions: [] })).toBe(false);
  });

  it('is false when permissions is absent entirely', () => {
    expect(hasConfiguredMatrix({} as Pick<Role, 'permissions'>)).toBe(false);
    expect(hasConfiguredMatrix(null)).toBe(false);
    expect(hasConfiguredMatrix(undefined)).toBe(false);
  });

  it('is true as soon as any row exists — even an all-denied one', () => {
    // An administrator who deliberately denies everything HAS configured the
    // matrix; that must stay authoritative and must not re-open via fallback.
    const denied: RolePermission = {
      submoduleId: 'mail-disposal',
      visible: false,
      canView: false,
      canEdit: false,
      canApprove: null,
      canDelete: null,
    };
    expect(hasConfiguredMatrix({ permissions: [denied] })).toBe(true);
  });
});
