import { apiRequest, type ApiRequestFn } from './client';

export interface SPFStats {
  pass: number;
  fail: number;
  none: number;
  softfail: number;
  neutral: number;
  error: number;
}

export interface DKIMStats {
  success: number;
  fail: number;
  no_signature: number;
  perm_error: number;
  temp_error: number;
}

export interface DMARCStats {
  pass: number;
  fail: number;
  none: number;
  temp_error: number;
  perm_error: number;
}

export interface ActionStats {
  accept: number;
  reject: number;
  quarantine: number;
  sideline: number;
}

export interface DayStat {
  date: string;
  total: number;
  accepted: number;
  rejected: number;
}

export interface DashboardMetrics {
  total_emails: number;
  accepted_emails: number;
  rejected_emails: number;
  quarantined_emails: number;
  sidelined_emails: number;
  spf_stats: SPFStats;
  dkim_stats: DKIMStats;
  dmarc_stats: DMARCStats;
  by_action: ActionStats;
  // Mirrors the persisted 11-key email_type breakdown (models.AllEmailTypes /
  // zeroedEmailTypeCounts() in internal/storage/statistics.go). Not currently
  // consumed by any component (type-distribution-chart.tsx was retired) — kept
  // correctly-typed since the backend still serves it on the real API response.
  by_email_type: Record<EmailType, number>;
  by_day: DayStat[];
}

export interface DashboardSummaryResponse {
  metrics: DashboardMetrics;
  top_malicious_emails: unknown[];
}

export interface FilterTimeSeriesPoint {
  timestamp: string;
  accept: number;
  reject: number;
  quarantine: number;
  sidelined: number;
}

export interface FilterStatisticsResponse {
  action_counts: ActionStats;
  time_series: FilterTimeSeriesPoint[];
}

// EMAIL_TYPES: the 11 flat email types (spec §3.1), matching the backend's
// models.AllEmailTypes exactly. TypeStatisticsResponse always carries all 11
// keys (0-filled) for a stable UI legend.
export const EMAIL_TYPES = [
  'normal',
  'subscription',
  'advertising',
  'spam',
  'harmful',
  'suspicious',
  'sensitive',
  'spoofing',
  'phishing',
  'virus',
  'account_compromised',
] as const;

export type EmailType = (typeof EMAIL_TYPES)[number];

export interface TypeTimeSeriesPoint {
  timestamp: string;
  counts: Record<EmailType, number>;
}

export interface TypeStatisticsResponse {
  type_counts: Record<EmailType, number>;
  time_series: TypeTimeSeriesPoint[];
}

export interface TopSender {
  sender: string;
  send_count: number;
}

export interface TopRecipient {
  recipient: string;
  receive_count: number;
}

export interface TopIPConnection {
  ip: string;
  connection_count: number;
}

export interface TopIPAuth {
  ip: string;
  auth_count: number;
}

export interface TopIPSend {
  ip: string;
  send_count: number;
}

export interface TopSubject {
  subject: string;
  count: number;
}

export interface TopURL {
  url: string;
  count: number;
}

export interface DeliveryStatusCounts {
  [key: string]: number;
}

export interface DeliveryTimeSeriesPoint {
  timestamp: string;
  [key: string]: string | number;
}

export interface DeliveryStatisticsResponse {
  status_counts: DeliveryStatusCounts;
  time_series: DeliveryTimeSeriesPoint[];
}

export async function getDashboardSummary(startDate: string, endDate: string, requestFn: ApiRequestFn = apiRequest): Promise<DashboardSummaryResponse> {
  const params = new URLSearchParams({ start_date: startDate, end_date: endDate });
  return requestFn<DashboardSummaryResponse>(`/statistics/dashboard?${params}`);
}

export async function getFilterStatistics(
  startDate: string,
  endDate: string,
  interval?: 'day' | 'month',
  requestFn: ApiRequestFn = apiRequest
): Promise<FilterStatisticsResponse> {
  const params = new URLSearchParams({ start_date: startDate, end_date: endDate });
  if (interval) params.append('interval', interval);
  return requestFn<FilterStatisticsResponse>(`/statistics/filter?${params}`);
}

