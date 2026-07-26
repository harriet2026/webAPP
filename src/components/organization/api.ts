import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest, useApiRequest, type ApiRequestFn, API_BASE } from '@/lib/api/client';

import type {
  ContactSource,
  ContactSourcePayload,
  ContactSourceListParams,
  ContactSourceImpact,
  ContactTestResult,
  ContactCSVUploadResult,
  ContactCSVPreviewResult,
  ContactSyncStatus,
  ContactSyncTriggerResult,
  Contact,
  ContactListParams,
  BulkContactPayload,
  ContactSyncLog,
  ContactSyncLogListParams,
  ContactSyncLogDetail,
  PaginatedResponse,
} from './types';

function buildQS(params: Record<string, unknown>): string {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      qs.set(key, String(value));
    }
  });
  const s = qs.toString();
  return s ? `?${s}` : '';
}

// === Contact sources ===

export async function getContactSources(
  params: ContactSourceListParams,
  requestFn: ApiRequestFn = apiRequest,
): Promise<PaginatedResponse<ContactSource>> {
  return requestFn<PaginatedResponse<ContactSource>>(
    `/contact-sources${buildQS({
      page: params.page,
      page_size: params.page_size,
      search: params.search,
      source_type: params.source_type,
      sync_status: params.sync_status,
      auto_sync: params.auto_sync === undefined ? undefined : String(params.auto_sync),
    })}`,
  );
}

export async function getContactSource(id: number, requestFn: ApiRequestFn = apiRequest): Promise<ContactSource> {
  return requestFn<ContactSource>(`/contact-sources/${id}`);
}

export async function createContactSource(data: ContactSourcePayload, requestFn: ApiRequestFn = apiRequest): Promise<ContactSource> {
  return requestFn<ContactSource>('/contact-sources', { method: 'POST', body: data });
}

export async function updateContactSource(id: number, data: ContactSourcePayload, requestFn: ApiRequestFn = apiRequest): Promise<ContactSource> {
  return requestFn<ContactSource>(`/contact-sources/${id}`, { method: 'PUT', body: data });
}

// Partial update of auto_sync_enabled only. The full updateContactSource path
// cannot be reused for the inline list toggle: the list response redacts
// secrets inside config, so echoing it back would overwrite the stored
// credentials with the redaction placeholders (GT-12034).
export async function setContactSourceAutoSync(
  id: number,
  enabled: boolean,
  requestFn: ApiRequestFn = apiRequest,
  cronExpr?: string,
): Promise<ContactSource> {
  return requestFn<ContactSource>(`/contact-sources/${id}/auto-sync`, {
    method: 'PUT',
    body: cronExpr ? { enabled, cron_expr: cronExpr } : { enabled },
  });
}

export async function deleteContactSource(id: number, requestFn: ApiRequestFn = apiRequest): Promise<void> {
  return requestFn<void>(`/contact-sources/${id}`, { method: 'DELETE' });
}

export async function getContactSourceImpact(id: number, requestFn: ApiRequestFn = apiRequest): Promise<ContactSourceImpact> {
  return requestFn<ContactSourceImpact>(`/contact-sources/${id}/impact`);
}

export async function getContactSyncStatus(id: number, requestFn: ApiRequestFn = apiRequest): Promise<ContactSyncStatus | null> {
  return requestFn<ContactSyncStatus | null>(`/contact-sources/${id}/sync-status`);
}

// === Connection test ===

export async function testContactSourceNew(
  data: { source_type: string; config: Record<string, unknown> },
  requestFn: ApiRequestFn = apiRequest,
): Promise<ContactTestResult> {
  return requestFn<ContactTestResult>('/contact-sources/_test', { method: 'POST', body: data });
}

export async function testContactSource(id: number, requestFn: ApiRequestFn = apiRequest): Promise<ContactTestResult> {
  return requestFn<ContactTestResult>(`/contact-sources/${id}/test`, { method: 'POST' });
}

