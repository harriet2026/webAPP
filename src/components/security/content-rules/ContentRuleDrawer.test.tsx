import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import type { ContentRuleRuleView, MarkConfig } from '@/types/content-rules';
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


describe('ContentRuleDrawer 标记配置完整性（GT-12900）', () => {
  const existingMark: MarkConfig = {
    tag: '[legacy]',
    add_headers: [
      { name: 'X-Content-Tag', value: 'sensitive' },
      { name: 'X-Audit-Extra', value: 'keep' },
    ],
    notify_admin: true,
    notify_sender: true,
  };

  function existingRule(markConfig?: MarkConfig): ContentRuleRuleView {
    return {
      rule: { id: 9, name: 'existing mark', description: '', priority: 100, is_active: true,
        action: 'accept', valid_from: null, valid_until: null },
      resolved: { feature: 'content_rules', match_type: 'keyword', match_content: 'sensitive',
        scopes: ['subject'], directions: { receive: { enabled: true, action: 'accept' } },
        mark_config: markConfig },
      is_complex: false,
    } as ContentRuleRuleView;
  }

  async function save(onSubmit: ReturnType<typeof vi.fn>) {
    fireEvent.click(screen.getByTestId('content-rule-save'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    return onSubmit.mock.calls[0][0];
  }

  it('仅改名称保留额外邮件头、tag 和通知配置', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderDrawer({ editingRule: existingRule(existingMark), onSubmit });
    fireEvent.change(screen.getByTestId('content-rule-name'), { target: { value: 'renamed' } });
    expect((await save(onSubmit)).mark_config).toEqual(existingMark);
  });

  it('修改第一个邮件头时不覆盖其他配置或输入对象', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderDrawer({ editingRule: existingRule(existingMark), onSubmit });
    fireEvent.change(screen.getAllByDisplayValue('sensitive').find((el) => el.tagName === 'INPUT')!, { target: { value: 'updated' } });
    const submitted = await save(onSubmit);
    expect(submitted.mark_config).toEqual({ ...existingMark, add_headers: [
      { name: 'X-Content-Tag', value: 'updated' }, existingMark.add_headers![1],
    ] });
    expect(existingMark.add_headers![0].value).toBe('sensitive');
  });

  it.each([
    { tag: '[legacy]', notify_admin: false, notify_sender: false },
    { notify_admin: true, notify_sender: true },
  ])('仅 tag 或通知的历史规则普通编辑保持不变：%j', async (markConfig) => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderDrawer({ editingRule: existingRule(markConfig), onSubmit });
    expect(screen.queryByDisplayValue('X-OSG-Content-Tag')).not.toBeInTheDocument();
    fireEvent.change(screen.getByTestId('content-rule-name'), { target: { value: 'renamed' } });
    expect((await save(onSubmit)).mark_config).toEqual(markConfig);
  });

  it('混合方向中标记控件未展示时，普通编辑仍保留配置和方向', async () => {
    const editingRule = existingRule(existingMark);
    editingRule.resolved!.directions = {
      receive: { enabled: true, action: 'quarantine' },
      send: { enabled: true, action: 'accept' },
    };
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderDrawer({ editingRule, onSubmit });
    fireEvent.change(screen.getByTestId('content-rule-name'), { target: { value: 'renamed' } });
    const submitted = await save(onSubmit);
    expect(submitted.mark_config).toEqual(existingMark);
    expect(submitted.directions).toEqual(editingRule.resolved!.directions);
  });

  it('明确取消标记时清除标记配置', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderDrawer({ editingRule: existingRule(existingMark), onSubmit });
    fireEvent.click(screen.getByText('contentRules.actionTagDeliver'));
    expect((await save(onSubmit)).mark_config).toBeUndefined();
  });

  it('仅 tag 配置临时勾选再取消时，不丢失原有隐藏配置', async () => {
    const markConfig = { tag: '[legacy]', notify_admin: true, notify_sender: false };
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderDrawer({ editingRule: existingRule(markConfig), onSubmit });
    fireEvent.click(screen.getByTestId('content-rule-mark-enabled'));
    fireEvent.click(screen.getByTestId('content-rule-mark-enabled'));
    expect((await save(onSubmit)).mark_config).toEqual(markConfig);
  });

  it('明确切换到拒收时清除标记配置', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderDrawer({ editingRule: existingRule(existingMark), onSubmit });
    await user.click(screen.getByTestId('content-rule-action'));
    await user.click(screen.getByTestId('content-rule-action-option-reject'));
    const submitted = await save(onSubmit);
    expect(submitted.mark_config).toBeUndefined();
    expect(submitted.directions.receive.action).toBe('reject');
  });

  it('普通投递不增加默认邮件头，勾选后仍使用 accept 契约', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderDrawer({ editingRule: existingRule(), onSubmit });
    expect((await save(onSubmit)).mark_config).toBeUndefined();
    onSubmit.mockClear();
    fireEvent.click(screen.getByText('contentRules.actionTagDeliver'));
    const submitted = await save(onSubmit);
    expect(submitted.directions.receive.action).toBe('accept');
    expect(submitted.mark_config.add_headers).toEqual([{ name: 'X-OSG-Content-Tag', value: '[可疑]' }]);
  });

  it.each(['Bad Header', 'X-Bad:Name'])('拒绝非法邮件头名称：%s', async (name) => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderDrawer({ editingRule: existingRule(existingMark), onSubmit });
    fireEvent.change(screen.getByDisplayValue('X-Content-Tag'), { target: { value: name } });
    fireEvent.click(screen.getByTestId('content-rule-save'));
    expect(await screen.findByText('contentRules.headerInvalid')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('拒绝历史邮件头值中的换行，不能先 trim 掩盖非法输入', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderDrawer({ editingRule: existingRule({ ...existingMark, add_headers: [
      { name: 'X-Content-Tag', value: 'sensitive\r\n' },
    ] }), onSubmit });
    fireEvent.click(screen.getByTestId('content-rule-save'));
    expect(await screen.findByText('contentRules.headerInvalid')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
