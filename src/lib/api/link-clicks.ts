import { apiRequest, type ApiRequestFn } from './client';
import type { PaginatedResponse } from '@/types/api';

export interface LinkClickLog {
  id: number;
  /** Present on v2 rows; omitted on historical v1 rows. */
  message_uuid?: string;
  message_id: string;
  occurred_at: string;
  clicker: string;
  sender?: string;
  subject?: string;
  original_url: string;
  rewritten_url?: string;
  client_ip?: string;
  click_source?: 'body' | 'attachment' | string;
  trigger_stage?: 'cloud_intel' | 'local_blacklist' | 'phishing_agent' | 'none' | string;
  verdict?: 'malicious' | 'phishing' | 'suspicious' | 'safe' | string;
  detail?: string;
  final_result?: 'alerted' | 'passed' | 'pending' | string;
  user_action?: 'proceeded' | 'abandoned' | 'skipped_deep_inspect' | 'none' | string;
  deep_inspect_state?: 'skipped' | 'running' | 'cached' | 'done' | 'timeout' | 'user_skipped' | string;
  cached?: boolean;
  tenant_id?: number;
  tenant_name?: string;
  log_id?: string;
}

export interface LinkClickParams {
  page?: number;
  page_size?: number;
  message_uuid?: string;
  /** Legacy v1 records only. New UI flows use message_uuid. */
  message_id?: string;
  clicker?: string;
  sender?: string;
  src_url?: string;
  trigger_stage?: string;
  final_result?: string;
  user_action?: string;
  click_source?: string;
  deep_inspect_state?: string;
  start?: string;
  end?: string;
}

const CANONICAL_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The table's single identity column displays message_uuid for v2 rows and the
// RFC Message-ID fallback for historical v1 rows. Route the copied value back
// to the matching API parameter so a historical value is never parsed as UUID.
export function linkClickMessageFilter(
  rawIdentity: string,
): Pick<LinkClickParams, 'message_uuid' | 'message_id'> {
  const identity = rawIdentity.trim();
  if (!identity) return {};
  return CANONICAL_UUID.test(identity)
    ? { message_uuid: identity }
    : { message_id: identity };
}

export async function getLinkClicks(
  params: LinkClickParams,
  requestFn: ApiRequestFn = apiRequest,
): Promise<PaginatedResponse<LinkClickLog>> {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value));
    }
  });
  const res = await requestFn<{ items: LinkClickLog[]; total: number; page: number; page_size: number }>(
    `/link-click-logs?${query}`,
  );
  return { items: res.items, total: res.total, page: res.page, page_size: res.page_size ?? 100 };
}

// downloadLinkClick triggers a留证 JSON file download for one row. It uses the
// scoped requestFn so the tenant header matches the page-level scope.
export async function downloadLinkClick(
  id: number,
  logId: string,
  requestFn: ApiRequestFn = apiRequest,
): Promise<void> {
  const item = await requestFn<LinkClickLog>(`/link-click-logs/${id}/download`);
  const blob = new Blob([JSON.stringify(item, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `link-click-${logId || id}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
