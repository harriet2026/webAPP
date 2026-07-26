import { apiRequest, type ApiRequestFn } from './client';
import type { EmailPreviewResponse } from '@/types/email-preview';

export interface OutboundAuditItem {
  id: number;
  audit_id: string;
  message_id: string;
  smtp_user: string;
  tenant_id: number;
  tenant_name?: string;
  sender: string;
  recipients: string[];
  subject: string;
  reason: string;
  storage_path: string;
  storage_size: number;
  status: 'pending' | 'approved' | 'rejected';
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  created_at: string;
  updated_at: string;
  expires_at: string;
  timeout_minutes: number;
}

export interface OutboundAuditListParams {
  page?: number;
  limit?: number;
  status?: 'pending' | 'approved' | 'rejected';
  sender?: string;
  smtp_user?: string;
  subject?: string;
  start?: string;
  end?: string;
}

export interface OutboundAuditListResponse {
  items: OutboundAuditItem[];
  total: number;
  page: number;
  limit: number;
}

function buildQuery(params: OutboundAuditListParams): string {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value));
    }
  });
  return query.toString();
}

export async function getOutboundAuditItems(params: OutboundAuditListParams, requestFn: ApiRequestFn = apiRequest): Promise<OutboundAuditListResponse> {
  const query = buildQuery(params);
  return requestFn<OutboundAuditListResponse>(`/outbound-audit?${query}`);
}

export async function getOutboundAuditItem(id: number, requestFn: ApiRequestFn = apiRequest): Promise<OutboundAuditItem> {
  return requestFn<OutboundAuditItem>(`/outbound-audit/${id}`);
}

export async function approveOutboundAuditItem(id: number, notes?: string, requestFn: ApiRequestFn = apiRequest): Promise<OutboundAuditItem> {
  return requestFn<OutboundAuditItem>(`/outbound-audit/${id}/approve`, {
    method: 'POST',
    body: { notes },
  });
}

export async function rejectOutboundAuditItem(id: number, notes?: string, requestFn: ApiRequestFn = apiRequest): Promise<OutboundAuditItem> {
  return requestFn<OutboundAuditItem>(`/outbound-audit/${id}/reject`, {
    method: 'POST',
    body: { notes },
  });
}

export async function batchApproveOutboundAuditItems(ids: number[], notes?: string, requestFn: ApiRequestFn = apiRequest): Promise<{ approved: number }> {
  return requestFn<{ approved: number }>('/outbound-audit/bulk', {
    method: 'POST',
    body: { action: 'approve', ids, notes },
  });
}

export async function batchRejectOutboundAuditItems(ids: number[], notes?: string, requestFn: ApiRequestFn = apiRequest): Promise<{ rejected: number }> {
  return requestFn<{ rejected: number }>('/outbound-audit/bulk', {
    method: 'POST',
    body: { action: 'reject', ids, notes },
  });
}

export async function getOutboundAuditPreview(id: number, requestFn: ApiRequestFn = apiRequest): Promise<EmailPreviewResponse> {
  return requestFn<EmailPreviewResponse>(`/outbound-audit/${id}/preview`);
}

export async function downloadOutboundAuditEmail(id: number): Promise<Blob> {
  const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api/v1';
  const response = await fetch(`${API_BASE}/outbound-audit/${id}/download`, {
    credentials: 'include',
  });
  if (!response.ok) throw new Error('Download failed');
  return response.blob();
}
