import type { ApiRequestFn } from '@/lib/api/client';
import type { TrendSeriesPoint } from '@/lib/api/security-overview';

export interface SystemStatusSummaryParams {
  startDate: string;
  endDate: string;
  startTime?: string;
  endTime?: string;
  interval: 'hour' | 'day';
}

export interface SystemStatusPeriodSummary {
  mail_volume: number;
  threats: number;
  block_rate: number;
}

export interface SystemStatusSummaryResponse {
  current: SystemStatusPeriodSummary;
  previous: SystemStatusPeriodSummary;
  threat_trend: TrendSeriesPoint[];
  pending_disposal: number;
  generated_at: string;
}

export async function fetchSystemStatusSummary(
  params: SystemStatusSummaryParams,
  requestFn: ApiRequestFn,
): Promise<SystemStatusSummaryResponse> {
  const query = new URLSearchParams({
    start_date: params.startDate,
    end_date: params.endDate,
    interval: params.interval,
  });
  if (params.startTime) query.set('start_time', params.startTime);
  if (params.endTime) query.set('end_time', params.endTime);
  return requestFn<SystemStatusSummaryResponse>(
    `/statistics/system-status-summary?${query.toString()}`,
  );
}
