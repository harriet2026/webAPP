'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { format, subDays, startOfMonth, endOfMonth, subMonths, startOfDay, endOfDay } from 'date-fns';
import { PageHeader, PageShell } from '@/components/shared/page-shell';
import { AlertTriangle, ExternalLink, Link2 } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FilterBar } from './FilterBar';
import { KpiCards } from './KpiCards';
import { ViewSwitcher } from './ViewSwitcher';
import { ChartTypeToggle } from './ChartTypeToggle';
import { TrendChartCard } from './TrendChartCard';
import { LinkSidePanel } from './LinkSidePanel';
import { AttachmentSidePanel } from './AttachmentSidePanel';
import { DetailTable } from './DetailTable';
import { BottomActions } from './BottomActions';
import { useLinkAttachmentStats } from './hooks/useLinkAttachmentStats';
import { useTenant } from '@/hooks/use-tenant';
import { useSecurityScope } from '@/components/statistics/security-overview/hooks/useSecurityScope';
import type { Direction, TimeRange } from '@/lib/api/link-attachment-security';

function timeRangeToDates(timeRange: TimeRange): { startDate: string; endDate: string } {
  const now = new Date();

  switch (timeRange) {
    case 'today':
      return {
        startDate: format(startOfDay(now), 'yyyy-MM-dd'),
        endDate: format(endOfDay(now), 'yyyy-MM-dd'),
      };
    case '7d':
      return {
        startDate: format(subDays(now, 6), 'yyyy-MM-dd'),
        endDate: format(now, 'yyyy-MM-dd'),
      };
    case '30d':
      return {
        startDate: format(subDays(now, 29), 'yyyy-MM-dd'),
        endDate: format(now, 'yyyy-MM-dd'),
      };
    case 'this_month':
      return {
        startDate: format(startOfMonth(now), 'yyyy-MM-dd'),
        endDate: format(now, 'yyyy-MM-dd'),
      };
    case 'last_month': {
      const last = subMonths(now, 1);
      return {
        startDate: format(startOfMonth(last), 'yyyy-MM-dd'),
        endDate: format(endOfMonth(last), 'yyyy-MM-dd'),
      };
    }
    default:
      return {
        startDate: format(subDays(now, 6), 'yyyy-MM-dd'),
        endDate: format(now, 'yyyy-MM-dd'),
      };
  }
}

export function LinkAttachmentSecurityPage() {
  const t = useTranslations('linkAttachmentSecurity');
  const locale = useLocale();
  const router = useRouter();

  const [direction, setDirection] = useState<Direction>('all');
  const [timeRange, setTimeRange] = useState<TimeRange>('7d');
  // F1 / spec §4.5: viewTab + chartType persisted to localStorage (user preference).
  // Initialize to the SSR-safe defaults and hydrate from localStorage in a
  // post-mount effect — reading localStorage in the useState initializer would
  // diverge from the server-rendered HTML and cause a hydration mismatch.
  const [viewTab, setViewTab] = useState<'link' | 'attachment'>('link');
  const [chartType, setChartType] = useState<'line' | 'area'>('line');
  const hydrated = useRef(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const v = window.localStorage.getItem('las_view_tab');
      if (v === 'attachment') setViewTab('attachment');
      const c = window.localStorage.getItem('las_chart_type');
      if (c === 'area') setChartType('area');
      hydrated.current = true;
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (hydrated.current) window.localStorage.setItem('las_view_tab', viewTab);
  }, [viewTab]);
  useEffect(() => {
    if (hydrated.current) window.localStorage.setItem('las_chart_type', chartType);
  }, [chartType]);

  const { startDate, endDate } = useMemo(() => timeRangeToDates(timeRange), [timeRange]);

  const { selectedTenantId } = useTenant();
  const { scopeActive } = useSecurityScope(selectedTenantId);

  const { data, isLoading } = useLinkAttachmentStats({
    startDate,
    endDate,
    direction,
  });

  return (
    <PageShell
      className="min-h-full bg-[#F8F9FB] shadow-[0_0_0_32px_#F8F9FB] dark:bg-background dark:shadow-[0_0_0_32px_var(--background)]"
    >
      <PageHeader
        title={
          <span className="inline-flex items-center gap-2">
            <Link2 className="h-6 w-6" />
            {t('title')}
          </span>
        }
        description={t('subtitle')}
      />

      <div className="mx-auto w-full max-w-[1072px] space-y-6">
        <FilterBar
          direction={direction}
          onDirectionChange={setDirection}
          timeRange={timeRange}
          onTimeRangeChange={setTimeRange}
          showTenant={scopeActive}
        />

        <KpiCards
          data={data?.kpi}
          isLoading={isLoading}
          onCardClick={(tab) => setViewTab(tab)}
        />

        <Card className="min-h-[818px]" data-testid="link-attachment-analysis-card">
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <ViewSwitcher value={viewTab} onChange={setViewTab} />
              <ChartTypeToggle value={chartType} onChange={setChartType} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
              <div className="xl:col-span-3">
                <TrendChartCard
                  trendLink={data?.trend?.link}
                  trendAttachment={data?.trend?.attachment}
                  viewTab={viewTab}
                  chartType={chartType}
                  isLoading={isLoading}
                  embedded
                />
              </div>
              <div className="xl:col-span-2">
                {viewTab === 'link' ? (
                  <LinkSidePanel
                    typeDistribution={data?.link_distributions?.type}
                    reputationDistribution={data?.link_distributions?.reputation}
                    isLoading={isLoading}
                    startDate={startDate}
                    endDate={endDate}
                    direction={direction}
                  />
                ) : (
                  <AttachmentSidePanel
                    typeDistribution={data?.attachment_distributions?.type}
                    threatTypeDistribution={data?.attachment_distributions?.threat_type}
                    isLoading={isLoading}
                    startDate={startDate}
                    endDate={endDate}
                    direction={direction}
                  />
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {(data?.sandbox_async_malicious_count ?? 0) > 0 && (
          <div
            className="flex flex-wrap items-center justify-between gap-3 rounded-r-lg border-l-4 border-amber-500 bg-amber-50 p-4 dark:bg-amber-950/30"
            data-testid="sandbox-async-alert"
          >
            <div className="flex items-center gap-3 text-amber-800 dark:text-amber-200">
              <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
              <span>{t('sandboxAsyncAlert', { count: data?.sandbox_async_malicious_count ?? 0 })}</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push(`/${locale}/logs/email?sandbox_verdict=malicious`)}
            >
              <ExternalLink className="h-4 w-4" />
              {t('viewDetails')}
            </Button>
          </div>
        )}

        <DetailTable
          linkRows={data?.detail_table?.link}
          attachmentRows={data?.detail_table?.attachment}
          viewTab={viewTab}
          isLoading={isLoading}
        />

        <BottomActions
          startDate={startDate}
          endDate={endDate}
          direction={direction}
        />
      </div>
    </PageShell>
  );
}
