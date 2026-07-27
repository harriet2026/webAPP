'use client';

import { useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useLinkAttachmentStats } from '@/components/statistics/link-attachment-security/hooks/useLinkAttachmentStats';
import type { Direction } from '@/lib/api/link-attachment-security';
import { LINK_DETAIL_KEYS, ATTACHMENT_DETAIL_KEYS } from '@/components/statistics/link-attachment-security/colors';
import { useTenant } from '@/hooks/use-tenant';

function PrintContent() {
  const t = useTranslations('linkAttachmentSecurity');
  const params = useSearchParams();
  const { effectiveTenantId } = useTenant();

  const startDate = params.get('start_date') ?? '';
  const endDate = params.get('end_date') ?? '';
  const direction = (params.get('direction') ?? 'all') as Direction;
  // spec §4.10: route query must restore direction / timeRange / view_tab /
  // chart_type / expanded_rows so the printed layout matches what the user saw.
  const viewTab = (params.get('view_tab') === 'attachment' ? 'attachment' : 'link') as 'link' | 'attachment';
  const chartType = params.get('chart_type') === 'area' ? 'area' : 'line';

  const { data, isLoading } = useLinkAttachmentStats({ startDate, endDate, direction, tenantId: effectiveTenantId ?? null });

  useEffect(() => {
    if (data && !isLoading) {
      const timer = setTimeout(() => window.print(), 800);
      return () => clearTimeout(timer);
    }
  }, [data, isLoading]);

  const directionLabel = t(`direction.${direction}`);
  const chartTypeLabel = t(`chartType.${chartType}`);
  const viewTabLabel = t(`tabs.${viewTab}`);
  const showLinkSection = viewTab === 'link';
  const showAttachmentSection = viewTab === 'attachment';

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
          <div className="mb-8 border-b border-gray-200 pb-6">
            <h1 className="text-2xl font-bold text-gray-900">{t('title')}</h1>
            <div className="mt-2 flex flex-wrap gap-6 text-sm text-gray-600">
              <span><span className="font-medium">{t('print.dateRange')}:</span> {startDate} ~ {endDate}</span>
              <span><span className="font-medium">{t('print.direction')}:</span> {directionLabel}</span>
              <span><span className="font-medium">{t('print.view')}:</span> {viewTabLabel}</span>
              <span><span className="font-medium">{t('print.chart')}:</span> {chartTypeLabel}</span>
              <span><span className="font-medium">{t('print.generated')}:</span> {new Date().toLocaleString()}</span>
            </div>
          </div>

          {isLoading ? (
            <div className="flex h-40 items-center justify-center text-gray-500">{t('print.loading')}</div>
          ) : !data ? (
            <div className="flex h-40 items-center justify-center text-gray-500">{t('print.noData')}</div>
          ) : (
            <>
              <section className="mb-8">
                <h2 className="mb-4 text-lg font-semibold text-gray-800">{t('print.kpi')}</h2>
                <div className="grid grid-cols-4 gap-4">
                  {[
                    { label: t('kpi.totalLinkMail'), value: data.kpi.total_link_mail.toLocaleString() },
                    { label: t('kpi.linkDetectionRate'), value: `${data.kpi.link_detection_rate.toFixed(1)}%` },
                    { label: t('kpi.totalAttachmentMail'), value: data.kpi.total_attachment_mail.toLocaleString() },
                    { label: t('kpi.attachmentDetectionRate'), value: `${data.kpi.attachment_detection_rate.toFixed(1)}%` },
                  ].map((card) => (
                    <div key={card.label} className="rounded-lg border border-gray-200 p-4">
                      <div className="text-xs font-medium text-gray-500">{card.label}</div>
                      <div className="mt-1 text-2xl font-bold text-gray-900">{card.value}</div>
                    </div>
                  ))}
                </div>
              </section>

              {showLinkSection && (
              <section className="mb-8">
                <h2 className="mb-3 text-lg font-semibold text-gray-800">{t('tabs.link')}</h2>
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="border border-gray-200 px-3 py-2 text-left font-medium text-gray-700">{t('print.date')}</th>
                      <th className="border border-gray-200 px-3 py-2 text-right font-medium text-gray-700">{t('table.totalLinkMail')}</th>
                      <th className="border border-gray-200 px-3 py-2 text-right font-medium text-gray-700">{t('table.safeLinkMail')}</th>
                      <th className="border border-gray-200 px-3 py-2 text-right font-medium text-gray-700">{t('table.maliciousLinkMail')}</th>
                      {LINK_DETAIL_KEYS.map((k) => (
                        <th key={k} className="border border-gray-200 px-3 py-2 text-right font-medium text-gray-700">{t(`linkType.${k}`)}</th>
                      ))}
                      <th className="border border-gray-200 px-3 py-2 text-right font-medium text-gray-700">{t('table.blockRate')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.detail_table?.link ?? []).map((row, i) => (
                      <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="border border-gray-200 px-3 py-2 font-medium text-gray-800">{row.date}</td>
                        <td className="border border-gray-200 px-3 py-2 text-right tabular-nums text-gray-700">{row.total_link_mail.toLocaleString()}</td>
                        <td className="border border-gray-200 px-3 py-2 text-right tabular-nums text-gray-700">{row.safe_link_mail.toLocaleString()}</td>
                        <td className="border border-gray-200 px-3 py-2 text-right tabular-nums text-gray-700">{row.malicious_link_mail.toLocaleString()}</td>
                        {LINK_DETAIL_KEYS.map((k) => (
                          <td key={k} className="border border-gray-200 px-3 py-2 text-right tabular-nums text-gray-700">{row[k]}</td>
                        ))}
                        <td className="border border-gray-200 px-3 py-2 text-right tabular-nums text-gray-700">{row.block_rate.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
              )}

              {showAttachmentSection && (
              <section className="mb-8">
                <h2 className="mb-3 text-lg font-semibold text-gray-800">{t('tabs.attachment')}</h2>
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="border border-gray-200 px-3 py-2 text-left font-medium text-gray-700">{t('print.date')}</th>
                      <th className="border border-gray-200 px-3 py-2 text-right font-medium text-gray-700">{t('table.totalAttachmentMail')}</th>
                      <th className="border border-gray-200 px-3 py-2 text-right font-medium text-gray-700">{t('table.safeAttachmentMail')}</th>
                      <th className="border border-gray-200 px-3 py-2 text-right font-medium text-gray-700">{t('table.maliciousAttachmentMail')}</th>
                      {ATTACHMENT_DETAIL_KEYS.map((k) => (
                        <th key={k} className="border border-gray-200 px-3 py-2 text-right font-medium text-gray-700">{t(`attachmentThreatType.${k}`)}</th>
                      ))}
                      <th className="border border-gray-200 px-3 py-2 text-right font-medium text-gray-700">{t('table.blockRate')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.detail_table?.attachment ?? []).map((row, i) => (
                      <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="border border-gray-200 px-3 py-2 font-medium text-gray-800">{row.date}</td>
                        <td className="border border-gray-200 px-3 py-2 text-right tabular-nums text-gray-700">{row.total_attachment_mail.toLocaleString()}</td>
                        <td className="border border-gray-200 px-3 py-2 text-right tabular-nums text-gray-700">{row.safe_attachment_mail.toLocaleString()}</td>
                        <td className="border border-gray-200 px-3 py-2 text-right tabular-nums text-gray-700">{row.malicious_attachment_mail.toLocaleString()}</td>
                        {ATTACHMENT_DETAIL_KEYS.map((k) => (
                          <td key={k} className="border border-gray-200 px-3 py-2 text-right tabular-nums text-gray-700">{row[k]}</td>
                        ))}
                        <td className="border border-gray-200 px-3 py-2 text-right tabular-nums text-gray-700">{row.block_rate.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
              )}
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
