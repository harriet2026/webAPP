export type SpoofingTenantScope = number | null;

export const spoofingQueryKeys = {
  engine: (tenantId: SpoofingTenantScope) => ['spoof-engine-config', tenantId] as const,
  stats: (tenantId: SpoofingTenantScope, range?: unknown) => range === undefined
    ? ['spoof-stats', tenantId] as const
    : ['spoof-stats', tenantId, range] as const,
  logs: (tenantId: SpoofingTenantScope, filters?: unknown) => filters === undefined
    ? ['spoof-logs', tenantId] as const
    : ['spoof-logs', tenantId, filters] as const,
  detail: (tenantId: SpoofingTenantScope, id: string | null) => ['spoof-detail', tenantId, id] as const,
  persons: (tenantId: SpoofingTenantScope, params?: unknown) => params === undefined
    ? ['spoof-persons', tenantId] as const
    : ['spoof-persons', tenantId, params] as const,
  brands: (tenantId: SpoofingTenantScope, params?: unknown) => params === undefined
    ? ['spoof-brands', tenantId] as const
    : ['spoof-brands', tenantId, params] as const,
  whitelist: (tenantId: SpoofingTenantScope) => ['spoof-whitelist', tenantId] as const,
  routingScope: (tenantId: SpoofingTenantScope) => ['routing-scope', 'spoof-person-import', tenantId] as const,
  importContacts: (tenantId: SpoofingTenantScope, importTenantId: number | null, params: unknown) =>
    ['spoof-person-import-contacts', tenantId, importTenantId, params] as const,
  importPersons: (tenantId: SpoofingTenantScope, importTenantId: number | null) =>
    ['spoof-persons-all-for-import', tenantId, importTenantId] as const,
};
