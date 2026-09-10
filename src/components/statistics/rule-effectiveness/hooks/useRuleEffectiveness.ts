import { useQuery } from '@tanstack/react-query';
import {
  getRuleEffectiveness,
  type ObserveDurationBucket,
  type PolicyModule,
  type SimilarDetectionType,
} from '@/lib/api/rule-effectiveness';
import { useSecurityScope } from '@/components/statistics/security-overview/hooks/useSecurityScope';

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
  const { scopedRequest, resolvedScopeTenant, scopeResolved } = useSecurityScope(params.scopeTenantId);
  return useQuery({
    queryKey: [
      'rule-effectiveness',
      resolvedScopeTenant,
      params.startDate,
      params.endDate,
      params.modules,
      params.similarDetectionTypes,
      params.durationBuckets,
    ],
    queryFn: () =>
      getRuleEffectiveness(
        {
          startDate: params.startDate,
          endDate: params.endDate,
          modules: params.modules,
          similarDetectionTypes: params.similarDetectionTypes,
          durationBuckets: params.durationBuckets,
          tenantId: resolvedScopeTenant,
        },
        scopedRequest,
      ),
    enabled: scopeResolved && !!params.startDate && !!params.endDate,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}
