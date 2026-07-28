'use client';

// System & service health card — aligned to the demo prototype's "系统与服务
// 健康" (html_spec §2.8). Platform-only (parent gates on `showInfra`, the same
// `resolve('monitor-infrastructure')` flag as the node KPI card).
//
// Rows: node online/total (real, from hooks.ts's `/monitor/nodes`), core
// service (fixed 正常 — no backend health-check signal), and License days /
// rule-lib version+latest / antivirus vendor+expiry from a single
// `GET /system/health-summary` summary. That endpoint has no real gateway
// backend yet (License 天数 / 规则库版本 / 反病毒厂商 are 待接入); in Mock mode
// the mock layer serves the demo values, and in production it falls to the
// dispatcher's empty shell → the fields render their `待接入` fallbacks. This
// keeps the component data-driven (demo-parity in Mock mode) without baking
// fabricated values into the production render path.
//
// The License row is display-only: the demo links it to `/admin/license`, but
// the webapp has no authorization/license page yet, so a link there would 404.
import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { Activity } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useSecurityScope } from '@/components/statistics/security-overview/hooks/useSecurityScope';
import { getAntivirusStatus } from '@/lib/api/attachment-security';
import { DashboardCardFooterLink } from './dashboard-card-footer-link';

// Shape of GET /system/health-summary (see mock/fixtures.ts mockSystemHealthSummary).
interface SystemHealthSummary {
  license_days: number | null;
  rule_version: string | null;
  rule_latest: boolean;
  av_vendor: string | null;
  av_expire: string | null;
}

interface SystemHealthCardProps {
  nodesOnline: number;
  nodesTotal: number;
  nodesDegraded?: boolean;
  isLoading: boolean;
}

function Row({
  label,
  value,
  dotClass,
  testId,
}: {
  label: string;
  value: ReactNode;
  dotClass?: string;
  testId: string;
}) {
  return (
    <div className="flex items-center justify-between py-1.5 text-sm" data-testid={testId}>
      <span className="flex items-center gap-2 text-muted-foreground">
        {dotClass && <span className={`h-2 w-2 rounded-full ${dotClass}`} />}
        {label}
      </span>
      <span className="flex items-center gap-2 font-medium">{value}</span>
    </div>
  );
}

/** License-days threshold dot: >30 green, 7–30 amber, <7 red (demo §2.8). */
function licenseDot(days: number | null | undefined): string {
  if (days == null) return 'bg-slate-400';
  if (days > 30) return 'bg-emerald-500';
  if (days >= 7) return 'bg-amber-500';
  return 'bg-rose-500';
}

export function SystemHealthCard({ nodesOnline, nodesTotal, nodesDegraded, isLoading }: SystemHealthCardProps) {
  const t = useTranslations('systemStatus.systemHealth');
  const { scopedRequest } = useSecurityScope(null);

  // Aggregate demo/summary source: License 天数 / 规则库版本 / 反病毒厂商+到期。
  // No real gateway backend yet — 404s in production, where the mock is off, so
  // these rows fall back to their `待接入` placeholders (License / 规则库 have no
  // real source at all). Served with demo values only in Mock mode.
  const { data: health } = useQuery({
    queryKey: ['system-status', 'health-summary'],
    queryFn: () => scopedRequest<SystemHealthSummary>('/system/health-summary'),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    // No real backend yet → 404 in production. Don't retry the expected 404
    // (it only prolongs the query), and DON'T let this best-effort summary gate
    // the card's skeleton below — the License/规则库 rows fall back to 待接入
    // immediately, so the card must not wait on it.
    retry: 0,
  });

  // Real antivirus status (GET /attachment-security/antivirus/status) — this
  // endpoint DOES exist in production. In Mock mode the health-summary above
  // supplies the demo vendor+expiry; in production the 反病毒 row falls back to
  // this real `configured` signal instead of a blanket 待接入.
  const { data: avStatus, isLoading: avLoading } = useQuery({
    queryKey: ['system-status', 'av-status'],
    queryFn: () => getAntivirusStatus(scopedRequest),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const allOnline = nodesTotal > 0 && nodesOnline === nodesTotal;
  // Gate the skeleton on the core dashboard data + the real AV status only.
  // The demo/aggregate health-summary is best-effort (404 in production) and
  // must never keep the card in a skeleton — its rows fall back to 待接入.
  const loading = isLoading || avLoading;

  const licenseValue =
    health?.license_days != null ? t('licenseDays', { n: health.license_days }) : t('na');
  const ruleValue: ReactNode =
    health?.rule_version != null ? (
      <>
        {health.rule_version}
        {health.rule_latest && (
          <Badge
            variant="outline"
            data-testid="system-status-health-rule-latest"
            className="border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:text-emerald-400"
          >
            {t('ruleLatest')}
          </Badge>
        )}
      </>
    ) : (
      t('na')
    );
  // Mock mode: demo vendor + expiry ("ClamAV / 2026-07-01 到期"). Production:
  // the real configured/not-configured status (vendor+expiry has no backend yet
  // → 待接入 suffix on "已配置").
  const avValue =
    health?.av_vendor != null && health?.av_expire != null
      ? t('avExpire', { vendor: health.av_vendor, date: health.av_expire })
      : avStatus?.configured
        ? `${t('configured')} · ${t('na')}`
        : t('notConfigured');

  return (
    <Card className="overflow-hidden" data-testid="system-status-health-card">
      <CardHeader className="flex flex-row items-center gap-2">
        <Activity className="h-4 w-4 text-muted-foreground" />
        <CardTitle>{t('title')}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {/* GT-12549: 数据源降级时如实展示不可用，不渲染伪 0/0 */}
            <Row
              testId="system-status-health-node"
              label={t('node')}
              value={nodesDegraded ? t('na') : `${nodesOnline}/${nodesTotal}`}
              dotClass={nodesDegraded ? 'bg-amber-500' : allOnline ? 'bg-emerald-500' : 'bg-rose-500'}
            />
            <Row
              testId="system-status-health-core"
              label={t('coreService')}
              value={t('normal')}
              dotClass="bg-emerald-500"
            />
            <Row
              testId="system-status-health-license"
              label={t('license')}
              value={licenseValue}
              dotClass={licenseDot(health?.license_days)}
            />
            <Row
              testId="system-status-health-rulelib"
              label={t('ruleLib')}
              value={ruleValue}
              dotClass="bg-emerald-500"
            />
            <Row
              testId="system-status-health-antivirus"
              label={t('antivirus')}
              value={avValue}
              dotClass="bg-emerald-500"
            />
          </div>
        )}
      </CardContent>
      <CardFooter>
        <DashboardCardFooterLink
          href="/monitoring/infrastructure"
          testId="system-status-health-enter"
        >
          {t('enter')}
        </DashboardCardFooterLink>
      </CardFooter>
    </Card>
  );
}
