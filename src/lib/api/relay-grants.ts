import { apiRequest, type ApiRequestFn } from "./client";

/**
 * Unauthenticated relay authorization (GT-11985/11986, GT-12235 SPF).
 *
 * Source authorization is OR-ed: a connection passes the source check when
 *   (IP ∈ client_cidr) OR (use_spf === true AND SPF(sender_domain, IP) === pass).
 * That source result is AND-ed with the sender-domain match — an IP on the
 * whitelist alone is never enough, which is what keeps this from being an
 * open relay. When `use_spf` is on, `client_cidr` may be empty, meaning the
 * source is authorized solely by the sender domain's DNS (SPF) record; the
 * authorization set is then governed by that domain's DNS rather than the
 * trusted relay IP pool, so such a grant is always privileged.
 */
export interface RelayGrant {
  id: number;
  tenant_id: number;
  /** null = ANY sender domain (a real open relay for that CIDR; privileged only). */
  tenant_domain_id: number | null;
  /** Empty CIDR means the grant authorizes the source via SPF only (use_spf). */
  client_cidr: string;
  /** Authorize source by the sender domain's SPF record (OR with client_cidr). */
  use_spf: boolean;
  privileged: boolean;
  allow_null_sender: boolean;
  skip_antispam: boolean;
  rate_limit_per_hour: number | null;
  is_active: boolean;
  expires_at: string | null;
  note: string;
  sender_domain: string;
  created_at: string;
  updated_at: string;
}

export interface RelayGrantPayload {
  tenant_id?: number;
  tenant_domain_id?: number | null;
  client_cidr: string;
  use_spf?: boolean;
  privileged?: boolean;
  allow_null_sender?: boolean;
  skip_antispam?: boolean;
  rate_limit_per_hour?: number | null;
  is_active?: boolean;
  expires_at?: string | null;
  note?: string;
}

/** The system-level gate, so the form can pre-validate and explain refusals. */
export interface RelayGrantPolicy {
  enabled: boolean;
  trusted_cidrs: string[];
  min_prefix_len_v4: number;
  min_prefix_len_v6: number;
  /** Only a system admin may create "any sender domain" / out-of-pool grants. */
  can_privilege: boolean;
}

export async function getRelayGrants(
  request: ApiRequestFn = apiRequest,
): Promise<RelayGrant[]> {
  const res = await request<{ items: RelayGrant[] }>("/relay-grants");
  return res.items ?? [];
}

export async function getRelayGrantPolicy(
  request: ApiRequestFn = apiRequest,
): Promise<RelayGrantPolicy> {
  return request<RelayGrantPolicy>("/relay-grants/_meta/policy");
}

/**
 * Flip the system-level relay master switch (GT-12140).
 *
 * Until this existed the switch could only be changed by hand-writing a
 * config_overrides row, so grants created through this UI were inert and every
 * unauthenticated relay attempt got 554. System-admin only, enforced server-side.
 */
export async function setRelayGrantPolicyEnabled(
  enabled: boolean,
  request: ApiRequestFn = apiRequest,
): Promise<RelayGrantPolicy> {
  return request<RelayGrantPolicy>("/relay-grants/_meta/policy", {
    method: "PUT",
    body: { enabled },
  });
}

export async function createRelayGrant(
  payload: RelayGrantPayload,
  request: ApiRequestFn = apiRequest,
): Promise<RelayGrant> {
  return request<RelayGrant>("/relay-grants", {
    method: "POST",
    body: payload,
  });
}

export async function updateRelayGrant(
  id: number,
  payload: RelayGrantPayload,
  request: ApiRequestFn = apiRequest,
): Promise<RelayGrant> {
  return request<RelayGrant>(`/relay-grants/${id}`, {
    method: "PUT",
    body: payload,
  });
}

export async function deleteRelayGrant(
  id: number,
  request: ApiRequestFn = apiRequest,
): Promise<void> {
  await request<void>(`/relay-grants/${id}`, { method: "DELETE" });
}
