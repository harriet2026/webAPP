'use client';

import { useTranslations } from 'next-intl';
import { ExternalLink } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { screenshotUrl } from '@/lib/api/phishing-detection';
import type { UrlFinding } from '@/types/phishing-detection';
import { JsonBlock } from '@/components/phishing-detection/json-block';

interface UrlEvidenceSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  finding?: UrlFinding | null;
}

function verdictVariant(verdict?: string): 'destructive' | 'default' | 'secondary' {
  switch (verdict) {
    case 'phishing':
      return 'destructive';
    case 'suspicious':
      return 'default';
    case 'benign':
      return 'secondary';
    default:
      return 'secondary';
  }
}

function verdictKey(verdict: string): boolean {
  return verdict === 'phishing' || verdict === 'suspicious' || verdict === 'benign';
}

export function UrlEvidenceSheet({ open, onOpenChange, finding }: UrlEvidenceSheetProps) {
  const t = useTranslations('phishingDetection');
  const url = finding?.url || finding?.final_url || '';
  const displayUrl = finding?.final_url || finding?.url || '';
  const verdict = finding?.agent?.verdict;
  const screenshotRef = finding?.screenshot_ref;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-4 sm:max-w-2xl p-0">
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle>{t('urlEvidence.title')}</SheetTitle>
          <SheetDescription className="break-all">{url || t('urlEvidence.empty')}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
          <div className="flex flex-wrap items-center gap-2">
            {verdict ? (
              <Badge variant={verdictVariant(verdict)}>
                {verdictKey(verdict) ? t(`urlEvidence.verdict.${verdict}`) : verdict}
              </Badge>
            ) : null}
            {displayUrl && verdict !== 'phishing' && verdict !== 'suspicious' ? (
              <a href={displayUrl.startsWith('http') ? displayUrl : undefined} target="_blank" rel="noreferrer">
                <Button variant="outline" size="sm">
                  <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                  {t('urlEvidence.openExternal')}
                </Button>
              </a>
            ) : null}
          </div>

          {screenshotRef?.storage_node && screenshotRef.key ? (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">{t('urlEvidence.screenshot')}</h4>
              <img
                src={screenshotUrl(screenshotRef.storage_node, screenshotRef.key)}
                alt={t('urlEvidence.screenshot')}
                className="w-full rounded-lg border border-border/70"
              />
            </div>
          ) : null}

          {finding?.analyze_url && Object.keys(finding.analyze_url).length > 0 ? (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">{t('urlEvidence.analyzeUrl')}</h4>
              <JsonBlock value={finding.analyze_url} />
            </div>
          ) : null}

          {finding?.redirect_chain && Object.keys(finding.redirect_chain).length > 0 ? (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">{t('urlEvidence.redirectChain')}</h4>
              <JsonBlock value={finding.redirect_chain} />
            </div>
          ) : null}

          {finding?.cert && Object.keys(finding.cert).length > 0 ? (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">{t('urlEvidence.cert')}</h4>
              <JsonBlock value={finding.cert} />
            </div>
          ) : null}

          {finding?.threat_intel && Object.keys(finding.threat_intel).length > 0 ? (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">{t('urlEvidence.threatIntel')}</h4>
              <JsonBlock value={finding.threat_intel} />
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
