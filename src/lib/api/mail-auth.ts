import { apiRequest, type ApiRequestFn } from './client';

export const API_BASE = '';

/** domain_scope JSON shape: either `{all: true}` or `{domains: [...]}`. */
export type MailAuthDomainScope = { all: true } | { domains: string[] };

/** protocol_config is loosely-typed per protocol. */
export type MailAuthProtocolConfig = Record<string, unknown>;

export interface MailAuthConfig {
  id: number;
  tenant_id: number;
  priority: number;
  domain_scope: MailAuthDomainScope;
  protocol: string;
  server_host: string;
  server_port: number;
  ssl_enabled: boolean;
  auth_timeout: number;
  protocol_config: MailAuthProtocolConfig;
  scenes: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface MailAuthConfigPayload {
  priority: number;
  domain_scope: MailAuthDomainScope;
  protocol: string;
  server_host: string;
  server_port: number;
  ssl_enabled: boolean;
  auth_timeout: number;
  protocol_config: MailAuthProtocolConfig;
  scenes: string[];
  is_active: boolean;
}

export interface MailAuthListResponse {
  items: MailAuthConfig[];
  total: number;
  page: number;
  page_size: number;
}

export interface MailAuthTestPayload {
  protocol: string;
  server_host: string;
  server_port: number;
  ssl_enabled: boolean;
  auth_timeout: number;
  protocol_config: MailAuthProtocolConfig;
  username?: string;
  password?: string;
}

export interface MailAuthTestResult {
  success: boolean;
  message: string;
  latency_ms: number;
}

export async function listMailAuthConfigs(
  requestFn: ApiRequestFn = apiRequest,
): Promise<MailAuthConfig[]> {
  const resp = await requestFn<MailAuthListResponse>(
    `${API_BASE}/mail-auth-configs?page=1&page_size=100`,
  );
  return resp.items ?? [];
}

export async function createMailAuthConfig(
  data: MailAuthConfigPayload,
  requestFn: ApiRequestFn = apiRequest,
): Promise<MailAuthConfig> {
  return requestFn<MailAuthConfig>(`${API_BASE}/mail-auth-configs`, {
    method: 'POST',
    body: data,
  });
}

export async function updateMailAuthConfig(
  id: number,
  data: MailAuthConfigPayload,
  requestFn: ApiRequestFn = apiRequest,
): Promise<MailAuthConfig> {
  return requestFn<MailAuthConfig>(`${API_BASE}/mail-auth-configs/${id}`, {
    method: 'PUT',
    body: data,
  });
}

export async function deleteMailAuthConfig(
  id: number,
  requestFn: ApiRequestFn = apiRequest,
): Promise<void> {
  return requestFn<void>(`${API_BASE}/mail-auth-configs/${id}`, {
    method: 'DELETE',
  });
}

export async function testMailAuthConnection(
  data: MailAuthTestPayload,
  requestFn: ApiRequestFn = apiRequest,
): Promise<MailAuthTestResult> {
  return requestFn<MailAuthTestResult>(`${API_BASE}/mail-auth-configs/test`, {
    method: 'POST',
    body: data,
  });
}
