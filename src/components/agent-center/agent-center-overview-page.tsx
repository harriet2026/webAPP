'use client';

import { useMemo, useState } from 'react';
import type { ElementType, ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import {
  Bot,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  History,
  Info,
  Lock,
  Settings,
  ShieldAlert,
  UserRoundCheck,
} from 'lucide-react';

import { Link } from '@/i18n/navigation';
import { useAgentCenterOverview } from '@/hooks/use-agent-center-overview';
import { useProductForm } from '@/contexts/product-form-context';
import { resolveAgentPresentation } from '@/lib/agent-center/presentation';
import { cn } from '@/lib/utils';
import type { AgentCenterCard, AgentCenterKey } from '@/types/agent-center';
import { PageShell, PageSurface } from '@/components/shared/page-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  PhishingAgentHeaderActions,
  PhishingAgentPanel,
  type PhishingAgentTab,
} from '@/components/phishing-detection/agent-management-page';
import {
  SpoofingAgentHeaderActions,
  SpoofingAgentPage,
  type SpoofingAgentTab,
} from '@/components/spoofing-detection/spoofing-agent-page';
import { ThreatRetroAgentPage, type ThreatRetroAgentTab } from '@/components/threat-retro/agent-management-page';

const AGENT_ICON: Record<AgentCenterKey, ElementType> = {
  phishing: ShieldAlert,
  spoofing: UserRoundCheck,
  'threat-retro': History,
};

const HIT_RATE_TOOLTIP_KEY: Record<AgentCenterKey, 'phishing' | 'spoofing' | 'threatRetro'> = {
  phishing: 'phishing',
  spoofing: 'spoofing',
  'threat-retro': 'threatRetro',
};

function isAgentKey(value: string | null): value is AgentCenterKey {
  return value === 'phishing' || value === 'spoofing' || value === 'threat-retro';
}

function agentHref(key: AgentCenterKey, tab?: string) {
  const suffix = tab ? `&tab=${tab}` : '';
  return `/agent-center/overview?agent=${key}${suffix}`;
}

function phishingTab(tab: string | null): PhishingAgentTab {
  return tab === 'config' ? 'config' : 'overview';
}

function spoofingTab(tab: string | null): SpoofingAgentTab {
  if (tab === 'sender-name' || tab === 'displayname' || tab === 'protected-objects') return 'protected-objects';
  if (tab === 'brand') return 'brand';
  return 'overview';
}

function threatRetroTab(tab: string | null): ThreatRetroAgentTab {
  return tab === 'strategy' ? 'strategy' : 'overview';
}

