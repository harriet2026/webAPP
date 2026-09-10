'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AlertCircle, Gauge, RefreshCw, ShieldX } from 'lucide-react';
import { PageHeader, PageShell } from '@/components/shared/page-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FilterBar } from './FilterBar';
import { KpiCards } from './KpiCards';
import { TrendChartCard } from './TrendChartCard';
import { DetailTable } from './DetailTable';
import { ObserveTimeoutAlert } from './ObserveTimeoutAlert';
import { BottomActions } from './BottomActions';
import { TenantScopeSelector } from '@/components/statistics/security-overview/TenantScopeSelector';
import { useSecurityScope } from '@/components/statistics/security-overview/hooks/useSecurityScope';
import { useRuleEffectiveness } from './hooks/useRuleEffectiveness';
import { timeRangeToDates, defaultCustomRange, type CustomRange } from './date-range';
import { MODULE_FILTER_OPTIONS, resolveModuleFilterParams, type ModuleFilterOption } from './constants';
import {
  buildEmailDisposalCenterQuery,
  getRuleEffectivenessExportCsvUrl,
  type ObserveDurationBucket,
  type PolicyModule,
  type RuleEffectivenessRow,
  type TimeRange,
} from '@/lib/api/rule-effectiveness';
import { ApiError } from '@/lib/api/client';

// 各观察模块「前往策略配置」的跳转目标——固定映射到 3 个已有的配置页，
// 本页只做导航，不修改这些配置页自身的逻辑。
const CONFIG_PATH_BY_MODULE: Record<PolicyModule, string> = {
  auth_spoofing: '/security/auth-spoofing/config',
  similar_detection: '/security/similar-detection/config',
  phishing_detection: '/security/phishing-detection/config',
};

export function RuleEffectivenessPage() {
  const t = useTranslations('ruleEffectiveness');
  const router = useRouter();

  const [timeRange, setTimeRange] = useState<TimeRange>('7d');
  const [customRange, setCustomRange] = useState<CustomRange>(() => defaultCustomRange());
  // 相似检测下相似邮件检测/相同主题检测是两条独立策略，筛选项按策略拆分，
  // 而不是沿用 PolicyModule 三选一（那样无法单独筛出某一条相似检测策略）。
  const [moduleOptions, setModuleOptions] = useState<ModuleFilterOption[]>([]);
  const [durationBuckets, setDurationBuckets] = useState<ObserveDurationBucket[]>([]);
  const [scopeTenantId, setScopeTenantId] = useState<number | null>(null);
  const { scopeActive } = useSecurityScope(scopeTenantId);

  const { startDate, endDate } = useMemo(
    () => timeRangeToDates(timeRange, customRange),
    [timeRange, customRange],
  );

  const effectiveModuleOptions = moduleOptions.length > 0 ? moduleOptions : MODULE_FILTER_OPTIONS;
  const { modules: effectiveModules, similarDetectionTypes: effectiveSimilarDetectionTypes } = useMemo(
    () => resolveModuleFilterParams(effectiveModuleOptions),
    [effectiveModuleOptions],
  );

  const { data, error, isError, isFetching, isLoading, refetch } = useRuleEffectiveness({
    startDate,
    endDate,
    modules: effectiveModules,
    similarDetectionTypes: effectiveSimilarDetectionTypes,
    durationBuckets,
    scopeTenantId,
  });

  const handleNavigateToConfig = useCallback((row: RuleEffectivenessRow) => {
    router.push(row.config_path || CONFIG_PATH_BY_MODULE[row.policy_module]);
  }, [router]);

  // 统一跳转到邮件处置中心，携带模块/子策略/观察起始时间作为预置筛选条件，
  // 由处置中心侧解析 source=rule_effectiveness 并展示上下文提示条。
  const handleViewHits = useCallback((row: RuleEffectivenessRow) => {
    const query = buildEmailDisposalCenterQuery({
      policy_module: row.policy_module,
      sub_strategy_id: row.sub_strategy_id,
      observed_since: row.observed_since,
      similar_detection_type: row.similar_detection_type,
      similar_detection_scope: row.similar_detection_scope,
    });
    router.push(`/email-disposal/center?${query}`);
  }, [router]);

  const csvUrl = getRuleEffectivenessExportCsvUrl({
    startDate,
    endDate,
    modules: effectiveModules,
    similarDetectionTypes: effectiveSimilarDetectionTypes,
    durationBuckets,
    tenantId: scopeTenantId,
  });

  return (
    <PageShell data-testid="rule-effectiveness-page">
      <PageHeader title={t('title')} description={t('subtitle')} icon={Gauge} />

      <FilterBar
        timeRange={timeRange}
        onTimeRangeChange={setTimeRange}
        customRange={customRange}
        onCustomRangeChange={setCustomRange}
        moduleOptions={moduleOptions}
        onModuleOptionsChange={setModuleOptions}
        durationBuckets={durationBuckets}
        onDurationBucketsChange={setDurationBuckets}
        leftSlot={scopeActive ? <TenantScopeSelector value={scopeTenantId} onChange={setScopeTenantId} /> : null}
      />

      {isError ? (
        <Card
          role="alert"
          data-testid={error instanceof ApiError && error.status === 403
            ? 'rule-effectiveness-forbidden-state'
            : 'rule-effectiveness-error-state'}
          className="border-destructive/30 bg-destructive/5"
        >
          <CardHeader className="flex flex-row items-start gap-3">
            <span className="rounded-lg bg-destructive/10 p-2 text-destructive">
              {error instanceof ApiError && error.status === 403
                ? <ShieldX className="h-5 w-5" aria-hidden="true" />
                : <AlertCircle className="h-5 w-5" aria-hidden="true" />}
            </span>
            <div className="min-w-0 space-y-1">
              <CardTitle className="text-base">
                {t(error instanceof ApiError && error.status === 403
                  ? 'error.forbiddenTitle'
                  : 'error.loadFailedTitle')}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {t(error instanceof ApiError && error.status === 403
                  ? 'error.forbiddenDescription'
                  : 'error.loadFailedDescription')}
              </p>
            </div>
          </CardHeader>
          <CardContent>
            <Button
              type="button"
              variant="outline"
              onClick={() => { void refetch(); }}
              disabled={isFetching}
              data-testid="rule-effectiveness-retry"
            >
              <RefreshCw className={isFetching ? 'animate-spin' : ''} aria-hidden="true" />
              {t(isFetching ? 'error.retrying' : 'error.retry')}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {data && data.rows.length > 0 && (
            <ObserveTimeoutAlert rows={data.rows} onNavigateToConfig={handleNavigateToConfig} />
          )}

          <KpiCards data={data?.kpi} isLoading={isLoading} />

          <TrendChartCard trend={data?.trend} isLoading={isLoading} />

          <DetailTable
            rows={data?.rows ?? []}
            isLoading={isLoading}
            onViewHits={handleViewHits}
            onNavigateToConfig={handleNavigateToConfig}
          />

          <BottomActions csvUrl={csvUrl} />
        </>
      )}
    </PageShell>
  );
}
