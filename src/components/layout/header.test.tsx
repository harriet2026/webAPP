import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Header } from './header';

const mocks = vi.hoisted(() => ({
  logout: vi.fn(),
  push: vi.fn(),
  account: {
    username: 'admin',
    role: 'system_admin',
    name: '张运维',
  },
}));

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({
    user: {
      id: 1,
      username: 'admin',
      role: 'system_admin',
      tenant_id: null,
      created_at: '',
      updated_at: '',
    },
    logout: mocks.logout,
  }),
}));

vi.mock('@/components/profile/api', () => ({
  useAccount: () => ({
    data: mocks.account,
  }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock('next-intl', () => ({
  useLocale: () => 'zh',
  useTranslations: (namespace?: string) => (key: string) => {
    if (namespace === 'users') {
      return { systemAdmin: '系统管理员', tenantAdmin: '租户管理员' }[
        key as 'systemAdmin' | 'tenantAdmin'
      ] ?? key;
    }
    if (namespace === 'common') {
      return { cancel: '取消', confirm: '确认' }[key as 'cancel' | 'confirm'] ?? key;
    }
    return {
      'header.accountMenu': '账户菜单',
      'header.logout': '退出登录',
      'header.logoutConfirmDescription': '确定要退出当前账号登录吗？',
      'header.logoutConfirm': '确认退出',
      'profile.title': '个人中心',
    }[key] ?? key;
  },
}));

vi.mock('./product-form-switcher', () => ({
  ProductFormSwitcher: () => null,
}));

vi.mock('./theme-switcher', () => ({
  ThemeSwitcher: () => null,
}));

vi.mock('./language-switcher', () => ({
  LanguageSwitcher: () => null,
}));

describe('Header account menu', () => {
  beforeEach(() => {
    mocks.logout.mockReset();
    mocks.logout.mockResolvedValue(undefined);
    mocks.push.mockReset();
    mocks.account = {
      username: 'admin',
      role: 'system_admin',
      name: '张运维',
    };
  });

  it('matches the demo identity trigger and menu hierarchy', async () => {
    render(<Header />);

    const trigger = screen.getByTestId('user-menu-trigger');
    expect(trigger).toHaveAccessibleName('账户菜单');
    expect(trigger).toHaveTextContent('张');
    expect(trigger).toHaveTextContent('张运维');

    fireEvent.click(trigger);

    const menu = await screen.findByTestId('user-menu-content');
    expect(menu).toHaveTextContent('张运维');
    expect(menu).toHaveTextContent('系统管理员 · admin');
    expect(screen.getByRole('menuitem', { name: '个人中心' })).toBeVisible();

    const logoutItem = screen.getByRole('menuitem', { name: '退出登录' });
    expect(logoutItem).toHaveAttribute('data-variant', 'destructive');
    fireEvent.click(logoutItem);

    expect(await screen.findByText('确定要退出当前账号登录吗？')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '确认退出' }));
    expect(mocks.logout).toHaveBeenCalledTimes(1);
  });

  it('normalizes a username fallback and exposes every trigger interaction state', async () => {
    mocks.account = {
      username: 'admin',
      role: 'system_admin',
      name: '',
    };
    render(<Header />);

    const trigger = screen.getByTestId('user-menu-trigger');
    expect(screen.getByTestId('user-avatar-fallback')).toHaveTextContent('A');
    expect(trigger).toHaveTextContent('admin');
    expect(trigger).toHaveClass(
      'data-[hovered=true]:bg-muted/65',
      'data-pressed:bg-muted!',
      'focus-visible:ring-offset-2',
      'motion-reduce:transition-none',
    );

    fireEvent.pointerEnter(trigger, { pointerType: 'mouse' });
    expect(trigger).toHaveAttribute('data-hovered', 'true');

    fireEvent.pointerLeave(trigger, { pointerType: 'mouse' });
    expect(trigger).not.toHaveAttribute('data-hovered');

    fireEvent.pointerEnter(trigger, { pointerType: 'touch' });
    expect(trigger).not.toHaveAttribute('data-hovered');

    fireEvent.click(trigger);
    expect(await screen.findByTestId('user-menu-content')).toBeVisible();
    expect(trigger).toHaveAttribute('data-popup-open');
    expect(trigger).toHaveClass('bg-muted');
    expect(trigger).not.toHaveClass('data-[hovered=true]:bg-muted/65');
    expect(screen.getByTestId('user-menu-chevron')).toHaveClass(
      '[transform:rotate(180deg)]',
      'text-foreground',
      'motion-reduce:transition-none',
    );
  });
});
