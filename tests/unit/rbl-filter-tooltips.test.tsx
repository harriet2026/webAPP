// GT-12263: RBL 过滤配置页缺少服务器/动作 Tooltip（PRD §3 交互设计-关键字段悬浮提示、TC015）。
// GT-12682 改版后处置区变成「执行动作 / 灰名单策略」两张互斥卡片，四个动作的说明文案
// 移进了 Select 选项内部（收起时不在 DOM），配置页常驻的 tooltip-trigger 变为 7 处：
// 3 个预置 RBL 服务器 Badge + 查询超时 + 处置策略标题 + 执行动作标题 + 灰名单策略标题。
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import zh from '../../messages/zh.json';
import en from '../../messages/en.json';
import ru from '../../messages/ru.json';
import th from '../../messages/th.json';

const { mockApiRequest } = vi.hoisted(() => ({
  mockApiRequest: vi.fn(),
}));

vi.mock('@/lib/api/client', () => ({
  useApiRequest: () => ({ apiRequest: mockApiRequest }),
  apiRequest: mockApiRequest,
  ApiError: class ApiError extends Error {},
}));

// 用真实 zh 文案驱动 t()，让断言能核对 PRD 权威文案；key 缺失时回显 key 原文
// （next-intl 的实际行为），这样漏加 i18n key 会被下面的文案断言直接抓住。
function lookup(obj: unknown, key: string): string | undefined {
  let cur: unknown = obj;
  for (const part of key.split('.')) {
    if (typeof cur !== 'object' || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return typeof cur === 'string' ? cur : undefined;
}

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, string | number>) => {
    let text = lookup(zh, key) ?? key;
    if (params) {
      for (const [k, v] of Object.entries(params)) text = text.replace(`{${k}}`, String(v));
    }
    return text;
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ isSystemAdmin: true, selectedTenantId: null, user: { role: 'system_admin' } }),
}));

// ModuleMasterSwitch 依赖 product-form-context + security-modules API，与本用例无关；
// 用保留 QC 定位容器 data-testid 的最小替身（QC 断言即数该容器内的 trigger 数）。
vi.mock('@/components/security/ModuleMasterSwitch', () => ({
  ModuleMasterSwitch: ({ page, children }: { page: string; children: React.ReactNode }) =>
    createElement('div', { 'data-testid': `module-content-${page}` }, children),
}));

vi.mock('@/lib/api/detection-profiles', () => ({
  getDetectionProfiles: vi.fn().mockResolvedValue([]),
  createDetectionProfile: vi.fn(),
  updateDetectionProfile: vi.fn(),
  deleteDetectionProfile: vi.fn(),
}));

vi.mock('@/lib/api/rbl-filter', () => ({
  getRBLFilterRules: vi.fn().mockResolvedValue({ items: [] }),
  createRBLFilterRule: vi.fn(),
  updateRBLFilterRule: vi.fn(),
}));

import { RBLFilterPage } from '@/components/security/RBLFilterPage';

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <RBLFilterPage embedded />
    </QueryClientProvider>,
  );
}

async function renderLoaded() {
  const utils = renderPage();
  // 等 profiles/rules 查询完成、配置面板（超时输入框已有的 tooltip）渲染出来
  await waitFor(() => {
    expect(utils.container.querySelectorAll('[data-slot="tooltip-trigger"]').length).toBeGreaterThan(0);
  });
  return utils;
}

