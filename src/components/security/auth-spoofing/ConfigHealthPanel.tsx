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

  // 观察开关已按协议拆分：SPF 相关提示只看 spf_observe_mode，DMARC 相关提示
  // 只看 dmarc_observe_mode，不再用同一个全局开关判断，避免一个协议已经开启
  // 观察、另一个协议的丢弃风险却被误判为"已在观察中"而隐藏提示。
  const visible =
    spfFail?.action === 'discard' ||
    spfSoftfail?.action === 'discard' ||
    !config.spf_observe_mode ||
    !config.dmarc_observe_mode;

  if (!visible) return null;

  const showSoftfailRow = spfSoftfail?.action === 'discard';
  const showObserveRow =
    (!config.spf_observe_mode && spfFail?.action === 'discard') ||
    (!config.dmarc_observe_mode && dmarcFail?.action === 'discard');

  const handleSoftfailAction = (action: 'quarantine' | 'proceed') => {
    if (!spfSoftfail) return;
    onChange({
      ...config,
      spf: { ...config.spf, softfail: { ...spfSoftfail, action } },
    });
  };

  const handleEnableObserve = () => {
    onChange({
      ...config,
      ...(!config.spf_observe_mode && spfFail?.action === 'discard' ? { spf_observe_mode: true } : {}),
      ...(!config.dmarc_observe_mode && dmarcFail?.action === 'discard' ? { dmarc_observe_mode: true } : {}),
    });
  };

  return (
    <div
      data-testid="auth-health-panel"
      className="ml-6 space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30"
    >
      <div className="flex items-center gap-2 text-sm font-medium text-amber-800 dark:text-amber-200">
        <AlertTriangle className="h-4 w-4" />
        {t('health.title')}
      </div>

      {showSoftfailRow && (
        <div
          data-testid="auth-health-softfail-risk"
          className="flex items-start gap-2 rounded border border-amber-300 bg-white p-2 dark:border-amber-700 dark:bg-gray-900"
        >
          <span className="text-amber-600 dark:text-amber-400">!</span>
          <p className="flex-1 text-xs text-amber-800 dark:text-amber-200">
            {t('health.softfailDropRisk')}
          </p>
          <div className="flex gap-1">
            <Button
              data-testid="auth-health-change-quarantine"
              variant="outline"
              size="sm"
              className="h-6 text-xs"
              onClick={() => handleSoftfailAction('quarantine')}
            >
              {t('health.changeToQuarantine')}
            </Button>
            <Button
              data-testid="auth-health-change-tag"
              variant="outline"
              size="sm"
              className="h-6 text-xs"
              onClick={() => handleSoftfailAction('proceed')}
            >
              {t('health.changeToTag')}
            </Button>
          </div>
        </div>
      )}

      {showObserveRow && (
        <div
          data-testid="auth-health-observe-suggest"
          className="flex items-center gap-2 rounded border border-blue-300 bg-white p-2 dark:border-blue-700 dark:bg-gray-900"
        >
          <p className="flex-1 text-xs text-muted-foreground">{t('health.dropSuggest')}</p>
          <Button data-testid="auth-health-enable-observe" variant="outline" size="sm" className="h-6 text-xs" onClick={handleEnableObserve}>
            {t('health.enableObserve')}
          </Button>
        </div>
      )}
    </div>
  );
}
