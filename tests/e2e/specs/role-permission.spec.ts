// Plan C Task 9: Playwright E2E for the 角色权限 (role-permission) matrix UI
// (Task 7's RolePermissionTab/RoleDrawer) and role-driven sidebar menu
// visibility (Task 6's sidebar-visibility.ts / canSeeRoute).
//
// LIVE RUN DEFERRED — this spec is written and statically validated
// (`playwright test --list`, `tsc --noEmit`) against the real testids/i18n
// strings in the source, but has not been executed against a running dev
// server or the webapp image yet. Run it as part of the consolidated Plan C
// pass once the webapp image is rebuilt (see webapp/AGENTS.md's dev-server
// iteration notes for how to run it locally beforehand).
//
// Real testids consumed here (grepped from source, not guessed):
//   - users/page.tsx:            users-tab-roles
//   - RolePermissionTab.tsx:     create-role, role-search, role-row-<id>,
//                                role-status-toggle-<id>
//   - RoleDrawer.tsx:            role-drawer, role-name-input,
//                                role-remark-input, role-save,
//                                role-perm-<roleIdToken>-<subId>-visible,
//                                role-perm-<roleIdToken>-<subId>-<action>
//     (roleIdToken is the literal "new" in create mode — see
//     RoleDrawer.tsx's `roleIdToken = role?.id ?? 'new'` — or the role's
//     numeric id in edit/view mode.)
//
// Submodule fixture: 'login-security' (users.tabs.loginSecurity) is used for
// the matrix create/edit assertions because it has supportApprove=false and
// supportDelete=false (see rbac-modules.ts PERM_MODULES 'userPermission'
// group), so its approve/delete cells are guaranteed to render as the static
// "-" placeholder rather than a checkbox — exercising the §6.4 unsupported-
// bit contract in role-permissions.ts.
//
// Menu-visibility fixture: the 邮件处置 (email-disposal) and 安全策略
// (security) nav groups (webapp/src/lib/constants.ts) have NO legacy
// `permission` field — their visibility is driven purely by Task 6's RBAC
// gate (canSeeRoute / isItemVisibleByRole), making them a clean signal that
// isn't also gated by the older coarse permission matrix.

import { request } from '@playwright/test';
import { test, expect } from '../fixtures/auth.fixture';
import { RolePermissionPage } from '../pages/role-permission.page';
import { uniqueSuffix } from '../helpers/test-data';
import { waitForToast } from '../helpers/wait';

