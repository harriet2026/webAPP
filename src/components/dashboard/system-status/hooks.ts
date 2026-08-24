'use client';

// System-status dashboard central data hook (Plan Task 4).
//
// Combines the existing real statistics/security/monitoring/agent APIs into
// one `useSystemStatusData(range)` call. Two pure functions are exported
// separately so the period-over-period math and date-range resolution can be
// unit tested without mounting React or hitting the network:
//   - computeDelta(cur, prev)     — percentage change, prev=0 -> 0
//   - resolveRangeDates(range)    — {startDate,endDate,prevStart,prevEnd,interval}
//
// Tenant-viewer safety (spec §4.6 / plan Global Constraints): `/monitor/*` is
// adminOnly (`RequireSystemAdmin`) and rejects tenant_admin with 403. This
// hook decides whether to call `fetchNodes`/`fetchAlerts` from
// `scope.effectiveViewer` (via `resolveSecurityScope`, NOT the raw
// `viewer` context value — see resolveSecurityScope's own doc comment on why
// the raw value under-normalizes "platform admin + viewer=tenant + no
// selected tenant"). Tenant viewers only ever see tenant-scoped alert
// sources (the core summary's disposal/report backlogs and per-agent pending
// counts), which are not under `/monitor/*` and are already tenant-isolated by
// `X-Tenant-ID` (via `useScopedApiRequest`).
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, subDays, subHours } from 'date-fns';
import { useSecurityScope } from '@/components/statistics/security-overview/hooks/useSecurityScope';
import { ApiError, type ApiRequestFn } from '@/lib/api/client';
import type { TrendSeriesPoint } from '@/lib/api/security-overview';
import { fetchSystemStatusSummary } from '@/lib/api/system-status-summary';
import { fetchOpsTop, type OpsTopRow } from '@/lib/api/ops-top';
import { fetchNodes, fetchAlerts } from '@/lib/api/monitoring';
import type { NodeInfo } from '@/types/monitoring';
import type { AlertEvent, AlertSeverity } from '@/types/alerts';
import { getDetectionStats } from '@/lib/api/phishing-detection';
import { getSpoofingStats } from '@/lib/api/spoofing-detection';
import { getThreatRetroStats } from '@/lib/api/threat-retro';
import { useAgentFeatureAccess, type AgentRowKey } from './visibility';

export type SystemStatusRange = '24h' | 'today' | '7d' | '30d';

/**
 * (cur - prev) / prev * 100. Returns 0 when prev is 0 to avoid a
 * divide-by-zero / Infinity result (there is no meaningful "% change" from a
 * zero baseline).
 */
export function computeDelta(cur: number, prev: number): number {
  if (!prev) return 0;
  return ((cur - prev) / prev) * 100;
}

export interface RangeDates {
  startDate: string;
  endDate: string;
  prevStart: string;
  prevEnd: string;
  interval: 'hour' | 'day';
  /**
   * Optional clock-of-day refinements (HH:mm:ss) for the `start_time` /
   * `end_time` parameters of the homepage summary endpoint. Its backend scan
   * computes both KPI cards from this one window, so they cannot disagree about
   * what "24 小时" means. Only the
   * '24h' range sets them; the calendar-day-aligned ranges (today / 7d / 30d)
   * leave them undefined and keep the pure whole-day semantics.
   *
   * When present the window is [startDate startTime, endDate endTime) — the end
   * clock is EXCLUSIVE, so a clock-bounded range is never rounded up to the end
   * of the day.
   */
  startTime?: string;
  endTime?: string;
  prevStartTime?: string;
  prevEndTime?: string;
}

