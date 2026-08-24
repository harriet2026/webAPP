import { apiRequest, type ApiRequestFn } from './client';
import type {
  PhishAdmissionRule,
  PhishAdmissionRuleUpdate,
  PhishAdmissionRuleWrite,
} from '@/types/phishing-config';

export async function listAdmissionRules(
  requestFn: ApiRequestFn = apiRequest,
): Promise<PhishAdmissionRule[]> {
  const response = await requestFn<{ items: PhishAdmissionRule[] }>('/phishing-agent/admission-rules');
  return response.items ?? [];
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
