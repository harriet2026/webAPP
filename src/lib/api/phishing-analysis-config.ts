import { apiRequest, type ApiRequestFn, type PublicationPendingResponse } from './client';
import type { PhishAnalysisConfig, PhishAnalysisConfigPutRequest } from '@/types/phishing-config';

export function getPhishingAnalysisConfig(
  requestFn: ApiRequestFn = apiRequest,
): Promise<PhishAnalysisConfig> {
  return requestFn<PhishAnalysisConfig>('/phishing-agent/analysis-config');
}

export async function putPhishingAnalysisConfig(
  body: PhishAnalysisConfigPutRequest,
  requestFn: ApiRequestFn = apiRequest,
): Promise<void | PublicationPendingResponse> {
  return requestFn<void | PublicationPendingResponse>('/phishing-agent/analysis-config', { method: 'PUT', body });
}
