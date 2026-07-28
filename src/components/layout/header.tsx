'use client';

import { useState } from 'react';
import { ChevronDown, LogOut, User } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { LanguageSwitcher } from './language-switcher';
import { ProductFormSwitcher } from './product-form-switcher';
import { ThemeSwitcher } from './theme-switcher';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { useAccount } from '@/components/profile/api';
import { roleLabelKey } from '@/lib/role-labels';
import { useTranslations, useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

export function Header() {
  const { user, logout } = useAuth();
  const { data: account } = useAccount();
  const t = useTranslations();
  const tUsers = useTranslations('users');
  const router = useRouter();
  const locale = useLocale();
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const username = account?.username?.trim() || user?.username?.trim() || '';
  const displayName =
    account?.name?.trim() || user?.name?.trim() || username;
  const role = account?.role || user?.role || '';
  const roleKey = roleLabelKey(role);
  const roleLabel = roleKey ? tUsers(roleKey) : role;
  const avatarText = (Array.from(displayName)[0] || '?').toLocaleUpperCase(locale);

  return (
    <>
      <header
        className="sticky top-0 z-20 h-14 shrink-0 border-b border-border bg-card"
        data-testid="app-header"
      >
        <div className="flex h-full items-center justify-end gap-3 px-6">
          <div className="flex items-center gap-3">
            <ProductFormSwitcher />

            <ThemeSwitcher />

            <LanguageSwitcher />

            <div className="h-5 w-px bg-border" />

            <DropdownMenu open={userMenuOpen} onOpenChange={setUserMenuOpen}>
              <DropdownMenuTrigger
                className={cn(
                  'flex items-center gap-2 rounded-md px-1.5 py-1 text-foreground transition-[background-color,color] duration-[120ms] ease-out motion-reduce:transition-none data-pressed:bg-muted! focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-card',
                  userMenuOpen
                    ? 'bg-muted'
                    : 'data-[hovered=true]:bg-muted/65',
                )}
                aria-label={t('header.accountMenu')}
                data-testid="user-menu-trigger"
              >
                <Avatar className="size-7 after:border-transparent">
                  <AvatarFallback
                    className="bg-primary text-xs font-medium text-primary-foreground"
                    data-testid="user-avatar-fallback"
                  >
                    {avatarText}
                  </AvatarFallback>
                </Avatar>
                <span className="hidden max-w-32 truncate text-sm font-medium sm:inline">
                  {displayName}
                </span>
                <ChevronDown
                  className={cn(
                    'size-4 text-muted-foreground transition-[color,transform] duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
                    userMenuOpen && '[transform:rotate(180deg)] text-foreground',
                  )}
                  aria-hidden="true"
                  data-testid="user-menu-chevron"
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-52 rounded-md border border-border"
                data-testid="user-menu-content"
              >
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="px-2 py-1.5 font-normal">
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate text-sm font-medium text-foreground">
                        {displayName}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {roleLabel} · {username}
                      </span>
                    </span>
                  </DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                {/* GT-12501: 「个人信息」快捷改密弹窗入口按验收要求隐藏，
                    改密功能保留在「个人中心」页（PasswordTab）。 */}
                <DropdownMenuItem
                  onClick={() => setTimeout(() => router.push(`/${locale}/profile`), 0)}
                  className="gap-2 px-2 py-1.5"
                >
                  <User className="mr-2 size-4" />
                  {t('profile.title')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => setLogoutOpen(true)}
                  className="gap-2 px-2 py-1.5"
                >
                  <LogOut className="mr-2 size-4" />
                  {t('header.logout')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <ConfirmDialog
        open={logoutOpen}
        onOpenChange={setLogoutOpen}
        title={t('header.logout')}
        description={t('header.logoutConfirmDescription')}
        confirmText={t('header.logoutConfirm')}
        onConfirm={() => {
          setLogoutOpen(false);
          void logout();
        }}
        variant="destructive"
      />
    </>
  );
}
