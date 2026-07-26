'use client';

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTranslations } from 'next-intl';
import { AccountInfoTab } from './AccountInfoTab';
import { PasswordTab } from './PasswordTab';
import { TwoFactorTab } from './TwoFactorTab';
import { SessionsTab } from './SessionsTab';
import { TrustedDevicesTab } from './TrustedDevicesTab';
import { LoginHistoryTab } from './LoginHistoryTab';

export function ProfilePage() {
  const t = useTranslations('profile');
  const [displayName, setDisplayName] = useState<string>('');

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs text-muted-foreground">{t('breadcrumb')}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          {t('title')}
          {displayName ? (
            <span className="ml-2 align-middle text-base font-normal text-muted-foreground">
              {displayName}
            </span>
          ) : null}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      <Tabs defaultValue="account" className="w-full">
        <TabsList>
          <TabsTrigger value="account">{t('tabs.account')}</TabsTrigger>
          <TabsTrigger value="password">{t('tabs.password')}</TabsTrigger>
          <TabsTrigger value="twoFactor">{t('tabs.twoFactor')}</TabsTrigger>
          <TabsTrigger value="sessions">{t('tabs.sessions')}</TabsTrigger>
          <TabsTrigger value="devices">{t('tabs.trustedDevices')}</TabsTrigger>
          <TabsTrigger value="history">{t('tabs.history')}</TabsTrigger>
        </TabsList>

        <TabsContent value="account" className="mt-4">
          <AccountInfoTab onNameChange={setDisplayName} />
        </TabsContent>
        <TabsContent value="password" className="mt-4">
          <PasswordTab />
        </TabsContent>
        <TabsContent value="twoFactor" className="mt-4">
          <TwoFactorTab />
        </TabsContent>
        <TabsContent value="sessions" className="mt-4">
          <SessionsTab />
        </TabsContent>
        <TabsContent value="devices" className="mt-4">
          <TrustedDevicesTab />
        </TabsContent>
        <TabsContent value="history" className="mt-4">
          <LoginHistoryTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
