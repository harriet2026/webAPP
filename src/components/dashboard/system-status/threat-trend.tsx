'use client';

// 威胁态势趋势 (threat-posture trend) card — aligned to the demo prototype's
// "威胁态势趋势" (design/origin/demo html_spec §2.4): five threat classes
// (钓鱼/仿冒/垃圾/病毒/恶意链接) with a click-to-toggle legend. Multi-bucket
// ranges use a stacked-area chart; the single "today" bucket uses a stacked
// bar so its non-zero values remain visible. Data is
// `securityOverview.trend.threat_type` (TrendSeriesPoint[], one bucket per
// point carrying a count per threat-type key), surfaced by hooks.ts as
// `SystemStatusData.threatTrend`.
//
// Built with `echarts-for-react` (the house chart lib) rather than recharts,
// which is not a project dependency — same stacked-line + areaStyle technique
// the other dashboards use. Colors come from the domain threat palette
// (threat-trend-config.ts / DESIGN.md `colors.threat-*`).
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import ReactECharts from 'echarts-for-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { InteractiveSurface } from '@/components/ui/interactive-surface';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from '@/i18n/navigation';
import { ChevronRight } from 'lucide-react';
import type { TrendSeriesPoint } from '@/lib/api/security-overview';
import { buildThreatTrendOption, THREAT_TREND_SERIES } from './threat-trend-config';

interface ThreatTrendProps {
  trend: TrendSeriesPoint[];
  isLoading: boolean;
}

export function ThreatTrend({ trend, isLoading }: ThreatTrendProps) {
  const t = useTranslations('systemStatus.trend');
  const tSeries = useTranslations('systemStatus.trend.series');
  // All five series shown by default (demo shows the full stack initially).
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());

  const points = trend;

  const toggle = (key: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const option = useMemo(() => {
    return buildThreatTrendOption(
      points,
      hidden,
      (key) => tSeries(key as Parameters<typeof tSeries>[0]),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, hidden]);

  return (
    <Card
      className="overflow-visible rounded-xl border-border bg-card shadow-sm backdrop-blur-none lg:col-span-2"
      data-testid="system-status-trend-card"
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 rounded-t-xl pb-2">
        <CardTitle className="text-base">{t('title')}</CardTitle>
        <InteractiveSurface asChild variant="text">
          <Link
            href="/statistics/security-overview"
            className="flex items-center text-sm font-medium text-primary"
            data-testid="system-status-trend-view-overview"
          >
            {t('viewOverview')}
            <ChevronRight className="h-4 w-4" />
          </Link>
        </InteractiveSurface>
      </CardHeader>
      <CardContent>
        {points.length > 0 && (
          <div
            className="mb-5 flex flex-wrap gap-3"
            data-testid="system-status-trend-legend"
          >
            {THREAT_TREND_SERIES.map((s) => (
              <InteractiveSurface key={s.key} asChild variant="control">
                <button
                  type="button"
                  onClick={() => toggle(s.key)}
                  data-testid={`system-status-trend-legend-${s.key}`}
                  aria-pressed={!hidden.has(s.key)}
                  className={`flex items-center gap-1.5 px-2 py-1.5 text-xs transition-opacity duration-[180ms] motion-reduce:transition-none ${hidden.has(s.key) ? 'opacity-40' : 'opacity-100'}`}
                >
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: s.color }} />
                  <span>{tSeries(s.key as Parameters<typeof tSeries>[0])}</span>
                </button>
              </InteractiveSurface>
            ))}
          </div>
        )}

        {isLoading ? (
          <Skeleton className="h-[320px] w-full rounded-lg" />
        ) : option ? (
          <ReactECharts
            option={option}
            style={{ height: 320, width: '100%' }}
            notMerge
            data-render-mode={points.length === 1 ? 'single-bucket-bar' : 'trend-area'}
            data-testid="system-status-trend-chart"
          />
        ) : (
          <div
            className="flex h-[320px] items-center justify-center text-muted-foreground"
            data-testid="system-status-trend-empty"
          >
            {t('empty')}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
