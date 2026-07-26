'use client';

import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ReceivingTab } from './receiving-tab';
import { RelayTab } from './relay-tab';
import { OutboundRoutingTab } from './OutboundRoutingTab';
import { MailAuthTab } from './mail-auth-tab';

export interface MailRoutingShellProps {
  /** The tenant whose routing config is being edited (single = default tenant). */
  tenantId: number;
}

const VALID_TABS = ['receiving', 'relay', 'outbound', 'auth'] as const;
type MailRoutingTab = (typeof VALID_TABS)[number];

function resolveInitialTab(searchParams: URLSearchParams | null): MailRoutingTab {
  if (searchParams) {
    const t = searchParams.get('tab');
    if (t && (VALID_TABS as readonly string[]).includes(t)) {
      return t as MailRoutingTab;
    }
  }
  return 'receiving';
}

function parseConfigParam(searchParams: URLSearchParams | null): number | undefined {
  const raw = searchParams?.get('config');
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

export function MailRoutingShell({ tenantId }: MailRoutingShellProps) {
  const t = useTranslations('mailRouting');
  const searchParams = useSearchParams();
  const initialTab = resolveInitialTab(searchParams);
  // The auth-attempts detail drawer deep-links here as
  // `?tab=auth&config=<id>` to point at the matched mail_auth_config; pass the
  // id down so MailAuthTab highlights that row (previously the param was ignored
  // and the jump only switched tabs).
  const highlightConfigId = parseConfigParam(searchParams);
  return (
    <Tabs defaultValue={initialTab} className="w-full">
      <TabsList>
        <TabsTrigger value="receiving">{t('tabs.receiving')}</TabsTrigger>
        <TabsTrigger value="relay">{t('tabs.relay')}</TabsTrigger>
        <TabsTrigger value="outbound">{t('tabs.outbound')}</TabsTrigger>
        <TabsTrigger value="auth">{t('tabs.auth')}</TabsTrigger>
      </TabsList>
      <TabsContent value="receiving" className="mt-4">
        <ReceivingTab tenantId={tenantId} />
      </TabsContent>
      {/* Tab bodies filled by future plans; each receives tenantId. */}
      <TabsContent value="relay" className="mt-4">
        <RelayTab tenantId={tenantId} />
      </TabsContent>
      <TabsContent value="outbound" className="mt-4">
        <OutboundRoutingTab tenantId={tenantId} />
      </TabsContent>
      <TabsContent value="auth" className="mt-4">
        <MailAuthTab tenantId={tenantId} highlightConfigId={highlightConfigId} />
      </TabsContent>
    </Tabs>
  );
}
