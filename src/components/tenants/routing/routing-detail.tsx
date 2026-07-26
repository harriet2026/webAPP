'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { ArrowLeft, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/shared/status-badge';
import { useScopedApiRequest } from '@/lib/api/client';
import { getTenantRouting } from '@/lib/api/tenant-routing';
import type { Tenant } from '@/types/tenant';
import { progressCount } from '@/components/tenants/routing/progress';
import { MailRoutingShell } from '@/components/mail-routing/mail-routing-shell';

interface RoutingDetailProps {
  tenant: Tenant;
  onBack: () => void;
}

export function RoutingDetail({ tenant, onBack }: RoutingDetailProps) {
  const t = useTranslations('tenants');
  const tc = useTranslations('common');
  // GT-12330: scope every drill-down request to this tenant explicitly, so the
  // hardened tenant-scoped routes (F1 Task 2: path :id must equal X-Tenant-ID,
  // else 400) always get the matching header. Deliberately NOT the global
  // selectedTenant — that is cleared by the platform-view reconciliation.
  const { apiRequest } = useScopedApiRequest(tenant.id);

  const { data: summary, isLoading } = useQuery({
    queryKey: ['tenant-routing', tenant.id],
    queryFn: () => getTenantRouting(tenant.id, apiRequest),
  });

  const done = progressCount(tenant.routing_progress);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" className="gap-1.5" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          {t('routing.actions.back')}
        </Button>
      </div>

      <section className="overflow-hidden rounded-[28px] border border-border/70 bg-card/96 p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <div className="truncate text-lg font-semibold text-foreground">
              {tenant.name}
            </div>
            <div className="font-mono text-xs text-muted-foreground">{tenant.code}</div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge
              status={t(`access.${tenant.access_status}` as const)}
              variant={tenant.access_status === 'configured' ? 'success' : 'warning'}
            />
            <span className="text-xs text-muted-foreground">
              {t('routing.progressHint', { done, total: 4 })}
            </span>
          </div>
        </div>
        {isLoading || !summary ? (
          <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {tc('loading')}
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <CountCell
              label={t('routing.tabs.receiving')}
              value={summary.counts.receiving_domains}
              done={summary.routing_progress.receiving}
            />
            <CountCell
              label={t('routing.tabs.relay')}
              value={summary.counts.active_egress_names.length}
              done={summary.routing_progress.relay}
            />
            <CountCell
              label={t('routing.tabs.outbound')}
              value={summary.counts.outbound_rules}
              done={summary.routing_progress.outbound}
            />
            <CountCell
              label={t('routing.tabs.auth')}
              value={summary.counts.active_dkim_keys + summary.counts.smtp_credentials}
              done={summary.routing_progress.auth}
            />
          </div>
        )}
      </section>

      {/*
        Unified with the standalone /mail-routing page: render the same shell
        (Receiving/Relay/Outbound/Auth tabs). MailRoutingShell's tab components
        scope every request to the explicit tenantId prop (useScopedApiRequest),
        so X-Tenant-ID is injected for the system_admin drill-down without
        touching the global selected tenant. Do NOT wrap this in another <Tabs>
        — the shell provides its own.
      */}
      <MailRoutingShell tenantId={tenant.id} />
    </div>
  );
}

interface CountCellProps {
  label: string;
  value: number;
  done: boolean;
}

function CountCell({ label, value, done }: CountCellProps) {
  return (
    <div className="rounded-xl border border-border/50 bg-muted/20 px-3 py-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span
          className={
            'inline-block h-2 w-2 rounded-full ' +
            (done ? 'bg-emerald-500' : 'bg-muted-foreground/25')
          }
        />
      </div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}