describe('GT-12263 RBL config-page tooltips', () => {
  beforeEach(() => {
    mockApiRequest.mockReset();
  });

  it('renders >= 7 tooltip triggers inside module-content-rbl_filter (3 servers + timeout + 3 section titles)', async () => {
    const { container } = await renderLoaded();
    const scope = container.querySelector('[data-testid="module-content-rbl_filter"]');
    expect(scope).not.toBeNull();
    const triggers = scope!.querySelectorAll('[data-slot="tooltip-trigger"]');
    expect(triggers.length).toBeGreaterThanOrEqual(7);
  });

  it('server badge tooltip opens with the PRD source description (zen.spamhaus.org)', async () => {
    const { container, baseElement } = await renderLoaded();
    const scope = container.querySelector('[data-testid="module-content-rbl_filter"]')!;
    const badgeTrigger = Array.from(scope.querySelectorAll('[data-slot="tooltip-trigger"]')).find((el) =>
      el.textContent?.includes('zen.spamhaus.org'),
    ) as HTMLElement | undefined;
    expect(badgeTrigger).toBeTruthy();
    fireEvent.focus(badgeTrigger!);
    await waitFor(() => {
      const contents = Array.from(baseElement.querySelectorAll('[data-slot="tooltip-content"]'));
      expect(contents.some((el) => el.textContent?.includes('Spamhaus综合黑名单'))).toBe(true);
    });
  });

  it('hangs a tooltip trigger off each disposal-strategy section title', async () => {
    const { container } = await renderLoaded();
    const scope = container.querySelector('[data-testid="module-content-rbl_filter"]')!;
    // 三个标题（处置策略 / 执行动作 / 灰名单策略）各自紧挨着一个 HelpCircle 触发器。
    // 触发器是 <svg>（不可聚焦），故只断言结构；tooltip 的实际展开行为由上面的
    // 服务器 Badge 用例覆盖。
    for (const title of [
      zh.rblFilter.disposalStrategyTitle,
      zh.rblFilter.actionSectionTitle,
      zh.rblFilter.greylistSectionTitle,
    ]) {
      const titleEl = Array.from(scope.querySelectorAll('p')).find((el) => el.textContent === title);
      expect(titleEl, `title not rendered: ${title}`).toBeTruthy();
      expect(
        titleEl!.parentElement?.querySelector('[data-slot="tooltip-trigger"]'),
        `no tooltip trigger next to: ${title}`,
      ).toBeTruthy();
    }
  });

  it('renders the two mutually-exclusive strategy cards with the action Select selected by default', async () => {
    const { container } = await renderLoaded();
    const scope = container.querySelector('[data-testid="module-content-rbl_filter"]')!;
    const text = scope.textContent ?? '';
    expect(text).toContain(zh.rblFilter.actionSectionTitle);
    expect(text).toContain(zh.rblFilter.greylistSectionTitle);
    // 默认走执行动作卡片（greylistEnabled=false），Select 显示默认动作「拒收」
    expect(text).toContain(zh.rblFilter.actionReject);
  });

  it('all four locales carry the tooltip keys (next-intl silently renders missing keys)', () => {
    const keys = [
      'rblFilter.serverTipGeneric',
      'rblFilter.serverTipZenSpamhaus',
      'rblFilter.serverTipBlSpamcop',
      'rblFilter.serverTipBarracuda',
      'rblFilter.actionRejectTip',
      'rblFilter.actionQuarantineTip',
      'rblFilter.actionReviewTip',
      'rblFilter.actionDiscardTip',
      'rblFilter.actionGreylistTip',
      'rblFilter.disposalStrategyDesc',
      'rblFilter.actionSectionDesc',
      'rblFilter.greylistSectionDesc',
    ];
    for (const locale of [zh, en, ru, th]) {
      for (const key of keys) {
        expect(lookup(locale, key), `${key} missing in a locale`).toBeTruthy();
      }
    }
  });

  it('zh tooltip copy matches the PRD §3 authoritative text', () => {
    expect(zh.rblFilter.serverTipZenSpamhaus).toContain('Spamhaus综合黑名单');
    expect(zh.rblFilter.serverTipBlSpamcop).toContain('SpamCop');
    expect(zh.rblFilter.serverTipBarracuda).toContain('Barracuda');
    expect(zh.rblFilter.actionRejectTip).toContain('立即拒绝连接');
    expect(zh.rblFilter.actionQuarantineTip).toContain('隔离队列');
    expect(zh.rblFilter.actionReviewTip).toContain('人工审核');
    expect(zh.rblFilter.actionDiscardTip).toContain('静默丢弃');
    expect(zh.rblFilter.actionGreylistTip).toContain('临时拒绝');
  });
});
