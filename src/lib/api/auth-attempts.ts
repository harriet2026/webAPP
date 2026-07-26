import { apiRequest, type ApiRequestFn } from './client';
import type { PaginatedResponse } from '@/types/api';

// Language-neutral client-IP geo classification (backend never pre-formats a
// display string; the UI localizes `kind` and appends `region`). Null/absent
// when undeterminable.
export interface IPLocationInfo {
  kind: 'internal' | 'domestic' | 'overseas' | string;
  region?: string;
}

export interface AuthAttempt {
  id: number;
  tenant_id?: number;
  tenant_name?: string;
  username: string;
  client_ip: string;
  success: boolean;
  failure_reason?: string;
  auth_backend?: string;
  mechanism?: string;
  session_id?: string;
  duration?: number;
  attempted_at: string;
  auth_protocol?: string;
  scene?: string;
  domain?: string;
  server_host?: string;
  server_port?: number;
  ssl_enabled?: boolean;
  fail_reason_code?: string;
  matched_config_id?: number;
  tenant_code?: string;
  ip_location?: IPLocationInfo;
  log_id?: string;
}

export interface AuthAttemptParams {
  page?: number;
  page_size?: number;
  username?: string;
  client_ip?: string;
  // keyword 命中 username 或 client_ip 任一（不区分大小写包含匹配）
  keyword?: string;
  success?: boolean;
  start_date?: string;
  end_date?: string;
  auth_protocol?: string;
  scene?: string;
  domain?: string;
  fail_reason?: string;
  // GT-12367：平台管理员按租户范围筛选（页面内独立控件，非全局租户选择器）。
  tenant_id?: number;
}

interface BackendAuthAttemptResponse {
  items: BackendAuthAttempt[];
  total: number;
  page: number;
  page_size: number;
  limit?: number;
}

interface BackendAuthAttempt {
  id: number;
  tenant_id?: number;
  tenant_name?: string;
  username: string;
  client_ip: string;
  success: boolean;
  failure_reason?: string;
  auth_backend?: string;
  mechanism?: string;
  session_id?: string;
  duration?: number;
  attempted_at: string;
  auth_protocol?: string;
  scene?: string;
  domain?: string;
  server_host?: string;
  server_port?: number;
  ssl_enabled?: boolean;
  fail_reason_code?: string;
  matched_config_id?: number;
  tenant_code?: string;
  ip_location?: IPLocationInfo;
  log_id?: string;
}

export interface AuthAttemptStats {
  total: number;
  success: number;
  failed: number;
}

export async function getAuthAttempts(params: AuthAttemptParams, requestFn: ApiRequestFn = apiRequest): Promise<PaginatedResponse<AuthAttempt>> {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value));
    }
  });
  const res = await requestFn<BackendAuthAttemptResponse>(`/auth-attempts?${query}`);
  return {
    items: res.items,
    total: res.total,
    page: res.page,
    page_size: res.page_size ?? res.limit ?? 20,
  };
}

export async function getAuthAttemptStats(requestFn: ApiRequestFn = apiRequest): Promise<AuthAttemptStats> {
  return requestFn<AuthAttemptStats>(`/auth-attempts/stats`);
}
