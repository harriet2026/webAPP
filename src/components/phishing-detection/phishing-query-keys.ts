export type PhishingTenantScope = number | null | undefined;

export const phishingQueryKeys = {
  control: (tenantId: PhishingTenantScope) => ['phish-control', tenantId] as const,
  config: (tenantId: PhishingTenantScope) => ['phish-config', tenantId] as const,
  analysisConfig: (tenantId: PhishingTenantScope) => ['phish-analysis-config', tenantId] as const,
  admissionRulesRoot: ['phish-admission-rules'] as const,
  admissionRules: (tenantId: PhishingTenantScope) => [...phishingQueryKeys.admissionRulesRoot, tenantId] as const,
  statsRoot: (tenantId: PhishingTenantScope) => ['phish-stats', tenantId] as const,
  stats: (tenantId: PhishingTenantScope, range?: unknown) => [...phishingQueryKeys.statsRoot(tenantId), range] as const,
  logsRoot: (tenantId: PhishingTenantScope) => ['phish-logs', tenantId] as const,
  logs: (tenantId: PhishingTenantScope, filters?: unknown) => [...phishingQueryKeys.logsRoot(tenantId), filters] as const,
  detail: (tenantId: PhishingTenantScope, id: string | null) => ['phish-detail', tenantId, id] as const,
};
