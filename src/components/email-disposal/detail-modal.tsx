'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { InteractiveSurface } from '@/components/ui/interactive-surface';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Search, Loader2, AlertCircle, PanelLeftIcon, Inbox, ShieldAlert, ScrollText } from 'lucide-react';
import { useApiRequest } from '@/lib/api/client';
import { cn } from '@/lib/utils';
import { getMailLogAnalysis, getMailLogDetail, getMailLogEvents } from './lib/disposal-detail-api';
import { mailTypeConfig, stripDetailPrefix } from './lib/detail-helpers';
import { useLifecycleLogStream } from './hooks/use-lifecycle-log-stream';
import { OverviewSection } from './sections/overview-section';
import { AnalysisSection } from './sections/analysis-section';
import { RawLogsSection } from './sections/raw-logs-section';

interface DetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mailLogId: number | null;
  onFindSimilar?: (id: number) => void;
  aiEnabled?: boolean;
  aiInterpretEnabled?: boolean;
  // Platform-wide (system_admin, all-tenant) drill-down is view-only.
  // Computed once by the page-level caller (EmailDisposalCenterPage's
  // resolveSecurityScope-normalized effectiveViewer) and threaded straight
  // through to OverviewSection -- see that component's readOnly prop doc for
  // why it must not be re-derived here or lower (review finding).
  readOnly?: boolean;
  // 原始日志内的节点/组件聚合进度面板仅对平台管理员可见。
  isTenantAdmin?: boolean;
}

type SectionKey = 'overview' | 'analysis' | 'rawlogs';

// Detail/events fetch has no server-side deadline, so a hung connection would
// otherwise spin the loading state forever instead of switching to the
// inline error+retry UI spec §6.1 requires after >5s.
const DETAIL_FETCH_TIMEOUT_MS = 5000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('detail fetch timed out')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

