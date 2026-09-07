import { apiRequest, type ApiRequestFn, type ConfigMutationResult } from './client';
import type { AuthSpoofingConfig, ObserveStatPoint, ProbeRequest, ProbeResponse } from '@/types/auth-spoofing';

export async function getAuthSpoofingConfig(requestFn: ApiRequestFn = apiRequest) {
  return requestFn<AuthSpoofingConfig>('/auth-spoofing/config');
}

export async function putAuthSpoofingConfig(data: AuthSpoofingConfig, requestFn: ApiRequestFn = apiRequest, signal?: AbortSignal) {
  return requestFn<ConfigMutationResult<{ ok: boolean; warnings?: string[] }>>('/auth-spoofing/config', { method: 'PUT', body: data, signal });
}

export async function deleteAuthSpoofingTenantConfig(requestFn: ApiRequestFn = apiRequest) {
  return requestFn<ConfigMutationResult<{ ok: boolean }>>('/auth-spoofing/config', { method: 'DELETE' });
}

export async function getObserveStats(days = 7, requestFn: ApiRequestFn = apiRequest) {
  return requestFn<{ days: number; points: ObserveStatPoint[] }>(`/auth-spoofing/observe-stats?days=${days}`);
}

export async function probeAuthSpoofing(data: ProbeRequest, requestFn: ApiRequestFn = apiRequest) {
  return requestFn<ProbeResponse>('/auth-spoofing/probe', { method: 'POST', body: data });
}
