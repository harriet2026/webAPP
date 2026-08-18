import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/lib/api/client', () => ({ useApiRequest: () => ({ apiRequest: vi.fn() }) }));
vi.mock('@/lib/api/attachment-security', () => ({
  getAntivirusStatus: vi.fn().mockResolvedValue(null),
  triggerAntivirusUpdate: vi.fn(),
}));

import { AntivirusTab, DEFAULT_ANTIVIRUS_ACTIONS, DEFAULT_ANTIVIRUS_CONFIG } from '@/components/security/attachment-security/AntivirusTab';
import {
  ImageDetectTab,
  DEFAULT_IMAGE_DETECT_ACTIONS,
  DEFAULT_IMAGE_DETECT_CONFIG,
  DEFAULT_QR_DEEP_ROUTES,
} from '@/components/security/attachment-security/ImageDetectTab';

describe('附件安全处置动作下拉(GT-12729)', () => {
  // GT-12818 起「发现病毒后的处置」下拉去掉「拒收」、重新提供「审核」，
  // 覆盖了 GT-12729 当时"audit 已下线"的口径。超时处置与二维码轻量检测不变。
  it('反病毒处置下拉提供 audit、不再提供 reject', async () => {
    const user = userEvent.setup();
    render(
      <AntivirusTab
        config={DEFAULT_ANTIVIRUS_CONFIG}
        actions={DEFAULT_ANTIVIRUS_ACTIONS}
        onChange={() => {}}
        onActionsChange={() => {}}
      />,
    );
    // jsdom 驱动 Base UI Select: userEvent.click 触发器后弹层选项进入文档
    // (先例 webapp/tests/unit/geoip-library-table.test.tsx;fireEvent.click 不行)
    await user.click(screen.getByTestId('antivirus-virus-action'));
    expect(await screen.findByTestId('antivirus-virus-action-audit')).toBeTruthy();
    expect(await screen.findByTestId('antivirus-virus-action-quarantine')).toBeTruthy();
    expect(screen.queryByTestId('antivirus-virus-action-reject')).toBeNull();
  });

  // GT-12818 产品裁决：「拒收」只是新建不给选，**存量继续生效**（后端仍接受并执行）。
  // 所以存量配置为 reject 的租户必须还能在下拉里看到自己当前的动作，只是选不中——
  // 否则触发器上写着「拒收」、列表里却没有这一项，管理员无从确认自己现在是什么行为。
  it('存量 reject 以禁用项形式可见（新建仍不可选）', async () => {
    const user = userEvent.setup();
    render(
      <AntivirusTab
        config={DEFAULT_ANTIVIRUS_CONFIG}
        actions={{ ...DEFAULT_ANTIVIRUS_ACTIONS, virus_action: 'reject' as never }}
        onChange={() => {}}
        onActionsChange={() => {}}
      />,
    );
    await user.click(screen.getByTestId('antivirus-virus-action'));
    const legacy = await screen.findByTestId('antivirus-virus-action-reject');
    expect(legacy).toBeTruthy();
    expect(legacy.getAttribute('data-disabled')).not.toBeNull();
  });

  it('反病毒扫描超时处置下拉不再提供已下线的 audit 选项', async () => {
    const user = userEvent.setup();
    render(
      <AntivirusTab
        config={DEFAULT_ANTIVIRUS_CONFIG}
        actions={DEFAULT_ANTIVIRUS_ACTIONS}
        onChange={() => {}}
        onActionsChange={() => {}}
      />,
    );
    await user.click(screen.getByTestId('antivirus-timeout-action'));
    expect(screen.queryByTestId('antivirus-timeout-action-audit')).toBeNull();
    expect(await screen.findByTestId('antivirus-timeout-action-quarantine')).toBeTruthy();
    expect(await screen.findByTestId('antivirus-timeout-action-accept')).toBeTruthy();
  });

  it('二维码轻量检测处置下拉不再提供已下线的 audit 选项', async () => {
    const user = userEvent.setup();
    render(
      <ImageDetectTab
        config={DEFAULT_IMAGE_DETECT_CONFIG}
        routes={DEFAULT_QR_DEEP_ROUTES}
        actions={DEFAULT_IMAGE_DETECT_ACTIONS}
        onChange={() => {}}
        onRoutesChange={() => {}}
        onActionsChange={() => {}}
      />,
    );
    await user.click(screen.getByTestId('qr-light-action'));
    expect(screen.queryByTestId('qr-light-action-audit')).toBeNull();
    expect(await screen.findByTestId('qr-light-action-quarantine')).toBeTruthy();
  });
});
