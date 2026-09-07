import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// GT-12427: 「处置设置」多租户下为租户自有配置。平台管理员在平台视角(未下钻到具体
// 租户,effectiveTenantId===null)访问本页 —— 例如手贴 URL 绕过被隐藏的侧栏入口 ——
// 必须拒绝渲染表单并显示 403,与同区兄弟模块 group-policy 一致。下钻进入某租户后
// (effectiveTenantId 非空)按该租户身份正常渲染表单;租户管理员/单租户形态同样渲染。

const tenantState = { effectiveTenantId: null as number | null };
const productFormState = { capabilities: { ai: true, multiTenant: true, saas: false } as { ai: boolean; multiTenant: boolean; saas: boolean } | null };
const authState = { isSystemAdmin: true };
const saveState = vi.hoisted(() => ({
  putDisposalSettings: vi.fn(),
  publicationPending: false,
  toastError: vi.fn(),
  currentGuard: null as { isDirty: boolean; onSave?: () => Promise<void> } | null,
}));
const requestState = vi.hoisted(() => ({ apiRequest: vi.fn() }));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock('@/hooks/use-tenant', () => ({
  useTenant: () => tenantState,
}));
vi.mock('@/contexts/product-form-context', () => ({
  useProductForm: () => productFormState,
}));
vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => authState,
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));
vi.mock('@/lib/api/client', () => ({
  useApiRequest: () => ({ apiRequest: requestState.apiRequest }),
  isPublicationPendingResponse: () => saveState.publicationPending,
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: saveState.toastError },
}));
// The disposal-settings API must never be hit while the page is in the 403
// state — the query is disabled via `enabled: !platformWithoutTenant`.
const getDisposalSettings = vi.fn().mockResolvedValue({
  ...({} as Record<string, unknown>),
  server_tz: 'Asia/Shanghai',
});
vi.mock('@/lib/api/disposal-settings', () => ({
  getDisposalSettings: (...args: unknown[]) => getDisposalSettings(...args),
  putDisposalSettings: (...args: unknown[]) => saveState.putDisposalSettings(...args),
}));
// The three tabs pull in heavy sub-trees; stub them so this test focuses on the
// page-level access gate, not tab internals (covered by their own tests).
vi.mock('./quarantine-settings-tab', () => ({
  QuarantineSettingsTab: ({ setValue }: { setValue: (path: string, value: unknown, options: { shouldDirty: boolean }) => void }) => (
    <>
      <button
        type="button"
        data-testid="stub-quarantine-tab"
        onClick={() => setValue('quarantine.portal_base_url', 'https://changed.example.test', { shouldDirty: true })}
      >
        edit
      </button>
      <button
        type="button"
        data-testid="stub-clear-notify-times"
        onClick={() => setValue('quarantine.notify_times', [], { shouldDirty: true })}
      >
        clear notification times
      </button>
      <button
        type="button"
        data-testid="stub-invalid-review"
        onClick={() => setValue('review.max_recheck_minutes', 0, { shouldDirty: true })}
      >
        invalidate review settings
      </button>
      <button
        type="button"
        data-testid="stub-invalid-recall"
        onClick={() => setValue('recall.task_timeout_seconds', 0, { shouldDirty: true })}
      >
        invalidate recall settings
      </button>
    </>
  ),
}));
vi.mock('./review-settings-tab', () => ({
  ReviewSettingsTab: () => <div data-testid="stub-review-tab" />,
}));
vi.mock('./recall-settings-tab', () => ({
  RecallSettingsTab: () => <div data-testid="stub-recall-tab" />,
}));

vi.mock('@/contexts/unsaved-guard-context', () => ({
  UnsavedGuardProvider: ({ children }: { children: React.ReactNode }) => children,
  useUnsavedGuard: () => ({
    registerGuard: (guard: { isDirty: boolean; onSave?: () => Promise<void> }) => {
      saveState.currentGuard = guard;
    },
    unregisterGuard: () => {
      saveState.currentGuard = null;
    },
  }),
}));

