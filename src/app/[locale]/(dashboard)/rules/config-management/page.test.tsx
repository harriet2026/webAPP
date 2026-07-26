import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import zh from '@/../messages/zh.json';
import ConfigManagementPage from './page';

// Task 9b: switching [rule_sync] role to `replica` via this generic
// config-override editor is destructive (spec §2 — first sync overwrites
// this node's local global rules wholesale). These tests cover the
// "switch to replica" confirm (must list the local global-rule count) and
// the site_id env-override hint, both special-cased in this page.

vi.mock('@/lib/api/client', () => ({
  useApiRequest: () => ({ apiRequest: vi.fn() }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const mockGetConfigFiles = vi.fn();
const mockGetOverrides = vi.fn();
const mockCreateOverride = vi.fn();
const mockUpdateOverride = vi.fn();
const mockDeleteOverride = vi.fn();
vi.mock('@/lib/api/config-files', () => ({
  getConfigFiles: (...args: unknown[]) => mockGetConfigFiles(...args),
  getConfigOverridesForFile: (...args: unknown[]) => mockGetOverrides(...args),
  createConfigOverride: (...args: unknown[]) => mockCreateOverride(...args),
  updateConfigOverride: (...args: unknown[]) => mockUpdateOverride(...args),
  deleteConfigOverride: (...args: unknown[]) => mockDeleteOverride(...args),
}));

const mockGetRuleSyncStatus = vi.fn();
vi.mock('@/lib/api/rule-sync', () => ({
  getRuleSyncStatus: (...args: unknown[]) => mockGetRuleSyncStatus(...args),
}));

const RULE_SYNC_FILE = {
  name: 'apiserver.cf',
  sections: [
    {
      name: 'rule_sync',
      entries: [
        { key: 'role', file_value: 'standalone' },
        { key: 'site_id', file_value: '' },
      ],
    },
  ],
};

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
  mockGetConfigFiles.mockReset().mockResolvedValue({ files: [RULE_SYNC_FILE] });
  mockGetOverrides.mockReset().mockResolvedValue([]);
  mockCreateOverride.mockReset().mockResolvedValue({});
  mockUpdateOverride.mockReset().mockResolvedValue({});
  mockDeleteOverride.mockReset().mockResolvedValue({});
  mockGetRuleSyncStatus.mockReset().mockResolvedValue({
    role: 'standalone',
    site_id: '',
    primary_addr: '',
    last_success_at: null,
    last_error: '',
    last_error_at: null,
    last_applied_generation: 0,
    generation: 0,
    global_rule_count: 7,
  });
});

describe('ConfigManagementPage rule_sync special-casing (Task 9b)', () => {
  it('confirms before switching role to replica, listing the local global-rule count', async () => {
    wrap();
    await waitFor(() => screen.getByText('role'));

    fireEvent.click(screen.getAllByLabelText('编辑')[0]);
    // Locate the override-value input by its current value rather than a
    // guessed placeholder: it's the font-mono input pre-filled with the
    // file's current value ('standalone').
    const inputs = screen.getAllByRole('textbox');
    const overrideInput = inputs.find(
      (el) => (el as HTMLInputElement).className.includes('font-mono') && (el as HTMLInputElement).value === 'standalone',
    );
    expect(overrideInput).toBeTruthy();
    fireEvent.change(overrideInput!, { target: { value: 'replica' } });

    fireEvent.click(screen.getByText('保存'));

    // The destructive confirm must appear with the fetched count baked in —
    // SABOTAGE TARGET: removing `{ count: ... }` from the description's
    // t() call (or hardcoding a literal) makes this assertion fail.
    await waitFor(() => expect(screen.getByText(/7 条全局规则/)).toBeTruthy());
    expect(mockUpdateOverride).not.toHaveBeenCalled();
    expect(mockCreateOverride).not.toHaveBeenCalled();
  });

  it('actually saves once the destructive confirm is accepted', async () => {
    wrap();
    await waitFor(() => screen.getByText('role'));
    fireEvent.click(screen.getAllByLabelText('编辑')[0]);
    const inputs = screen.getAllByRole('textbox');
    const overrideInput = inputs.find((el) => (el as HTMLInputElement).className.includes('font-mono') && (el as HTMLInputElement).value === 'standalone')!;
    fireEvent.change(overrideInput, { target: { value: 'replica' } });
    fireEvent.click(screen.getByText('保存'));
    await waitFor(() => expect(screen.getByText(/7 条全局规则/)).toBeTruthy());

    fireEvent.click(screen.getByText('确认切换为 replica'));

    await waitFor(() => expect(mockCreateOverride).toHaveBeenCalledTimes(1));
    expect(mockCreateOverride.mock.calls[0][0]).toMatchObject({
      config_file: 'apiserver.cf',
      section_name: 'rule_sync',
      config_key: 'role',
      config_value: 'replica',
    });
  });

  it('does NOT confirm for a non-destructive value change (e.g. leaving role as standalone)', async () => {
    wrap();
    await waitFor(() => screen.getByText('role'));
    fireEvent.click(screen.getAllByLabelText('编辑')[0]);
    const inputs = screen.getAllByRole('textbox');
    const overrideInput = inputs.find((el) => (el as HTMLInputElement).className.includes('font-mono') && (el as HTMLInputElement).value === 'standalone')!;
    fireEvent.change(overrideInput, { target: { value: 'primary' } });
    fireEvent.click(screen.getByText('保存'));

    await waitFor(() => expect(mockCreateOverride).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/条全局规则/)).toBeNull();
  });

  it('shows the OSG_RULESYNC_SITE_ID env-override hint only when editing site_id', async () => {
    wrap();
    await waitFor(() => screen.getByText('site_id'));
    expect(screen.queryByTestId('rule-sync-site-id-hint')).toBeNull();

    fireEvent.click(screen.getAllByLabelText('编辑')[1]);
    expect(await screen.findByTestId('rule-sync-site-id-hint')).toBeTruthy();
  });
});
