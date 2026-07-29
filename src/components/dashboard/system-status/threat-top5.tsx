'use client';

// Threat source TOP5 card (Plan Task 6, spec §4.8 / §4.11.5).
//
// Data comes from hooks.ts's `fetchOpsTop({ dimension: 'sender', ... })`,
// already sliced to the top 5 rows. The "hits" count uses `metrics.threatCount`
// (not `sendCount`) because this card is specifically "威胁来源" (threat
// source) ranking, not overall send-volume ranking — `threatCount` is the
// sender dimension's threat-hit column (see
// `ops-top-trend/columns.ts`'s `sender` column list).
import { useTranslations } from 'next-intl';
import { Globe } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { OpsTopRow } from '@/lib/api/ops-top';
import { DashboardCardFooterLink } from './dashboard-card-footer-link';

interface ThreatTop5Props {
  top5: OpsTopRow[];
  isLoading: boolean;
  // GT-12613：查看完整榜单深链需携带与本卡取数一致的时间范围。
  range: string;
}

const RANK_CLASS = ['bg-rose-500 text-white', 'bg-amber-500 text-white', 'bg-muted text-muted-foreground', 'bg-muted text-muted-foreground', 'bg-muted text-muted-foreground'];

function hitsOf(row: OpsTopRow): number {
  const v = row.metrics.threatCount;
  return typeof v === 'number' ? v : Number(v ?? 0) || 0;
}

export function ThreatTop5({ top5, isLoading, range }: ThreatTop5Props) {
  const t = useTranslations('systemStatus.top5');
  // Reuses the trend card's generic "no data" copy rather than adding a
  // near-duplicate `top5.empty` key — both cards need the same "empty
  // dataset" message and Task 1 already established `trend.empty` for it.
  const tEmpty = useTranslations('systemStatus.trend');

  const max = Math.max(...top5.map(hitsOf), 1);

  return (
    <Card className="overflow-hidden" data-testid="system-status-top5-card">
      <CardHeader className="flex flex-row items-center gap-2">
        <Globe className="h-4 w-4 text-muted-foreground" />
        <CardTitle>{t('title')}</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : top5.length === 0 ? (
          <div className="flex h-24 items-center justify-center text-muted-foreground">{tEmpty('empty')}</div>
        ) : (
          <ul className="space-y-2.5" data-testid="system-status-top5-list">
            {top5.map((row, i) => {
              const hits = hitsOf(row);
              return (
                <li key={row.key} data-testid={`system-status-top5-row-${row.key}`}>
                  <div className="flex items-center gap-2">
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded text-[11px] font-semibold ${RANK_CLASS[i] ?? RANK_CLASS[4]}`}
                    >
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-mono text-sm" title={row.name}>
                      {row.name}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{t('hits', { n: hits })}</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-muted">
                    <div
                      className="h-1.5 rounded-full bg-primary"
                      style={{ width: `${(hits / max) * 100}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
      <CardFooter>
        <DashboardCardFooterLink
          // GT-12613：携带与本卡取数(fetchOpsTop dimension=sender&direction=all
          // &sort=threat)一致的维度上下文，落地页保持"威胁来源/发信人"语义，
          // 不再落回默认 connection（租户视角还会被降级为 subject 高危主题）。
          href={`/statistics/ops-top-trend?dimension=sender&direction=all&time_range=${range}`}
          testId="system-status-top5-view-full"
        >
          {t('viewFull')}
        </DashboardCardFooterLink>
      </CardFooter>
    </Card>
  );
}
