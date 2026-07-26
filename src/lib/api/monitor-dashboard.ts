import { useQuery } from '@tanstack/react-query';
import { useApiRequest } from '@/lib/api/client';

// Mirrors backend models.MonitorDashboardOverview.
export interface MonitorDashboardKpi {
  today_volume: number;
  volume_change: number;
  delivery_success_rate: number;
  delivery_success_change: number;
  queue_depth: number;
  threats: number;
  nodes_online: number;
  nodes_total: number;
  engines_healthy: number;
  engines_total: number;
  todo: number;
  critical_todo: number;
  major_todo: number;
}

export interface MonitorDashboardAlertHealth {
  unconfirmed: number;
  processing: number;
  resolved: number;
}

export interface MonitorDashboardTrendPoint {
  time: string;
  volume: number;
  latency_p95: number;
}

export interface MonitorDashboardEnginePoint {
  time: string;
  antispam: number;
  antivirus: number;
  sandbox: number;
  rbl: number;
}

export interface MonitorDashboardInfrastructure {
  cpu_usage: number;
  memory_usage: number;
  disk_usage: number;
  database_status: string;
  status: DashboardStatus;
}

export interface MonitorDashboardMailflowHealth {
  queue_depth: number;
  latency_p95: number;
  status: DashboardStatus;
}

export type DashboardStatus = 'normal' | 'warning' | 'critical' | 'unknown';

export interface MonitorDashboardEngineHealth {
  key: 'antispam' | 'antivirus' | 'sandbox' | 'rbl';
  status: DashboardStatus;
}

export interface MonitorDashboardRecentAlert {
  id: number;
  time: string;
  module: string;
  message: string;
  status: 'unconfirmed' | 'confirmed' | 'processing' | 'resolved';
  severity: 'critical' | 'warning';
}

export interface MonitorDashboardOverview {
  range: string;
  kpi: MonitorDashboardKpi;
  infrastructure: MonitorDashboardInfrastructure;
  mailflow_health: MonitorDashboardMailflowHealth;
  engine_health: MonitorDashboardEngineHealth[];
  alert_health: MonitorDashboardAlertHealth;
  recent_alerts: MonitorDashboardRecentAlert[];
  mailflow_trend: MonitorDashboardTrendPoint[];
  engine_trend: MonitorDashboardEnginePoint[];
  degraded: boolean;
}

export type MonitorDashboardRange = 'today' | '24h' | '7d' | '30d';

export function useMonitorDashboardOverview(range: MonitorDashboardRange) {
  const { apiRequest } = useApiRequest();
  return useQuery({
    queryKey: ['monitor-dashboard', 'overview', range],
    queryFn: () =>
      apiRequest<MonitorDashboardOverview>(
        `/monitor-dashboard/overview?range=${range}`,
      ),
    // 后端聚合查询较快；页面自身有刷新间隔选择器控制 refetch
    staleTime: 15_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });
}
