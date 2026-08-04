import { apiRequest, type ApiRequestFn } from './client';
import type {
  SpoofingStats,
  SpoofingLogFilters,
  SpoofingLogListResponse,
  SpoofingLogDetail,
  SpoofPersonDTO,
  SpoofBrandDTO,
  SpoofWhitelistDTO,
  SpoofPersonConfig,
  SpoofBrandConfig,
  SpoofEngineParams,
  SpoofNotificationPreviewSample,
  SpoofNotificationPreviewResponse,
} from '@/types/spoofing-detection';

const BASE = '/spoofing-agent';

function appendMulti(q: URLSearchParams, key: string, values?: unknown[]) {
  if (Array.isArray(values)) {
    values.forEach((v) => {
      if (v !== undefined && v !== null && v !== '') q.append(key, String(v));
    });
  }
}
function setScalar(q: URLSearchParams, key: string, value: unknown) {
  if (value !== undefined && value !== null && value !== '') q.set(key, String(value));
}

// ---- overview ----
export async function getSpoofingStats(
  params: { start?: string; end?: string } = {},
  fn: ApiRequestFn = apiRequest,
): Promise<SpoofingStats> {
  const q = new URLSearchParams();
  setScalar(q, 'start', params.start);
  setScalar(q, 'end', params.end);
  const query = q.toString();
  return fn<SpoofingStats>(`${BASE}/stats${query ? `?${query}` : ''}`);
}

export async function getSpoofingLogs(
  filters: SpoofingLogFilters,
  fn: ApiRequestFn = apiRequest,
): Promise<SpoofingLogListResponse> {
  const q = new URLSearchParams();
  setScalar(q, 'page', filters.page);
  setScalar(q, 'page_size', filters.page_size);
  setScalar(q, 'keyword', filters.keyword);
  setScalar(q, 'start', filters.start);
  setScalar(q, 'end', filters.end);
  appendMulti(q, 'disposition', filters.disposition);
  appendMulti(q, 'spoof_method', filters.spoof_method);
  appendMulti(q, 'category', filters.category);
  return fn<SpoofingLogListResponse>(`${BASE}/detection-logs?${q.toString()}`);
}

export async function getSpoofingLogDetail(
  id: string,
  fn: ApiRequestFn = apiRequest,
): Promise<SpoofingLogDetail> {
  return fn<SpoofingLogDetail>(`${BASE}/detection-logs/${encodeURIComponent(id)}`);
}

export async function blockSpoofingDetection(
  id: string,
  fn: ApiRequestFn = apiRequest,
): Promise<{ status: 'blocked' | 'already_blocked' }> {
  return fn(`${BASE}/detection-logs/${encodeURIComponent(id)}/block`, { method: 'POST' });
}

export async function exemptSpoofingDetection(
  id: string,
  reason: string,
  fn: ApiRequestFn = apiRequest,
): Promise<{ status: 'exempted' }> {
  return fn(`${BASE}/detection-logs/${encodeURIComponent(id)}/exempt`, {
    method: 'POST',
    body: { reason },
  });
}

// ---- persons ----
export async function listSpoofPersons(
  params: { page?: number; page_size?: number; keyword?: string; protection_level?: string; observe_mode?: boolean } = {},
  fn: ApiRequestFn = apiRequest,
): Promise<{ items: SpoofPersonDTO[]; total: number; page: number; page_size: number }> {
  const q = new URLSearchParams();
  setScalar(q, 'page', params.page);
  setScalar(q, 'page_size', params.page_size);
  setScalar(q, 'keyword', params.keyword);
  setScalar(q, 'protection_level', params.protection_level);
  setScalar(q, 'observe_mode', params.observe_mode);
  return fn(`${BASE}/persons?${q.toString()}`);
}
export async function createSpoofPerson(
  body: SpoofPersonConfig,
  fn: ApiRequestFn = apiRequest,
): Promise<{ item: SpoofPersonDTO; warnings: string[] }> {
  return fn(`${BASE}/persons`, { method: 'POST', body });
}
export async function updateSpoofPerson(
  id: number,
  body: SpoofPersonConfig,
  fn: ApiRequestFn = apiRequest,
): Promise<{ item: SpoofPersonDTO; warnings: string[] }> {
  return fn(`${BASE}/persons/${id}`, { method: 'PUT', body });
}
export async function deleteSpoofPerson(id: number, fn: ApiRequestFn = apiRequest): Promise<void> {
  await fn(`${BASE}/persons/${id}`, { method: 'DELETE' });
}
export async function setSpoofPersonObserve(
  id: number,
  observe: boolean,
  fn: ApiRequestFn = apiRequest,
): Promise<void> {
  await fn(`${BASE}/persons/${id}/status`, { method: 'PUT', body: { observe_mode: observe } });
}
export async function bulkSpoofPersons(
  body:
    | { action: 'create'; items: SpoofPersonConfig[] }
    | { action: 'set_observe'; ids: number[]; observe_mode: boolean }
    | { action: 'set_threshold'; ids: number[]; confidence_threshold: number },
  fn: ApiRequestFn = apiRequest,
): Promise<unknown> {
  return fn(`${BASE}/persons/bulk`, { method: 'POST', body });
}

