import { apiRequest, type ApiRequestFn } from './client';
import type {
  NodesResp,
  HardwareResp,
  ProcessesResp,
  DockerContainersResp,
  DatabaseResp,
  StorageResp,
  BackupResp,
  BackupTaskDetail,
  RuntimeResp,
  ServiceTrendResp,
  TimeRange,
  TrendSeries,
  MailflowQueueResp,
  MailflowDeliveryResp,
  MailflowBounceResp,
  MailflowConnectionResp,
  MailflowConnTrendResp,
  MailflowConnFailureResp,
  MailflowDirection,
  SecurityEngine,
  SecurityTimeRange,
  SecurityEngineResp,
} from '@/types/monitoring';
import type {
  AlertEvent,
  AlertListResp,
  AlertStats,
  AlertRule,
  AlertRulePayload,
  MetricsResp,
  TemplatesResp,
  SmtpConfig,
  SmtpConfigPayload,
  SmtpTestResult,
  BatchAlertsResult,
} from '@/types/alerts';

export async function fetchNodes(fn: ApiRequestFn = apiRequest): Promise<NodesResp> {
  return fn(`/monitor/nodes`);
}

export async function fetchHardware(
  node: string,
  range: TimeRange,
  fn: ApiRequestFn = apiRequest,
): Promise<HardwareResp> {
  return fn(`/monitor/hardware?node=${encodeURIComponent(node)}&range=${range}`);
}

export async function fetchProcesses(
  node: string,
  fn: ApiRequestFn = apiRequest,
): Promise<ProcessesResp> {
  return fn(`/monitor/processes?node=${encodeURIComponent(node)}`);
}

export async function fetchDockerContainers(
  node: string,
  fn: ApiRequestFn = apiRequest,
): Promise<DockerContainersResp> {
  return fn(`/monitor/docker-containers?node=${encodeURIComponent(node)}`);
}

export async function fetchDatabase(
  node: string,
  range: TimeRange,
  source: string = 'db',
  metric: string = 'connections',
  fn: ApiRequestFn = apiRequest,
): Promise<DatabaseResp> {
  return fn(`/monitor/database?node=${encodeURIComponent(node)}&range=${range}&source=${source}&metric=${metric}`);
}

export async function fetchStorage(
  node: string,
  fn: ApiRequestFn = apiRequest,
): Promise<StorageResp> {
  return fn(`/monitor/storage?node=${encodeURIComponent(node)}`);
}

export async function fetchBackup(
  node: string,
  fn: ApiRequestFn = apiRequest,
): Promise<BackupResp> {
  return fn(`/monitor/backup?node=${encodeURIComponent(node)}`);
}

export async function fetchBackupDetail(
  node: string,
  id: string,
  fn: ApiRequestFn = apiRequest,
): Promise<BackupTaskDetail> {
  return fn(`/monitor/backup/${encodeURIComponent(id)}?node=${encodeURIComponent(node)}`);
}

export async function fetchRuntime(
  node: string,
  range: TimeRange,
  fn: ApiRequestFn = apiRequest,
): Promise<RuntimeResp> {
  return fn(`/monitor/runtime?node=${encodeURIComponent(node)}&range=${range}`);
}

export async function fetchRuntimeTrend(
  node: string,
  range: TimeRange,
  fn: ApiRequestFn = apiRequest,
): Promise<ServiceTrendResp> {
  return fn(`/monitor/runtime-trend?node=${encodeURIComponent(node)}&range=${range}`);
}

export async function fetchSecurityEngine(
  engine: SecurityEngine,
  range: SecurityTimeRange,
  fn: ApiRequestFn = apiRequest,
  signal?: AbortSignal,
): Promise<SecurityEngineResp> {
  return fn(`/monitor/security?engine=${engine}&range=${range}`, { signal });
}

export async function fetchMailflowQueue(
  node: string,
  range: TimeRange,
  direction: MailflowDirection,
  fn: ApiRequestFn = apiRequest,
  signal?: AbortSignal,
): Promise<MailflowQueueResp> {
  return fn(`/monitor/mailflow/queue?node=${encodeURIComponent(node)}&range=${range}&direction=${direction}`, { signal });
}

export async function fetchMailflowQueueTrend(
  node: string,
  range: TimeRange,
  fn: ApiRequestFn = apiRequest,
  signal?: AbortSignal,
): Promise<{ series: Record<string, TrendSeries> }> {
  return fn(`/monitor/mailflow/queue/trend?node=${encodeURIComponent(node)}&range=${range}`, { signal });
}

export async function fetchMailflowDelivery(
  range: TimeRange,
  direction: string,
  fn: ApiRequestFn = apiRequest,
  signal?: AbortSignal,
): Promise<MailflowDeliveryResp> {
  return fn(`/monitor/mailflow/delivery?range=${range}&direction=${direction}`, { signal });
}

export async function fetchMailflowBounce(
  range: TimeRange,
  direction: string,
  fn: ApiRequestFn = apiRequest,
  signal?: AbortSignal,
): Promise<MailflowBounceResp> {
  return fn(`/monitor/mailflow/bounce?range=${range}&direction=${direction}`, { signal });
}

