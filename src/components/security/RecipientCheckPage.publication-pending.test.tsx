import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ScopedConfigView } from '@/lib/api/scoped-configs';
import { RecipientCheckPage } from './RecipientCheckPage';

const mocks = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  translate: (key: string) => key,
}));

vi.mock('next-intl', () => ({ useTranslations: () => mocks.translate }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/lib/api/client', async (orig) => {
  const actual = await orig<typeof import('@/lib/api/client')>();
  return {
    ...actual,
    useApiRequest: () => ({ apiRequest: mocks.apiRequest, effectiveTenantId: 832 }),
  };
});
vi.mock('./useModuleMaster', () => ({
  useModuleMaster: () => ({ enabled: true, saving: false, toggle: vi.fn(), editable: true }),
}));
vi.mock('./PipelinePanelHeader', () => ({
  PipelinePanelHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const limit = {
  mode: 'detailed' as const,
  is_active: true,
  // Deliberately differ from RecipientCheckPage's factory defaults. This makes
  // the load-guard regression prove the first writable payload is hydrated
  // from the server instead of merely observing an enabled Save button.
  inbound_limit: { limit: 31, scope: 'local' as const, action: 'reject' as const },
  outbound_limit: { limit: 51, scope: 'all' as const, action: 'audit' as const },
  internal_limit: { limit: 21, scope: 'local' as const, action: 'quarantine' as const },
  merged_limit: { limit: 52, action: 'audit' as const },
};

function scopedView(version: number, existenceEnabled = false, published = true): ScopedConfigView {
  const document = {
    recipient_policy: {
      limit,
      check: { existence_enabled: existenceEnabled, existence_action: 'reject' },
    },
  };
  return {
    published,
    stored: {
      namespace: 'antispam', scope_kind: 'tenant', scope_id: 832,
      schema_version: 1, version, document,
      checksum: `v${version}`, updated_at: '2026-08-28T00:00:00Z',
    },
    effective: {
      namespace: 'antispam', tenant_id: 832, schema_version: 1,
      snapshot_version: `v${version}`, platform_version: 3, tenant_version: version,
      hash: `v${version}`, document, provenance: {},
    },
  };
}

function renderPage(client: QueryClient) {
  return render(
    <QueryClientProvider client={client}>
      <RecipientCheckPage embedded />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mocks.apiRequest.mockReset();
});

describe('RecipientCheckPage publication-pending cache contract', () => {
  it('accepts a full HTTP 202 ScopedConfigView without refetching the stale runtime snapshot', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(['tenant-config', 'antispam', 832], scopedView(7));
    const full202 = scopedView(8, false, false);
    // The DB row is v8, while the effective half deliberately mimics the old
    // Manager v7 snapshot returned when publication failed.
    full202.effective = scopedView(7).effective;

    mocks.apiRequest.mockImplementation(async (path: string, options?: { method?: string }) => {
      if (path === '/behavior-control/recipient-limit-config') return limit;
      if (path === '/behavior-control/recipient-check-config') {
        return { existence_enabled: false, existence_action: 'reject' };
      }
      if (path === '/behavior-control/recipient-check/directory-status') {
        return { available: true, source_count: 1, contact_count: 1, stale_minutes: 30 };
      }
      if (path === '/behavior-control/recipient-policy' && options?.method === 'PUT') return full202;
      throw new Error(`unexpected ${options?.method ?? 'GET'} ${path}`);
    });

    renderPage(client);
    const existence = await screen.findByRole('switch', { name: 'recipientCheck.existence.title' });
    const save = screen.getByRole('button', { name: 'common.save' });
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(existence);
    await waitFor(() => expect(existence).toBeChecked());
    fireEvent.click(save);

    await waitFor(() => expect(mocks.apiRequest).toHaveBeenCalledWith(
      '/behavior-control/recipient-policy',
      expect.objectContaining({ method: 'PUT' }),
    ));
    await waitFor(() => expect(existence).toBeChecked());

    expect(mocks.apiRequest.mock.calls.filter(([path]) =>
      path === '/behavior-control/recipient-limit-config')).toHaveLength(1);
    expect(mocks.apiRequest.mock.calls.filter(([path]) =>
      path === '/behavior-control/recipient-check-config')).toHaveLength(1);
    expect(client.getQueryData(['recipient-check-config', 832])).toEqual({
      existence_enabled: true,
      existence_action: 'reject',
    });
    const cached = client.getQueryData<ScopedConfigView>(['tenant-config', 'antispam', 832]);
    expect(cached?.stored?.version).toBe(8);
    expect(cached?.effective.tenant_version).toBe(8);
    expect(cached?.effective.document).toMatchObject({
      recipient_policy: { check: { existence_enabled: true, existence_action: 'reject' } },
    });
  });

  it('accepts the generic publication_pending acknowledgement and advances an existing exact-tenant cache', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(['tenant-config', 'antispam', 832], scopedView(7));
    mocks.apiRequest.mockImplementation(async (path: string, options?: { method?: string }) => {
      if (path === '/behavior-control/recipient-limit-config') return limit;
      if (path === '/behavior-control/recipient-check-config') {
        return { existence_enabled: false, existence_action: 'reject' };
      }
      if (path === '/behavior-control/recipient-check/directory-status') {
        return { available: true, source_count: 1, contact_count: 1, stale_minutes: 30 };
      }
      if (path === '/behavior-control/recipient-policy' && options?.method === 'PUT') {
        return { committed: true, published: false, status: 'publication_pending' };
      }
      throw new Error(`unexpected ${options?.method ?? 'GET'} ${path}`);
    });

    renderPage(client);
    const existence = await screen.findByRole('switch', { name: 'recipientCheck.existence.title' });
    const save = screen.getByRole('button', { name: 'common.save' });
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(existence);
    await waitFor(() => expect(existence).toBeChecked());
    fireEvent.click(save);

    await waitFor(() => {
      const cached = client.getQueryData<ScopedConfigView>(['tenant-config', 'antispam', 832]);
      expect(cached?.stored?.version).toBe(8);
      expect(cached?.effective.tenant_version).toBe(8);
      expect(cached?.effective.document).toMatchObject({
        recipient_policy: { check: { existence_enabled: true } },
      });
    });
    expect(mocks.apiRequest.mock.calls.filter(([path]) =>
      path === '/behavior-control/recipient-check-config')).toHaveLength(1);
  });
});

describe('RecipientCheckPage configuration load guard', () => {
  it('hides fallback defaults and disables writes until a failed configuration load is retried successfully', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let limitAttempts = 0;
    mocks.apiRequest.mockImplementation(async (path: string, options?: { method?: string }) => {
      if (path === '/behavior-control/recipient-limit-config') {
        limitAttempts += 1;
        if (limitAttempts === 1) throw new Error('server unavailable');
        return limit;
      }
      if (path === '/behavior-control/recipient-check-config') {
        return { existence_enabled: false, existence_action: 'reject' };
      }
      if (path === '/behavior-control/recipient-check/directory-status') {
        return { available: true, source_count: 1, contact_count: 1, stale_minutes: 30 };
      }
      if (path === '/behavior-control/recipient-policy' && options?.method === 'PUT') {
        return { committed: true, published: true, status: 'published' };
      }
      throw new Error(`unexpected GET ${path}`);
    });

    renderPage(client);

    expect(await screen.findByTestId('recipient-check-load-error')).toBeInTheDocument();
    expect(screen.queryByTestId('recipient-check-config-content')).not.toBeInTheDocument();
    expect(screen.getByTestId('recipient-check-save')).toBeDisabled();
    expect(screen.getByTestId('recipient-check-reset')).toBeDisabled();
    fireEvent.click(screen.getByTestId('recipient-check-save'));
    expect(mocks.apiRequest.mock.calls.some(([path, options]) =>
      path === '/behavior-control/recipient-policy' && options?.method === 'PUT')).toBe(false);

    fireEvent.click(screen.getByTestId('recipient-check-load-retry'));

    await waitFor(() => expect(screen.getByTestId('recipient-check-config-content')).toBeInTheDocument());
    expect(screen.queryByTestId('recipient-check-load-error')).not.toBeInTheDocument();
    expect(screen.getByTestId('recipient-check-save')).toBeEnabled();
    expect(screen.getByTestId('recipient-check-reset')).toBeEnabled();
    expect((screen.getAllByRole('spinbutton') as HTMLInputElement[]).map((input) => input.value))
      .toEqual(['31', '51', '21']);
    expect(limitAttempts).toBe(2);

    fireEvent.click(screen.getByTestId('recipient-check-save'));
    await waitFor(() => expect(mocks.apiRequest).toHaveBeenCalledWith(
      '/behavior-control/recipient-policy',
      expect.objectContaining({
        method: 'PUT',
        body: {
          limit,
          check: { existence_enabled: false, existence_action: 'reject' },
        },
      }),
    ));
  });
});
