'use client';

import { Fragment, useState } from 'react';
import { useTranslations } from 'next-intl';
import ReactECharts from 'echarts-for-react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
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
import { actionColor, OBSERVE_TIMEOUT_DAYS, strategyPathLabels } from './constants';
import { StrategyPathBreadcrumb } from './StrategyPathBreadcrumb';
import type { RuleEffectivenessRow } from '@/lib/api/rule-effectiveness-view';

interface DetailTableProps {
  rows: RuleEffectivenessRow[];
  isLoading: boolean;
  onViewHits: (row: RuleEffectivenessRow) => void;
  onNavigateToConfig: (row: RuleEffectivenessRow) => void;
}

export function DetailTable({ rows, isLoading, onViewHits, onNavigateToConfig }: DetailTableProps) {
  const t = useTranslations('ruleEffectiveness.detail');
  const tPath = useTranslations('ruleEffectiveness.path');
  const tAction = useTranslations('ruleEffectiveness.wouldBeActions');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const changedValueLabel = (value: unknown): string => {
    switch (value) {
      case 'accept': return tAction('accept');
      case 'quarantine': return tAction('quarantine');
      case 'audit': return tAction('audit');
      case 'reject': return tAction('reject');
      case 'discard': return tAction('discard');
      case 'recall': return tAction('recall');
      case 'proceed': return t('versionHistory.proceed');
      case true: return t('versionHistory.enabled');
      case false: return t('versionHistory.disabled');
      case null:
      case undefined: return t('versionHistory.unset');
      default: return typeof value === 'string' ? value : JSON.stringify(value);
    }
  };

  const changedFieldLabel = (field: string): string => {
    if (field.endsWith('.action')) return t('versionHistory.actionField');
    return field.replace(/^[^.]+\./, '');
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
                    <TableHead className="sticky left-0 bg-card">{t('col.path')}</TableHead>
                    <TableHead>{t('col.observedSince')}</TableHead>
                    <TableHead>{t('col.observedDays')}</TableHead>
                    <TableHead>{t('col.hits')}</TableHead>
                    <TableHead>
                      <UiTooltip>
                        <TooltipTrigger render={<span className="cursor-help underline decoration-dotted">{t('col.falsePositiveRisk')}</span>} />
                        <TooltipContent>{t('tooltip.falsePositiveRisk')}</TooltipContent>
                      </UiTooltip>
                    </TableHead>
                    <TableHead>
                      <UiTooltip>
                        <TooltipTrigger render={<span className="cursor-help underline decoration-dotted">{t('col.falseNegativeRisk')}</span>} />
                        <TooltipContent>{t('tooltip.falseNegativeRisk')}</TooltipContent>
                      </UiTooltip>
                    </TableHead>
                    <TableHead className="sticky right-0 bg-card">{t('col.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const isExpanded = expandedRows.has(row.id);
                    const inferredRiskDirection = row.risk_direction || (
                      ['reject', 'quarantine', 'audit', 'discard'].includes(row.configured_action)
                        ? 'configured_block'
                        : row.configured_action === 'accept' ? 'configured_accept' : ''
                    );
                    const fpRateText = inferredRiskDirection === 'configured_block'
                      ? row.false_positive_rate == null ? t('dataInsufficient') : `${(row.false_positive_rate * 100).toFixed(1)}%`
                      : null;
                    const fnRateText = inferredRiskDirection === 'configured_accept'
                      ? row.false_negative_rate == null ? t('dataInsufficient') : `${(row.false_negative_rate * 100).toFixed(1)}%`
                      : null;
                    const isTimeout = row.observed_days > OBSERVE_TIMEOUT_DAYS;
                    const currentVersionChangeText = row.current_version_changes?.length
                      ? row.current_version_changes.map((change) => t('versionHistory.change', {
                          field: changedFieldLabel(change.field),
                          before: changedValueLabel(change.before),
                          after: changedValueLabel(change.after),
                        })).join(t('versionHistory.changeSeparator'))
                      : row.current_version_change_summary || t('versionHistory.configuration_changed');
                    // The report row is the active version, while /versions deliberately returns
                    // superseded periods only. Combine them for comparison without folding any
                    // historical hit count into the active row or its chart.
                    const displayedVersions = row.version_history.length === 0 ? [] : [
                      {
                        version_no: row.version_no,
                        effective_at: row.backend?.effective_at ?? row.observed_since,
                        superseded_at: null,
                        hits: row.hits,
                        change_summary: t('versionHistory.current'),
                        is_current: true,
                      },
                      ...[...row.version_history]
                        .sort((a, b) => b.version_no - a.version_no)
                        .map((version) => ({ ...version, is_current: false })),
                    ];
                    return (
                      <Fragment key={row.id}>
                        <TableRow key={row.id} data-testid={`rule-effectiveness-row-${row.id}`}>
                          <TableCell>
                            <button type="button" onClick={() => toggleRow(row.id)} aria-label={t('expandRow')}>
                              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </button>
                          </TableCell>
                          <TableCell className="sticky left-0 bg-card max-w-[320px]">
                            {/* 策略路径：与配置页导航层级一致（如「身份认证与仿冒检测 → 基础格式检查 →
                                无效 MAIL FROM」），用户一眼就能定位该去配置页的哪一级处理，
                                不再需要「策略模块」+「子策略/方向名称」两栏拆分。 */}
                            <StrategyPathBreadcrumb segments={strategyPathLabels(row, tPath)} />
                            {row.is_deleted && (
                              <span className="ml-1 text-xs text-muted-foreground">{t('deletedSuffix')}</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <span>{row.observed_since}</span>
                              {row.version_no > 1 && (
                                <UiTooltip>
                                  <TooltipTrigger
                                    render={
                                      <span className="cursor-help rounded border border-border px-1 text-[11px] leading-4 text-muted-foreground">
                                        {t('versionBadge', { version: row.version_no })}
                                      </span>
                                    }
                                  />
                                  <TooltipContent>{t('versionResetTooltip')}</TooltipContent>
                                </UiTooltip>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className={isTimeout ? 'text-warning font-medium' : ''}>
                            {t('daysValue', { days: row.observed_days })}
                          </TableCell>
                          <TableCell>{row.hits}</TableCell>
                          <TableCell data-testid={`rule-effectiveness-fp-risk-${row.id}`}>
                            {fpRateText ?? (
                              <UiTooltip>
                                <TooltipTrigger
                                  render={<span className="cursor-help text-xs text-muted-foreground">{t('notApplicable')}</span>}
                                />
                                <TooltipContent>{t('notApplicableTooltip')}</TooltipContent>
                              </UiTooltip>
                            )}
                          </TableCell>
                          <TableCell data-testid={`rule-effectiveness-fn-risk-${row.id}`}>
                            {fnRateText ?? (
                              <UiTooltip>
                                <TooltipTrigger
                                  render={<span className="cursor-help text-xs text-muted-foreground">{t('notApplicable')}</span>}
                                />
                                <TooltipContent>{t('notApplicableTooltip')}</TooltipContent>
                              </UiTooltip>
                            )}
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
                            <TableCell colSpan={8} className="bg-muted/20">
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
                              {/* 版本记录同时列出当前版本和已结束版本，便于逐版比较。历史版本的
                                  命中数不叠加进上方饼图和当前行 hits，避免污染当前版本统计。 */}
                              <div className="border-t border-border/60 py-2">
                                <div className="mb-1.5 text-xs font-medium text-foreground">{t('versionHistory.title')}</div>
                                {displayedVersions.length === 0 ? (
                                  <span className="text-xs text-muted-foreground">{t('versionHistory.empty')}</span>
                                ) : (
                                  <div className="flex flex-col gap-1.5">
                                    {displayedVersions.map((v) => (
                                      <div
                                        key={v.version_no}
                                        className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
                                        data-testid={`rule-effectiveness-version-${row.id}-${v.version_no}`}
                                      >
                                        <span className="rounded border border-border px-1 text-foreground">
                                          {t('versionBadge', { version: v.version_no })}
                                        </span>
                                        {v.is_current && (
                                          <span className="rounded bg-primary/10 px-1.5 py-0.5 font-medium text-primary">
                                            {t('versionHistory.current')}
                                          </span>
                                        )}
                                        <span>{v.effective_at} → {v.superseded_at ?? '—'}</span>
                                        <span>{t('versionHistory.hits', { count: v.hits })}</span>
                                        <span className="text-foreground/80">
                                          {v.is_current ? currentVersionChangeText : v.change_summary}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
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
