'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { getExportCsvUrl } from '@/lib/api/security-overview';
import type { Direction } from '@/lib/api/security-overview';
import { Download } from 'lucide-react';
import { useSecurityScope } from './hooks/useSecurityScope';
import { isMockEnabled } from '@/lib/mock/storage';
import { mockSecurityCsv } from '@/lib/mock/security-overview-fixtures';

interface BottomActionsProps {
  startDate: string;
  endDate: string;
  direction: Direction;
  scopeTenantId: number | null;
}

export function BottomActions({ startDate, endDate, direction, scopeTenantId }: BottomActionsProps) {
  const t = useTranslations('securityOverview.bottomActions');
  const { resolvedScopeTenant } = useSecurityScope(scopeTenantId);

  const csvUrl = isMockEnabled()
    ? `data:text/csv;charset=utf-8,${encodeURIComponent(mockSecurityCsv)}`
    : getExportCsvUrl({ startDate, endDate, direction, tenantId: resolvedScopeTenant });

  return (
    <div className="flex items-center justify-between flex-wrap gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <a href={csvUrl} download>
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4" />
            {t('exportCsv')}
          </Button>
        </a>
      </div>
    </div>
  );
}