test.describe.serial('角色权限 matrix UI (Plan C Task 9)', () => {
  const roleName = `e2e_role_${uniqueSuffix()}`;
  let createdRoleId: number;

  test('角色权限 tab renders the role list + permission matrix', async ({ authenticatedPage }) => {
    const rp = new RolePermissionPage(authenticatedPage);
    await rp.goto();
    await rp.expectLoaded();
    await expect(rp.table).toBeVisible();
    await expect(rp.createButton).toBeVisible();
    await expect(rp.searchInput).toBeVisible();
  });

  test('create a custom role via the drawer with 3-state 联动 matrix', async ({ authenticatedPage }) => {
    const rp = new RolePermissionPage(authenticatedPage);
    await rp.goto();
    await rp.expectLoaded();

    await rp.openCreateDrawer();
    await rp.fillName(roleName);

    // Turning a module's visibility on makes its action row appear (initially
    // unchecked — toggleVisible only flips `visible`, per role-permissions.ts).
    await rp.visibleCheckbox('new', 'login-security').click();
    const viewCell = rp.actionCell('new', 'login-security', 'view');
    const editCell = rp.actionCell('new', 'login-security', 'edit');
    await expect(viewCell).toBeVisible();
    await expect(viewCell).toHaveAttribute('aria-checked', 'false');

    // §6.4 3-state 联动: checking `edit` directly (without checking `view`
    // first) must cascade `view` on too — an active permission bit can never
    // sit on an unviewable row (role-permissions.ts `toggleAction`).
    await editCell.click();
    await expect(editCell).toHaveAttribute('aria-checked', 'true');
    await expect(viewCell).toHaveAttribute('aria-checked', 'true');

    // login-security supports neither approve nor delete — those cells must
    // render as the static "-" placeholder, never a settable checkbox.
    const approveCell = rp.actionCell('new', 'login-security', 'approve');
    const deleteCell = rp.actionCell('new', 'login-security', 'delete');
    await expect(approveCell).toHaveText('-');
    await expect(deleteCell).toHaveText('-');
    await expect(approveCell).not.toHaveAttribute('role', 'checkbox');
    await expect(deleteCell).not.toHaveAttribute('role', 'checkbox');

    await rp.save();
    await waitForToast(authenticatedPage);

    createdRoleId = await rp.findRoleRowId(roleName);
    expect(createdRoleId).toBeGreaterThan(0);
  });

  test('edit a custom role\'s matrix and persist the cascade', async ({ authenticatedPage }) => {
    const rp = new RolePermissionPage(authenticatedPage);
    await rp.goto();
    await rp.expectLoaded();

    await rp.openRoleDrawer(roleName);
    // What was saved on create: view + edit both checked for login-security.
    await expect(rp.actionCell(createdRoleId, 'login-security', 'view')).toHaveAttribute('aria-checked', 'true');
    await expect(rp.actionCell(createdRoleId, 'login-security', 'edit')).toHaveAttribute('aria-checked', 'true');

    // Turning `view` off must cascade `edit` off too (an edit bit cannot
    // outlive its view bit — role-permissions.ts `toggleAction`'s
    // `action === 'view'` cascade branch).
    await rp.actionCell(createdRoleId, 'login-security', 'view').click();
    await expect(rp.actionCell(createdRoleId, 'login-security', 'edit')).toHaveAttribute('aria-checked', 'false');

    await rp.save();
    await waitForToast(authenticatedPage);

    // Re-open to confirm the cascade was actually persisted, not just a
    // client-side draft artifact.
    await rp.openRoleDrawer(roleName);
    await expect(rp.actionCell(createdRoleId, 'login-security', 'view')).toHaveAttribute('aria-checked', 'false');
    await expect(rp.actionCell(createdRoleId, 'login-security', 'edit')).toHaveAttribute('aria-checked', 'false');
    await rp.closeDrawer();
  });

  test('system-default / template roles render read-only', async ({ authenticatedPage }) => {
    const rp = new RolePermissionPage(authenticatedPage);
    await rp.goto();
    await rp.expectLoaded();

    // Seeded platform template (configs/postgres/init.sql: code=platform_auditor,
    // scope=platform, is_system_default=TRUE) — always present on a fresh DB.
    await rp.search('平台审计员');
    const row = rp.findRowByName('平台审计员');
    await expect(row).toBeVisible();

    // No 编辑/删除 row actions for a system-default role — only 查看.
    await expect(row.getByRole('button', { name: '编辑' })).toHaveCount(0);
    await expect(row.getByRole('button', { name: '删除' })).toHaveCount(0);
    const viewButton = row.getByRole('button', { name: '查看' });
    await expect(viewButton).toBeVisible();

    const rowId = await rp.rowId(row);
    await expect(rp.statusToggle(rowId)).toBeDisabled();

    await viewButton.click();
    await rp.drawer.waitFor({ state: 'visible' });
    await expect(rp.nameInput).toBeDisabled();
    await expect(rp.remarkInput).toBeDisabled();
    // No save affordance in read-only mode (RoleDrawer.tsx only renders
    // `role-save` when `!readonly`).
    await expect(rp.saveButton).toHaveCount(0);
    // Every module-visible checkbox in the matrix is disabled too (rendered
    // unconditionally per submodule regardless of its checked state).
    const anyVisibleCheckbox = rp.drawer.locator('[data-testid^="role-perm-"][data-testid$="-visible"]').first();
    await expect(anyVisibleCheckbox).toBeVisible();
    await expect(anyVisibleCheckbox).toBeDisabled();

    await rp.closeDrawer();
  });

  test('disable the custom role via its status toggle', async ({ authenticatedPage }) => {
    const rp = new RolePermissionPage(authenticatedPage);
    await rp.goto();
    await rp.expectLoaded();

    await rp.search(roleName);
    const row = rp.findRowByName(roleName);
    await expect(row).toBeVisible();
    await expect(rp.statusToggle(createdRoleId)).toBeEnabled();
    await expect(rp.statusToggle(createdRoleId)).toHaveAttribute('aria-checked', 'true');

    await rp.statusToggle(createdRoleId).click();
    await waitForToast(authenticatedPage);
    await expect(rp.statusToggle(createdRoleId)).toHaveAttribute('aria-checked', 'false');
    await expect(row).toContainText('禁用');
  });
});

// ─── 菜单随权限变化 (Plan C Task 6: role-driven sidebar visibility) ─────────
//
// Provisions a tenant + a tenant-scope custom role that is granted exactly
// ONE submodule (disposal-center, whose route /email-disposal/center has no
// legacy `permission` string — see the file-header note) and a tenant_admin
// account pinned to that role, then logs in as that account and asserts the
// sidebar shows the granted item and hides both its ungranted sibling
// (disposal-settings, same nav group) and an entirely different ungranted
// group (安全策略 / security) whose children collapse the whole parent once
// filtered out (sidebar-nav.tsx: `filteredChildren?.length === 0 → hide
// parent`).

