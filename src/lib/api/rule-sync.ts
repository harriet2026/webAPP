import type { ApiRequestFn } from './client';
import { apiRequest } from './client';

// Task 9b: the webapp-facing rule-sync status endpoint (Task 9a,
// internal/api/rulesync_status.go). Field names and null-vs-string shapes are
// the contract that handler documents — do not rename without updating both
// sides.
export type RuleSyncRole = 'standalone' | 'primary' | 'replica';

export interface RuleSyncStatus {
  role: RuleSyncRole;
  site_id: string;
  // Only ever non-empty when role === 'replica' (see handler doc).
  primary_addr: string;
  last_success_at: string | null;
  last_error: string;
  last_error_at: string | null;
  last_applied_generation: number;
  generation: number;
  // Count of tenant_id IS NULL rules — the number of local global rules a
  // "switch to replica" would make read-only (and eventually overwrite on
  // first sync). Powers the config-management page's destructive confirm.
  global_rule_count: number;
  // True when this replica has not synced successfully within
  // stale_after_seconds — including when it has never synced at all. Always
  // false on primary/standalone. The banner renders its warning colour from
  // this and computes nothing itself: the threshold comes from a server-side
  // config value, and comparing timestamps here would measure the primary's
  // last sync against the BROWSER's clock (see the handler's field doc).
  stale: boolean;
  // The threshold behind `stale`, for display. Three times the configured
  // sync_interval_seconds.
  stale_after_seconds: number;
}

export async function getRuleSyncStatus(
  requestFn: ApiRequestFn = apiRequest,
): Promise<RuleSyncStatus> {
  return requestFn<RuleSyncStatus>('/rule-sync/status');
}
