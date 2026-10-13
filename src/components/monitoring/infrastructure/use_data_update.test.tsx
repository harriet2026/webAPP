import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, QueryObserver } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import { useDataUpdate } from './use_data_update';

describe('infrastructure successful fetch time', () => {
  it('updates on polling even for identical payloads and keeps an initial failure empty', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let fail = true;
    const observer = new QueryObserver(client, {
      queryKey: ['monitoring', 'hardware', 'dev', '1h'],
      queryFn: async () => { if (fail) throw new Error('offline'); return { value: 1 }; },
      refetchInterval: 30,
    });
    const stop = observer.subscribe(() => {});
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const view = renderHook(() => useDataUpdate('hardware', 'dev', '1h'), { wrapper });
    await waitFor(() => expect(view.result.current.failed).toBe(true));
    expect(view.result.current.updatedAt).toBe(0);
    fail = false;
    await waitFor(() => expect(view.result.current.updatedAt).toBeGreaterThan(0));
    const first = view.result.current.updatedAt;
    await waitFor(() => expect(view.result.current.updatedAt).toBeGreaterThan(first));
    view.unmount(); stop(); client.clear();
  });

  it('tracks successful refreshes, scopes cached data, and excludes inactive queries', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const key = ['monitoring', 'hardware', 'dev', '1h'];
    const observer = new QueryObserver(client, { queryKey: key, queryFn: async () => ({}), staleTime: Infinity });
    client.setQueryData(key, {}, { updatedAt: 1000 });
    const unsubscribe = observer.subscribe(() => {});
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const view = renderHook(({ node, range }) => useDataUpdate('hardware', node, range), { wrapper, initialProps: { node: 'dev', range: '1h' } });
    await waitFor(() => expect(view.result.current.updatedAt).toBe(1000));
    act(() => { client.setQueryData(key, {}, { updatedAt: 2000 }); });
    await waitFor(() => expect(view.result.current.updatedAt).toBe(2000));
    view.rerender({ node: 'other', range: '1h' });
    await waitFor(() => expect(view.result.current.updatedAt).toBe(0));
    view.rerender({ node: 'dev', range: '7d' });
    await waitFor(() => expect(view.result.current.updatedAt).toBe(0));
    view.rerender({ node: 'dev', range: '1h' });
    await waitFor(() => expect(view.result.current.updatedAt).toBe(2000));
    act(() => unsubscribe());
    await waitFor(() => expect(view.result.current.updatedAt).toBe(0));
    view.unmount(); client.clear();
  });

  it('waits for all blocks, preserves time on failed refresh, and recovers', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const storage = ['monitoring', 'storage', 'dev'];
    const backup = ['monitoring', 'backup', 'dev'];
    let rejectBackup = false;
    let resolveStorage!: (value: object) => void;
    const a = new QueryObserver(client, { queryKey: storage, queryFn: () => new Promise<object>((resolve) => { resolveStorage = resolve; }), staleTime: Infinity });
    const b = new QueryObserver(client, { queryKey: backup, queryFn: async () => { if (rejectBackup) throw new Error('offline'); return {}; }, staleTime: Infinity });
    const stopA = a.subscribe(() => {});
    const stopB = b.subscribe(() => {});
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const view = renderHook(({ tab }) => useDataUpdate(tab, 'dev', '24h'), { wrapper, initialProps: { tab: 'storage' } });
    expect(view.result.current.updatedAt).toBe(0);
    await act(async () => { resolveStorage({}); });
    await waitFor(() => expect(view.result.current.updatedAt).toBeGreaterThan(0));
    const time = view.result.current.updatedAt;
    rejectBackup = true;
    await act(async () => { await b.refetch(); });
    await waitFor(() => expect(view.result.current.failed).toBe(true));
    act(() => { client.setQueryData(storage, {}, { updatedAt: time + 10000 }); });
    expect(view.result.current.updatedAt).toBe(time);
    view.rerender({ tab: 'hardware' });
    await waitFor(() => expect(view.result.current.updatedAt).toBe(0));
    view.rerender({ tab: 'storage' });
    rejectBackup = false;
    await act(async () => { await b.refetch(); });
    await waitFor(() => expect(view.result.current.failed).toBe(false));
    expect(view.result.current.updatedAt).toBe(Math.min(client.getQueryState(storage)!.dataUpdatedAt, client.getQueryState(backup)!.dataUpdatedAt));
    view.unmount(); stopA(); stopB(); client.clear();
  });
});
