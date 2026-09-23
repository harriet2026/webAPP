import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BehaviorControlDrawer } from '@/components/security/behavior-control/BehaviorControlDrawer';
import { formToCreateBody, resolveBehaviorControlRule } from '@/lib/api/behavior-control';
import type { BehaviorControlFormData } from '@/types/behavior-control';

const { auth, fetchMock } = vi.hoisted(() => ({
  auth: {
    isSystemAdmin: true,
    selectedTenantId: 42 as number | null,
    user: { role: 'system_admin', tenant_id: null as number | null },
  },
  fetchMock: vi.fn(),
}));

vi.mock('@/contexts/auth-context', () => ({ useAuth: () => auth }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const form: BehaviorControlFormData = {
  name: 'tenant behavior rule',
  priority: 600,
  is_active: true,
  direction: 'outbound',
  object_config: { type: 'global' },
  time_window: '15min',
  conditions: [{ dim: 'mail_count', threshold: 10 }],
  dim_a: 'mail_count',
  threshold_a: 10,
  or_enabled: false,
  action: 'audit',
};

describe('behavior-control saves retain tenant context', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) =>
      new Response(JSON.stringify(init.method === 'GET' ? { items: [] } : { id: 7 }), {
        status: init.method === 'POST' ? 201 : 200,
        headers: { 'Content-Type': 'application/json' },
      }));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it.each([
    ['system_admin', 'create'], ['system_admin', 'update'],
    ['tenant_admin', 'create'], ['tenant_admin', 'update'],
  ] as const)('%s %s sends X-Tenant-ID from the effective tenant', async (role, operation) => {
    auth.isSystemAdmin = role === 'system_admin';
    auth.selectedTenantId = auth.isSystemAdmin ? 42 : null;
    auth.user = { role, tenant_id: auth.isSystemAdmin ? null : 43 };
    const editing = operation === 'update' ? resolveBehaviorControlRule({
      ...formToCreateBody(form), id: 7, tenant_id: auth.isSystemAdmin ? 42 : 43,
      metadata: { ...formToCreateBody(form).metadata },
      rule_class: 'action', stage: 'rcpt',
      created_at: '2026-09-08T00:00:00Z', updated_at: '2026-09-08T00:00:00Z',
    }) : null;
    const onOpenChange = vi.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <BehaviorControlDrawer open onOpenChange={onOpenChange} editing={editing} defaults={form} />
      </QueryClientProvider>,
    );
    await userEvent.setup().click(screen.getByTestId('behavior-control-save'));

    const method = operation === 'create' ? 'POST' : 'PUT';
    const path = operation === 'create' ? '/api/v1/unified-rules' : '/api/v1/unified-rules/7';
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(path, expect.objectContaining({
      method,
      headers: expect.objectContaining({ 'X-Tenant-ID': auth.isSystemAdmin ? '42' : '43' }),
    })));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    client.clear();
  });
});
