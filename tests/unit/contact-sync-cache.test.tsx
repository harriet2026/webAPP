import { createElement } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

const request = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api/client', () => ({
  apiRequest: request,
  useApiRequest: () => ({ apiRequest: request }),
  API_BASE: '/api/v1',
}));
import { useContactSourceMutations, useContactSyncLogs } from '@/components/organization/api';

describe('GT-12170 mounted contact tabs', () => {
  it('refreshes an already-mounted empty log after sync and polls its terminal state', async () => {
    let started = false;
    let reads = 0;
    request.mockImplementation(async (url: string) => {
      if (url.startsWith('/contact-sources/1/sync')) {
        started = true;
        return { sync_log_id: 1 };
      }
      if (url.startsWith('/contact-sync-logs')) {
        return { items: started ? [{ id: 1, status: ++reads === 1 ? 'running' : 'success' }] : [], total: started ? 1 : 0 };
      }
      throw new Error(`unexpected request: ${url}`);
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    client.setQueryData(['contacts', 'departments', 'behavior-control', 3], ['old']);
    const wrapper = ({ children }: { children: React.ReactNode }) => createElement(QueryClientProvider, { client }, children);
    const { result, unmount } = renderHook(() => ({ logs: useContactSyncLogs(), mutations: useContactSourceMutations() }), { wrapper });
    await waitFor(() => expect(result.current.logs.data?.items).toEqual([]));
    await act(async () => { await result.current.mutations.sync.mutateAsync({ id: 1, mode: 'full' }); });
    await waitFor(() => expect(result.current.logs.data?.items[0]?.status).toBe('running'));
    // The terminal poll must invalidate selectors again, after the start-time
    // invalidation: otherwise a slow sync leaves the old members on screen.
    client.setQueryData(['contacts', 'departments', 'behavior-control', 3], ['old']);
    await waitFor(() => expect(result.current.logs.data?.items[0]?.status).toBe('success'), { timeout: 2500 });
    expect(client.getQueryState(['contacts', 'departments', 'behavior-control', 3])?.isInvalidated).toBe(true);
    unmount();
    client.clear();
  });
});
