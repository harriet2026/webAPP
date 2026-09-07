import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import zh from '@/../messages/zh.json';

const apiRequest = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api/client', () => ({
  useApiRequest: () => ({ apiRequest, effectiveTenantId: 7 }),
}));
vi.mock('./access', () => ({
  usePhishingAccess: () => ({ canEdit: true, readOnly: false }),
}));

import { PhishingOverviewPage } from './phishing-overview-page';

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <NextIntlClientProvider locale="zh" messages={zh as never}>
      <QueryClientProvider client={queryClient}>
        <PhishingOverviewPage />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

function callsFor(path: string) {
  return apiRequest.mock.calls.filter(([url]) => String(url).startsWith(path));
}

function lastLogURL() {
  return String(callsFor('/phishing-agent/detection-logs').at(-1)?.[0]);
}

describe('PhishingOverviewPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiRequest.mockImplementation((url: string) => {
      if (url.startsWith('/phishing-agent/stats')) {
        return Promise.resolve({
          today_detected: 1,
          today_quarantined: 2,
          pending_review: 3,
          today_recalled: 4,
          recall_success: 5,
        });
      }
      return Promise.resolve({ items: [], total: 0, page: 1, page_size: 20 });
    });
  });

  it('keeps KPI stats independent from the detection-log time range', async () => {
    renderPage();

    await waitFor(() => expect(callsFor('/phishing-agent/stats')).toHaveLength(1));
    await userEvent.click(screen.getByRole('button', { name: '近7天' }));
    await waitFor(() => expect(callsFor('/phishing-agent/detection-logs')).toHaveLength(2));

    expect(callsFor('/phishing-agent/stats')).toHaveLength(1);
    expect(callsFor('/phishing-agent/stats')[0]?.[0]).not.toContain('start=');
    expect(callsFor('/phishing-agent/stats')[0]?.[0]).not.toContain('end=');
  });

  it.each([
    ['phishing-kpi-today_quarantined', 'disposition=quarantine'],
    ['phishing-kpi-pending_review', 'disposition=audit'],
  ])('replaces the %s filter when the recalled KPI is clicked', async (initialKpi, staleParam) => {
    renderPage();

    await waitFor(() => expect(callsFor('/phishing-agent/detection-logs')).toHaveLength(1));
    await userEvent.click(screen.getByTestId(initialKpi));
    await waitFor(() => expect(callsFor('/phishing-agent/detection-logs')).toHaveLength(2));
    await userEvent.click(screen.getByTestId('phishing-kpi-today_recalled'));
    await waitFor(() => expect(callsFor('/phishing-agent/detection-logs')).toHaveLength(3));

    expect(lastLogURL()).toContain('recall_status=recalled');
    expect(lastLogURL()).not.toContain(staleParam);
  });

  it('resets all detection-log filters when the detected KPI is clicked', async () => {
    renderPage();

    await waitFor(() => expect(callsFor('/phishing-agent/detection-logs')).toHaveLength(1));
    await userEvent.type(screen.getByTestId('phishing-log-filter-keyword'), 'needle');
    await userEvent.click(screen.getByTestId('phishing-log-filter-search'));
    await waitFor(() => expect(callsFor('/phishing-agent/detection-logs')).toHaveLength(2));
    await userEvent.click(screen.getByRole('button', { name: '近7天' }));
    await waitFor(() => expect(callsFor('/phishing-agent/detection-logs')).toHaveLength(3));
    await userEvent.click(screen.getByTestId('phishing-kpi-today_quarantined'));
    await waitFor(() => expect(callsFor('/phishing-agent/detection-logs')).toHaveLength(4));
    const filteredURL = lastLogURL();

    await userEvent.click(screen.getByTestId('phishing-kpi-today_detected'));
    await waitFor(() => expect(callsFor('/phishing-agent/detection-logs')).toHaveLength(5));

    expect(filteredURL).toContain('disposition=quarantine');
    expect(filteredURL).toContain('keyword=needle');
    expect(lastLogURL()).not.toContain('disposition=');
    expect(lastLogURL()).not.toContain('recall_status=');
    expect(lastLogURL()).not.toContain('keyword=');
    expect(lastLogURL()).not.toBe(filteredURL);
    expect(screen.getByTestId('phishing-log-filter-keyword')).toHaveValue('');
  });
});
