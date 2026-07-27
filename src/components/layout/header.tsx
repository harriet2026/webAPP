'use client';

import { useState } from 'react';
import { LogOut, User, Loader2, UserCircle, PanelLeft, PanelLeftClose } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/auth-context';
import { useSidebarCollapse } from '@/contexts/sidebar-collapse-context';
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useTranslations, useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { changePassword } from '@/lib/api/auth';
import { useApiRequest } from '@/lib/api/client';
import { toast } from 'sonner';

export function Header() {
  const { user, logout } = useAuth();
  const { collapsed, toggleCollapsed } = useSidebarCollapse();
  const t = useTranslations();
  const router = useRouter();
  const locale = useLocale();
  const { apiRequest: apiRequestFn } = useApiRequest();
  const [profileOpen, setProfileOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error(t('profile.allFieldsRequired'));
      return;
    }
    if (newPassword.length < 6) {
      toast.error(t('profile.passwordTooShort'));
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error(t('profile.passwordMismatch'));
      return;
    }
    setIsSubmitting(true);
    try {
      await changePassword(currentPassword, newPassword, apiRequestFn);
      toast.success(t('profile.passwordChanged'));
      setProfileOpen(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('common.error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <header
        className="sticky top-0 z-20 h-14 shrink-0 border-b border-border bg-card"
        data-testid="app-header"
      >
        <div className="flex h-full items-center justify-between gap-3 px-6">
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? t('sidebar.expandNav') : t('sidebar.collapseNav')}
            aria-pressed={collapsed}
            title={collapsed ? t('sidebar.expandNav') : t('sidebar.collapseNav')}
            className="hidden h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 md:inline-flex"
            data-testid="sidebar-collapse-toggle"
          >
            {collapsed ? <PanelLeft className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
          </button>

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
                <DropdownMenuItem onClick={() => setTimeout(() => setProfileOpen(true), 0)}>
                  <User className="h-4 w-4 mr-2" />
                  {t('header.profile')}
                </DropdownMenuItem>
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

      <Dialog open={profileOpen} onOpenChange={(open) => !open && setProfileOpen(false)}>
        <DialogContent className="max-w-md rounded-xl border-border shadow-2xl">
          <DialogHeader>
            <DialogTitle>{t('header.profile')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('profile.username')}</Label>
              <Input value={user?.username || ''} disabled />
            </div>
            <div className="space-y-2">
              <Label>{t('profile.currentPassword')}</Label>
              <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t('profile.newPassword')}</Label>
              <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t('profile.confirmPassword')}</Label>
              <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProfileOpen(false)}>{t('common.cancel')}</Button>
            <Button onClick={handleChangePassword} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {t('profile.changePassword')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
