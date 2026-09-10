'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import ReactECharts from 'echarts-for-react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Tooltip as UiTooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { actionColor, moduleLabelKey, OBSERVE_TIMEOUT_DAYS, SUGGESTION_BADGE_CLASS, SUGGESTION_TONE } from './constants';
import type { RuleEffectivenessRow } from '@/lib/api/rule-effectiveness';

interface DetailTableProps {
  rows: RuleEffectivenessRow[];
  isLoading: boolean;
  onViewHits: (row: RuleEffectivenessRow) => void;
  onNavigateToConfig: (row: RuleEffectivenessRow) => void;
}

export function DetailTable({ rows, isLoading, onViewHits, onNavigateToConfig }: DetailTableProps) {
  const t = useTranslations('ruleEffectiveness.detail');
  const tModule = useTranslations('ruleEffectiveness.filter.modules');
  const tAction = useTranslations('ruleEffectiveness.wouldBeActions');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <Card data-testid="rule-effectiveness-detail-table">
      <CardHeader>
        <CardTitle className="text-base">{t('title')}</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[240px] w-full" />
        ) : rows.length === 0 ? (
          <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
            {t('empty')}
          </div>
        ) : (
          <TooltipProvider>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead className="sticky left-0 bg-card">{t('col.module')}</TableHead>
                    <TableHead>{t('col.subStrategy')}</TableHead>
                    <TableHead>{t('col.observedSince')}</TableHead>
                    <TableHead>{t('col.observedDays')}</TableHead>
                    <TableHead>{t('col.hits')}</TableHead>
                    <TableHead>
                      <UiTooltip>
                        <TooltipTrigger render={<span className="cursor-help underline decoration-dotted">{t('col.wouldBlockCount')}</span>} />
                        <TooltipContent>{t('tooltip.wouldBlockCount')}</TooltipContent>
                      </UiTooltip>
                    </TableHead>
                    <TableHead>
                      <UiTooltip>
                        <TooltipTrigger render={<span className="cursor-help underline decoration-dotted">{t('col.falsePositiveRate')}</span>} />
                        <TooltipContent>{t('tooltip.falsePositiveRate')}</TooltipContent>
                      </UiTooltip>
                    </TableHead>
                    <TableHead>{t('col.suggestion')}</TableHead>
                    <TableHead className="sticky right-0 bg-card">{t('col.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const isExpanded = expandedRows.has(row.id);
                    const fpRateText = row.false_positive_rate == null
                      ? t('dataInsufficient')
                      : `${(row.false_positive_rate * 100).toFixed(1)}%`;
                    const tone = SUGGESTION_TONE[row.suggestion];
                    const isTimeout = row.observed_days > OBSERVE_TIMEOUT_DAYS;
                    return (
                      <>
                        <TableRow key={row.id} data-testid={`rule-effectiveness-row-${row.id}`}>
                          <TableCell>
                            <button type="button" onClick={() => toggleRow(row.id)} aria-label={t('expandRow')}>
                              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </button>
                          </TableCell>
                          <TableCell className="sticky left-0 bg-card">
                            {/* 相似检测按归属策略（相似邮件检测/相同主题检测）显示，而非笼统的「相似检测」 */}
                            <Badge variant="outline">{tModule(moduleLabelKey(row))}</Badge>
                          </TableCell>
                          <TableCell className="max-w-[220px] truncate">
                            {row.sub_strategy_name_snapshot}
                            {row.is_deleted && (
                              <span className="ml-1 text-xs text-muted-foreground">{t('deletedSuffix')}</span>
                            )}
                          </TableCell>
                          <TableCell>{row.observed_since}</TableCell>
                          <TableCell className={isTimeout ? 'text-warning font-medium' : ''}>
                            {t('daysValue', { days: row.observed_days })}
                          </TableCell>
                          <TableCell>{row.hits}</TableCell>
                          <TableCell className="text-danger font-medium">{row.would_block_count}</TableCell>
                          <TableCell>{fpRateText}</TableCell>
                          <TableCell>
                            <UiTooltip>
                              <TooltipTrigger render={
                                <Badge className={SUGGESTION_BADGE_CLASS[tone]} variant="outline">
                                  {t(`suggestion.${row.suggestion}`)}
                                </Badge>
                              } />
                              <TooltipContent>{row.suggestion_reason}</TooltipContent>
                            </UiTooltip>
                          </TableCell>
                          <TableCell className="sticky right-0 bg-card">
                            <div className="flex items-center gap-2">
                              <Button variant="outline" size="sm" onClick={() => onViewHits(row)}>
                                {t('viewHits')}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={row.is_deleted}
                                title={row.is_deleted ? t('deletedTooltip') : undefined}
                                onClick={() => onNavigateToConfig(row)}
                              >
                                {t('goToConfig')}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                        {isExpanded && (
                          <TableRow key={`${row.id}-expanded`}>
                            <TableCell colSpan={10} className="bg-muted/20">
                              <div className="flex items-center gap-6 py-2">
                                {row.action_breakdown.length === 0 ? (
                                  <span className="text-sm text-muted-foreground">{t('empty')}</span>
                                ) : (
                                  <>
                                    <ReactECharts
                                      option={{
                                        tooltip: { trigger: 'item' },
                                        series: [{
                                          type: 'pie',
                                          radius: ['40%', '70%'],
                                          data: row.action_breakdown.map((b) => ({
                                            name: tAction(b.action),
                                            value: b.count,
                                            itemStyle: { color: actionColor(b.action) },
                                          })),
                                        }],
                                      }}
                                      style={{ height: 160, width: 200 }}
                                    />
                                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                                      {row.action_breakdown.map((b) => (
                                        <div key={b.action} className="flex items-center gap-1.5">
                                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: actionColor(b.action) }} />
                                          {tAction(b.action)}：{b.count}
                                        </div>
                                      ))}
                                    </div>
                                  </>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </TooltipProvider>
        )}
      </CardContent>
    </Card>
  );
}
