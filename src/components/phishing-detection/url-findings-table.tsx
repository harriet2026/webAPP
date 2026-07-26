'use client';

import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { UrlFinding } from '@/types/phishing-detection';

type VerdictKind = 'phishing' | 'suspicious' | 'malicious' | 'benign' | 'unknown';

function normalizeUrlVerdict(finding: UrlFinding): VerdictKind {
  const verdict = String(finding.agent?.verdict ?? '').toLowerCase();
  if (verdict === 'phishing') return 'phishing';
  if (verdict === 'suspicious') return 'suspicious';
  if (verdict === 'malicious') return 'malicious';
  if (verdict === 'benign' || verdict === 'safe') return 'benign';
  return 'unknown';
}

function normalizeThreatType(finding: UrlFinding): VerdictKind {
  const verdict = normalizeUrlVerdict(finding);
  if (verdict !== 'unknown') return verdict;
  const risk = String(finding.agent?.risk_level ?? finding.risk_level ?? '').toLowerCase();
  if (risk === 'critical' || risk === 'high') return 'malicious';
  if (risk === 'medium' || risk === 'low') return 'suspicious';
  return 'unknown';
}

function verdictVariant(kind: VerdictKind): 'destructive' | 'default' | 'secondary' | 'outline' {
  switch (kind) {
    case 'phishing':
    case 'malicious':
      return 'destructive';
    case 'suspicious':
      return 'default';
    case 'benign':
      return 'secondary';
    default:
      return 'outline';
  }
}

function verdictBadgeClass(kind: VerdictKind): string {
  switch (kind) {
    case 'phishing':
    case 'malicious':
      return 'gap-1 border-red-200 bg-red-50 text-red-600 hover:bg-red-50';
    case 'suspicious':
      return 'gap-1 border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-50';
    case 'benign':
      return 'gap-1 border-green-200 bg-green-50 text-green-700 hover:bg-green-50';
    default:
      return 'gap-1';
  }
}

function verdictDotClass(kind: VerdictKind): string {
  switch (kind) {
    case 'phishing':
    case 'malicious':
      return 'bg-red-500';
    case 'suspicious':
      return 'bg-amber-500';
    case 'benign':
      return 'bg-green-500';
    default:
      return 'bg-slate-400';
  }
}

interface UrlFindingsTableProps {
  findings: UrlFinding[];
  emptyText?: string;
  embedded?: boolean;
}

export function UrlFindingsTable({ findings, emptyText, embedded = false }: UrlFindingsTableProps) {
  const t = useTranslations('phishingDetection');

  if (findings.length === 0) {
    return <p className="text-xs text-muted-foreground">{emptyText ?? t('table.noUrlFindings')}</p>;
  }

  return (
    <div className={cn('overflow-hidden bg-card', embedded ? '' : 'rounded-lg border border-border')}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="h-auto w-[62%] bg-card px-3.5 py-2 text-xs font-medium text-muted-foreground">
              {t('table.urlColumn')}
            </TableHead>
            <TableHead className="h-auto bg-card px-3.5 py-2 text-xs font-medium text-muted-foreground">
              {t('table.urlResult')}
            </TableHead>
            <TableHead className="h-auto bg-card px-3.5 py-2 text-xs font-medium text-muted-foreground">
              {t('table.threatType')}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {findings.map((finding, index) => {
            const url = finding.url || finding.final_url || '';
            const finalUrl = finding.final_url && finding.final_url !== finding.url ? finding.final_url : '';
            const urlVerdict = normalizeUrlVerdict(finding);
            const threatType = normalizeThreatType(finding);
            return (
              <TableRow key={`url-finding-${index}`} className="hover:bg-transparent">
                <TableCell className="whitespace-normal px-3.5 py-2.5">
                  <div className="break-all text-xs text-blue-700">
                    {url || t('table.unknownUrl')}
                  </div>
                  {finalUrl ? (
                    <div className="mt-1 break-all text-[11px] text-muted-foreground">
                      {t('table.finalUrlPrefix')}: {finalUrl}
                    </div>
                  ) : null}
                </TableCell>
                <TableCell className="px-3.5 py-2.5">
                  {urlVerdict === 'unknown' ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <Badge variant={verdictVariant(urlVerdict)} className={verdictBadgeClass(urlVerdict)}>
                      <span className={cn('h-1.5 w-1.5 rounded-full', verdictDotClass(urlVerdict))} />
                      {t(`urlVerdict.${urlVerdict}`)}
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="px-3.5 py-2.5 text-xs text-muted-foreground">
                  {threatType === 'unknown' ? '—' : t(`urlThreatType.${threatType}`)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
