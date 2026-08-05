'use client';

import { Fragment, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Flame, TrendingDown, TrendingUp } from 'lucide-react';
import {
  DIMENSION_CONFIG,
  LEFT_PANEL_COLUMNS,
  type DimensionType,
  type LeftColDef,
} from './columns';
import type { OpsTopRow } from '@/lib/api/ops-top';

interface TopTableProps {
  dimension: DimensionType;
  rows: OpsTopRow[];
  total: number;
  expandedKey: string | null;
  onToggleRow: (key: string) => void;
  isLoading?: boolean;
  expandedContent?: (row: OpsTopRow) => ReactNode;
}

const RANK_BADGE: Record<number, string> = {
  1: 'bg-yellow-400 text-yellow-900',
  2: 'bg-gray-300 text-gray-700',
  3: 'bg-orange-400 text-orange-900',
};

// Threat taxonomy per spec §5.7: {normal, spam, suspicious, high_risk_spam,
// phishing, virus}. The backend never emits malware/bec/impersonation.
const THREAT_TYPE_COLOR: Record<string, string> = {
  normal: 'bg-green-50 text-green-700 border-green-200',
  spam: 'bg-gray-100 text-gray-600 border-gray-200',
  suspicious: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  high_risk_spam: 'bg-amber-100 text-amber-700 border-amber-200',
  phishing: 'bg-orange-100 text-orange-700 border-orange-200',
  virus: 'bg-red-100 text-red-700 border-red-200',
};

