import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiRequest } from '@/lib/api/client';

// GT-11959: the layered login-security policy.

export interface LoginPolicy {
  minLength: number;
  minCharClasses: number;
  historyLimit: number;
  passwordMaxAgeDays: number;
  sessionTimeoutSecs: number;
  maxOnline: number;
  overflowPolicy: 'kick_earliest' | 'reject_new';
  ipMode: 'none' | 'whitelist' | 'blacklist';
  reloginAfterChange: boolean;
  forceTwoFactor: boolean;
  /**
   * Plan D / spec §5 (A-18). NOT layered like the fields above — resolved by the
   * GET handler, not MergePolicy. On baseline it is always false (the platform
   * layer has no per-tenant "self" concept). On effective it is the fully
   * resolved signal for the viewer:
   * baseline.forceTwoFactor || override.forceTwoFactor || override.twoFactorEnabled.
   */
  twoFactorEnabled: boolean;
}

/**
 * A tenant's overrides. Every field is nullable: null = "not overridden".
 *
 * twoFactorEnabled/forceTwoFactor live on the `tenants` table, not
 * tenant_login_policy — they do not participate in MergePolicy, they are
 * response-only placement resolved explicitly by the GET handler:
 *   - twoFactorEnabled: the tenant's OWN self-toggle.
 *   - forceTwoFactor: the platform forcing THIS tenant specifically (distinct
 *     from the GLOBAL LoginPolicy.forceTwoFactor on baseline/effective).
 * null on a platform-scope response (no tenant row to read from).
 */
export type LoginPolicyOverride = {
  [K in keyof Omit<LoginPolicy, 'reloginAfterChange' | 'forceTwoFactor' | 'twoFactorEnabled'>]:
    LoginPolicy[K] | null;
} & {
  twoFactorEnabled: boolean | null;
  forceTwoFactor: boolean | null;
};

/**
 * The brute-force controls. PLATFORM SCOPE ONLY.
 *
 * They are not layered: they run PRE-auth and are keyed by username, so a
 * per-tenant value would answer differently for a real user than for a
 * non-existent one — a username-enumeration oracle (spec §2.5). The server rejects
 * a tenant-scope write carrying any of them.
 *
 * lockoutMinutes = -1 means PERMANENT (only an admin unlock lifts it).
 */
export interface GlobalOnlyPolicy {
  maxLoginAttempts: number;
  lockoutMinutes: number;
  captchaAfterFailures: number;
}

export type LoginPolicyWrite = Partial<LoginPolicyOverride> & Partial<GlobalOnlyPolicy>;

export interface LoginIPRule {
  id: number;
  tenant_id: number | null;
  cidr: string;
  remark: string;
  updated_at: string;
}

export interface LoginPolicyResponse {
  scope: 'platform' | 'tenant';
  baseline: LoginPolicy;
  override: LoginPolicyOverride | null;
  /** stricter(baseline, override), resolved server-side at read time. */
  effective: LoginPolicy;
  /**
   * Fields the tenant saved that the platform has SINCE out-tightened. They are
   * not rewritten (the tenant's intent is kept) but they are not enforced either —
   * the UI has to say so rather than display an inert number.
   */
  belowBaseline: string[] | null;
  tiers: Record<string, number[]>;
  ipRules: { platform: LoginIPRule[]; tenant: LoginIPRule[] };
  /**
   * Platform-wide, NOT layered: max login attempts, lockout minutes, captcha
   * threshold. Shown read-only rather than hidden — omitting them reads as "this
   * feature is missing".
   *
   * They cannot be per-tenant: they are evaluated pre-auth and keyed by username,
   * so an unknown user would fall back to the baseline while a real one used its
   * tenant's value, and the difference between those two answers tells an attacker
   * whether the account exists.
   */
  globalOnly: Record<string, number>;
}

export function useLoginPolicy(tenantId?: number | null) {
  const { apiRequest } = useApiRequest();
  const qs = tenantId != null ? `?tenant_id=${tenantId}` : '';
  return useQuery({
    queryKey: ['security', 'login-policy', tenantId ?? 'self'],
    queryFn: () => apiRequest<LoginPolicyResponse>(`/security/login-policy${qs}`),
  });
}

export function useUpdateLoginPolicy(tenantId?: number | null) {
  const { apiRequest } = useApiRequest();
  const qc = useQueryClient();
  const qs = tenantId != null ? `?tenant_id=${tenantId}` : '';
  return useMutation({
    mutationFn: (body: LoginPolicyWrite) =>
      apiRequest<LoginPolicyResponse>(`/security/login-policy${qs}`, { method: 'PUT', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['security', 'login-policy'] }),
  });
}

export function useAddLoginIPRule(tenantId?: number | null) {
  const { apiRequest } = useApiRequest();
  const qc = useQueryClient();
  const qs = tenantId != null ? `?tenant_id=${tenantId}` : '';
  return useMutation({
    mutationFn: (body: { cidr: string; remark: string }) =>
      apiRequest<LoginIPRule>(`/security/login-policy/ip-rules${qs}`, { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['security', 'login-policy'] }),
  });
}

export function useDeleteLoginIPRule(tenantId?: number | null) {
  const { apiRequest } = useApiRequest();
  const qc = useQueryClient();
  const qs = tenantId != null ? `?tenant_id=${tenantId}` : '';
  return useMutation({
    mutationFn: (id: number) =>
      apiRequest<void>(`/security/login-policy/ip-rules/${id}${qs}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['security', 'login-policy'] }),
  });
}
