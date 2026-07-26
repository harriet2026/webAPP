'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import ReactECharts from 'echarts-for-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Mail, TrendingUp, RefreshCw, Activity, Shield, Inbox, AlertTriangle, Server,
  ChevronRight, Cpu, MemoryStick, HardDrive, Database, Clock, Download, CircleCheck,
} from 'lucide-react';
import {
  useMonitorDashboardOverview,
  type DashboardStatus,
  type MonitorDashboardRange,
} from '@/lib/api/monitor-dashboard';
import { DegradedBanner, TimeoutBanner } from '@/components/monitoring/infrastructure/StateBanners';

const ENGINE_COLORS = { antispam: '#1890FF', antivirus: '#52C41A', sandbox: '#FA8C16', rbl: '#722ED1' } as const;

function normalizedStatus(status?: DashboardStatus): DashboardStatus {
  return status ?? 'unknown';
}

function statusBgClass(s: DashboardStatus) {
  return s === 'critical'
    ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
    : s === 'warning'
      ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
      : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700';
}

function statusDotClass(status?: DashboardStatus) {
  return status === 'critical'
    ? 'bg-red-500'
    : status === 'warning'
      ? 'bg-amber-500'
      : status === 'normal'
        ? 'bg-emerald-500'
        : 'bg-slate-400';
}

