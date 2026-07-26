'use client';

import { useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/contexts/auth-context';
import { useOpsTop } from '@/components/statistics/ops-top-trend/hooks/useOpsTop';
import {
  computeIsPlatformScope,
  effectiveDimension,
} from '@/components/statistics/ops-top-trend/scope';
import {
  DIMENSION_CONFIG,
  LEFT_PANEL_COLUMNS,
  type DimensionType,
  type LeftColDef,
} from '@/components/statistics/ops-top-trend/columns';
import type {
  OpsDirection,
  OpsTimeRange,
  OpsTopCount,
  OpsTopRow,
} from '@/lib/api/ops-top';

const VALID_DIMENSIONS: DimensionType[] = [
  'connection',
  'auth',
  'sendIp',
  'subject',
  'sender',
  'recipient',
];
const VALID_DIRECTIONS: OpsDirection[] = ['all', 'receive', 'send', 'internal'];
const VALID_TIME_RANGES: OpsTimeRange[] = [
  'today',
  '7d',
  '30d',
  'thisMonth',
  'lastMonth',
];
const VALID_TOPS: OpsTopCount[] = ['10', '50', '100'];

function TrendSvg({ data, color }: { data: number[]; color: string }) {
  if (!data || data.length === 0) return <span className="text-gray-400">—</span>;
  const w = 64;
  const h = 20;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const step = data.length > 1 ? w / (data.length - 1) : w;
  const points = data
    .map((v, i) => `${(i * step).toFixed(1)},${(h - ((v - min) / range) * h).toFixed(1)}`)
    .join(' ');
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} />
    </svg>
  );
}

function formatMetric(col: LeftColDef, value: unknown): string {
  if (value == null || value === '') return '—';
  switch (col.type) {
    case 'number': {
      const n = Number(value);
      return Number.isFinite(n) ? n.toLocaleString() : String(value);
    }
    case 'progress': {
      // Backend returns integer percentages; match the main table's "16%" form.
      const n = Number(value);
      return Number.isFinite(n) ? `${Math.round(n)}%` : String(value);
    }
    case 'change':
      return String(value);
    default:
      return String(value);
  }
}

function formatChange(row: OpsTopRow): string {
  if (row.changePercent === null) return '';
  const pct = row.changePercent;
  return `${pct > 0 ? '+' : ''}${pct}%`;
}

