import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import en from '../../messages/en.json';
import ru from '../../messages/ru.json';
import th from '../../messages/th.json';
import zh from '../../messages/zh.json';
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

// BehaviorControlDrawer only uses this link as a navigation affordance. Mock it
// so the form test does not depend on Next.js' runtime-only navigation export.
vi.mock('@/i18n/navigation', () => ({ Link: () => null }));

describe('BehaviorControlDrawer rule name length', () => {
  it('discloses and enforces the 50-character limit while typing', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <NextIntlClientProvider locale="zh" messages={zh}>
        <QueryClientProvider client={client}>
          <BehaviorControlDrawer
            open
            onOpenChange={vi.fn()}
            editing={null}
            defaults={{
              name: '',
              object_config: { type: 'sender', sub_type: 'individual', value: '' },
              conditions: [{ dim: 'mail_count', threshold: 1 }],
            }}
          />
        </QueryClientProvider>
      </NextIntlClientProvider>,
    );

    const input = screen.getByTestId('behavior-control-rule-name');
    expect(input).toHaveAttribute('maxlength', '50');
    expect(screen.getByTestId('behavior-control-rule-name-count')).toHaveTextContent('0/50');

    await userEvent.type(input, 'x'.repeat(51));

    expect(input).toHaveValue('x'.repeat(50));
    expect(screen.getByTestId('behavior-control-rule-name-count')).toHaveTextContent('50/50');
  });

  it.each([
    [zh, '规则名称最多 50 个字符'],
    [en, 'Rule name must be at most 50 characters'],
    [th, 'ชื่อกฎต้องไม่เกิน 50 ตัวอักษร'],
    [ru, 'Название правила не должно превышать 50 символов'],
  ])('states the concrete limit in validation messages', (messages, expected) => {
    expect(messages.behaviorControl.errors.nameMaxLength).toBe(expected);
  });
});

describe('BehaviorControlDrawer priority validation', () => {
  it('shows a localized required message instead of the Zod NaN error when priority is cleared', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <NextIntlClientProvider locale="zh" messages={zh}>
        <QueryClientProvider client={client}>
          <BehaviorControlDrawer
            open
            onOpenChange={vi.fn()}
            editing={null}
            defaults={{
              name: '优先级空值校验',
              priority: 600,
              object_config: { type: 'global' },
              conditions: [{ dim: 'mail_count', threshold: 1 }],
            }}
          />
        </QueryClientProvider>
      </NextIntlClientProvider>,
    );

    const priorityInput = screen.getByTestId('behavior-control-priority');
    await userEvent.clear(priorityInput);
    await userEvent.click(screen.getByTestId('behavior-control-save'));

    expect(await screen.findByTestId('behavior-control-priority-error')).toHaveTextContent('优先级不能为空');
    expect(priorityInput).toHaveAttribute('aria-invalid', 'true');
    expect(priorityInput).toHaveAttribute('aria-describedby', 'behavior-control-priority-error');
    expect(screen.queryByText(/behaviorControl\.errors|expected number|NaN/)).toBeNull();
  });

  it.each([
    [zh, '优先级不能为空'],
    [en, 'Priority is required'],
    [th, 'กรุณาระบุลำดับความสำคัญ'],
    [ru, 'Укажите приоритет'],
  ])('provides the required-priority message in every supported locale', (messages, expected) => {
    expect(messages.behaviorControl.errors.priorityRequired).toBe(expected);
  });
});
