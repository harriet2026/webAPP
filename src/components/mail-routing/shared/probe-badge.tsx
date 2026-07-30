'use client';

// 探测状态徽章：正常/异常/未检测/部分异常（带 n/m 计数）。对齐
// doc/html-spec/admin-forwarding/index.html §2.7「ProbeBadge：正常绿 / 异常红 / 未检测灰 /
// 部分异常橙（带 (n/m) 计数），outline 浅底」。

import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { normalizeProbeStatus, type ProbeStatus } from '../mr-types';

const STATUS_STYLES: Record<ProbeStatus, string> = {
  normal:
    'border-green-200 bg-green-50 text-green-600 dark:border-green-900 dark:bg-green-950/40 dark:text-green-400',
  abnormal:
    'border-red-200 bg-red-50 text-red-600 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400',
  unchecked:
    'border-gray-200 bg-gray-50 text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400',
  partial:
    'border-amber-200 bg-amber-50 text-amber-600 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-400',
};

export function ProbeBadge({
  status,
  abnormalCount,
  total,
  testId,
}: {
  status: ProbeStatus;
  abnormalCount?: number;
  total?: number;
  testId?: string;
}) {
  const t = useTranslations('mailRouting.shared');
  const normalizedStatus = normalizeProbeStatus(status);
  const label =
    normalizedStatus === 'partial' && abnormalCount != null && total != null
      ? t('probe.partialWithCount', { abnormal: abnormalCount, total })
      : t(`probe.${normalizedStatus}`);
  return (
    <Badge
      variant="outline"
      className={cn('font-normal', STATUS_STYLES[normalizedStatus])}
      data-testid={testId}
    >
      {label}
    </Badge>
  );
}
