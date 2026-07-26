import { apiRequest, type ApiRequestFn } from './client';
import type { OverseasMailConfig, OverseasMailConfigResponse } from '@/types/overseas-mail';

export async function getOverseasMailConfig(requestFn: ApiRequestFn = apiRequest) {
  return requestFn<OverseasMailConfigResponse>('/overseas-mail/config');
}

export async function updateOverseasMailConfig(
  data: OverseasMailConfig,
  requestFn: ApiRequestFn = apiRequest,
  signal?: AbortSignal,
  // GT-12114 Q-10：非空时后端做乐观锁校验，版本不符返回 409。
  expectedVersion?: string,
) {
  const body: OverseasMailConfig & { expected_version?: string } = { ...data };
  if (expectedVersion) body.expected_version = expectedVersion;
  return requestFn<OverseasMailConfigResponse>('/overseas-mail/config', { method: 'PUT', body, signal });
}
