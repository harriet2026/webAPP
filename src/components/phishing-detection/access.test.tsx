import { renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { usePhishingAccess } from './access';

const agentAccess = vi.fn((featureId: string) => ({
  featureId,
  status: 'ready' as const,
  canView: true,
  canEdit: true,
  readOnly: false,
}));

vi.mock('@/components/agent-center/use-agent-management-access', () => ({
  useAgentManagementAccess: (featureId: string) => agentAccess(featureId),
}));

it('delegates phishing access to the shared agent-management policy', () => {
  expect(renderHook(() => usePhishingAccess()).result.current.canEdit).toBe(true);
  expect(agentAccess).toHaveBeenCalledWith('phishing-detection');
});
