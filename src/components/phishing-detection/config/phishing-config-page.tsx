'use client';

import { useTranslations } from 'next-intl';
import { AdmissionRulesSection } from './admission-rules-section';
import { RuntimeModeSection } from './runtime-mode-section';

export function PhishingConfigPage() {
  const t = useTranslations('phishingConfig');
  return (
    <div className="space-y-6" data-testid="phishing-config-page">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{t('pageTitle')}</h2>
        <p className="text-sm text-muted-foreground">{t('pageDescription')}</p>
      </div>
      <RuntimeModeSection />
      <AdmissionRulesSection />
    </div>
  );
}
