import { forwardRef, useImperativeHandle } from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { useForm } from 'react-hook-form';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { DisposalSettings } from '@/types/disposal-settings';
import { defaultDisposalSettings } from './schema';
import { QuarantineSettingsTab } from './quarantine-settings-tab';
import { getBrowserTz } from '@/lib/timezone';

// identity translator — assertions key off testids, not translated copy
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock('@/lib/timezone', () => ({ getBrowserTz: vi.fn(() => 'Asia/Shanghai') }));

// task-11: QuarantineSettingsTab now mounts NotificationScopeSelector, which
// calls useAuth()/useApiRequest() (rules-of-hooks) and useQuery() even though
// this test suite doesn't exercise the scope selector's own behavior (that's
// covered by notification-scope-selector.test.tsx). Mock the same way
// replica-banner.test.tsx does rather than mounting the real providers.
vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ isSystemAdmin: true, user: { tenant_id: null }, selectedTenantId: null }),
}));
const mockApiRequest = vi.fn().mockResolvedValue({ items: [] });
vi.mock('@/lib/api/client', () => ({
  useApiRequest: () => ({ apiRequest: mockApiRequest }),
}));

export interface HarnessHandle {
  /** 模拟外部 form.reset(serverData)（例如页面加载时用服务器返回值覆盖表单）。 */
  resetSpamMinScore: (value: number) => void;
}

const Harness = forwardRef<HarnessHandle, { serverTz: string; initialTz?: string }>(
  function Harness({ serverTz, initialTz = '' }, ref) {
    const form = useForm<DisposalSettings>({
      defaultValues: { ...defaultDisposalSettings(), tz: initialTz },
    });
    const tz = form.watch('tz');

    useImperativeHandle(ref, () => ({
      resetSpamMinScore: (value: number) => {
        const current = form.getValues();
        form.reset({
          ...current,
          quarantine: {
            ...current.quarantine,
            category_notify: {
              ...current.quarantine.category_notify,
              spam: { ...current.quarantine.category_notify.spam, min_score: value },
            },
          },
        });
      },
    }));

    return (
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <span data-testid="probe-tz">{tz}</span>
        <QuarantineSettingsTab
          control={form.control}
          watch={form.watch}
          setValue={form.setValue}
          serverTz={serverTz}
        />
      </QueryClientProvider>
    );
  },
);

beforeEach(() => {
  (getBrowserTz as Mock).mockReturnValue('Asia/Shanghai');
});

