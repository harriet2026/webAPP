import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { useForm } from 'react-hook-form';
import type { DisposalSettings } from '@/types/disposal-settings';

// GT-11600: the recall-policy and notify-frequency dropdowns showed their raw
// enum value ("recall", "realtime") on the closed trigger instead of the
// localized label, so QA reported the options as "untranslated".
//
// Root cause: this project's Select is Base UI (@base-ui/react/select), not
// Radix. Base UI's Select.Value renders the *value* unless it is given children
// -- its own typings say "Accepts a function that returns a ReactNode to format
// the selected value". A bare `<SelectValue />` therefore echoes the enum. The
// SelectItem children were localized all along, which is why the open dropdown
// looked correct and the i18n keys all existed in every locale.
//
// This test renders the real RecallSettingsTab (not a synthetic Select) with a
// translation map that returns Chinese labels, and asserts the closed trigger
// shows the label. Reverting the fix makes it fail with the raw enum on screen.

const LABELS: Record<string, string> = {
  policy_recall: '直接召回',
  policy_notify: '仅通知用户',
  policy_wait: '等待管理员确认',
  rfreq_realtime: '实时',
  rfreq_hourly: '每小时',
  rfreq_daily: '每日',
  rfreq_weekly: '每周',
};

vi.mock('next-intl', () => ({
  useTranslations: (_ns?: string) => (key: string) => {
    void _ns;
    return LABELS[key] ?? key;
  },
}));

vi.mock('@/lib/api/client', () => ({
  useApiRequest: () => ({ apiRequest: vi.fn().mockResolvedValue([]) }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

import { RecallSettingsTab } from '@/components/email-disposal/disposal-settings/recall-settings-tab';

function Harness() {
  const { control, watch, setValue } = useForm<DisposalSettings>({
    defaultValues: {
      recall: {
        threat_intel: { read_policy: 'recall', unread_policy: 'notify' },
        ai_detection: { read_policy: 'wait', unread_policy: 'recall' },
        notify_frequency: 'hourly',
        notify_emails: [],
      },
    } as unknown as DisposalSettings,
  });
  return createElement(RecallSettingsTab, { control, watch, setValue });
}

function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    createElement(QueryClientProvider, { client: qc }, createElement(Harness)),
  );
}

describe('RecallSettingsTab select triggers show labels, not raw enums (GT-11600)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the localized label for every selected recall policy', () => {
    renderTab();
    // Four policy selects: threat_intel read/unread, ai_detection read/unread.
    expect(screen.getAllByText('直接召回').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('仅通知用户').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('等待管理员确认').length).toBeGreaterThanOrEqual(1);
  });

  it('renders the localized label for the selected notify frequency', () => {
    renderTab();
    expect(screen.getAllByText('每小时').length).toBeGreaterThanOrEqual(1);
  });

  it('no select trigger echoes a raw enum value', () => {
    const { container } = renderTab();
    // Inspect the trigger value slots directly. Scanning container.textContent
    // instead would be unreliable: the mocked t() returns ASCII key names for
    // unmapped keys ("threatIntel", "readEmail"), so a raw "recall" ends up
    // glued to neighbouring letters and any word-boundary regex silently misses
    // it -- the assertion would pass even with the bug present.
    // html_spec 对齐后策略选择改为单选矩阵（RadioGroup），Select 只剩通知频率
    // 一个 —— 单选矩阵的标签由上面两个用例断言，这里只守剩余 Select 触发器。
    const slots = Array.from(container.querySelectorAll('[data-slot="select-value"]'));
    expect(slots.length, 'expected the frequency trigger to render').toBeGreaterThanOrEqual(1);

    const RAW = ['recall', 'notify', 'wait', 'realtime', 'hourly', 'daily', 'weekly'];
    for (const slot of slots) {
      const shown = (slot.textContent ?? '').trim();
      expect(
        RAW.includes(shown),
        `select trigger shows the raw enum "${shown}" — its <SelectValue /> is missing the value->label formatter`,
      ).toBe(false);
    }
  });
});
