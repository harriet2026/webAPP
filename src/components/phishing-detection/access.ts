'use client';

import { useAgentManagementAccess } from '@/components/agent-center/use-agent-management-access';

export function usePhishingAccess() {
  return useAgentManagementAccess('phishing-detection');
}
