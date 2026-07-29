'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ExternalLink, AlertTriangle } from 'lucide-react';
import type { AuthAttempt } from '@/lib/api/auth-attempts';
import { formatDate } from '@/lib/utils';
import { FAIL_ADVICE_KEY, failReasonLabelKey, formatIPLocation, protocolLabelKey, sceneLabelKey } from './constants';

// matchedConfigHref —— GT-12437（重开轮指示）：命中配置跳转 租户中心 >
// 域名与路由 下钻该租户的发信认证页签（?view= 顶层页签、?tenant_id= 下钻、
// ?tab=auth&config= 由 MailRoutingShell 消费：选中子页签并高亮该配置行）。
// 无租户上下文时回退 /mail-routing（单租户形态无租户中心）。
export function matchedConfigHref(a: { tenant_id?: number; matched_config_id?: number }): string {
  if (a.tenant_id) {
    return `/tenants?view=routing&tenant_id=${a.tenant_id}&tab=auth&config=${a.matched_config_id}`;
  }
  return `/mail-routing?tab=auth&config=${a.matched_config_id}`;
}

interface AuthDetailDrawerProps {
  attempt: AuthAttempt | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-2 border-b border-border/40 last:border-0">
      <div className="w-28 shrink-0 text-sm text-muted-foreground">{label}</div>
      <div className="flex-1 min-w-0 break-all text-sm">{children}</div>
    </div>
  );
}

function Section({
  title,
  testId,
  children,
}: {
  title: string;
  testId?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card" data-testid={testId}>
      <div className="border-b border-border/60 px-4 py-3">
        <h3 className="font-medium">{title}</h3>
      </div>
      <div className="px-4 py-1">{children}</div>
    </div>
  );
}

