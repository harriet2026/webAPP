'use client';

import { Fragment, useState } from 'react';
import { useTranslations } from 'next-intl';
import ReactECharts from 'echarts-for-react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { ServerPagination } from '@/components/shared/server-pagination';
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
import { actionColor, isPendingPromotion, strategyPathLabels } from './constants';
import { StrategyPathBreadcrumb } from './StrategyPathBreadcrumb';
import type {
  ChangeDetailsUnavailableReason,
  PolicyVersionFieldChange,
  RuleEffectivenessRow,
} from '@/lib/api/rule-effectiveness-view';
import { formatTimestamp } from '@/lib/format-time';
import { versionFieldLabelKey, versionHeaderMarkEntries, versionValueLabelKey, type VersionFieldLabelKey } from './version_history_labels';

const MARK_TEXT_FIELDS: ReadonlySet<VersionFieldLabelKey> = new Set([
  'subjectMarkContent', 'subjectPrefixMarkContent', 'subjectSuffixMarkContent',
  'bodyMarkContent', 'bodyPrefixMarkContent', 'bodySuffixMarkContent', 'headerName', 'headerValue',
]);

// GT-14343：版本起止时间按客户端时区显示为 yyyy-MM-dd HH:mm:ss（与 GT-11971 统一口径），
// 不暴露 T / 微秒 / Z。仅有日期的值（当前版本回退到 observed_since、原型 Mock）原样显示，
// 不编造 00:00:00；无法解析时保留原值而不是吞掉。
function formatVersionTime(value: string | null | undefined): string {
  if (!value) return '—';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return formatTimestamp(value) || value;
}

interface DetailTableProps {
  rows: RuleEffectivenessRow[];
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    onPageChange: (page: number) => void;
    onPageSizeChange: (pageSize: number) => void;
  };
  isLoading: boolean;
  onViewHits: (row: RuleEffectivenessRow) => void;
  onNavigateToConfig: (row: RuleEffectivenessRow) => void;
}

