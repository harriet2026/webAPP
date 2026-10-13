'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { AlertCircle, Gauge, RefreshCw, ShieldX, TimerOff } from 'lucide-react';
import { PageHeader, PageShell } from '@/components/shared/page-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FilterBar } from './FilterBar';
import { KpiCards } from './KpiCards';
import { DetailTable } from './DetailTable';
import { ObserveTimeoutAlert } from './ObserveTimeoutAlert';
import { TenantScopeSelector } from '@/components/statistics/security-overview/TenantScopeSelector';

import { useSecurityScope } from '@/components/statistics/security-overview/hooks/useSecurityScope';
import { isRuleEffectivenessTimeout, useRuleEffectiveness } from './hooks/useRuleEffectiveness';
import { timeRangeToDates, defaultCustomRange, type CustomRange } from './date-range';
import { stageModuleOptions, resolveModuleFilterParams, type ModuleFilterOption, type RuleEffectivenessStageId } from './constants';
import {
  buildEmailDisposalCenterQuery,
  type ObserveDurationBucket,
  type PolicyModule,
  type RuleEffectivenessRow,
  type TimeRange,
} from '@/lib/api/rule-effectiveness-view';
import { useTenant } from '@/hooks/use-tenant';
import { useProductForm } from '@/contexts/product-form-context';
import { ApiError } from '@/lib/api/client';
import { listTenants } from '@/lib/api/tenants';

// 各观察模块「前往策略配置」的跳转目标——映射到已有的配置页，
// 本页只做导航，不修改这些配置页自身的逻辑。与 fixtures.ts 中
// RULE_EFFECTIVENESS_CONFIG_PATH 的真实路径保持一致，避免兜底路径失效。
const CONFIG_PATH_BY_MODULE: Record<PolicyModule, string> = {
  behavior_control: '/security/pipeline?module=behaviorControl',
  content_rules: '/security/pipeline?module=content',
  recipient_check: '/security/pipeline?module=recipientCheck',
  intent_engine: '/security/pipeline?module=intentEngine',
  attachment_security: '/security/pipeline?module=attachment',
  advanced_filter_rules: '/security/pipeline?module=advancedRules',
  sender_filter: '/security/pipeline?module=senderFilter',
  auth_spoofing: '/security/pipeline?module=authSpoofing',
  similar_detection: '/security/pipeline?module=similarDetection',
  phishing_detection: '/agent-center/overview?agent=phishing&tab=config',
};

