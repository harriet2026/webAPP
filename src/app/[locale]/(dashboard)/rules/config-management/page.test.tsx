import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';

import zh from '@/../messages/zh.json';
import ConfigManagementPage from './page';

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  useApiRequest: () => ({ apiRequest: vi.fn() }),
}));
const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMocks }));

const mockListSchemas = vi.fn();
const mockGetPlatform = vi.fn();
const mockPatchPlatform = vi.fn();
vi.mock('@/lib/api/scoped-configs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/scoped-configs')>()),
  listConfigSchemas: (...args: unknown[]) => mockListSchemas(...args),
  getPlatformConfig: (...args: unknown[]) => mockGetPlatform(...args),
  patchPlatformConfig: (...args: unknown[]) => mockPatchPlatform(...args),
}));

function wrap() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={zh as unknown as Record<string, unknown>}>
        <ConfigManagementPage />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockListSchemas.mockReset().mockResolvedValue([{
    namespace: 'apiserver', schema_version: 1, keys: [
      { path: 'server.port', type: 'string', scope: 'system_only', merge: 'replace', reload: 'restart', failure_mode: 'required', secret: false, has_system_default: true },
      { path: 'auth.max_login_attempts', type: 'int', scope: 'platform_only', merge: 'replace', reload: 'hot', failure_mode: 'required', secret: false, has_system_default: false },
    ],
  }]);
  toastMocks.success.mockReset();
  toastMocks.error.mockReset();
  mockGetPlatform.mockReset().mockResolvedValue({
    stored: { namespace: 'apiserver', scope_kind: 'platform', scope_id: 0, schema_version: 1, version: 7, document: {} },
    effective: {
      namespace: 'apiserver', tenant_id: 0, schema_version: 1, snapshot_version: 's1', platform_version: 7,
      tenant_version: 0, hash: 'h', document: { server: { port: '8080' }, auth: { max_login_attempts: 5 } },
      provenance: { 'server.port': 'system', 'auth.max_login_attempts': 'platform' },
    },
    published: true,
  });
  mockPatchPlatform.mockReset().mockResolvedValue({
    stored: {
      namespace: 'apiserver', scope_kind: 'platform', scope_id: 0,
      schema_version: 1, version: 8,
      document: { auth: { max_login_attempts: 6 } },
      checksum: 'next', updated_at: '2026-08-29T00:00:00Z',
    },
    effective: {
      namespace: 'apiserver', tenant_id: 0, schema_version: 1,
      snapshot_version: 's2', platform_version: 8, tenant_version: 0,
      hash: 'next',
      document: { server: { port: '8080' }, auth: { max_login_attempts: 6 } },
      provenance: { 'server.port': 'system', 'auth.max_login_attempts': 'platform' },
    },
    published: true,
  });
});

describe('ConfigManagementPage scoped configuration', () => {
  it('renders registry scope and keeps system-only keys read-only', async () => {
    wrap();
    await waitFor(() => expect(screen.getByText('server.port')).toBeTruthy());
    expect(screen.getByText('system_only')).toBeTruthy();
    const editButtons = screen.getAllByLabelText('编辑') as HTMLButtonElement[];
    expect(editButtons[0].disabled).toBe(true);
    expect(editButtons[1].disabled).toBe(false);
  });

  it('patches a platform key with the scoped row version', async () => {
    wrap();
    await waitFor(() => expect(screen.getByText('auth.max_login_attempts')).toBeTruthy());
    fireEvent.click(screen.getAllByLabelText('编辑')[1]);
    const value = screen.getAllByRole('textbox').find((input) => (input as HTMLInputElement).value === '5');
    expect(value).toBeTruthy();
    fireEvent.change(value!, { target: { value: '6' } });
    fireEvent.click(screen.getByText('保存'));
    await waitFor(() => expect(mockPatchPlatform).toHaveBeenCalled());
    await waitFor(() => {
      expect(toastMocks.success.mock.calls.length + toastMocks.error.mock.calls.length).toBeGreaterThan(0);
    });
    expect(toastMocks.error.mock.calls).toEqual([]);
    expect(toastMocks.success).toHaveBeenCalled();
    expect(mockPatchPlatform.mock.calls[0].slice(0, 3)).toEqual([
      'apiserver', 7, [{ op: 'set', path: 'auth.max_login_attempts', value: 6 }],
    ]);
  });
});
