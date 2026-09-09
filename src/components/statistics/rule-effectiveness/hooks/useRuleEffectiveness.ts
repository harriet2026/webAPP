import { useQuery } from '@tanstack/react-query';
import { getRuleEffectiveness, type ObserveDurationBucket, type PolicyModule } from '@/lib/api/rule-effectiveness';
import { useSecurityScope } from '@/components/statistics/security-overview/hooks/useSecurityScope';

// 复用安全总览已有的租户作用域解析逻辑（useSecurityScope），保持「租户范围」筛选
// 在各统计报表页的行为一致，不重新实现一套作用域解析。

export function useRuleEffectiveness(params: {
  startDate: string;
  endDate: string;
  modules: PolicyModule[];
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
      params.durationBuckets,
    ],
    queryFn: () =>
      getRuleEffectiveness(
        {
          startDate: params.startDate,
          endDate: params.endDate,
          modules: params.modules,
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
