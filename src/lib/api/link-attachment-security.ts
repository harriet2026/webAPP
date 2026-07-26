import { apiRequest, type ApiRequestFn } from './client';

export type Direction = 'all' | 'receive' | 'send' | 'internal';
export type TimeRange = 'today' | '7d' | '30d' | 'this_month' | 'last_month';

export interface LinkAttachmentKPI {
  total_link_mail: number;
  link_detection_rate: number;
  total_attachment_mail: number;
  attachment_detection_rate: number;
}

export interface LinkTrendPoint {
  date: string;
  total_link_mail: number;
  malicious_link_mail: number;
  phishing: number;
  malware_download: number;
  spam: number;
  c2: number;
  qr_phishing: number;
}

export interface AttachmentTrendPoint {
  date: string;
  total_attachment_mail: number;
  malicious_attachment_mail: number;
  virus: number;
  macro: number;
  zip_bomb: number;
  exploit: number;
  other: number;
}

export interface DistItem {
  key: string;
  count: number;
  percent: number;
}

export interface ClickOverview {
  total_link_mails: number;
  clicked_mails: number;
  click_rate: number;
  total_clicks: number;
  threat_clicks: number;
  safe_clicks: number;
}

export interface LinkDetailRow {
  date: string;
  total_link_mail: number;
  safe_link_mail: number;
  malicious_link_mail: number;
  phishing: number;
  malware_download: number;
  c2: number;
  spam: number;
  qr_phishing: number;
  block_rate: number;
  change: number;
}

export interface AttachmentDetailRow {
  date: string;
  total_attachment_mail: number;
  safe_attachment_mail: number;
  malicious_attachment_mail: number;
  virus: number;
  macro: number;
  zip_bomb: number;
  exploit: number;
  other: number;
  block_rate: number;
  change: number;
}

export interface LinkAttachmentStats {
  kpi: LinkAttachmentKPI;
  trend: { link: LinkTrendPoint[]; attachment: AttachmentTrendPoint[] };
  link_distributions: { type: DistItem[]; reputation: DistItem[]; click_overview: ClickOverview };
  attachment_distributions: { type: DistItem[]; threat_type: DistItem[] };
  detail_table: { link: LinkDetailRow[]; attachment: AttachmentDetailRow[] };
  /** 已投递后被沙箱异步判恶的邮件数。页面仅提示并跳转详情，不提供批量召回。 */
  sandbox_async_malicious_count?: number;
}

export interface TopMaliciousDomain {
  rank: number;
  domain: string;
  count: number;
  block_rate: number;
  first_seen: string;
  blacklisted: boolean;
}

export interface TopMaliciousAttachment {
  rank: number;
  md5: string;
  md5_short: string;
  file_name: string;
  file_ext: string;
  threat_type: string;
  virus_name?: string;
  engine: string;
  count: number;
  first_seen: string;
}

export interface ListResponse<T> { items: T[]; }

export interface StatsQueryParams {
  direction: Direction;
  start_date: string;
  end_date: string;
}

function buildQuery(params: Record<string, unknown>): string {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value));
    }
  });
  return query.toString();
}

export async function getLinkAttachmentStats(
  params: StatsQueryParams,
  requestFn: ApiRequestFn = apiRequest,
): Promise<LinkAttachmentStats> {
  const q = buildQuery({ direction: params.direction, start_date: params.start_date, end_date: params.end_date });
  return requestFn<LinkAttachmentStats>(`/statistics/link-attachment-security?${q}`);
}

export async function getTopMaliciousDomains(
  params: StatsQueryParams & { limit: number },
  requestFn: ApiRequestFn = apiRequest,
): Promise<ListResponse<TopMaliciousDomain>> {
  const q = buildQuery({ ...params });
  return requestFn<ListResponse<TopMaliciousDomain>>(`/statistics/link-attachment-security/top-malicious-domains?${q}`);
}

export async function getTopMaliciousAttachments(
  params: StatsQueryParams & { limit: number },
  requestFn: ApiRequestFn = apiRequest,
): Promise<ListResponse<TopMaliciousAttachment>> {
  const q = buildQuery({ ...params });
  return requestFn<ListResponse<TopMaliciousAttachment>>(`/statistics/link-attachment-security/top-malicious-attachments?${q}`);
}

export async function blacklistDomain(
  domain: string,
  direction: Direction,
  requestFn: ApiRequestFn = apiRequest,
): Promise<unknown> {
  return requestFn('/statistics/link-attachment-security/blacklist-domain', {
    method: 'POST',
    body: { domain, direction },
  });
}

export function exportLinkAttachmentCsvUrl(params: StatsQueryParams & { tenant_id?: number | null }): string {
  const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api/v1';
  // A plain `<a href download>` navigation cannot carry the X-Tenant-ID
  // header, so a system_admin's selected tenant must ride along as a query
  // param — the backend resolves it via GetEffectiveTenantIDForHeaderlessGET.
  const query = buildQuery({
    start_date: params.start_date,
    end_date: params.end_date,
    direction: params.direction,
    tenant_id: params.tenant_id ?? undefined,
  });
  return `${API_BASE}/statistics/link-attachment-security/export.csv?${query}`;
}
