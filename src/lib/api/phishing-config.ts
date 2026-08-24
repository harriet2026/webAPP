import { apiRequest, type ApiRequestFn } from './client';
import type { PhishAgentConfig, PhishAgentConfigPutRequest } from '@/types/phishing-config';

export function getPhishingConfig(requestFn: ApiRequestFn = apiRequest): Promise<PhishAgentConfig> {
  return requestFn<PhishAgentConfig>('/phishing-agent/config');
}

// Runtime and risk policy are one atomic edit unit. Callers must never split
// this into sequential writes; both expected versions travel in this request.
export function putPhishingConfig(body: PhishAgentConfigPutRequest, requestFn: ApiRequestFn = apiRequest): Promise<PhishAgentConfig> {
  return requestFn<PhishAgentConfig>('/phishing-agent/config', { method: 'PUT', body });
}
