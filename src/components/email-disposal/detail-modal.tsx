'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { InteractiveSurface } from '@/components/ui/interactive-surface';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Search, Loader2, AlertCircle, AlertTriangle, PanelLeftIcon, Inbox, ShieldAlert, ScrollText } from 'lucide-react';
import { useApiRequest } from '@/lib/api/client';
import { cn } from '@/lib/utils';
import { getMailLifecycleLogs, getMailLogDetail, getMailLogEvents } from './lib/disposal-detail-api';
import { mailTypeConfig, mailTypeTone, stripDetailPrefix } from './lib/detail-helpers';
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
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

function rawLogSearchSignal(signal: AbortSignal): AbortSignal {
  return AbortSignal.any([signal, AbortSignal.timeout(RAW_LOG_FETCH_TIMEOUT_MS)]);
}

export function DetailModal({ open, onOpenChange, mailLogId, onFindSimilar, aiEnabled = true, aiInterpretEnabled = true, readOnly = false }: DetailModalProps) {
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
  // Icon-only collapse for the desktop (>=1024px) vertical nav rail only --
  // the <1024px horizontal anchor bar it collapses into (spec §5.2) is
  // already compact and never competes with the content pane for width, so
  // this toggle has no mobile equivalent and intentionally isn't reset by
  // resetKey below: it's a layout preference, not something tied to which
  // mail is open.
  const [navCollapsed, setNavCollapsed] = useState(false);

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
    void queryClient.cancelQueries({ queryKey: ['mail-lifecycle-logs', mailLogId] });
  }, [open, rawLogsExpanded, mailLogId, queryClient]);

  // A dispose action taken from inside the drawer (release/discard/recall via
  // RecipientStatus) must refresh BOTH the drawer's own detail/events queries
  // AND the list query behind it. Previously onRefetch only refetched the
  // detail query, so after releasing a mail the list row kept showing its
  // stale pre-release status ("投递中"/"隔离中") until a manual reload, even
  // though the backend state and a re-query were already correct (GT-12173).
  const handleDisposed = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['mail-log-detail', mailLogId] });
    void queryClient.invalidateQueries({ queryKey: ['mail-log-events', mailLogId] });
    void queryClient.invalidateQueries({ queryKey: ['mail-lifecycle-logs', mailLogId] });
    void queryClient.invalidateQueries({ queryKey: ['email-disposal'] });
  }, [queryClient, mailLogId]);

  // IntersectionObserver-based scroll-spy instead of comparing each section's
  // bounding-rect top against a fixed-pixel threshold: a pixel comparison
  // has to pick one fixed trigger line, and once "安全分析" is expanded
  // (5 detection-stage cards, all open by default) its content towers over
  // the other two sections -- the previous single-threshold math could keep
  // reporting a stale active section for a long stretch of that scroll
  // distance. Observing each <section> against a thin trigger band pinned to
  // the top of the content pane (via rootMargin) stays accurate regardless
  // of how tall any individual section's expanded content grows.
  useEffect(() => {
    const container = contentRef.current;
    if (!container || !open) return;

    // Local to this effect run (a fresh observer + fresh set every time it
    // re-attaches), not a ref -- there's nothing to preserve across renders.
    const intersecting = new Set<SectionKey>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const key = entry.target.getAttribute('data-section-key') as SectionKey | null;
          if (!key) continue;
          if (entry.isIntersecting) intersecting.add(key);
          else intersecting.delete(key);
        }
        // Prefer whichever section furthest down in reading order is still
        // crossing the trigger band -- mirrors "the section the user has
        // most recently scrolled into", not one barely still peeking out
        // at the very bottom of the trigger band from the section above it.
        for (const key of ['rawlogs', 'analysis', 'overview'] as const) {
          if (intersecting.has(key)) {
            setActiveSection(key);
            return;
          }
        }
      },
      {
        root: container,
        // Only the top ~20% band of the content pane counts as the
        // "current section" trigger line.
        rootMargin: '0px 0px -80% 0px',
        threshold: 0,
      },
    );

    for (const key of ['overview', 'analysis', 'rawlogs'] as const) {
      const el = sectionRefs.current[key];
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
    // `detail` is intentionally in the deps even though it's otherwise unused
    // in this effect: the content pane (and contentRef itself, and each
    // <section> ref) only mounts once detailQ resolves -- while the query is
    // loading, the "isLoading" branch below renders a spinner instead, so
    // every ref is still null on the FIRST run of this effect (when `open`
    // first flips true). Without `detail` here, the effect's deps never
    // change again once that early, no-op run happens, so the observer would
    // never actually get attached to the real sections -- permanently
    // breaking scroll-spy. (Same root cause as the pixel-based version this
    // replaced, found while writing DD-14's e2e smoke test.)
  }, [open, detail]);

  // Keep the active item visible in the horizontally-scrollable anchor bar
  // that the vertical nav collapses into below 1024px (spec §5.2). Without
  // this, once there are enough nav items to overflow that bar, scrolling
  // into a later section (or navigating there via scroll-spy) can leave its
  // corresponding tab scrolled out of view with no way to tell "where am I"
  // short of scrolling the bar itself. No-op on the desktop vertical nav,
  // which never overflows.
  useEffect(() => {
    navButtonRefs.current[activeSection]?.scrollIntoView({
      behavior: 'smooth',
      inline: 'center',
      block: 'nearest',
    });
  }, [activeSection]);

  const scrollToSection = (key: SectionKey) => {
    setActiveSection(key); // immediate feedback on click, ahead of the scroll-spy catching up
    // Navigating to "原始日志" via the nav rail (or the overview section's
    // "查看原始日志" link) should surface its data, not just scroll to an
    // empty collapsed placeholder the user then has to expand by hand.
    if (key === 'rawlogs') setRawLogsExpanded(true);
    sectionRefs.current[key]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Risk dot on the "安全分析" nav item: lets the user see the mail's final
  // verdict severity (malicious/graymail/normal) without scrolling down to
  // it first, reusing the same tone that already colors the verdict badge
  // inside AnalysisSection itself (mailTypeConfig/mailTypeTone) rather than
  // introducing a second, possibly-drifting severity classification.
  const riskDotClass: Record<ReturnType<typeof mailTypeTone>, string> = {
    malicious: 'bg-red-500',
    graymail: 'bg-amber-500',
    normal: 'bg-emerald-500',
  };
  const finalVerdictTypeCfg = detail?.email_type ? mailTypeConfig[detail.email_type] : null;

  // Warning icon on "原始日志" once we know (from an already-completed
  // fetch) that some gateway nodes' logs couldn't be retrieved -- surfaces
  // the same signal RawLogsSection shows inline (raw-logs-partial-warning)
  // one level up, so it's visible without expanding+scrolling to that
  // section first. Stays silent before the first expand/fetch (no log
  // fetch has been attempted yet, so there's nothing yet to warn about).
  const rawLogsPartial = lifecycleLogsQ.isSuccess && (
    (lifecycleLogsQ.data?.partial ?? false) || (lifecycleLogsQ.data?.failed_nodes?.length ?? 0) > 0
  );

  // Each item's icon is what's left visible once the label collapses to
  // icon-only width (below) -- without a per-item icon, a collapsed rail
  // would just be 3 identically-blank 48px slots.
  const navItems: { key: SectionKey; label: string; icon: typeof Inbox; dotClassName?: string; dotTooltip?: string; warning?: boolean; warningTooltip?: string }[] = [
    { key: 'overview', label: t('overviewAndHandle'), icon: Inbox },
    {
      key: 'analysis',
      label: t('securityAnalysis'),
      icon: ShieldAlert,
      dotClassName: finalVerdictTypeCfg ? riskDotClass[finalVerdictTypeCfg.tone] : undefined,
      dotTooltip: finalVerdictTypeCfg
        ? `${t('nav.finalVerdict')}：${t(stripDetailPrefix(finalVerdictTypeCfg.labelKey))}`
        : undefined,
    },
    {
      key: 'rawlogs',
      label: t('originalLog'),
      icon: ScrollText,
      warning: rawLogsPartial,
      warningTooltip: rawLogsPartial ? t('nav.rawLogsPartial') : undefined,
    },
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
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <span>{t('breadcrumb')}</span>
              {/* Long-page scroll-spy has no other on-screen indicator of
                  which of the 3 stacked sections is currently in view --
                  particularly disorienting once "安全分析" (5 detection-
                  stage cards, all expanded by default) makes the page much
                  taller than its two neighboring sections. Mirrors
                  activeSection 1:1 (same state scroll-spy already drives the
                  nav-rail highlight from), so this never needs its own
                  tracking logic. */}
              {detailQ.isSuccess && detail ? (
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
            {/* GT-12977 变更2：邮件ID原展示于"安全分析"标签下已删除的"内容
                详情"折叠区块内，需二次点开才可见；现挪到三个标签共用的页头，
                常驻可见，便于排障时直接核对/复制，不再依赖任何折叠状态。
                复用既有 emailDisposal.detail.features.emailId key（原
                "内容详情"区块的同一份翻译），不新增 i18n key。 */}
            {detail?.message_id ? (
              <div className="mt-0.5 truncate text-xs text-muted-foreground">
                {t('features.emailId')}：<span className="font-mono">{detail.message_id}</span>
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
                  narrow/fullscreen viewports. The icon-only collapse toggle
                  below is a *separate*, desktop-only affordance on top of
                  that -- it only ever changes the `w-[200px]`/`w-12` desktop
                  width; the max-lg: horizontal-bar classes are unaffected by
                  navCollapsed so mobile always shows full labels. */}
              <nav
                className={cn(
                  'shrink-0 border-r py-3 transition-[width] duration-150',
                  navCollapsed ? 'w-12' : 'w-[200px]',
                  'max-lg:flex max-lg:w-full max-lg:overflow-x-auto max-lg:border-r-0 max-lg:border-b max-lg:py-0',
                )}
              >
                {/* Toggle only rendered where it's meaningful: the
                    horizontal mobile bar is already compact and has no
                    competing content-width to reclaim, so this is hidden
                    there rather than offering a control with no real effect. */}
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
                        <PanelLeftIcon className="h-4 w-4" />
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
                {navItems.map(({ key, label, icon: Icon, dotClassName, dotTooltip, warning, warningTooltip }) => {
                  const indicator = dotClassName ? (
                    <span aria-hidden="true" className={cn('inline-block h-2 w-2 shrink-0 rounded-full', dotClassName)} />
                  ) : warning ? (
                    <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                  ) : null;
                  // Single InteractiveSurface->Slot merge target (the
                  // <button> itself) regardless of whether a tooltip wraps
                  // it below -- Slot only merges cleanly onto one real DOM
                  // element, and InteractiveSurface's own hover/focus
                  // treatment (data-hovered, focus ring) depends on that
                  // merge landing on the <button>, not on an intermediate
                  // non-DOM component like <Tooltip>.
                  const surface = (
                    <InteractiveSurface
                      key={key}
                      asChild
                      variant="control"
                      className={cn(
                        'w-full rounded-none border-l-2 px-4 py-2 text-left text-sm',
                        'max-lg:w-auto max-lg:shrink-0 max-lg:whitespace-nowrap max-lg:border-l-0 max-lg:border-b-2',
                        // Stronger, brand-colored active state (matches the
                        // selected/active-filter convention used elsewhere in
                        // this module, e.g. search-bar.tsx's expanded-filters
                        // button) -- the previous neutral-gray highlight
                        // (border-foreground/40 bg-muted) was easy to lose
                        // track of while scrolling a long page.
                        activeSection === key
                          ? 'border-primary bg-primary/10 font-medium text-primary data-[hovered=true]:bg-primary/15'
                          : 'border-transparent text-muted-foreground data-[hovered=true]:bg-muted/50 data-[hovered=true]:text-foreground',
                      )}
                    >
                      <button
                        ref={(el) => { navButtonRefs.current[key] = el; }}
                        data-testid={`disposal-detail-nav-${key}`}
                        type="button"
                        aria-current={activeSection === key ? 'location' : undefined}
                        onClick={() => scrollToSection(key)}
                        className={cn(
                          'flex w-full items-center gap-2',
                          // Centers the icon+indicator once the label is
                          // gone -- `max-lg:justify-start` because the label
                          // (below) always stays visible on mobile via
                          // not-sr-only, regardless of navCollapsed.
                          navCollapsed && 'justify-center max-lg:justify-start',
                        )}
                      >
                        <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
                        {/* `sr-only` removes the label from the collapsed
                            desktop rail's flow/paint while keeping it for
                            screen readers; `max-lg:not-sr-only` (a real
                            Tailwind utility, not a typo of `sr-only`) undoes
                            that below 1024px so the mobile horizontal bar is
                            never affected by this desktop-only toggle. */}
                        <span className={cn('truncate', navCollapsed && 'sr-only max-lg:not-sr-only')}>{label}</span>
                        {indicator}
                      </button>
                    </InteractiveSurface>
                  );
                  // Collapsed rail has no visible label, so every item needs
                  // its tooltip to *include* the label (not just the
                  // optional status suffix) -- otherwise a collapsed icon
                  // with no dot/warning would have no way to identify itself
                  // at all short of un-collapsing.
                  const statusText = dotTooltip || warningTooltip;
                  const tooltipText = navCollapsed ? [label, statusText].filter(Boolean).join(' · ') : statusText;
                  if (!tooltipText) return surface;
                  return (
                    <Tooltip key={key}>
                      {/* `render` as a plain <span> (not asChild-merged onto
                          `surface`) keeps the tooltip's own trigger-ref
                          plumbing on a guaranteed-forwardRef intrinsic
                          element, independent of InteractiveSurface's own
                          Slot merge above. This must stay a real box
                          (`display:block`), not `display:contents` --
                          Base UI's floating-ui positioning reads the
                          trigger's own getBoundingClientRect(), and a
                          `contents` element reports a collapsed 0×0 rect
                          at the viewport origin, which anchored every
                          collapsed-rail tooltip at the page's top-left
                          corner instead of next to its icon (caught via
                          browser verification, not just code review).
                          `block` still stacks identically to no wrapper
                          in nav's plain block flow on desktop, and gets
                          blockified the same as `contents` would inside
                          nav's mobile row-flex, so it doesn't affect
                          `surface`'s own width/layout either. */}
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
                  ref={(el) => { sectionRefs.current.overview = el; }}
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
                  ref={(el) => { sectionRefs.current.analysis = el; }}
                  className="scroll-mt-4"
                >
                  <h3 className="text-base font-semibold mb-2">{t('securityAnalysis')}</h3>
                  <AnalysisSection detail={detail} aiEnabled={aiEnabled} events={eventsQ.data ?? []} />
                </section>
                <section
                  data-testid="disposal-detail-rawlogs"
                  data-section-key="rawlogs"
                  ref={(el) => { sectionRefs.current.rawlogs = el; }}
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
