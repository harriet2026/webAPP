import { apiRequest, type ApiRequestFn } from './client';

export interface DetectionProfile {
  id: number;
  config_type: 'rbl' | 'exec_impersonation' | 'domain_lookalike';
  name: string;
  value?: string;
  tenant_id?: number;
  tenant_name?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export async function getDetectionProfiles(
  configType: string,
  requestFn: ApiRequestFn = apiRequest,
): Promise<DetectionProfile[]> {
  const response = await requestFn<{ items?: DetectionProfile[]; profiles?: DetectionProfile[] }>(
    `/detection-profiles?config_type=${configType}`,
  );
  return response.items ?? response.profiles ?? [];
}

export async function createDetectionProfile(
  data: {
    config_type: string;
    name: string;
    value?: string;
    is_active?: boolean;
  },
  requestFn: ApiRequestFn = apiRequest,
): Promise<DetectionProfile> {
  return requestFn<DetectionProfile>('/detection-profiles', {
    method: 'POST',
    body: data,
  });
}

export async function updateDetectionProfile(
  id: number,
  data: { name?: string; value?: string; is_active?: boolean },
  requestFn: ApiRequestFn = apiRequest,
): Promise<DetectionProfile> {
  return requestFn<DetectionProfile>(`/detection-profiles/${id}`, {
    method: 'PUT',
    body: data,
  });
}

export async function deleteDetectionProfile(
  id: number,
  requestFn: ApiRequestFn = apiRequest,
): Promise<void> {
  return requestFn<void>(`/detection-profiles/${id}`, { method: 'DELETE' });
}

export async function testDetectionProfile(
  id: number,
  requestFn: ApiRequestFn = apiRequest,
): Promise<{ ok: boolean; response_ms: number; dns_result?: string; error?: string }> {
  return requestFn(`/detection-profiles/${id}/test`, { method: 'POST' });
}
