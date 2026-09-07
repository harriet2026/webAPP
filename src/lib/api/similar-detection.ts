import { apiRequest, type ApiRequestFn, type ConfigMutationResult } from './client';
import type { SimilarDetectionConfig, SimilarDetectionPutRequest } from '@/components/security/similar-detection/types';

export async function getSimilarDetection(requestFn: ApiRequestFn = apiRequest): Promise<SimilarDetectionConfig> {
  return requestFn<SimilarDetectionConfig>('/security/similar-detection');
}

export async function putSimilarDetection(
  req: SimilarDetectionPutRequest,
  requestFn: ApiRequestFn = apiRequest,
): Promise<ConfigMutationResult<SimilarDetectionConfig>> {
  return requestFn<ConfigMutationResult<SimilarDetectionConfig>>('/security/similar-detection', { method: 'PUT', body: req });
}

/**
 * Build the safe local state for a committed-but-not-yet-published write. The
 * endpoint performs exactly one CAS on the textsim scoped document, therefore
 * a successful commit advances the submitted expected version by one.
 */
export function committedSimilarDetection(req: SimilarDetectionPutRequest): SimilarDetectionConfig {
  const { expected_version: expectedVersion, ...submitted } = req;
  return { ...submitted, version: expectedVersion + 1 };
}
