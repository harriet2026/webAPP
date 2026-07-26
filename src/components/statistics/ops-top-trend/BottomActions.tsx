'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Download, Loader2 } from 'lucide-react';
import { downloadOpsTopCsv, type OpsTopParams } from '@/lib/api/ops-top';
import { useApiRequest } from '@/lib/api/client';

interface BottomActionsProps {
  params: OpsTopParams;
}

export function BottomActions({ params }: BottomActionsProps) {
  const t = useTranslations('opsTopTrend.bottomActions');
  const { apiRequest } = useApiRequest();
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const payload = await downloadOpsTopCsv(params, apiRequest);
      const blob = typeof payload === 'string'
        ? new Blob([payload], { type: 'text/csv;charset=utf-8' })
        : payload;
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      a.download = `ops-top-${params.dimension}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objUrl);
    } catch {
      toast.error(t('exportFailed'));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-end gap-3 rounded-[10px] bg-card p-4 shadow-sm">
      <Button variant="outline" className="rounded-lg border" onClick={handleExport} disabled={exporting}>
        {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        {t('exportCsv')}
      </Button>
    </div>
  );
}
