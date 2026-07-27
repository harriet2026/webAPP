'use client';

// Todo & alerts card (Plan Task 6, spec §4.6 / §4.11.3).
//
// The `alerts` prop already arrives scope-filtered from hooks.ts:
// `fetchSystemStatusData` only populates `platformAlerts` when
// `isPlatform` is true (never issuing `/monitor/*` for tenant viewers), and
// always appends the tenant-scope items. So this component does NOT need to
// re-filter items by scope — it only needs `effectiveViewer` for one
// narrower decision: whether to show the "查看全部告警" footer link, which
// points at `/monitoring/alerts` (adminOnly, 403s tenant_admin). Per the
// pattern Task 4/5 established, that comes from `useSecurityScope(null)`
// directly — not a hand-rolled `viewer === 'tenant'` check.
import { useTranslations } from 'next-intl';
import { PartyPopper, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { InteractiveSurface } from '@/components/ui/interactive-surface';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from '@/i18n/navigation';
import { useSecurityScope } from '@/components/statistics/security-overview/hooks/useSecurityScope';
import { useAgentRowVisibility } from './visibility';
import type { SystemStatusAlertItem } from './hooks';
import { DashboardCardFooterLink } from './dashboard-card-footer-link';

interface TodoAlertsProps {
  alerts: SystemStatusAlertItem[];
  isLoading: boolean;
}

const DOT_CLASS: Record<SystemStatusAlertItem['level'], string> = {
  danger: 'bg-rose-500',
  warning: 'bg-amber-500',
  info: 'bg-sky-500',
};

const AGENT_SIDEBAR_KEY: Record<NonNullable<SystemStatusAlertItem['agent']>, string> = {
  phishing: 'phishingDetection',
  spoofing: 'spoofingDetection',
  'threat-retro': 'threatRetro',
};

type TFn = ReturnType<typeof useTranslations>;

function itemTitle(item: SystemStatusAlertItem, t: TFn, tSidebar: TFn): string {
  switch (item.kind) {
    case 'monitor':
      return item.alert?.rule_name ?? '';
    case 'node_offline':
      return t('itemNodeOffline', { node: item.node?.id ?? '' });
    case 'pending_disposal':
      return t('itemPendingDisposal', { n: item.count ?? 0 });
    case 'pending_report':
      return t('itemPendingReport', { n: item.count ?? 0 });
    case 'agent_pending':
      return t('itemAgentPending', {
        agent: item.agent ? tSidebar(AGENT_SIDEBAR_KEY[item.agent]) : '',
        n: item.count ?? 0,
      });
    // GT-12553: 许可证到期/规则库状态平台待办（数据源 /system/health-summary）
    case 'license_expiry':
      return t('itemLicenseExpiry', { n: item.days ?? 0 });
    case 'rule_lib':
      return item.ruleLatest ? t('itemRuleLibLatest') : t('itemRuleLibOutdated');
    default:
      return '';
  }
}

function itemDescription(item: SystemStatusAlertItem, t: TFn): string {
  if (item.kind === 'monitor' && item.alert) return item.alert.message;
  if (item.kind === 'node_offline' && item.node) {
    // Guard against a missing / zero heartbeat: `new Date(0).toLocaleString()`
    // renders a misleading epoch, and a NaN unix renders "Invalid Date". Only
    // show the last-seen time when we have a real positive timestamp.
    const unix = item.node.last_seen_unix;
    if (!unix || !Number.isFinite(unix)) return '';
    return t('lastSeen', { time: new Date(unix * 1000).toLocaleString() });
  }
  if (item.kind === 'license_expiry') return t('licenseRenewHint');
  if (item.kind === 'rule_lib') return item.ruleVersion ?? '';
  return '';
}

export function TodoAlerts({ alerts, isLoading }: TodoAlertsProps) {
  const t = useTranslations('systemStatus.todo');
  const tSidebar = useTranslations('sidebar');
  const { effectiveViewer } = useSecurityScope(null);
  const isPlatform = effectiveViewer === 'platform';
  const agentRowVisibility = useAgentRowVisibility();

  // Agent-pending items are fetched off the coarse page-level `capabilities.ai`
  // flag (see hooks.ts), but each agent feature is grantable/platformHidden and
  // agent-overview.tsx hides ungranted rows per-viewer. Apply the same per-agent
  // gate here so a viewer never sees a "待审 N 封" item (with a count + deep
  // link) for an agent feature they aren't entitled to — matching the "fetch
  // coarse, gate display fine" pattern the agent-overview card documents.
  const visibleAlerts = alerts.filter(
    (item) => item.kind !== 'agent_pending' || !item.agent || agentRowVisibility[item.agent],
  );

  return (
    <Card className="overflow-hidden" data-testid="system-status-todo-card">
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : visibleAlerts.length === 0 ? (
          <div
            className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground"
            data-testid="system-status-todo-empty"
          >
            <PartyPopper className="h-6 w-6" />
            <div className="text-sm">{t('empty')}</div>
          </div>
        ) : (
          <ul className="space-y-1" data-testid="system-status-todo-list">
            {visibleAlerts.map((item) => {
              const content = (
                <>
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT_CLASS[item.level]}`} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{itemTitle(item, t, tSidebar)}</div>
                    <div className="truncate text-xs text-muted-foreground">{itemDescription(item, t)}</div>
                  </div>
                  {item.href && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                </>
              );
              return (
                <li key={item.id} data-testid={`system-status-todo-item-${item.id}`}>
                  {item.href ? (
                    <InteractiveSurface asChild variant="row">
                      <Link href={item.href} className="flex items-start gap-2 px-2 py-2">
                        {content}
                      </Link>
                    </InteractiveSurface>
                  ) : (
                    <div className="flex items-start gap-2 px-2 py-2">{content}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
      {isPlatform && (
        <CardFooter>
          <DashboardCardFooterLink
            href="/monitoring/alerts"
            testId="system-status-todo-view-all"
          >
            {t('viewAll')}
          </DashboardCardFooterLink>
        </CardFooter>
      )}
    </Card>
  );
}
