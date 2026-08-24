'use client';

import { useTranslations } from 'next-intl';
import { LockKeyhole } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AdmissionRulesSection } from './admission-rules-section';
import { RuntimeRiskSection } from './runtime-risk-section';
import { usePhishingAccess } from '../access';

export function PhishingConfigPage({ openCreateSignal }: { openCreateSignal?: number }) {
  const t = useTranslations('phishingConfig');
  const { status, canEdit, readOnly } = usePhishingAccess();
  const controlsReadOnly = !canEdit;
  return (
    <div className="space-y-6" data-testid="phishing-config-page">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{t('pageTitle')}</h2>
        <p className="text-sm text-muted-foreground">{t('pageDescription')}</p>
      </div>
      {status === 'ready' && readOnly ? <Alert role="status"><LockKeyhole className="size-4" /><AlertDescription>{t('readOnlyNotice')}</AlertDescription></Alert> : null}
      <AdmissionRulesSection readOnly={controlsReadOnly} openCreateSignal={openCreateSignal} />
      <RuntimeRiskSection readOnly={controlsReadOnly} />
    </div>
  );
}
