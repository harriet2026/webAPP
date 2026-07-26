import type { ApiRequestFn } from './client';
import { apiRequest } from './client';
import type { DisposalSettings } from '@/types/disposal-settings';

export async function getDisposalSettings(
  requestFn: ApiRequestFn = apiRequest,
): Promise<DisposalSettings> {
  return requestFn<DisposalSettings>('/disposal-settings');
}

export async function putDisposalSettings(
  settings: DisposalSettings,
  requestFn: ApiRequestFn = apiRequest,
): Promise<DisposalSettings> {
  return requestFn<DisposalSettings>('/disposal-settings', { method: 'PUT', body: settings });
}
