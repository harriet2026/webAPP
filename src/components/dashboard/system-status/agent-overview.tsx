'use client';

// Agent overview card (Plan Task 6, spec §4.7 / §4.11.4).
//
// Rendered ONLY when `showAgents` (== `capabilities.ai`, from Task 5's
// `useSystemStatusVisibility`) is true — the parent is responsible for that
// coarse gate, mirroring how `hooks.ts` itself only fetches the three
// agent-stats endpoints when `aiEnabled` is true.
//
// That coarse `capabilities.ai` gate is NOT sufficient per-row, though: all
// three registry features (`phishing-detection`/`spoofing-detection`/
// `threat-retro`) are `grantable: true` + `platformHidden: true`, so a
// platform viewer in a multi-tenant AI form (or a SaaS tenant not granted a
// given feature) can resolve very differently per row even though
// `capabilities.ai` is true for the whole page. Each row is independently
// re-checked here via `useAgentRowVisibility()` (visibility.ts), the same
// `resolve()` mechanism `sidebar-visibility.ts` uses per nav item — this
// component does not otherwise re-derive product-form capability itself.
//
// fetchAgentStats in hooks.ts is intentionally left gated on the coarse
// `aiEnabled` flag only, NOT re-gated per-row here: (1) the three stats
// endpoints are already tenant-scoped by the shared `scopedRequest` (same
// backend RBAC/tenant isolation as every other dashboard call), so an
// ungranted-but-AI-enabled fetch cannot leak cross-tenant data — the actual
// UI exposure this review flagged is fixed by the per-row hide below; (2)
// gating the fetch itself would require pulling `registry`/`grants` into
// `hooks.ts`, duplicating the scope/entitlement derivation that already
// lives in `useProductForm`/`resolve()` and that this file's own doc
// comments (see `useSystemStatusData`) explicitly avoid duplicating
// elsewhere on this page. Precedent: `hooks.ts` already fetches
// nodes/alerts off the coarser `isPlatform` signal rather than the finer
// `resolve('monitor-infrastructure')` check `visibility.ts` uses for
// display — "fetch coarse, gate display fine" is the established pattern
// here.
//
// "Today" metric per row is FIXED per the plan's Global Constraints (the
// three stats endpoints do not share a field shape): phishing/spoofing use
// `todayDetected`, threat-retro uses `recalledToday` (it has no
// `todayDetected`). There is no backend "agent health" signal in any of the
// three stats endpoints (`PhishingStats`/`SpoofingStats`/`ThreatRetroStats`
// carry only counts, no status field) — so "abnormal" is not a fabricated
// per-agent state. Status is derived from whether `agents` data loaded at
// all: `agents != null` -> enabled (green) for all three rows; `agents ==
// null` while not loading (the combined query errored) -> abnormal (red)
// for all three, with "—" for the count per spec §4.11.4.
import { useTranslations } from 'next-intl';
import { Bot } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { InteractiveSurface } from '@/components/ui/interactive-surface';
import { Link } from '@/i18n/navigation';
import type { SystemStatusAgentStats } from './hooks';
import { useAgentRowVisibility, type AgentRowKey } from './visibility';
import { DashboardCardFooterLink } from './dashboard-card-footer-link';

interface AgentOverviewProps {
  agents: SystemStatusAgentStats | null;
  isLoading: boolean;
}

interface AgentRow {
  key: AgentRowKey;
  sidebarKey: string;
  href: string;
  todayLabelKey: 'todayDetected' | 'todayRecalled';
  todayValue: number | undefined;
}

const AGENT_CENTER_HREF = '/agent-center/overview';

export function AgentOverview({ agents, isLoading }: AgentOverviewProps) {
  const t = useTranslations('systemStatus.agents');
  const tSidebar = useTranslations('sidebar');
  const rowVisibility = useAgentRowVisibility();

  const enabled = agents != null;

  const allRows: AgentRow[] = [
    {
      key: 'phishing',
      sidebarKey: 'phishingDetection',
      href: '/agent-center/overview?agent=phishing',
      todayLabelKey: 'todayDetected',
      todayValue: agents?.phishing.todayDetected,
    },
    {
      key: 'spoofing',
      sidebarKey: 'spoofingDetection',
      href: '/agent-center/overview?agent=spoofing',
      todayLabelKey: 'todayDetected',
      todayValue: agents?.spoofing.todayDetected,
    },
    {
      key: 'threat-retro',
      sidebarKey: 'threatRetro',
      href: '/agent-center/overview?agent=threat-retro',
      todayLabelKey: 'todayRecalled',
      todayValue: agents?.threatRetro.recalledToday,
    },
  ];

  // Per-row form/viewer gate (review fix) — a row hidden by `resolve()` does
  // not render at all, independent of the page-level `showAgents` gate.
  const rows = allRows.filter((row) => rowVisibility[row.key]);

  // All three rows resolved hidden for this viewer (e.g. a SaaS tenant
  // granted none of the three agent features) -> the whole card has nothing
  // to show; suppress it rather than rendering an empty list under a
  // "智能体运行概况" header with only the footer link.
  if (rows.length === 0) return null;

  return (
    <Card className="overflow-hidden" data-testid="system-status-agents-card">
      <CardHeader className="flex flex-row items-center gap-2">
        <Bot className="h-4 w-4 text-muted-foreground" />
        <CardTitle>{t('title')}</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : (
          <ul className="space-y-2" data-testid="system-status-agents-list">
            {rows.map((row) => (
              <li key={row.key} data-testid={`system-status-agent-row-${row.key}`}>
                <InteractiveSurface asChild variant="row">
                  <Link href={row.href} className="flex items-center justify-between px-2 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{tSidebar(row.sidebarKey)}</span>
                      <Badge
                        variant="outline"
                        data-testid={`system-status-agent-status-${row.key}`}
                        className={
                          enabled
                            ? 'border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:text-emerald-400'
                            : 'border-rose-300 text-rose-700 dark:border-rose-800 dark:text-rose-400'
                        }
                      >
                        {enabled ? t('enabled') : t('abnormal')}
                      </Badge>
                    </div>
                    <span className="text-sm tabular-nums text-muted-foreground">
                      {enabled ? t(row.todayLabelKey, { n: row.todayValue ?? 0 }) : '—'}
                    </span>
                  </Link>
                </InteractiveSurface>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      <CardFooter>
        <DashboardCardFooterLink
          href={AGENT_CENTER_HREF}
          testId="system-status-agents-center"
        >
          {t('center')}
        </DashboardCardFooterLink>
      </CardFooter>
    </Card>
  );
}
