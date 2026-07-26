'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Loader2, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { StatusBadge } from '@/components/shared/status-badge';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { verifyDomainDNS, verifyDomainManual } from '@/lib/api/tenants';
import { useProductForm } from '@/contexts/product-form-context';
import type { TenantDomain } from '@/types/tenant';
import { formatDate } from '@/lib/utils';

interface DomainVerifyStatusProps {
  tenantId: number;
  domain: TenantDomain;
}

export function DomainVerifyStatus({ tenantId, domain }: DomainVerifyStatusProps) {
  const t = useTranslations('tenants');
  const queryClient = useQueryClient();
  const { capabilities, viewer } = useProductForm();
  const [confirmManual, setConfirmManual] = useState(false);

  const isSaas = !!capabilities?.saas;
  const isPlatformAdmin = viewer === 'platform';
  const verified = domain.verify_status === 'verified';

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['tenant-domains', tenantId] });
  };

  const dnsMutation = useMutation({
    mutationFn: () => verifyDomainDNS(tenantId, domain.id),
    onSuccess: (res) => {
      invalidate();
      if (res.verify_status === 'verified') {
        toast.success(t('verify.toastVerified'));
      } else {
        toast.info(t('verify.toastPending'));
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const manualMutation = useMutation({
    mutationFn: () => verifyDomainManual(tenantId, domain.id),
    onSuccess: () => {
      invalidate();
      toast.success(t('verify.toastManual'));
      setConfirmManual(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // Non-SaaS: domains are auto-verified server-side; render only a muted hint.
  if (!isSaas) {
    return <StatusBadge status={t('verify.autoVerified')} variant="default" />;
  }

  if (verified) {
    const byKey =
      domain.verified_by === 'auto'
        ? 'verify.byAuto'
        : domain.verified_by === 'dns'
          ? 'verify.byDns'
          : domain.verified_by === 'manual'
            ? 'verify.byManual'
            : null;
    return (
      <div className="flex flex-col gap-0.5">
        <StatusBadge status={t('verify.status.verified')} variant="success" />
        {domain.verified_at && (
          <span className="text-[10px] text-muted-foreground">
            {byKey ? `${t(byKey as 'verify.byAuto')} · ` : ''}
            {formatDate(domain.verified_at)}
          </span>
        )}
      </div>
    );
  }

  // pending: TXT-record instructions + DNS verify button (+ manual for platform admin)
  return (
    <div className="flex items-center gap-1.5">
      <StatusBadge status={t('verify.status.pending')} variant="warning" />
      <Popover>
        <PopoverTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              title={t('verify.txtHint')}
            >
              <Info className="h-4 w-4" />
            </Button>
          }
        />
        <PopoverContent className="w-80 text-xs" align="start">
          <p className="mb-2 text-muted-foreground">{t('verify.txtHint')}</p>
          <dl className="space-y-1.5">
            <div>
              <dt className="font-medium">{t('verify.txtName')}</dt>
              <dd className="mt-0.5 break-all rounded border bg-muted/40 px-2 py-1 font-mono">
                _osg-verify.{domain.domain}
              </dd>
            </div>
            <div>
              <dt className="font-medium">
                TXT {t('verify.txtValue')}
              </dt>
              <dd className="mt-0.5 break-all rounded border bg-muted/40 px-2 py-1 font-mono">
                osg-site-verification={domain.verify_token ?? '—'}
              </dd>
            </div>
          </dl>
        </PopoverContent>
      </Popover>
      <Button
        variant="outline"
        size="sm"
        className="h-7"
        disabled={dnsMutation.isPending}
        onClick={() => dnsMutation.mutate()}
      >
        {dnsMutation.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
        {t('verify.verifyNow')}
      </Button>
      {isPlatformAdmin && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7"
          disabled={manualMutation.isPending}
          onClick={() => setConfirmManual(true)}
        >
          {manualMutation.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
          {t('verify.manualVerify')}
        </Button>
      )}
      <ConfirmDialog
        open={confirmManual}
        onOpenChange={setConfirmManual}
        title={t('verify.confirmManualTitle')}
        description={t('verify.confirmManualDesc', { domain: domain.domain })}
        variant="destructive"
        onConfirm={() => manualMutation.mutate()}
      />
    </div>
  );
}
