import { apiRequest, type ApiRequestFn } from './client';

export type Direction = 'all' | 'receive' | 'send' | 'internal';
// GT-11979/11930: `custom` lets the user pick arbitrary start/end (PRD F1).
// The dates themselves live in the page's CustomRange state, not in this union.
export type TimeRange = 'today' | '7d' | '30d' | 'this_month' | 'last_month' | 'custom';
export type ViewBy = 'threat_type' | 'action' | 'threat_level' | 'delivery_result' | 'email_type';
export type ChartType = 'area' | 'line' | 'bar';
export type SecurityOverviewInterval = 'hour' | 'day' | 'month';

// Keys present in trend/detail rows that are NOT stackable counts / drillable
// series. The delivery_result rows carry a `success_rate` percentage that must
// be excluded from the stacked area chart and the detail-table count columns.
//
// GT-11934: `total` / `block_rate` / `change` / `change_pct` are per-row summary fields the
// backend computes (storage/security_overview.go), NOT threat/action series.
// Leaving them out of this set made DetailTable treat them as dynamic series,
// which (a) rendered them as raw i18n keys — the reported
// `MISSING_MESSAGE: securityOverview.threatTypes.block_rate` — because there is
// no `threatTypes.total` label, and (b) summed a percentage and a delta into
// the block-rate denominator, so the displayed 拦截率 was numerically wrong.
// They are rendered as fixed right-hand columns instead, via the existing
// securityOverview.table.{total,blockRate,change} labels.
export const SUMMARY_KEYS = ['total', 'block_rate', 'change', 'change_pct'] as const;
export const NON_SERIES_KEYS = new Set<string>(['success_rate', ...SUMMARY_KEYS]);

export interface SecurityOverviewParams {
  startDate?: string;
  endDate?: string;
  /**
   * Optional clock-of-day (HH:mm or HH:mm:ss) refining startDate / endDate,
   * mirroring the delivery-traffic client's pair so the dashboard can ask both
   * endpoints for exactly the same window.
   * Omitted => the backend keeps its whole-day semantics
   * ([startDate 00:00, endDate+1d 00:00)). Supplied => the window is
   * [startDate startTime, endDate endTime), with the END clock EXCLUSIVE.
   * Only the dashboard's "过去 24 小时" selector needs this; this page's own
   * calendar-day picker must keep sending dates only.
   */
  startTime?: string;
  endTime?: string;
  direction?: Direction;
  comparePreviousPeriod?: boolean;
  interval?: SecurityOverviewInterval;
}

export interface KpiData {
  total_filtered: number;
  total_filtered_delta: number | null;
  block_rate: number;
  block_rate_delta: number | null;
  recall_rate: number;
  recall_rate_delta: number | null;
  pending_review: number;
  pending_review_delta: number | null;
  blocked: number;
}

export interface DistributionItem {
  name: string;
  value: number;
}

export interface TrendSeriesPoint {
  date: string;
  total: number;
  block_rate: number;
  change: number | null;
  [key: string]: string | number | null | undefined;
}

export interface TrendData {
  threat_type: TrendSeriesPoint[];
  action: TrendSeriesPoint[];
  delivery_result: TrendSeriesPoint[];
  threat_level: TrendSeriesPoint[];
  // Unified 11-category mail taxonomy used by the PRD's first perspective.
  email_type?: TrendSeriesPoint[];
}

export interface DetailTableRow {
  date: string;
  total: number;
  block_rate: number;
  change: number | null;
  change_pct?: number | null;
  [key: string]: string | number | null | undefined;
}

export interface DetailTableData {
  threat_type: DetailTableRow[];
  action: DetailTableRow[];
  delivery_result: DetailTableRow[];
  threat_level: DetailTableRow[];
  // Optional for compatibility with older servers; current servers populate it.
  email_type?: DetailTableRow[];
}

export interface SecurityOverviewResponse {
  kpi: KpiData;
  distribution: DistributionItem[];
  trend: TrendData;
  trend_previous: TrendData | null;
  trend_previous_period: TrendData | null;
  detail_table: DetailTableData;
}

export interface GeoDistributionParams {
  startDate?: string;
  endDate?: string;
  direction?: Direction;
  threatFilter?: string;
  country?: string;
}

export interface GeoCountry {
  country: string;
  count: number;
  block_rate: number;
}

export interface GeoDistributionResponse {
  countries: GeoCountry[];
  summary_top3?: string[];
  drill_down?: {
    country: string;
    top_ips: Array<{ name: string; count: number }>;
    by_threat: Record<string, number>;
  };
}

