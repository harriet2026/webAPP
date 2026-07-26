'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { Info } from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';
import ReactECharts from 'echarts-for-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState, DegradedBanner, TimeoutBanner } from './StateBanners';
import { degradeMessage } from '@/lib/monitoring/degrade';
import {
  useMailflowConnection,
  useMailflowConnectionTrend,
  useMailflowConnectionFailure,
  isTimeoutError,
} from './hooks';
import type { TimeRange, MailflowDirection } from '@/types/monitoring';

interface ConnectionTabProps {
  node: string;
  range: TimeRange;
  direction: MailflowDirection;
}

function StatusBadge({ status, label }: { status: string; label: string }) {
  if (status === 'critical') {
    return (
      <Badge variant="destructive" className="animate-pulse">
        {label}
      </Badge>
    );
  }
  if (status === 'warning') {
    return (
      <Badge className="border-transparent bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300">
        {label}
      </Badge>
    );
  }
  return (
    <Badge className="border-transparent bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300">
      {label}
    </Badge>
  );
}

// ClusterAggregateHint marks a card whose data is a cluster-wide aggregate
// (central-DB / auth source, not per-node) per spec §3.1.
function ClusterAggregateHint({ text }: { text: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger render={<span className="cursor-help text-muted-foreground" />}>
          <Info className="h-3.5 w-3.5" />
        </TooltipTrigger>
        <TooltipContent>{text}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function NullValue({ tooltip }: { tooltip: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={<span className="cursor-help text-2xl font-bold tabular-nums text-muted-foreground" />}
        >
          —
        </TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function ConnectionTab({ node, range, direction }: ConnectionTabProps) {
  const t = useTranslations('mailflow');
  const locale = useLocale();
  const { data: kpiData, isLoading, isError, error, refetch } = useMailflowConnection(node, range, direction);
  const { data: trendData } = useMailflowConnectionTrend(node, range, direction);
  const { data: failureData } = useMailflowConnectionFailure(range, direction);

  const trendOption = useMemo(() => {
    const points = trendData?.points ?? [];
    if (points.length === 0) return null;
    return {
      tooltip: { trigger: 'axis' as const },
      legend: { data: [t('kpi.upstream')], top: 0 },
      grid: { left: 48, right: 16, top: 36, bottom: 32 },
      xAxis: {
        type: 'category' as const,
        data: points.map((p) => p.ts),
        axisLabel: { showMaxLabel: true },
      },
      yAxis: { type: 'value' as const, min: 0 },
      series: [
        {
          name: t('kpi.upstream'),
          type: 'line',
          smooth: true,
          lineStyle: { width: 2 },
          itemStyle: { color: '#3b82f6' },
          data: points.map((p) => p.upstream ?? 0),
        },
      ],
    };
  }, [trendData, t]);

  if (isLoading) {
    return <Skeleton className="h-[600px] w-full rounded-lg" />;
  }

  if (isError && !kpiData) {
    // Cold-start timeout (no cached data yet): timeout banner, not the
    // "collection anomaly" degraded banner (spec §3.6 / review GAP-3).
    if (isTimeoutError(error)) {
      return <TimeoutBanner onRetry={() => refetch()} />;
    }
    return <DegradedBanner message={t('agentOffline')} />;
  }

  const calibratingTip = t('calibrating');
  const kpiCalibrating = kpiData?.kpi.calibrating === true;
  const qualityCalibrating = kpiData?.quality.calibrating === true;
  const trendCalibrating = trendData?.calibrating === true;
  const failureCalibrating = failureData?.calibrating === true;
  const timedOut = isError && isTimeoutError(error);

  const kpi = kpiData?.kpi;
  const quality = kpiData?.quality;
  const reasons = failureData?.reasons ?? [];

  return (
    <div className="space-y-4" data-testid="monitor-mailflow-connection">
      {timedOut && <TimeoutBanner onRetry={() => refetch()} />}
      {kpiData?.degraded && (
        <DegradedBanner message={degradeMessage(kpiData.degraded_code, t)} />
      )}
      {/* Section 1: 5 KPI cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {/* upstream */}
        <Card data-testid="monitor-mailflow-connection-upstream">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('kpi.upstream')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              {kpiCalibrating || kpi?.upstream == null ? (
                <NullValue tooltip={calibratingTip} />
              ) : (
                <span className="text-2xl font-bold tabular-nums">{kpi.upstream}</span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* downstream */}
        <Card data-testid="monitor-mailflow-connection-downstream">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('kpi.downstream')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              {kpiCalibrating || kpi?.downstream == null ? (
                <NullValue tooltip={calibratingTip} />
              ) : (
                <span className="text-2xl font-bold tabular-nums">{kpi.downstream}</span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* stage_diff */}
        <Card data-testid="monitor-mailflow-connection-stage-diff">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('kpi.stageDiff')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {kpiCalibrating || kpi?.stage_diff == null ? (
                  <NullValue tooltip={calibratingTip} />
                ) : (
                  <span className="text-2xl font-bold tabular-nums">{kpi.stage_diff}</span>
                )}
              </div>
              {!kpiCalibrating && kpi?.stage_diff != null && (
                <StatusBadge
                  status={kpi.stage_diff_status ?? 'normal'}
                  label={t(`status.${kpi.stage_diff_status ?? 'normal'}`)}
                />
              )}
            </div>
          </CardContent>
        </Card>

        {/* failed_count */}
        <Card data-testid="monitor-mailflow-connection-failed">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('kpi.failedCount')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                {kpiCalibrating || kpi?.failed_count == null ? (
                  <NullValue tooltip={calibratingTip} />
                ) : (
                  <>
                    <span className="text-2xl font-bold tabular-nums">{kpi.failed_count}</span>
                    {kpi.failed_rate != null && (
                      <div className="text-xs text-muted-foreground tabular-nums">
                        {kpi.failed_rate.toFixed(1)}%
                      </div>
                    )}
                  </>
                )}
              </div>
              {!kpiCalibrating && kpi?.failed_count != null && (
                <StatusBadge
                  status={kpi.failed_status ?? 'normal'}
                  label={t(`status.${kpi.failed_status ?? 'normal'}`)}
                />
              )}
            </div>
          </CardContent>
        </Card>

        {/* avg_resp_ms */}
        <Card data-testid="monitor-mailflow-connection-response">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('kpi.avgRespTime')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                {kpiCalibrating || kpi?.avg_resp_ms == null ? (
                  <NullValue tooltip={calibratingTip} />
                ) : (
                  <span className="text-2xl font-bold tabular-nums">
                    {kpi.avg_resp_ms}
                    <span className="ml-1 text-sm font-normal text-muted-foreground">{t('unit.ms')}</span>
                  </span>
                )}
              </div>
              {!kpiCalibrating && kpi?.avg_resp_ms != null && (
                <StatusBadge
                  status={kpi.resp_status ?? 'normal'}
                  label={t(`status.${kpi.resp_status ?? 'normal'}`)}
                />
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Section 2: Upstream/downstream trend chart */}
      <Card data-testid="monitor-mailflow-connection-trend">
        <CardHeader>
          <CardTitle>{t('charts.connectionTrend')}</CardTitle>
        </CardHeader>
        <CardContent>
          {trendCalibrating || !trendOption ? (
            <EmptyState message={t('calibrating')} />
          ) : (
            <ReactECharts option={trendOption} style={{ height: 300 }} />
          )}
        </CardContent>
      </Card>

      {/* Section 3: Connection quality + failure reasons */}
      <Card data-testid="monitor-mailflow-connection-quality">
        <CardHeader className="flex flex-row items-center gap-2">
          <CardTitle>{t('failureReasons.title')}</CardTitle>
          <ClusterAggregateHint text={t('clusterAggregate')} />
        </CardHeader>
        <CardContent className="space-y-6">
          {qualityCalibrating ? (
            <EmptyState message={t('calibrating')} />
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <div className="text-sm text-muted-foreground">{t('quality.total')}</div>
                <div className="text-2xl font-bold tabular-nums">{quality?.total ?? 0}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">{t('quality.success')}</div>
                <div className="text-2xl font-bold tabular-nums text-green-600 dark:text-green-400">
                  {quality?.success ?? 0}
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">{t('quality.failed')}</div>
                <div className="text-2xl font-bold tabular-nums text-red-600 dark:text-red-400">
                  {quality?.failed ?? 0}
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">{t('quality.failedRate')}</div>
                <div className="text-2xl font-bold tabular-nums">
                  {quality != null ? `${quality.failed_rate.toFixed(1)}%` : '—'}
                </div>
              </div>
            </div>
          )}

          <div>
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-medium text-muted-foreground">
                {t('failureReasons.title')}
              </div>
              {!failureCalibrating && reasons.length > 0 && (
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0"
                  render={<Link href={`/${locale}/logs/auth-attempts?result=failed`} />}
                >
                  {t('tables.viewLogs')}
                </Button>
              )}
            </div>
            {failureCalibrating || reasons.length === 0 ? (
              <EmptyState message={failureCalibrating ? t('calibrating') : t('noData')} />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('failureReasons.reason')}</TableHead>
                      <TableHead className="text-right">{t('failureReasons.count')}</TableHead>
                      <TableHead className="text-right">{t('failureReasons.percent')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reasons.map((r) => (
                    <TableRow key={r.reason} data-testid={`monitor-mailflow-failure-row-${r.reason.replaceAll(/[^\w-]/g, '-')}`}>
                        <TableCell className="font-medium">{r.reason}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.count}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.percent.toFixed(1)}%
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
