'use client';

import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  getAgentCenterOverview,
  type AgentCenterOverviewOptions,
} from '@/lib/api/agent-center';
import { useApiRequest } from '@/lib/api/client';
import { useProductForm } from '@/contexts/product-form-context';
import type { AgentCenterOverview } from '@/types/agent-center';

export const agentCenterOverviewQueryKey = (
  tenantId: number | null | undefined,
  includeStats = true,
) => (
  ['agent-center-overview', tenantId ?? null, includeStats] as const
);

export interface UseAgentCenterOverviewOptions extends AgentCenterOverviewOptions {
  enabled?: boolean;
}

// 仿冒邮件/威胁回溯智能体暂不对外露出：仅当产品形态切换器
// （OSGATEWAY_PRODUCT_FORM_SWITCHER=true，演示/开发环境）开启时展示，
// 生产默认只保留钓鱼智能体。智能体中心总览与安全策略流水线「智能分析层」
// 两个消费方都经由本 hook 取数，在此统一过滤即可同时覆盖。
const SWITCHER_ONLY_AGENTS = new Set<string>(['spoofing', 'threat-retro']);

export function useAgentCenterOverview(options: UseAgentCenterOverviewOptions = {}) {
  const { apiRequest, effectiveTenantId } = useApiRequest();
  const { switcherEnabled } = useProductForm();
  const includeStats = options.includeStats ?? true;
  const select = useCallback(
    (data: AgentCenterOverview): AgentCenterOverview => (
      switcherEnabled
        ? data
        : { ...data, agents: data.agents.filter((agent) => !SWITCHER_ONLY_AGENTS.has(agent.key)) }
    ),
    [switcherEnabled],
  );
  return useQuery({
    queryKey: agentCenterOverviewQueryKey(effectiveTenantId, includeStats),
    queryFn: () => getAgentCenterOverview(apiRequest, { includeStats }),
    enabled: options.enabled,
    staleTime: 30_000,
    select,
  });
}
