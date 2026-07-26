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
// sources (disposal backlog / inbound-audit backlog / per-agent pending
// counts), which are not under `/monitor/*` and are already tenant-isolated
// by `X-Tenant-ID` (via `useScopedApiRequest`).
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, subDays } from 'date-fns';
import { useProductForm } from '@/contexts/product-form-context';
import { useSecurityScope } from '@/components/statistics/security-overview/hooks/useSecurityScope';
import { ApiError, type ApiRequestFn } from '@/lib/api/client';
import { getDashboardSummary } from '@/lib/api/statistics';
import { getSecurityOverview, type TrendSeriesPoint } from '@/lib/api/security-overview';
import { fetchOpsTop, type OpsTopRow } from '@/lib/api/ops-top';
import { fetchNodes, fetchAlerts } from '@/lib/api/monitoring';
import type { NodeInfo } from '@/types/monitoring';
import type { AlertEvent, AlertSeverity } from '@/types/alerts';
import { getDisposalList } from '@/components/email-disposal/lib/disposal-api';
import { getInboundAuditItems } from '@/lib/api/inbound-audit';
import { getDetectionStats } from '@/lib/api/phishing-detection';
import { getSpoofingStats } from '@/lib/api/spoofing-detection';
import { getThreatRetroStats } from '@/lib/api/threat-retro';
import type { AdvancedFilter } from '@/types/log';

export type SystemStatusRange = 'today' | '7d' | '30d';

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
}

function fmt(d: Date): string {
  return format(d, 'yyyy-MM-dd');
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
const PENDING_DISPOSAL_FILTER: AdvancedFilter = {
  operator: 'AND',
  groups: [
    {
      operator: 'OR',
      conditions: [
        { field: 'action', op: 'eq', value: 'quarantine' },
        { field: 'action', op: 'eq', value: 'sideline' },
      ],
    },
  ],
};

export type SystemStatusAlertLevel = 'danger' | 'warning' | 'info';
export type SystemStatusAlertScope = 'platform' | 'tenant';

export interface SystemStatusAlertItem {
  id: string;
  level: SystemStatusAlertLevel;
  scope: SystemStatusAlertScope;
  kind: 'monitor' | 'node_offline' | 'pending_disposal' | 'pending_report' | 'agent_pending';
  href: string;
  count?: number;
  node?: NodeInfo;
  alert?: AlertEvent;
  agent?: 'phishing' | 'spoofing' | 'threat-retro';
}

// Agent stats fields are FIXED per the plan's Global Constraints — the three
// agents' stats endpoints do not share a field shape (threat-retro has no
// `today_detected`), so each row's "today" metric is hardcoded rather than
// derived generically:
//   phishing / spoofing "today" -> today_detected; pending -> pending_review
//   threat-retro        "today" -> recalled_today; pending -> pending_recall
export interface SystemStatusAgentStats {
  phishing: { todayDetected: number; pendingReview: number };
  spoofing: { todayDetected: number; todayIntercepted: number; pendingReview: number };
  threatRetro: { recalledToday: number; inProgress: number; pendingRecall: number };
}

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
  // 威胁态势趋势 series (security-overview threat_type trend), aligned to the
  // demo's 5-class stacked threat chart. See threat-trend-config.ts.
  threatTrend: TrendSeriesPoint[];
  top5: OpsTopRow[];
  alerts: SystemStatusAlertItem[];
  agents: SystemStatusAgentStats | null;
  isLoading: boolean;
  // The dashboard fetches all sources in one combined query; if it rejects,
  // every field falls back to 0/[]/null. isError lets cards distinguish
  // "genuinely healthy / empty" from "data failed to load" so the health
  // banner doesn't render a false-green "系统运行正常" on a fetch failure.
  isError: boolean;
}

function severityToLevel(sev: AlertSeverity): SystemStatusAlertLevel {
  if (sev === 'p0' || sev === 'p1') return 'danger';
  if (sev === 'p2') return 'warning';
  return 'info';
}

async function fetchAgentStats(apiRequest: ApiRequestFn): Promise<SystemStatusAgentStats> {
  const [phishing, spoofing, threatRetro] = await Promise.all([
    getDetectionStats({}, apiRequest),
    getSpoofingStats({}, apiRequest),
    getThreatRetroStats({}, apiRequest),
  ]);
  return {
    phishing: { todayDetected: phishing.today_detected, pendingReview: phishing.pending_review },
    spoofing: {
      todayDetected: spoofing.today_detected,
      todayIntercepted: spoofing.today_intercepted,
      pendingReview: spoofing.pending_review,
    },
    threatRetro: {
      recalledToday: threatRetro.range.recall_succeeded,
      inProgress: threatRetro.snapshot.in_progress,
      pendingRecall: threatRetro.snapshot.pending_recall,
    },
  };
}

interface FetchArgs {
  range: SystemStatusRange;
  dates: RangeDates;
  apiRequest: ApiRequestFn;
  isPlatform: boolean;
  aiEnabled: boolean;
}

// GT-12005 / GT-12008: the dashboard used to fetch every source in one
// Promise.all, so a single rejected call took the whole query down and every
// field fell back to 0 / [] / null — the "统计卡片数据全为 0" and "待办面板为空"
// reports. A tenant_admin reliably hits this: /inbound-audit is RequireSystemAdmin
// and 403s, even though /statistics/dashboard and /statistics/security-overview
// happily return that tenant's real data (verified: 200 / 200 / 403).
//
// Auxiliary sources now degrade to a neutral value on failure instead of
// destroying the page. The CORE KPI sources (summary + security-overview) are
// deliberately NOT wrapped: if those are unavailable the dashboard genuinely has
// nothing to show, and the existing isError banner is the honest answer.
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
    // a failing disposal query reports "无待办事项" while quarantined mail is
    // actually queued. Silently-wrong is worse than an honest error banner, so
    // rethrow and let the combined query reject.
    if (err instanceof ApiError && err.status === 403) {
      console.warn(`[dashboard] source "${label}" forbidden for this viewer, degrading`, err);
      return fallback;
    }
    throw err;
  }
}

