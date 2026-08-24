import { apiRequest, type ApiRequestFn } from './client';
import type { PhishAgentControl, PhishAgentControlPutRequest } from '@/types/phishing-config';

export function getPhishingControl(
  requestFn: ApiRequestFn = apiRequest,
): Promise<PhishAgentControl> {
  return requestFn<PhishAgentControl>('/phishing-agent/control');
}

export function putPhishingControl(
  body: PhishAgentControlPutRequest,
  requestFn: ApiRequestFn = apiRequest,
): Promise<PhishAgentControl> {
  return requestFn<PhishAgentControl>('/phishing-agent/control', { method: 'PUT', body });
}
