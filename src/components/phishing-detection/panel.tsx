'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PhishingOverviewPage } from './phishing-overview-page';
import { PhishingConfigPage } from './config/phishing-config-page';
import { usePhishingControl } from './control/use-phishing-control';

export type PhishingAgentTab = 'overview' | 'config';

export function PhishingAgentPanel({ initialTab = 'overview', configurationEnabled = true, hitRate = null }: {
  initialTab?: PhishingAgentTab;
  configurationEnabled?: boolean;
  hitRate?: number | null;
}) {
  const t = useTranslations('phishingDetection');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const control = usePhishingControl();
  const requestedTab = configurationEnabled ? initialTab : 'overview';
  const [activeTab, setActiveTab] = useState<PhishingAgentTab>(requestedTab);
  const [lastRequestedTab, setLastRequestedTab] = useState<PhishingAgentTab>(requestedTab);
  const [openCreateSignal, setOpenCreateSignal] = useState(0);
  const [consumedAction, setConsumedAction] = useState('');
  const actionToken = configurationEnabled && searchParams.get('action') === 'create-admission-rule'
    ? searchParams.toString()
    : '';

  if (actionToken && actionToken !== consumedAction) {
    setConsumedAction(actionToken);
    setActiveTab('config');
    setOpenCreateSignal((value) => value + 1);
  } else if (!actionToken && consumedAction) {
    setConsumedAction('');
  } else if (!actionToken && requestedTab !== lastRequestedTab) {
    setLastRequestedTab(requestedTab);
    setActiveTab(requestedTab);
  }

  useEffect(() => {
    if (!actionToken) return;
    const next = new URLSearchParams(searchParams.toString());
    next.set('tab', 'config');
    next.delete('action');
    router.replace(`${pathname}?${next.toString()}`);
  }, [actionToken, pathname, router, searchParams]);

  const changeTab = (value: string) => {
    const tab = value as PhishingAgentTab;
    setActiveTab(tab);
    const next = new URLSearchParams(searchParams.toString());
    next.set('tab', tab);
    next.delete('action');
    router.replace(`${pathname}?${next.toString()}`);
  };

  return <Tabs value={activeTab} onValueChange={changeTab} className="flex h-full flex-col">
    <TabsList className="mb-4 shrink-0 self-start rounded-lg border-border bg-muted/30 shadow-none">
      <TabsTrigger value="overview" className="min-h-8 rounded-md px-3">{t('tabs.overview')}</TabsTrigger>
      {configurationEnabled ? <TabsTrigger value="config" className="min-h-8 rounded-md px-3" data-testid="phishing-config-tab">{t('tabs.config')}</TabsTrigger> : null}
    </TabsList>
    {control.errorMessage ? <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive" data-testid="phishing-control-error">{control.errorMessage}</div> : null}
    {control.control && !control.enabled ? <div className="mb-4 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning-foreground dark:text-warning" data-testid="phishing-disabled-banner">{t('control.disabledBanner')}</div> : null}
    <TabsContent value="overview" className="mt-0 flex-1 overflow-auto"><PhishingOverviewPage hitRate={hitRate} /></TabsContent>
    {configurationEnabled ? <TabsContent value="config" className="mt-0 flex-1 overflow-auto"><PhishingConfigPage openCreateSignal={openCreateSignal} /></TabsContent> : null}
  </Tabs>;
}
