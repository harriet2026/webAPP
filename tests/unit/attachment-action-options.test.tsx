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
import {
  DEFAULT_ENCRYPTED_ACTIONS,
  DEFAULT_ENCRYPTED_CONFIG,
  EncryptedAttachmentTab,
} from '@/components/security/attachment-security/EncryptedAttachmentTab';

describe('附件安全处置动作下拉(GT-12729/GT-12938)', () => {
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

  it('反病毒扫描超时处置提供 proceed/audit，不再提供 accept/reject', async () => {
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
    expect(await screen.findByTestId('antivirus-timeout-action-audit')).toBeTruthy();
    expect(screen.queryByTestId('antivirus-timeout-action-reject')).toBeNull();
    expect(screen.queryByTestId('antivirus-timeout-action-accept')).toBeNull();
    expect(await screen.findByTestId('antivirus-timeout-action-quarantine')).toBeTruthy();
    expect(await screen.findByTestId('antivirus-timeout-action-proceed')).toBeTruthy();
  });

  it('二维码轻量检测处置提供 audit、不再提供 reject', async () => {
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
    expect(await screen.findByTestId('qr-light-action-audit')).toBeTruthy();
    expect(screen.queryByTestId('qr-light-action-reject')).toBeNull();
    expect(await screen.findByTestId('qr-light-action-quarantine')).toBeTruthy();
  });

  it('加密附件解密失败处置提供 proceed/audit，不再提供 accept/reject', async () => {
    const user = userEvent.setup();
    render(
      <EncryptedAttachmentTab
        config={{ ...DEFAULT_ENCRYPTED_CONFIG, use_password_book: false }}
        actions={DEFAULT_ENCRYPTED_ACTIONS}
        onChange={() => {}}
        onActionsChange={() => {}}
      />,
    );
    await user.click(screen.getByTestId('decrypt-fail-action'));
    expect(await screen.findByTestId('decrypt-fail-action-audit')).toBeTruthy();
    expect(screen.queryByTestId('decrypt-fail-action-reject')).toBeNull();
    expect(screen.queryByTestId('decrypt-fail-action-accept')).toBeNull();
    expect(await screen.findByTestId('decrypt-fail-action-quarantine')).toBeTruthy();
    expect(await screen.findByTestId('decrypt-fail-action-proceed')).toBeTruthy();
  });
});
