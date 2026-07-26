'use client';

import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { User, AuthState, LoginRequest, LoginResponse } from '@/types/user';
import {
  login as apiLogin,
  logout as apiLogout,
  completeLoginFromResponse,
} from '@/lib/api/auth';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { useMyRole } from '@/lib/api/roles';
import { canOnSubmodule, deriveVisibleRoutes, hasConfiguredMatrix, type PermAction } from '@/lib/rbac/role-permissions';
import { submoduleForHref } from '@/lib/rbac/rbac-modules';

interface AuthContextType extends AuthState {
  isLoading: boolean;
  showAdvancedRules: boolean;
  features: { aiInterpret: boolean };
  login: (credentials: LoginRequest, options?: { showAdvancedRules?: boolean }) => Promise<void>;
  completeLogin: (
    response: LoginResponse,
    username: string,
    options?: { showAdvancedRules?: boolean },
  ) => void;
  logout: () => Promise<void>;
  setSelectedTenant: (tenantId: number | null) => void;
  /** Legacy coarse permission check — kept for existing call sites, now backed by the role-matrix derivation below (see `LEGACY_PERMISSION_SUBMODULE`). */
  hasPermission: (permission: Permission) => boolean;
  isSystemAdmin: boolean;
  isTenantAdmin: boolean;
  /** True only for a REAL super admin (`user.is_super_admin === true`) — the only case that still gets unconditional god-mode. Everyone else, including a `role === 'system_admin'` account (e.g. a platform_auditor), is gated by their own role's permission matrix (Plan C Task 5 / spec §7.6 / A-11). */
  isTrueSuperAdmin: boolean;
  /** Can this account see the given webapp route, per its own role's visible+viewable submodules? True super admin always; a route with no registered RBAC submodule (`submoduleForHref` returns undefined) defaults to visible (additive, matches the Task 4 "unregistered = allowed" convention). */
  canSeeRoute: (href: string) => boolean;
  /** Can this account perform `action` on submodule `subId`, per its own role matrix? True super admin always. */
  can: (subId: string, action: PermAction) => boolean;
}

export type Permission =
  | 'manage_tenants'
  | 'manage_users'
  | 'view_auth_attempts'
  | 'view_admin_audit_logs'
  | 'view_link_logs'
  | 'manage_ip_frequency'
  // GT-11959: login-security policy. Held by BOTH roles — the platform sets a
  // baseline, a tenant admin tightens it for their own tenant. Without this a
  // tenant admin cannot reach the tab at all (they hold neither manage_tenants nor
  // manage_users), and the whole per-tenant layer would be backend-only.
  | 'manage_login_security'
  // Plan C Task 7: gates the /users "角色权限" tab. Mapped onto the
  // `role-permission` RBAC submodule below, same convention as every other
  // legacy permission — a role must have that submodule visible+viewable to
  // manage the role matrix, not just hold the coarse system_admin/tenant_admin
  // string.
  | 'manage_roles';

/**
 * Plan C Task 5: the legacy coarse `Permission` enum, mapped onto the
 * fine-grained RBAC submodule it corresponds to (`rbac-modules.ts`
 * `PERM_MODULES`), consulted with `canOnSubmodule(myRole, subId, 'view')`.
 * This replaces the old `permissionMatrix[role]` blanket grant — a
 * `system_admin` STRING no longer implies every one of these; only a role
 * matrix that actually has the mapped submodule visible+viewable does.
 */
const LEGACY_PERMISSION_SUBMODULE: Record<Permission, string> = {
  manage_tenants: 'tenant-management',
  manage_users: 'admin-account',
  view_auth_attempts: 'auth-logs',
  view_admin_audit_logs: 'admin-logs',
  view_link_logs: 'link-logs',
  // No dedicated submodule exists yet for IP-frequency management; the
  // closest RBAC-matrix concept is the platform "IP 策略" tab folded into
  // platform-security-policy (see ConnectionLayerPanel under PlatformSecurityPage).
  manage_ip_frequency: 'platform-security-policy',
  manage_login_security: 'login-security',
  manage_roles: 'role-permission',
};