function fmt(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

function fmtClock(d: Date): string {
  return format(d, 'HH:mm:ss');
}

/**
 * Resolves the current period + the immediately-preceding, equal-length
 * period for a system-status range selector value (spec §4.3 delta note:
 * `SecurityOverviewKPI` has no delta field, so the frontend computes it by
 * calling the summary endpoint twice and diffing).
 *
 * - `today` -> single day, previous = yesterday, `interval: 'hour'`.
 * - `7d` / `30d` -> N-day window ending today, previous = the N days
 *   immediately before that window, `interval: 'day'`.
 *
 * `now` is injectable for deterministic tests; defaults to `new Date()`.
 */
export function resolveRangeDates(range: SystemStatusRange, now: Date = new Date()): RangeDates {
  if (range === '24h') {
    // 过去 24 小时：真正的 24 小时，不是"两个自然日"。
    //
    // 日期粒度不足以表达这一档：统计接口只拿到日期时会把
    // [start_date, end_date] 展开成 [start_date 00:00, end_date+1 00:00)，于是
    // "24 小时"实际查 48 小时，而且当前周期 [昨天00:00,明天00:00) 与上一周期
    // [前天00:00,今天00:00) 在"昨天"整天上完全重叠，环比彻底失真。
    //
    // 因此这一档额外带上时刻（start_time / end_time，后端可选参数，结束时刻为开
    // 区间）：当前 [now-24h, now)、上一周期 [now-48h, now-24h)，各 24 小时且首尾
    // 相接不重叠。时刻按部署/租户时区解释，与日期口径同源。
    const curStart = subHours(now, 24);
    const prevStart = subHours(now, 48);
    return {
      startDate: fmt(curStart),
      startTime: fmtClock(curStart),
      endDate: fmt(now),
      endTime: fmtClock(now),
      prevStart: fmt(prevStart),
      prevStartTime: fmtClock(prevStart),
      // 上一周期的结束时刻 = 当前周期的开始时刻（半开区间，互不重叠）。
      prevEnd: fmt(curStart),
      prevEndTime: fmtClock(curStart),
      interval: 'hour',
    };
  }
  if (range === 'today') {
    const today = fmt(now);
    const yesterday = fmt(subDays(now, 1));
    return { startDate: today, endDate: today, prevStart: yesterday, prevEnd: yesterday, interval: 'hour' };
  }
  const span = range === '7d' ? 7 : 30;
  return {
    startDate: fmt(subDays(now, span - 1)),
    endDate: fmt(now),
    prevStart: fmt(subDays(now, span * 2 - 1)),
    prevEnd: fmt(subDays(now, span)),
    interval: 'day',
  };
}

// "待处置邮件" default filter mirrors the disposal center's default quick
// view (action IN quarantine, sideline) — spec §4.3. This is a live backlog
// count, not scoped to the selected time range.

export type SystemStatusAlertLevel = 'danger' | 'warning' | 'info';
export type SystemStatusAlertScope = 'platform' | 'tenant';

export interface SystemStatusAlertItem {
  id: string;
  level: SystemStatusAlertLevel;
  scope: SystemStatusAlertScope;
  kind:
    | 'monitor'
    | 'node_offline'
    | 'pending_disposal'
    | 'pending_report'
    | 'agent_pending'
    | 'license_expiry'
    | 'rule_lib';
  href: string;
  count?: number;
  node?: NodeInfo;
  alert?: AlertEvent;
  agent?: 'phishing' | 'spoofing' | 'threat-retro';
  // GT-12553: license_expiry / rule_lib 平台待办的展示字段
  days?: number;
  ruleVersion?: string;
  ruleLatest?: boolean;
}

// GT-12553: GET /system/health-summary 的形状（与 system-health-card.tsx 及
// mock/fixtures.ts mockSystemHealthSummary 同契约；后端聚合接口由 GT-12346
// 落地，未上线时该接口 404，对应待办项整体缺席）。
export interface SystemHealthSummary {
  license_days: number | null;
  rule_version: string | null;
  rule_latest: boolean;
  av_vendor: string | null;
  av_expire: string | null;
}

// Agent stats fields are FIXED per the plan's Global Constraints — the three
// agents' stats endpoints do not share a field shape (threat-retro has no
// `today_detected`), so each row's "today" metric is hardcoded rather than
// derived generically:
//   phishing / spoofing "today" -> today_detected; pending -> pending_review
//   threat-retro        "today" -> recalled_today; pending -> pending_recall
export interface SystemStatusAgentStats {
  phishing: { todayDetected: number; pendingReview: number } | null;
  spoofing: { todayDetected: number; todayIntercepted: number; pendingReview: number } | null;
  threatRetro: { recalledToday: number; inProgress: number; pendingRecall: number } | null;
}

export type AgentStatsAccess = Record<AgentRowKey, boolean>;

export interface SystemStatusData {
  inbound: number;
  inboundDelta: number;
  threats: number;
  threatsDelta: number;
  blockRate: number;
  pending: number;
  pendingIsolated: number;
  pendingReport: number;
  nodesOnline: number;
  nodesTotal: number;
  // GT-12549: /monitor/nodes 数据源降级（TSDB 不可用/指标未初始化）时为 true，
  // KPI 与健康卡据此展示"数据源不可用"，不得把降级伪装成有效的 0/0。
  nodesDegraded: boolean;
  // 威胁态势趋势 series (security-overview email_type trend), aligned to the
  // demo's 5-class stacked threat chart. See threat-trend-config.ts.
  threatTrend: TrendSeriesPoint[];
  top5: OpsTopRow[];
  alerts: SystemStatusAlertItem[];
  agents: SystemStatusAgentStats | null;
  // Agent capability is resolved by /bootstrap after the core dashboard can
  // already start loading. Keep its loading state separate so a slow agent
  // stats endpoint never holds the KPI/trend cards in a page-wide skeleton.
  agentsLoading: boolean;
  isLoading: boolean;
  // Core and capability-gated agent data use separate queries. isError joins
  // their error states so the health banner never renders a false-green
  // "系统运行正常" when either visible data source failed.
  isError: boolean;
}

export type SystemStatusCoreData = Omit<
  SystemStatusData,
  'agents' | 'agentsLoading' | 'isLoading' | 'isError'
>;

function severityToLevel(sev: AlertSeverity): SystemStatusAlertLevel {
  if (sev === 'p0' || sev === 'p1') return 'danger';
  if (sev === 'p2') return 'warning';
  return 'info';
}

export async function fetchSystemStatusAgentStats(
  apiRequest: ApiRequestFn,
  access: AgentStatsAccess,
): Promise<SystemStatusAgentStats | null> {
  if (!Object.values(access).some(Boolean)) return null;

  const [phishing, spoofing, threatRetro] = await Promise.all([
    access.phishing
      ? optionalSource(getDetectionStats({}, apiRequest), null, 'phishing-agent-stats')
      : Promise.resolve(null),
    access.spoofing
      ? optionalSource(getSpoofingStats({}, apiRequest), null, 'spoofing-agent-stats')
      : Promise.resolve(null),
    access['threat-retro']
      ? optionalSource(getThreatRetroStats({}, apiRequest), null, 'threat-retro-agent-stats')
      : Promise.resolve(null),
  ]);
  return {
    phishing: phishing
      ? { todayDetected: phishing.today_detected, pendingReview: phishing.pending_review }
      : null,
    spoofing: spoofing ? {
      todayDetected: spoofing.today_detected,
      todayIntercepted: spoofing.today_intercepted,
      pendingReview: spoofing.pending_review,
    } : null,
    threatRetro: threatRetro ? {
      recalledToday: threatRetro.range.recall_succeeded,
      inProgress: threatRetro.snapshot.in_progress,
      pendingRecall: threatRetro.snapshot.pending_recall,
    } : null,
  };
}

interface FetchArgs {
  range: SystemStatusRange;
  dates: RangeDates;
  apiRequest: ApiRequestFn;
  isPlatform: boolean;
}

// GT-12005 / GT-12008: the dashboard used to fetch every source in one
// Promise.all, so a single rejected call took the whole query down and every
// field fell back to 0 / [] / null — the "统计卡片数据全为 0" and "待办面板为空"
// reports. Homepage pending-report data is now part of the core summary, so the
// dashboard no longer probes the paginated /inbound-audit endpoint just to read
// its total.
//
// Auxiliary sources now degrade to a neutral value on failure instead of
// destroying the page. The CORE summary source is deliberately NOT wrapped: if
// it is unavailable the dashboard genuinely has nothing to show, and the
// existing isError banner is the honest answer.
async function optionalSource<T>(p: Promise<T>, fallback: T, label: string): Promise<T> {
  try {
    return await p;
  } catch (err) {
    // ONLY a 403 may be degraded. A 403 means "this source is legitimately not
    // available to this viewer" (a tenant_admin hitting a platform-only endpoint)
    // — degrading it is the whole point of GT-12005.
    //
    // Anything else (500 / timeout / network) is a REAL outage, and swallowing it
    // makes the dashboard lie: `isError` stays false, so HealthBanner renders the
    // green "系统运行正常" while /monitor/alerts is down and real alerts are hidden;
    // a failing auxiliary query could otherwise hide real page content.
    // Silently-wrong is worse than an honest error banner, so
    // rethrow and let that source's owning query reject.
    if (err instanceof ApiError && err.status === 403) {
      console.warn(`[dashboard] source "${label}" forbidden for this viewer, degrading`, err);
      return fallback;
    }
    throw err;
  }
}

export async function fetchSystemStatusData(args: FetchArgs): Promise<SystemStatusCoreData> {
  const { range, dates, apiRequest, isPlatform } = args;

  const [summary, top5Resp] = await Promise.all([
    // 首页专用聚合保持既有口径，但只返回页面实际消费的数据：当前/上一周期
    // 收发信总量与威胁 KPI、当前 email_type 趋势、待处置与举报待审数量。
    // 完整的 delivery-traffic / security-overview / inbound-audit 接口继续供
    // 各自详情页使用。
    fetchSystemStatusSummary(
      {
        startDate: dates.startDate,
        startTime: dates.startTime,
        endDate: dates.endDate,
        endTime: dates.endTime,
        interval: dates.interval,
      },
      apiRequest,
    ),
    // §7 威胁来源 TOP5: dimension=sender, ranked by intercepted-hit count
    // (sort=threat) — spec §4.8 "命中次数降序". Without this the backend
    // defaults to send-volume ranking and the card would list the highest-
    // traffic senders (often 0-threat newsletters) instead of real threat
    // sources.
    optionalSource(
      fetchOpsTop({ dimension: 'sender', direction: 'all', timeRange: range, top: '10', sort: 'threat' }, apiRequest),
      { dimension: 'sender', total: 0, trendLabels: [], rows: [] as OpsTopRow[] },
      'ops-top',
    ),
  ]);

  const inbound = summary.current.mail_volume;
  const inboundDelta = computeDelta(inbound, summary.previous.mail_volume);
  // Global Constraint: 拦截威胁数用 blocked，不是 total_filtered.
  const threats = summary.current.threats;
  const threatsDelta = computeDelta(threats, summary.previous.threats);
  const blockRate = summary.current.block_rate;
  const pendingIsolated = summary.pending_disposal;
  const pendingReport = summary.pending_report;
  const top5 = top5Resp.rows.slice(0, 5);

  let nodesOnline = 0;
  let nodesTotal = 0;
  let nodesDegraded = false;
  const platformAlerts: SystemStatusAlertItem[] = [];
  // GT-12553: 许可证/规则库两项在 demo（a4/a5）位于列表尾部，单独收集后
  // 追加在 tenant 项之后，保持相对顺序与原型一致。
  const platformTailAlerts: SystemStatusAlertItem[] = [];

  if (isPlatform) {
    // Tenant viewers must NEVER reach this branch — /monitor/* is adminOnly
    // and 403s tenant_admin (spec §4.6 / Global Constraints).
    const [nodesResp, alertsResp] = await Promise.all([
      optionalSource(fetchNodes(apiRequest), { items: [] }, 'monitor-nodes'),
      optionalSource(
        fetchAlerts({ status: 'unconfirmed' }, apiRequest),
        { items: [], total: 0, page: 1, page_size: 0 },
        'monitor-alerts',
      ),
    ]);
    nodesTotal = nodesResp.items.length;
    nodesOnline = nodesResp.items.filter((n) => n.online).length;
    nodesDegraded = !!nodesResp.degraded;
    for (const n of nodesResp.items) {
      if (!n.online) {
        platformAlerts.push({
          id: `node-${n.id}`,
          level: 'danger',
          scope: 'platform',
          kind: 'node_offline',
          href: '/monitoring/infrastructure',
          node: n,
        });
      }
    }
    for (const a of alertsResp.items) {
      platformAlerts.push({
        id: `alert-${a.id}`,
        level: severityToLevel(a.severity),
        scope: 'platform',
        kind: 'monitor',
        href: '/monitoring/alerts',
        alert: a,
      });
    }

    // GT-12553: 许可证/规则库平台待办，数据源为健康聚合接口（GT-12346）。
    // 接口未上线（404）时按"无该类待办"处理，其余错误如实抛出（不吞 500）。
    let health: SystemHealthSummary | null = null;
    try {
      health = await apiRequest<SystemHealthSummary>('/system/health-summary');
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 404)) throw err;
    }
    if (health) {
      if (health.license_days != null) {
        const days = health.license_days;
        platformTailAlerts.push({
          // demo(a4) 链接 /admin/license，webapp 无授权/许可证页面，链过去
          // 会 404 —— 与健康卡 License 行同口径做展示项（无跳转）。
          id: 'license-expiry',
          // demo(a4): 7 天后到期为 warning 级；30 天内提醒，其余 info
          level: days <= 30 ? 'warning' : 'info',
          scope: 'platform',
          kind: 'license_expiry',
          href: '',
          days,
        });
      }
      if (health.rule_version) {
        platformTailAlerts.push({
          id: 'rule-lib',
          level: health.rule_latest ? 'info' : 'warning',
          scope: 'platform',
          kind: 'rule_lib',
          href: '',
          ruleVersion: health.rule_version,
          ruleLatest: health.rule_latest,
        });
      }
    }
  }

  // Tenant-scope alert sources — visible to every viewer (spec §4.6: these
  // items carry `scope:tenant`, shown regardless of effectiveViewer).
  const tenantAlerts: SystemStatusAlertItem[] = [];
  if (pendingIsolated > 0) {
    tenantAlerts.push({
      // Alert levels align to the demo: a pending-disposal backlog is a danger
      // (red) item (it drives the health banner's 紧急事件 count), and a
      // pending-report backlog is a warning (amber) item.
      id: 'pending-disposal',
      level: 'danger',
      scope: 'tenant',
      kind: 'pending_disposal',
      href: '/email-disposal/center',
      count: pendingIsolated,
    });
  }
  if (pendingReport > 0) {
    tenantAlerts.push({
      id: 'pending-report',
      level: 'warning',
      scope: 'tenant',
      kind: 'pending_report',
      href: '/audit/inbound',
      count: pendingReport,
    });
  }
  return {
    inbound,
    inboundDelta,
    threats,
    threatsDelta,
    blockRate,
    pending: pendingIsolated + pendingReport,
    pendingIsolated,
    pendingReport,
    nodesOnline,
    nodesTotal,
    nodesDegraded,
    threatTrend: summary.threat_trend ?? [],
    top5,
    alerts: [...platformAlerts, ...tenantAlerts, ...platformTailAlerts],
  };
}

