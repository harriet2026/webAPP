import { apiRequest, type ApiRequestFn, type ConfigMutationResult } from './client';
import type { URLProtectionSettings } from '@/types/url-protection';

export async function getURLProtectionSettings(requestFn: ApiRequestFn = apiRequest): Promise<URLProtectionSettings> {
  return requestFn<URLProtectionSettings>('/url-protection/settings');
}

export async function putURLProtectionSettings(settings: Partial<URLProtectionSettings>, requestFn: ApiRequestFn = apiRequest): Promise<ConfigMutationResult<URLProtectionSettings>> {
  return requestFn<ConfigMutationResult<URLProtectionSettings>>('/url-protection/settings', { method: 'PUT', body: settings });
}