function PrintContent() {
  const t = useTranslations('opsTopTrend');
  const tPrint = useTranslations('opsTopTrend.print');
  const params = useSearchParams();

  const dimensionParam = params.get('dimension') ?? 'connection';
  const directionParam = params.get('direction') ?? 'all';
  const timeRangeParam = params.get('time_range') ?? '7d';
  const topParam = params.get('top') ?? '10';

  const { isSystemAdmin, selectedTenantId } = useAuth();
  const isPlatformScope = computeIsPlatformScope(isSystemAdmin, selectedTenantId);

  // Same normalization as the main page: a hand-typed / bookmarked
  // `?dimension=connection` from a tenant-scoped viewer must not turn into a
  // 403 request that renders as an ambiguous empty print sheet.
  const dimension = effectiveDimension(
    (VALID_DIMENSIONS.includes(dimensionParam as DimensionType)
      ? dimensionParam
      : 'connection') as DimensionType,
    isPlatformScope,
  );
  const direction = (
    VALID_DIRECTIONS.includes(directionParam as OpsDirection) ? directionParam : 'all'
  ) as OpsDirection;
  const timeRange = (
    VALID_TIME_RANGES.includes(timeRangeParam as OpsTimeRange) ? timeRangeParam : '7d'
  ) as OpsTimeRange;
  const top = (
    VALID_TOPS.includes(topParam as OpsTopCount) ? topParam : '10'
  ) as OpsTopCount;

  const { data, isLoading } = useOpsTop({ dimension, direction, timeRange, top });

  useEffect(() => {
    if (data && !isLoading) {
      const timer = setTimeout(() => window.print(), 800);
      return () => clearTimeout(timer);
    }
  }, [data, isLoading]);

  const dimConfig = DIMENSION_CONFIG[dimension];
  const allCols = LEFT_PANEL_COLUMNS[dimension];
  const dataCols = allCols
    .filter((c) => c.type !== 'change' && c.type !== 'sparkline')
    .slice(0, 6);
  const changeCol = allCols.find((c) => c.type === 'change');
  const trendCol = allCols.find((c) => c.type === 'sparkline');
  const cols = [...dataCols, ...([changeCol, trendCol].filter(Boolean) as LeftColDef[])];

  const dimensionLabel = t(dimConfig.labelKey as Parameters<typeof t>[0]);
  const directionLabel = t(`direction.${direction}` as Parameters<typeof t>[0]);
  const timeRangeLabel = t(`timeRange.${timeRange}` as Parameters<typeof t>[0]);

  return (
    <>
      <style>{`
        @media print {
          aside, header, nav, [data-sidebar], .no-print { display: none !important; }
          .print-root { position: static !important; inset: auto !important; overflow: visible !important; }
          body { background: white !important; }
          @page { margin: 1.5cm; }
        }
      `}</style>

      <div className="print-root fixed inset-0 z-[9999] overflow-auto bg-white text-black dark:bg-white dark:text-black">
        <div className="mx-auto max-w-5xl px-8 py-10">
          <div className="mb-8 border-b border-gray-200 pb-6">
            <h1 className="text-2xl font-bold text-gray-900">{tPrint('title')}</h1>
            <div className="mt-2 flex flex-wrap gap-6 text-sm text-gray-600">
              <span>
                <span className="font-medium">{tPrint('dimension')}：</span>
                {dimensionLabel}
              </span>
              <span>
                <span className="font-medium">{tPrint('direction')}：</span>
                {directionLabel}
              </span>
              <span>
                <span className="font-medium">{tPrint('timeRange')}：</span>
                {timeRangeLabel}
              </span>
              <span>
                <span className="font-medium">{tPrint('top')}：</span>TOP {top}
              </span>
              <span>
                <span className="font-medium">{tPrint('generatedAt')}：</span>
                {new Date().toLocaleString()}
              </span>
            </div>
          </div>

          {isLoading || !data || data.rows.length === 0 ? (
            <div className="flex h-40 items-center justify-center text-gray-500">
              {tPrint('noData')}
            </div>
          ) : (
            <section>
              <h2 className="mb-3 text-lg font-semibold text-gray-800">
                {tPrint('topSection')}
              </h2>
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="border border-gray-200 px-3 py-2 text-center font-medium text-gray-700">
                      #
                    </th>
                    {cols.map((col) => (
                      <th
                        key={col.key}
                        className={`border border-gray-200 px-3 py-2 font-medium text-gray-700 ${
                          col.align === 'right'
                            ? 'text-right'
                            : col.align === 'center'
                              ? 'text-center'
                              : 'text-left'
                        }`}
                      >
                        {t(col.labelKey as Parameters<typeof t>[0])}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row, i) => (
                    <tr
                      key={`${row.key}\x1F${row.name}\x1F${row.rank}`}
                      className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}
                    >
                      <td className="border border-gray-200 px-3 py-2 text-center tabular-nums text-gray-700">
                        {row.rank}
                      </td>
                      {cols.map((col) => (
                        <td
                          key={col.key}
                          className={`border border-gray-200 px-3 py-2 tabular-nums text-gray-700 ${
                            col.align === 'right'
                              ? 'text-right'
                              : col.align === 'center'
                                ? 'text-center'
                                : 'text-left'
                          }`}
                        >
                          {col.type === 'change' ? (
                            <span
                              className={
                                row.changePercent === null
                                  ? 'text-blue-600'
                                  : row.changePercent > 0
                                    ? 'text-red-600'
                                    : row.changePercent < 0
                                      ? 'text-green-600'
                                      : 'text-gray-500'
                              }
                            >
                              {row.changePercent === null
                                ? t('changeNew' as Parameters<typeof t>[0])
                                : formatChange(row)}
                            </span>
                          ) : col.type === 'sparkline' ? (
                            <TrendSvg data={row.trend} color={dimConfig.color} />
                          ) : (
                            formatMetric(col, row.metrics[col.key])
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-4 text-xs text-gray-400">{tPrint('printHint')}</p>
            </section>
          )}
        </div>
      </div>
    </>
  );
}

export default function PrintPage() {
  return (
    <Suspense
      fallback={
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-white text-gray-500">
          Loading...
        </div>
      }
    >
      <PrintContent />
    </Suspense>
  );
}
