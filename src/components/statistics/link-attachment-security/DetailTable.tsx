'use client';

import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { HelpCircle } from 'lucide-react';
import type { LinkDetailRow, AttachmentDetailRow } from '@/lib/api/link-attachment-security';
import { LINK_DETAIL_KEYS, ATTACHMENT_DETAIL_KEYS, blockRateLevel } from './colors';

interface DetailTableProps {
  linkRows?: LinkDetailRow[];
  attachmentRows?: AttachmentDetailRow[];
  viewTab: 'link' | 'attachment';
  isLoading: boolean;
}

function blockRateDotClass(rate: number): string {
  // spec §4.8: ≥97% 绿 / 95–97% 黄 / <95% 红
  const level = blockRateLevel(rate);
  return level === 'high' ? 'bg-emerald-500' : level === 'mid' ? 'bg-amber-500' : 'bg-rose-500';
}

function changeColor(change: number): string {
  if (change > 0) return 'text-rose-500';
  if (change < 0) return 'text-emerald-500';
  return 'text-muted-foreground';
}

export function DetailTable({ linkRows, attachmentRows, viewTab, isLoading }: DetailTableProps) {
  const t = useTranslations('linkAttachmentSecurity');

  if (isLoading) {
    return (
      <Card data-testid="link-attachment-detail">
        <CardHeader>
          <CardTitle>{t('detailTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (viewTab === 'link') {
    const rows = linkRows ?? [];
    if (rows.length === 0) {
      return (
        <Card>
          <CardHeader>
            <CardTitle>{t('detailTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[200px] flex items-center justify-center text-muted-foreground">
              {t('empty.noLinkMail')}
            </div>
          </CardContent>
        </Card>
      );
    }

    return (
      <Card data-testid="link-attachment-detail">
        <CardHeader>
          <CardTitle>{t('detailTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">{t('table.date')}</TableHead>
                <TableHead className="text-right">{t('table.totalLinkMail')}</TableHead>
                <TableHead className="text-right">{t('table.safeLinkMail')}</TableHead>
                <TableHead className="text-right">{t('table.maliciousLinkMail')}</TableHead>
                {LINK_DETAIL_KEYS.map((k) => (
                  <TableHead key={k} className="text-right">
                    {t(`linkType.${k}`)}
                  </TableHead>
                ))}
                <TableHead className="text-right">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger
                        render={<span className="inline-flex items-center gap-1" />}
                      >
                        {t('table.blockRate')}
                        <HelpCircle className="h-3 w-3 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent>{t('table.blockRateHelp')}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </TableHead>
                <TableHead className="text-right">{t('table.change')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.date}>
                  <TableCell className="font-medium">{row.date}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.total_link_mail.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.safe_link_mail.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-rose-600">
                    {row.malicious_link_mail.toLocaleString()}
                  </TableCell>
                  {LINK_DETAIL_KEYS.map((k) => (
                    <TableCell key={k} className="text-right tabular-nums">
                      {row[k]}
                    </TableCell>
                  ))}
                  <TableCell className="text-right tabular-nums">
                    <div className="inline-flex items-center gap-1.5">
                      <div
                        className={`h-2 w-2 rounded-full ${blockRateDotClass(row.block_rate)}`}
                      />
                      {row.block_rate.toFixed(1)}%
                    </div>
                  </TableCell>
                  <TableCell className={`text-right tabular-nums ${changeColor(row.change)}`}>
                    {row.change > 0 ? '+' : ''}
                    {row.change.toFixed(1)}%
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    );
  }

  const rows = attachmentRows ?? [];
  if (rows.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('detailTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[200px] flex items-center justify-center text-muted-foreground">
            {t('empty.noAttachmentMail')}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="link-attachment-detail">
      <CardHeader>
        <CardTitle>{t('detailTitle')}</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">{t('table.date')}</TableHead>
              <TableHead className="text-right">{t('table.totalAttachmentMail')}</TableHead>
              <TableHead className="text-right">{t('table.safeAttachmentMail')}</TableHead>
              <TableHead className="text-right">{t('table.maliciousAttachmentMail')}</TableHead>
              {ATTACHMENT_DETAIL_KEYS.map((k) => (
                <TableHead key={k} className="text-right">
                  {t(`attachmentThreatType.${k}`)}
                </TableHead>
              ))}
              <TableHead className="text-right">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger
                      render={<span className="inline-flex items-center gap-1" />}
                    >
                      {t('table.blockRate')}
                      <HelpCircle className="h-3 w-3 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent>{t('table.blockRateHelp')}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </TableHead>
              <TableHead className="text-right">{t('table.change')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.date}>
                <TableCell className="font-medium">{row.date}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.total_attachment_mail.toLocaleString()}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.safe_attachment_mail.toLocaleString()}
                </TableCell>
                <TableCell className="text-right tabular-nums text-rose-600">
                  {row.malicious_attachment_mail.toLocaleString()}
                </TableCell>
                {ATTACHMENT_DETAIL_KEYS.map((k) => (
                  <TableCell key={k} className="text-right tabular-nums">
                    {row[k]}
                  </TableCell>
                ))}
                <TableCell className="text-right tabular-nums">
                  <div className="inline-flex items-center gap-1.5">
                    <div
                      className={`h-2 w-2 rounded-full ${blockRateDotClass(row.block_rate)}`}
                    />
                    {row.block_rate.toFixed(1)}%
                  </div>
                </TableCell>
                <TableCell className={`text-right tabular-nums ${changeColor(row.change)}`}>
                  {row.change > 0 ? '+' : ''}
                  {row.change.toFixed(1)}%
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
