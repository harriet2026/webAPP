import type { ApiRequestFn, ConfigMutationResult } from './client';
import { apiRequest, isPublicationPendingResponse } from './client';

export type ConfigValueType = 'any' | 'bool' | 'int' | 'float' | 'string' | 'string_list' | 'object';
export type ConfigScope = 'system_only' | 'platform_only' | 'tenant_overridable' | 'tenant_independent';

export interface ConfigSchemaKey {
  path: string;
  type: ConfigValueType;
  scope: ConfigScope;
  merge: 'replace' | 'set_union';
  reload: 'hot' | 'reconcile' | 'restart';
  failure_mode: 'required' | 'fail_closed' | 'fail_open_audited';
  secret: boolean;
  has_system_default: boolean;
}

export interface ConfigNamespaceSchema {
  namespace: string;
  schema_version: number;
  keys: ConfigSchemaKey[];
}

export interface StoredScopedConfig {
  namespace: string;
  scope_kind: 'platform' | 'tenant';
  scope_id: number;
  schema_version: number;
  version: number;
  document: Record<string, unknown>;
  checksum: string;
  updated_at: string;
}

export interface EffectiveScopedConfig {
  namespace: string;
  tenant_id: number;
  schema_version: number;
  snapshot_version: string;
  platform_version: number;
  tenant_version: number;
  hash: string;
  document: Record<string, unknown>;
  provenance: Record<string, 'system' | 'system_default' | 'platform' | 'tenant'>;
}

export interface ScopedConfigView {
  stored?: StoredScopedConfig;
  effective: EffectiveScopedConfig;
  published: boolean;
}

export interface ConfigPatchOperation {
  op: 'set' | 'remove';
  path: string;
  value?: unknown;
}

export async function listConfigSchemas(requestFn: ApiRequestFn = apiRequest): Promise<ConfigNamespaceSchema[]> {
  const response = await requestFn<{ namespaces: ConfigNamespaceSchema[] }>('/configs/schema');
  return response.namespaces ?? [];
}

export function getPlatformConfig(namespace: string, requestFn: ApiRequestFn = apiRequest): Promise<ScopedConfigView> {
  return requestFn<ScopedConfigView>(`/configs/platform/${encodeURIComponent(namespace)}`);
}

export function patchPlatformConfig(
  namespace: string,
  expectedVersion: number,
  operations: ConfigPatchOperation[],
  requestFn: ApiRequestFn = apiRequest,
): Promise<ConfigMutationResult<ScopedConfigView>> {
  return requestFn<ConfigMutationResult<ScopedConfigView>>(`/configs/platform/${encodeURIComponent(namespace)}`, {
    method: 'PATCH',
    body: { expected_version: expectedVersion, operations },
  });
}

export function getTenantConfig(namespace: string, requestFn: ApiRequestFn = apiRequest): Promise<ScopedConfigView> {
  return requestFn<ScopedConfigView>(`/configs/tenant/${encodeURIComponent(namespace)}`);
}

export function patchTenantConfig(
  namespace: string,
  expectedVersion: number,
  operations: ConfigPatchOperation[],
  requestFn: ApiRequestFn = apiRequest,
): Promise<ConfigMutationResult<ScopedConfigView>> {
  return requestFn<ConfigMutationResult<ScopedConfigView>>(`/configs/tenant/${encodeURIComponent(namespace)}`, {
    method: 'PATCH',
    body: { expected_version: expectedVersion, operations },
  });
}

function patchDocument(
  source: Record<string, unknown>,
  operations: ConfigPatchOperation[],
): Record<string, unknown> {
  const result = structuredClone(source);
  for (const operation of operations) {
    const parts = operation.path.split('.').filter(Boolean);
    if (parts.length === 0) continue;
    let cursor = result;
    for (const part of parts.slice(0, -1)) {
      const child = cursor[part];
      if (!child || typeof child !== 'object' || Array.isArray(child)) cursor[part] = {};
      cursor = cursor[part] as Record<string, unknown>;
    }
    const leaf = parts[parts.length - 1];
    if (operation.op === 'remove') delete cursor[leaf];
    else cursor[leaf] = operation.value;
  }
  return result;
}

/**
 * The generic publication acknowledgement has no DTO. Preserve the committed
 * CAS locally so an eager GET of the old Manager snapshot cannot roll the
 * editor back or make its next expected_version stale.
 */
export function committedScopedConfigView(
  current: ScopedConfigView,
  operations: ConfigPatchOperation[],
): ScopedConfigView {
  const nextVersion = (current.stored?.version ?? 0) + 1;
  return {
    ...current,
    published: false,
    stored: current.stored ? {
      ...current.stored,
      version: nextVersion,
      document: patchDocument(current.stored.document, operations),
    } : current.stored,
    effective: {
      ...current.effective,
      platform_version: current.stored?.scope_kind === 'platform'
        ? nextVersion
        : current.effective.platform_version,
      tenant_version: current.stored?.scope_kind === 'tenant'
        ? nextVersion
        : current.effective.tenant_version,
      document: patchDocument(current.effective.document, operations),
    },
  };
}

/**
 * Direct scoped-config endpoints return a full view even with HTTP 202, but
 * its effective half may still be the pre-publication Manager snapshot. Other
 * compatibility endpoints return the generic acknowledgement. In both cases
 * keep the submitted operation locally; when available, retain the direct
 * endpoint's authoritative stored row (version/checksum/timestamp).
 */
export function acceptScopedConfigMutation(
  current: ScopedConfigView,
  result: ConfigMutationResult<ScopedConfigView>,
  operations: ConfigPatchOperation[],
): ScopedConfigView {
  if (!isPublicationPendingResponse(result) && result.published) return result;
  const committed = committedScopedConfigView(current, operations);
  if (isPublicationPendingResponse(result)) return committed;
  // A tenant can create its first sparse override while publication is down.
  // In that case `current.stored` is absent, but the direct 202 response still
  // carries the authoritative newly-created row. Use that row to advance the
  // matching effective version; leaving tenant_version at zero makes the
  // accepted full view internally contradictory and can feed stale versions
  // to callers that consume the effective half.
  const stored = result.stored ?? committed.stored;
  const storedVersion = stored?.version;
  return {
    ...committed,
    stored,
    effective: {
      ...committed.effective,
      platform_version: stored?.scope_kind === 'platform' && storedVersion !== undefined
        ? storedVersion
        : committed.effective.platform_version,
      tenant_version: stored?.scope_kind === 'tenant' && storedVersion !== undefined
        ? storedVersion
        : committed.effective.tenant_version,
    },
  };
}
