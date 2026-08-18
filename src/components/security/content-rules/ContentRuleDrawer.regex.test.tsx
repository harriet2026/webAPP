import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import zh from '@/../messages/zh.json';
import { ApiError } from '@/lib/api/client';
import { ContentRuleDrawer } from './ContentRuleDrawer';

// 正则的合法性判定权归后端（Go/RE2），前端不再用浏览器引擎自己下结论。
//
// 两条探针：
//   - `(?P<x>a)` Go 具名分组：**浏览器 new RegExp() 会抛异常**，旧的本地预检因此
//     把一条后端完全支持的规则拦在门外（假报错）。现在必须能提交、能模拟测试。
//   - `(?=a)b`  前瞻：浏览器接受、Go 拒绝（假通过）。现在由后端返回 400 +
//     pattern + 原因，前端负责把它显示清楚。
const GO_ONLY_REGEX = '(?P<x>a)';

// 先确认前提：这个 pattern 在测试环境（浏览器同款 JS 引擎）里确实是非法的。
// 否则本组用例会在一个假设不成立的前提下"通过"。
it('前提：(?P<x>a) 在 JS 正则引擎里确实非法', () => {
  expect(() => new RegExp(GO_ONLY_REGEX)).toThrow();
});

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ isSystemAdmin: true, selectedTenantId: null, user: { tenant_id: 1 } }),
}));

// 这里不能用"原样返回 key"的恒等 translator：本组用例要验证的正是
// "后端错误码被渲染成带 pattern/原因的四语文案"，恒等 mock 会把它抹平。
// 因此按真实的 zh.json 解析嵌套 key，并做最小的 {placeholder} 插值。
function resolveZhKey(key: string): string | undefined {
  let node: unknown = zh;
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string' ? node : undefined;
}

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    const template = resolveZhKey(key);
    if (template === undefined) return key;
    if (!params) return template;
    return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
      name in params ? String(params[name]) : whole,
    );
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

function regexApiError(pattern: string) {
  return new ApiError(400, `invalid regex pattern "${pattern}"`, {
    error: {
      code: 'unified_rule.condition_regex_invalid',
      message: 'invalid regex pattern',
      params: {
        field: 'match_content',
        pattern,
        reason: 'error parsing regexp: invalid or unsupported Perl syntax: `(?=`',
      },
    },
  });
}

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

// 把抽屉填成一条"除正则外全部合法"的规则：名称必填，其余字段用默认值
// （优先级 100 / 收信方向 / 主题+正文范围）。
function fillForm(pattern: string) {
  fireEvent.change(screen.getByTestId('content-rule-name'), { target: { value: 'regex-rule' } });
  fireEvent.change(screen.getByTestId('content-rule-match-content'), { target: { value: pattern } });
}

beforeEach(() => {
  mockTestContentRule.mockReset();
});

describe('内容规则抽屉：正则判定权归后端', () => {
  it('Go 支持但浏览器不支持的正则不再被前端拦下，保存请求正常发出', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderDrawer({ onSubmit });
    fillForm(GO_ONLY_REGEX);

    fireEvent.click(screen.getByTestId('content-rule-save'));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0].match_content).toBe(GO_ONLY_REGEX);
  });

  it('Go 支持但浏览器不支持的正则不再被前端拦下，模拟测试请求正常发出', async () => {
    mockTestContentRule.mockResolvedValue({ matched: true });
    renderDrawer();
    fireEvent.change(screen.getByTestId('content-rule-match-content'), {
      target: { value: GO_ONLY_REGEX },
    });
    fireEvent.click(screen.getByText(resolveZhKey('contentRules.simulateTest')!));
    fireEvent.change(screen.getByPlaceholderText(resolveZhKey('contentRules.testContent')!), {
      target: { value: 'abc' },
    });
    fireEvent.click(screen.getByText(resolveZhKey('contentRules.runTest')!));

    await waitFor(() => expect(mockTestContentRule).toHaveBeenCalledTimes(1));
  });

  it('模拟测试遇到非法正则时展示后端返回的 pattern 与原因，而不是笼统的"测试失败"', async () => {
    mockTestContentRule.mockRejectedValue(regexApiError('(?=a)b'));
    renderDrawer();
    fireEvent.change(screen.getByTestId('content-rule-match-content'), {
      target: { value: '(?=a)b' },
    });
    fireEvent.click(screen.getByText(resolveZhKey('contentRules.simulateTest')!));
    fireEvent.change(screen.getByPlaceholderText(resolveZhKey('contentRules.testContent')!), {
      target: { value: 'ab' },
    });
    fireEvent.click(screen.getByText(resolveZhKey('contentRules.runTest')!));

    // 用后端给的 reason 定位（它只出现在错误提示里；pattern 本身在输入框里也有一份）。
    const box = await screen.findByText(/unsupported Perl syntax/);
    expect(box.textContent).toMatch(/\(\?=a\)b/);
    expect(box.closest('div')?.className).toMatch(/destructive/);
    expect(screen.queryByText(resolveZhKey('contentRules.testFailed')!)).toBeNull();
  });

  it('保存被后端判为非法正则时，把后端原因贴回匹配内容字段旁', async () => {
    const onSubmit = vi.fn().mockRejectedValue(regexApiError('(?=a)b'));
    renderDrawer({ onSubmit });
    fillForm('(?=a)b');

    fireEvent.click(screen.getByTestId('content-rule-save'));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const inlineError = await screen.findByText(/unsupported Perl syntax/);
    expect(inlineError.textContent).toMatch(/\(\?=a\)b/);
    // 抽屉保持打开，且出错的输入框标红。
    expect(screen.getByTestId('content-rule-match-content').className).toMatch(/border-destructive/);
  });
});
