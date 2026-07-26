import type { ApiRequestFn } from './client';
import { apiRequest } from './client';

export interface ConfigEntry {
  key: string;
  file_value: string;
}

export interface ConfigSection {
  name: string;
  entries: ConfigEntry[];
}

export interface ConfigFile {
  name: string;
  sections: ConfigSection[];
}

export interface ConfigFilesResponse {
  files: ConfigFile[];
}

export interface ConfigOverride {
  id: number;
  config_file: string;
  section_name: string;
  config_key: string;
  config_value: string;
  value_type: 'string' | 'int' | 'float' | 'bool';
  is_active: boolean;
  description: string;
}

export interface ConfigOverridesResponse {
  total: number;
  page: number;
  limit: number;
  items: ConfigOverride[];
}

export async function getConfigFiles(
  requestFn: ApiRequestFn = apiRequest,
): Promise<ConfigFilesResponse> {
  return requestFn<ConfigFilesResponse>('/config-files');
}

export async function getConfigOverridesForFile(
  configFile: string,
  requestFn: ApiRequestFn = apiRequest,
): Promise<ConfigOverride[]> {
  const resp = await requestFn<ConfigOverridesResponse>(
    `/config-overrides?config_file=${encodeURIComponent(configFile)}&page=1&limit=1000`,
  );
  return resp.items ?? [];
}

export interface CreateConfigOverridePayload {
  config_file: string;
  section_name: string;
  config_key: string;
  config_value: string;
  value_type: 'string' | 'int' | 'float' | 'bool';
  is_active?: boolean;
  description?: string;
}

export async function createConfigOverride(
  payload: CreateConfigOverridePayload,
  requestFn: ApiRequestFn = apiRequest,
): Promise<ConfigOverride> {
  return requestFn<ConfigOverride>('/config-overrides', { method: 'POST', body: payload });
}

export interface UpdateConfigOverridePayload {
  config_value?: string;
  value_type?: 'string' | 'int' | 'float' | 'bool';
  is_active?: boolean;
  description?: string;
}

export async function updateConfigOverride(
  id: number,
  payload: UpdateConfigOverridePayload,
  requestFn: ApiRequestFn = apiRequest,
): Promise<ConfigOverride> {
  return requestFn<ConfigOverride>(`/config-overrides/${id}`, { method: 'PUT', body: payload });
}

export async function deleteConfigOverride(
  id: number,
  requestFn: ApiRequestFn = apiRequest,
): Promise<void> {
  await requestFn(`/config-overrides/${id}`, { method: 'DELETE' });
}