const API_BASE = process.env.PLAYWRIGHT_API_BASE_URL
  ? `${process.env.PLAYWRIGHT_API_BASE_URL.replace(/\/$/, '')}/api/v1`
  : 'http://localhost:18080/api/v1';

async function adminLogin(): Promise<string> {
  const ctx = await request.newContext();
  const r = await ctx.post(`${API_BASE}/auth/login`, {
    data: { username: 'admin', password: 'admin123' },
  });
  expect(r.ok(), `admin login ${r.status()}`).toBeTruthy();
  const body = await r.json();
  await ctx.dispose();
  return body.token as string;
}

type RestrictedCreds = { username: string; password: string };

async function provisionRestrictedTenantAdmin(): Promise<RestrictedCreds> {
  const token = await adminLogin();
  const ctx = await request.newContext();
  const ts = Date.now();

  // 1) Ephemeral tenant.
  const tenantName = `rbac-menu-e2e-${ts}`;
  const tr = await ctx.post(`${API_BASE}/tenants`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { name: tenantName, code: tenantName, description: 'Plan C Task 9 menu-visibility e2e', status: 'active' },
  });
  expect(tr.ok(), `tenant create ${tr.status()}`).toBeTruthy();
  const tenantId = (await tr.json()).tenant.id as number;

  // 2) A tenant-scope custom role visible ONLY on 'disposal-center' (see
  // rbac-modules.ts SUBMODULE_ROUTE_MAP: href '/email-disposal/center',
  // supportApprove/supportDelete both true — canEdit/canApprove/canDelete
  // are left false, only visible+canView are granted, which is all
  // deriveVisibleRoutes (role-permissions.ts) needs to expose the route).
  const rr = await ctx.post(`${API_BASE}/roles`, {
    headers: { Authorization: `Bearer ${token}`, 'X-Tenant-ID': String(tenantId) },
    data: {
      scope: 'tenant',
      name: `rbac-menu-restricted-${ts}`,
      permissions: [
        {
          submoduleId: 'disposal-center',
          visible: true,
          canView: true,
          canEdit: false,
          canApprove: false,
          canDelete: false,
        },
      ],
    },
  });
  expect(rr.ok(), `role create ${rr.status()}`).toBeTruthy();
  const roleId = (await rr.json()).id as number;

  // 3) A tenant_admin account pinned to that role (role_id is authoritative —
  // internal/api/users.go resolveRoleID derives users.role='tenant_admin'
  // from roles(role_id).scope='tenant'). must_change_password:false skips the
  // forced-change ticket dance (spec §1.4 default) since this is a
  // throwaway e2e account.
  const username = `rbac-menu-ta-${ts}`;
  const password = `Verify-${ts}!Aa`;
  const ur = await ctx.post(`${API_BASE}/users`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { username, password, role_id: roleId, tenant_id: tenantId, must_change_password: false },
  });
  expect(ur.ok(), `user create ${ur.status()}`).toBeTruthy();

  await ctx.dispose();
  return { username, password };
}

const restrictedCredsPromise = provisionRestrictedTenantAdmin();

test.describe('菜单随权限变化 (role-driven sidebar visibility, Plan C Task 6)', () => {
  test('restricted role sees its permitted nav item and hides its ungranted sibling', async ({ page }) => {
    const creds = await restrictedCredsPromise;
    await page.goto('/zh/login?advance');
    await page.locator('input[name="username"]').fill(creds.username);
    await page.locator('input[name="password"]').fill(creds.password);
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/dashboard/, { timeout: 15000 });

    // Granted: 邮件处置 parent renders (its one visible child keeps it from
    // being collapsed) and 邮件处置中心 (disposal-center) is reachable.
    await expect(page.getByRole('button', { name: /邮件处置$/ })).toBeVisible();
    await page.getByRole('button', { name: /邮件处置$/ }).click();
    await expect(page.getByRole('button', { name: /邮件处置中心/ })).toBeVisible();

    // Ungranted sibling in the SAME group (disposal-settings has no legacy
    // `permission` field either — this isolates the RBAC gate specifically):
    // never rendered.
    await expect(page.getByRole('button', { name: /处置设置/ })).toHaveCount(0);
  });

  test('restricted role hides an entirely ungranted nav group', async ({ page }) => {
    const creds = await restrictedCredsPromise;
    await page.goto('/zh/login?advance');
    await page.locator('input[name="username"]').fill(creds.username);
    await page.locator('input[name="password"]').fill(creds.password);
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/dashboard/, { timeout: 15000 });

    // 安全策略 (security: strategy-pipeline + group-policy) has neither
    // submodule granted — both children are filtered out, which collapses
    // the parent group entirely (sidebar-nav.tsx SidebarNavItem: hasChildren
    // && filteredChildren?.length === 0 → return null).
    await expect(page.getByRole('button', { name: /安全策略/ })).toHaveCount(0);
  });
});
