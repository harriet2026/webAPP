'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';
import { UrlFindingDetailSheet } from './UrlFindingDetailSheet';
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
import type { AssessmentResultFields } from '@/types/agent-assessment';
import type { ScreenshotObservation, UrlFinding } from '@/types/phishing-detection';
import { UrlVerdictDisplay } from './url-verdict-display';

interface UrlFindingsTableProps {
  findings: UrlFinding[];
  assessmentResult?: AssessmentResultFields;
  screenshots?: ScreenshotObservation[];
  screenshotsOmittedCount?: number;
  emptyText?: string;
  embedded?: boolean;
}

export function UrlFindingsTable({ findings, assessmentResult, screenshots = [], screenshotsOmittedCount = 0, emptyText, embedded = false }: UrlFindingsTableProps) {
  const t = useTranslations('phishingDetection');
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

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
            <TableHead className="h-auto min-w-56 bg-card px-3.5 py-2 text-sm font-medium text-muted-foreground">
              {t('table.urlColumn')}
            </TableHead>
            <TableHead className="h-auto bg-card px-3.5 py-2 text-sm font-medium text-muted-foreground">
              {t('table.urlResult')}
            </TableHead>
            <TableHead className="h-auto bg-card px-3.5 py-2 text-sm font-medium text-muted-foreground">
              {t('table.actions')}
            </TableHead>
            <TableHead className="w-full bg-card" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((finding, index) => {
            const url = finding.url || finding.final_url || '';
            const finalUrl = finding.final_url && finding.final_url !== finding.url ? finding.final_url : '';
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
                </TableCell>
                <TableCell className="px-3.5 py-2.5">
                  {index < findings.length ? <UrlVerdictDisplay finding={finding} /> : <span className="text-xs text-muted-foreground">{t('urlValidation.screenshotOnly')}</span>}
                </TableCell>
                <TableCell className="px-3.5 py-2.5 text-sm text-muted-foreground">
                  <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" data-testid={`phishing-url-finding-view-${index}`} onClick={() => setSelectedIndex(index)}>{t('urlDetail.view')}<ArrowRight className="ml-0.5 size-3.5" /></Button>
                </TableCell>
                <TableCell />
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <UrlFindingDetailSheet assessmentResult={assessmentResult} screenshots={selectedIndex == null ? [] : screenshots.filter((capture) => capture.url === (rows[selectedIndex]?.url || rows[selectedIndex]?.final_url))} finding={selectedIndex == null ? null : rows[selectedIndex] ?? null} screenshotOnly={selectedIndex != null && selectedIndex >= findings.length} open={selectedIndex != null} onOpenChange={(open) => { if (!open) setSelectedIndex(null); }} />
    </div>
  );
}
