'use client';

import { useTranslations } from 'next-intl';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ProtocolChecksConfig } from '@/types/auth-spoofing';

interface ConfigHealthPanelProps {
  config: ProtocolChecksConfig;
  onChange: (config: ProtocolChecksConfig) => void;
}

export function ConfigHealthPanel({ config, onChange }: ConfigHealthPanelProps) {
  const t = useTranslations('authSpoofing');

  const spfFail = config.spf?.fail;
  const spfSoftfail = config.spf?.softfail;
  const dmarcFail = config.dmarc?.reject;

  const visible =
    spfFail?.action === 'discard' || spfSoftfail?.action === 'discard' || !config.observe_mode;

  if (!visible) return null;

  const showSoftfailRow = spfSoftfail?.action === 'discard';
  const showObserveRow =
    !config.observe_mode && (spfFail?.action === 'discard' || dmarcFail?.action === 'discard');

  const handleSoftfailAction = (action: 'quarantine' | 'mark-delivery') => {
    if (!spfSoftfail) return;
    onChange({
      ...config,
      spf: { ...config.spf, softfail: { ...spfSoftfail, action } },
    });
  };

  const handleEnableObserve = () => {
    onChange({ ...config, observe_mode: true });
  };

  return (
    <div className="ml-6 space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
      <div className="flex items-center gap-2 text-sm font-medium text-amber-800 dark:text-amber-200">
        <AlertTriangle className="h-4 w-4" />
        {t('health.title')}
      </div>

      {showSoftfailRow && (
        <div className="flex items-start gap-2 rounded border border-amber-300 bg-white p-2 dark:border-amber-700 dark:bg-gray-900">
          <span className="text-amber-600 dark:text-amber-400">!</span>
          <p className="flex-1 text-xs text-amber-800 dark:text-amber-200">
            {t('health.softfailDropRisk')}
          </p>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-xs"
              onClick={() => handleSoftfailAction('quarantine')}
            >
              {t('health.changeToQuarantine')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-xs"
              onClick={() => handleSoftfailAction('mark-delivery')}
            >
              {t('health.changeToTag')}
            </Button>
          </div>
        </div>
      )}

      {showObserveRow && (
        <div className="flex items-center gap-2 rounded border border-blue-300 bg-white p-2 dark:border-blue-700 dark:bg-gray-900">
          <p className="flex-1 text-xs text-muted-foreground">{t('health.dropSuggest')}</p>
          <Button variant="outline" size="sm" className="h-6 text-xs" onClick={handleEnableObserve}>
            {t('health.enableObserve')}
          </Button>
        </div>
      )}
    </div>
  );
}