export async function fetchMailflowConnection(
  node: string,
  range: TimeRange,
  direction: string,
  fn: ApiRequestFn = apiRequest,
  signal?: AbortSignal,
): Promise<MailflowConnectionResp> {
  return fn(`/monitor/mailflow/connection?node=${encodeURIComponent(node)}&range=${range}&direction=${direction}`, { signal });
}

export async function fetchMailflowConnectionTrend(
  node: string,
  range: TimeRange,
  direction: string,
  fn: ApiRequestFn = apiRequest,
  signal?: AbortSignal,
): Promise<MailflowConnTrendResp> {
  return fn(`/monitor/mailflow/connection/trend?node=${encodeURIComponent(node)}&range=${range}&direction=${direction}`, { signal });
}

export async function fetchMailflowConnectionFailure(
  range: TimeRange,
  direction: string,
  fn: ApiRequestFn = apiRequest,
  signal?: AbortSignal,
): Promise<MailflowConnFailureResp> {
  return fn(`/monitor/mailflow/connection/failure?range=${range}&direction=${direction}`, { signal });
}

// ===== Alert Center (Plan 0 Locked Interfaces) =====

export interface AlertQuery {
  severity?: string;
  status?: string;
  q?: string;
  range?: string;
  page?: number;
  page_size?: number;
}

export async function fetchAlerts(
  query: AlertQuery,
  fn: ApiRequestFn = apiRequest,
  signal?: AbortSignal,
): Promise<AlertListResp> {
  const p = new URLSearchParams();
  if (query.severity && query.severity !== 'all') p.set('severity', query.severity);
  if (query.status && query.status !== 'all') p.set('status', query.status);
  if (query.q) p.set('q', query.q);
  if (query.range) p.set('range', query.range);
  if (query.page) p.set('page', String(query.page));
  if (query.page_size) p.set('page_size', String(query.page_size));
  const qs = p.toString();
  return fn(`/monitor/alerts${qs ? `?${qs}` : ''}`, { signal });
}

export async function fetchAlertStats(fn: ApiRequestFn = apiRequest, signal?: AbortSignal): Promise<AlertStats> {
  return fn(`/monitor/alerts/stats`, { signal });
}

export async function fetchAlert(
  id: number,
  fn: ApiRequestFn = apiRequest,
  signal?: AbortSignal,
): Promise<AlertEvent> {
  return fn(`/monitor/alerts/${id}`, { signal });
}

export async function confirmAlert(id: number, fn: ApiRequestFn = apiRequest): Promise<void> {
  return fn(`/monitor/alerts/${id}/confirm`, { method: 'PUT' });
}

export async function processAlert(id: number, fn: ApiRequestFn = apiRequest): Promise<void> {
  return fn(`/monitor/alerts/${id}/process`, { method: 'PUT' });
}

export async function resolveAlert(id: number, fn: ApiRequestFn = apiRequest): Promise<void> {
  return fn(`/monitor/alerts/${id}/resolve`, { method: 'PUT' });
}

export async function batchAlerts(
  action: 'confirm' | 'resolve',
  ids: number[],
  fn: ApiRequestFn = apiRequest,
): Promise<BatchAlertsResult> {
  return fn(`/monitor/alerts/batch`, { method: 'POST', body: { action, ids } });
}

export async function fetchAlertRules(fn: ApiRequestFn = apiRequest): Promise<{ items: AlertRule[] }> {
  return fn(`/monitor/alert-rules`);
}

export async function saveAlertRule(
  payload: AlertRulePayload,
  id: number | undefined,
  fn: ApiRequestFn = apiRequest,
): Promise<AlertRule> {
  if (id) return fn(`/monitor/alert-rules/${id}`, { method: 'PUT', body: payload });
  return fn(`/monitor/alert-rules`, { method: 'POST', body: payload });
}

export async function deleteAlertRule(id: number, fn: ApiRequestFn = apiRequest): Promise<void> {
  return fn(`/monitor/alert-rules/${id}`, { method: 'DELETE' });
}

export async function fetchAlertTemplates(fn: ApiRequestFn = apiRequest): Promise<TemplatesResp> {
  return fn(`/monitor/alert-rules/templates`);
}

export async function fetchAlertMetrics(fn: ApiRequestFn = apiRequest): Promise<MetricsResp> {
  return fn(`/monitor/alert-rules/metrics`);
}

export async function getSmtpConfig(fn: ApiRequestFn = apiRequest): Promise<SmtpConfig> {
  return fn(`/monitor/alert-smtp-config`);
}

export async function putSmtpConfig(
  payload: SmtpConfigPayload,
  fn: ApiRequestFn = apiRequest,
): Promise<SmtpConfig> {
  return fn(`/monitor/alert-smtp-config`, { method: 'PUT', body: payload });
}

export async function testSmtpConfig(
  to: string,
  config?: SmtpConfigPayload,
  fn: ApiRequestFn = apiRequest,
): Promise<SmtpTestResult> {
  // Send the unsaved form config so the probe tests exactly what the operator
  // sees, not the last-saved config (review M7). Omit to test the saved config.
  return fn(`/monitor/alert-smtp-config/test`, { method: 'POST', body: config ? { to, config } : { to } });
}
