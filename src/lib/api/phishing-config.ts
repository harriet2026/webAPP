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
  PhishProtectionLevel,
  PhishPresetVersion,
} from '@/types/phishing-config';

export async function getEngineConfig(
  requestFn: ApiRequestFn = apiRequest,
): Promise<PhishEngineConfigResponse> {
  return requestFn<PhishEngineConfigResponse>('/phishing-agent/engine-config');
}

export interface PhishConfigAuditEntry {
  action: 'protection_level_changed' | 'bands_changed' | 'runtime_mode_changed' | 'timeout_policy_changed' | 'admission_rules_changed';
  changed_fields: string[];
  before: unknown;
  after: unknown;
  created_at: string;
}

export interface PhishConfigAggregate {
  engine: PhishTenantEngineParams;
  bands: PhishBand[];
  protection_level: PhishProtectionLevel;
  protection_preset_version?: PhishPresetVersion;
}

export async function putEngineConfig(
  params: PhishTenantEngineParams,
  requestFn: ApiRequestFn = apiRequest,
): Promise<void> {
  await requestFn<void>('/phishing-agent/engine-config', {
    method: 'PUT',
    body: { params },
  });
}

export async function putPhishingConfig(
  config: PhishConfigAggregate,
  requestFn: ApiRequestFn = apiRequest,
): Promise<void> {
  await requestFn<void>('/phishing-agent/config', {
    method: 'PUT',
    body: config,
  });
}

export async function listPhishingConfigAudit(
  requestFn: ApiRequestFn = apiRequest,
): Promise<PhishConfigAuditEntry[]> {
  const resp = await requestFn<{ items: PhishConfigAuditEntry[] }>('/phishing-agent/config/audit');
  return resp.items ?? [];
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