type TranslationFn = ReturnType<typeof useTranslations>;

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const points = data
    .map((value, index) => {
      const x = (index / (data.length - 1)) * 60;
      const y = 20 - ((value - min) / range) * 16;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg width="60" height="20" className="inline-block" aria-hidden="true">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function progressColors(
  key: string,
  percent: number,
): { bar: string; text: string } {
  if (key === 'failureRate' || key === 'deliveryRate') {
    return {
      bar: percent > 50 ? '#F5222D' : percent > 30 ? '#FAAD14' : '#52C41A',
      text:
        percent > 50
          ? 'text-red-500'
          : percent > 30
            ? 'text-yellow-600'
            : 'text-green-600',
    };
  }
  if (key === 'blockRate') {
    return {
      bar: percent > 70 ? '#52C41A' : percent > 50 ? '#FAAD14' : '#F5222D',
      text:
        percent > 70
          ? 'text-green-600'
          : percent > 50
            ? 'text-yellow-600'
            : 'text-red-500',
    };
  }
  return {
    bar: percent > 10 ? '#F5222D' : percent > 5 ? '#FAAD14' : '#52C41A',
    text:
      percent > 10
        ? 'text-red-500'
        : percent > 5
          ? 'text-yellow-600'
          : 'text-green-600',
  };
}

function alignClass(align: 'left' | 'right' | 'center'): string {
  return align === 'right'
    ? 'text-right'
    : align === 'center'
      ? 'text-center'
      : 'text-left';
}

function CellContent({
  col,
  row,
  dimension,
  t,
}: {
  col: LeftColDef;
  row: OpsTopRow;
  dimension: DimensionType;
  t: TranslationFn;
}) {
  const value = row.metrics[col.key];

  switch (col.type) {
    case 'text': {
      const isIdentifierKey =
        col.key === 'sourceIp' ||
        col.key === 'senderEmail' ||
        col.key === 'recipientEmail' ||
        col.key === 'authAccount';
      if (isIdentifierKey) {
        const textVal = String(value ?? '');
        const isInternal = Boolean(row.metrics.isInternal);
        return (
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger
                render={
                  <span
                    className="max-w-[160px] cursor-help truncate font-mono text-foreground"
                    title={textVal}
                  />
                }
              >
                {textVal}
              </TooltipTrigger>
              <TooltipContent className="max-w-sm break-all">
                <p className="font-mono text-xs">{textVal}</p>
                {col.key === 'sourceIp' && row.metrics.geoLocation ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {row.metrics.geoLocation === 'internal'
                      ? (t('internal') as string)
                      : String(row.metrics.geoLocation)}
                  </p>
                ) : null}
              </TooltipContent>
            </Tooltip>
            {isInternal && col.key === 'sourceIp' ? (
              <Badge
                variant="outline"
                className="border-blue-200 bg-blue-50 px-1 py-0 text-[10px] text-blue-600"
              >
                {t('internal')}
              </Badge>
            ) : null}
          </div>
        );
      }
      if (col.key === 'subjectKeyword') {
        const textVal = String(value ?? '');
        return (
          <Tooltip>
            <TooltipTrigger
              render={
                <span
                  className="block max-w-[196px] cursor-help truncate text-foreground"
                  title={textVal}
                />
              }
            >
              {textVal}
            </TooltipTrigger>
            <TooltipContent className="max-w-md break-all">
              <p>{textVal}</p>
            </TooltipContent>
          </Tooltip>
        );
      }
      if (col.key === 'topSendIps') {
        const ipsVal = String(value ?? '');
        return (
          <Tooltip>
            <TooltipTrigger
              render={
                <span
                  className="block max-w-[106px] cursor-help truncate font-mono text-xs text-muted-foreground"
                  title={ipsVal}
                />
              }
            >
              {ipsVal}
            </TooltipTrigger>
            <TooltipContent className="max-w-xs break-all">
              <p className="font-mono text-xs">{ipsVal}</p>
            </TooltipContent>
          </Tooltip>
        );
      }
      if (col.key === 'senderDomain' || col.key === 'recipientDomain') {
        const domainVal = String(value ?? '');
        return (
          <Tooltip>
            <TooltipTrigger
              render={
                <span
                  className="block max-w-[126px] cursor-help truncate text-xs text-muted-foreground"
                  title={domainVal}
                />
              }
            >
              {domainVal}
            </TooltipTrigger>
            <TooltipContent className="max-w-xs break-all">
              <p className="text-xs">{domainVal}</p>
            </TooltipContent>
          </Tooltip>
        );
      }
      if (
        col.key.includes('first') ||
        col.key.includes('last') ||
        col.key.includes('First') ||
        col.key.includes('Last')
      ) {
        return (
          <span className="text-xs text-muted-foreground">
            {String(value ?? '-')}
          </span>
        );
      }
      return <span className="text-foreground">{String(value ?? '-')}</span>;
    }

    case 'number': {
      const numVal = Number(value) || 0;
      if (col.key === 'successCount') {
        return (
          <span className="font-medium text-green-600">
            {numVal.toLocaleString()}
          </span>
        );
      }
      if (
        col.key === 'failureCount' ||
        col.key === 'threatCount' ||
        col.key === 'attackCount'
      ) {
        return (
          <span
            className={`font-medium ${numVal > 0 ? 'text-red-500' : 'text-muted-foreground'}`}
          >
            {numVal.toLocaleString()}
          </span>
        );
      }
      if (col.key === 'bounceCount') {
        return (
          <span
            className={`font-medium ${numVal > 0 ? 'text-yellow-600' : 'text-muted-foreground'}`}
          >
            {numVal.toLocaleString()}
          </span>
        );
      }
      return (
        <span className="font-medium text-foreground">
          {numVal.toLocaleString()}
        </span>
      );
    }

    case 'badge': {
      if (col.key === 'geoLocation') {
        const geo = String(value ?? '');
        const isInternalGeo = geo === 'internal';
        // 当来源IP列已展示"内网"标签时，地理位置列不再重复显示，
        // 内网地址本身无地理位置含义，以 "-" 占位。
        if (isInternalGeo && Boolean(row.metrics.isInternal)) {
          return <span className="text-muted-foreground">-</span>;
        }
        return (
          <Badge
            variant="outline"
            className={`px-1 py-0 text-[10px] ${isInternalGeo ? 'border-blue-200 bg-blue-50 text-blue-600' : 'border-border/70 bg-muted/40 text-muted-foreground'}`}
          >
            {isInternalGeo ? (t('internal') as string) : geo.split(' ')[0]}
          </Badge>
        );
      }
      if (col.key === 'relatedThreatType' || col.key === 'mainThreatType') {
        // Backend writes "" when an object has no threat (all-normal); spec §5.7
        // requires it to render as "正常"/normal.
        const threatType = String(value || 'normal');
        return (
          <Badge
            variant="outline"
            className={`px-1 py-0 text-[10px] ${THREAT_TYPE_COLOR[threatType] ?? 'bg-muted/40 text-muted-foreground'}`}
          >
            {t(threatType as Parameters<typeof t>[0])}
          </Badge>
        );
      }
      if (col.key === 'failReason') {
        if (!value) return <span className="text-muted-foreground">-</span>;
        // failure_reason is free text from authd, not an enum — render verbatim.
        return (
          <Badge
            variant="outline"
            className="border-red-200 bg-red-50 px-1 py-0 text-[10px] text-red-600"
          >
            {String(value)}
          </Badge>
        );
      }
      if (col.key === 'bruteForce') {
        if (!value) return <span className="text-muted-foreground">-</span>;
        return (
          <Badge variant="destructive" className="px-1 py-0 text-[10px]">
            {t('bruteForceTag')}
          </Badge>
        );
      }
      if (col.key === 'department') {
        const dept = value != null && String(value).length > 0 ? String(value) : 'external';
        const isExternal = dept === 'external';
        return (
          <Badge
            variant="outline"
            className={`px-1 py-0 text-[10px] ${isExternal ? 'bg-muted/40 text-muted-foreground' : 'border-green-200 bg-green-50 text-green-600'}`}
          >
            {isExternal ? (t('external') as string) : dept}
          </Badge>
        );
      }
      return <span>{String(value ?? '-')}</span>;
    }

    case 'progress': {
      const percent = Number(value) || 0;
      const { bar, text } = progressColors(col.key, percent);
      return (
        <div className="flex items-center gap-1">
          <div className="h-1.5 w-12 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.min(percent, 100)}%`,
                backgroundColor: bar,
              }}
            />
          </div>
          <span className={`text-xs ${text}`}>{percent}%</span>
        </div>
      );
    }

    case 'change': {
      if (row.changePercent === null) {
        return (
          <div className="flex justify-end">
            <Badge
              variant="outline"
              className="border-blue-200 bg-blue-50 px-1 py-0 text-[10px] text-blue-600"
            >
              {t('changeNew')}
            </Badge>
          </div>
        );
      }
      const pct = row.changePercent;
      return (
        <div
          className={`flex items-center justify-end gap-1 ${pct > 0 ? 'text-red-500' : pct < 0 ? 'text-green-500' : 'text-muted-foreground'}`}
        >
          {pct > 0 ? (
            <TrendingUp className="h-3 w-3" />
          ) : pct < 0 ? (
            <TrendingDown className="h-3 w-3" />
          ) : null}
          <span className="text-xs">
            {pct > 0 ? '+' : ''}
            {pct}%
          </span>
        </div>
      );
    }

    case 'sparkline': {
      if (!row.trend || row.trend.length === 0) return null;
      return (
        <Sparkline data={row.trend} color={DIMENSION_CONFIG[dimension].color} />
      );
    }

    default:
      return <span>{String(value ?? '-')}</span>;
  }
}

