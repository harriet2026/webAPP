'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { InteractiveSurface } from '@/components/ui/interactive-surface';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Search, Loader2, AlertCircle } from 'lucide-react';
import { useApiRequest } from '@/lib/api/client';
import { cn } from '@/lib/utils';
import { getMailLifecycleLogs, getMailLogAnalysis, getMailLogDetail, getMailLogEvents } from './lib/disposal-detail-api';
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
  // 安全分析属于 demo/产品形态切换器下的诊断界面。由服务端解析
  // OSGATEWAY_PRODUCT_FORM_SWITCHER 后通过 ProductFormContext 传入，默认关闭。
  showSecurityAnalysis?: boolean;
}

type SectionKey = 'overview' | 'analysis' | 'rawlogs';

// Detail/events fetch has no server-side deadline, so a hung connection would
// otherwise spin the loading state forever instead of switching to the
// inline error+retry UI spec §6.1 requires after >5s.
const DETAIL_FETCH_TIMEOUT_MS = 5000;
const RAW_LOG_FETCH_TIMEOUT_MS = 15000;

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

function rawLogSearchSignal(signal: AbortSignal): AbortSignal {
  return AbortSignal.any([signal, AbortSignal.timeout(RAW_LOG_FETCH_TIMEOUT_MS)]);
}

export function DetailModal({ open, onOpenChange, mailLogId, onFindSimilar, aiEnabled = true, aiInterpretEnabled = true, readOnly = false, showSecurityAnalysis = false }: DetailModalProps) {
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
  const [activeSection, setActiveSection] = useState<SectionKey>('overview');
  const [rawLogsExpanded, setRawLogsExpanded] = useState(false);

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
    queryKey: ['mail-log-analysis', mailLogId],
    queryFn: () => withTimeout(getMailLogAnalysis(mailLogId!, undefined, apiRequest), DETAIL_FETCH_TIMEOUT_MS),
    enabled: open && mailLogId != null && showSecurityAnalysis,
  });
  const lifecycleLogsQ = useQuery({
    queryKey: ['mail-lifecycle-logs', mailLogId],
    queryFn: ({ signal }) => getMailLifecycleLogs(mailLogId!, apiRequest, rawLogSearchSignal(signal)),
    // Disk-backed lifecycle collection can fan out to every gateway node.
    // Keep it completely lazy: merely opening the detail drawer must not
    // trigger that work.
    enabled: open && mailLogId != null && rawLogsExpanded,
  });

  const detail = detailQ.data ?? null;

  // Collapse/close may happen while a multi-node grep is still in flight.
  // Abort it promptly instead of letting an invisible search consume node
  // I/O until the server deadline.
  useEffect(() => {
    if ((open && rawLogsExpanded) || mailLogId == null) return;
    void queryClient.cancelQueries({
      queryKey: ['mail-lifecycle-logs', mailLogId],
    });
  }, [open, rawLogsExpanded, mailLogId, queryClient]);

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
    void queryClient.invalidateQueries({
      queryKey: ['mail-lifecycle-logs', mailLogId],
    });
    void queryClient.invalidateQueries({ queryKey: ['email-disposal'] });
  }, [queryClient, mailLogId]);

  const handleScroll = useCallback(() => {
    const container = contentRef.current;
    if (!container) return;
    const containerTop = container.getBoundingClientRect().top;
    const threshold = container.clientHeight * 0.3;
    let current: SectionKey = 'overview';
    const visibleSections: SectionKey[] = showSecurityAnalysis ? ['overview', 'analysis', 'rawlogs'] : ['overview', 'rawlogs'];
    for (const key of visibleSections) {
      const el = sectionRefs.current[key];
      if (!el) continue;
      const top = el.getBoundingClientRect().top - containerTop;
      if (top <= threshold) current = key;
    }
    setActiveSection(current);
  }, [showSecurityAnalysis]);

  useEffect(() => {
    const container = contentRef.current;
    if (!container || !open) return;
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
    // `detail` is intentionally in the deps even though it's otherwise unused
    // in this effect: the content pane (and contentRef itself) only mounts
    // once detailQ resolves -- while the query is loading, the "isLoading"
    // branch below renders a spinner instead, so contentRef.current is still
    // null on the FIRST run of this effect (when `open` first flips true).
    // Without `detail` here, the effect's deps never change again once that
    // early, no-op run happens, so the scroll listener would never actually
    // get attached to the real container -- permanently breaking scroll-spy.
    // Found while writing DD-14's e2e smoke test (a manually-dispatched
    // 'scroll' event on the content pane never reached this listener because
    // it was simply never registered).
  }, [open, handleScroll, detail]);

  const scrollToSection = (key: SectionKey) => {
    setActiveSection(key); // immediate feedback on click, ahead of the scroll-spy catching up
    sectionRefs.current[key]?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  };

  const navItems: { key: SectionKey; label: string }[] = [
    { key: 'overview', label: t('overviewAndHandle') },
    ...(showSecurityAnalysis ? [{ key: 'analysis' as const, label: t('securityAnalysis') }] : []),
    { key: 'rawlogs', label: t('originalLog') },
  ];

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
            <div className="text-xs text-muted-foreground mb-1">{t('breadcrumb')}</div>
            <SheetTitle ref={titleRef} tabIndex={-1} className="text-lg font-semibold truncate outline-none">
              {detail?.subject || (mailLogId ? `Email #${mailLogId}` : '')}
            </SheetTitle>
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
              <nav className="w-[200px] shrink-0 border-r py-3 max-lg:flex max-lg:w-full max-lg:overflow-x-auto max-lg:border-r-0 max-lg:border-b max-lg:py-0">
                {navItems.map(({ key, label }) => (
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
                    <button data-testid={`disposal-detail-nav-${key}`} type="button" aria-current={activeSection === key ? 'location' : undefined} onClick={() => scrollToSection(key)}>
                      {label}
                    </button>
                  </InteractiveSurface>
                ))}
              </nav>
              <div ref={contentRef} className="flex-1 min-w-0 overflow-y-auto p-6 space-y-8">
                <section
                  data-testid="disposal-detail-overview"
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
                    onViewBasis={showSecurityAnalysis ? () => scrollToSection('analysis') : undefined}
                    onViewRawLogs={() => scrollToSection('rawlogs')}
                  />
                </section>
                {showSecurityAnalysis && (
                  <section
                    data-testid="disposal-detail-analysis"
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
                      events={eventsQ.data ?? []}
                      onViewRawLogs={() => {
                        setRawLogsExpanded(true);
                        scrollToSection('rawlogs');
                      }}
                    />
                  </section>
                )}
                <section
                  data-testid="disposal-detail-rawlogs"
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
                    loaded={lifecycleLogsQ.isSuccess}
                    logs={lifecycleLogsQ.data?.items ?? []}
                    truncated={lifecycleLogsQ.data?.truncated ?? false}
                    partial={lifecycleLogsQ.data?.partial ?? false}
                    failedNodes={lifecycleLogsQ.data?.failed_nodes ?? []}
                    loading={lifecycleLogsQ.isFetching}
                    error={lifecycleLogsQ.isError}
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
