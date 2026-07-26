import { apiRequest } from './client';
import type { Capabilities, FeatureDef } from '@/lib/product-form/resolve';

export interface Bootstrap {
  form: string;
  capabilities: Capabilities;
  branding: { deployment: 'saas' | 'self-hosted' };
  user: { role: string; tenantId: number | null } | null;
  featureRegistry: FeatureDef[];
  grants: string[];
  authStale?: boolean;
  localAuthEnabled: boolean;
}

// Read selected tenant from the server-visible cookie and send it as X-Tenant-ID,
// so a refresh/SSR bootstrap returns the correct tenant-scoped `grants`.
// Authorization stays server-side (GetEffectiveTenantID); the cookie only picks
// which tenant to request, never grants access.
function selectedTenantHeader(): Record<string, string> {
  if (typeof document === 'undefined') return {};
  const m = document.cookie.match(/(?:^|;\s*)osg_selected_tenant=(\d+)/);
  return m ? { 'X-Tenant-ID': m[1] } : {};
}

export function fetchBootstrap(tenantId?: number, options?: { signal?: AbortSignal }): Promise<Bootstrap> {
  const headers = tenantId !== undefined
    ? { 'X-Tenant-ID': String(tenantId) }
    : selectedTenantHeader();
  return apiRequest<Bootstrap>('/bootstrap', { headers, signal: options?.signal });
}
