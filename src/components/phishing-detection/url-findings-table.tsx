'use client';

import { useTranslations } from 'next-intl';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { ScreenshotCapture } from './screenshot-capture';
import type { ScreenshotObservation, UrlFinding } from '@/types/phishing-detection';
import { urlFindingState } from '@/lib/url-verdict';
import { UrlVerdictDisplay } from './url-verdict-display';

interface UrlFindingsTableProps {
  findings: UrlFinding[];
  screenshots?: ScreenshotObservation[];
  screenshotsOmittedCount?: number;
  emptyText?: string;
  embedded?: boolean;
}

export function UrlFindingsTable({ findings, screenshots = [], screenshotsOmittedCount = 0, emptyText, embedded = false }: UrlFindingsTableProps) {
  const t = useTranslations('phishingDetection');

  const rows = [...findings];
  const urls = new Set(rows.map((finding) => finding.url || finding.final_url || ''));
  for (const capture of screenshots) {
    if (!urls.has(capture.url)) {
      rows.push({ url: capture.url });
      urls.add(capture.url);
    }
  }
  if (rows.length === 0 && screenshotsOmittedCount === 0) {
    return <p className="text-xs text-muted-foreground">{emptyText ?? t('table.noUrlFindings')}</p>;
  }

  return (
    <div className={cn('overflow-hidden bg-card', embedded ? '' : 'rounded-lg border border-border')}>
      {screenshotsOmittedCount > 0 ? <p className="px-3.5 py-2 text-xs text-muted-foreground">{t('screenshot.omittedCount', { count: screenshotsOmittedCount })}</p> : null}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="h-auto w-[62%] bg-card px-3.5 py-2 text-sm font-medium text-muted-foreground">
              {t('table.urlColumn')}
            </TableHead>
            <TableHead className="h-auto bg-card px-3.5 py-2 text-sm font-medium text-muted-foreground">
              {t('table.urlResult')}
            </TableHead>
            <TableHead className="h-auto bg-card px-3.5 py-2 text-sm font-medium text-muted-foreground">
              {t('table.threatType')}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((finding, index) => {
            const url = finding.url || finding.final_url || '';
            const finalUrl = finding.final_url && finding.final_url !== finding.url ? finding.final_url : '';
            const verdict = urlFindingState(finding);
            const threatType = verdict.status === 'valid' && verdict.verdict !== 'needs_review'
              ? (verdict.verdict === 'safe' ? 'benign' : verdict.verdict) : null;
            return (
              <TableRow key={`url-finding-${index}`} className="hover:bg-transparent">
                <TableCell className="whitespace-normal px-3.5 py-2.5">
                  <div className="break-all text-sm text-primary">
                    {url || t('table.unknownUrl')}
                  </div>
                  {finalUrl ? (
                    <div className="mt-1 break-all text-xs text-muted-foreground">
                      {t('table.finalUrlPrefix')}: {finalUrl}
                    </div>
                  ) : null}
                  {screenshots.filter((capture) => capture.url === url).map((capture, captureIndex) => <ScreenshotCapture key={`${capture.attempt_id}:${capture.fetch_id}`} capture={capture} index={captureIndex + 1} />)}
                </TableCell>
                <TableCell className="px-3.5 py-2.5">
                  {index < findings.length ? <UrlVerdictDisplay finding={finding} /> : <span className="text-xs text-muted-foreground">{t('urlValidation.screenshotOnly')}</span>}
                </TableCell>
                <TableCell className="px-3.5 py-2.5 text-sm text-muted-foreground">
                  {threatType ? t(`urlThreatType.${threatType}`) : '—'}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
