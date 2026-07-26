import type { APIRequestContext } from '@playwright/test';

// Shared tenant_admin credentials + provisioning for Playwright.
//
// In the dev product form (`cloud` → multi-tenant), the platform administrator
// (system_admin) is intentionally blocked from Module A — the policy pipeline
// and its per-module editors (GT-12149; PRD §0.1/§1.2 F12/§1.4: "多租户平台管理
// 员不得进入模块A策略流水线"). Module-A specs therefore log in as a tenant_admin
// bound to the globalSetup default tenant. The API setup those specs run stays on
// the platform admin (the backend accepts system_admin), only the browser session
// is the tenant admin.

export const TENANT_ADMIN_USERNAME = 'pw-tenant-admin';
export const TENANT_ADMIN_PASSWORD = 'PwTenantAdm@2026';

// RBAC 之后 POST /users 强制要求 role_id（role 字符串只是校验用的冗余字段）。
// 动态从 /roles 解析一个租户作用域角色的 id（优先 tenant_ops），不硬编码
// 数字 id —— 角色由 DB seed，id 顺序不是契约。
export async function resolveTenantRoleID(
  apiBase: string,
  authToken: string,
  request?: APIRequestContext,
): Promise<number> {
  // 调用方传的 base 有两种：裸 origin('http://host:18080') 和已含 /api/v1 的。
  // 归一化，否则重复前缀会 404，报出来却是「角色不存在」这种误导性错误。
  const origin = apiBase.replace(/\/api\/v1\/?$/, '');
  const url = `${origin}/api/v1/roles?page_size=100`;

  // token 取自 localStorage 的调用方要传 `request`（页面的 APIRequestContext）：
  // 有几个 spec 读 `osgateway_token` 会拿到 ''，因为会话其实在 COOKIE 里。
  // 它们自己的请求能成功（浏览器上下文带 cookie），但裸 fetch() 不带 cookie，
  // 只剩 `Bearer ` ⇒ 401 "Invalid authorization header format"。
  const resp = request
    ? await request.get(url, { headers: { Authorization: `Bearer ${authToken}` } })
    : await fetch(url, { headers: { Authorization: `Bearer ${authToken}` } });
  const ok = typeof resp.ok === 'function' ? resp.ok() : resp.ok;
  const status = typeof resp.status === 'function' ? resp.status() : resp.status;
  if (!ok) {
    throw new Error(`resolveTenantRoleID: list roles failed: ${status}`);
  }
  const body = (await resp.json()) as { items?: Array<{ id: number; code: string; scope: string }> };
  const roles = body.items ?? [];
  const preferred = roles.find((r) => r.code === 'tenant_ops') ?? roles.find((r) => r.scope === 'tenant');
  if (!preferred) {
    throw new Error('resolveTenantRoleID: no tenant-scope role found');
  }
  return preferred.id;
}
// re-runs (same long-lived DB) currently comes back as 500, not 409 — so relying
// on the POST status is not safe.
//
// The existence check must NOT be a login probe. A probe fails for two very
// different reasons — "no such user" and "this account is throttled / needs a
// captcha" — and the second one is self-inflicted: every probe against a
// not-yet-created user is itself a failed login, so a few runs on a long-lived
// DB trip the brute-force gate. After that the probe returns captcha_required
// forever, the helper concludes the user is missing, and the create fails as a
// duplicate — wedging globalSetup for the whole suite. Listing users asks the
// authoritative question and generates no failed-login events at all.
export async function ensureTenantAdmin(
  apiBase: string,
  authToken: string,
  tenantId: number,
): Promise<void> {
  const list = await fetch(`${apiBase}/api/v1/users`, {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  if (list.ok) {
    const body = await list.json();
    if ((body.items ?? []).some((u: { username?: string }) => u.username === TENANT_ADMIN_USERNAME)) {
      return;
    }
  }
  const roleID = await resolveTenantRoleID(apiBase, authToken);
  const resp = await fetch(`${apiBase}/api/v1/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
    body: JSON.stringify({
      username: TENANT_ADMIN_USERNAME,
      role: 'tenant_admin',
      role_id: roleID,
      tenant_id: tenantId,
      password: TENANT_ADMIN_PASSWORD,
      must_change_password: false,
    }),
  });
  if (!resp.ok && resp.status !== 409) {
    throw new Error(`ensureTenantAdmin failed: ${resp.status} ${await resp.text()}`);
  }
}
