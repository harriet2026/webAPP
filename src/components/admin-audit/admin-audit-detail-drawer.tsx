'use client';

import { useTranslations } from 'next-intl';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { AdminAuditLog } from '@/lib/api/admin-audit';
import { formatDate } from '@/lib/utils';
import { diffText, summaryText } from '@/lib/admin-audit';
import { moduleOf, opTypeMeta } from './admin-audit-taxonomy';

interface AdminAuditDetailDrawerProps {
  log: AdminAuditLog | null;
  onClose: () => void;
  tenantNameOf?: (log: AdminAuditLog) => string;
}

export function AdminAuditDetailDrawer({ log, onClose, tenantNameOf }: AdminAuditDetailDrawerProps) {
  const t = useTranslations();

  return (
    <Sheet open={log !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        data-testid="admin-audit-detail"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl"
      >
        <SheetHeader className="shrink-0 border-b border-border px-6 pt-6 pb-3">
          <div className="mb-1 text-xs text-muted-foreground">{t('adminAudit.breadcrumb')}</div>
          <SheetTitle className="flex items-center gap-2">
            {log ? (
              <>
                <span>
                  {t(opTypeMeta(log.action).labelKey)}
                  <span className="text-muted-foreground">
                    {'：'}
                    {log.resource_type}
                    {log.resource_id ? ` #${log.resource_id}` : ''}
                  </span>
                </span>
                {log.status === 'failed' ? (
                  <Badge variant="outline" className="bg-red-50 text-red-700 ring-1 ring-red-200">
                    {t('adminAudit.stats.failed')}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
                    {t('adminAudit.stats.success')}
                  </Badge>
                )}
              </>
            ) : null}
          </SheetTitle>
          <SheetDescription className="text-sm text-muted-foreground">
            {t('adminAudit.description')}
          </SheetDescription>
        </SheetHeader>

        {log ? <Body log={log} tenantNameOf={tenantNameOf} t={t} onClose={onClose} /> : null}
      </SheetContent>
    </Sheet>
  );
}

interface BodyProps {
  log: AdminAuditLog;
  tenantNameOf?: (log: AdminAuditLog) => string;
  t: ReturnType<typeof useTranslations>;
  onClose: () => void;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-2">
      <div className="w-28 shrink-0 text-sm text-muted-foreground">{label}</div>
      <div className="flex-1 text-sm text-foreground">{value}</div>
    </div>
  );
}

function Section({ title, testid, children }: { title: string; testid: string; children: React.ReactNode }) {
  return (
    <section data-testid={testid} className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <div className="divide-y divide-border/60 px-4 py-1">{children}</div>
    </section>
  );
}

function Body({ log, tenantNameOf, t, onClose }: BodyProps) {
  const mod = moduleOf(log.resource_type);
  const operatorName = log.operator_name || log.username || '-';
  const ipCell = log.client_ip
    ? log.ip_location
      ? `${log.client_ip}（${log.ip_location}）`
      : log.client_ip
    : '-';
  const tenantLabel = tenantNameOf
    ? tenantNameOf(log)
    : (log.tenant_name ?? (log.tenant_id ? String(log.tenant_id) : '—'));
  const hasBefore = log.before_value && Object.keys(log.before_value).length > 0;
  const hasAfter = log.after_value && Object.keys(log.after_value).length > 0;
  const errorMessage =
    log.error_message ||
    // Backend writes details.error_status as the HTTP status code (int, e.g. 409).
    (log.details && log.details.error_status != null ? String(log.details.error_status) : undefined);

  return (
    <>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-muted/40 p-6">
        <Section title={t('adminAudit.section.summary')} testid="admin-audit-detail-summary">
          <Row label={t('adminAudit.logNoField')} value={<span className="font-mono">{log.operation_id}</span>} />
          <Row label={t('adminAudit.opTimeField')} value={formatDate(log.created_at)} />
          <Row
            label={t('adminAudit.adminUser')}
            value={
              <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                <span>{operatorName}</span>
                {log.username ? <span className="text-muted-foreground">{log.username}</span> : null}
                {log.operator_role ? (
                  <Badge variant="outline" className="bg-gray-100 text-gray-600 ring-1 ring-gray-200">
                    {t(`adminAudit.role.${log.operator_role}`)}
                  </Badge>
                ) : null}
              </span>
            }
          />
          {log.layer === 'tenant' ? <Row label={t('adminAudit.filter.tenant')} value={tenantLabel} /> : null}
          <Row label={t('adminAudit.layerLabel')} value={log.layer ? t(`adminAudit.layer.${log.layer}`) : '-'} />
        </Section>

        <Section title={t('adminAudit.section.content')} testid="admin-audit-detail-content">
          <Row label={t('adminAudit.filter.module')} value={`${t(mod.topKey)} / ${t(mod.subKey)}`} />
          <Row
            label={t('adminAudit.filter.opType')}
            value={
              <Badge variant="outline" className={opTypeMeta(log.action).badge}>
                {t(opTypeMeta(log.action).labelKey)}
              </Badge>
            }
          />
          <Row
            label={t('adminAudit.resourceType')}
            value={`${log.resource_type}${log.resource_id ? ` #${log.resource_id}` : ''}`}
          />
          <Row label={t('adminAudit.summaryField')} value={summaryText(log)} />
          <Row label={t('adminAudit.sourceIpField')} value={ipCell} />
        </Section>

        {hasBefore || hasAfter ? (
          <Section title={t('adminAudit.section.changeDiff')} testid="admin-audit-detail-diff">
            <div className="flex items-center gap-3 py-3">
              <div className="flex-1 rounded-lg border border-gray-200 bg-gray-50 p-3">
                <div className="mb-1 text-xs text-muted-foreground">{t('adminAudit.before')}</div>
                <div className="whitespace-pre-line text-sm text-foreground/80">{diffText(log.before_value)}</div>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="flex-1 rounded-lg border border-blue-200 bg-blue-50 p-3">
                <div className="mb-1 text-xs text-blue-600">{t('adminAudit.after')}</div>
                <div className="whitespace-pre-line text-sm text-foreground">{diffText(log.after_value)}</div>
              </div>
            </div>
          </Section>
        ) : null}

        {log.status === 'failed' ? (
          <section data-testid="admin-audit-detail-failure" className="rounded-lg border border-red-200 bg-red-50">
            <div className="flex items-center gap-2 border-b border-red-200 px-4 py-3">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <h3 className="text-sm font-semibold text-red-800">{t('adminAudit.section.failure')}</h3>
            </div>
            <div className="px-4 py-3">
              <p className="text-sm leading-relaxed text-foreground/80">
                {errorMessage || t('adminAudit.unknownError')}
              </p>
            </div>
          </section>
        ) : null}
      </div>

      <div className="flex shrink-0 justify-end gap-3 border-t border-border bg-muted/40 p-6">
        <Button variant="outline" data-testid="admin-audit-detail-close" onClick={onClose}>
          {t('adminAudit.close')}
        </Button>
      </div>
    </>
  );
}
