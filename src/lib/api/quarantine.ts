import { apiRequest, type ApiRequestFn } from './client';
import type { EmailPreviewResponse } from '@/types/email-preview';

export interface QuarantineItem {
  id: number;
  quarantine_id: string;
  message_id: string;
  client_ip: string;
  sender: string;
  recipients: string[];
  subject: string;
  reason: string;
  storage_path: string;
  storage_size: number;
  quarantined_at: string;
  expires_at: string;
  released_at: string | null;
  released_by: string | null;
  deleted_at: string | null;
  spf_valid: string;
  dkim_valid: string;
  tenant_id: number | null;
  tenant_name?: string;
  created_at: string;
  updated_at: string;
}

export interface QuarantineListParams {
  page?: number;
  limit?: number;
  sender?: string;
  subject?: string;
  released?: boolean;
}

export interface QuarantineListResponse {
  total: number;
  page: number;
  limit: number;
  items: QuarantineItem[];
}

export interface BatchReleaseRequest {
  // target_email is an optional override that redirects the mail to a single
  // mailbox. Omit it to deliver to the mail's original recipients.
  items: { quarantine_id: string; target_email?: string }[];
  notes?: string;
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

export async function getQuarantineList(params: QuarantineListParams, requestFn: ApiRequestFn = apiRequest): Promise<QuarantineListResponse> {
  const query = buildQuery(params as Record<string, unknown>);
  return requestFn<QuarantineListResponse>(`/quarantine?${query}`);
}

export async function getQuarantineItem(id: number, requestFn: ApiRequestFn = apiRequest): Promise<QuarantineItem> {
  return requestFn<QuarantineItem>(`/quarantine/${id}`);
}

export async function getQuarantinePreview(id: string | number, requestFn: ApiRequestFn = apiRequest): Promise<EmailPreviewResponse> {
  return requestFn<EmailPreviewResponse>(`/quarantine/${id}/preview`);
}

export async function batchReleaseQuarantine(body: BatchReleaseRequest, requestFn: ApiRequestFn = apiRequest): Promise<unknown> {
  return requestFn<unknown>('/quarantine/bulk', {
    method: 'POST',
    body,
  });
}

export async function downloadQuarantineEmail(id: number): Promise<Blob> {
  const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api/v1';
  const response = await fetch(`${API_BASE}/quarantine/${id}/download`, {
    credentials: 'include',
  });
  if (!response.ok) throw new Error('Download failed');
  return response.blob();
}
