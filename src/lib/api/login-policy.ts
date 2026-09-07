import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  apiRequest,
  isPublicationPendingResponse,
  useApiRequest,
  type ApiRequestFn,
  type ConfigMutationResult,
} from "@/lib/api/client";

// GT-13320: Platform and Tenant login-security scopes are independent.

export interface LoginPolicy {
  minLength: number;
  minCharClasses: number;
  historyLimit: number;
  passwordMaxAgeDays: number;
  sessionTimeoutSecs: number;
  maxOnline: number;
  overflowPolicy: "kick_earliest" | "reject_new";
  ipMode: "none" | "whitelist" | "blacklist";
  maxLoginAttempts: number;
  lockoutMinutes: number;
  captchaAfterFailures: number;
  reloginAfterChange: boolean;
  forceTwoFactor: boolean;
  twoFactorEnabled: boolean;
}

/** Sparse values explicitly configured in the current scope. */
export type ConfiguredLoginPolicy = Partial<{
  [
    K in keyof Omit<LoginPolicy, "reloginAfterChange" | "twoFactorEnabled">
  ]: LoginPolicy[K];
}>;

export type LoginPolicyWrite = Partial<{
  [K in keyof ConfiguredLoginPolicy]: ConfiguredLoginPolicy[K] | null;
}>;

export interface LoginIPRule {
  id: number;
  tenant_id: number | null;
  cidr: string;
  remark: string;
  updated_at: string;
}

export interface LoginPolicyResponse {
  scope: "platform" | "tenant";
  defaults: LoginPolicy;
  configured: ConfiguredLoginPolicy | null;
  effective: LoginPolicy;
  sources: Record<string, "system_default" | "platform" | "tenant" | "system">;
  tiers: Record<string, number[]>;
  ipRules: LoginIPRule[];
}

export function putLoginPolicy(
  body: LoginPolicyWrite,
  tenantId?: number | null,
  requestFn: ApiRequestFn = apiRequest,
): Promise<ConfigMutationResult<LoginPolicyResponse>> {
  const qs = tenantId != null ? `?tenant_id=${tenantId}` : "";
  return requestFn<ConfigMutationResult<LoginPolicyResponse>>(
    `/security/login-policy${qs}`,
    {
      method: "PUT",
      body,
    },
  );
}

export function useLoginPolicy(tenantId?: number | null) {
  const { apiRequest } = useApiRequest();
  const qs = tenantId != null ? `?tenant_id=${tenantId}` : "";
  return useQuery({
    queryKey: ["security", "login-policy", tenantId ?? "self"],
    queryFn: () =>
      apiRequest<LoginPolicyResponse>(`/security/login-policy${qs}`),
  });
}

export function useUpdateLoginPolicy(tenantId?: number | null) {
  const { apiRequest } = useApiRequest();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: LoginPolicyWrite) =>
      putLoginPolicy(body, tenantId, apiRequest),
    onSuccess: (result, body) => {
      const queryKey = [
        "security",
        "login-policy",
        tenantId ?? "self",
      ] as const;
      if (isPublicationPendingResponse(result)) {
        qc.setQueryData<LoginPolicyResponse | undefined>(queryKey, (current) =>
          current ? applyCommittedLoginPolicy(current, body) : current,
        );
        return;
      }
      qc.setQueryData(queryKey, result);
    },
  });
}

/** Apply the fields acknowledged as durable without consulting a stale runtime snapshot. */
export function applyCommittedLoginPolicy(
  current: LoginPolicyResponse,
  body: LoginPolicyWrite,
): LoginPolicyResponse {
  const effective = { ...current.effective };
  const configured = { ...(current.configured ?? {}) } as ConfiguredLoginPolicy;
  const sources = { ...current.sources };
  for (const [key, value] of Object.entries(body)) {
    const field = key as keyof ConfiguredLoginPolicy;
    if (value == null) {
      delete configured[field];
      (effective as unknown as Record<string, unknown>)[field] =
        current.defaults[field];
      sources[field] = "system_default";
    } else {
      (configured as Record<string, unknown>)[field] = value;
      (effective as unknown as Record<string, unknown>)[field] = value;
      sources[field] = current.scope;
    }
  }
  effective.twoFactorEnabled = effective.forceTwoFactor;
  return { ...current, configured, effective, sources };
}

export function useAddLoginIPRule(tenantId?: number | null) {
  const { apiRequest } = useApiRequest();
  const qc = useQueryClient();
  const qs = tenantId != null ? `?tenant_id=${tenantId}` : "";
  return useMutation({
    mutationFn: (body: { cidr: string; remark: string }) =>
      apiRequest<LoginIPRule>(`/security/login-policy/ip-rules${qs}`, {
        method: "POST",
        body,
      }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["security", "login-policy"] }),
  });
}

export function useDeleteLoginIPRule(tenantId?: number | null) {
  const { apiRequest } = useApiRequest();
  const qc = useQueryClient();
  const qs = tenantId != null ? `?tenant_id=${tenantId}` : "";
  return useMutation({
    mutationFn: (id: number) =>
      apiRequest<void>(`/security/login-policy/ip-rules/${id}${qs}`, {
        method: "DELETE",
      }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["security", "login-policy"] }),
  });
}
