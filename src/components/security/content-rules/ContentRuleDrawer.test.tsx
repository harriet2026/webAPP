import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ContentRuleDrawer } from './ContentRuleDrawer';

// 用户现场验收意见（本次修复对应的缺陷）：规则"匹配"是模拟测试的正常命中结果，
// 不应使用失败图标/红色错误态；红色 destructive 态只保留给接口失败等真正异常。
// 本文件锁定这一交互语义，避免回归。
vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ isSystemAdmin: true, selectedTenantId: null, user: { tenant_id: 1 } }),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    return params ? `${key}:${JSON.stringify(params)}` : key;
  },
}));

const mockTestContentRule = vi.fn();
vi.mock('@/lib/api/content-rules', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api/content-rules')>('@/lib/api/content-rules');
  return {
    ...actual,
    testContentRule: (...args: unknown[]) => mockTestContentRule(...args),
  };
});

function renderDrawer(overrides: Partial<React.ComponentProps<typeof ContentRuleDrawer>> = {}) {
  return render(
    <ContentRuleDrawer
      open
      onOpenChange={vi.fn()}
      editingRule={null}
      contentGroups={[]}
      onSubmit={vi.fn()}
      {...overrides}
    />,
  );
}

async function runSimulation(testText: string) {
  fireEvent.change(screen.getByTestId('content-rule-match-content'), {
    target: { value: 'aaaa' },
  });
  fireEvent.click(screen.getByText('contentRules.simulateTest'));
  fireEvent.change(screen.getByPlaceholderText('contentRules.testContent'), {
    target: { value: testText },
  });
  fireEvent.click(screen.getByText('contentRules.runTest'));
}

describe('ContentRuleDrawer 模拟测试结果语义（现场验收：命中不是失败）', () => {
  it('命中时渲染"匹配"文案，且不带 destructive/红色错误态样式', async () => {
    mockTestContentRule.mockResolvedValue({ matched: true });
    renderDrawer();
    await runSimulation('aaaa');

    const resultText = await screen.findByText('contentRules.testMatched');
    expect(resultText).toBeInTheDocument();
    const resultBox = resultText.closest('div');
    expect(resultBox?.className).not.toMatch(/rose|destructive/);
    expect(screen.queryByText('contentRules.testFailed')).toBeNull();
  });

  it('未命中时渲染"不匹配"文案，使用中性灰而非绿色成功态', async () => {
    mockTestContentRule.mockResolvedValue({ matched: false });
    renderDrawer();
    await runSimulation('bbbb');

    const resultText = await screen.findByText('contentRules.testNotMatched');
    expect(resultText).toBeInTheDocument();
    const resultBox = resultText.closest('div');
    expect(resultBox?.className).not.toMatch(/emerald|destructive/);
  });

  it('接口调用失败时不显示"匹配/不匹配"，而是走 destructive 错误提示', async () => {
    mockTestContentRule.mockRejectedValue(new Error('network error'));
    renderDrawer();
    await runSimulation('aaaa');

    const errorText = await screen.findByText('contentRules.testFailed');
    expect(errorText).toBeInTheDocument();
    expect(errorText.closest('div')?.className).toMatch(/destructive/);
    expect(screen.queryByText('contentRules.testMatched')).toBeNull();
    expect(screen.queryByText('contentRules.testNotMatched')).toBeNull();
  });
});
