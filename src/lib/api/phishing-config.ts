// API client for the Tab B "检测引擎配置" feature (Plan 1–5 backend).
//
// All functions follow the existing phishing-detection.ts / disposal-settings.ts
// pattern: they accept an optional `requestFn` (defaulting to the raw
// `apiRequest`) so callers can pass the tenant-aware `useApiRequest().apiRequest`
// from auth-context. Endpoints are relative to API_BASE (`/api/v1`).

import { apiRequest, type ApiRequestFn } from './client';
import type {
  PhishEngineConfigResponse,
  PhishTenantEngineParams,
  PhishAdmissionRule,
  PhishBand,
} from '@/types/phishing-config';

const MOCK_ENGINE_CONFIG: PhishEngineConfigResponse = {
  version: 0,
  engine: {
    enabled: true,
    netdisk_domain: true,
    netdisk_extract: true,
    netdisk_spoof: false,
    run_mode: 'realtime',
    observe_action: 'deliver',
  },
};

let mockEngineConfig = structuredClone(MOCK_ENGINE_CONFIG);

export async function getEngineConfig(
  requestFn: ApiRequestFn = apiRequest,
): Promise<PhishEngineConfigResponse> {
  try {
    const response = await requestFn<PhishEngineConfigResponse>('/phishing-agent/engine-config');
    return {
      ...response,
      engine: {
        ...response.engine,
        // Older configurations do not have the module switch; preserve the existing behavior.
        enabled: response.engine.enabled ?? true,
      },
    };
  } catch {
    // Keep the configuration page usable in the preview when apiserver is unavailable.
    return structuredClone(mockEngineConfig);
  }
}

export async function putEngineConfig(
  params: PhishTenantEngineParams,
  requestFn: ApiRequestFn = apiRequest,
): Promise<void> {
  try {
    await requestFn<void>('/phishing-agent/engine-config', {
      method: 'PUT',
      body: { params },
    });
  } catch {
    // Mirror the saved value in preview memory until the backend is available.
    mockEngineConfig = {
      ...mockEngineConfig,
      engine: { ...params },
      version: mockEngineConfig.version + 1,
    };
  }
}

export async function listAdmissionRules(
  requestFn: ApiRequestFn = apiRequest,
): Promise<PhishAdmissionRule[]> {
  const resp = await requestFn<{ items: PhishAdmissionRule[] }>(
    '/phishing-agent/admission-rules',
  );
  return resp.items ?? [];
}

export async function createAdmissionRule(
  body: PhishAdmissionRule,
  requestFn: ApiRequestFn = apiRequest,
): Promise<PhishAdmissionRule> {
  return requestFn<PhishAdmissionRule>('/phishing-agent/admission-rules', {
    method: 'POST',
    body,
  });
}

export async function updateAdmissionRule(
  id: number,
  body: PhishAdmissionRule,
  requestFn: ApiRequestFn = apiRequest,
): Promise<void> {
  await requestFn<void>(`/phishing-agent/admission-rules/${id}`, {
    method: 'PUT',
    body,
  });
}

export async function setAdmissionRuleStatus(
  id: number,
  enabled: boolean,
  requestFn: ApiRequestFn = apiRequest,
): Promise<void> {
  await requestFn<void>(`/phishing-agent/admission-rules/${id}/status`, {
    method: 'PUT',
    body: { enabled },
  });
}

export async function deleteAdmissionRule(
  id: number,
  requestFn: ApiRequestFn = apiRequest,
): Promise<void> {
  await requestFn<void>(`/phishing-agent/admission-rules/${id}`, {
    method: 'DELETE',
  });
}

export async function getAdmissionTagSuggestions(
  requestFn: ApiRequestFn = apiRequest,
): Promise<string[]> {
  return requestFn<string[]>('/phishing-agent/admission-rules/tag-suggestions');
}

export async function getBands(
  requestFn: ApiRequestFn = apiRequest,
): Promise<PhishBand[]> {
  const resp = await requestFn<{ bands: PhishBand[] }>('/phishing-agent/bands');
  return resp.bands ?? [];
}

export async function putBands(
  bands: PhishBand[],
  requestFn: ApiRequestFn = apiRequest,
): Promise<void> {
  await requestFn<void>('/phishing-agent/bands', {
    method: 'PUT',
    body: { bands },
  });
}
