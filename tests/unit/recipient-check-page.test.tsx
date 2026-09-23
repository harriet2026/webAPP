import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';

const { mockApiRequest } = vi.hoisted(() => ({ mockApiRequest: vi.fn() }));

vi.mock('@/lib/api/client', () => ({
  useApiRequest: () => ({ apiRequest: mockApiRequest }),
  apiRequest: mockApiRequest,
}));

// i18n mock: return the key path verbatim so assertions can match on keys.
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, string>) => {
    if (params) return Object.entries(params).reduce((s, [k, v]) => s.replace(`{${k}}`, v), key);
    return key;
  },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ isSystemAdmin: true, hasPermission: () => true, showAdvancedRules: false, user: { role: 'system_admin' } }),
}));

import { RecipientCheckPage } from '@/components/security/RecipientCheckPage';
import type { RecipientLimitConfig, RecipientCheckConfig } from '@/types/behavior-control';

const DEMO_LIMIT: RecipientLimitConfig = {
  mode: 'detailed', is_active: true,
  inbound_limit: { limit: 30, scope: 'local', action: 'reject' },
  outbound_limit: { limit: 50, scope: 'all', action: 'audit' },
  internal_limit: { limit: 20, scope: 'local', action: 'quarantine' },
  merged_limit: { limit: 50, action: 'audit' },
};

// 模块总开关现在来自注册表（GET/PUT /security/modules[/recipient_check]），不再是
// recipient-check-config 里的字段，故用独立的 moduleEnabled 参数驱动。
function setupApi(
  limit: Partial<RecipientLimitConfig> = {},
  check: Partial<RecipientCheckConfig> = {},
  moduleEnabled = true,
) {
  const limitCfg: RecipientLimitConfig = { ...DEMO_LIMIT, ...limit };
  const checkCfg: RecipientCheckConfig = { existence_enabled: true, existence_action: 'reject', ...check };
  mockApiRequest.mockImplementation((path: string, options?: { method?: string }) => {
    if (path.includes('recipient-limit-config')) return Promise.resolve(limitCfg);
    if (path.includes('recipient-check-config')) return Promise.resolve(checkCfg);
    if (path === '/security/modules' && (!options || options.method === undefined || options.method === 'GET')) {
      return Promise.resolve({ recipient_check: moduleEnabled });
    }
    if (path === '/security/modules/recipient_check' && options?.method === 'PUT') {
      return Promise.resolve({ status: 'updated' });
    }
    return Promise.resolve({});
  });
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    createElement(QueryClientProvider, { client: qc }, createElement(RecipientCheckPage, { embedded: true })),
  );
}

beforeEach(() => {
  mockApiRequest.mockReset();
});

