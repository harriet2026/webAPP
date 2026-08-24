'use client';

import { useAgentManagementAccess } from '@/components/agent-center/use-agent-management-access';

export function useSpoofingAccess() {
  return useAgentManagementAccess('spoofing-detection');
}