export function buildAgentAlerts(agents: SystemStatusAgentStats | null): SystemStatusAlertItem[] {
  if (!agents) return [];

  const alerts: SystemStatusAlertItem[] = [];
  if (agents.phishing && agents.phishing.pendingReview > 0) {
    alerts.push({
      id: 'agent-phishing-pending',
      level: 'info',
      scope: 'tenant',
      kind: 'agent_pending',
      href: '/agent-center/overview?agent=phishing',
      agent: 'phishing',
      count: agents.phishing.pendingReview,
    });
  }
  if (agents.spoofing && agents.spoofing.pendingReview > 0) {
    alerts.push({
      id: 'agent-spoofing-pending',
      level: 'info',
      scope: 'tenant',
      kind: 'agent_pending',
      href: '/agent-center/overview?agent=spoofing',
      agent: 'spoofing',
      count: agents.spoofing.pendingReview,
    });
  }
  if (agents.threatRetro && agents.threatRetro.pendingRecall > 0) {
    alerts.push({
      id: 'agent-threat-retro-pending',
      level: 'info',
      scope: 'tenant',
      kind: 'agent_pending',
      href: '/agent-center/overview?agent=threat-retro',
      agent: 'threat-retro',
      count: agents.threatRetro.pendingRecall,
    });
  }
  return alerts;
}

