import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import zh from '@/../messages/zh.json';
import en from '@/../messages/en.json';
import ru from '@/../messages/ru.json';
import th from '@/../messages/th.json';
import { CompactConditionEditor } from './compact-condition-editor';
import type { FieldDefinitionsResponse, RuleNode } from '@/types/unified-rules';

// GT-12914：出站路由「更多条件」编辑器对枚举字段（origin_kind 自产信类型）的
// 值输入渲染契约——within 用多选、eq 用单选、非枚举字段仍是纯文本框；
// 且多选的取值编码为换行分隔。契约见 design/implement/spec/2026-08-12-route-match-origin-kind-design.md。

const mockApiRequest = vi.fn();
vi.mock('@/lib/api/client', () => ({
  useScopedApiRequest: () => ({ apiRequest: mockApiRequest }),
}));

const mockGetFieldDefinitions = vi.fn();
vi.mock('@/lib/api/unified-rules', () => ({
  getFieldDefinitions: (...args: unknown[]) => mockGetFieldDefinitions(...args),
}));

const fieldDefinitions: FieldDefinitionsResponse = {
  fields: {
    is_outbound: {
      label: 'Is Outbound',
      type: 'boolean',
      min_stage: 'mail',
      operators: ['eq'],
      category: 'mail_basic',
      supported: true,
    },
    onercpt: {
      label: 'One Recipient',
      type: 'string',
      min_stage: 'rcpt',
      operators: ['eq', 'ne'],
      category: 'mail_basic',
      supported: true,
    },
    origin_kind: {
      label: 'Mail Origin Kind',
      type: 'string',
      min_stage: 'data',
      operators: ['eq', 'ne', 'within'],
      category: 'mail_basic',
      supported: true,
      enum_values: [
        { value: 'customer', label: '客户邮件' },
        { value: 'bounce_dsn', label: '策略退信' },
        { value: 'delivery_failure_dsn', label: '投递失败退信' },
      ],
    },
    rcpt_count: {
      label: 'Recipient Count',
      type: 'number',
      min_stage: 'rcpt',
      operators: ['eq', 'ne', 'gt', 'lt', 'ge', 'le'],
      category: 'mail_basic',
      supported: true,
    },
    sender: {
      label: 'Sender',
      type: 'string',
      min_stage: 'mail',
      operators: ['eq', 'ne', 'contain', 'within'],
      category: 'mail_basic',
      supported: true,
    },
    sender_domain: {
      label: 'Sender Domain',
      type: 'string',
      min_stage: 'mail',
      operators: ['eq', 'ne', 'contain', 'within'],
      category: 'mail_basic',
      supported: true,
    },
  },
};

beforeEach(() => {
  mockGetFieldDefinitions.mockReset().mockResolvedValue(fieldDefinitions);
});

function renderEditor(value: RuleNode[], onChange = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={zh}>
        {children}
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
  render(<CompactConditionEditor tenantId={1} value={value} onChange={onChange} />, { wrapper });
  return onChange;
}

describe('CompactConditionEditor 枚举值输入（GT-12914）', () => {
  it('四种语言都覆盖完整 route 字段目录所需的翻译键', () => {
    const keys = [
      'authUser',
      'cacIntTag',
      'clientIp',
      'isOutbound',
      'oneRecipient',
      'originKind',
      'recipient',
      'recipientCount',
      'recipientDomain',
      'sender',
      'senderDomain',
    ];
    for (const messages of [zh, en, ru, th]) {
      const fields = messages.advancedRules.fields as Record<string, string>;
      for (const key of keys) expect(fields[key]).toBeTruthy();
    }

    expect(zh.advancedRules.fields.originKind).toBe('自产信类型');
    expect(en.advancedRules.fields.originKind).toBe('Mail Origin Kind');
    expect(ru.advancedRules.fields.originKind).toBe('Тип происхождения письма');
    expect(th.advancedRules.fields.originKind).toBe('ประเภทที่มาของอีเมล');
  });

  it('origin_kind 字段名使用当前语言文案而不是后端英文标签', async () => {
    renderEditor([{ type: 'condition', field: 'origin_kind', operator: 'eq', value: 'bounce_dsn' }]);
    const field = screen.getByTestId('mr-ob-rule-more-condition-field-0');
    await waitFor(() => expect(field).toHaveTextContent('自产信类型'));
    expect(field).not.toHaveTextContent('Mail Origin Kind');
  });

  it('更多条件中的其它 route 字段名也使用中文文案', async () => {
    const user = userEvent.setup();
    renderEditor([{ type: 'condition', field: '', operator: '', value: '' }]);
    await waitFor(() => expect(screen.getByTestId('mr-ob-rule-more-condition-add')).toBeEnabled());
    await user.click(screen.getByTestId('mr-ob-rule-more-condition-field-0'));

    for (const label of ['是否出站', '单个收件人', '自产信类型', '收件人数量', '发件人', '发件人域名']) {
      expect(await screen.findByText(label, { exact: true })).toBeVisible();
    }
  });

  it('origin_kind + within 渲染多选触发按钮，回显已选个数', async () => {
    renderEditor([
      { type: 'condition', field: 'origin_kind', operator: 'within', value: 'bounce_dsn\ndelivery_failure_dsn' },
    ]);
    // 字段目录异步加载，加载态先落纯文本框；等目录到位后值输入才切成多选触发按钮。
    await waitFor(() =>
      expect(screen.getByTestId('mr-ob-rule-more-condition-value-0').tagName).toBe('BUTTON'),
    );
    expect(screen.getByTestId('mr-ob-rule-more-condition-value-0')).toHaveTextContent('2');
  });

  it('origin_kind + eq 渲染单选，回显中文标签而非原始枚举值', async () => {
    renderEditor([{ type: 'condition', field: 'origin_kind', operator: 'eq', value: 'bounce_dsn' }]);
    await waitFor(() =>
      expect(screen.getByTestId('mr-ob-rule-more-condition-value-0')).toHaveTextContent('策略退信'),
    );
    expect(screen.getByTestId('mr-ob-rule-more-condition-value-0').tagName).not.toBe('INPUT');
  });

  it('非枚举字段仍是纯文本框', async () => {
    renderEditor([{ type: 'condition', field: 'sender_domain', operator: 'within', value: 'a.com\nb.com' }]);
    // 目录加载完仍是纯文本框（sender_domain 无枚举值）。等 add 按钮启用即代表目录到位。
    await waitFor(() => expect(screen.getByTestId('mr-ob-rule-more-condition-add')).toBeEnabled());
    const input = screen.getByTestId('mr-ob-rule-more-condition-value-0');
    expect(input.tagName).toBe('INPUT');
  });

  it('多选勾选把取值编码为换行分隔字符串', async () => {
    const user = userEvent.setup();
    const onChange = renderEditor([
      { type: 'condition', field: 'origin_kind', operator: 'within', value: 'bounce_dsn' },
    ]);
    // 等目录加载完、值输入切成多选触发按钮后再点开。
    await waitFor(() =>
      expect(screen.getByTestId('mr-ob-rule-more-condition-value-0').tagName).toBe('BUTTON'),
    );
    await user.click(screen.getByTestId('mr-ob-rule-more-condition-value-0'));
    // 追加勾选「投递失败退信」——onChange 收到的应是换行分隔的两个原始枚举值。
    const option = await screen.findByText('投递失败退信');
    await user.click(option);
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const lastArg = onChange.mock.calls.at(-1)?.[0] as RuleNode[];
    expect(lastArg[0].value).toBe('bounce_dsn\ndelivery_failure_dsn');
  });
});
