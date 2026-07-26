import { API_BASE, apiRequest, type ApiRequestFn } from './client';

export interface InboundAuditItem {
  id: number;
  sender: string;
  recipients: string;
  subject: string;
  client_ip: string;
  rule_name: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  reviewer: string | null;
  reviewed_at: string | null;
  review_comment: string | null;
  triggered_at: string;
  created_at: string;
  updated_at: string;
}

export interface InboundAuditListResponse {
  items: InboundAuditItem[];
  total: number;
  page: number;
  page_size: number;
}

export async function getInboundAuditItems(
  params: { page?: number; page_size?: number; status?: string; q?: string },
  requestFn: ApiRequestFn = apiRequest,
) {
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.page_size) qs.set('page_size', String(params.page_size));
  if (params.status && params.status !== 'all') qs.set('status', params.status);
  if (params.q) qs.set('q', params.q);
  return requestFn<InboundAuditListResponse>(`/inbound-audit?${qs}`);
}

export async function getInboundAuditItem(id: number, requestFn: ApiRequestFn = apiRequest) {
  return requestFn<InboundAuditItem>(`/inbound-audit/${id}`);
}

export async function approveInboundAuditItem(id: number, comment?: string, requestFn: ApiRequestFn = apiRequest) {
  return requestFn<InboundAuditItem>(`/inbound-audit/${id}/approve`, { method: 'POST', body: { comment } });
}

export async function rejectInboundAuditItem(id: number, comment: string, requestFn: ApiRequestFn = apiRequest) {
  return requestFn<InboundAuditItem>(`/inbound-audit/${id}/reject`, { method: 'POST', body: { comment } });
}

export async function bulkInboundAuditAction(
  action: 'approve' | 'reject',
  ids: number[],
  comment?: string,
  requestFn: ApiRequestFn = apiRequest,
) {
  return requestFn<{ affected: number }>(`/inbound-audit/bulk`, {
    method: 'POST',
    body: { action, ids, comment },
  });
}

export async function getInboundAuditItemEML(id: number, requestFn: ApiRequestFn = apiRequest): Promise<Blob> {
  void requestFn;
  const resp = await fetch(`${API_BASE}/inbound-audit/${id}/eml`, {
    credentials: 'include',
  });
  if (!resp.ok) throw new Error('Failed to fetch EML');
  return resp.blob();
}
