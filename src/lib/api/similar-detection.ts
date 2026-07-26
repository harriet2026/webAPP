import { apiRequest, type ApiRequestFn } from './client';
import type { SimilarDetectionConfig, SimilarDetectionPutRequest } from '@/components/security/similar-detection/types';

export async function getSimilarDetection(requestFn: ApiRequestFn = apiRequest): Promise<SimilarDetectionConfig> {
  return requestFn<SimilarDetectionConfig>('/security/similar-detection');
}

export async function putSimilarDetection(
  req: SimilarDetectionPutRequest,
  requestFn: ApiRequestFn = apiRequest,
): Promise<SimilarDetectionConfig> {
  return requestFn<SimilarDetectionConfig>('/security/similar-detection', { method: 'PUT', body: req });
}
