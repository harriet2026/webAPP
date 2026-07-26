'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TopBar } from './top-bar';
import { OverviewTab } from './overview/overview-tab';
import { StrategyTab } from './strategy/strategy-tab';

export type ThreatRetroAgentTab = 'overview' | 'strategy';

interface ThreatRetroAgentPageProps {
  initialTab?: ThreatRetroAgentTab;
  embedded?: boolean;
  configurationEnabled?: boolean;
}

export function ThreatRetroAgentPage({
  initialTab = 'overview',
  embedded = false,
  configurationEnabled = true,
}: ThreatRetroAgentPageProps) {
  const t = useTranslations('threatRetro');
  const tSidebar = useTranslations('sidebar');
  const [manualScanOpen, setManualScanOpen] = useState(false);
  const activeTab = configurationEnabled ? initialTab : 'overview';

  return (
    <TooltipProvider>
      <div className="flex h-full flex-col gap-3">
        {!embedded ? (
          <div className="flex items-center gap-1.5 text-sm">
            <span className="font-medium text-foreground">{tSidebar('agentCenter')}</span>
            <span className="text-muted-foreground">/</span>
            <span className="text-muted-foreground">{t('agentName')}</span>
          </div>
        ) : null}
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto rounded-lg border border-border/70 bg-card p-6 shadow-sm">
          <TopBar />
          <Tabs key={activeTab} defaultValue={activeTab} className="flex flex-1 flex-col">
            <TabsList className="shrink-0 self-start">
              <TabsTrigger value="overview">{t('tabs.overview')}</TabsTrigger>
              {configurationEnabled ? (
                <TabsTrigger value="strategy" data-testid="threat-retro-strategy-tab">
                  {t('tabs.strategy')}
                </TabsTrigger>
              ) : null}
            </TabsList>
            <TabsContent value="overview" className="mt-4 flex-1">
              <OverviewTab manualScanOpen={manualScanOpen} onManualScanOpenChange={setManualScanOpen} />
            </TabsContent>
            {configurationEnabled ? (
              <TabsContent value="strategy" className="mt-4 flex-1">
                <StrategyTab />
              </TabsContent>
            ) : null}
          </Tabs>
        </div>
      </div>
    </TooltipProvider>
  );
}