import { DisposalSettingsPage } from './disposal-settings-page';
import { UnsavedGuardProvider } from '@/contexts/unsaved-guard-context';
import { defaultDisposalSettings } from './schema';

function renderPage(qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  const view = render(
    <QueryClientProvider client={qc}>
      <UnsavedGuardProvider>
        <DisposalSettingsPage />
      </UnsavedGuardProvider>
    </QueryClientProvider>,
  );
  return { ...view, queryClient: qc };
}

describe('DisposalSettingsPage tenant-scope access gate (GT-12427)', () => {
  beforeEach(() => {
    getDisposalSettings.mockClear();
    tenantState.effectiveTenantId = null;
    productFormState.capabilities = { ai: true, multiTenant: true, saas: false };
    authState.isSystemAdmin = true;
    saveState.currentGuard = null;
    saveState.publicationPending = false;
    saveState.putDisposalSettings.mockReset();
    saveState.toastError.mockReset();
    saveState.putDisposalSettings.mockResolvedValue(defaultDisposalSettings());
    requestState.apiRequest = vi.fn();
    getDisposalSettings.mockResolvedValue({ ...defaultDisposalSettings(), server_tz: 'Asia/Shanghai' });
  });

  it('platform admin without a drilled-in tenant sees 403, not the settings form', async () => {
    renderPage();
    expect(await screen.findByTestId('disposal-settings-tenant-required')).toBeInTheDocument();
    expect(screen.getByText('403')).toBeInTheDocument();
    expect(screen.queryByTestId('disposal-settings-tabs')).not.toBeInTheDocument();
    // The query must be disabled in this state — no fetch fired.
    expect(getDisposalSettings).not.toHaveBeenCalled();
  });

  it('platform admin drilled into a tenant renders the settings form', async () => {
    tenantState.effectiveTenantId = 485;
    renderPage();
    expect(await screen.findByTestId('disposal-settings-tabs')).toBeInTheDocument();
    expect(screen.queryByTestId('disposal-settings-tenant-required')).not.toBeInTheDocument();
    expect(getDisposalSettings).toHaveBeenCalled();
  });

  it('tenant admin (not system admin) renders the settings form', async () => {
    authState.isSystemAdmin = false;
    tenantState.effectiveTenantId = 485;
    renderPage();
    expect(await screen.findByTestId('disposal-settings-tabs')).toBeInTheDocument();
    expect(screen.queryByTestId('disposal-settings-tenant-required')).not.toBeInTheDocument();
  });

  it('single-tenant form renders the form for platform admin (no tenant gate)', async () => {
    productFormState.capabilities = { ai: true, multiTenant: false, saas: false };
    tenantState.effectiveTenantId = null;
    renderPage();
    expect(await screen.findByTestId('disposal-settings-tabs')).toBeInTheDocument();
    expect(screen.queryByTestId('disposal-settings-tenant-required')).not.toBeInTheDocument();
  });

  it('rejects save-and-leave when the configuration write fails', async () => {
    authState.isSystemAdmin = false;
    tenantState.effectiveTenantId = 485;
    saveState.putDisposalSettings.mockRejectedValueOnce(new Error('configuration version conflict'));
    renderPage();

    fireEvent.click(await screen.findByTestId('stub-quarantine-tab'));
    await waitFor(() => expect(saveState.currentGuard?.isDirty).toBe(true));

    await expect(act(async () => saveState.currentGuard?.onSave?.())).rejects.toThrow('save failed');
    expect(saveState.currentGuard?.isDirty).toBe(true);
  });

  it('save-and-leave uses the current tenant request after the tenant context changes', async () => {
    authState.isSystemAdmin = false;
    tenantState.effectiveTenantId = 485;
    const tenantARequest = vi.fn();
    const tenantBRequest = vi.fn();
    requestState.apiRequest = tenantARequest;

    const view = renderPage();
    expect(await screen.findByTestId('disposal-settings-tabs')).toBeInTheDocument();

    tenantState.effectiveTenantId = 486;
    requestState.apiRequest = tenantBRequest;
    view.rerender(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <UnsavedGuardProvider>
          <DisposalSettingsPage />
        </UnsavedGuardProvider>
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByTestId('stub-quarantine-tab'));
    await waitFor(() => expect(saveState.currentGuard?.isDirty).toBe(true));
    await act(async () => saveState.currentGuard?.onSave?.());

    expect(saveState.putDisposalSettings).toHaveBeenCalledTimes(1);
    expect(saveState.putDisposalSettings.mock.calls[0]?.[1]).toBe(tenantBRequest);
    expect(saveState.putDisposalSettings.mock.calls[0]?.[1]).not.toBe(tenantARequest);
  });

  it('writes the saved settings into the tenant query cache (GT-12948)', async () => {
    authState.isSystemAdmin = false;
    tenantState.effectiveTenantId = 485;
    const saved = defaultDisposalSettings();
    saved.quarantine.portal_base_url = 'https://changed.example.test';
    saved.server_tz = 'Asia/Shanghai';
    saveState.putDisposalSettings.mockResolvedValueOnce(saved);

    const { queryClient } = renderPage();
    fireEvent.click(await screen.findByTestId('stub-quarantine-tab'));
    await waitFor(() => expect(saveState.currentGuard?.isDirty).toBe(true));
    await act(async () => saveState.currentGuard?.onSave?.());

    expect(queryClient.getQueryData(['disposal-settings', 485])).toEqual(saved);
  });

  it('optimistically caches submitted settings while publication is pending', async () => {
    authState.isSystemAdmin = false;
    tenantState.effectiveTenantId = 485;
    saveState.publicationPending = true;
    saveState.putDisposalSettings.mockResolvedValueOnce({ publication_status: 'pending' });

    const { queryClient } = renderPage();
    fireEvent.click(await screen.findByTestId('stub-quarantine-tab'));
    await waitFor(() => expect(saveState.currentGuard?.isDirty).toBe(true));
    await act(async () => saveState.currentGuard?.onSave?.());

    expect(queryClient.getQueryData(['disposal-settings', 485])).toMatchObject({
      quarantine: { portal_base_url: 'https://changed.example.test' },
      server_tz: 'Asia/Shanghai',
    });
  });

  it('names the missing notification-time configuration instead of showing only a generic validation toast', async () => {
    authState.isSystemAdmin = false;
    tenantState.effectiveTenantId = 485;
    const settings = defaultDisposalSettings();
    settings.quarantine.portal_base_url = 'https://mail.example.test';
    getDisposalSettings.mockResolvedValueOnce({ ...settings, server_tz: 'Asia/Shanghai' });
    renderPage();

    fireEvent.click(await screen.findByTestId('stub-clear-notify-times'));
    fireEvent.click(screen.getByTestId('disposal-settings-save'));

    await waitFor(() => expect(saveState.toastError).toHaveBeenCalledWith('notifyTimesRequired'));
    expect(saveState.putDisposalSettings).not.toHaveBeenCalled();
  });

  it.each([
    ['stub-invalid-review', 'maxRecheckMinutesRange', 'disposal-settings-tab-review'],
    ['stub-invalid-recall', 'recallTaskTimeoutRange', 'disposal-settings-tab-recall'],
  ])('names the invalid field and opens its tab for %s', async (buttonId, message, tabId) => {
    authState.isSystemAdmin = false;
    tenantState.effectiveTenantId = 485;
    const settings = defaultDisposalSettings();
    settings.quarantine.portal_base_url = 'https://mail.example.test';
    getDisposalSettings.mockResolvedValueOnce({ ...settings, server_tz: 'Asia/Shanghai' });
    renderPage();

    fireEvent.click(await screen.findByTestId(buttonId));
    fireEvent.click(screen.getByTestId('disposal-settings-save'));

    await waitFor(() => expect(saveState.toastError).toHaveBeenCalledWith(message));
    expect(screen.getByTestId(tabId)).toHaveAttribute('aria-selected', 'true');
    expect(saveState.putDisposalSettings).not.toHaveBeenCalled();
  });
});
