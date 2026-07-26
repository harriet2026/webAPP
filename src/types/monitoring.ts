export interface NodeInfo {
  id: string;
  last_seen_unix: number;
  online: boolean;
}

// DegradeInfo is embedded in every monitor response DTO. When the data source
// (TSDB, or the Database tab's business-DB provider) is unavailable the backend
// returns HTTP 200 with `degraded: true` + a `degraded_code` instead of a 500.
export interface DegradeInfo {
  degraded?: boolean;
  degraded_code?: string;
}

export interface NodesResp extends DegradeInfo {
  items: NodeInfo[];
}

export interface TrendPoint {
  ts: string;
  value: number;
}

export interface TrendSeries {
  points: TrendPoint[];
}

export interface NetIface {
  device: string;
  rx_pps: number;
  tx_pps: number;
  drop_rate: number;
  retransmit_rate: number;
}

export interface HardwareResp extends DegradeInfo {
  cpu_mem: TrendSeries;
  mem_trend: TrendSeries;
  network_top5: NetIface[];
}

export interface ProcRow {
  name: string;
  status: string;
  pid: number;
  memory: number;
  count?: number;
}

export interface ProcessesResp extends DegradeInfo {
  docker: { running: number; stopped: number; restarts: number };
  overlay2_usage: number;
  processes: ProcRow[];
}

export interface DockerContainerInfo {
  name: string;
  state: string;
  image: string;
}

export interface DockerContainersResp extends DegradeInfo {
  containers: DockerContainerInfo[];
}

export interface SlowQuery {
  query: string;
  exec_count: number;
  avg_ms: number;
  total_ms: number;
}

export interface LockWait {
  wait_type: string;
  wait_object: string;
  wait_ms: number;
}

export interface DBStatus {
  status: string;
  latency_ms: number;
}

export interface DatabaseResp extends DegradeInfo {
  conn_trend: TrendSeries;
  latency_trend: TrendSeries;
  slow_queries: SlowQuery[];
  lock_waits: LockWait[];
  status: { db: DBStatus; redis: DBStatus };
  supported: boolean;
  db_backend?: string;
  cache_hit_ratio?: number;
  active_conns?: number;
  db_size_bytes?: number;
  dml_rate?: TrendSeries;
}

export interface Partition {
  device: string;
  mount: string;
  total_bytes: number;
  used_bytes: number;
  usage_pct: number;
}

export interface StorageResp extends DegradeInfo {
  partitions: Partition[];
}

export interface BackupTask {
  id: string;
  name: string;
  exec_time: string;
  duration: number;
  size: number;
  status: string;
}

export interface BackupResp extends DegradeInfo {
  tasks: BackupTask[];
}

export interface BackupTaskDetail extends BackupTask {
  node: string;
  log: string;
}

export interface SvcRuntime {
  name: string;
  goroutine: number;
  heap_alloc: number;
  uptime: string;
}

export interface RuntimeResp extends DegradeInfo {
  services: SvcRuntime[];
}

export interface ServiceTrendResp extends DegradeInfo {
  goroutine: Record<string, TrendSeries>;
  heap: Record<string, TrendSeries>;
}

export type TimeRange = '1h' | '24h' | '7d';

export type SecurityEngine = 'antispam' | 'antivirus' | 'sandbox' | 'rbl';
export type SecurityTimeRange = '24h' | '7d' | '30d';

export interface SecurityEngineCard {
  key: SecurityEngine;
  status: 'normal' | 'error';
  primary_value: number | null;
}

export interface SecurityEngineTrendPoint {
  ts: string;
  primary: number;
  secondary: number;
}

export interface SecurityEngineDetailRow {
  id: string;
  instance_id?: string;
  time_period?: string;
  scan_throughput?: number;
  attachment_throughput?: number;
  average_latency_ms?: number;
  queue_backlog?: number;
  large_file_timeout?: number;
  node_name?: string;
  node_status?: string;
  average_analysis_seconds?: number;
  queue_length?: number;
  node_load_pct?: number;
  rbl_source?: string;
  average_response_ms?: number;
  timeout_rate?: number;
  query_throughput?: number;
}

export interface SecurityEngineResp extends DegradeInfo {
  engine: SecurityEngine;
  range: SecurityTimeRange;
  cards: SecurityEngineCard[];
  trend: SecurityEngineTrendPoint[];
  details: SecurityEngineDetailRow[];
  collected_at: string;
  approximate: boolean;
}

// ---- Mailflow monitoring ----

export interface MailflowQueueCard {
  queue: string;
  value: number;
  status: string;
}
export interface MailflowAgeBucket {
  bucket: string;
  pct: number;
  status: string;
}
export interface MailflowLatencyCard {
  avg: number;
  p95: number;
  p99: number;
  avg_status: string;
  p95_status: string;
  p99_status: string;
}
export interface MailflowQueueResp extends DegradeInfo {
  depth: MailflowQueueCard[];
  age: MailflowAgeBucket[];
  latency: MailflowLatencyCard;
}
export interface MailflowLatencyPoint {
  ts: string;
  avg: number;
  p95: number;
  p99: number;
}
export interface MailflowDeliveryResp extends DegradeInfo {
  trend: MailflowLatencyPoint[];
  approx: boolean;
}
export interface MailflowBounceDomain {
  domain: string;
  rate_5xx: number;
  rate_4xx: number;
  rate_5xx_status: string;
  rate_4xx_status: string;
  attempts: number;
  last_bounce: string;
}
export interface MailflowBounceReason {
  code: string;
  count: number;
  percent: number;
}
export interface MailflowBounceResp extends DegradeInfo {
  top_domains: MailflowBounceDomain[];
  reasons: MailflowBounceReason[];
}
export interface MailflowConnKPI {
  upstream: number | null;
  downstream: number | null;
  stage_diff: number | null;
  failed_count: number | null;
  failed_rate: number | null;
  avg_resp_ms: number | null;
  calibrating: boolean;
  stage_diff_status: string;
  failed_status: string;
  resp_status: string;
}
export interface MailflowConnQuality {
  total: number;
  success: number;
  failed: number;
  failed_rate: number;
  calibrating: boolean;
}
export interface MailflowConnectionResp extends DegradeInfo {
  kpi: MailflowConnKPI;
  quality: MailflowConnQuality;
}
export interface MailflowConnTrendPoint {
  ts: string;
  upstream: number | null;
  downstream: number | null;
}
export interface MailflowConnTrendResp extends DegradeInfo {
  points: MailflowConnTrendPoint[];
  calibrating: boolean;
}
export interface MailflowConnFailure {
  reason: string;
  count: number;
  percent: number;
}
export interface MailflowConnFailureResp {
  reasons: MailflowConnFailure[];
  calibrating: boolean;
}

export type MailflowDirection = 'all' | 'receive' | 'send' | 'internal';
