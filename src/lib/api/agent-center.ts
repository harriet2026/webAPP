import type { ApiRequestFn } from '@/lib/api/client';
import type { AgentCenterOverview } from '@/types/agent-center';

export interface AgentCenterOverviewOptions {
  includeStats?: boolean;
}

export function getAgentCenterOverview(
  apiRequest: ApiRequestFn,
  options: AgentCenterOverviewOptions = {},
): Promise<AgentCenterOverview> {
  const path = options.includeStats === false
    ? '/agent-center/overview?include_stats=false'
    : '/agent-center/overview';
  return apiRequest<AgentCenterOverview>(path);
}
