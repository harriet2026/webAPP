'use client';

// System & service health card — aligned to the demo prototype's "系统与服务
// 健康" (html_spec §2.8). Platform-only (parent gates on `showInfra`, the same
// `resolve('monitor-infrastructure')` flag as the node KPI card).
//
// Antivirus names and versions come from current, read-only AV server queries.
// License and the anti-spam rule library remain nullable until their authorities
// are connected.
//
// The License row is display-only: the demo links it to `/admin/license`, but
// the webapp has no authorization/license page yet, so a link there would 404.
import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { Activity, ChevronDown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@/components/ui/popover';
import { useSecurityScope } from '@/components/statistics/security-overview/hooks/useSecurityScope';
import type { AVStatusResponse } from '@/types/attachment-security';
import { getAntivirusStatus } from '@/lib/api/attachment-security';
import { DashboardCardFooterLink } from './dashboard-card-footer-link';

// Shape of GET /system/health-summary (see mock/fixtures.ts mockSystemHealthSummary).
interface SystemHealthSummary {
  license_days: number | null;
  rule_version: string | null;
  rule_latest: boolean;
  av_vendor: string | null;
  av_expire: string | null;
  antivirus?: AVStatusResponse | null;
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
  dotTestId,
  dotLevel,
  testId,
}: {
  label: string;
  value: ReactNode;
  dotClass?: string;
  dotTestId?: string;
  dotLevel?: 'normal' | 'warning' | 'danger' | 'unknown';
  testId: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5 text-sm" data-testid={testId}>
      <span className="flex shrink-0 items-center gap-2 text-muted-foreground">
        {dotClass && <span className={`h-2 w-2 rounded-full ${dotClass}`} data-testid={dotTestId} data-level={dotLevel} />}
        {label}
      </span>
      <div className="flex min-w-0 items-center gap-2 font-medium">{value}</div>
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

/** Semantic counterpart of licenseDot: stable for UI, a11y and QC consumers. */
function licenseLevel(days: number | null | undefined): 'normal' | 'warning' | 'danger' | 'unknown' {
  if (days == null) return 'unknown';
  if (days > 30) return 'normal';
  if (days >= 7) return 'warning';
  return 'danger';
}

export function SystemHealthCard({ nodesOnline, nodesTotal, nodesDegraded, isLoading }: SystemHealthCardProps) {
  const t = useTranslations('systemStatus.systemHealth');
  const { scopedRequest } = useSecurityScope(null);

  // The summary includes current AV metadata; nullable fields stay unknown.
  const { data: health } = useQuery({
    queryKey: ['system-status', 'health-summary'],
    queryFn: () => scopedRequest<SystemHealthSummary>('/system/health-summary'),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    // Don't retry this best-effort summary, and DON'T let it gate
    // the card's skeleton below — the License/规则库 rows fall back to 待接入
    // immediately, so the card must not wait on it.
    retry: 0,
  });

  // Keep the direct status fallback for independently upgraded apiservers.
  const { data: avStatus, isLoading: avLoading } = useQuery({
    queryKey: ['system-status', 'av-status'],
    queryFn: () => getAntivirusStatus(scopedRequest),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const allOnline = nodesTotal > 0 && nodesOnline === nodesTotal;
  // Gate the skeleton on the core dashboard data + the real AV status only.
  // The demo/aggregate health-summary is best-effort and
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
  const antivirus = health?.antivirus ?? avStatus;
  const avValue = <AntivirusHealthValue status={antivirus} vendor={health?.av_vendor} />;

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
              dotTestId="system-status-health-license-dot"
              dotLevel={licenseLevel(health?.license_days)}
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
              dotClass={antivirus?.configured ? (antivirus.metadata_status === 'collected' ? 'bg-emerald-500' : 'bg-amber-500') : 'bg-slate-400'}
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


/** Keep the dashboard compact; independently collected versions stay in the details. */
export function AntivirusHealthValue({ status, vendor }: {
  status?: AVStatusResponse | null;
  vendor?: string | null;
}) {
  const t = useTranslations('systemStatus.systemHealth');
  if (status?.configured === false) return <>{t('notConfigured')}</>;

  const engines = status?.engines ?? [];
  const names = [...new Set(engines.map(engine => engine.engine).filter(Boolean))];
  const failed = status?.metadata_status === 'collection_error' || (!status && !vendor);
  if (failed) return <span className="text-amber-700 dark:text-amber-400">{t('avQueryFailedShort')}</span>;
  if (!engines.length) return <>{vendor || `${t('configured')} · ${t('avUnknown')}`}</>;

  const partial = status?.metadata_status === 'partial';
  const summary = partial ? t('avPartial') : names[0] || vendor || t('configured');

  return (
    <Popover>
      <PopoverTrigger
        data-testid="system-status-health-av-trigger"
        aria-label={`${t('avDetails')} · ${summary}`}
        className={`group inline-flex min-w-0 items-center gap-1.5 rounded-sm text-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring ${partial ? 'text-amber-700 dark:text-amber-400' : ''}`}
      >
        <span className="truncate">{summary}</span>
        {!partial && names.length > 1 && <span className="shrink-0 text-xs text-muted-foreground">+{names.length - 1}</span>}
        <ChevronDown aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-popup-open:rotate-180" />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-80 max-w-[calc(100vw-2rem)] gap-0 p-0"
        data-testid="system-status-health-av-details"
      >
        <div className="border-b px-4 py-3">
          <PopoverTitle>{t('avDetails')}</PopoverTitle>
        </div>
        <div className="max-h-[min(24rem,50vh)] overflow-y-auto overscroll-contain px-4">
          {engines.map((engine, index) => (
            <div className="space-y-2.5 border-b py-3 last:border-0" key={`${engine.server}-${engine.engine_type}-${index}`}>
              <div className="flex items-center gap-2 font-medium">
                <span className={`size-1.5 shrink-0 rounded-full ${engine.engine_status === 'collected' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                <span className="min-w-0 break-words">{engine.engine || (engine.engine_status === 'collection_error' ? t('avQueryFailedShort') : t('avUnknown'))}</span>
              </div>
              <dl className="space-y-2 text-xs">
                {engine.engine_type >= 0 && <>
                  <AntivirusDetail label={t('avEngineLabel')} value={engine.version || t('avUnknown')} />
                  <AntivirusDetail label={t('avDatabaseLabel')} value={engine.database_version || t('avUnknown')} />
                </>}
              </dl>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function AntivirusDetail({ label, value }: { label: string; value: string }) {
  return <div className="flex items-start justify-between gap-4">
    <dt className="shrink-0 text-muted-foreground">{label}</dt>
    <dd className="min-w-0 break-all text-right font-mono tabular-nums">{value}</dd>
  </div>;
}