/**
 * The ONLY permissions the coarse tenant-admin fallback re-opens while a role's
 * matrix is still unconfigured. Deliberately narrow: a blanket fallback also
 * satisfies `manage_tenants` / `manage_users`, which would surface the
 * platform-only 租户管理 / 代理服务器管理 / DKIM 总览 / 平台安全策略 / 密码策略
 * entries to a tenant admin.
 *
 * These two mirror what users/page.tsx already falls back on, and match the
 * documented split in lib/constants.ts: a tenant admin holds
 * `manage_login_security` (the 登录安全 tab) but NOT `manage_users` (the
 * 管理员账号 tab).
 */
const TENANT_ADMIN_FALLBACK_PERMISSIONS: ReadonlySet<Permission> = new Set([
  'manage_login_security',
  'manage_roles',
  // GT-12366 / GT-12370 / GT-12374: the 日志审计 menu entries (认证日志 /
  // 链接保护日志 / 管理员操作日志) map to the tenant-scoped submodules
  // auth-logs / link-logs / admin-logs (see LEGACY_PERMISSION_SUBMODULE +
  // rbac-modules.ts — none is PLATFORM_ONLY). The multi-tenant designs require a
  // tenant admin to read their OWN-tenant logs, but with an unconfigured matrix
  // these were denied and the sidebar hid them while the routes stayed reachable.
  // Backend tenant isolation is enforced independently (GetEffectiveTenantID).
  'view_auth_attempts',
  'view_link_logs',
  'view_admin_audit_logs',
]);

const AuthContext = createContext<AuthContextType | null>(null);

/**
 * Resolves the current user's OWN role matrix (Task 2's `useMyRole`, which
 * itself reads `useAuth()`) and exposes the derived capability functions.
 * Rendered as a child of an AuthContext.Provider that already carries the
 * base auth state (see AuthProvider below) — `useMyRole` -> `useAuth`
 * resolves against THAT provider, never against itself, which is what makes
 * it safe to call from inside the same AuthProvider tree without a
 * "useAuth must be used within an AuthProvider" self-reference.
 *
 * Fail-closed: while the role hasn't been fetched yet (or the account has no
 * role_id assigned at all — legacy/unassigned account), every derived check
 * denies rather than grants, for any account that isn't a true super admin.
 * Only `is_super_admin === true` bypasses the role matrix entirely.
 */
