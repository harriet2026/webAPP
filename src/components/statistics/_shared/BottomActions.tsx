'use client';

import { Button } from '@/components/ui/button';
import { Download, FileText, Sparkles } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface SharedBottomActionsProps {
  /** Localized labels are looked up via `${namespace}.bottomActions.*` */
  namespace: string;
  /** CSV download URL (already includes auth-bearing same-origin path). */
  csvUrl: string;
  /** PDF print path (locale prefix will be added). */
  printPath: string;
  /** Extra query params to forward to the print route. */
  printParams?: Record<string, string>;
  onAiOpen?: () => void;
  /** When false the AI button is hidden (e.g. delivery-traffic disables it). */
  showAi?: boolean;
  /**
   * When true, all three actions (CSV/PDF/AI) render disabled with a
   * "no permission" tooltip instead of being clickable — used by pages whose
   * backend gates these endpoints to admins (e.g. link-attachment-security's
   * tenant_user role, spec §3.2.0).
   */
  disabled?: boolean;
}

/**
 * Shared bottom action bar (CSV / PDF / AI). Pages with extra needs
 * (security-overview's tenant scope, link-attachment-security's viewTab)
 * pass them via printParams.
 */
export function BottomActions({
  namespace,
  csvUrl,
  printPath,
  printParams,
  onAiOpen,
  showAi = true,
  disabled = false,
}: SharedBottomActionsProps) {
  const t = useTranslations(`${namespace}.bottomActions`);
  const tCommon = useTranslations('common');
  const locale = useLocale();

  const params = new URLSearchParams(printParams ?? {});
  const url = `/${locale}${printPath}${params.toString() ? `?${params}` : ''}`;

  const csvButton = (
    <Button variant="outline" size="sm" disabled={disabled}>
      <Download className="h-4 w-4" />
      {t('exportCsv')}
    </Button>
  );
  const pdfButton = (
    <Button variant="outline" size="sm" disabled={disabled} onClick={disabled ? undefined : () => window.open(url, '_blank')}>
      <FileText className="h-4 w-4" />
      {t('generateReport')}
    </Button>
  );
  const aiButton = (
    <Button variant="outline" size="sm" disabled={disabled} onClick={disabled ? undefined : onAiOpen}>
      <Sparkles className="h-4 w-4" />
      {t('aiAnalysis')}
    </Button>
  );

  if (!disabled) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border/70 bg-muted/30 px-4 py-3">
        <a href={csvUrl} download>
          {csvButton}
        </a>
        {pdfButton}
        {showAi && onAiOpen && aiButton}
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border/70 bg-muted/30 px-4 py-3">
        <Tooltip>
          <TooltipTrigger render={<span>{csvButton}</span>} />
          <TooltipContent>{tCommon('accessDenied')}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger render={<span>{pdfButton}</span>} />
          <TooltipContent>{tCommon('accessDenied')}</TooltipContent>
        </Tooltip>
        {showAi && (
          <Tooltip>
            <TooltipTrigger render={<span>{aiButton}</span>} />
            <TooltipContent>{tCommon('accessDenied')}</TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
}
