import { apiRequest, type ApiRequestFn } from './client';

export interface ARCSettings {
  tenant_id: number;
  enabled: boolean;
  signing_domain: string;
  created_at?: string;
  updated_at?: string;
}

export async function getARCSettings(
  requestFn: ApiRequestFn = apiRequest,
): Promise<ARCSettings> {
  return requestFn<ARCSettings>('/arc/settings');
}

export async function putARCSettings(
  patch: Partial<Pick<ARCSettings, 'enabled' | 'signing_domain'>>,
  requestFn: ApiRequestFn = apiRequest,
): Promise<ARCSettings> {
  return requestFn<ARCSettings>('/arc/settings', { method: 'PUT', body: patch });
}
