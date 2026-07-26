'use client';

import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import type { DkimDnsStatus } from '@/lib/api/dkim';

const VARIANT: Record<DkimDnsStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  verified: 'default',
  unverified: 'secondary',
  mismatch: 'destructive',
  not_found: 'destructive',
  dns_error: 'destructive',
};

export function DkimStatusBadge({ status }: { status: DkimDnsStatus }) {
  const t = useTranslations('dkim');
  return <Badge variant={VARIANT[status] ?? 'outline'}>{t(`dnsStatus.${status}`)}</Badge>;
}
