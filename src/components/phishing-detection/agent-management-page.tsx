'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { PhishingOverviewPage } from './phishing-overview-page';
import { PhishingConfigPage } from './config/phishing-config-page';

type AgentKey = 'phishing';

interface AgentNavItem {
  key: AgentKey;
  label: string;
  icon: React.ReactNode;
}

export type PhishingAgentTab = 'overview' | 'config';

export function PhishingAgentPanel({
  initialTab = 'overview',
  configurationEnabled = true,
}: {
  initialTab?: PhishingAgentTab;
  configurationEnabled?: boolean;
}) {
  const t = useTranslations('phishingDetection');
  const activeTab = configurationEnabled ? initialTab : 'overview';
  return (
    <Tabs key={activeTab} defaultValue={activeTab} className="flex flex-col h-full">
      <TabsList className="mb-4 shrink-0 self-start rounded-lg border-border bg-muted/30 shadow-none">
        <TabsTrigger value="overview" className="min-h-8 rounded-md px-3">{t('tabs.overview')}</TabsTrigger>
        {configurationEnabled ? (
          <TabsTrigger value="config" className="min-h-8 rounded-md px-3" data-testid="phishing-config-tab">
            {t('tabs.config')}
          </TabsTrigger>
        ) : null}
      </TabsList>
      <TabsContent value="overview" className="flex-1 overflow-auto mt-0">
        <PhishingOverviewPage />
      </TabsContent>
      {configurationEnabled ? (
        <TabsContent value="config" className="flex-1 overflow-auto mt-0">
          <PhishingConfigPage />
        </TabsContent>
      ) : null}
    </Tabs>
  );
}

export function AgentManagementPage() {
  const t = useTranslations('phishingDetection');
  const tSidebar = useTranslations('sidebar');
  const [selected, setSelected] = useState<AgentKey>('phishing');
  const [navCollapsed, setNavCollapsed] = useState(false);

  const agents: AgentNavItem[] = [
    {
      key: 'phishing',
      label: t('navPhishingAgent'),
      icon: <AlertTriangle className="h-4 w-4" />,
    },
  ];

  const selectedLabel = agents.find((a) => a.key === selected)?.label ?? '';

  return (
    <TooltipProvider>
      <div className="flex h-full flex-col gap-3">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 text-sm">
          <span className="font-medium text-foreground">{tSidebar('agentManagement')}</span>
          <span className="text-muted-foreground">/</span>
          <span className="text-muted-foreground">{selectedLabel}</span>
        </div>

        {/* Body: left nav + right panel */}
        <div className="relative flex min-h-0 flex-1 overflow-hidden rounded-[18px] border border-border/70 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
          {/* Collapse toggle */}
          <button
            onClick={() => setNavCollapsed((v) => !v)}
            className={cn(
              'absolute top-1/2 z-30 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-full border bg-background shadow-md transition-[left] duration-200 hover:bg-accent',
              navCollapsed ? 'left-[calc(56px-12px)]' : 'left-[calc(200px-12px)]',
            )}
            aria-label={navCollapsed ? t('expandMenu') : t('collapseMenu')}
          >
            {navCollapsed ? (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronLeft className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </button>

          {/* Left nav */}
          <nav
            className={cn(
              'flex flex-col border-r bg-muted/20 transition-[width] duration-200 overflow-hidden',
              navCollapsed ? 'w-14' : 'w-[200px]',
            )}
          >
            <ul className="flex-1 space-y-0.5 p-2 pt-4">
              {agents.map((agent) => {
                const btn = (
                  <button
                    key={agent.key}
                    onClick={() => setSelected(agent.key)}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors',
                      navCollapsed ? 'justify-center' : '',
                      selected === agent.key
                        ? 'bg-primary/10 font-medium text-primary'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                    )}
                  >
                    <span className="shrink-0">{agent.icon}</span>
                    {!navCollapsed && (
                      <span className="truncate">{agent.label}</span>
                    )}
                  </button>
                );
                if (!navCollapsed) return <li key={agent.key}>{btn}</li>;
                return (
                  <li key={agent.key}>
                    <Tooltip>
                      <TooltipTrigger render={btn} />
                      <TooltipContent side="right">{agent.label}</TooltipContent>
                    </Tooltip>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* Right content */}
          <div className="flex-1 overflow-y-auto bg-background p-6">
            {selected === 'phishing' && <PhishingAgentPanel />}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
