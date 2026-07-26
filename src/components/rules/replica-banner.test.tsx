import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import zh from '@/../messages/zh.json';
import { ReplicaBanner } from './replica-banner';
import type { RuleSyncStatus } from '@/lib/api/rule-sync';

// Task 9b: the replica banner is the feature's core default-off invariant —
// a standalone (or primary) node must render NOTHING here, byte-for-byte
// identical to a build that never had this feature. These tests exist
// specifically to catch a regression where the banner is (accidentally or
// via a "helpful" refactor) rendered unconditionally: see the sabotage note
// on the first test below.

let mockIsSystemAdmin = true;
vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ isSystemAdmin: mockIsSystemAdmin }),
}));

const mockApiRequest = vi.fn();
vi.mock('@/lib/api/client', () => ({
  useApiRequest: () => ({ apiRequest: mockApiRequest }),
}));

const mockGetRuleSyncStatus = vi.fn();
vi.mock('@/lib/api/rule-sync', () => ({
  getRuleSyncStatus: (...args: unknown[]) => mockGetRuleSyncStatus(...args),
}));

function wrap(ui: ReactNode, client: QueryClient) {
  return (
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={zh as unknown as Record<string, unknown>}>
        {ui}
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}

/** Waits until the rule-sync-status query has actually settled (success or error) —
 * asserting DOM absence right after `mockGetRuleSyncStatus` was merely CALLED is racy:
 * the query resolves and re-renders on a later microtask, so an assertion made too
 * early would pass "by accident" (still on the pre-resolve render) even if the
 * component's role-gate were broken. This is the fix for exactly that trap.
 *
 * `requireResolved` (default true) additionally requires `status !== 'pending'` —
 * i.e. the query actually fetched and reached success/error. Pass `false` for a
 * query that is expected to stay `enabled: false` forever (the non-system-admin
 * case below): such a query's `fetchStatus` becomes 'idle' immediately and NEVER
 * leaves `status: 'pending'` (react-query has no "this will never fetch" terminal
 * state), so the default `requireResolved: true` behavior would spin until
 * testing-library's wait timeout and fail for the wrong reason. */
async function waitForSettled(client: QueryClient, key: unknown[], requireResolved = true) {
  await waitFor(() => {
    const state = client.getQueryState(key);
    expect(state?.fetchStatus).toBe('idle');
    if (requireResolved) {
      expect(state?.status).not.toBe('pending');
    }
  });
}

function status(overrides: Partial<RuleSyncStatus> = {}): RuleSyncStatus {
  return {
    role: 'standalone',
    site_id: '',
    primary_addr: '',
    last_success_at: null,
    last_error: '',
    last_error_at: null,
    last_applied_generation: 0,
    generation: 0,
    global_rule_count: 0,
    stale: false,
    stale_after_seconds: 900,
    ...overrides,
  };
}

describe('ReplicaBanner', () => {
  beforeEach(() => {
    mockIsSystemAdmin = true;
    mockApiRequest.mockReset();
    mockGetRuleSyncStatus.mockReset();
  });

  // SABOTAGE-VERIFIED: changing the component's guard from
  // `if (!data || data.role !== 'replica') return null;` to `if (!data)
  // return null;` (i.e. dropping the role check, so any resolved status
  // renders the banner) makes this test fail — the banner appears for
  // role === 'standalone'. Confirmed red, then restored.
  it('renders nothing on a standalone node (the default)', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mockGetRuleSyncStatus.mockResolvedValue(status({ role: 'standalone' }));
    const { container } = render(wrap(<ReplicaBanner />, client));
    await waitForSettled(client, ['rule-sync-status']);
    expect(screen.queryByTestId('replica-mode-banner')).toBeNull();
    expect(container.textContent).toBe('');
  });

  it('renders nothing on a primary node', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mockGetRuleSyncStatus.mockResolvedValue(status({ role: 'primary' }));
    render(wrap(<ReplicaBanner />, client));
    await waitForSettled(client, ['rule-sync-status']);
    expect(screen.queryByTestId('replica-mode-banner')).toBeNull();
  });

  it('shows role, last-sync time, and primary address on a replica node', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mockGetRuleSyncStatus.mockResolvedValue(
      status({
        role: 'replica',
        primary_addr: 'https://primary.example:8081',
        last_success_at: '2026-07-16T03:04:05Z',
      }),
    );
    render(wrap(<ReplicaBanner />, client));
    const banner = await screen.findByTestId('replica-mode-banner');
    expect(banner.textContent).toContain('副本模式');
    expect(banner.textContent).toContain('https://primary.example:8081');
  });

  it('shows a "never synced" placeholder instead of an invalid date', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mockGetRuleSyncStatus.mockResolvedValue(
      status({ role: 'replica', primary_addr: 'https://primary.example:8081', last_success_at: null }),
    );
    render(wrap(<ReplicaBanner />, client));
    const banner = await screen.findByTestId('replica-mode-banner');
    expect(banner.textContent).toContain('尚未同步');
  });

  // Spec §4.4: "同步滞后超阈值变红". The threshold itself is the server's
  // decision (internal/api/rulesync_status.go's ruleSyncStale) — these tests
  // pin only that the component honours the verdict it is handed, in both
  // directions. A test for just one direction would pass against a component
  // that hard-codes that one palette.
  it('renders a fresh replica in the calm (non-warning) palette', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mockGetRuleSyncStatus.mockResolvedValue(
      status({
        role: 'replica',
        primary_addr: 'https://primary.example:8081',
        last_success_at: '2026-07-16T03:04:05Z',
        stale: false,
      }),
    );
    render(wrap(<ReplicaBanner />, client));
    const banner = await screen.findByTestId('replica-mode-banner');
    expect(banner.getAttribute('data-stale')).toBe('false');
    expect(banner.className).toContain('sky');
    expect(banner.className).not.toContain('rose');
    expect(banner.textContent).not.toContain('同步滞后');
  });

  it('turns the banner red and says why when the server reports stale', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mockGetRuleSyncStatus.mockResolvedValue(
      status({
        role: 'replica',
        primary_addr: 'https://primary.example:8081',
        last_success_at: '2026-07-16T03:04:05Z',
        stale: true,
      }),
    );
    render(wrap(<ReplicaBanner />, client));
    const banner = await screen.findByTestId('replica-mode-banner');
    expect(banner.getAttribute('data-stale')).toBe('true');
    expect(banner.className).toContain('rose');
    expect(banner.className).not.toContain('sky');
    // Colour alone is not an explanation, and is nothing at all to a
    // colour-blind or screen-reader user: the reason must be in the text.
    expect(banner.textContent).toContain('同步滞后');
  });

  // The worst state the feature has — read-only rules with nothing arriving to
  // replace them — and the one an elapsed-time check would get backwards.
  it('renders a never-synced replica as stale when the server says so', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mockGetRuleSyncStatus.mockResolvedValue(
      status({
        role: 'replica',
        primary_addr: 'https://primary.example:8081',
        last_success_at: null,
        stale: true,
      }),
    );
    render(wrap(<ReplicaBanner />, client));
    const banner = await screen.findByTestId('replica-mode-banner');
    expect(banner.getAttribute('data-stale')).toBe('true');
    expect(banner.className).toContain('rose');
    expect(banner.textContent).toContain('尚未同步');
  });

  // The status endpoint is system_admin-only; a tenant_admin's request would
  // just 403. Skipping the fetch entirely (rather than firing a
  // guaranteed-failing request on every rule-page visit) is the point of
  // this test.
  it('does not query rule-sync status for a non-system-admin', async () => {
    mockIsSystemAdmin = false;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(wrap(<ReplicaBanner />, client));
    // requireResolved: false -- this query is `enabled: false` and must NEVER
    // fetch at all, so there is no success/error to await; see waitForSettled's
    // doc for why the default (requireResolved: true) would hang here.
    await waitForSettled(client, ['rule-sync-status'], false);
    expect(mockGetRuleSyncStatus).not.toHaveBeenCalled();
  });
});