describe('RecipientCheckPage', () => {
  it('渲染模块头(已启用)、功能说明横幅、底部说明', async () => {
    setupApi();
    renderPage();
    await waitFor(() => expect(screen.getByText('recipientCheck.module.enabled')).toBeInTheDocument());
    expect(screen.getByText('recipientCheck.banner')).toBeInTheDocument();
    expect(screen.getByText('recipientCheck.footerNote')).toBeInTheDocument();
    // 保存/重置按钮保留
    expect(screen.getByText('common.save')).toBeInTheDocument();
    expect(screen.getByText('behaviorControl.recipientLimit.reset')).toBeInTheDocument();
  });

  it('detailed 模式渲染三方向卡 + 计数范围仅接收方向 + 动作说明联动默认值', async () => {
    setupApi();
    renderPage();
    await waitFor(() => expect(screen.getByText('recipientCheck.limit.direction.inbound')).toBeInTheDocument());
    expect(screen.getByText('recipientCheck.limit.direction.outbound')).toBeInTheDocument();
    expect(screen.getByText('recipientCheck.limit.direction.internal')).toBeInTheDocument();
    // 计数范围仅接收方向出现一次
    expect(screen.getAllByText('recipientCheck.limit.countScope')).toHaveLength(1);
    // 默认值 30/50/20
    const nums = screen.getAllByRole('spinbutton') as HTMLInputElement[];
    expect(nums.map((n) => n.value)).toEqual(['30', '50', '20']);
    // 动作说明：接收 reject（存在性默认也是 reject，故出现两次）/ 外发 audit / 域内 quarantine
    expect(screen.getAllByText('recipientCheck.limit.actionDesc.reject').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('recipientCheck.limit.actionDesc.audit')).toBeInTheDocument();
    expect(screen.getByText('recipientCheck.limit.actionDesc.quarantine')).toBeInTheDocument();
  });

  it('存在性验证块准确说明使用同步通讯录且不展示未支持的实时能力', async () => {
    setupApi();
    renderPage();
    await waitFor(() => expect(screen.getByText('recipientCheck.existence.methodTitle')).toBeInTheDocument());
    expect(screen.getByTestId('recipient-existence-method-note')).toHaveTextContent(
      'recipientCheck.existence.methodDesc',
    );
    expect(screen.queryByText('recipientCheck.existence.badge.ldap')).toBeNull();
    expect(screen.queryByText('recipientCheck.existence.badge.api')).toBeNull();
    expect(screen.queryByText('recipientCheck.existence.badge.alias')).toBeNull();
    expect(screen.getByText('recipientCheck.existence.directionNote')).toBeInTheDocument();
  });

  it('模块关闭时状态字变已禁用且内容区灰化', async () => {
    setupApi({}, {}, false);
    const { container } = renderPage();
    await waitFor(() => expect(screen.getByText('recipientCheck.module.disabled')).toBeInTheDocument());
    expect(container.querySelector('.opacity-50.pointer-events-none')).not.toBeNull();
  });

  it('切换模块开关立即持久化到注册表(PUT /security/modules/recipient_check)', async () => {
    setupApi();
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByText('recipientCheck.module.enabled')).toBeInTheDocument());
    mockApiRequest.mockClear();

    const toggle = screen.getByTestId('recipient-check-module-switch');
    await user.click(toggle);

    await waitFor(() => expect(mockApiRequest).toHaveBeenCalledWith(
      '/security/modules/recipient_check',
      expect.objectContaining({ method: 'PUT', body: { enabled: false } }),
    ));
    await waitFor(() => expect(screen.getByText('recipientCheck.module.disabled')).toBeInTheDocument());
  });

  it('重置为默认会启用数量限制，但保持收件人存在性检查停用', async () => {
    setupApi(
      {
        mode: 'merged',
        is_active: false,
        inbound_limit: { limit: 7, scope: 'all', action: 'discard' },
        merged_limit: { limit: 9, action: 'quarantine' },
      },
      { existence_enabled: false, existence_action: 'discard' },
      false,
    );
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByText('recipientCheck.module.disabled')).toBeInTheDocument());
    mockApiRequest.mockClear();

    await user.click(screen.getByRole('button', { name: 'behaviorControl.recipientLimit.reset' }));

    await waitFor(() => expect(mockApiRequest).toHaveBeenCalledWith(
      '/behavior-control/recipient-policy',
      expect.objectContaining({
        method: 'PUT',
        body: {
          limit: expect.objectContaining({
            mode: 'detailed',
            is_active: true,
            inbound_limit: { limit: 30, scope: 'local', action: 'reject' },
            outbound_limit: { limit: 50, scope: 'all', action: 'audit' },
            internal_limit: { limit: 20, scope: 'local', action: 'quarantine' },
          }),
          check: { existence_enabled: false, existence_action: 'reject' },
        },
      }),
    ));
    const policyPutCalls = mockApiRequest.mock.calls.filter(
      ([path, options]) => path === '/behavior-control/recipient-policy' && options?.method === 'PUT',
    );
    expect(policyPutCalls).toHaveLength(1);
    expect(mockApiRequest).not.toHaveBeenCalledWith(
      '/behavior-control/recipient-limit-config',
      expect.objectContaining({ method: 'PUT' }),
    );
    expect(mockApiRequest).not.toHaveBeenCalledWith(
      '/behavior-control/recipient-check-config',
      expect.objectContaining({ method: 'PUT' }),
    );
    expect(mockApiRequest).not.toHaveBeenCalledWith(
      '/behavior-control/recipient-limit-config',
      expect.objectContaining({ method: 'DELETE' }),
    );
    expect(mockApiRequest).not.toHaveBeenCalledWith(
      '/behavior-control/recipient-check-config',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('数量限制关闭 → 配置模式卸载；存在性关闭 → 验证方式卸载', async () => {
    setupApi({ is_active: false }, { existence_enabled: false });
    renderPage();
    // 先等两份配置都成功读取并渲染；加载占位期本来就没有配置区块，不能
    // 把那个瞬间误判成“服务端关闭值已生效”。
    await screen.findByTestId('recipient-check-config-content');
    expect(screen.queryByText('recipientCheck.limit.modeLabel')).toBeNull();
    expect(screen.queryByTestId('recipient-existence-method-note')).toBeNull();
    expect(screen.getByText('recipientCheck.limit.title')).toBeInTheDocument();
  });

  it('后端未配置(空 action/scope/limit 0)时回落默认，不产生空后缀 i18n key', async () => {
    // 真实后端未配置时返回 {limit:0, scope:"", action:""}；normalizeLimit 必须把空串
    // 回落到默认，否则 t(`...action.${""}`) 解析出 `...action.` 抛 MISSING_MESSAGE。
    setupApi({
      is_active: true,
      inbound_limit: { limit: 0, scope: '' as unknown as 'local', action: '' as unknown as 'reject' },
      outbound_limit: { limit: 0, action: '' as unknown as 'reject' },
      internal_limit: { limit: 0, action: '' as unknown as 'reject' },
      merged_limit: { limit: 0, action: '' as unknown as 'reject' },
    });
    renderPage();
    await waitFor(() => expect(screen.getByText('recipientCheck.limit.direction.inbound')).toBeInTheDocument());
    // 不得出现空后缀 key
    expect(screen.queryByText('recipientCheck.limit.action.')).toBeNull();
    expect(screen.queryByText('recipientCheck.limit.actionDesc.')).toBeNull();
    // 回落默认值 30/50/20（limit 0 视为未设置）
    const nums = screen.getAllByRole('spinbutton') as HTMLInputElement[];
    expect(nums.map((n) => n.value)).toEqual(['30', '50', '20']);
  });

  it('切换配置模式为合并 → 内部发信卡 + amber 提示，外发/域内卡消失', async () => {
    setupApi();
    renderPage();
    await waitFor(() => expect(screen.getByText('recipientCheck.limit.mode.merged')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('radio', { name: 'recipientCheck.limit.mode.merged' }));
    await waitFor(() => expect(screen.getByText('recipientCheck.limit.mergedTitle')).toBeInTheDocument());
    expect(screen.getByText('recipientCheck.limit.mergedNote')).toBeInTheDocument();
    expect(screen.queryByText('recipientCheck.limit.direction.outbound')).toBeNull();
    expect(screen.queryByText('recipientCheck.limit.direction.internal')).toBeNull();
    // 接收方向仍在
    expect(screen.getByText('recipientCheck.limit.direction.inbound')).toBeInTheDocument();
  });

  it.each(['inbound', 'outbound', 'internal'] as const)(
    '详细模式的 %s 方向输入 0 时立即提示并阻止保存',
    async (direction) => {
      setupApi();
      renderPage();
      const input = await screen.findByTestId(`recipient-limit-value-${direction}`);
      const save = screen.getByTestId('recipient-check-save');
      mockApiRequest.mockClear();

      fireEvent.change(input, { target: { value: '0' } });

      expect(screen.getByTestId(`recipient-limit-error-${direction}`)).toHaveTextContent(
        'recipientCheck.limit.rangeError',
      );
      expect(input).toHaveAttribute('aria-invalid', 'true');
      expect(save).toBeDisabled();
      await userEvent.click(save);
      expect(mockApiRequest).not.toHaveBeenCalledWith(
        '/behavior-control/recipient-policy',
        expect.objectContaining({ method: 'PUT' }),
      );
    },
  );

  it.each([-1, 1, 1000])('合法边界 %i 保持可保存', async (value) => {
    setupApi();
    renderPage();
    const input = await screen.findByTestId('recipient-limit-value-inbound');

    fireEvent.change(input, { target: { value: String(value) } });

    expect(screen.queryByTestId('recipient-limit-error-inbound')).toBeNull();
    expect(input).toHaveAttribute('aria-invalid', 'false');
    expect(screen.getByTestId('recipient-check-save')).toBeEnabled();
  });

  it.each(['inbound', 'outbound', 'internal'] as const)(
    '详细模式的 %s 方向允许逐键输入 -1',
    async (direction) => {
      setupApi();
      renderPage();
      const user = userEvent.setup();
      const input = await screen.findByTestId(`recipient-limit-value-${direction}`) as HTMLInputElement;

      await user.clear(input);
      await user.type(input, '-1');

      expect(input.value).toBe('-1');
      expect(screen.queryByTestId(`recipient-limit-error-${direction}`)).toBeNull();
      expect(screen.getByTestId('recipient-check-save')).toBeEnabled();
    },
  );

  it('合并模式允许逐键输入 -1', async () => {
    setupApi();
    renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('recipient-limit-mode-merged'));
    const input = await screen.findByTestId('recipient-limit-value-merged') as HTMLInputElement;

    await user.clear(input);
    await user.type(input, '-1');

    expect(input.value).toBe('-1');
    expect(screen.queryByTestId('recipient-limit-error-merged')).toBeNull();
    expect(screen.getByTestId('recipient-check-save')).toBeEnabled();
  });

  it('合并模式输入 0 时立即提示并阻止保存', async () => {
    setupApi();
    renderPage();
    await screen.findByTestId('recipient-limit-mode-merged');
    await userEvent.click(screen.getByTestId('recipient-limit-mode-merged'));
    const input = await screen.findByTestId('recipient-limit-value-merged');
    const save = screen.getByTestId('recipient-check-save');
    mockApiRequest.mockClear();

    fireEvent.change(input, { target: { value: '0' } });

    expect(screen.getByTestId('recipient-limit-error-merged')).toHaveTextContent(
      'recipientCheck.limit.rangeError',
    );
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(save).toBeDisabled();
    await userEvent.click(save);
    expect(mockApiRequest).not.toHaveBeenCalledWith(
      '/behavior-control/recipient-policy',
      expect.objectContaining({ method: 'PUT' }),
    );
  });
});
