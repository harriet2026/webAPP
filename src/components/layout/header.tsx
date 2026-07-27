'use client';

import { LogOut, User, UserCircle } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { LanguageSwitcher } from './language-switcher';
import { ProductFormSwitcher } from './product-form-switcher';
import { ThemeSwitcher } from './theme-switcher';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTranslations, useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';

export function Header() {
  const { user, logout } = useAuth();
  const t = useTranslations();
  const router = useRouter();
  const locale = useLocale();
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

            <DropdownMenu>
              <DropdownMenuTrigger className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
                <User className="h-5 w-5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 rounded-md border-border">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>
                    {user?.username}
                    {user?.tenant_id && <span className="text-muted-foreground ml-1">({t('header.tenantLabel')}: {user.tenant_id})</span>}
                  </DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                {/* GT-12501: 「个人信息」快捷改密弹窗入口按验收要求隐藏，
                    改密功能保留在「个人中心」页（PasswordTab）。 */}
                <DropdownMenuItem onClick={() => setTimeout(() => router.push(`/${locale}/profile`), 0)}>
                  <UserCircle className="h-4 w-4 mr-2" />
                  {t('profile.title')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTimeout(() => logout(), 0)}>
                  <LogOut className="h-4 w-4 mr-2" />
                  {t('header.logout')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

    </>
  );
}
