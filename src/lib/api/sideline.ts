import { apiRequest, type ApiRequestFn } from './client';
import type { EmailPreviewResponse } from '@/types/email-preview';

export interface SidelineItem {
  id: string;
  message_id: string;
  client_ip: string;
  sender: string;
  recipients: string[];
  subject: string;
  reason: string;
  storage_path: string;
  storage_size: number;
  sidelined_at: string;
  processed_at: string | null;
  reinjected_at: string | null;
  spf_valid: string;
  dkim_valid: string;
  tenant_id: number | null;
  tenant_name?: string;
  status: 'pending' | 'processing' | 'quarantined' | 'failed' | 'reinjected' | 'released_pending' | 'manual_hold';
  retry_count: number;
  timeout_minutes: number;
  state: string;
  priority: number;
  created_at: string;
  updated_at: string;
}

export interface SidelineListParams {
  page?: number;
  limit?: number;
  sender?: string;
  subject?: string;
  status?: SidelineItem['status'];
}

export interface SidelineListResponse {
  total: number;
  page: number;
  limit: number;
  items: SidelineItem[];
}

function buildQuery(params: Record<string, unknown>): string {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value));
    }
  });
  return query.toString();
}

export async function getSidelineList(params: SidelineListParams, requestFn: ApiRequestFn = apiRequest): Promise<SidelineListResponse> {
  const query = buildQuery(params as Record<string, unknown>);
  return requestFn<SidelineListResponse>(`/sideline?${query}`);
}

export async function getSidelineItem(id: string, requestFn: ApiRequestFn = apiRequest): Promise<SidelineItem> {
  return requestFn<SidelineItem>(`/sideline/${id}`);
}

export async function updateSidelineStatus(id: string, status: SidelineItem['status'], requestFn: ApiRequestFn = apiRequest): Promise<SidelineItem> {
  return requestFn<SidelineItem>(`/sideline/${id}/status`, {
    method: 'PUT',
    body: { status },
  });
}

export async function reinjectSideline(id: string, requestFn: ApiRequestFn = apiRequest): Promise<SidelineItem> {
  return requestFn<SidelineItem>(`/sideline/${id}/reinject`, {
    method: 'POST',
  });
}

export async function deleteSideline(id: string, requestFn: ApiRequestFn = apiRequest): Promise<void> {
  return requestFn<void>(`/sideline/${id}`, {
    method: 'DELETE',
  });
}

export async function getSidelinePreview(id: string, requestFn: ApiRequestFn = apiRequest): Promise<EmailPreviewResponse> {
  return requestFn<EmailPreviewResponse>(`/sideline/${id}/preview`);
}

export async function downloadSidelineEmail(id: string): Promise<Blob> {
  const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api/v1';
  const response = await fetch(`${API_BASE}/sideline/${id}/download`, {
    credentials: 'include',
  });
  if (!response.ok) throw new Error('Download failed');
  return response.blob();
}
