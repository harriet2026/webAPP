import { apiRequest, type ApiRequestFn } from './client';
import type { PaginatedResponse } from '@/types/api';

export interface AdminAuditLog {
  id: number;
  operation_id: string;
  admin_user_id: number;
  actor_user_id?: number;
  username: string;
  action: string;
  resource_type: string;
  resource_id?: number;
  tenant_id?: number;
  effective_tenant_id?: number;
  tenant_name?: string;
  operator_name?: string;
  operator_role?: 'platform' | 'tenant';
  layer?: 'platform' | 'tenant';
  details?: Record<string, unknown>;
  before_value?: Record<string, unknown>;
  after_value?: Record<string, unknown>;
  status: string;
  error_message?: string;
  client_ip?: string;
  ip_location?: string;
  user_agent?: string;
  session_id?: string;
  created_at: string;
  updated_at?: string;
}

export interface AdminAuditLogParams {
  page?: number;
  page_size?: number;
  username?: string;
  action?: string;
  resource_type?: string;
  keyword?: string;
  layer?: 'platform' | 'tenant';
  status?: 'success' | 'failed';
  tenant_id?: number;
  start_date?: string;
  end_date?: string;
  // Spec §2.3: legacy action='view' rows are excluded by default; opt in here.
  include_view?: boolean;
}

export interface AdminAuditStats {
  total: number;
  total_operations?: number;
  success: number;
  failed: number;
  by_action?: Record<string, number>;
  by_resource_type?: Record<string, number>;
  by_status?: Record<string, number>;
  top_admins?: Array<{ username: string; count: number }>;
}

export async function getAdminAuditLogs(
  params: AdminAuditLogParams,
  requestFn: ApiRequestFn = apiRequest,
): Promise<PaginatedResponse<AdminAuditLog>> {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value));
    }
  });
  const res = await requestFn<PaginatedResponse<AdminAuditLog>>(`/admin-audit?${query}`);
  return {
    items: res.items ?? [],
    total: res.total,
    page: res.page,
    page_size: res.page_size,
  };
}

export async function getAdminAuditLog(
  id: number,
  requestFn: ApiRequestFn = apiRequest,
): Promise<AdminAuditLog> {
  return requestFn<AdminAuditLog>(`/admin-audit/${id}`);
}

export async function getAdminAuditStats(
  params: Omit<AdminAuditLogParams, 'page' | 'page_size'> = {},
  requestFn: ApiRequestFn = apiRequest,
): Promise<AdminAuditStats> {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value));
    }
  });
  const qs = query.toString();
  return requestFn<AdminAuditStats>(`/admin-audit/stats${qs ? `?${qs}` : ''}`);
}
