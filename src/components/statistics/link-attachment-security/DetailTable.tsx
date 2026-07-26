'use client';

import { Fragment, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
import { ChevronDown, ChevronRight, HelpCircle } from 'lucide-react';
import type { LinkDetailRow, AttachmentDetailRow } from '@/lib/api/link-attachment-security';
import {
  ATTACHMENT_DETAIL_KEYS,
  ATTACHMENT_TYPE_COLORS,
  ATTACHMENT_TYPE_KEYS,
  LINK_DETAIL_KEYS,
  LINK_TYPE_COLORS,
  LINK_TYPE_KEYS,
  blockRateLevel,
} from './colors';
import { RowDonut } from './RowDonut';

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
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const toggleExpanded = (date: string) => {
    const key = `${viewTab}:${date}`;
    setExpandedKey((current) => current === key ? null : key);
  };

  const expandedContent = (
    date: string,
    type: 'link' | 'attachment',
    data: Record<string, number>,
  ) => {
    const keys = type === 'link' ? LINK_TYPE_KEYS : ATTACHMENT_TYPE_KEYS;
    const colors = type === 'link' ? LINK_TYPE_COLORS : ATTACHMENT_TYPE_COLORS;
    const labels = Object.fromEntries(keys.map((key) => [
      key,
      type === 'link' ? t(`linkType.${key}`) : t(`attachmentThreatType.${key}`),
    ]));

    return (
      <div
        className="grid gap-4 rounded-lg bg-muted/30 p-4 md:grid-cols-[180px_1fr] md:items-center"
        data-testid={`threat-distribution-${type}-${date}`}
      >
        <div>
          <div className="text-sm font-medium">{t('table.threatDistribution')}</div>
          <div className="mt-1 text-xs text-muted-foreground">{date}</div>
          <RowDonut data={data} type={type} labels={labels} />
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {keys.map((key) => (
            <div key={key} className="flex items-center justify-between gap-3 text-sm">
              <span className="inline-flex min-w-0 items-center gap-2">
                <span
                  aria-hidden="true"
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: colors[key] }}
                />
                <span className="truncate">{labels[key]}</span>
              </span>
              <span className="tabular-nums">{data[key].toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

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
                <TableHead className="text-right">{t('table.phishingLink')}</TableHead>
                <TableHead className="text-right">{t('table.malwareDownload')}</TableHead>
                <TableHead className="text-right">{t('table.cAndCCommunication')}</TableHead>
                <TableHead className="text-right">{t('table.spamPromotion')}</TableHead>
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
              {rows.map((row) => {
                const isExpanded = expandedKey === `link:${row.date}`;
                return (
                  <Fragment key={row.date}>
                <TableRow
                  className="cursor-pointer"
                  aria-expanded={isExpanded}
                  onClick={() => toggleExpanded(row.date)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      toggleExpanded(row.date);
                    }
                  }}
                  tabIndex={0}
                >
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="h-7 w-7"
                        aria-label={t(isExpanded ? 'table.collapseRow' : 'table.expandRow', { date: row.date })}
                        aria-expanded={isExpanded}
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleExpanded(row.date);
                        }}
                      >
                        {isExpanded ? <ChevronDown /> : <ChevronRight />}
                      </Button>
                      <span>{row.date}</span>
                    </div>
                  </TableCell>
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
                {isExpanded && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={10} className="p-3">
                      {expandedContent(row.date, 'link', {
                        phishing: row.phishing,
                        malware_download: row.malware_download,
                        spam: row.spam,
                        c2: row.c2,
                        qr_phishing: row.qr_phishing,
                      })}
                    </TableCell>
                  </TableRow>
                )}
                  </Fragment>
                );
              })}
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
              <TableHead className="text-right">{t('table.virusAttachment')}</TableHead>
              <TableHead className="text-right">{t('table.macroDocument')}</TableHead>
              <TableHead className="text-right">{t('table.zipBomb')}</TableHead>
              <TableHead className="text-right">{t('table.exploit')}</TableHead>
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
            {rows.map((row) => {
              const isExpanded = expandedKey === `attachment:${row.date}`;
              return (
                <Fragment key={row.date}>
              <TableRow
                className="cursor-pointer"
                aria-expanded={isExpanded}
                onClick={() => toggleExpanded(row.date)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    toggleExpanded(row.date);
                  }
                }}
                tabIndex={0}
              >
                <TableCell className="font-medium">
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="h-7 w-7"
                      aria-label={t(isExpanded ? 'table.collapseRow' : 'table.expandRow', { date: row.date })}
                      aria-expanded={isExpanded}
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleExpanded(row.date);
                      }}
                    >
                      {isExpanded ? <ChevronDown /> : <ChevronRight />}
                    </Button>
                    <span>{row.date}</span>
                  </div>
                </TableCell>
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
              {isExpanded && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={10} className="p-3">
                    {expandedContent(row.date, 'attachment', {
                      virus: row.virus,
                      macro: row.macro,
                      zip_bomb: row.zip_bomb,
                      exploit: row.exploit,
                      other: row.other,
                    })}
                  </TableCell>
                </TableRow>
              )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