export function AgentCenterOverviewPage() {
  const t = useTranslations('agentCenterOverview');
  // 切换器未开启时仿冒/威胁回溯智能体隐藏（useAgentCenterOverview 过滤），
  // 页头描述同步降为仅钓鱼智能体的口径，避免文案泄漏未开放能力。
  const { switcherEnabled } = useProductForm();
  const overviewDescription = t(switcherEnabled ? 'description' : 'descriptionPhishingOnly');
  const locale = useLocale();
  const searchParams = useSearchParams();
  const agentParam = searchParams.get('agent');
  const selectedAgent = isAgentKey(agentParam) ? agentParam : null;
  const tab = searchParams.get('tab');
  const overviewQuery = useAgentCenterOverview();

  const visibleCards = useMemo(() => {
    return (overviewQuery.data?.agents ?? []).filter((card) => card.access !== 'hidden');
  }, [overviewQuery.data?.agents]);

  const numberFmt = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const [summaryCollapsed, setSummaryCollapsed] = useState(false);
  const selectedVisibleCard = selectedAgent ? visibleCards.find((card) => card.key === selectedAgent) : null;
  const showSelectedAgentDetail = Boolean(
    selectedAgent && (!overviewQuery.data || overviewQuery.isLoading || overviewQuery.isError || selectedVisibleCard),
  );

  if (selectedAgent && showSelectedAgentDetail) {
    const detailCard = selectedVisibleCard;
    const detailLocked = !detailCard || detailCard.access === 'locked' || detailCard.status === 'locked';
    const detailPresentation = detailCard ? resolveAgentPresentation(detailCard) : undefined;
    const detailTitle = t(`agents.${selectedAgent}.title`);

    return (
      <TooltipProvider>
        <PageShell className="space-y-0" data-testid="agent-center-detail">
          <AgentCenterHeader currentTitle={detailTitle} description={t(`agents.${selectedAgent}.description`)} />
          <AgentCenterWorkspace
            cards={visibleCards}
            numberFmt={numberFmt}
            collapsed={summaryCollapsed}
            selectedAgent={selectedAgent}
            onToggleCollapsed={() => setSummaryCollapsed((collapsed) => !collapsed)}
          >
            <div className="flex items-center justify-between gap-4 border-b border-border px-6 py-4">
              <h2 className="text-lg font-semibold text-foreground">{detailTitle}</h2>
              {selectedAgent === 'spoofing' && !detailLocked && detailPresentation?.canConfigure
                ? <SpoofingAgentHeaderActions />
                : null}
            </div>
            <div className="min-h-[640px] px-6 py-4">
              {overviewQuery.isLoading ? (
                <Skeleton className="h-72" />
              ) : overviewQuery.isError ? (
                <div className="rounded-lg border border-destructive/35 p-4 text-sm text-destructive">
                  {t('loadFailed')}
                </div>
              ) : detailLocked ? (
                <LockedAgentDetail agent={selectedAgent} />
              ) : (
                <AgentDetail
                  agent={selectedAgent}
                  tab={detailPresentation?.canConfigure ? tab : null}
                  configurationEnabled={detailPresentation?.canConfigure === true}
                />
              )}
            </div>
          </AgentCenterWorkspace>
        </PageShell>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <PageShell className="space-y-0" data-testid="agent-center-overview">
        <AgentCenterHeader currentTitle={t('title')} description={overviewDescription} />
        <AgentCenterWorkspace
          cards={visibleCards}
          numberFmt={numberFmt}
          collapsed={summaryCollapsed}
          selectedAgent={null}
          onToggleCollapsed={() => setSummaryCollapsed((collapsed) => !collapsed)}
        >
          {overviewQuery.isLoading ? (
            <div className="grid gap-3 p-4 lg:grid-cols-3">
              {[0, 1, 2].map((i) => <Skeleton key={i} className="h-44" />)}
            </div>
          ) : overviewQuery.isError ? (
            <div className="p-6 text-sm text-destructive">{t('loadFailed')}</div>
          ) : (
            <>
              <div className="border-b border-border px-6 py-4">
                <h2 className="text-lg font-semibold text-foreground">{t('title')}</h2>
              </div>
              <div className="space-y-6 px-6 py-4">
                <section className="rounded-lg border border-violet-200 bg-gradient-to-r from-violet-50 to-blue-50 px-4 py-4">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">{t('centerTitle')}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{t('stage.aiLayer')}</p>
                  </div>
                </section>
                <section>
                  <div className="grid gap-4 xl:grid-cols-3">
                    {visibleCards.map((card) => (
                      <AgentCard key={card.key} card={card} numberFmt={numberFmt} />
                    ))}
                  </div>
                </section>
                {/* 协作总览描述的是三个智能体间的协同，切换器未开启时仅剩
                    钓鱼智能体，整块随门控隐藏，避免文案泄漏未开放能力。 */}
                {switcherEnabled ? <CollaborationOverview /> : null}
              </div>
            </>
          )}
        </AgentCenterWorkspace>
      </PageShell>
    </TooltipProvider>
  );
}

function AgentCenterHeader({ currentTitle, description }: { currentTitle: ReactNode; description: ReactNode }) {
  const t = useTranslations('agentCenterOverview');
  return (
    <section className="-mx-8 -mt-8 border-b border-border bg-card px-8 py-3">
      <div className="flex items-start gap-2">
        <Bot className="mt-1 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-2">
            <h1 className="text-lg font-semibold tracking-tight text-foreground">{t('centerTitle')}</h1>
            <span className="text-sm text-muted-foreground">/</span>
            <span className="text-sm font-medium text-muted-foreground">{currentTitle}</span>
          </div>
          <p className="mt-1 max-w-4xl text-xs leading-5 text-muted-foreground">{description}</p>
        </div>
      </div>
    </section>
  );
}

function AgentCenterWorkspace({
  cards,
  numberFmt,
  collapsed,
  selectedAgent,
  onToggleCollapsed,
  children,
}: {
  cards: AgentCenterCard[];
  numberFmt: Intl.NumberFormat;
  collapsed: boolean;
  selectedAgent: AgentCenterKey | null;
  onToggleCollapsed: () => void;
  children: ReactNode;
}) {
  const t = useTranslations('agentCenterOverview');
  return (
    <div className="-mx-8 -mb-8 min-h-[calc(100vh-100px)] bg-gray-100 px-6 py-6">
      <div className="relative flex min-h-[calc(100vh-148px)] w-full flex-col lg:flex-row lg:gap-6">
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                onClick={onToggleCollapsed}
                className={cn(
                  'absolute top-1/2 z-20 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-md transition-all hover:bg-muted lg:flex',
                  collapsed ? 'left-[calc(56px-16px)]' : 'left-[calc(208px-16px)]',
                )}
                aria-label={collapsed ? t('expandSummaryRail') : t('collapseSummaryRail')}
              >
                {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
              </button>
            }
          />
          <TooltipContent side="right">
            {collapsed ? t('expandSummaryRail') : t('collapseSummaryRail')}
          </TooltipContent>
        </Tooltip>
        <AgentSummaryRail cards={cards} numberFmt={numberFmt} collapsed={collapsed} selectedAgent={selectedAgent} />
        <PageSurface className="min-h-[calc(100vh-148px)] flex-1 overflow-hidden rounded-lg bg-card p-0">
          {children}
        </PageSurface>
      </div>
    </div>
  );
}

function LockedAgentDetail({ agent }: { agent: AgentCenterKey }) {
  const t = useTranslations('agentCenterOverview');
  return (
    <div className="flex min-h-72 items-center justify-center p-8" data-testid={`agent-center-${agent}-locked`}>
      <div className="max-w-md text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md border border-border bg-muted/60">
          <Lock className="h-5 w-5 text-muted-foreground" />
        </div>
        <h2 className="mt-4 text-base font-semibold text-foreground">{t('detailLockedTitle')}</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{t('detailLockedDescription')}</p>
      </div>
    </div>
  );
}

function AgentDetail({
  agent,
  tab,
  configurationEnabled,
}: {
  agent: AgentCenterKey;
  tab: string | null;
  configurationEnabled: boolean;
}) {
  if (agent === 'phishing') {
    return (
      <div className="min-h-[620px] overflow-hidden" data-testid="agent-center-phishing-panel">
        <PhishingAgentPanel initialTab={phishingTab(tab)} configurationEnabled={configurationEnabled} />
      </div>
    );
  }
  if (agent === 'spoofing') {
    return (
      <div className="min-h-[620px] overflow-hidden" data-testid="agent-center-spoofing-panel">
        <SpoofingAgentPage
          initialTab={spoofingTab(tab)}
          embedded
          configurationEnabled={configurationEnabled}
        />
      </div>
    );
  }
  return (
    <div data-testid="agent-center-threat-retro-panel">
      <ThreatRetroAgentPage
        initialTab={threatRetroTab(tab)}
        embedded
        configurationEnabled={configurationEnabled}
      />
    </div>
  );
}

function AgentSummaryRail({
  cards,
  numberFmt,
  collapsed,
  selectedAgent,
}: {
  cards: AgentCenterCard[];
  numberFmt: Intl.NumberFormat;
  collapsed: boolean;
  selectedAgent: AgentCenterKey | null;
}) {
  const t = useTranslations('agentCenterOverview');
  const overviewSelected = selectedAgent === null;
  return (
    <aside
      className={cn(
        'shrink-0 overflow-auto border-r border-border bg-gray-50 p-2 transition-all duration-200',
        collapsed ? 'lg:w-14' : 'lg:w-52',
      )}
      aria-label={t('summaryRailLabel')}
    >
      <Link
        href="/agent-center/overview"
        className={cn(
          'mb-2 block rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-gray-100',
          overviewSelected && 'bg-primary/10 hover:bg-primary/10',
          collapsed && 'hidden lg:flex lg:h-9 lg:items-center lg:justify-center lg:px-0 lg:py-0',
        )}
        data-testid="agent-center-summary-overview"
        aria-current={overviewSelected ? 'page' : undefined}
      >
        {collapsed ? (
          <Bot className={cn('h-4 w-4', overviewSelected ? 'text-primary' : 'text-muted-foreground')} />
        ) : (
          <>
            <div className={cn('text-xs font-semibold', overviewSelected ? 'text-primary' : 'text-foreground')}>{t('title')}</div>
            <div className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{t('summaryCount', { count: cards.length })}</div>
          </>
        )}
      </Link>
      <div className="space-y-2">
        {cards.map((card) => {
          const Icon = AGENT_ICON[card.key];
          const selected = selectedAgent === card.key;
          return (
            <Link
              key={card.key}
              href={agentHref(card.key)}
              className={cn(
                'block rounded-lg text-left transition-colors hover:bg-gray-100',
                selected && 'bg-primary/10 hover:bg-primary/10',
                collapsed ? 'px-2 py-2.5 lg:flex lg:justify-center' : 'px-3 py-2.5',
              )}
              data-testid={`agent-center-summary-${card.key}`}
              aria-current={selected ? 'page' : undefined}
            >
              <div className={cn('flex items-start gap-2', collapsed && 'lg:items-center lg:justify-center lg:gap-0')}>
                <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', selected ? 'text-primary' : 'text-muted-foreground')} />
                <div className={cn('min-w-0', collapsed && 'lg:hidden')}>
                  <div className={cn('truncate text-xs font-medium', selected ? 'text-primary' : 'text-foreground')}>{t(`agents.${card.key}.title`)}</div>
                  <div className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
                    {formatRate(card.hit_rate)} {t('summaryHitRate')}
                  </div>
                  <div className="text-[11px] leading-4 text-muted-foreground">
                    {formatMetric(card.today_processed, numberFmt)} {t('metrics.todayProcessed')}
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </aside>
  );
}

function AgentCard({ card, numberFmt }: { card: AgentCenterCard; numberFmt: Intl.NumberFormat }) {
  const t = useTranslations('agentCenterOverview');
  const locked = card.access === 'locked' || card.status === 'locked';
  const presentation = resolveAgentPresentation(card);
  const stageLabel = card.key === 'threat-retro' ? t('stage.threatRetro') : card.stage_position;

  return (
    <Card
      size="sm"
      className={cn('gap-0 rounded-lg border-border bg-card py-0 shadow-none transition-shadow hover:shadow-md', locked && 'opacity-85')}
      data-testid={`agent-center-card-${card.key}`}
    >
      <CardHeader className="grid-cols-[1fr_auto] gap-3 px-4 py-4">
        <div className="flex min-w-0 items-start gap-2">
          <span className="mt-1.5 h-3 w-3 shrink-0 rounded-full bg-primary" />
          <div className="min-w-0">
            <CardTitle className="truncate text-base">{t(`agents.${card.key}.title`)}</CardTitle>
          </div>
        </div>
        <span className={cn('justify-self-end text-sm', locked ? 'text-muted-foreground' : 'text-primary')}>
          {t(`status.${card.status}`)}
        </span>
      </CardHeader>
      <CardContent className="space-y-2 px-4 pb-0">
        <Metric label={t('statusLabel')} value={t(`status.${card.status}`)} />
        <Metric label={t('metrics.todayProcessed')} value={formatMetric(card.today_processed, numberFmt)} />
        <Metric
          label={
            <span className="inline-flex items-center gap-1">
              {t('metrics.hitRate')}
              <Tooltip>
                <TooltipTrigger
                  render={<Info className="h-3.5 w-3.5 text-muted-foreground" data-testid={`agent-center-hit-rate-help-${card.key}`} />}
                />
                <TooltipContent className="max-w-xs">{t(`metrics.hitRateTooltip.${HIT_RATE_TOOLTIP_KEY[card.key]}`)}</TooltipContent>
              </Tooltip>
            </span>
          }
          value={formatRate(card.hit_rate)}
        />
        <Metric label={t('metrics.stage')} value={stageLabel} />
      </CardContent>
      <CardFooter className="mt-4 gap-2 border-t border-gray-100 px-4 py-3">
        {locked ? (
          <Button size="xs" variant="outline" disabled>
            <Lock className="h-4 w-4" />
            {t('actions.locked')}
          </Button>
        ) : presentation?.canConfigure && presentation.configHref ? (
          <Button
            size="xs"
            variant="outline"
            className="w-full bg-cyan-50 shadow-none"
            nativeButton={false}
            render={<Link href={presentation.configHref} />}
          >
            <Settings className="h-3.5 w-3.5" />
            {t('actions.configure')}
          </Button>
        ) : (
          <Button size="xs" variant="outline" className="w-full" disabled>
            <Settings className="h-3.5 w-3.5" />
            {t('actions.configure')}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

function Metric({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <div className="text-muted-foreground">{label}</div>
      <div className="font-medium text-foreground">{value}</div>
    </div>
  );
}

function CollaborationOverview() {
  const t = useTranslations('agentCenterOverview');
  return (
    <details
      data-testid="agent-center-collaboration"
      className="group rounded-md border border-border bg-card"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-medium text-foreground">
        <span className="inline-flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          {t('collaboration.title')}
        </span>
        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-border px-3 py-3">
        <p className="mb-3 text-xs leading-5 text-muted-foreground">{t('collaboration.description')}</p>
        <div className="grid gap-2 md:grid-cols-3">
        {(['phishing', 'spoofing', 'threat-retro'] as AgentCenterKey[]).map((key) => (
          <div key={key} className="rounded border border-border bg-muted/20 p-2">
            <div className="text-xs font-medium text-foreground">{t(`collaboration.${key}.title`)}</div>
            <div className="mt-1 text-[11px] leading-4 text-muted-foreground">{t(`collaboration.${key}.body`)}</div>
          </div>
        ))}
        </div>
      </div>
    </details>
  );
}

function formatMetric(value: number | null | undefined, numberFmt: Intl.NumberFormat) {
  if (value === null || value === undefined) return '—';
  return numberFmt.format(value);
}

function formatRate(value: number | null | undefined) {
  if (value === null || value === undefined) return '—';
  return `${(value * 100).toFixed(1)}%`;
}
