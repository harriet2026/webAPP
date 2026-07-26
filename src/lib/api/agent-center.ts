import type { ApiRequestFn } from '@/lib/api/client';
import type { AgentCenterOverview } from '@/types/agent-center';

export function getAgentCenterOverview(apiRequest: ApiRequestFn): Promise<AgentCenterOverview> {
  return apiRequest<AgentCenterOverview>('/agent-center/overview');
}
