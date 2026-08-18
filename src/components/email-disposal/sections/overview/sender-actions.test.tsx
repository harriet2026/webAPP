import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SenderActions } from './sender-actions';

// Identity translator (mirrors recipient-status.test.tsx): keeps namespace +
// key + interpolation params visible instead of resolving to real zh/en/th/ru
// copy, so this test stays decoupled from messages/*.json content.
// GT-12628: SenderActions/useRecipientDisposition 现从 useAuth 取角色决定
// 规则 priority（tenant_admin 上限 1000），测试按平台管理员形态 mock。
vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ isSystemAdmin: true }),
}));

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string, params?: Record<string, unknown>) => (
    params ? `${namespace}.${key}:${JSON.stringify(params)}` : `${namespace}.${key}`
  ),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('../../lib/disposal-detail-api', () => ({
  addSenderFilterRule: vi.fn(),
  // 真实实现（GT-12601/GT-12628）：按角色 5000/1000，mock 同语义。
  disposalRulePriority: (isSystemAdmin: boolean) => (isSystemAdmin ? 5000 : 1000),
}));

import { addSenderFilterRule } from '../../lib/disposal-detail-api';

const mockAddSenderFilterRule = addSenderFilterRule as unknown as ReturnType<typeof vi.fn>;

function baseProps(overrides: Partial<React.ComponentProps<typeof SenderActions>> = {}) {
  return {
    sender: 'attacker@evil.com',
    apiRequest: vi.fn() as never,
    isSingleRecipient: false,
    ...overrides,
  };
}

beforeEach(() => {
  mockAddSenderFilterRule.mockReset();
  mockAddSenderFilterRule.mockResolvedValue(undefined);
});

describe('SenderActions', () => {
  it('renders blacklist and whitelist without the removed more menu', () => {
    render(<SenderActions {...baseProps()} />);
    expect(screen.getByTestId('email-disposal-overview-action-blacklist')).toBeInTheDocument();
    expect(screen.getByTestId('email-disposal-overview-action-whitelist')).toBeInTheDocument();
    expect(screen.queryByTestId('email-disposal-overview-action-more')).not.toBeInTheDocument();
  });

  it('renders the multi-recipient hint when isSingleRecipient is false', () => {
    render(<SenderActions {...baseProps({ isSingleRecipient: false })} />);
    expect(screen.getByTestId('email-disposal-overview-recipient-hint')).toBeInTheDocument();
  });

  it('does not render the multi-recipient hint when isSingleRecipient is true', () => {
    render(<SenderActions {...baseProps({ isSingleRecipient: true })} />);
    expect(screen.queryByTestId('email-disposal-overview-recipient-hint')).not.toBeInTheDocument();
  });

  it('opens the E1 blacklist dialog with the include-subdomains checkbox (scope selection removed)', async () => {
    const user = userEvent.setup();
    render(<SenderActions {...baseProps()} />);
    await user.click(screen.getByTestId('email-disposal-overview-action-blacklist'));

    const dialog = await screen.findByTestId('email-disposal-overview-blacklist-dialog');
    expect(within(dialog).queryByTestId('email-disposal-overview-blacklist-scope-tenant')).not.toBeInTheDocument();
    expect(within(dialog).queryByTestId('email-disposal-overview-blacklist-scope-global')).not.toBeInTheDocument();
    expect(within(dialog).getByTestId('email-disposal-overview-blacklist-include-subdomains')).toBeInTheDocument();
  });

  it('opens the E2 whitelist dialog with NO scope radios and NO include-subdomains checkbox', async () => {
    const user = userEvent.setup();
    render(<SenderActions {...baseProps()} />);
    await user.click(screen.getByTestId('email-disposal-overview-action-whitelist'));

    const dialog = await screen.findByTestId('email-disposal-overview-whitelist-dialog');
    expect(within(dialog).queryByTestId('email-disposal-overview-whitelist-scope-tenant')).not.toBeInTheDocument();
    expect(within(dialog).queryByTestId('email-disposal-overview-whitelist-scope-global')).not.toBeInTheDocument();
    expect(within(dialog).queryByTestId('email-disposal-overview-whitelist-include-subdomains')).not.toBeInTheDocument();
  });

  it('confirms blacklist with the default (tenant) scope and includeSubdomains=false', async () => {
    const user = userEvent.setup();
    const apiRequest = vi.fn() as never;
    render(<SenderActions {...baseProps({ apiRequest })} />);
    await user.click(screen.getByTestId('email-disposal-overview-action-blacklist'));
    await user.click(screen.getByTestId('email-disposal-overview-blacklist-confirm'));

    await waitFor(() => expect(mockAddSenderFilterRule).toHaveBeenCalledTimes(1));
    expect(mockAddSenderFilterRule).toHaveBeenCalledWith(
      'attacker@evil.com',
      'blacklist',
      apiRequest,
      5000, // isSystemAdmin mock → disposalRulePriority(true)（GT-12628）
      { scope: 'tenant', includeSubdomains: false },
    );
  });

  it('confirms blacklist with includeSubdomains=true when selected (scope fixed to tenant)', async () => {
    const user = userEvent.setup();
    const apiRequest = vi.fn() as never;
    render(<SenderActions {...baseProps({ apiRequest })} />);
    await user.click(screen.getByTestId('email-disposal-overview-action-blacklist'));

    const dialog = await screen.findByTestId('email-disposal-overview-blacklist-dialog');
    await user.click(within(dialog).getByTestId('email-disposal-overview-blacklist-include-subdomains'));
    await user.click(within(dialog).getByTestId('email-disposal-overview-blacklist-confirm'));

    await waitFor(() => expect(mockAddSenderFilterRule).toHaveBeenCalledTimes(1));
    expect(mockAddSenderFilterRule).toHaveBeenCalledWith(
      'attacker@evil.com',
      'blacklist',
      apiRequest,
      5000,
      { scope: 'tenant', includeSubdomains: true },
    );
  });

  it('confirms whitelist with the fixed tenant scope', async () => {
    const user = userEvent.setup();
    const apiRequest = vi.fn() as never;
    render(<SenderActions {...baseProps({ apiRequest })} />);
    await user.click(screen.getByTestId('email-disposal-overview-action-whitelist'));

    const dialog = await screen.findByTestId('email-disposal-overview-whitelist-dialog');
    await user.click(within(dialog).getByTestId('email-disposal-overview-whitelist-confirm'));

    await waitFor(() => expect(mockAddSenderFilterRule).toHaveBeenCalledTimes(1));
    expect(mockAddSenderFilterRule).toHaveBeenCalledWith(
      'attacker@evil.com',
      'whitelist',
      apiRequest,
      5000,
      { scope: 'tenant' },
    );
  });

  it('disables the blacklist and whitelist buttons when readOnly', () => {
    render(<SenderActions {...baseProps({ readOnly: true })} />);
    expect(screen.getByTestId('email-disposal-overview-action-blacklist')).toBeDisabled();
    expect(screen.getByTestId('email-disposal-overview-action-whitelist')).toBeDisabled();
  });
});