export function TopTable({
  dimension,
  rows,
  total,
  expandedKey,
  onToggleRow,
  isLoading,
  expandedContent,
}: TopTableProps) {
  const t = useTranslations('opsTopTrend');
  const cols = LEFT_PANEL_COLUMNS[dimension];
  const visibleRows = rows;
  const showPartial = total > visibleRows.length;
  const colCount = cols.length + 1;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/60">
            <th className="w-10 px-2 py-2 text-left font-medium text-muted-foreground">
              #
            </th>
            {cols.map((col) => (
              <Tooltip key={col.key}>
                <TooltipTrigger
                  render={
                    <th
                      className={`px-2 py-2 font-medium text-muted-foreground whitespace-nowrap cursor-help ${alignClass(col.align)}`}
                      style={{ width: col.width, minWidth: col.width }}
                    />
                  }
                >
                  {t(col.labelKey as Parameters<typeof t>[0])}
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <p>{t(col.tipKey as Parameters<typeof t>[0])}</p>
                </TooltipContent>
              </Tooltip>
            ))}
          </tr>
        </thead>
        <tbody>
          {isLoading
            ? Array.from({ length: 8 }).map((_, i) => (
                <tr key={`sk-${i}`} className="border-b border-border/40">
                  <td colSpan={colCount} className="px-2 py-2">
                    <Skeleton className="h-8 w-full rounded-lg" />
                  </td>
                </tr>
              ))
            : visibleRows.map((row) => {
                // Demo-shaped fixtures can repeat the same sender/recipient
                // identifier in a TOP set, while auth also shares key=ip across
                // accounts. Include the display name and rank so React always
                // reconciles one row to one DOM node during rapid dimension
                // switches (and expansion state remains unambiguous).
                const rowId = `${row.key}\x1F${row.name}\x1F${row.rank}`;
                const isExpanded = expandedKey === rowId;
                return (
                  <Fragment key={rowId}>
                    <tr
                      onClick={(e) => {
                        const willExpand = !isExpanded;
                        onToggleRow(rowId);
                        if (willExpand) {
                          e.currentTarget.scrollIntoView({
                            block: 'nearest',
                            behavior: 'smooth',
                          });
                        }
                      }}
                      className={`cursor-pointer border-b border-border/40 transition-colors ${
                        isExpanded
                          ? 'bg-primary/5'
                          : row.isSpike
                            ? 'bg-orange-50 dark:bg-orange-900/10'
                            : 'hover:bg-muted/40'
                      }`}
                    >
                      <td className="px-2 py-[7.6px]">
                        <div className="flex items-center gap-1">
                          {/* 固定宽度占位槽，保证排名徽标始终左对齐 */}
                          <span className="inline-flex w-3 shrink-0 items-center justify-center">
                            {row.isSpike ? (
                              <Flame className="h-3 w-3 text-orange-500" />
                            ) : null}
                          </span>
                          <span
                            className={`inline-flex h-5 w-5 items-center justify-center rounded text-xs font-medium ${RANK_BADGE[row.rank] ?? 'bg-muted text-muted-foreground'}`}
                          >
                            {row.rank}
                          </span>
                        </div>
                      </td>
                      {cols.map((col) => (
                        <td
                          key={col.key}
                          className={`px-2 py-[7.6px] ${alignClass(col.align)}`}
                        >
                          <CellContent
                            col={col}
                            row={row}
                            dimension={dimension}
                            t={t}
                          />
                        </td>
                      ))}
                    </tr>
                    {isExpanded && expandedContent ? (
                      <tr>
                        <td colSpan={colCount} className="p-0">
                          {expandedContent(row)}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
        </tbody>
      </table>
      {showPartial ? (
        <div className="mt-4 text-center text-sm text-muted-foreground">
          {t('showingPartial', { shown: visibleRows.length, total })}
        </div>
      ) : null}
    </div>
  );
}
