'use client';

import { useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useDeliveryTraffic } from '@/components/statistics/delivery-traffic/hooks/useDeliveryTraffic';
import type { Direction } from '@/lib/api/delivery-traffic';

const COLUMNS: Record<Direction, string[]> = {
  all: ['date', 'total', 'success', 'failure', 'deferred', 'cancelled', 'success_rate', 'change'],
  receive: ['date', 'total', 'success', 'failure', 'deferred', 'cancelled', 'user_not_exist', 'mailbox_full', 'success_rate', 'change'],
  send: ['date', 'total', 'success', 'failure', 'deferred', 'cancelled', 'target_reject', 'dns_fail', 'rbl_block', 'success_rate', 'change'],
  internal: ['date', 'total', 'success', 'failure', 'internal_spam', 'internal_phishing', 'internal_virus', 'success_rate', 'change'],
};

const TABLE_LABEL_KEYS: Record<string, string> = {
  success_rate: 'successRate',
  user_not_exist: 'userNotExist',
  mailbox_full: 'mailboxFull',
  target_reject: 'targetReject',
  dns_fail: 'dnsFail',
  rbl_block: 'rblBlock',
  internal_spam: 'internalSpam',
  internal_phishing: 'internalPhishing',
  internal_virus: 'internalVirus',
};

function PrintContent() {
  const t = useTranslations('deliveryTraffic');
  const tPrint = useTranslations('deliveryTraffic.print');
  const params = useSearchParams();

  const startDate = params.get('start_date') ?? '';
  const endDate = params.get('end_date') ?? '';
  const direction = (params.get('direction') ?? 'all') as Direction;
  const tenantRaw = params.get('tenant_id');
  const tenantId = tenantRaw ? Number(tenantRaw) : null;

  const { data, isLoading } = useDeliveryTraffic({
    startDate,
    endDate,
    direction,
    tenantId: Number.isFinite(tenantId) ? tenantId : null,
  });

  useEffect(() => {
    if (data && !isLoading) {
      const timer = setTimeout(() => window.print(), 800);
      return () => clearTimeout(timer);
    }
  }, [data, isLoading]);

  const directionLabel = direction === 'all' ? t('direction.all')
    : direction === 'receive' ? t('direction.receive')
    : direction === 'send' ? t('direction.send')
    : t('direction.internal');

  function formatVal(key: string, val: unknown): string {
    if (val == null) return '—';
    if (key === 'success_rate') return `${Number(val).toFixed(1)}%`;
    if (key === 'change') return val == null ? '—' : `${Number(val) > 0 ? '+' : ''}${Number(val).toFixed(1)}%`;
    if (typeof val === 'number') return val.toLocaleString();
    return String(val);
  }

  const columns = COLUMNS[direction] ?? COLUMNS.all;

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
            <h1 className="text-2xl font-bold text-gray-900">{tPrint('title')}</h1>
            <div className="mt-2 flex flex-wrap gap-6 text-sm text-gray-600">
              <span><span className="font-medium">{tPrint('dateRange')}：</span>{startDate} ~ {endDate}</span>
              <span><span className="font-medium">{tPrint('direction')}：</span>{directionLabel}</span>
              <span><span className="font-medium">{tPrint('generatedAt')}：</span>{new Date().toLocaleString()}</span>
            </div>
          </div>

          {isLoading || !data ? (
            <div className="flex h-40 items-center justify-center text-gray-500">{tPrint('noData')}</div>
          ) : (
            <>
              <section className="mb-8">
                <h2 className="mb-4 text-lg font-semibold text-gray-800">{tPrint('kpiSection')}</h2>
                <div className="grid grid-cols-4 gap-4">
                  {Object.entries(data.kpi).map(([key, value]) => (
                    <div key={key} className="rounded-lg border border-gray-200 p-4">
                      <div className="text-xs font-medium text-gray-500">{key}</div>
                      <div className="mt-1 text-2xl font-bold text-gray-900">
                        {typeof value === 'number' ? (key.includes('rate') ? `${value.toFixed(1)}%` : value.toLocaleString()) : String(value ?? '—')}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="mb-8">
                <h2 className="mb-3 text-lg font-semibold text-gray-800">{tPrint('detailSection')}</h2>
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-gray-50">
                      {columns.map((k) => (
                        <th key={k} className={`border border-gray-200 px-3 py-2 font-medium text-gray-700 ${k !== 'date' ? 'text-right' : 'text-left'}`}>
                          {t(`table.${TABLE_LABEL_KEYS[k] ?? k}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.detail_table.map((row, i) => (
                      <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        {columns.map((k) => (
                          <td key={k} className={`border border-gray-200 px-3 py-2 tabular-nums text-gray-700 ${k !== 'date' ? 'text-right' : 'font-medium text-gray-800'}`}>
                            {formatVal(k, row[k])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
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