export interface TimeDistributionParams {
  startDate?: string;
  endDate?: string;
  direction?: Direction;
  threatFilter?: string;
  mode?: 'daily' | 'weekly';
}

export interface HourlyBucket {
  hour: number;
  total: number;
  // 8 threat email types (excludes non-threat: normal / subscription / advertising)
  spam: number;
  harmful: number;
  suspicious: number;
  sensitive: number;
  spoofing: number;
  phishing: number;
  virus: number;
  account_compromised: number;
}

export interface PeakHour {
  hour: number;
  count: number;
}

export interface TimeBucket {
  label: string;
  attack_count: number;
  total_count: number;
}

export interface WeeklyMatrixCell {
  day: number;
  hour: number;
  value: number;
}

export interface TimeDistributionResponse {
  mode: 'daily' | 'weekly';
  buckets: TimeBucket[];
  weekly_matrix?: WeeklyMatrixCell[];
  hourly: HourlyBucket[];
  peak_hours: PeakHour[];
}

export type DrillDimension = 'action' | 'sender_domain' | 'client_ip' | 'matched_rule';

export interface DrillDownParams {
  date: string;
  direction?: Direction;
  viewBy: ViewBy;
  series: string;
  dimension: DrillDimension;
  limit?: number;
}

export interface DrillDownBucket {
  name: string;
  count: number;
}

export interface DrillDownResponse {
  items: DrillDownBucket[];
  filter_query: string;
}

export interface EscapeItem {
  id: number;
  message_id: string;
  subject: string;
  sender: string;
  recipients: string[];
  recalled_at: string;
  recall_reason: string;
}

export interface EscapeListResponse {
  items: EscapeItem[];
  total: number;
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

export function getExportCsvUrl(params: {
  startDate: string;
  endDate: string;
  direction: Direction;
  tenantId: number | null;
}): string {
  const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api/v1';
  const query = buildQuery({
    start_date: params.startDate,
    end_date: params.endDate,
    direction: params.direction,
    tenant_id: params.tenantId ?? undefined,
  });
  return `${API_BASE}/statistics/security-overview/export.csv?${query}`;
}

export async function getSecurityOverview(
  params: SecurityOverviewParams = {},
  requestFn: ApiRequestFn = apiRequest,
): Promise<SecurityOverviewResponse> {
  const query = buildQuery({
    start_date: params.startDate,
    end_date: params.endDate,
    // buildQuery drops undefined/'' — an omitted clock never reaches the wire,
    // so date-only callers are byte-identical to before.
    start_time: params.startTime,
    end_time: params.endTime,
    direction: params.direction,
    compare_previous_period: params.comparePreviousPeriod,
    interval: params.interval,
  });
  return requestFn<SecurityOverviewResponse>(`/statistics/security-overview?${query}`);
}

export async function getGeoDistribution(
  params: GeoDistributionParams = {},
  requestFn: ApiRequestFn = apiRequest,
): Promise<GeoDistributionResponse> {
  const query = buildQuery({
    start_date: params.startDate,
    end_date: params.endDate,
    direction: params.direction,
    threat_filter: params.threatFilter,
    country: params.country,
  });
  return requestFn<GeoDistributionResponse>(`/statistics/security-overview/geo?${query}`);
}

export async function getTimeDistribution(
  params: TimeDistributionParams = {},
  requestFn: ApiRequestFn = apiRequest,
): Promise<TimeDistributionResponse> {
  const query = buildQuery({
    start_date: params.startDate,
    end_date: params.endDate,
    direction: params.direction,
    threat_filter: params.threatFilter,
    mode: params.mode,
  });
  return requestFn<TimeDistributionResponse>(`/statistics/security-overview/time-distribution?${query}`);
}

export async function getDrillDown(
  params: DrillDownParams,
  requestFn: ApiRequestFn = apiRequest,
): Promise<DrillDownResponse> {
  const query = buildQuery({
    date: params.date,
    direction: params.direction,
    view_by: params.viewBy,
    series: params.series,
    dimension: params.dimension,
    limit: params.limit ?? 10,
  });
  return requestFn<DrillDownResponse>(`/statistics/security-overview/drill-down?${query}`);
}

export async function getEscapeList(
  params: { direction?: Direction; startDate?: string; endDate?: string; page?: number; pageSize?: number } = {},
  requestFn: ApiRequestFn = apiRequest,
): Promise<EscapeListResponse> {
  const query = buildQuery({
    start_date: params.startDate,
    end_date: params.endDate,
    direction: params.direction,
    page: params.page,
    page_size: params.pageSize,
  });
  return requestFn<EscapeListResponse>(`/statistics/security-overview/escapes?${query}`);
}
