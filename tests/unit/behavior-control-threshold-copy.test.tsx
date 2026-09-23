// GT-13646: behavior-control rules fire when a counter reaches its threshold
// (count >= threshold), so the effect preview must not claim that it only fires
// after the configured value has been exceeded.
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import zh from '../../messages/zh.json';
import en from '../../messages/en.json';
import th from '../../messages/th.json';
import ru from '../../messages/ru.json';
import { BehaviorControlDrawer } from '@/components/security/behavior-control/BehaviorControlDrawer';

const { apiRequest } = vi.hoisted(() => ({
  apiRequest: vi.fn().mockResolvedValue({ items: [], total: 0 }),
}));

vi.mock('@/lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/client')>();
  return {
    ...actual,
    useApiRequest: () => ({ apiRequest }),
  };
});

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ isSystemAdmin: true, user: { role: 'system_admin' } }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe('BehaviorControlDrawer threshold wording', () => {
  it.each([
    {
      locale: 'zh', messages: zh,
      reached: '发出邮件的总数达到3', obsolete: '发出邮件的总数超过3',
      tip: 'OR条件达到任一阈值即触发',
    },
    {
      locale: 'en', messages: en,
      reached: 'Max total emails sent reaches3', obsolete: 'Max total emails sentexceeds3',
      tip: 'For OR conditions, reaching either threshold triggers the rule',
    },
    {
      locale: 'th', messages: th,
      reached: 'จำนวนอีเมลที่ส่งรวมสูงสุดถึง3', obsolete: 'จำนวนอีเมลที่ส่งรวมสูงสุดเกิน3',
      tip: 'เงื่อนไข OR จะทำงานเมื่อถึงเกณฑ์ใดเกณฑ์หนึ่ง',
    },
    {
      locale: 'ru', messages: ru,
      reached: 'Максимум отправленных писем всего достигает3', obsolete: 'Максимум отправленных писем всегопревышает3',
      tip: 'Для условия ИЛИ правило срабатывает при достижении любого из порогов',
    },
  ])('states in $locale that the rule fires when mail count reaches the threshold', async ({
    locale, messages, reached, obsolete, tip,
  }) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <NextIntlClientProvider locale={locale} messages={messages as unknown as Record<string, unknown>}>
        <QueryClientProvider client={client}>
          <BehaviorControlDrawer
            open
            onOpenChange={vi.fn()}
            editing={null}
            defaults={{
              name: 'GT-13646',
              object_config: { type: 'sender', sub_type: 'individual', value: 'sender@example.test' },
              conditions: [{ dim: 'mail_count', threshold: 3 }],
              dim_a: 'mail_count',
              threshold_a: 3,
            }}
          />
        </QueryClientProvider>
      </NextIntlClientProvider>,
    );

    const preview = await screen.findByTestId('behavior-control-preview-pane');
    expect(preview).toHaveTextContent(reached);
    expect(preview).not.toHaveTextContent(obsolete);
    expect(preview).toHaveTextContent(tip);
  });
});