export function DetailModal({ open, onOpenChange, mailLogId, onFindSimilar, aiEnabled = true, aiInterpretEnabled = true, readOnly = false, isTenantAdmin = false }: DetailModalProps) {
  const t = useTranslations('emailDisposal.detail');
  const { apiRequest } = useApiRequest();
  const queryClient = useQueryClient();

  // base-ui's Dialog.Popup auto-focuses the first tabbable descendant on
  // open by default -- with the header's "find similar" button now wrapped
  // in a Tooltip (whose trigger opens on focus, an a11y feature, not just
  // hover), that default would auto-open its tooltip the instant the drawer
  // opens (confirmed via a focus probe), which then lingers and steals the
  // first Escape press (closes the tooltip, not the drawer) or renders
  // alongside a later hover-triggered tooltip (two data-slot="tooltip-content"
  // nodes at once). Redirect initial focus to the title heading instead --
  // it's always mounted synchronously (unlike the loading-dependent content
  // pane) and is the conventional accessible-dialog focus target anyway.
  const titleRef = useRef<HTMLHeadingElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<SectionKey, HTMLElement | null>>({
    overview: null,
    analysis: null,
    rawlogs: null,
  });
  const navButtonRefs = useRef<Record<SectionKey, HTMLButtonElement | null>>({
    overview: null,
    analysis: null,
    rawlogs: null,
  });
  const [activeSection, setActiveSection] = useState<SectionKey>('overview');
  const [rawLogsExpanded, setRawLogsExpanded] = useState(false);
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [selectedAnalysisRecipient, setSelectedAnalysisRecipient] = useState<string>();
  const lifecycleLogs = useLifecycleLogStream(
    mailLogId,
    open && mailLogId != null && rawLogsExpanded,
  );

  // Reset to the overview section whenever the drawer (re)opens for a mail log,
  // including reopening for the same id. Adjusting state during render (the
  // React-recommended pattern for "reset on prop change") rather than in a
  // useEffect avoids an extra render pass / the set-state-in-effect lint rule.
  const resetKey = open ? mailLogId : null;
  const [lastResetKey, setLastResetKey] = useState(resetKey);
  if (resetKey !== lastResetKey) {
    setLastResetKey(resetKey);
    if (open) {
      setActiveSection('overview');
      setRawLogsExpanded(false);
      setSelectedAnalysisRecipient(undefined);
    }
  }

  const detailQ = useQuery({
    queryKey: ['mail-log-detail', mailLogId],
    queryFn: () => withTimeout(getMailLogDetail(mailLogId!, apiRequest), DETAIL_FETCH_TIMEOUT_MS),
    enabled: open && mailLogId != null,
  });
  const eventsQ = useQuery({
    queryKey: ['mail-log-events', mailLogId],
    queryFn: () => withTimeout(getMailLogEvents(mailLogId!, apiRequest), DETAIL_FETCH_TIMEOUT_MS),
    enabled: open && mailLogId != null,
  });
  const analysisQ = useQuery({
    queryKey: ['mail-log-analysis', mailLogId, selectedAnalysisRecipient ?? 'all'],
    queryFn: () => withTimeout(getMailLogAnalysis(mailLogId!, selectedAnalysisRecipient, apiRequest), DETAIL_FETCH_TIMEOUT_MS),
    enabled: open && mailLogId != null,
  });
  const detail = detailQ.data ?? null;
  const analysisEvents = useMemo(() => {
    const events = eventsQ.data ?? [];
    if (!selectedAnalysisRecipient) return events;
    const selected = selectedAnalysisRecipient.trim().toLowerCase();
    return events.filter((event) => {
      const recipients = [
        ...(event.recipient ? [event.recipient] : []),
        ...(event.recipients ? event.recipients.split(',') : []),
      ];
      return recipients.some((recipient) => recipient.trim().toLowerCase() === selected);
    });
  }, [eventsQ.data, selectedAnalysisRecipient]);

  // A dispose action taken from inside the drawer (release/discard/recall via
  // RecipientStatus) must refresh BOTH the drawer's own detail/events queries
  // AND the list query behind it. Previously onRefetch only refetched the
  // detail query, so after releasing a mail the list row kept showing its
  // stale pre-release status ("投递中"/"隔离中") until a manual reload, even
  // though the backend state and a re-query were already correct (GT-12173).
  const handleDisposed = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: ['mail-log-detail', mailLogId],
    });
    void queryClient.invalidateQueries({
      queryKey: ['mail-log-events', mailLogId],
    });
    void queryClient.invalidateQueries({
      queryKey: ['mail-log-analysis', mailLogId],
    });
    void queryClient.invalidateQueries({ queryKey: ['email-disposal'] });
  }, [queryClient, mailLogId]);

  useEffect(() => {
    const container = contentRef.current;
    if (!container || !open || typeof IntersectionObserver === 'undefined') return;
    const visibleSections: SectionKey[] = ['overview', 'analysis', 'rawlogs'];
    const intersecting = new Set<SectionKey>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const key = entry.target.getAttribute('data-section-key') as SectionKey | null;
          if (!key) continue;
          if (entry.isIntersecting) intersecting.add(key);
          else intersecting.delete(key);
        }
        for (const key of [...visibleSections].reverse()) {
          if (intersecting.has(key)) {
            setActiveSection(key);
            return;
          }
        }
      },
      {
        root: container,
        rootMargin: '0px 0px -80% 0px',
        threshold: 0,
      },
    );

    for (const key of visibleSections) {
      const section = sectionRefs.current[key];
      if (section) observer.observe(section);
    }
    return () => observer.disconnect();
    // `detail` is required because the content and section refs mount only
    // after the detail query resolves; the first open render still shows the
    // loading branch and has no elements to observe.
  }, [open, detail]);

  useEffect(() => {
    navButtonRefs.current[activeSection]?.scrollIntoView?.({
      behavior: 'smooth',
      inline: 'center',
      block: 'nearest',
    });
  }, [activeSection]);

  const scrollToSection = (key: SectionKey) => {
    setActiveSection(key); // immediate feedback on click, ahead of the scroll-spy catching up
    sectionRefs.current[key]?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  };

  const riskDotClass = {
    malicious: 'bg-red-500',
    graymail: 'bg-amber-500',
    normal: 'bg-emerald-500',
  } as const;
  const finalVerdictTypeConfig = detail?.email_type ? mailTypeConfig[detail.email_type] : null;
  const navItems: Array<{
    key: SectionKey;
    label: string;
    icon: typeof Inbox;
    dotClassName?: string;
    dotTooltip?: string;
  }> = [
    { key: 'overview', label: t('overviewAndHandle'), icon: Inbox },
    {
      key: 'analysis',
      label: t('securityAnalysis'),
      icon: ShieldAlert,
      dotClassName: finalVerdictTypeConfig ? riskDotClass[finalVerdictTypeConfig.tone] : undefined,
      dotTooltip: finalVerdictTypeConfig
        ? `${t('nav.finalVerdict')}：${t(stripDetailPrefix(finalVerdictTypeConfig.labelKey))}`
        : undefined,
    },
    { key: 'rawlogs', label: t('originalLog'), icon: ScrollText },
  ];
  const activeSectionLabel = navItems.find((item) => item.key === activeSection)?.label ?? '';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        data-testid="disposal-detail-drawer"
        side="right"
        initialFocus={titleRef}
        className="p-0 gap-0 flex flex-col data-[side=right]:w-[80vw] data-[side=right]:max-w-none data-[side=right]:min-[1024px]:max-[1365px]:w-[90vw] data-[side=right]:max-lg:w-screen"
      >
        <div className="flex items-start justify-between gap-4 border-b py-4 pl-6 pr-14 shrink-0">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <span>{t('breadcrumb')}</span>
              {detail ? (
                <>
                  <span aria-hidden="true" className="text-muted-foreground/50">·</span>
                  <span data-testid="disposal-detail-current-section" className="truncate">
                    {t('nav.currentlyViewing')}：{activeSectionLabel}
                  </span>
                </>
              ) : null}
            </div>
            <SheetTitle ref={titleRef} tabIndex={-1} className="text-lg font-semibold truncate outline-none">
              {detail?.subject || (mailLogId ? `Email #${mailLogId}` : '')}
            </SheetTitle>
            {detail?.message_uuid ? (
              <div
                data-testid="disposal-detail-mail-id"
                className="mt-0.5 truncate text-xs text-muted-foreground"
                title={detail.message_uuid}
              >
                {t('features.emailId')}：<span className="font-mono">{detail.message_uuid}</span>
              </div>
            ) : null}
          </div>
          {aiEnabled && onFindSimilar ? (
            <Tooltip>
              <TooltipTrigger render={<span className="shrink-0" />}>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!mailLogId}
                  onClick={() => {
                    if (mailLogId && onFindSimilar) {
                      onFindSimilar(mailLogId);
                      onOpenChange(false);
                    }
                  }}
                >
                  <Search className="mr-1 h-3.5 w-3.5" />
                  {t('findSimilar')}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('findSimilarTooltip')}</TooltipContent>
            </Tooltip>
          ) : null}
        </div>

        <div className="flex-1 min-h-0 overflow-hidden">
          {detailQ.isLoading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : detailQ.isError || !detail ? (
            <div className="flex h-full flex-col items-center justify-center gap-3">
              <AlertCircle className="h-8 w-8 text-destructive" />
              <p className="text-sm text-muted-foreground">{t('errors.loadFailed')}</p>
              <Button variant="outline" size="sm" onClick={() => detailQ.refetch()}>
                {t('errors.retry')}
              </Button>
            </div>
          ) : (
            <div className="flex h-full min-h-0 max-lg:flex-col">
              {/* Below 1024px the vertical anchor column collapses into a
                  horizontal, horizontally-scrollable bar (spec §5.2) so the
                  content pane isn't squeezed by a fixed-width side column on
                  narrow/fullscreen viewports. */}
              <nav
                data-testid="disposal-detail-nav"
                data-collapsed={navCollapsed ? 'true' : 'false'}
                className={cn(
                  'shrink-0 border-r py-3 transition-[width] duration-150',
                  navCollapsed ? 'w-12' : 'w-[200px]',
                  'max-lg:flex max-lg:w-full max-lg:overflow-x-auto max-lg:border-r-0 max-lg:border-b max-lg:py-0',
                )}
              >
                <div className="hidden justify-end px-2 pb-2 lg:flex">
                  <Tooltip>
                    <TooltipTrigger render={<span />}>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground"
                        aria-expanded={!navCollapsed}
                        data-testid="disposal-detail-nav-toggle"
                        onClick={() => setNavCollapsed((collapsed) => !collapsed)}
                      >
                        <PanelLeftIcon className="h-4 w-4" aria-hidden="true" />
                        <span className="sr-only">
                          {navCollapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')}
                        </span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      {navCollapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')}
                    </TooltipContent>
                  </Tooltip>
                </div>
                {navItems.map(({ key, label, icon: Icon, dotClassName, dotTooltip }) => {
                  const surface = (
                    <InteractiveSurface
                      key={key}
                      asChild
                      variant="control"
                      className={cn(
                        'w-full rounded-none border-l-2 px-4 py-2 text-left text-sm',
                        'max-lg:w-auto max-lg:shrink-0 max-lg:whitespace-nowrap max-lg:border-l-0 max-lg:border-b-2',
                        activeSection === key
                          ? 'border-foreground/40 bg-muted font-medium text-foreground data-[hovered=true]:bg-muted/80'
                          : 'border-transparent text-muted-foreground data-[hovered=true]:bg-muted/50 data-[hovered=true]:text-foreground',
                      )}
                    >
                      <button
                        ref={(element) => {
                          navButtonRefs.current[key] = element;
                        }}
                        data-testid={`disposal-detail-nav-${key}`}
                        type="button"
                        aria-current={activeSection === key ? 'location' : undefined}
                        aria-label={dotTooltip ? `${label}，${dotTooltip}` : undefined}
                        onClick={() => scrollToSection(key)}
                        className={cn(
                          'flex w-full items-center gap-2',
                          navCollapsed && 'justify-center max-lg:justify-start',
                        )}
                      >
                        <Icon
                          data-testid={`disposal-detail-nav-icon-${key}`}
                          aria-hidden="true"
                          className="h-4 w-4 shrink-0"
                        />
                        <span className={cn('truncate', navCollapsed && 'sr-only max-lg:not-sr-only')}>
                          {label}
                        </span>
                        {dotClassName ? (
                          <span
                            data-testid={`disposal-detail-nav-${key}-risk`}
                            aria-hidden="true"
                            className={cn('inline-block h-2 w-2 shrink-0 rounded-full', dotClassName)}
                          />
                        ) : null}
                      </button>
                    </InteractiveSurface>
                  );
                  const tooltipText = navCollapsed
                    ? [label, dotTooltip].filter(Boolean).join(' · ')
                    : dotTooltip;
                  if (!tooltipText) return surface;
                  return (
                    <Tooltip key={key}>
                      <TooltipTrigger render={<span className="block" />}>
                        {surface}
                      </TooltipTrigger>
                      <TooltipContent>{tooltipText}</TooltipContent>
                    </Tooltip>
                  );
                })}
              </nav>
              <div ref={contentRef} className="flex-1 min-w-0 overflow-y-auto p-6 space-y-8">
                <section
                  data-testid="disposal-detail-overview"
                  data-section-key="overview"
                  ref={(el) => {
                    sectionRefs.current.overview = el;
                  }}
                  className="scroll-mt-4"
                >
                  <h3 className="text-base font-semibold mb-2">{t('overviewAndHandle')}</h3>
                  <OverviewSection
                    detail={detail}
                    onRefetch={handleDisposed}
                    aiInterpretEnabled={aiInterpretEnabled}
                    events={eventsQ.data ?? []}
                    readOnly={readOnly}
                    onViewBasis={() => scrollToSection('analysis')}
                    onViewRawLogs={() => scrollToSection('rawlogs')}
                  />
                </section>
                <section
                  data-testid="disposal-detail-analysis"
                  data-section-key="analysis"
                  ref={(el) => {
                    sectionRefs.current.analysis = el;
                  }}
                  className="scroll-mt-4"
                >
                  <h3 className="text-base font-semibold mb-2">{t('securityAnalysis')}</h3>
                  <AnalysisSection
                    detail={detail}
                    analysis={analysisQ.data}
                    analysisLoading={analysisQ.isLoading || analysisQ.isFetching}
                    analysisError={analysisQ.isError}
                    onRetryAnalysis={() => {
                      void analysisQ.refetch();
                    }}
                    aiEnabled={aiEnabled}
                    events={analysisEvents}
                    selectedRecipient={selectedAnalysisRecipient}
                    onSelectedRecipientChange={setSelectedAnalysisRecipient}
                    onViewRawLogs={() => {
                      setRawLogsExpanded(true);
                      scrollToSection('rawlogs');
                    }}
                  />
                </section>
                <section
                  data-testid="disposal-detail-rawlogs"
                  data-section-key="rawlogs"
                  ref={(el) => {
                    sectionRefs.current.rawlogs = el;
                  }}
                  className="scroll-mt-4"
                >
                  <RawLogsSection
                    key={detail.id}
                    detail={detail}
                    expanded={rawLogsExpanded}
                    onExpandedChange={setRawLogsExpanded}
                    loaded={lifecycleLogs.loaded}
                    logs={lifecycleLogs.logs}
                    truncated={lifecycleLogs.truncated}
                    partial={lifecycleLogs.partial}
                    nodes={Object.values(lifecycleLogs.nodes)}
                    loading={lifecycleLogs.loading}
                    error={lifecycleLogs.error}
                    onRetryModule={lifecycleLogs.retryModule}
                    onRetryNode={lifecycleLogs.retryNode}
                    isTenantAdmin={isTenantAdmin}
                  />
                </section>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