describe('QuarantineSettingsTab category notification section (task-10)', () => {
  it('renders 9 category rows in display order with the score hint banner', () => {
    render(<Harness serverTz="Asia/Shanghai" />);
    expect(screen.getByTestId('disposal-settings-score-hint')).toBeInTheDocument();
    const list = screen.getByTestId('disposal-settings-category-list');
    expect(list).toBeInTheDocument();

    const order = [
      'spam',
      'advertising',
      'suspicious',
      'sensitive',
      'phishing',
      'virus',
      'account_compromised',
      'spoofing',
      'harmful',
    ];
    order.forEach((key) => {
      expect(screen.getByTestId(`disposal-settings-category-row-${key}`)).toBeInTheDocument();
    });
  });

  it('shows min/max score inputs only for enabled rows', () => {
    render(<Harness serverTz="Asia/Shanghai" />);
    // spam defaults enabled=true → has min/max inputs
    expect(screen.getByTestId('disposal-settings-category-min-spam')).toBeInTheDocument();
    expect(screen.getByTestId('disposal-settings-category-max-spam')).toBeInTheDocument();
    // advertising defaults enabled=false → no min/max inputs
    expect(screen.queryByTestId('disposal-settings-category-min-advertising')).not.toBeInTheDocument();
    expect(screen.queryByTestId('disposal-settings-category-max-advertising')).not.toBeInTheDocument();
  });

  it('unchecking a row removes its min/max inputs and only affects that row', async () => {
    render(<Harness serverTz="Asia/Shanghai" />);
    const spamCheckbox = screen.getByTestId('disposal-settings-category-checkbox-spam');
    await userEvent.click(spamCheckbox);
    expect(screen.queryByTestId('disposal-settings-category-min-spam')).not.toBeInTheDocument();
    // other malicious rows unaffected
    expect(screen.getByTestId('disposal-settings-category-min-virus')).toBeInTheDocument();
  });

  it('clamps min score onBlur into [0,1] and restores on invalid input', async () => {
    render(<Harness serverTz="Asia/Shanghai" />);
    const minInput = screen.getByTestId('disposal-settings-category-min-spam') as HTMLInputElement;
    await userEvent.clear(minInput);
    await userEvent.type(minInput, '5');
    await userEvent.tab();
    expect(minInput).toHaveValue(1);

    await userEvent.clear(minInput);
    await userEvent.tab();
    // NaN (empty) → restored to last valid value (1 after the clamp above)
    expect(minInput).toHaveValue(1);
  });

  it('does not let an out-of-range value bypass clamp via change→clear→blur', async () => {
    render(<Harness serverTz="Asia/Shanghai" />);
    const minInput = screen.getByTestId('disposal-settings-category-min-spam') as HTMLInputElement;

    // change('5') → out-of-range value briefly lands in the field...
    await userEvent.clear(minInput);
    await userEvent.type(minInput, '5');
    // ...then change('') before ever blurring on the out-of-range value.
    await userEvent.clear(minInput);
    await userEvent.tab();

    // The bypass bug would restore the un-clamped 5 here. Both the displayed
    // value and the underlying form state must stay inside [0, 1].
    expect(minInput.valueAsNumber).toBeGreaterThanOrEqual(0);
    expect(minInput.valueAsNumber).toBeLessThanOrEqual(1);
    expect(minInput).not.toHaveValue(5);
  });

  it('restores the current (server-loaded) value after an external form.reset, not the hardcoded default', async () => {
    const ref = { current: null as HarnessHandle | null };
    render(<Harness ref={ref} serverTz="Asia/Shanghai" />);
    const minInput = screen.getByTestId('disposal-settings-category-min-spam') as HTMLInputElement;

    // Simulate the server GET response overriding the default (0.7) with 0.85.
    act(() => {
      ref.current!.resetSpamMinScore(0.85);
    });
    expect(minInput).toHaveValue(0.85);

    await userEvent.clear(minInput);
    await userEvent.tab();

    // Must restore to the post-reset server value (0.85), not the pre-reset
    // hardcoded default (0.7) nor any other stale cached value.
    expect(minInput).toHaveValue(0.85);
  });
});

describe('QuarantineSettingsTab tz reconciliation (GT-12056)', () => {
  it('shows the banner when savedTz empty and serverTz != browserTz, and picking browser writes tz', async () => {
    (getBrowserTz as Mock).mockReturnValue('Asia/Shanghai');
    render(<Harness serverTz="UTC" initialTz="" />);
    expect(screen.getByTestId('tz-mismatch-banner')).toBeInTheDocument();

    await userEvent.click(screen.getByTestId('tz-use-browser'));
    expect(screen.getByTestId('probe-tz')).toHaveTextContent('Asia/Shanghai');
  });

  it('hides the banner when serverTz == browserTz and savedTz empty', () => {
    (getBrowserTz as Mock).mockReturnValue('Asia/Shanghai');
    render(<Harness serverTz="Asia/Shanghai" initialTz="" />);
    expect(screen.queryByTestId('tz-mismatch-banner')).not.toBeInTheDocument();
  });

  it('shows the banner when savedTz != browserTz (returning admin / changed browser tz)', async () => {
    (getBrowserTz as Mock).mockReturnValue('America/New_York');
    render(<Harness serverTz="Asia/Shanghai" initialTz="Asia/Shanghai" />);
    expect(screen.getByTestId('tz-mismatch-banner')).toBeInTheDocument();

    // keep current → tz stays the saved Asia/Shanghai
    await userEvent.click(screen.getByTestId('tz-keep-current'));
    expect(screen.getByTestId('probe-tz')).toHaveTextContent('Asia/Shanghai');
  });

  it('hides the banner when savedTz == browserTz', () => {
    (getBrowserTz as Mock).mockReturnValue('America/New_York');
    render(<Harness serverTz="Asia/Shanghai" initialTz="America/New_York" />);
    expect(screen.queryByTestId('tz-mismatch-banner')).not.toBeInTheDocument();
  });
});
