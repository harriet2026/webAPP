'use client';

// System-status core KPI cards (Plan Task 6, spec §4.11.1).
//
// Four clickable cards: inbound total / threats blocked / pending disposal /
// nodes online. Routes follow the plan's Global Constraints demo->real route
// mapping table (spec §4.11.7). The node card is platform-only — it reads
// `/monitor/nodes` data (via hooks.ts, already gated there) and must not be
// rendered for tenant viewers, so it is only shown when `showInfra` is true
// (the same `resolve('monitor-infrastructure')`-derived flag Task 5 produces
// for the whole page — this component does not recompute visibility itself).
import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import {
  Inbox,
  ShieldX,
  ClipboardList,
  Server,
  ArrowUpRight,
  ArrowDownRight,
  ChevronRight,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { InteractiveSurface } from '@/components/ui/interactive-surface';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from '@/i18n/navigation';
import type { SystemStatusData } from './hooks';

interface KpiCardsProps {
  data: SystemStatusData;
  showInfra: boolean;
}

interface KpiCardSpec {
  key: string;
  icon: LucideIcon;
  href: string;
  /** footer CTA label (i18n key under systemStatus.kpi.cta.*). */
  ctaKey: string;
  value: ReactNode;
  sub?: ReactNode;
  badge?: ReactNode;
}

export function KpiCards({ data, showInfra }: KpiCardsProps) {
  const t = useTranslations('systemStatus.kpi');
  const { isLoading } = data;

  // 环比 format matches the demo: integer, magnitude only (direction is the
  // arrow), rendered as "{n}% 环比".
  const deltaPositive = data.inboundDelta >= 0;
  const deltaStr = `${Math.abs(Math.round(data.inboundDelta))}%`;
  const allOnline = data.nodesTotal > 0 && data.nodesOnline === data.nodesTotal;
  const nOffline = Math.max(data.nodesTotal - data.nodesOnline, 0);

  const cards: KpiCardSpec[] = [
    {
      key: 'inbound',
      icon: Inbox,
      href: '/statistics/delivery-traffic',
      ctaKey: 'inbound',
      value: data.inbound.toLocaleString(),
      sub: (
        <span
          className={`flex items-center gap-0.5 tabular-nums ${
            deltaPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
          }`}
        >
          {deltaPositive ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
          {deltaStr} {t('ratio')}
        </span>
      ),
    },
    {
      key: 'threats',
      icon: ShieldX,
      href: '/statistics/security-overview',
      ctaKey: 'threats',
      value: data.threats.toLocaleString(),
      // Demo shows the block rate only (no threat 环比) — and unrounded (0.96%,
      // not 1.0%).
      sub: (
        <>
          {t('blockRate')} {data.blockRate.toFixed(2)}%
        </>
      ),
    },
    {
      key: 'pending',
      icon: ClipboardList,
      // GT-12608：带 view=pending 深链，落地页应用与本卡同口径的待处置筛选。
      // 本卡口径与「邮件处置中心」严格一致，仅统计处置中心待处置（pendingIsolated）；
      // 不再合并举报待审（pendingReport 仅用于「待办事项」告警列表，属其他模块，保持不变）。
      href: '/email-disposal/center?view=pending',
      ctaKey: 'pending',
      value: data.pendingIsolated.toLocaleString(),
      badge:
        data.pendingIsolated > 0 ? (
          <Badge
            data-testid="system-status-kpi-badge-pending"
            className="rounded-md bg-warning-soft text-warning"
          >
            {t('attention')}
          </Badge>
        ) : undefined,
    },
  ];

  if (showInfra) {
    cards.push({
      key: 'nodes',
      icon: Server,
      href: '/monitoring/infrastructure',
      ctaKey: 'nodes',
      // GT-12549: 节点数据源降级（TSDB 不可用/指标未初始化）时如实展示
      // "数据源不可用"，不渲染伪 0/0。
      value: data.nodesDegraded ? '--' : `${data.nodesOnline}/${data.nodesTotal}`,
      sub: <>{data.nodesDegraded ? t('nodesUnavailable') : allOnline ? t('nodesNormal') : t('nodesIssue')}</>,
      badge: (
        <Badge
          data-testid="system-status-kpi-badge-nodes"
          className={
            data.nodesDegraded
              ? 'rounded-md bg-warning-soft text-warning'
              : allOnline
              ? 'rounded-md bg-success/10 text-success'
              : 'rounded-md bg-danger-soft text-danger'
          }
        >
          {data.nodesDegraded ? t('nodesUnavailable') : allOnline ? t('allOnline') : t('nOffline', { n: nOffline })}
        </Badge>
      ),
    });
  }

  const gridCols = showInfra ? 'sm:grid-cols-2 xl:grid-cols-4' : 'sm:grid-cols-2 xl:grid-cols-3';

  return (
    <div className={`grid grid-cols-1 gap-4 ${gridCols}`} data-testid="system-status-kpi-grid">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <InteractiveSurface key={card.key} asChild variant="card">
            <Link
              href={card.href}
              className="block h-full"
              data-testid={`system-status-kpi-card-${card.key}`}
            >
              <Card
                className={[
                  'h-full gap-6 rounded-xl border-border bg-card py-6 shadow-sm backdrop-blur-none',
                  'transition-[background-color,border-color,box-shadow] duration-[240ms]',
                  'ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
                  'group-data-[hovered=true]/interactive:border-foreground/15',
                  'group-data-[hovered=true]/interactive:bg-muted/[0.15]',
                  'group-data-[hovered=true]/interactive:shadow-md',
                ].join(' ')}
              >
                {/* The demo is one uninterrupted content block; there is no footer
                    band or divider between the metric and its CTA. */}
                <CardContent className="p-5">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Icon className="h-4 w-4 transition-colors duration-[240ms] group-data-[hovered=true]/interactive:text-primary motion-reduce:transition-none" />
                    {t(card.key)}
                  </div>
                  {isLoading ? (
                    <Skeleton className="mt-3 h-9 w-24" />
                  ) : (
                    <div
                      className={`mt-3 ${card.badge ? 'flex items-center gap-2' : 'text-3xl font-bold tracking-tight'}`}
                    >
                      {card.badge ? (
                        <>
                          <span className="text-3xl font-bold tracking-tight">{card.value}</span>
                          {card.badge}
                        </>
                      ) : (
                        card.value
                      )}
                    </div>
                  )}
                  {isLoading ? (
                    <Skeleton className="mt-1 h-5 w-32" />
                  ) : (
                    <div className="mt-1 flex min-h-5 items-center text-sm text-muted-foreground">{card.sub}</div>
                  )}
                  <span
                    className="mt-3 flex items-center text-sm font-medium text-primary underline-offset-4 decoration-transparent transition-[text-decoration-color] duration-[120ms] group-data-[hovered=true]/interactive:underline group-data-[hovered=true]/interactive:decoration-current motion-reduce:transition-none"
                    data-testid={`system-status-kpi-cta-${card.key}`}
                  >
                    {t(`cta.${card.ctaKey}`)}
                    <ChevronRight className="h-4 w-4" />
                  </span>
                </CardContent>
              </Card>
            </Link>
          </InteractiveSurface>
        );
      })}
    </div>
  );
}