export function AuthDetailDrawer({ attempt, open, onOpenChange }: AuthDetailDrawerProps) {
  const t = useTranslations();
  const router = useRouter();

  if (!attempt) return null;

  const adviceKey = attempt.fail_reason_code ? FAIL_ADVICE_KEY[attempt.fail_reason_code] : undefined;
  const reasonLabelKey = failReasonLabelKey(attempt.fail_reason_code);
  const showFailDiagnosis = attempt.success === false;
  // For the `unknown` bucket (or a missing code) we cannot offer a specific
  // diagnosis, so surface the raw failure_reason text verbatim (spec §7.1/§10.4).
  const isUnknownReason = !attempt.fail_reason_code || attempt.fail_reason_code === 'unknown';
  const ipLocation = formatIPLocation(attempt.ip_location, t);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="data-[side=right]:w-full data-[side=right]:sm:max-w-2xl p-0 flex flex-col"
        showCloseButton
        data-testid="auth-detail-drawer"
      >
        <SheetHeader className="px-6 py-4 border-b shrink-0">
          <div className="text-xs text-muted-foreground">{t('authAttempts.detail.breadcrumb')}</div>
          <SheetTitle className="text-lg font-semibold flex items-center gap-2">
            <span className="font-mono">{attempt.username}</span>
            <Badge variant={attempt.success ? 'default' : 'destructive'} className="text-xs">
              {attempt.success ? t('authAttempts.success') : t('authAttempts.failed')}
            </Badge>
          </SheetTitle>
          <SheetDescription>{t('authAttempts.detail.description')}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto bg-muted/30 p-6 space-y-4">
          <Section title={t('authAttempts.detail.summary')} testId="auth-detail-summary">
            <Field label={t('authAttempts.logId')}>
              <span className="font-mono text-xs">{attempt.log_id}</span>
            </Field>
            <Field label={t('authAttempts.authResult')}>
              {attempt.success ? t('authAttempts.success') : t('authAttempts.failed')}
            </Field>
            <Field label={t('authAttempts.occurredAt')}>{formatDate(attempt.attempted_at)}</Field>
            <Field label={t('authAttempts.duration')}>
              {attempt.duration != null
                ? `${Math.round(attempt.duration)} ms`
                : t('authAttempts.notApplicable')}
            </Field>
            <Field label={t('authAttempts.detail.account')}>
              <span className="font-mono text-xs">{attempt.username}</span>
            </Field>
            <Field label={t('authAttempts.sourceIp')}>
              <span className="font-mono text-xs">
                {attempt.client_ip}
                {ipLocation ? <span className="font-sans">（{ipLocation}）</span> : null}
              </span>
            </Field>
          </Section>

          <Section title={t('authAttempts.detail.protocolServer')} testId="auth-detail-protocol">
            <Field label={t('authAttempts.authProtocol')}>
              {attempt.auth_protocol
                ? (protocolLabelKey(attempt.auth_protocol)
                    ? t(protocolLabelKey(attempt.auth_protocol)!)
                    : attempt.auth_protocol)
                : t('authAttempts.notApplicable')}
            </Field>
            <Field label={t('authAttempts.effectiveScene')}>
              {attempt.scene
                ? (sceneLabelKey(attempt.scene) ? t(sceneLabelKey(attempt.scene)!) : attempt.scene)
                : t('authAttempts.notApplicable')}
            </Field>
            <Field label={t('authAttempts.detail.matchedDomain')}>
              {attempt.domain || t('authAttempts.notApplicable')}
            </Field>
            <Field label={t('authAttempts.server')}>
              {attempt.server_host
                ? `${attempt.server_host}${attempt.server_port ? ':' + attempt.server_port : ''}`
                : t('authAttempts.notApplicable')}
            </Field>
            <Field label={t('authAttempts.ssl')}>
              {attempt.ssl_enabled == null
                ? t('authAttempts.notApplicable')
                : attempt.ssl_enabled
                  ? t('authAttempts.sslEnabled')
                  : t('authAttempts.sslDisabled')}
            </Field>
          </Section>

          <Section title={t('authAttempts.detail.matchedConfig')} testId="auth-detail-matched-config">
            {attempt.matched_config_id ? (
              <>
                <Field label={t('authAttempts.detail.configId')}>
                  <span className="font-mono text-xs">#{attempt.matched_config_id}</span>
                </Field>
                <div className="py-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push(matchedConfigHref(attempt))}
                    data-testid="auth-detail-jump-config"
                  >
                    <ExternalLink className="mr-1 h-4 w-4" />
                    {t('authAttempts.detail.jumpToAuthConfig')}
                  </Button>
                </div>
              </>
            ) : (
              <Field label={t('authAttempts.detail.configId')}>
                {t('authAttempts.notApplicable')}
              </Field>
            )}
          </Section>

          {showFailDiagnosis ? (
            <div
              className="rounded-lg border border-destructive/30 bg-destructive/5"
              data-testid="auth-detail-fail-diagnosis"
            >
              <div className="flex items-center gap-2 border-b border-destructive/20 px-4 py-3">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                <h3 className="font-medium">{t('authAttempts.detail.failDiagnosis')}</h3>
              </div>
              <div className="px-4 py-1">
                <Field label={t('authAttempts.failureReason')}>
                  {reasonLabelKey ? t(reasonLabelKey) : t('authAttempts.failReasons.unknown')}
                </Field>
                {isUnknownReason && attempt.failure_reason ? (
                  <Field label={t('authAttempts.rawFailureReason')}>
                    <span className="font-mono text-xs">{attempt.failure_reason}</span>
                  </Field>
                ) : null}
                <div className="py-2 text-sm text-muted-foreground">
                  {isUnknownReason
                    ? t('authAttempts.failAdvice.unknown')
                    : (adviceKey ? t(adviceKey) : t('authAttempts.failAdvice.unknown'))}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <SheetFooter className="shrink-0 flex-row justify-end gap-3 border-t bg-muted/30 px-6 py-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            data-testid="auth-detail-close"
          >
            {t('common.close')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