export function RuleEffectivenessPage() {
  const t = useTranslations('ruleEffectiveness');
  const locale = useLocale();
  const router = useRouter();
  const { setSelectedTenant, isSystemAdmin, isAdmin, effectiveTenantId } = useTenant();
  const { setViewer } = useProductForm();
  const { data: tenantList } = useQuery({
    queryKey: ['rule-effectiveness-current-tenant', effectiveTenantId],
    queryFn: () => listTenants({ search: '', status: 'active', pageSize: 100 }),
    enabled: !isSystemAdmin && effectiveTenantId != null,
    staleTime: 60_000,
  });
  const currentTenant = tenantList?.items.find((tenant) => tenant.id === effectiveTenantId);

  const [timeRange, setTimeRange] = useState<TimeRange>('7d');
  const [customRange, setCustomRange] = useState<CustomRange>(() => defaultCustomRange());
  // 相似检测下相似邮件检测/相同主题检测是两条独立策略，筛选项按策略拆分，
  // 而不是沿用 PolicyModule 三选一（那样无法单独筛出某一条相似检测策略）。
  const [stage, setStage] = useState<RuleEffectivenessStageId | 'all'>('all');
  const [moduleOptions, setModuleOptions] = useState<ModuleFilterOption[]>([]);
  const [durationBuckets, setDurationBuckets] = useState<ObserveDurationBucket[]>([]);
  const [scopeTenantId, setScopeTenantId] = useState<number | null>(null);
  const { scopeActive } = useSecurityScope(scopeTenantId);

  const { startDate, endDate } = useMemo(
    () => timeRangeToDates(timeRange, customRange),
    [timeRange, customRange],
  );

  const visibleModuleOptions = useMemo(() => stageModuleOptions(stage), [stage]);
  const effectiveModuleOptions = moduleOptions.length > 0 ? moduleOptions : visibleModuleOptions;
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

  // 分页只切片明细，KPI 和超期提醒始终使用筛选后的完整统计。
  const filterKey = JSON.stringify([startDate, endDate, effectiveModules, effectiveSimilarDetectionTypes, durationBuckets, scopeTenantId]);
  const [pagination, setPagination] = useState({ filterKey: '', page: 1, pageSize: 20 });
  if (pagination.filterKey !== filterKey) {
    setPagination({ ...pagination, filterKey, page: 1 });
  }
  const total = data?.rows.length ?? 0;
  const page = pagination.filterKey === filterKey
    ? Math.min(pagination.page, Math.max(1, Math.ceil(total / pagination.pageSize))) : 1;
  const pagedRows = (data?.rows ?? []).slice((page - 1) * pagination.pageSize, page * pagination.pageSize);

  // GT-14364：从未成功过的查询在重新请求时，TanStack Query 会清空 error 并回到 pending，
  // isError 随之变为 false，错误区域和重试按钮会在响应返回前被卸载。手动重试期间保留
  // 发起重试时的错误（含 403/其他的区分），按钮禁用并显示「正在重试」，直到本次重试结束。
  const [retryingFrom, setRetryingFrom] = useState<unknown>(null);
  const shownError = isError ? error : retryingFrom;
  const retryInFlight = isFetching || retryingFrom !== null;
  const handleRetry = useCallback(() => {
    setRetryingFrom(error);
    void refetch().finally(() => setRetryingFrom(null));
  }, [error, refetch]);
  const forbidden = shownError instanceof ApiError && shownError.status === 403;
  // GT-14373：请求持续无响应达到客户端超时，单独提示超时，不与服务报错混为一谈。
  const timedOut = !forbidden && isRuleEffectivenessTimeout(shownError);
  const errorKind = forbidden ? 'forbidden' : timedOut ? 'timeout' : 'error';

  // GT-14372：重置恢复租户、时间、策略模块、观察时长的默认筛选并按默认条件重新查询。
  // 默认条件的结果通常仍在缓存期内（staleTime 60s），切回默认会直接复用缓存而不请求，
  // 所以先把规则效能缓存标记为过期（不立即刷新，避免按修改后的条件多查一次）；
  // 已是默认条件时状态不变、不会切换查询，直接重新查询。
  const queryClient = useQueryClient();
  const handleReset = () => {
    setPagination((current) => ({ ...current, page: 1 }));
    const alreadyDefault = stage === 'all' && timeRange === '7d' && moduleOptions.length === 0
      && durationBuckets.length === 0 && scopeTenantId === null;
    if (alreadyDefault) {
      void refetch();
      return;
    }
    void queryClient.invalidateQueries({ queryKey: ['rule-effectiveness'], refetchType: 'none' });
    setStage('all');
    setTimeRange('7d');
    setCustomRange(defaultCustomRange());
    setModuleOptions([]);
    setDurationBuckets([]);
    setScopeTenantId(null);
  };

  // 携带 source=rule_effectiveness 标记，供目标配置页（策略流水线/智能体中心）
  // 识别来源并展示可返回的上下文提示条，不改变目标页原有的 deep-link 参数解析。
  const handleNavigateToConfig = useCallback((row: RuleEffectivenessRow) => {
    if (row.backend && isSystemAdmin) { setViewer("tenant"); setSelectedTenant(row.backend.tenant_id); }
    const configPath = row.config_path || CONFIG_PATH_BY_MODULE[row.policy_module];
    const separator = configPath.includes('?') ? '&' : '?';
    router.push(`/${locale}${configPath}${separator}source=rule_effectiveness`);
  }, [locale, router, isSystemAdmin, setViewer, setSelectedTenant]);

  // 统一跳转到邮件处置中心，携带模块/子策略/观察起始时间作为预置筛选条件，
  // 由处置中心侧解析 source=rule_effectiveness 并展示上下文提示条。
  const handleViewHits = useCallback((row: RuleEffectivenessRow) => {
    const query = buildEmailDisposalCenterQuery(row, startDate, endDate);
    router.push(`/${locale}/email-disposal/center?${query}`);
  }, [locale, router, startDate, endDate]);

  return (
    <PageShell data-testid="rule-effectiveness-page">
      {isAdmin && !isSystemAdmin && (
        <div className="-mx-4 -mt-4 mb-4 border-b border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning-foreground" data-testid="rule-effectiveness-tenant-context">
          {t('tenantContext', { tenant: currentTenant?.name ?? (effectiveTenantId ? `#${effectiveTenantId}` : t('currentTenant')) })}
        </div>
      )}
      <PageHeader title={t('title')} description={t('subtitle')} icon={Gauge} />

      <FilterBar
        stage={stage}
        onStageChange={(next) => { setStage(next); setModuleOptions(stageModuleOptions(next)); }}
        visibleModuleOptions={visibleModuleOptions}
        timeRange={timeRange}
        onTimeRangeChange={setTimeRange}
        customRange={customRange}
        onCustomRangeChange={setCustomRange}
        moduleOptions={moduleOptions}
        onModuleOptionsChange={setModuleOptions}
        durationBuckets={durationBuckets}
        onDurationBucketsChange={setDurationBuckets}
        onReset={handleReset}
        leftSlot={scopeActive ? <TenantScopeSelector value={scopeTenantId} onChange={setScopeTenantId} /> : null}
      />

      {shownError ? (
        <Card
          role="alert"
          data-testid={`rule-effectiveness-${errorKind}-state`}
          className="border-destructive/30 bg-destructive/5"
        >
          <CardHeader className="flex flex-row items-start gap-3">
            <span className="rounded-lg bg-destructive/10 p-2 text-destructive">
              {forbidden
                ? <ShieldX className="h-5 w-5" aria-hidden="true" />
                : timedOut
                  ? <TimerOff className="h-5 w-5" aria-hidden="true" />
                  : <AlertCircle className="h-5 w-5" aria-hidden="true" />}
            </span>
            <div className="min-w-0 space-y-1">
              <CardTitle className="text-base">
                {t(forbidden
                  ? 'error.forbiddenTitle'
                  : timedOut ? 'error.timeoutTitle' : 'error.loadFailedTitle')}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {t(forbidden
                  ? 'error.forbiddenDescription'
                  : timedOut ? 'error.timeoutDescription' : 'error.loadFailedDescription')}
              </p>
            </div>
          </CardHeader>
          <CardContent>
            <Button
              type="button"
              variant="outline"
              onClick={handleRetry}
              disabled={retryInFlight}
              data-testid="rule-effectiveness-retry"
            >
              <RefreshCw className={retryInFlight ? 'animate-spin' : ''} aria-hidden="true" />
              {t(retryInFlight ? 'error.retrying' : 'error.retry')}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {data && data.rows.length > 0 && (
            <ObserveTimeoutAlert rows={data.rows} onNavigateToConfig={handleNavigateToConfig} />
          )}

          <KpiCards data={data?.kpi} isLoading={isLoading} />

          <DetailTable
            rows={pagedRows}
            pagination={{
              page, pageSize: pagination.pageSize, total,
              onPageChange: (nextPage) => setPagination({ ...pagination, filterKey, page: nextPage }),
              onPageSizeChange: (pageSize) => setPagination({ filterKey, page: 1, pageSize }),
            }}
            isLoading={isLoading}
            onViewHits={handleViewHits}
            onNavigateToConfig={handleNavigateToConfig}
          />

        </>
      )}
    </PageShell>
  );
}
