'use client';

import { useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useSecurityOverview } from '@/components/statistics/security-overview/hooks/useSecurityOverview';
import { PRINT_VIEW_BY_OPTIONS } from '@/components/statistics/security-overview/constants';
import type { Direction, ViewBy } from '@/lib/api/security-overview';

const VIEW_BY_OPTIONS = PRINT_VIEW_BY_OPTIONS;

function PrintContent() {
  const t = useTranslations('securityOverview');
  const tPrint = useTranslations('securityOverview.print');
  const params = useSearchParams();

  const startDate = params.get('start_date') ?? '';
  const endDate = params.get('end_date') ?? '';
  const direction = (params.get('direction') ?? 'all') as Direction;
  const tenantParam = params.get('tenant_id');
  const scopeTenantId = tenantParam ? Number(tenantParam) : null;

  // isPending stays true while the scope-readiness gate keeps the query disabled
  // (capabilities not yet loaded) AND while it is actively fetching, so we never
  // flash the "no data" branch before the first request resolves.
  const { data, isPending } = useSecurityOverview({
    startDate,
    endDate,
    direction,

    scopeTenantId,
  });

  useEffect(() => {
    if (data && !isPending) {
      const timer = setTimeout(() => window.print(), 800);
      return () => clearTimeout(timer);
    }
  }, [data, isPending]);

  const directionLabel = direction === 'all' ? t('filter.direction.all')
    : direction === 'receive' ? t('filter.direction.receive')
    : direction === 'send' ? t('filter.direction.send')
    : direction;

  function seriesLabel(key: string, viewBy: ViewBy): string {
    const nsMap: Record<ViewBy, string> = {
      threat_type: 'threatTypes',
      action: 'actions',
      delivery_result: 'deliveryResults',
      email_type: 'emailTypes',
    };
    const result = t(`${nsMap[viewBy]}.${key}` as Parameters<typeof t>[0]);
    return result.includes('.') ? key : result;
  }

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

      <div className="print-root fixed inset-0 z-[9999] overflow-auto bg-white dark:bg-white text-black">
        <div className="mx-auto max-w-5xl px-8 py-10">
          {/* Header */}
          <div className="mb-8 border-b border-gray-200 pb-6">
            <h1 className="text-2xl font-bold text-gray-900">{tPrint('title')}</h1>
            <div className="mt-2 flex flex-wrap gap-6 text-sm text-gray-600">
              <span><span className="font-medium">{tPrint('dateRange')}：</span>{startDate} ~ {endDate}</span>
              <span><span className="font-medium">{tPrint('direction')}：</span>{directionLabel}</span>
              <span><span className="font-medium">{tPrint('generatedAt')}：</span>{new Date().toLocaleString()}</span>
            </div>
          </div>

          {isPending ? (
            <div className="flex h-40 items-center justify-center text-gray-500">{tPrint('loading')}</div>
          ) : !data ? (
            <div className="flex h-40 items-center justify-center text-gray-500">{tPrint('noData')}</div>
          ) : (
            <>
              {/* KPI section */}
              <section className="mb-8">
                <h2 className="mb-4 text-lg font-semibold text-gray-800">{tPrint('kpiSection')}</h2>
                <div className="grid grid-cols-4 gap-4">
                  {[
                    { labelKey: 'totalFiltered', value: data.kpi.total_filtered.toLocaleString() },
                    { labelKey: 'blockRate', value: `${data.kpi.block_rate.toFixed(1)}%` },
                    { labelKey: 'recallRate', value: `${data.kpi.recall_rate.toFixed(1)}%` },
                    { labelKey: 'pendingReview', value: data.kpi.pending_review.toLocaleString() },
                  ].map((card) => (
                    <div key={card.labelKey} className="rounded-lg border border-gray-200 p-4">
                      <div className="text-xs font-medium text-gray-500">
                        {t(`kpi.${card.labelKey}` as Parameters<typeof t>[0])}
                      </div>
                      <div className="mt-1 text-2xl font-bold text-gray-900">{card.value}</div>
                    </div>
                  ))}
                </div>
              </section>

              {/* Trend tables */}
              {VIEW_BY_OPTIONS.map((viewBy) => {
                const rows = data.trend?.[viewBy] ?? [];
                if (rows.length === 0) return null;
                const dynamicKeys = Object.keys(rows[0]).filter((k) => k !== 'date');

                return (
                  <section key={viewBy} className="mb-8">
                    <h2 className="mb-3 text-lg font-semibold text-gray-800">
                      {tPrint('trendSection')} — {t(`viewBy.${viewBy}` as Parameters<typeof t>[0])}
                    </h2>
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr className="bg-gray-50">
                          <th className="border border-gray-200 px-3 py-2 text-left font-medium text-gray-700">
                            {t('table.date')}
                          </th>
                          {dynamicKeys.map((k) => (
                            <th key={k} className="border border-gray-200 px-3 py-2 text-right font-medium text-gray-700">
                              {seriesLabel(k, viewBy)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row, i) => (
                          <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                            <td className="border border-gray-200 px-3 py-2 font-medium text-gray-800">{row.date}</td>
                            {dynamicKeys.map((k) => {
                              const val = row[k];
                              return (
                                <td key={k} className="border border-gray-200 px-3 py-2 text-right tabular-nums text-gray-700">
                                  {typeof val === 'number' ? val.toLocaleString() : (val ?? '—')}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </section>
                );
              })}
            </>
          )}
        </div>
      </div>
    </>
  );
}

export default function PrintPage() {
  return (
    <Suspense fallback={<div className="fixed inset-0 z-[9999] flex items-center justify-center bg-white text-gray-500">Loading...</div>}>
      <PrintContent />
    </Suspense>
  );
}