export function MonitorDashboardPage() {
  const t = useTranslations('monitorDashboard');
  const [timeRange, setTimeRange] = useState('today');
  const [refreshInterval, setRefreshInterval] = useState('30s');
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data: api, refetch, isFetching, isError } =
    useMonitorDashboardOverview(timeRange as MonitorDashboardRange);

  // 自动刷新间隔与选择器保持一致；关闭时不创建定时器。
  useEffect(() => {
    if (refreshInterval === 'off') return;
    const ms = refreshInterval === '5s' ? 5000 : refreshInterval === '1m' ? 60000 : 30000;
    const timer = setInterval(() => {
      void refetch().then(() => setLastUpdate(new Date()));
    }, ms);
    return () => clearInterval(timer);
  }, [refreshInterval, refetch]);

  // Every displayed value below comes from the overview endpoint. Zero/empty
  // values are loading/error-safe placeholders, not demo fixtures.
  const kpiView = {
    todayVolume: {
      value: api?.kpi.today_volume ?? 0,
      change: api?.kpi.volume_change ?? 0,
      status: normalizedStatus(api ? 'normal' : undefined),
    },
    deliverySuccessRate: {
      value: Number((api?.kpi.delivery_success_rate ?? 0).toFixed(1)),
      change: api?.kpi.delivery_success_change ?? 0,
      status: normalizedStatus(api
        ? api.kpi.delivery_success_rate < 90
          ? 'critical'
          : api.kpi.delivery_success_rate < 95 ? 'warning' : 'normal'
        : undefined),
    },
    queueDepth: {
      value: api?.kpi.queue_depth ?? 0,
      status: normalizedStatus(api?.mailflow_health?.status),
    },
    alerts: {
      healthy: api?.kpi.engines_healthy ?? 0,
      total: api?.kpi.engines_total ?? 0,
      status: normalizedStatus(!api
        ? undefined
        : api.engine_health?.some((item) => item.status === 'critical')
          ? 'critical'
          : api.engine_health?.some((item) => item.status === 'warning') ? 'warning' : 'normal'),
    },
    nodes: {
      online: api?.kpi.nodes_online ?? 0,
      total: api?.kpi.nodes_total ?? 0,
      status: normalizedStatus(!api
        ? undefined
        : api.kpi.nodes_total > 0 && api.kpi.nodes_online === api.kpi.nodes_total
          ? 'normal'
          : 'critical'),
    },
    todo: {
      value: api?.kpi.todo ?? 0,
      critical: api?.kpi.critical_todo ?? 0,
      major: api?.kpi.major_todo ?? 0,
      status: normalizedStatus(!api ? undefined : api.kpi.critical_todo > 0 ? 'critical' : api.kpi.todo > 0 ? 'warning' : 'normal'),
    },
  };

  const mailflowData = (api?.mailflow_trend ?? []).map((point) => ({
    hour: point.time.length >= 16 ? point.time.slice(11, 16) : point.time,
    volume: point.volume,
    latencyP95: point.latency_p95,
  }));
  const engineData = (api?.engine_trend ?? []).map((point) => ({
    hour: point.time.length >= 16 ? point.time.slice(11, 16) : point.time,
    antispam: point.antispam,
    antivirus: point.antivirus,
    sandbox: point.sandbox,
    rbl: point.rbl,
  }));

  const mailflowOption = {
    grid: { left: 40, right: 16, top: 24, bottom: 24 },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: mailflowData.map((d) => d.hour) },
    yAxis: [{ type: 'value', name: t('mailflowVolume') }, { type: 'value', name: t('latencyP95') }],
    series: [
      { name: t('mailflowVolume'), type: 'line', areaStyle: {}, smooth: true, data: mailflowData.map((d) => d.volume), color: '#1890FF' },
      { name: t('latencyP95'), type: 'line', areaStyle: {}, smooth: true, yAxisIndex: 1, data: mailflowData.map((d) => d.latencyP95), color: '#FA8C16' },
    ],
  };

  const engineOption = {
    grid: { left: 40, right: 16, top: 24, bottom: 24 },
    tooltip: { trigger: 'axis' },
    legend: { bottom: 0 },
    xAxis: { type: 'category', data: engineData.map((d) => d.hour) },
    yAxis: { type: 'value' },
    series: (['antispam', 'antivirus', 'sandbox', 'rbl'] as const).map((k) => ({
      name: t(`engine.${k}`), type: 'line', areaStyle: {}, smooth: true,
      data: engineData.map((d) => d[k]), color: ENGINE_COLORS[k],
    })),
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setLastUpdate(new Date());
    setIsRefreshing(false);
  };

  const infrastructureMetrics = [
    { key: 'cpu', value: api?.infrastructure?.cpu_usage ?? 0, icon: Cpu },
    { key: 'memory', value: api?.infrastructure?.memory_usage ?? 0, icon: MemoryStick },
    { key: 'disk', value: api?.infrastructure?.disk_usage ?? 0, icon: HardDrive },
  ] as const;
  const engineHealth = new Map((api?.engine_health ?? []).map((item) => [item.key, item.status]));
  const miniTrend = (api?.mailflow_trend ?? []).slice(-6);
  const maxMiniVolume = Math.max(1, ...miniTrend.map((item) => item.volume));
  const alertHealth = [
    ['unconfirmed', api?.alert_health.unconfirmed ?? 0, 'text-red-500'],
    ['processing', api?.alert_health.processing ?? 0, 'text-amber-500'],
    ['resolved', api?.alert_health.resolved ?? 0, 'text-emerald-500'],
  ] as const;

  const kpiCards = [
    { key: 'today-volume', label: t('kpi.todayVolume'), value: kpiView.todayVolume.value.toLocaleString(), change: `${kpiView.todayVolume.change >= 0 ? '+' : ''}${kpiView.todayVolume.change}%`, detail: t('comparedYesterday'), status: kpiView.todayVolume.status, icon: <Mail className="w-4 h-4 text-muted-foreground" />, href: '/monitoring/mailflow?tab=delivery' },
    { key: 'delivery-rate', label: t('kpi.deliverySuccessRate'), value: `${kpiView.deliverySuccessRate.value}%`, change: `${kpiView.deliverySuccessRate.change >= 0 ? '+' : ''}${kpiView.deliverySuccessRate.change.toFixed(1)}%`, detail: t('deliveryThreshold'), status: kpiView.deliverySuccessRate.status, icon: <CircleCheck className="w-4 h-4 text-muted-foreground" />, href: '/monitoring/mailflow?tab=delivery' },
    { key: 'queue-depth', label: t('kpi.queueDepth'), value: kpiView.queueDepth.value.toLocaleString(), change: '', detail: t('queueThreshold'), status: kpiView.queueDepth.status, icon: <Inbox className="w-4 h-4 text-muted-foreground" />, href: '/monitoring/mailflow?tab=queue' },
    { key: 'alerts', label: t('kpi.engineHealth'), value: `${kpiView.alerts.healthy}/${kpiView.alerts.total}`, change: '', detail: t('allNormal'), status: kpiView.alerts.status, icon: <Shield className="w-4 h-4 text-muted-foreground" />, href: '/monitoring/security' },
    { key: 'nodes', label: t('kpi.infrastructureHealth'), value: `${kpiView.nodes.online}/${kpiView.nodes.total}`, change: '', detail: t('allNormal'), status: kpiView.nodes.status, icon: <Server className="w-4 h-4 text-muted-foreground" />, href: '/monitoring/infrastructure' },
    { key: 'todo', label: t('kpi.todo'), value: String(kpiView.todo.value), change: '', status: kpiView.todo.status, icon: <AlertTriangle className="w-4 h-4 text-gray-400" />, href: '/monitoring/alerts' },
  ];

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen" data-testid="monitor-dashboard-page">
      {/* 页头 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('title')}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400" data-testid="monitor-dashboard-last-update">
            {t('lastUpdate')}: {lastUpdate.toLocaleTimeString()}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={timeRange} onValueChange={(v) => setTimeRange(v ?? 'today')}>
            <SelectTrigger className="w-28" data-testid="monitor-dashboard-range-select"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="today">{t('range.today')}</SelectItem>
              <SelectItem value="24h">{t('range.24h')}</SelectItem>
              <SelectItem value="7d">{t('range.7d')}</SelectItem>
              <SelectItem value="30d">{t('range.30d')}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={refreshInterval} onValueChange={(v) => setRefreshInterval(v ?? '30s')}>
            <SelectTrigger className="w-24" data-testid="monitor-dashboard-refresh-select">
              <RefreshCw className={`w-4 h-4 mr-1 ${isRefreshing || isFetching ? 'animate-spin' : ''}`} /><SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="5s">5s</SelectItem>
              <SelectItem value="30s">30s</SelectItem>
              <SelectItem value="1m">1m</SelectItem>
              <SelectItem value="off">{t('refreshOff')}</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={handleRefresh} data-testid="monitor-dashboard-refresh-btn">
            <RefreshCw className={`w-4 h-4 ${isRefreshing || isFetching ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {isError ? (
        <div data-testid="monitor-dashboard-error">
          <TimeoutBanner onRetry={() => { void refetch(); }} />
        </div>
      ) : api?.degraded ? (
        <div data-testid="monitor-dashboard-degraded">
          <DegradedBanner />
        </div>
      ) : null}

      {/* KPI 6 列卡片 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6" data-testid="monitor-dashboard-kpi-grid">
        {kpiCards.map((c) => (
          <Link key={c.key} href={c.href} data-testid={`monitor-dashboard-kpi-${c.key}`}>
            <Card className={`${statusBgClass(c.status)} border cursor-pointer hover:shadow-md transition-all`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-gray-500 dark:text-gray-400">{c.label}</span>
                  {c.icon}
                </div>
                {c.key === 'nodes' ? (
                  <div className="flex items-center gap-1 py-2" data-testid="monitor-dashboard-infrastructure-dots">
                    {Array.from({ length: kpiView.nodes.total }, (_, index) => (
                      <span key={index} className={`size-3 rounded-full ${index < kpiView.nodes.online ? 'bg-emerald-500' : 'bg-red-500'}`} />
                    ))}
                    <span className="ml-1 font-semibold">{c.value}</span>
                  </div>
                ) : (
                  <div className={`text-2xl font-bold ${
                    c.status === 'critical' ? 'text-red-500' :
                    c.status === 'warning' ? 'text-amber-500' :
                    ['delivery-rate', 'alerts'].includes(c.key) ? 'text-emerald-500' :
                    'text-foreground'
                  }`}>{c.value}</div>
                )}
                {c.change ? (
                  <div className="flex items-center gap-1 mt-1 text-sm text-green-500">
                    <TrendingUp className="w-4 h-4" /><span>{c.change}</span>
                    {'detail' in c && c.detail ? <span className="ml-1 text-xs text-muted-foreground">{c.detail}</span> : null}
                  </div>
                ) : 'detail' in c && c.detail ? (
                  <div className={`mt-1 text-xs ${c.status === 'warning' ? 'text-amber-600' : 'text-muted-foreground'}`}>
                    {c.detail}
                  </div>
                ) : c.key === 'todo' ? (
                  <div className="mt-1 flex gap-2 text-xs">
                    <span className="text-red-500">Critical: {kpiView.todo.critical}</span>
                    <span className="text-amber-500">Major: {kpiView.todo.major}</span>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-4" data-testid="monitor-dashboard-module-health-grid">
        <Link href="/monitoring/infrastructure" data-testid="monitor-dashboard-module-infrastructure">
          <Card className="h-full cursor-pointer transition-shadow hover:shadow-md">
            <CardHeader className="flex-row items-center justify-between pb-2">
              <CardTitle className="flex items-center gap-2 text-sm"><Server className="size-4" />{t('module.infrastructure')}</CardTitle>
              <div className="flex items-center gap-1"><span className={`size-2 rounded-full ${statusDotClass(api?.infrastructure?.status)}`} /><ChevronRight className="size-4 text-muted-foreground" /></div>
            </CardHeader>
            <CardContent className="space-y-3">
              {infrastructureMetrics.map(({ key, value, icon: Icon }) => (
                <div key={key} className="flex items-center gap-2" data-testid={`monitor-dashboard-infra-${key}`}>
                  <Icon className="size-4 text-muted-foreground" />
                  <span className="w-12 text-sm text-muted-foreground">{t(`metric.${key}`)}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className={`h-full rounded-full ${value >= 90 ? 'bg-red-500' : value >= 80 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(value, 100)}%` }} />
                  </div>
                  <span className={`text-sm font-medium ${value >= 90 ? 'text-red-500' : value >= 80 ? 'text-amber-500' : 'text-emerald-600'}`}>{value.toFixed(1)}%</span>
                </div>
              ))}
              <div className="flex items-center gap-2" data-testid="monitor-dashboard-infra-database">
                <Database className="size-4 text-muted-foreground" /><span className="w-12 text-sm text-muted-foreground">{t('metric.database')}</span><span className={`text-sm font-medium ${api?.infrastructure?.status === 'normal' ? 'text-emerald-600' : api?.infrastructure?.status === 'critical' ? 'text-red-500' : 'text-amber-500'}`}>{api?.infrastructure?.database_status || 'unknown'}</span>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/monitoring/mailflow" data-testid="monitor-dashboard-module-mailflow">
          <Card className="h-full cursor-pointer transition-shadow hover:shadow-md">
            <CardHeader className="flex-row items-center justify-between pb-2"><CardTitle className="flex items-center gap-2 text-sm"><Mail className="size-4" />{t('module.mailflow')}</CardTitle><div className="flex items-center gap-1"><span className={`size-2 rounded-full ${statusDotClass(api?.mailflow_health?.status)}`} /><ChevronRight className="size-4 text-muted-foreground" /></div></CardHeader>
            <CardContent>
              <div className="mb-3 flex h-16 items-end gap-1" aria-label={t('module.queueTrend')} data-testid="monitor-dashboard-module-mailflow-chart">
                {miniTrend.map((point) => <span key={point.time} className="flex-1 bg-amber-200" style={{ height: `${Math.max(4, point.volume / maxMiniVolume * 100)}%` }} />)}
              </div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">{t('module.queue')}: <b className="text-amber-500">{(api?.mailflow_health?.queue_depth ?? 0).toLocaleString()}</b></span><span className="text-muted-foreground">{t('module.latency')}: <b className="text-foreground">{(api?.mailflow_health?.latency_p95 ?? 0).toFixed(1)}s</b></span></div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/monitoring/security" data-testid="monitor-dashboard-module-engine">
          <Card className="h-full cursor-pointer transition-shadow hover:shadow-md">
            <CardHeader className="flex-row items-center justify-between pb-2"><CardTitle className="flex items-center gap-2 text-sm"><Shield className="size-4" />{t('module.engine')}</CardTitle><div className="flex items-center gap-1"><span className={`size-2 rounded-full ${statusDotClass(kpiView.alerts.status)}`} /><ChevronRight className="size-4 text-muted-foreground" /></div></CardHeader>
            <CardContent className="grid grid-cols-2 gap-2">
              {(['antispam', 'antivirus', 'sandbox', 'rbl'] as const).map((engine) => (
                <div key={engine} className="flex items-center gap-2 rounded-lg bg-muted p-2" data-testid={`monitor-dashboard-engine-${engine}`}>
                  <span className="size-3 rounded-full" style={{ backgroundColor: ENGINE_COLORS[engine] }} /><span className="text-xs text-muted-foreground">{t(`engine.${engine}`)}</span><span className={`ml-auto size-2 rounded-full ${statusDotClass(engineHealth.get(engine))}`} />
                </div>
              ))}
            </CardContent>
          </Card>
        </Link>
        <Link href="/monitoring/alerts" data-testid="monitor-dashboard-module-alerts">
          <Card className="h-full cursor-pointer transition-shadow hover:shadow-md" data-testid="monitor-dashboard-alerts-health">
            <CardHeader className="flex-row items-center justify-between pb-2"><CardTitle className="flex items-center gap-2 text-sm"><AlertTriangle className="size-4" />{t('module.alerts')}</CardTitle><div className="flex items-center gap-1"><span className={`size-2 rounded-full ${statusDotClass(kpiView.todo.status)}`} /><ChevronRight className="size-4 text-muted-foreground" /></div></CardHeader>
            <CardContent className="space-y-3">
              {alertHealth.map(([key, value, color]) => (
                <div key={String(key)} className="flex items-center gap-2" data-testid={`monitor-dashboard-alert-${key}`}><span className={`size-3 rounded-full ${String(color).replace('text-', 'bg-')}`} /><span className="text-sm text-muted-foreground">{t(`alert.${key}`)}</span><span className={`ml-auto font-medium ${color}`}>{value}</span></div>
              ))}
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* 趋势图：邮件流健康 + 检测引擎性能 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card data-testid="monitor-dashboard-mailflow-trend">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><Activity className="w-4 h-4" />{t('mailflowTrend')}</CardTitle></CardHeader>
          <CardContent><ReactECharts option={mailflowOption} style={{ height: 260 }} /></CardContent>
        </Card>
        <Card data-testid="monitor-dashboard-engine-trend">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><Activity className="w-4 h-4" />{t('engineTrend')}</CardTitle></CardHeader>
          <CardContent><ReactECharts option={engineOption} style={{ height: 260 }} /></CardContent>
        </Card>
      </div>

      <Card data-testid="monitor-dashboard-alert-marquee">
          <CardContent className="flex items-center gap-4 p-3">
            <AlertTriangle className="size-5 shrink-0 animate-pulse text-red-500" />
            <div className="flex flex-1 items-center gap-8 overflow-x-auto">
            {(api?.recent_alerts ?? []).map((a) => (
              <Link href={`/monitoring/alerts?id=${a.id}`} key={a.id} data-testid={`monitor-dashboard-marquee-item-${a.id}`} className={`flex shrink-0 items-center gap-2 text-sm ${a.severity === 'critical' ? 'text-red-500' : 'text-amber-500'}`}>
                <span className="font-medium">[{new Date(a.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}]</span>
                <Badge variant="outline">{a.module}</Badge>
                <span className="truncate">{a.message}</span>
                <Badge variant={a.status === 'unconfirmed' ? 'destructive' : a.status === 'processing' ? 'default' : 'secondary'}>{t(`alertStatus.${a.status}`)}</Badge>
              </Link>
            ))}
            </div>
            <Link className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-3 text-sm font-medium hover:bg-accent" href="/monitoring/alerts" data-testid="monitor-dashboard-alert-view-all">{t('viewAll')}<ChevronRight className="size-4" /></Link>
          </CardContent>
      </Card>

      <div className="flex items-center justify-between text-sm text-muted-foreground" data-testid="monitor-dashboard-footer">
        <div className="flex items-center gap-2"><Clock className="size-4" /><span>{t('lastUpdate')}: {lastUpdate.toLocaleString()}</span></div>
        <Button variant="outline" size="sm" disabled title={t('pdfUnavailable')} data-testid="monitor-dashboard-export-pdf">
          <Download className="size-4" />{t('exportPdf')}
        </Button>
      </div>
    </div>
  );
}
