import { apiRequest, type ApiRequestFn } from './client';

export type Direction = 'all' | 'receive' | 'send' | 'internal';
export type TimeRange = 'today' | '7d' | '30d' | 'this_month' | 'last_month' | 'custom';

export interface DeliveryTrafficParams {
  direction?: Direction;
  startDate?: string;
  endDate?: string;
  tenantId?: number | null;
}

export interface KpiData {
  inbound_total?: number;
  outbound_total?: number;
  internal_total?: number;
  total_success_rate?: number;
  queue_backlog?: number;
  total?: number;
  success_rate?: number;
  bounce_rate?: number;
  avg_latency_ms?: number;
  sideline_queue?: number;
  latency_p99_ms?: number;
  queue_backlog_approx?: number;
  internal_threat_count?: number;
  threat_rate?: number;
  trends?: Record<string, number>;
}

export interface TrendPoint {
  date: string;
  [key: string]: string | number | null;
}

export interface TrendData {
  points: TrendPoint[];
}

export interface DistributionItem {
  name: string;
  value: number;
  [key: string]: string | number | undefined;
}

export interface LatencyBucket {
  name: string;
  value: number;
  count: number;
  percent: number;
  threshold: number;
  healthy: boolean;
}

export interface LatencyData {
  percentiles?: TrendPoint[];
  buckets?: LatencyBucket[];
}

export interface QueueHealthSingle {
  current: number;
  oldest_age_ms: number;
  processing_rate: number;
  top_domain?: string;
  top_domain_count?: number;
}

export interface QueueHealthAll {
  receive: number;
  send: number;
  internal: number;
}

export type QueueHealth = QueueHealthSingle | QueueHealthAll;

export function isQueueHealthAll(q: QueueHealth): q is QueueHealthAll {
  return 'receive' in q;
}

export interface DetailTableRow {
  date: string;
  total: number;
  success: number;
  failure: number;
  success_rate: number;
  change: number | null;
  [key: string]: string | number | null;
}

export interface DeliveryTrafficResponse {
  kpi: KpiData;
  trend: TrendData;
  distribution: DistributionItem[];
  latency: LatencyData;
  queue_health: QueueHealth;
  queue_trend?: TrendPoint[];
  detail_table: DetailTableRow[];
  generated_at?: string;
  data_lag_seconds?: number | null;
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

export async function fetchDeliveryTraffic(
  params: DeliveryTrafficParams = {},
  requestFn: ApiRequestFn = apiRequest,
): Promise<DeliveryTrafficResponse> {
  const query = buildQuery({
    start_date: params.startDate,
    end_date: params.endDate,
    direction: params.direction,
    tenant_id: params.tenantId,
  });
  return requestFn<DeliveryTrafficResponse>(`/statistics/delivery-traffic?${query}`);
}

export function exportDeliveryTrafficCsvUrl(params: { startDate: string; endDate: string; direction: Direction; tenantId?: number | null }): string {
  const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api/v1';
  const query = buildQuery({
    start_date: params.startDate,
    end_date: params.endDate,
    direction: params.direction,
    tenant_id: params.tenantId,
  });
  return `${API_BASE}/statistics/delivery-traffic/export.csv?${query}`;
}
