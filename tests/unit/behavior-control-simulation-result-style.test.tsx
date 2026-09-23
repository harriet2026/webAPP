import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
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

function renderDrawer() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <NextIntlClientProvider locale="zh" messages={zh}>
      <QueryClientProvider client={client}>
        <BehaviorControlDrawer
          open
          onOpenChange={vi.fn()}
          editing={null}
          defaults={{
            name: 'GT-13701',
            object_config: { type: 'sender', sub_type: 'individual', value: 'sender@example.test' },
            conditions: [{ dim: 'mail_count', threshold: 1 }],
            dim_a: 'mail_count',
            threshold_a: 1,
          }}
        />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );

  fireEvent.click(screen.getByTestId('behavior-control-simulator-toggle'));
  // GT-13700 后模拟器会先校验规则适用对象；这里测试结果样式，样本必须先匹配对象，
  // 否则“命中样式”会实际落入发件人不匹配的中性结果分支。
  fireEvent.change(screen.getByTestId('behavior-control-sim-sender'), {
    target: { value: 'sender@example.test' },
  });
}

describe('BehaviorControlDrawer 模拟测试结果语义', () => {
  it('命中是正常业务结果，使用信息色和靶心而非红色错误态', () => {
    renderDrawer();
    fireEvent.click(screen.getByTestId('behavior-control-sim-run'));

    const result = screen.getByTestId('behavior-control-simulation-result');
    expect(result).toHaveAttribute('data-level', 'info');
    expect(result).toHaveClass('border-sky-200', 'bg-sky-50');
    expect(result).not.toHaveClass('border-red-200', 'bg-red-50');
    expect(screen.getByTestId('behavior-control-simulation-hit-icon')).toBeInTheDocument();
    expect(screen.queryByTestId('behavior-control-simulation-miss-icon')).toBeNull();
  });

  it('未命中使用中性灰，不冒充成功态', () => {
    renderDrawer();
    fireEvent.change(screen.getByTestId('behavior-control-sim-mail-count'), { target: { value: '0' } });
    fireEvent.click(screen.getByTestId('behavior-control-sim-run'));

    const result = screen.getByTestId('behavior-control-simulation-result');
    expect(result).toHaveAttribute('data-level', 'neutral');
    expect(result).toHaveClass('border-border', 'bg-muted', 'text-muted-foreground');
    expect(result).not.toHaveClass('border-green-200', 'bg-green-50');
    expect(screen.getByTestId('behavior-control-simulation-miss-icon')).toBeInTheDocument();
    expect(screen.queryByTestId('behavior-control-simulation-hit-icon')).toBeNull();
  });
});