export function mergeAgentAlerts(
  coreAlerts: SystemStatusAlertItem[],
  agents: SystemStatusAgentStats | null,
): SystemStatusAlertItem[] {
  const agentAlerts = buildAgentAlerts(agents);
  if (agentAlerts.length === 0) return coreAlerts;

  // License/rule-library items are deliberately the platform list tail. Agent
  // pending items are tenant-scoped and historically appeared before that tail.
  const tailIndex = coreAlerts.findIndex(
    (alert) => alert.kind === 'license_expiry' || alert.kind === 'rule_lib',
  );
  if (tailIndex < 0) return [...coreAlerts, ...agentAlerts];
  return [
    ...coreAlerts.slice(0, tailIndex),
    ...agentAlerts,
    ...coreAlerts.slice(tailIndex),
  ];
}

export function useSystemStatusData(range: SystemStatusRange): SystemStatusData {
  const agentFeatureAccess = useAgentFeatureAccess();
  // scopeTenantId: null — this hook never overrides the tenant scope from a
  // page-level selector (unlike security-overview's drill-down), so it
  // always defers to the default resolution (selectedTenantId / viewer).
  const scope = useSecurityScope(null);
  const apiRequest = scope.scopedRequest;
  const isPlatform = scope.effectiveViewer === 'platform';
  const agentAccess: AgentStatsAccess = {
    phishing: agentFeatureAccess.phishing.canRequest,
    spoofing: agentFeatureAccess.spoofing.canRequest,
    'threat-retro': agentFeatureAccess['threat-retro'].canRequest,
  };

  const dates = useMemo(() => resolveRangeDates(range), [range]);

  // GT-13021: /bootstrap resolves after the first dashboard render. Agent
  // access therefore changes from all-false to the granted rows shortly after
  // login. Keeping those booleans in the core key restarted the still-running
  // summary/ops-top queries and doubled database work. Core statistics now
  // have a stable key; only the lightweight agent query follows grant changes.
  const coreQuery = useQuery({
    queryKey: [
      'system-status',
      'core',
      range,
      scope.resolvedScopeTenant,
      isPlatform,
      dates.startDate,
      dates.endDate,
      // '24h' 的窗口带时刻，日期相同而时刻不同的两次查询必须是不同的 query key
      // （若首页 summary 后续增加缓存，缓存键也必须包含这两个字段）。
      dates.startTime,
      dates.endTime,
    ],
    enabled: scope.scopeResolved,
    queryFn: () => fetchSystemStatusData({ range, dates, apiRequest, isPlatform }),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const agentQueryEnabled = scope.scopeResolved && Object.values(agentAccess).some(Boolean);
  const agentQuery = useQuery({
    queryKey: [
      'system-status',
      'agents',
      scope.resolvedScopeTenant,
      isPlatform,
      agentAccess.phishing,
      agentAccess.spoofing,
      agentAccess['threat-retro'],
    ],
    enabled: agentQueryEnabled,
    queryFn: () => fetchSystemStatusAgentStats(apiRequest, agentAccess),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const data = coreQuery.data;
  const agents = agentQuery.data ?? null;

  return {
    inbound: data?.inbound ?? 0,
    inboundDelta: data?.inboundDelta ?? 0,
    threats: data?.threats ?? 0,
    threatsDelta: data?.threatsDelta ?? 0,
    blockRate: data?.blockRate ?? 0,
    pending: data?.pending ?? 0,
    pendingIsolated: data?.pendingIsolated ?? 0,
    pendingReport: data?.pendingReport ?? 0,
    nodesOnline: data?.nodesOnline ?? 0,
    nodesTotal: data?.nodesTotal ?? 0,
    nodesDegraded: data?.nodesDegraded ?? false,
    threatTrend: data?.threatTrend ?? [],
    top5: data?.top5 ?? [],
    alerts: mergeAgentAlerts(data?.alerts ?? [], agents),
    agents,
    agentsLoading: agentQueryEnabled && agentQuery.isLoading,
    isLoading: coreQuery.isLoading,
    isError: coreQuery.isError || agentQuery.isError,
  };
}
