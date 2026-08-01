'use client';

// System-status dashboard — top-level assembly (Plan Task 7, spec §1/§4.11.8).
//
// Composes the header (time-range selector + refresh) with the seven
// sub-cards Task 6 built, wiring Task 4's `useSystemStatusData(range)` and
// Task 5's `useSystemStatusVisibility()`. This component owns exactly one
// piece of state — the range selector — and does no data-shaping itself;
// every card receives already-resolved data/visibility props.
//
// Layout follows spec §4.11.8's three tiers:
//   1. Health banner (full width) + KPI grid (self-collapsing, see
//      kpi-cards.tsx's own `showInfra`-derived column count — this component
//      does not re-derive that grid).
//   2. "第二屏": trend (xl:col-span-2) + todo-alerts, `xl:grid-cols-3`.
//      The xl breakpoint keeps the row stacked while the 256px sidebar leaves
//      too little real page-body width for three useful columns.
//   3. Bottom overview (§6/§7/§8): agent-overview (AI only) + threat-top5 +
//      system-health-card (platform/infra only), `lg:grid-cols-${overviewCols}`
//      from Task 5's `deriveVisibility` (3 when infra visible, 2 otherwise).
//
// The refresh button invalidates the exact React Query key `hooks.ts` uses
// (`['system-status', ...]`) — matching the established house pattern in
// `monitoring/infrastructure/ControlBar.tsx` (spin the icon ~600ms while the
// invalidate/refetch is in flight).
import { useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import {
  PageHeaderActionButton,
  PageHeaderSelectTrigger,
} from '@/components/shared/page-header-controls';
import { PageShell, PageHeader } from '@/components/shared/page-shell';
import { Select, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import { Activity } from 'lucide-react';
import { useSystemStatusData, type SystemStatusRange } from './hooks';
import { useSystemStatusVisibility, overviewGridClass } from './visibility';
import { HealthBanner } from './health-banner';
import { KpiCards } from './kpi-cards';
import { ThreatTrend } from './threat-trend';
import { TodoAlerts } from './todo-alerts';
import { AgentOverview } from './agent-overview';
import { ThreatTop5 } from './threat-top5';
import { SystemHealthCard } from './system-health-card';

const RANGES: SystemStatusRange[] = ['24h', 'today', '7d', '30d'];

export function SystemStatusDashboard() {
  const t = useTranslations('systemStatus');
  const tRange = useTranslations('systemStatus.range');
  const queryClient = useQueryClient();

  const [range, setRange] = useState<SystemStatusRange>('24h');
  const [spinning, setSpinning] = useState(false);

  const data = useSystemStatusData(range);
  const { showAgents, showInfra, overviewCols } = useSystemStatusVisibility();

  const handleRefresh = useCallback(() => {
    setSpinning(true);
    queryClient.invalidateQueries({ queryKey: ['system-status'] }).finally(() => {
      setTimeout(() => setSpinning(false), 600);
    });
  }, [queryClient]);

  const overviewGrid = overviewGridClass(overviewCols);

  return (
    <PageShell
      className="min-h-full bg-[#F8F9FB] shadow-[0_0_0_32px_#F8F9FB] dark:bg-background dark:shadow-[0_0_0_32px_var(--background)]"
      data-testid="system-status-page"
    >
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
        icon={Activity}
        actions={
          <>
            <Select value={range} onValueChange={(v) => v && setRange(v as SystemStatusRange)}>
              <PageHeaderSelectTrigger data-testid="system-status-range-trigger">
                <SelectValue />
              </PageHeaderSelectTrigger>
              <SelectContent>
                {RANGES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {tRange(r)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <PageHeaderActionButton
              className="w-20"
              onClick={handleRefresh}
              disabled={spinning}
              aria-busy={spinning}
              data-testid="system-status-refresh"
            >
              <RefreshCw
                className={`mr-2 size-4 motion-reduce:animate-none ${spinning ? 'animate-spin' : ''}`}
              />
              {t('refresh')}
            </PageHeaderActionButton>
          </>
        }
      />

      <HealthBanner
        alerts={data.alerts}
        threats={data.threats}
        range={range}
        isLoading={data.isLoading}
        isError={data.isError}
      />

      <KpiCards data={data} showInfra={showInfra} />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <ThreatTrend trend={data.threatTrend} isLoading={data.isLoading} isError={data.isError} />
        </div>
        <TodoAlerts alerts={data.alerts} isLoading={data.isLoading} />
      </div>

      <div className={`grid grid-cols-1 gap-6 ${overviewGrid}`}>
        {showAgents && <AgentOverview agents={data.agents} isLoading={data.isLoading} />}
        <ThreatTop5 top5={data.top5} isLoading={data.isLoading} range={range} />
        {showInfra && (
          <SystemHealthCard
            nodesOnline={data.nodesOnline}
            nodesTotal={data.nodesTotal}
            nodesDegraded={data.nodesDegraded}
            isLoading={data.isLoading}
          />
        )}
      </div>
    </PageShell>
  );
}
