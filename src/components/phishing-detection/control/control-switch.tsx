'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { AgentControlSwitch } from '@/components/agent-center/agent-control-switch';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { AdmissionGateDialog } from './admission-gate-dialog';
import { usePhishingControl } from './use-phishing-control';

export function PhishingAgentHeaderActions({ onGoToConfig }: { onGoToConfig?: () => void }) {
  const t = useTranslations('phishingDetection.control');
  const tc = useTranslations('common');
  const control = usePhishingControl();
  const [confirmTarget, setConfirmTarget] = useState<boolean | null>(null);
  const [gateOpen, setGateOpen] = useState(false);

  const requestToggle = async (next: boolean) => {
    if (!control.canEdit || control.readinessUnknown) return;
    if (next) {
      // Re-read the rules at the moment of enabling so a just-disabled final
      // rule cannot leave the header with a stale readiness snapshot.
      if (!await control.checkAdmissionReady()) {
        setGateOpen(true);
        return;
      }
    }
    setConfirmTarget(next);
  };

  const switchControl = (
    <AgentControlSwitch
      checked={control.enabled}
      disabled={!control.canEdit || control.isLoading || control.readinessUnknown}
      pending={control.isPending}
      enabledLabel={tc('enabled')}
      disabledLabel={tc('disabled')}
      ariaLabel={t('ariaLabel')}
      onCheckedChange={requestToggle}
    />
  );

  return (
    <>
      {!control.canEdit || control.errorMessage ? (
        <Tooltip>
          <TooltipTrigger render={<span className="inline-flex" />}>{switchControl}</TooltipTrigger>
          <TooltipContent>{control.errorMessage ?? t('readOnly')}</TooltipContent>
        </Tooltip>
      ) : switchControl}
      <ConfirmDialog
        open={confirmTarget !== null}
        onOpenChange={(open) => { if (!open) setConfirmTarget(null); }}
        title={confirmTarget ? t('enableTitle') : t('disableTitle')}
        description={confirmTarget ? t('enableDescription') : t('disableDescription')}
        onConfirm={() => {
          if (confirmTarget !== null) control.update(confirmTarget);
          setConfirmTarget(null);
        }}
        variant={confirmTarget === false ? 'destructive' : 'default'}
      />
      <AdmissionGateDialog
        open={gateOpen}
        onOpenChange={setGateOpen}
        onGoToConfig={() => {
          setGateOpen(false);
          onGoToConfig?.();
        }}
      />
    </>
  );
}