// === CSV upload / preview ===
//
// Upload is the only multipart endpoint; the shared JSON client stringifies the
// body, so it cannot carry FormData. We do a direct fetch with credentials and
// forward the tenant header when provided (Task 3 wires it from useAuth()).
//
// The backend handler (UploadContactCSV) accepts the user file (multipart field
// "user_file", required) and the optional department file ("dept_file") in a
// SINGLE request and returns both refs + the upload_token together — so we send
// both files in one call rather than two separate uploads.

export async function uploadContactCSV(
  userFile: File,
  opts: { deptFile?: File; tenantId?: number | null } = {},
): Promise<ContactCSVUploadResult> {
  const fd = new FormData();
  fd.append('user_file', userFile);
  if (opts.deptFile) {
    fd.append('dept_file', opts.deptFile);
  }
  const headers: Record<string, string> = {};
  if (opts.tenantId !== undefined && opts.tenantId !== null) {
    headers['X-Tenant-ID'] = String(opts.tenantId);
  }
  const res = await fetch(`${API_BASE}/contact-sources/_csv/upload`, {
    method: 'POST',
    credentials: 'include',
    headers,
    body: fd,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    const message = typeof err.error === 'string' ? err.error : err.error?.message || 'Request failed';
    throw new Error(message);
  }
  return res.json();
}

export async function previewContactCSV(
  data: {
    user_file_ref: string;
    dept_file_ref?: string;
    uid_column?: string;
    user_column_map: Record<string, string>;
    dept_column_map?: Record<string, string>;
    upload_token: string;
  },
  requestFn: ApiRequestFn = apiRequest,
): Promise<ContactCSVPreviewResult> {
  return requestFn<ContactCSVPreviewResult>('/contact-sources/_csv/preview', { method: 'POST', body: data });
}

// === Sync trigger / cancel ===

export async function triggerContactSync(
  id: number,
  mode?: 'full' | 'incremental',
  requestFn: ApiRequestFn = apiRequest,
): Promise<ContactSyncTriggerResult> {
  const qs = mode ? buildQS({ mode }) : '';
  return requestFn<ContactSyncTriggerResult>(`/contact-sources/${id}/sync${qs}`, { method: 'POST' });
}

export async function cancelContactSync(id: number, requestFn: ApiRequestFn = apiRequest): Promise<void> {
  return requestFn<void>(`/contact-sources/${id}/sync/cancel`, { method: 'POST' });
}

// === Contacts ===

export async function getContacts(
  params: ContactListParams,
  requestFn: ApiRequestFn = apiRequest,
): Promise<PaginatedResponse<Contact>> {
  return requestFn<PaginatedResponse<Contact>>(
    `/contacts${buildQS({
      source_id: params.source_id,
      dept: params.dept,
      keyword: params.keyword,
      job_title: params.job_title,
      tag: params.tag,
      page: params.page,
      page_size: params.page_size,
    })}`,
  );
}

export async function getContact(id: number, requestFn: ApiRequestFn = apiRequest): Promise<Contact> {
  return requestFn<Contact>(`/contacts/${id}`);
}

export async function bulkUpdateContacts(data: BulkContactPayload, requestFn: ApiRequestFn = apiRequest): Promise<{ updated: number }> {
  return requestFn<{ updated: number }>('/contacts/bulk', { method: 'POST', body: data });
}

export async function exportContactsUrl(params: ContactListParams): Promise<string> {
  const qs = buildQS({
    source_id: params.source_id,
    dept: params.dept,
    keyword: params.keyword,
    job_title: params.job_title,
    tag: params.tag,
  });
  return `${API_BASE}/contacts/_export${qs}`;
}

export async function getInternalEmails(requestFn: ApiRequestFn = apiRequest): Promise<{ items: string[] }> {
  return requestFn<{ items: string[] }>(`/contacts/_internal-emails`);
}

// === Sync logs ===

export async function getContactSyncLogs(
  params: ContactSyncLogListParams,
  requestFn: ApiRequestFn = apiRequest,
): Promise<PaginatedResponse<ContactSyncLog>> {
  return requestFn<PaginatedResponse<ContactSyncLog>>(
    `/contact-sync-logs${buildQS({
      source_id: params.source_id,
      status: params.status,
      sync_type: params.sync_type,
      start_time: params.start_time,
      end_time: params.end_time,
      page: params.page,
      page_size: params.page_size,
    })}`,
  );
}

export async function getContactSyncLog(
  id: number,
  params: { page?: number; page_size?: number } = {},
  requestFn: ApiRequestFn = apiRequest,
): Promise<ContactSyncLogDetail> {
  return requestFn<ContactSyncLogDetail>(`/contact-sync-logs/${id}${buildQS({ page: params.page, page_size: params.page_size })}`);
}

export function exportContactSyncFailuresUrl(id: number): string {
  return `${API_BASE}/contact-sync-logs/${id}/failures/_export`;
}

// Fetch an export URL with the same credentials + tenant header the JSON client
// uses, then trigger a browser download of the resulting blob. Used for the
// contacts export and the sync-failure export (both return file streams).
export async function downloadExportUrl(
  url: string,
  tenantId: number | null | undefined,
  filename: string,
): Promise<void> {
  const headers: Record<string, string> = {};
  if (tenantId !== undefined && tenantId !== null) {
    headers['X-Tenant-ID'] = String(tenantId);
  }
  const res = await fetch(url, { method: 'GET', credentials: 'include', headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    const message = typeof err.error === 'string' ? err.error : err.error?.message || 'Request failed';
    throw new Error(message);
  }
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(objectUrl);
}

// === react-query hooks (named per plan) ===

export const contactSourcesQueryKey = (params: ContactSourceListParams) => ['contact-sources', params] as const;
export const contactsQueryKey = (params: ContactListParams) => ['contacts', params] as const;
export const syncLogsQueryKey = (params: ContactSyncLogListParams) => ['contact-sync-logs', params] as const;

export function useContactSources(params: ContactSourceListParams = {}, enabled = true) {
  const { apiRequest } = useApiRequest();
  return useQuery({
    queryKey: contactSourcesQueryKey(params),
    queryFn: () => getContactSources(params, apiRequest),
    enabled,
  });
}

export function useContacts(params: ContactListParams = {}, enabled = true) {
  const { apiRequest } = useApiRequest();
  return useQuery({
    queryKey: contactsQueryKey(params),
    queryFn: () => getContacts(params, apiRequest),
    enabled,
  });
}

export function useContactSyncLogs(params: ContactSyncLogListParams = {}, enabled = true) {
  const { apiRequest } = useApiRequest();
  return useQuery({
    queryKey: syncLogsQueryKey(params),
    queryFn: () => getContactSyncLogs(params, apiRequest),
    enabled,
  });
}

export function useContactSourceMutations() {
  const queryClient = useQueryClient();
  const { apiRequest } = useApiRequest();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['contact-sources'] });
    queryClient.invalidateQueries({ queryKey: ['contacts'] });
  };

  const create = useMutation({
    mutationFn: (data: ContactSourcePayload) => createContactSource(data, apiRequest),
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: ({ id, data }: { id: number; data: ContactSourcePayload }) => updateContactSource(id, data, apiRequest),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: number) => deleteContactSource(id, apiRequest),
    onSuccess: invalidate,
  });

  const sync = useMutation({
    mutationFn: ({ id, mode }: { id: number; mode?: 'full' | 'incremental' }) => triggerContactSync(id, mode, apiRequest),
    onSuccess: invalidate,
  });

  const cancelSync = useMutation({
    mutationFn: (id: number) => cancelContactSync(id, apiRequest),
    onSuccess: invalidate,
  });

  const setAutoSync = useMutation({
    mutationFn: ({ id, enabled, cronExpr }: { id: number; enabled: boolean; cronExpr?: string }) =>
      setContactSourceAutoSync(id, enabled, apiRequest, cronExpr),
    onSuccess: invalidate,
  });

  return { create, update, remove, sync, cancelSync, setAutoSync };
}

export function useContactMutations() {
  const queryClient = useQueryClient();
  const { apiRequest } = useApiRequest();

  const bulk = useMutation({
    mutationFn: (data: BulkContactPayload) => bulkUpdateContacts(data, apiRequest),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contacts'] }),
  });

  return { bulk };
}
