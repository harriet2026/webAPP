'use client';

import { useAgentManagementAccess } from '@/components/agent-center/use-agent-management-access';

export function useThreatRetroAccess() {
  return useAgentManagementAccess('threat-retro');
}
