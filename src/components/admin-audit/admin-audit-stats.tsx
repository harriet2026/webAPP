'use client';

import { useTranslations } from 'next-intl';

export interface AdminAuditStatsProps {
  stats?: { total: number; success: number; failed: number };
}

export function AdminAuditStats({ stats }: AdminAuditStatsProps) {
  const t = useTranslations('adminAudit');
  const total = stats?.total ?? 0;
  const success = stats?.success ?? 0;
  const failed = stats?.failed ?? 0;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <StatCard
        label={t('stats.total')}
        value={total}
        valueClass="text-gray-900"
        testid="admin-audit-stat-total"
      />
      <StatCard
        label={t('stats.success')}
        value={success}
        valueClass="text-emerald-700"
        testid="admin-audit-stat-success"
      />
      <StatCard
        label={t('stats.failed')}
        value={failed}
        valueClass="text-red-700"
        testid="admin-audit-stat-failed"
      />
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: number;
  valueClass: string;
  testid: string;
}

function StatCard({ label, value, valueClass, testid }: StatCardProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm" data-testid={testid}>
      <div className="text-sm text-body">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${valueClass}`}>{value}</div>
    </div>
  );
}
