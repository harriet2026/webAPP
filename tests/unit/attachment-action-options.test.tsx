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
  it('反病毒处置下拉不再提供已下线的 audit 选项', async () => {
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
    expect(screen.queryByTestId('antivirus-virus-action-audit')).toBeNull();
    expect(await screen.findByTestId('antivirus-virus-action-quarantine')).toBeTruthy();
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
