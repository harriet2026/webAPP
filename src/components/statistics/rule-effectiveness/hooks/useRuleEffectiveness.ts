import { useLocale, useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import {
  getRuleEffectiveness,
  type ObserveDurationBucket,
  type PolicyModule,
  type SimilarDetectionType,
} from '@/lib/api/rule-effectiveness-view';
import { useSecurityScope } from '@/components/statistics/security-overview/hooks/useSecurityScope';
import type { ApiRequestFn } from '@/lib/api/client';

// GT-14373：统计请求的客户端超时。与服务端统计接口的上下文超时（internal/api/statistics.go
// TimeoutDuration = 30s）一致——服务端到点即放弃，客户端再等也拿不到结果。
export const RULE_EFFECTIVENESS_TIMEOUT_MS = 30_000;

export function isRuleEffectivenessTimeout(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'TimeoutError';
}

// 给查询内的每个请求（报表分页、版本、快照）注入中止信号：任一请求超过超时时长无响应即以
// TimeoutError 中止；查询自身取消（离开页面、切换筛选）照常传递。用 setTimeout 而非
// AbortSignal.timeout，便于测试与浏览器自动化用虚拟时钟推进。
function withRequestTimeout(request: ApiRequestFn, querySignal: AbortSignal): ApiRequestFn {
  return async <T,>(path: string, options: Parameters<ApiRequestFn>[1] = {}): Promise<T> => {
    const controller = new AbortController();
    const abortWithQuery = () => controller.abort(querySignal.reason);
    if (querySignal.aborted) abortWithQuery();
    else querySignal.addEventListener('abort', abortWithQuery, { once: true });
    const timer = setTimeout(() => controller.abort(new DOMException('Request timed out', 'TimeoutError')), RULE_EFFECTIVENESS_TIMEOUT_MS);
    try {
      return await request<T>(path, { ...options, signal: controller.signal });
    } catch (err) {
      if (isRuleEffectivenessTimeout(controller.signal.reason)) throw controller.signal.reason;
      throw err;
    } finally {
      clearTimeout(timer);
      querySignal.removeEventListener('abort', abortWithQuery);
    }
  };
}

// 复用安全总览已有的租户作用域解析逻辑（useSecurityScope），保持「租户范围」筛选
// 在各统计报表页的行为一致，不重新实现一套作用域解析。

export function useRuleEffectiveness(params: {
  startDate: string;
  endDate: string;
  modules: PolicyModule[];
  // 仅在 modules 命中 similar_detection 时生效，进一步收窄到具体策略。
  similarDetectionTypes: SimilarDetectionType[];
  durationBuckets: ObserveDurationBucket[];
  scopeTenantId: number | null;
}) {
  const locale = useLocale();
  const translateSummary = useTranslations('ruleEffectiveness.detail.versionHistory');
  const { scopedRequest, resolvedScopeTenant, scopeResolved } = useSecurityScope(params.scopeTenantId);
  return useQuery({
    queryKey: [
      'rule-effectiveness',
      locale,
      resolvedScopeTenant,
      params.startDate,
      params.endDate,
      params.modules,
      params.similarDetectionTypes,
      params.durationBuckets,
    ],
    queryFn: ({ signal }) =>
      getRuleEffectiveness(
        {
          startDate: params.startDate,
          endDate: params.endDate,
          modules: params.modules,
          similarDetectionTypes: params.similarDetectionTypes,
          durationBuckets: params.durationBuckets,
          tenantId: resolvedScopeTenant,
        },
        withRequestTimeout(scopedRequest, signal),
        translateSummary,
      ),
    enabled: scopeResolved && !!params.startDate && !!params.endDate,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    // 超时不自动重试：默认重试 3 次会让用户再等 3 个完整超时周期才看到提示。
    retry: (failureCount, error) => !isRuleEffectivenessTimeout(error) && failureCount < 3,
  });
}