export async function previewSpoofPersonNotification(
  body: { person: SpoofPersonConfig } & SpoofNotificationPreviewSample,
  fn: ApiRequestFn = apiRequest,
): Promise<SpoofNotificationPreviewResponse> {
  return fn(`${BASE}/persons/notification-preview`, { method: 'POST', body });
}

// ---- brands ----
export async function listSpoofBrands(
  params: { page?: number; page_size?: number; keyword?: string; disposition_mode?: string } = {},
  fn: ApiRequestFn = apiRequest,
): Promise<{ items: SpoofBrandDTO[]; total: number; page: number; page_size: number }> {
  const q = new URLSearchParams();
  setScalar(q, 'page', params.page);
  setScalar(q, 'page_size', params.page_size);
  setScalar(q, 'keyword', params.keyword);
  setScalar(q, 'disposition_mode', params.disposition_mode);
  return fn(`${BASE}/brands?${q.toString()}`);
}
export async function createSpoofBrand(
  body: SpoofBrandConfig,
  fn: ApiRequestFn = apiRequest,
): Promise<{ item: SpoofBrandDTO }> {
  return fn(`${BASE}/brands`, { method: 'POST', body });
}
export async function updateSpoofBrand(
  id: number,
  body: SpoofBrandConfig,
  fn: ApiRequestFn = apiRequest,
): Promise<{ item: SpoofBrandDTO }> {
  return fn(`${BASE}/brands/${id}`, { method: 'PUT', body });
}
export async function deleteSpoofBrand(id: number, fn: ApiRequestFn = apiRequest): Promise<void> {
  await fn(`${BASE}/brands/${id}`, { method: 'DELETE' });
}
export async function setSpoofBrandObserve(
  id: number,
  observe: boolean,
  fn: ApiRequestFn = apiRequest,
): Promise<void> {
  await fn(`${BASE}/brands/${id}/status`, { method: 'PUT', body: { observe_mode: observe } });
}

export async function previewSpoofBrandNotification(
  body: { brand: SpoofBrandConfig } & SpoofNotificationPreviewSample,
  fn: ApiRequestFn = apiRequest,
): Promise<SpoofNotificationPreviewResponse> {
  return fn(`${BASE}/brands/notification-preview`, { method: 'POST', body });
}

// ---- whitelist ----
export async function listSpoofWhitelist(
  fn: ApiRequestFn = apiRequest,
): Promise<{ items: SpoofWhitelistDTO[]; total: number }> {
  return fn(`${BASE}/whitelist`);
}
export async function createSpoofWhitelist(
  body: { value: string; match_type: 'email' | 'domain' },
  fn: ApiRequestFn = apiRequest,
): Promise<SpoofWhitelistDTO> {
  return fn(`${BASE}/whitelist`, { method: 'POST', body });
}
export async function deleteSpoofWhitelist(id: number, fn: ApiRequestFn = apiRequest): Promise<void> {
  await fn(`${BASE}/whitelist/${id}`, { method: 'DELETE' });
}

// ---- engine-config ----
export async function getSpoofEngineConfig(
  fn: ApiRequestFn = apiRequest,
): Promise<SpoofEngineParams> {
  return fn<SpoofEngineParams>(`${BASE}/engine-config`);
}
export async function putSpoofEngineConfig(
  params: SpoofEngineParams,
  fn: ApiRequestFn = apiRequest,
): Promise<SpoofEngineParams> {
  return fn<SpoofEngineParams>(`${BASE}/engine-config`, { method: 'PUT', body: params });
}
