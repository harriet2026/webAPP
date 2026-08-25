'use client';

import { useState, useMemo, type KeyboardEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import ReactECharts from 'echarts-for-react';
import { CheckCircle2, XCircle, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { EmptyState, DegradedBanner } from './StateBanners';
import { useProcesses, useRuntime, useDockerContainers, useRuntimeTrend } from './hooks';
import { degradeMessage } from '@/lib/monitoring/degrade';
import { createTimeAxisFormatter } from '@/lib/monitoring/chart-time';
import type { TimeRange } from '@/types/monitoring';

interface ProcessesTabProps {
  node: string;
  range: TimeRange;
}

type DockerFilterState = 'running' | 'stopped' | 'restarting' | null;
const STOPPED_CONTAINER_STATES = new Set(['exited', 'stopped', 'created', 'dead']);

// Process status only expresses whether a monitored process exists. Resource
// anomalies belong to their dedicated metrics and alerting rules, so this
// table deliberately has no warning/error state.
function useProcStatusBadge() {
  const t = useTranslations('infrastructure.processes');
  return (status: string): { className: string; label: string } => {
    switch (status) {
      case 'running':
      case 'normal':
      case 'green':
      case 'success':
        return {
          className: 'border-transparent bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300',
          label: t('running'),
        };
      default:
        return {
          className: 'border-transparent bg-gray-100 text-gray-800 dark:bg-gray-700/50 dark:text-gray-300',
          label: t('stopped'),
        };
    }
  };
}

function useContainerStateBadge() {
  const t = useTranslations('infrastructure.processes');
  return (state: string): { className: string; label: string } => {
    switch (state) {
      case 'running':
        return {
          className: 'border-transparent bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300',
          label: t('containerStateRunning'),
        };
      case 'restarting':
        return {
          className: 'border-transparent bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300',
          label: t('containerStateRestarting'),
        };
      case 'paused':
        return {
          className: 'border-transparent bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300',
          label: t('containerStatePaused'),
        };
      case 'dead':
        return {
          className: 'border-transparent bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300',
          label: t('containerStateDead'),
        };
      case 'created':
        return {
          className: 'border-transparent bg-gray-100 text-gray-800 dark:bg-gray-700/50 dark:text-gray-300',
          label: t('containerStateCreated'),
        };
      case 'exited':
      case 'stopped':
        return {
          className: 'border-transparent bg-gray-100 text-gray-800 dark:bg-gray-700/50 dark:text-gray-300',
          label: t('containerStateExited'),
        };
      case 'removing':
        return {
          className: 'border-transparent bg-gray-100 text-gray-800 dark:bg-gray-700/50 dark:text-gray-300',
          label: t('containerStateRemoving'),
        };
      default:
        return {
          className: 'border-transparent bg-gray-100 text-gray-800 dark:bg-gray-700/50 dark:text-gray-300',
          label: state,
        };
    }
  };
}

// Overlay2 usage ring color per html-spec §5: >85% warning yellow, >95%
// critical red, otherwise green.
function overlay2Color(pct: number): string {
  if (pct > 95) return 'text-red-500';
  if (pct > 85) return 'text-yellow-500';
  return 'text-green-500';
}

// Distinct colors for up to 8 services
const SERVICE_COLORS = [
  '#3b82f6', // blue
  '#10b981', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#06b6d4', // cyan
  '#f97316', // orange
  '#ec4899', // pink
];

function buildChartOption(
  seriesMap: Record<string, { ts: string; value: number }[]>,
  selectedServices: string[],
  yLabel: string,
  locale: string,
  range: TimeRange,
) {
  const services = selectedServices.filter((s) => seriesMap[s]);
  if (services.length === 0) return null;

  // Union of all timestamps
  const tsSet = new Set<string>();
  services.forEach((s) => seriesMap[s]?.forEach((p) => tsSet.add(p.ts)));
  const tsArr = Array.from(tsSet).sort();
  if (tsArr.length === 0) return null;

  return {
    tooltip: { trigger: 'axis' as const },
    legend: { data: services, top: 0 },
    grid: { left: 56, right: 16, top: 36, bottom: 32 },
    xAxis: {
      type: 'category' as const,
      data: tsArr,
      axisLabel: {
        showMaxLabel: true,
        formatter: createTimeAxisFormatter(locale, range === '7d'),
      },
    },
    yAxis: { type: 'value' as const, min: 0, axisLabel: { formatter: `{value} ${yLabel}` } },
    series: services.map((svc, i) => {
      const ptMap = new Map((seriesMap[svc] ?? []).map((p) => [p.ts, p.value]));
      return {
        name: svc,
        type: 'line' as const,
        data: tsArr.map((t) => ptMap.get(t) ?? null),
        smooth: true,
        lineStyle: { width: 2 },
        itemStyle: { color: SERVICE_COLORS[i % SERVICE_COLORS.length] },
        connectNulls: false,
      };
    }),
  };
}

function ServiceMultiSelect({
  allServices,
  selected,
  onChange,
}: {
  allServices: string[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const allSelected = selected.length === allServices.length;

  function toggle(svc: string) {
    if (selected.includes(svc)) {
      onChange(selected.filter((s) => s !== svc));
    } else {
      onChange([...selected, svc]);
    }
  }

  return (
    <Popover>
      <PopoverTrigger className="inline-flex h-7 items-center gap-1 rounded-md border border-input bg-background px-2.5 text-xs font-medium shadow-sm hover:bg-accent hover:text-accent-foreground">
        {allSelected ? '全部服务' : `${selected.length} 个服务`}
        <span className="opacity-50">▾</span>
      </PopoverTrigger>
      <PopoverContent className="w-44 p-2" align="end">
        <div className="space-y-1">
          <label className="flex items-center gap-2 px-1 py-0.5 text-xs cursor-pointer select-none">
            <Checkbox
              checked={allSelected}
              onCheckedChange={(v) => onChange(v ? [...allServices] : [])}
            />
            全部
          </label>
          <div className="border-t my-1" />
          {allServices.map((svc) => (
            <label
              key={svc}
              className="flex items-center gap-2 px-1 py-0.5 text-xs cursor-pointer select-none"
            >
              <Checkbox checked={selected.includes(svc)} onCheckedChange={() => toggle(svc)} />
              {svc}
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function ProcessesTab({ node, range }: ProcessesTabProps) {
  const t = useTranslations('infrastructure');
  const locale = useLocale();
  const procStatusBadge = useProcStatusBadge();
  const containerStateBadge = useContainerStateBadge();
  const [dockerFilter, setDockerFilter] = useState<DockerFilterState>(null);
  const [selectedSvcs, setSelectedSvcs] = useState<string[] | null>(null); // null = all

  const { data: procData, isLoading: procLoading, isError: procError } = useProcesses(node);
  const { data: runtimeData, isLoading: rtLoading } = useRuntime(node, range);
  const {
    data: containersData,
    isLoading: containersLoading,
    isError: containersError,
  } = useDockerContainers(node);
  const { data: trendData, isLoading: trendLoading } = useRuntimeTrend(node, range);

  const allServices = useMemo(() => {
    const keys = Object.keys(trendData?.goroutine ?? {});
    return keys.sort();
  }, [trendData]);

  const effectiveSelected = useMemo(
    () => selectedSvcs ?? allServices,
    [selectedSvcs, allServices],
  );

  // Sync selectedSvcs when allServices changes (first load or new service appears)
  const goroutineMap = useMemo(() => {
    const m: Record<string, { ts: string; value: number }[]> = {};
    for (const [svc, series] of Object.entries(trendData?.goroutine ?? {})) {
      m[svc] = series.points;
    }
    return m;
  }, [trendData]);

  const heapMap = useMemo(() => {
    const m: Record<string, { ts: string; value: number }[]> = {};
    for (const [svc, series] of Object.entries(trendData?.heap ?? {})) {
      m[svc] = series.points;
    }
    return m;
  }, [trendData]);

  const gorOption = useMemo(
    () => buildChartOption(goroutineMap, effectiveSelected, '', locale, range),
    [goroutineMap, effectiveSelected, locale, range],
  );

  const heapOption = useMemo(
    () => buildChartOption(heapMap, effectiveSelected, 'MB', locale, range),
    [heapMap, effectiveSelected, locale, range],
  );

  if (procLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <Skeleton className="h-24 rounded-lg" />
          <Skeleton className="h-24 rounded-lg" />
          <Skeleton className="h-24 rounded-lg" />
        </div>
        <Skeleton className="h-[200px] rounded-lg" />
      </div>
    );
  }

  if (procError) {
    return <DegradedBanner message={t('agentOffline')} />;
  }

  const docker = procData?.docker;
  const overlay2 = procData?.overlay2_usage;
  const processes = procData?.processes ?? [];
  const services = runtimeData?.services ?? [];
  const allContainers = containersData?.containers ?? [];

  const filteredContainers = dockerFilter
    ? allContainers.filter((c) => {
        if (dockerFilter === 'running') return c.state === 'running';
        if (dockerFilter === 'stopped') return STOPPED_CONTAINER_STATES.has(c.state);
        if (dockerFilter === 'restarting') return c.state === 'restarting';
        return false;
      })
    : [];

  const sheetTitle =
    dockerFilter === 'running'
      ? t('processes.running')
      : dockerFilter === 'stopped'
        ? t('processes.stopped')
         : t('processes.restarts');

  function handleDockerCardKeyDown(
    event: KeyboardEvent<HTMLDivElement>,
    filter: Exclude<DockerFilterState, null>,
  ) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setDockerFilter(filter);
    }
  }

  return (
    <div className="space-y-4" data-testid="monitor-infrastructure-processes">
      {procData?.degraded && (
        <DegradedBanner message={degradeMessage(procData.degraded_code, t)} />
      )}
      <div className="grid grid-cols-3 gap-4">
        <Card
          className="cursor-pointer hover:bg-muted/50 transition-colors"
          onClick={() => setDockerFilter('running')}
          onKeyDown={(event) => handleDockerCardKeyDown(event, 'running')}
          role="button"
          tabIndex={0}
          aria-haspopup="dialog"
          aria-expanded={dockerFilter === 'running'}
          aria-controls="monitor-infrastructure-container-drawer"
          data-testid="monitor-infrastructure-container-running"
        >
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-lg">
              <CheckCircle2 className="w-6 h-6 text-green-500" />
            </div>
            <div>
              <div className="text-2xl font-bold text-green-500">{docker?.running ?? '-'}</div>
              <div className="text-sm text-muted-foreground">{t('processes.running')}</div>
            </div>
          </CardContent>
        </Card>
        <Card
          className="cursor-pointer hover:bg-muted/50 transition-colors"
          onClick={() => setDockerFilter('stopped')}
          onKeyDown={(event) => handleDockerCardKeyDown(event, 'stopped')}
          role="button"
          tabIndex={0}
          aria-haspopup="dialog"
          aria-expanded={dockerFilter === 'stopped'}
          aria-controls="monitor-infrastructure-container-drawer"
          data-testid="monitor-infrastructure-container-stopped"
        >
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 bg-gray-100 dark:bg-gray-700 rounded-lg">
              <XCircle className="w-6 h-6 text-gray-400" />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-500">{docker?.stopped ?? '-'}</div>
              <div className="text-sm text-muted-foreground">{t('processes.stopped')}</div>
            </div>
          </CardContent>
        </Card>
        <Card
          className="cursor-pointer hover:bg-muted/50 transition-colors"
          onClick={() => setDockerFilter('restarting')}
          onKeyDown={(event) => handleDockerCardKeyDown(event, 'restarting')}
          role="button"
          tabIndex={0}
          aria-haspopup="dialog"
          aria-expanded={dockerFilter === 'restarting'}
          aria-controls="monitor-infrastructure-container-drawer"
          data-testid="monitor-infrastructure-container-restarting"
        >
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
              <RefreshCw className="w-6 h-6 text-yellow-500" />
            </div>
            <div>
              <div className="text-2xl font-bold text-yellow-500">{docker?.restarts ?? '-'}</div>
              <div className="text-sm text-muted-foreground">{t('processes.restarts')}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Sheet open={dockerFilter !== null} onOpenChange={(open) => !open && setDockerFilter(null)}>
        <SheetContent
          id="monitor-infrastructure-container-drawer"
          className="w-full sm:w-3/4 lg:w-2/3"
          data-testid="monitor-infrastructure-container-drawer"
        >
          <SheetHeader>
            <SheetTitle>
              {sheetTitle}
              {!containersLoading && !containersError && ` (${filteredContainers.length})`}
            </SheetTitle>
          </SheetHeader>
          {(containersError || containersData?.degraded) && (
            <div className="px-4">
              <DegradedBanner
                message={containersError
                  ? t('agentOffline')
                  : degradeMessage(containersData?.degraded_code, t)}
              />
            </div>
          )}
          <div className="mt-4 overflow-auto">
            {containersLoading ? (
              <Skeleton className="h-[200px] w-full rounded-lg" />
            ) : containersError ? null : filteredContainers.length === 0 ? (
              <EmptyState message={t('noData')} />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('processes.containerName')}</TableHead>
                    <TableHead>{t('processes.containerImage')}</TableHead>
                    <TableHead>{t('processes.containerState')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredContainers.map((c) => {
                    const stateBadge = containerStateBadge(c.state);
                    return (
                      <TableRow key={c.name} data-testid={`monitor-infrastructure-container-row-${c.name}`}>
                        <TableCell className="font-mono text-xs">{c.name}</TableCell>
                        <TableCell className="break-all font-mono text-xs text-muted-foreground">{c.image}</TableCell>
                        <TableCell>
                          <Badge className={stateBadge.className}>{stateBadge.label}</Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <Card data-testid="monitor-infrastructure-overlay-card">
        <CardHeader>
          <CardTitle>{t('processes.overlay2')}</CardTitle>
        </CardHeader>
        <CardContent>
          {(() => {
            const pct = overlay2 ?? 0;
            const circumference = 2 * Math.PI * 56;
            const color = overlay2Color(pct);
            return (
              <div className="flex items-center gap-6">
                <div className="relative h-[140px] w-[140px] shrink-0">
                  <svg width="140" height="140" viewBox="0 0 140 140">
                    <circle cx="70" cy="70" r="56" fill="none" strokeWidth="12" className="stroke-muted" />
                    <circle
                      cx="70"
                      cy="70"
                      r="56"
                      fill="none"
                      strokeWidth="12"
                      strokeLinecap="round"
                      strokeDasharray={`${(Math.min(pct, 100) / 100) * circumference} ${circumference}`}
                      transform="rotate(-90 70 70)"
                      className={`stroke-current transition-all ${color}`}
                      data-testid="monitor-infrastructure-overlay-arc"
                    />
                  </svg>
                  <div className={`absolute inset-0 flex items-center justify-center text-xl font-bold ${color}`}>
                    {pct}%
                  </div>
                </div>
                <div className="text-sm text-muted-foreground">
                  <p>{t('processes.overlay2Description')}</p>
                  <p className="mt-2 text-yellow-600">{t('processes.overlay2Warning')}</p>
                  <p className="text-red-600">{t('processes.overlay2Critical')}</p>
                </div>
              </div>
            );
          })()}
        </CardContent>
      </Card>

      <Card data-testid="monitor-infrastructure-process-table-card">
        <CardHeader>
          <CardTitle>{t('processes.coreProcs')}</CardTitle>
        </CardHeader>
        <CardContent>
          {processes.length === 0 ? (
            <EmptyState message={t('noData')} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('processes.processName')}</TableHead>
                  <TableHead>{t('processes.status')}</TableHead>
                  <TableHead>{t('processes.detail')}</TableHead>
                  <TableHead className="text-right">{t('processes.memory')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {processes.map((p) => (
                  <TableRow key={p.name} data-testid={`monitor-infrastructure-process-row-${p.name.toLowerCase()}`}>
                    <TableCell className="font-mono">{p.name}</TableCell>
                    <TableCell>
                      <Badge className={procStatusBadge(p.status).className}>
                        {procStatusBadge(p.status).label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {(p.count ?? 0) > 1 ? t('processes.procCount', { count: p.count ?? 0 }) : `PID: ${p.pid}`}
                    </TableCell>
                    <TableCell className="text-right">
                      {p.memory > 0 ? `${(p.memory / 1024 / 1024).toFixed(1)} MB` : '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card data-testid="monitor-infrastructure-runtime-card">
        <CardHeader>
          <CardTitle>{t('processes.serviceRuntime')}</CardTitle>
        </CardHeader>
        <CardContent>
          {rtLoading ? (
            <Skeleton className="h-[120px] w-full rounded-lg" />
          ) : services.length === 0 ? (
            <EmptyState message={t('noData')} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('processes.service')}</TableHead>
                  <TableHead className="text-right">{t('processes.goroutine')}</TableHead>
                  <TableHead>{t('processes.heapAlloc')}</TableHead>
                  <TableHead>{t('processes.uptime')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {services.map((s) => (
                  <TableRow key={s.name} data-testid={`monitor-infrastructure-runtime-row-${s.name}`}>
                    <TableCell className="font-mono">{s.name}</TableCell>
                    <TableCell className="text-right">{s.goroutine}</TableCell>
                    <TableCell>{(s.heap_alloc / 1024 / 1024).toFixed(1)} MB</TableCell>
                    <TableCell>{s.uptime}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Goroutine trend chart */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">{t('processes.goroutineTrend')}</CardTitle>
          {allServices.length > 0 && (
            <ServiceMultiSelect
              allServices={allServices}
              selected={effectiveSelected}
              onChange={setSelectedSvcs}
            />
          )}
        </CardHeader>
        <CardContent>
          {trendLoading ? (
            <Skeleton className="h-[240px] w-full rounded-lg" />
          ) : !gorOption ? (
            <EmptyState message={t('noData')} />
          ) : (
            <ReactECharts option={gorOption} style={{ height: 240 }} />
          )}
        </CardContent>
      </Card>

      {/* Heap Alloc trend chart */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">{t('processes.heapAllocTrend')}</CardTitle>
          {allServices.length > 0 && (
            <ServiceMultiSelect
              allServices={allServices}
              selected={effectiveSelected}
              onChange={setSelectedSvcs}
            />
          )}
        </CardHeader>
        <CardContent>
          {trendLoading ? (
            <Skeleton className="h-[240px] w-full rounded-lg" />
          ) : !heapOption ? (
            <EmptyState message={t('noData')} />
          ) : (
            <ReactECharts option={heapOption} style={{ height: 240 }} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
