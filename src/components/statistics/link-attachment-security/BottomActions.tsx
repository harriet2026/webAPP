'use client';

import { useTranslations } from 'next-intl';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { exportLinkAttachmentCsvUrl } from '@/lib/api/link-attachment-security';
import type { Direction } from '@/lib/api/link-attachment-security';
import { useTenant } from '@/hooks/use-tenant';

interface BottomActionsProps {
  startDate: string;
  endDate: string;
  direction: Direction;
  tenantId: number | null;
}

export function BottomActions({
  startDate,
  endDate,
  direction,
  tenantId,
}: BottomActionsProps) {
  // spec §3.2.0: blacklist/CSV/AI/PDF are admin-only (tenant_user is
  // read-only). The backend already enforces this (RequireAdminOrTenantAdmin
  // on blacklist-domain/export.csv/ai-analysis); gray-disable here too so a
  // tenant_user doesn't see a clickable button that 403s.
  const { isAdmin } = useTenant();
  const csvUrl = exportLinkAttachmentCsvUrl({
    start_date: startDate,
    end_date: endDate,
    direction,
    tenant_id: tenantId,
  });
  const t = useTranslations('linkAttachmentSecurity');

  return (
    <div className="flex justify-end" data-testid="link-attachment-bottom-actions">
      <Button
        variant="outline"
        disabled={!isAdmin}
        nativeButton={false}
        render={<a href={isAdmin ? csvUrl : undefined} download />}
      >
        <Download className="h-4 w-4" />
        {t('bottomActions.exportCsv')}
      </Button>
    </div>
  );
}
