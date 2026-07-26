import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// jsdom has no ResizeObserver; the table's OverflowCell uses it.
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

const { mockBatchRelease, mockGetList, toastError } = vi.hoisted(() => ({
  mockBatchRelease: vi.fn(),
  mockGetList: vi.fn(),
  toastError: vi.fn(),
}));

const MULTI_RECIPIENT_ITEM = {
  id: 1,
  quarantine_id: 'q-multi-1',
  sender: 'attacker@evil.test',
  recipients: ['userA@example.com', 'userB@example.com'],
  subject: 'multi recipient mail',
  reason: 'phishing',
  quarantined_at: '2026-07-17T00:00:00Z',
  expires_at: '2026-08-17T00:00:00Z',
  released_at: null,
  storage_size: 1024,
};

vi.mock('@/lib/api/quarantine', () => ({
  getQuarantineList: mockGetList,
  batchReleaseQuarantine: mockBatchRelease,
  getQuarantinePreview: vi.fn(),
  downloadQuarantineEmail: vi.fn(),
}));

vi.mock('@/lib/api/client', () => ({
  useApiRequest: () => ({ apiRequest: vi.fn() }),
}));

vi.mock('@/hooks/use-tenant', () => ({
  useTenant: () => ({ effectiveTenantId: 1, isSystemAdmin: true, isViewingAllTenants: false }),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: toastError, warning: vi.fn() },
}));

vi.mock('@/components/email/email-preview-dialog', () => ({
  EmailPreviewDialog: () => null,
}));

import QuarantinePage from '@/app/[locale]/(dashboard)/quarantine/page';

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return render(<QuarantinePage />, { wrapper });
}

/**
 * Selects the multi-recipient row and opens the batch-release dialog.
 */
async function openReleaseDialog() {
  renderPage();
  await screen.findByText('multi recipient mail');

  // The row checkbox — the "select all" header checkbox is the first one.
  const checkboxes = await screen.findAllByRole('checkbox');
  fireEvent.click(checkboxes[checkboxes.length - 1]);

  fireEvent.click(await screen.findByRole('button', { name: /quarantine\.batchRelease/ }));
  await screen.findByRole('dialog');
}

describe('quarantine batch release: target mailbox', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetList.mockResolvedValue({ total: 1, page: 1, limit: 20, items: [MULTI_RECIPIENT_ITEM] });
    mockBatchRelease.mockResolvedValue({});
  });

  it('omits target_email when the target mailbox is blank, so all original recipients are delivered to (GT-12172)', async () => {
    await openReleaseDialog();

    // Release without typing a target mailbox.
    fireEvent.click(screen.getByRole('button', { name: /quarantine\.release$/ }));

    await waitFor(() => expect(mockBatchRelease).toHaveBeenCalledTimes(1));

    const [body] = mockBatchRelease.mock.calls[0];
    expect(body.items).toEqual([{ quarantine_id: 'q-multi-1' }]);
    // The backend narrows delivery to a single mailbox whenever target_email is
    // present, dropping every co-recipient. A blank input must not send it --
    // not even as an empty string, which would still round-trip as a key.
    expect(body.items[0]).not.toHaveProperty('target_email');
    expect(toastError).not.toHaveBeenCalled();
  });

  it('still sends target_email when an override mailbox is entered', async () => {
    await openReleaseDialog();

    fireEvent.change(screen.getByPlaceholderText('quarantine.releaseToPlaceholder'), {
      target: { value: 'redirect@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /quarantine\.release$/ }));

    await waitFor(() => expect(mockBatchRelease).toHaveBeenCalledTimes(1));

    const [body] = mockBatchRelease.mock.calls[0];
    expect(body.items).toEqual([
      { quarantine_id: 'q-multi-1', target_email: 'redirect@example.com' },
    ]);
  });
});
