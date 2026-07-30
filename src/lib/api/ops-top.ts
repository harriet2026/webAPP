import { apiRequest, type ApiRequestFn, API_BASE } from './client';

export type OpsDimension =
  | 'connection' | 'auth' | 'sendIp' | 'subject' | 'sender' | 'recipient';
export type OpsDirection = 'all' | 'receive' | 'send' | 'internal';
export type OpsTimeRange = '24h' | 'today' | '7d' | '30d' | 'thisMonth' | 'lastMonth';
export type OpsTopCount = '10' | '50' | '100';

export interface OpsTopRow {
  rank: number;
  key: string;
  name: string;
  metrics: Record<string, string | number | boolean | null>;
  change: number;
  changePercent: number | null;
  isSpike: boolean;
  trend: number[];
}

export interface OpsTopResponse {
  dimension: OpsDimension;
  total: number;
  rows: OpsTopRow[];
  trendLabels: string[];
}

export interface OpsDrilldownItem {
  name: string;
  value: number;
}

export interface OpsDrilldownResponse {
  sub_dim: string;
  items: OpsDrilldownItem[];
}

export type OpsTopSort = 'volume' | 'threat';

export interface OpsTopParams {
  dimension: OpsDimension;
  direction: OpsDirection;
  timeRange: OpsTimeRange;
  top: OpsTopCount;
  // Ranking column for the sender / sendIp dimensions. Omitted → backend
  // default (by send volume). 'threat' ranks by intercepted-hit count, which
  // the system-status "威胁来源 TOP5" card needs (spec §4.8 "命中次数降序").
  sort?: OpsTopSort;
}

export async function fetchOpsTop(
  p: OpsTopParams,
  requestFn: ApiRequestFn = apiRequest,
): Promise<OpsTopResponse> {
  const qs = new URLSearchParams({
    dimension: p.dimension,
    direction: p.direction,
    time_range: p.timeRange,
    top: p.top,
  });
  if (p.sort) qs.set('sort', p.sort);
  return requestFn<OpsTopResponse>(`/statistics/ops-top?${qs.toString()}`);
}

export async function fetchOpsDrilldown(
  p: { dimension: OpsDimension; subDim: string; key: string; account?: string; direction: OpsDirection; timeRange: OpsTimeRange },
  requestFn: ApiRequestFn = apiRequest,
): Promise<OpsDrilldownResponse> {
  const qs = new URLSearchParams({
    dimension: p.dimension,
    sub_dim: p.subDim,
    key: p.key,
    direction: p.direction,
    time_range: p.timeRange,
  });
  if (p.account) qs.set('account', p.account);
  return requestFn<OpsDrilldownResponse>(`/statistics/ops-top/drilldown?${qs.toString()}`);
}

export function opsExportCsvUrl(p: OpsTopParams): string {
  const qs = new URLSearchParams({
    dimension: p.dimension,
    direction: p.direction,
    time_range: p.timeRange,
    top: p.top,
  });
  return `${API_BASE}/statistics/ops-top/export.csv?${qs.toString()}`;
}

export function opsExportCsvPath(p: OpsTopParams): string {
  const qs = new URLSearchParams({
    dimension: p.dimension,
    direction: p.direction,
    time_range: p.timeRange,
    top: p.top,
  });
  return `/statistics/ops-top/export.csv?${qs.toString()}`;
}

export async function downloadOpsTopCsv(
  p: OpsTopParams,
  requestFn: ApiRequestFn = apiRequest,
): Promise<Blob | string> {
  return requestFn<Blob | string>(opsExportCsvPath(p), { responseType: 'blob' });
}
