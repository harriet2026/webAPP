import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { format } from 'date-fns';
import { LoginHistoryTab } from './LoginHistoryTab';
import { browserLocalDayBoundary } from './login-history-date-range';

const apiMocks = vi.hoisted(() => ({
  useLoginHistory: vi.fn(),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'zh',
}));

vi.mock('./api', () => ({
  useLoginHistory: apiMocks.useLoginHistory,
}));

beforeEach(() => {
  apiMocks.useLoginHistory.mockReset();
  apiMocks.useLoginHistory.mockReturnValue({
    data: {
      items: [{
        id: 1,
        time: '2026-08-28T10:00:00+08:00',
        ip: '192.0.2.10',
        client: 'Chrome',
        location: 'Guangzhou',
        result: 'success',
        abnormal: false,
      }],
      total: 1,
      page: 1,
      page_size: 20,
    },
    isLoading: false,
    isFetching: false,
  });
});

async function calendarDayButton(date: Date) {
  return waitFor(() => {
    const popup = document.querySelector<HTMLElement>('[data-slot="popover-content"][data-open]');
    const button = popup?.querySelector<HTMLButtonElement>(
      `[data-day="${date.toLocaleDateString('zh-CN')}"]`,
    );
    expect(button).not.toBeNull();
    return button as HTMLButtonElement;
  });
}

async function selectDate(testId: string, date: Date) {
  fireEvent.click(screen.getByTestId(testId));
  fireEvent.click(await calendarDayButton(date));
}

describe('LoginHistoryTab date range (GT-12949)', () => {
  it('uses application date pickers instead of browser-native date inputs', () => {
    render(<LoginHistoryTab />);

    const start = screen.getByTestId('profile-history-start-date');
    const end = screen.getByTestId('profile-history-end-date');

    expect(start).toHaveAttribute('type', 'button');
    expect(end).toHaveAttribute('type', 'button');
    expect(start).toHaveTextContent('history.startDate');
    expect(end).toHaveTextContent('history.endDate');
    expect(document.querySelector('input[type="date"]')).not.toBeInTheDocument();
  });
});

describe('LoginHistoryTab date range validation (GT-12950)', () => {
  it('prevents selecting a start date after the chosen end date', async () => {
    render(<LoginHistoryTab />);
    const today = new Date();
    const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

    await selectDate('profile-history-end-date', today);
    fireEvent.click(screen.getByTestId('profile-history-start-date'));
    const unavailableDay = await calendarDayButton(tomorrow);

    expect(unavailableDay).toBeDisabled();
    fireEvent.click(unavailableDay);
    expect(screen.getByTestId('profile-history-start-date')).toHaveTextContent('history.startDate');
    expect(screen.getByText('192.0.2.10')).toBeInTheDocument();
  });

  it('submits a valid inclusive range using the existing API query contract', async () => {
    render(<LoginHistoryTab />);
    const today = new Date();
    const dateValue = format(today, 'yyyy-MM-dd');

    await selectDate('profile-history-start-date', today);
    await selectDate('profile-history-end-date', today);
    fireEvent.click(screen.getByTestId('profile-history-query'));

    expect(apiMocks.useLoginHistory).toHaveBeenLastCalledWith({
      start: browserLocalDayBoundary(dateValue, 'start'),
      end: browserLocalDayBoundary(dateValue, 'end'),
      page: 1,
      page_size: 20,
    });
  });
});