export async function getTypeStatistics(
  startDate: string,
  endDate: string,
  interval?: 'hour' | 'day' | 'month',
  requestFn: ApiRequestFn = apiRequest
): Promise<TypeStatisticsResponse> {
  const params = new URLSearchParams({ start_date: startDate, end_date: endDate });
  if (interval) params.append('interval', interval);
  return requestFn<TypeStatisticsResponse>(`/statistics/type?${params}`);
}

export async function getTopSenders(
  startDate: string,
  endDate: string,
  limit: number = 10,
  requestFn: ApiRequestFn = apiRequest
): Promise<{ items: TopSender[] }> {
  const params = new URLSearchParams({ start_date: startDate, end_date: endDate, limit: limit.toString() });
  return requestFn<{ items: TopSender[] }>(`/statistics/top/sender?${params}`);
}

export async function getTopRecipients(
  startDate: string,
  endDate: string,
  limit: number = 10,
  requestFn: ApiRequestFn = apiRequest
): Promise<{ items: TopRecipient[] }> {
  const params = new URLSearchParams({ start_date: startDate, end_date: endDate, limit: limit.toString() });
  return requestFn<{ items: TopRecipient[] }>(`/statistics/top/recipient?${params}`);
}

export async function getTopIPConnections(
  startDate: string,
  endDate: string,
  limit: number = 10,
  requestFn: ApiRequestFn = apiRequest
): Promise<{ items: TopIPConnection[] }> {
  const params = new URLSearchParams({ start_date: startDate, end_date: endDate, limit: limit.toString() });
  return requestFn<{ items: TopIPConnection[] }>(`/statistics/top/ip-connection?${params}`);
}

export async function getTopIPAuth(
  startDate: string,
  endDate: string,
  limit: number = 10,
  requestFn: ApiRequestFn = apiRequest
): Promise<{ items: TopIPAuth[] }> {
  const params = new URLSearchParams({ start_date: startDate, end_date: endDate, limit: limit.toString() });
  return requestFn<{ items: TopIPAuth[] }>(`/statistics/top/ip-auth?${params}`);
}

export async function getTopIPSend(
  startDate: string,
  endDate: string,
  limit: number = 10,
  requestFn: ApiRequestFn = apiRequest
): Promise<{ items: TopIPSend[] }> {
  const params = new URLSearchParams({ start_date: startDate, end_date: endDate, limit: limit.toString() });
  return requestFn<{ items: TopIPSend[] }>(`/statistics/top/ip-send?${params}`);
}

export async function getTopSubjects(
  startDate: string,
  endDate: string,
  limit: number = 10,
  requestFn: ApiRequestFn = apiRequest
): Promise<{ items: TopSubject[] }> {
  const params = new URLSearchParams({ start_date: startDate, end_date: endDate, limit: limit.toString() });
  return requestFn<{ items: TopSubject[] }>(`/statistics/top/subject?${params}`);
}

export async function getTopUrls(
  startDate: string,
  endDate: string,
  limit: number = 10,
  requestFn: ApiRequestFn = apiRequest
): Promise<{ items: TopURL[] }> {
  const params = new URLSearchParams({ start_date: startDate, end_date: endDate, limit: limit.toString() });
  return requestFn<{ items: TopURL[] }>(`/statistics/top/urls?${params}`);
}

export async function getDeliveryStatistics(
  startDate: string,
  endDate: string,
  requestFn: ApiRequestFn = apiRequest
): Promise<DeliveryStatisticsResponse> {
  const params = new URLSearchParams({ start_date: startDate, end_date: endDate });
  return requestFn<DeliveryStatisticsResponse>(`/statistics/delivery?${params}`);
}

// Correction quality (spec 2026-07-03-email-disposal-detail-drawer-design.md §4.1/§6.1).
// Reads engine ORIGINAL judgment (COALESCE(email_type_original, email_type)) vs the
// current human-corrected email_type — a distinct read path from getTypeStatistics.
export interface CorrectionQualityResponse {
  total_corrected: number;
  false_positive_count: number;
  false_negative_count: number;
  same_severity_count: number;
  classified_total: number;
  false_positive_rate: number;
  false_negative_rate: number;
  by_source: Record<string, number>;
}

export async function getCorrectionQuality(
  startDate: string,
  endDate: string,
  requestFn: ApiRequestFn = apiRequest,
): Promise<CorrectionQualityResponse> {
  const params = new URLSearchParams({ start_date: startDate, end_date: endDate });
  return requestFn<CorrectionQualityResponse>(`/statistics/correction-quality?${params}`);
}
