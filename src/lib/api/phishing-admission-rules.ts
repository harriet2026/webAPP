import { apiRequest, type ApiRequestFn } from './client';
import type {
  PhishAdmissionRule,
  PhishAdmissionRuleListItem,
  PhishAdmissionRuleUpdate,
  PhishAdmissionRuleWrite,
} from '@/types/phishing-config';

export async function listAdmissionRules(
  requestFn: ApiRequestFn = apiRequest,
): Promise<PhishAdmissionRuleListItem[]> {
  const response = await requestFn<{ items: PhishAdmissionRuleListItem[] }>('/phishing-agent/admission-rules');
  return response.items ?? [];
}

export function admissionRulesReady(rules: PhishAdmissionRuleListItem[] | undefined, tenantId: number | null): boolean {
  const applicable = rules?.filter((rule) => rule.tenant_id === null || rule.tenant_id === tenantId);
  return Boolean(applicable?.every((rule) => rule.status === 'ready') && applicable.some((rule) => rule.effective));
}

export function createAdmissionRule(
  body: PhishAdmissionRuleWrite,
  requestFn: ApiRequestFn = apiRequest,
): Promise<PhishAdmissionRule> {
  return requestFn<PhishAdmissionRule>('/phishing-agent/admission-rules', { method: 'POST', body });
}

export async function updateAdmissionRule(
  id: number,
  body: PhishAdmissionRuleUpdate,
  requestFn: ApiRequestFn = apiRequest,
): Promise<void> {
  await requestFn<void>(`/phishing-agent/admission-rules/${id}`, { method: 'PUT', body });
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
  await requestFn<void>(`/phishing-agent/admission-rules/${id}`, { method: 'DELETE' });
}