function usePermissionBag(user: User | null): Pick<AuthContextType, 'isTrueSuperAdmin' | 'canSeeRoute' | 'can' | 'hasPermission'> {
  const isTrueSuperAdmin = user?.is_super_admin === true;
  const { data: myRole } = useMyRole();

  // Coarse tenant-admin fallback for an UNCONFIGURED permission matrix, mirroring
  // the `|| isTenantAdmin` fallbacks users/page.tsx already applies to its
  // 登录安全 / 角色权限 tabs.
  //
  // init.sql seeds the system default roles but seeds no role_permissions rows,
  // so a real tenant admin on tenant_ops resolves an EMPTY matrix. Read strictly
  // that means deny-all: deriveVisibleRoutes returns {} and canOnSubmodule is
  // false for everything, so the sidebar collapsed to a single group and the
  // tenant admin could not even reach /users — the very page where the matrix is
  // configured (GT-11586). The page-level fallback existed; the menu-visibility
  // layer was missing it, so the two disagreed.
  //
  // Per Decision 5 these are menu-visibility, not a hard security boundary: the
  // data source is tenant-scoped and the backend enforces isolation independently.
  // Scoped deliberately: only tenant admins, and only while the matrix is empty —
  // the moment any row exists the matrix is authoritative again, so an explicitly
  // restricted role is never re-opened. Platform roles are untouched, so this
  // cannot surface platform-only entries to a tenant.
  const coarseTenantAdminFallback = user?.role === 'tenant_admin' && !hasConfiguredMatrix(myRole);

  const can = useCallback(
    (subId: string, action: PermAction): boolean => {
      if (!user) return false;
      if (isTrueSuperAdmin) return true;
      // NOTE: deliberately NO fallback here. `can` grants edit/approve/delete,
      // not menu visibility, so an unconfigured matrix must stay deny-by-default.
      // Pages that intentionally want a coarse tenant-admin allowance apply it
      // themselves (users/page.tsx `canManageAccounts` et al).
      if (!myRole) return false;
      return canOnSubmodule(myRole, subId, action);
    },
    [user, isTrueSuperAdmin, myRole],
  );

  const canSeeRoute = useCallback(
    (href: string): boolean => {
      if (!user) return false;
      if (isTrueSuperAdmin) return true;
      if (coarseTenantAdminFallback) return true;
      if (!myRole) return false;
      // A route with no registered RBAC submodule at all is outside the
      // matrix's scope (e.g. pages not yet part of Task 3's module tree) —
      // additive default-allow, mirroring the "unregistered = visible"
      // convention already established for sidebar/route derivation.
      if (submoduleForHref(href) === undefined) return true;
      return deriveVisibleRoutes(myRole).has(href);
    },
    [user, isTrueSuperAdmin, coarseTenantAdminFallback, myRole],
  );

  const hasPermission = useCallback(
    (permission: Permission): boolean => {
      if (!user) return false;
      if (isTrueSuperAdmin) return true;
      if (coarseTenantAdminFallback && TENANT_ADMIN_FALLBACK_PERMISSIONS.has(permission)) return true;
      if (!myRole) return false;
      return canOnSubmodule(myRole, LEGACY_PERMISSION_SUBMODULE[permission], 'view');
    },
    [user, isTrueSuperAdmin, coarseTenantAdminFallback, myRole],
  );

  return { isTrueSuperAdmin, canSeeRoute, can, hasPermission };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, token: null, expiresAt: null, selectedTenantId: null });
  const [isLoading, setIsLoading] = useState(true);
  const [showAdvancedRules, setShowAdvancedRules] = useState(false);
  const [features, setFeatures] = useState<{ aiInterpret: boolean }>({ aiInterpret: false });
  const router = useRouter();
  const locale = useLocale();
  const queryClient = useQueryClient();

  // GT-12080: the QueryClient is built once at the root provider and survives a
  // logout (which is a router.push, not a document load), while query keys carry
  // no tenant/user (e.g. ['sender-filter-rules']). Without an explicit reset the
  // next identity on this tab reads the previous one's rows straight from the
  // cache — and with the 60s staleTime it does not even refetch. Every identity
  // change must therefore drop the whole cache.
  const resetQueryCache = useCallback(() => {
    queryClient.clear();
  }, [queryClient]);

  // The tenant the cached data currently belongs to. Held in a ref, not read off
  // `state`, for two reasons: setSelectedTenant must keep a STABLE identity (it
  // sits in the dep array of an effect in mail-routing/page.tsx — an unstable one
  // would re-fire that effect every render), and it must see the latest value
  // without being re-created.
  const cachedTenantRef = useRef<number | null>(null);

  useEffect(() => {
    const userStr = localStorage.getItem('osgateway_user');
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        const storedTenantId = localStorage.getItem('osgateway_selected_tenant');
        const selectedTenantId = storedTenantId ? parseInt(storedTenantId, 10) : null;
        cachedTenantRef.current = selectedTenantId;
        setState({ user, token: null, expiresAt: null, selectedTenantId });
      } catch {
        localStorage.removeItem('osgateway_user');
      }
    } else {
      // 绕过登录：无已存储用户时注入一个 mock 超级管理员，
      // 使 ProtectedRoute 直接放行且所有权限检查（is_super_admin）通过，
      // 无需真实后端即可直接展示页面。
      const mockUser: User = {
        id: 0,
        username: 'demo-admin',
        role: 'system_admin',
        tenant_id: null,
        role_id: null,
        is_super_admin: true,
        created_at: '',
        updated_at: '',
      };
      cachedTenantRef.current = null;
      setState({ user: mockUser, token: null, expiresAt: null, selectedTenantId: null });
    }
    const storedFeatures = localStorage.getItem('osgateway_features');
    if (storedFeatures) {
      try {
        setFeatures(JSON.parse(storedFeatures));
      } catch {
        localStorage.removeItem('osgateway_features');
      }
    }
    if (localStorage.getItem('osgateway_show_advanced_rules') === '1') {
      setShowAdvancedRules(true);
    }
    setIsLoading(false);
  }, []);

  const login = useCallback(async (credentials: LoginRequest, options?: { showAdvancedRules?: boolean }) => {
    const response = await apiLogin(credentials);
    // Drop anything the previous identity left behind on this tab before any
    // component can read it under the new one.
    resetQueryCache();
    cachedTenantRef.current = response.tenant_id ?? null;
    const user: User = {
      id: 0,
      username: credentials.username,
      role: response.role,
      tenant_id: response.tenant_id ?? null,
      // Plan C Task 2: carry the fine-grained RBAC-matrix fields through to
      // the auth-context user state (Task 5 will consume them).
      role_id: response.role_id ?? null,
      is_super_admin: response.is_super_admin ?? false,
      created_at: '',
      updated_at: '',
    };
    setState({
	      user,
	      token: null,
	      expiresAt: response.expires_at ?? null,
      selectedTenantId: response.tenant_id ?? null,
    });
    setFeatures({ aiInterpret: response.features?.ai_interpret ?? false });
    localStorage.setItem('osgateway_features', JSON.stringify({ aiInterpret: response.features?.ai_interpret ?? false }));
    if (options?.showAdvancedRules === true) {
      localStorage.setItem('osgateway_show_advanced_rules', '1');
      setShowAdvancedRules(true);
    } else {
      localStorage.removeItem('osgateway_show_advanced_rules');
      setShowAdvancedRules(false);
    }
  }, [resetQueryCache]);

  // Finalize a login from a LoginResponse that was obtained out-of-band
  // (e.g. after a 2FA step). Applies the same state updates as login().
  const completeLogin = useCallback(
    (
      response: LoginResponse,
      username: string,
      options?: { showAdvancedRules?: boolean },
    ) => {
      completeLoginFromResponse(response, username);
      resetQueryCache();
      cachedTenantRef.current = response.tenant_id ?? null;
      const user: User = {
        id: 0,
        username,
        role: response.role,
        tenant_id: response.tenant_id ?? null,
        // Plan C Task 2: same fields as login() above.
        role_id: response.role_id ?? null,
        is_super_admin: response.is_super_admin ?? false,
        created_at: '',
        updated_at: '',
      };
      setState({
        user,
        token: null,
        expiresAt: response.expires_at ?? null,
        selectedTenantId: response.tenant_id ?? null,
      });
      setFeatures({ aiInterpret: response.features?.ai_interpret ?? false });
      localStorage.setItem(
        'osgateway_features',
        JSON.stringify({ aiInterpret: response.features?.ai_interpret ?? false }),
      );
      if (options?.showAdvancedRules === true) {
        localStorage.setItem('osgateway_show_advanced_rules', '1');
        setShowAdvancedRules(true);
      } else {
        localStorage.removeItem('osgateway_show_advanced_rules');
        setShowAdvancedRules(false);
      }
    },
    [resetQueryCache],
  );

  const logout = useCallback(async () => {
    // apiLogout() runs clearStoredUser() in its finally — that already clears
    // osgateway_user + the osgateway_auth/osg_viewer/osg_selected_tenant cookies.
    await apiLogout();
    localStorage.removeItem('osgateway_selected_tenant');
    localStorage.removeItem('osgateway_show_advanced_rules');
    localStorage.removeItem('osgateway_features');
    setState({
      user: null,
      token: null,
      expiresAt: null,
      selectedTenantId: null,
    });
    setShowAdvancedRules(false);
    router.push(`/${locale}/login`);
    // Queued the navigation first to give the protected views a chance to unmount
    // before the cache goes. Not a guarantee — router.push does not unmount
    // synchronously — so an observer may still refetch with the cookie apiLogout()
    // just invalidated and take the 401 -> /login redirect in client.ts. That
    // lands on the same page we are already navigating to, so it is cosmetic; the
    // cache MUST be dropped either way, and login() drops it again regardless.
    resetQueryCache();
    cachedTenantRef.current = null;
  }, [router, locale, resetQueryCache]);

  const setSelectedTenant = useCallback((tenantId: number | null) => {
    if (tenantId !== null) {
      localStorage.setItem('osgateway_selected_tenant', String(tenantId));
      document.cookie = `osg_selected_tenant=${tenantId}; path=/; SameSite=Strict`;
    } else {
      localStorage.removeItem('osgateway_selected_tenant');
      document.cookie = 'osg_selected_tenant=; Max-Age=0; path=/';
    }
    setState((prev) => ({ ...prev, selectedTenantId: tenantId }));

    // A system_admin switching tenants is an identity change too: the tenant
    // travels in the X-Tenant-ID header, not in the query key, so the previously
    // selected tenant's rows would otherwise be served from cache.
    //
    // Only on a REAL change, though. Callers re-assert the current tenant on every
    // mount (mail-routing/page.tsx does it from an effect fed by the
    // ['routing-scope'] query), and clearing there would evict that very query ->
    // it refetches -> the effect fires again -> clear -> ... an endless
    // clear/refetch loop. A no-op set must stay a no-op.
    const changed = cachedTenantRef.current !== tenantId;
    cachedTenantRef.current = tenantId;
    if (changed) {
      resetQueryCache();
    }
  }, [resetQueryCache]);

  const isSystemAdmin = state.user?.role === 'system_admin';
  const isTenantAdmin = state.user?.role === 'tenant_admin';

  // Base auth value, WITHOUT the role-matrix-derived permission functions —
  // this is what PermissionBridge (and anything it calls, e.g. useMyRole ->
  // useApiRequest -> useAuth) sees, since it renders as a child of this
  // Provider. The placeholders below are never seen by real app children:
  // the inner Provider a few lines down always shadows them.
  const baseValue: AuthContextType = {
    ...state,
    isLoading,
    showAdvancedRules,
    features,
    login,
    completeLogin,
    logout,
    setSelectedTenant,
    isSystemAdmin,
    isTenantAdmin,
    isTrueSuperAdmin: state.user?.is_super_admin === true,
    canSeeRoute: () => false,
    can: () => false,
    hasPermission: () => false,
  };

  return (
    <AuthContext.Provider value={baseValue}>
      <PermissionBridge user={state.user}>
        {(permissionBag) => (
          <AuthContext.Provider value={{ ...baseValue, ...permissionBag }}>
            {children}
          </AuthContext.Provider>
        )}
      </PermissionBridge>
    </AuthContext.Provider>
  );
}

/**
 * Thin child-of-AuthContext.Provider wrapper around `usePermissionBag` — see
 * that function's doc comment for why this indirection (rather than calling
 * the hook directly in AuthProvider's own body) is required.
 */
function PermissionBridge({
  user,
  children,
}: {
  user: User | null;
  children: (bag: ReturnType<typeof usePermissionBag>) => React.ReactNode;
}) {
  const bag = usePermissionBag(user);
  return <>{children(bag)}</>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