export async function fetchSystemStatusData(args: FetchArgs): Promise<Omit<SystemStatusData, 'isLoading' | 'isError'>> {
  const { range, dates, apiRequest, isPlatform, aiEnabled } = args;

  const [
    summaryCur,
    summaryPrev,
    securityOverview,
    securityOverviewPrev,
    top5Resp,
    disposal,
    inboundAudit,
    agents,
  ] = await Promise.all([
      getDashboardSummary(dates.startDate, dates.endDate, apiRequest),
      getDashboardSummary(dates.prevStart, dates.prevEnd, apiRequest),
      getSecurityOverview(
        { startDate: dates.startDate, endDate: dates.endDate, interval: dates.interval },
        apiRequest,
      ),
      // Previous equal-length period, so the threat KPI can show a 环比 just like
      // the inbound-total KPI (spec §4.3: both 收信总量 and 拦截威胁数 are
      // frontend-computed period-over-period — review finding 5).
      getSecurityOverview(
        { startDate: dates.prevStart, endDate: dates.prevEnd, interval: dates.interval },
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
      optionalSource(
        getDisposalList({ advanced: PENDING_DISPOSAL_FILTER, page: 1, pageSize: 1 }, apiRequest),
        { items: [], page: 1, page_size: 1, total: 0 },
        'disposal',
      ),
      // 403s for tenant_admin today (RequireSystemAdmin), even though spec §4.6
      // lists 举报待审 as a TENANT-scope source. Kept unconditional so tenants
      // pick it up automatically once the backend authz is relaxed; until then
      // it degrades to 0 instead of blanking the dashboard.
      optionalSource(
        getInboundAuditItems({ status: 'pending', page: 1, page_size: 1 }, apiRequest),
        { items: [], page: 1, page_size: 1, total: 0 },
        'inbound-audit',
      ),
      // Overlay: AI 版 only (spec §4.7) — skip the three agent-stats calls
      // entirely for the traditional form.
      aiEnabled
        ? optionalSource(fetchAgentStats(apiRequest), null, 'agent-stats')
        : Promise.resolve(null),
    ]);

  const inbound = summaryCur.metrics.total_emails;
  const inboundDelta = computeDelta(inbound, summaryPrev.metrics.total_emails);
  // Global Constraint: 拦截威胁数用 blocked，不是 total_filtered.
  const threats = securityOverview.kpi.blocked;
  const threatsDelta = computeDelta(threats, securityOverviewPrev.kpi.blocked);
  const blockRate = securityOverview.kpi.block_rate;
  const pendingIsolated = disposal.total;
  const pendingReport = inboundAudit.total;
  const top5 = top5Resp.rows.slice(0, 5);

  let nodesOnline = 0;
  let nodesTotal = 0;
  const platformAlerts: SystemStatusAlertItem[] = [];

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
  if (agents) {
    if (agents.phishing.pendingReview > 0) {
      tenantAlerts.push({
        id: 'agent-phishing-pending',
        level: 'info',
        scope: 'tenant',
        kind: 'agent_pending',
        href: '/agent-center/overview?agent=phishing',
        agent: 'phishing',
        count: agents.phishing.pendingReview,
      });
    }
    if (agents.spoofing.pendingReview > 0) {
      tenantAlerts.push({
        id: 'agent-spoofing-pending',
        level: 'info',
        scope: 'tenant',
        kind: 'agent_pending',
        href: '/agent-center/overview?agent=spoofing',
        agent: 'spoofing',
        count: agents.spoofing.pendingReview,
      });
    }
    if (agents.threatRetro.pendingRecall > 0) {
      tenantAlerts.push({
        id: 'agent-threat-retro-pending',
        level: 'info',
        scope: 'tenant',
        kind: 'agent_pending',
        href: '/agent-center/overview?agent=threat-retro',
        agent: 'threat-retro',
        count: agents.threatRetro.pendingRecall,
      });
    }
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
    threatTrend: securityOverview.trend?.threat_type ?? [],
    top5,
    alerts: [...platformAlerts, ...tenantAlerts],
    agents,
  };
}

export function useSystemStatusData(range: SystemStatusRange): SystemStatusData {
  const { capabilities } = useProductForm();
  // scopeTenantId: null — this hook never overrides the tenant scope from a
  // page-level selector (unlike security-overview's drill-down), so it
  // always defers to the default resolution (selectedTenantId / viewer).
  const scope = useSecurityScope(null);
  const apiRequest = scope.scopedRequest;
  const isPlatform = scope.effectiveViewer === 'platform';
  const aiEnabled = capabilities?.ai === true;

  const dates = useMemo(() => resolveRangeDates(range), [range]);

  const { data, isLoading, isError } = useQuery({
    queryKey: [
      'system-status',
      range,
      scope.resolvedScopeTenant,
      isPlatform,
      aiEnabled,
      dates.startDate,
      dates.endDate,
    ],
    enabled: scope.scopeResolved,
    queryFn: () => fetchSystemStatusData({ range, dates, apiRequest, isPlatform, aiEnabled }),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

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
    threatTrend: data?.threatTrend ?? [],
    top5: data?.top5 ?? [],
    alerts: data?.alerts ?? [],
    agents: data?.agents ?? null,
    isLoading,
    isError,
  };
}