export function DetailTable({ rows, pagination, isLoading, onViewHits, onNavigateToConfig }: DetailTableProps) {
  const t = useTranslations('ruleEffectiveness.detail');
  const tVersionLabels = useTranslations('ruleEffectiveness.detail.versionHistoryLabels');
  const tPath = useTranslations('ruleEffectiveness.path');
  const tAuth = useTranslations('authSpoofing');
  const tAction = useTranslations('ruleEffectiveness.wouldBeActions');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const changedValueLabel = (value: unknown, field?: string): string => {
    const labelKey = field ? versionFieldLabelKey(field) : undefined;
    // Mark text is administrator input, even when it happens to spell an enum.
    if (typeof value === 'string' && labelKey && MARK_TEXT_FIELDS.has(labelKey)) return value;
    if (labelKey === 'headerMarks') {
      const headers = versionHeaderMarkEntries(value);
      if (headers) {
        return headers.length === 0 ? t('versionHistory.unset')
          : headers.map((header) => tVersionLabels('headerMarkEntry', header)).join(tVersionLabels('valueSeparator'));
      }
    }
    if (Array.isArray(value)) {
      return value.map((item) => changedValueLabel(item)).join(tVersionLabels('valueSeparator'));
    }
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
      default: {
        // ConfigurationDiff normally emits scalar leaves. If a newly added or
        // removed subtree arrives as an object, do not leak its internal keys.
        if (typeof value === 'object') return tVersionLabels('configuredValue');
        if (typeof value !== 'string') return String(value);
        const valueKey = versionValueLabelKey(value);
        return valueKey ? tVersionLabels(`valueLabels.${valueKey}`) : value;
      }
    }
  };

  const changedFieldLabel = (field: string): string => {
    const labelKey = versionFieldLabelKey(field);
    // Keep the established action label key for compatibility with the
    // existing version-history contract; every other field uses the registry.
    return labelKey === 'action'
      ? t('versionHistory.actionField')
      : tVersionLabels(`fieldLabels.${labelKey}`);
  };

  const unavailableReasonLabel = (reason: ChangeDetailsUnavailableReason): string => {
    switch (reason) {
      case 'snapshot_unavailable': return t('versionHistory.unavailable.snapshot');
      case 'access_denied': return t('versionHistory.unavailable.accessDenied');
      case 'version_not_found': return t('versionHistory.unavailable.notFound');
      case 'difference_unavailable': return t('versionHistory.unavailable.difference');
      default: return t('versionHistory.unavailable.loadFailed');
    }
  };

  const changeDetailsText = (
    changes: PolicyVersionFieldChange[] | undefined,
    summary: string,
    unavailableReason?: ChangeDetailsUnavailableReason,
  ): string => {
    if (unavailableReason) return unavailableReasonLabel(unavailableReason);
    if (!changes?.length) return summary;
    return changes.map((change) => t('versionHistory.change', {
      field: changedFieldLabel(change.field),
      before: changedValueLabel(change.before, change.field),
      after: changedValueLabel(change.after, change.field),
    })).join(t('versionHistory.changeSeparator'));
  };

  return (
    <Card data-testid="rule-effectiveness-detail-table">
      <CardHeader className="flex flex-row items-center gap-3">
        <CardTitle className="text-base">{t('title')}</CardTitle>
        {!isLoading && (
          <span className="rounded-md bg-info/10 px-2 py-0.5 text-xs text-info" data-testid="rule-effectiveness-observing-total">
            {t('observingTotal', { count: pagination?.total ?? rows.length })}
          </span>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[240px] w-full" data-testid="rule-effectiveness-loading-state" />
        ) : rows.length === 0 ? (
          <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground" data-testid="rule-effectiveness-empty-state">
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
                    // The backend owns risk validity. Any non-empty reason means
                    // neither direction nor a supplied percentage is trustworthy.
                    const isRiskUnavailable = Boolean(row.risk_unavailable_reason?.trim());
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
                    const isTimeout = isPendingPromotion(row);
                    const currentVersionChangeText = changeDetailsText(
                      row.current_version_changes,
                      row.current_version_change_summary || t('versionHistory.configuration_changed'),
                      row.current_version_change_unavailable_reason,
                    );
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
                        changed_fields: row.current_version_changes,
                        change_details_unavailable_reason: row.current_version_change_unavailable_reason,
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
                            <button type="button" onClick={() => toggleRow(row.id)} aria-label={t('expandRow')} aria-expanded={isExpanded} data-testid={`rule-effectiveness-expand-${row.id}`}>
                              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </button>
                          </TableCell>
                          <TableCell className="sticky left-0 bg-card max-w-[320px]">
                            {/* 策略路径：与配置页导航层级一致（如「身份认证与仿冒检测 → 基础格式检查 →
                                无效 MAIL FROM」），用户一眼就能定位该去配置页的哪一级处理，
                                不再需要「策略模块」+「子策略/方向名称」两栏拆分。 */}
                            <StrategyPathBreadcrumb segments={strategyPathLabels(row, tPath, tAuth)} />
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
                          <TableCell data-testid={`rule-effectiveness-hits-${row.id}`}>
                            {row.hits}
                          </TableCell>
                          <TableCell data-testid={`rule-effectiveness-fp-risk-${row.id}`}>
                            {isRiskUnavailable ? '—' : fpRateText ?? (
                              <UiTooltip>
                                <TooltipTrigger
                                  render={<span className="cursor-help text-xs text-muted-foreground" data-testid={`rule-effectiveness-risk-na-trigger-${row.id}-fp`}>{t('notApplicable')}</span>}
                                />
                                <TooltipContent>{t('notApplicableTooltip')}</TooltipContent>
                              </UiTooltip>
                            )}
                          </TableCell>
                          <TableCell data-testid={`rule-effectiveness-fn-risk-${row.id}`}>
                            {isRiskUnavailable ? '—' : fnRateText ?? (
                              <UiTooltip>
                                <TooltipTrigger
                                  render={<span className="cursor-help text-xs text-muted-foreground" data-testid={`rule-effectiveness-risk-na-trigger-${row.id}-fn`}>{t('notApplicable')}</span>}
                                />
                                <TooltipContent>{t('notApplicableTooltip')}</TooltipContent>
                              </UiTooltip>
                            )}
                          </TableCell>
                          <TableCell className="sticky right-0 bg-card">
                            <div className="flex items-center gap-2">
                              <Button variant="outline" size="sm" onClick={() => onViewHits(row)} data-testid={`rule-effectiveness-view-hits-${row.id}`}>
                                {t('viewHits')}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={row.is_deleted}
                                title={row.is_deleted ? t('deletedTooltip') : undefined}
                                onClick={() => onNavigateToConfig(row)}
                                data-testid={`rule-effectiveness-go-config-${row.id}`}
                              >
                                {t('goToConfig')}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                        {isExpanded && (
                          <TableRow key={`${row.id}-expanded`}>
                            <TableCell colSpan={8} className="bg-muted/20 whitespace-normal">
                              {/* GT-14371：详情内容不参与列宽计算（w-0 + min-w-full 铺满单元格），长文本在
                                  详情区内换行，展开前后各列宽度不变，风险列不会被挤出可视区。 */}
                              <div
                                className="w-0 min-w-full"
                                data-testid={`rule-effectiveness-action-breakdown-${row.id}`}
                              >
                                <div
                                  className="grid min-w-0 gap-4 py-2 md:grid-cols-[minmax(320px,420px)_minmax(0,1fr)] md:items-center"
                                  data-testid={`rule-effectiveness-action-distribution-${row.id}`}
                                >
                                  {row.action_breakdown.length === 0 ? (
                                    <span className="text-sm text-muted-foreground">{t('empty')}</span>
                                  ) : (
                                    <>
                                      <div
                                        className="min-w-0 w-full max-w-full overflow-hidden [&>div]:!w-full [&_canvas]:!max-w-full"
                                        data-testid={`rule-effectiveness-action-chart-${row.id}`}
                                      >
                                        <ReactECharts
                                          className="min-w-0 w-full max-w-full"
                                          data-testid={`rule-effectiveness-action-echart-${row.id}`}
                                          option={{
                                            tooltip: { trigger: 'item' },
                                            series: [{
                                              type: 'pie',
                                              radius: ['32%', '58%'],
                                              center: ['50%', '50%'],
                                              avoidLabelOverlap: true,
                                              label: {
                                                show: true,
                                                position: 'outside',
                                                alignTo: 'edge',
                                                edgeDistance: 12,
                                                bleedMargin: 4,
                                                distanceToLabelLine: 4,
                                                formatter: '{b}',
                                                fontSize: 12,
                                                overflow: 'break',
                                                width: 80,
                                              },
                                              labelLine: {
                                                show: true,
                                                length: 12,
                                                length2: 8,
                                                smooth: 0.2,
                                              },
                                              labelLayout: {
                                                hideOverlap: false,
                                                moveOverlap: 'shiftY',
                                              },
                                              data: row.action_breakdown.map((b) => ({
                                                name: tAction(b.action),
                                                value: b.count,
                                                itemStyle: { color: actionColor(b.action) },
                                              })),
                                            }],
                                          }}
                                          style={{ height: 224, width: '100%' }}
                                        />
                                      </div>
                                      <div
                                        className="flex min-w-0 flex-wrap gap-x-3 gap-y-2 text-xs text-muted-foreground"
                                        data-testid={`rule-effectiveness-action-legend-${row.id}`}
                                      >
                                        {row.action_breakdown.map((b) => (
                                          <div
                                            key={b.action}
                                            className="flex items-center gap-1.5 whitespace-nowrap"
                                            data-testid={`rule-effectiveness-action-${row.id}-${b.action}`}
                                          >
                                            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: actionColor(b.action) }} />
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
                                          <span>{formatVersionTime(v.effective_at)} → {formatVersionTime(v.superseded_at)}</span>
                                          <span>{t('versionHistory.hits', { count: v.hits })}</span>
                                          <span
                                            data-testid={`rule-effectiveness-change-summary-${row.id}-${v.version_no}`}
                                            className="text-foreground/80 [overflow-wrap:anywhere]"
                                          >
                                            {v.is_current
                                              ? currentVersionChangeText
                                              : changeDetailsText(v.changed_fields, v.change_summary, v.change_details_unavailable_reason)}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
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
        {!isLoading && pagination && pagination.total > 0 && (
          <div className="mt-4">
            <ServerPagination {...pagination} testId="rule-effectiveness-detail-pagination" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
