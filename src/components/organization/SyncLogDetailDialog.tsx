'use client';

// 同步日志详情 —— 逐字段对齐 demo sync-log-tab.tsx 的详情 Sheet（D2：以 demo
// 为准用右侧抽屉 sm:max-w-2xl，非 spec 的 720px 模态框）：
// 标题「同步日志详情 #ID」+ 描述、6 张统计卡（3 列网格）、参数快照两列键值、
// 失败明细（N）+ 导出失败明细 + 3 列表（行号/原始值/失败原因红字）、底部关闭。
// 用户拍板删除失败明细分页 —— 一次取 page_size=200。

import { useTranslations } from 'next-intl';
import { format } from 'date-fns';
import { Download } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth-context';
import { useApiRequest } from '@/lib/api/client';
import { useQuery } from '@tanstack/react-query';
import { isMockEnabled } from '@/lib/mock/storage';
import { cn } from '@/lib/utils';
import { getContactSyncLog, exportContactSyncFailuresUrl, downloadExportUrl } from './api';
import { LogStatusBadge, formatLogDuration } from './SyncLogTab';

interface SyncLogDetailDialogProps {
  logId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceById?: Map<number, { name: string; type: string }>;
}

export function SyncLogDetailDialog({ logId, open, onOpenChange, sourceById }: SyncLogDetailDialogProps) {
  const t = useTranslations('organizationContacts');
  const tc = useTranslations('common');
  const { isSystemAdmin, selectedTenantId, user } = useAuth();
  const tenantId = isSystemAdmin ? selectedTenantId : user?.tenant_id ?? null;
  const { apiRequest: tenantAwareRequest } = useApiRequest();

  const { data } = useQuery({
    queryKey: ['contact-sync-log-detail', logId, tenantId],
    queryFn: () => getContactSyncLog(logId!, { page: 1, page_size: 200 }, tenantAwareRequest),
    enabled: open && logId !== null,
  });

  const failures = data?.failures?.items || [];
  const failuresTotal = data?.failures?.total ?? 0;

  const source = data?.source_id !== undefined ? sourceById?.get(Number(data.source_id)) : undefined;
  const typeShort = (() => {
    switch (source?.type) {
      case 'ldap':
        return t('typeLdap');
      case 'csv':
        return t('typeCsv');
      case 'coremail':
        return t('typeShortCoremail');
      case 'neteml':
        return t('typeShortNeteml');
      default:
        return '-';
    }
  })();

  const handleExportFailures = async () => {
    if (logId === null) return;
    toast.success(t('toastFailuresExported'));
    if (isMockEnabled()) return;
    try {
      await downloadExportUrl(exportContactSyncFailuresUrl(logId), tenantId, `sync-failures-${logId}.csv`);
    } catch (e) {
      toast.error((e as Error).message || tc('error'));
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col p-0 sm:max-w-2xl" showCloseButton data-testid="contacts-log-detail">
        <SheetHeader className="border-b border-gray-100 px-6 pb-3 pt-6 dark:border-gray-800">
          <SheetTitle>{t('logDetailTitle', { id: logId ?? '' })}</SheetTitle>
          <SheetDescription>{t('logDetailDesc')}</SheetDescription>
        </SheetHeader>
        {data && (
          <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
            <div className="grid grid-cols-3 gap-3">
              <StatCard label={t('statAdded')} value={data.added_count} cls="text-green-600" data-testid="contacts-log-detail-stat-added" />
              <StatCard label={t('statUpdated')} value={data.updated_count} cls="text-blue-600" data-testid="contacts-log-detail-stat-updated" />
              <StatCard label={t('statDeleted')} value={data.deleted_count} cls="text-gray-600" data-testid="contacts-log-detail-stat-deleted" />
              <StatCard label={t('statFailed')} value={data.failed_count} cls="text-red-600" data-testid="contacts-log-detail-stat-failed" />
              <StatCard label={t('statDuration')} value={formatLogDuration(data.duration_ms)} cls="text-gray-800 dark:text-gray-200" data-testid="contacts-log-detail-stat-duration" />
              <StatCard
                label={t('statMode')}
                value={data.sync_type === 'auto' ? t('syncTypeAuto') : t('syncTypeManual')}
                cls="text-gray-800 dark:text-gray-200"
                data-testid="contacts-log-detail-stat-mode"
              />
            </div>
            <div className="grid grid-cols-2 gap-y-2 rounded-lg border border-gray-200 p-4 text-sm dark:border-gray-800" data-testid="contacts-log-detail-params">
              <span className="text-gray-400">{t('paramSource')}</span>
              <span className="text-gray-800 dark:text-gray-200">{source?.name || '-'}</span>
              <span className="text-gray-400">{t('paramSourceType')}</span>
              <span className="text-gray-800 dark:text-gray-200">{typeShort}</span>
              <span className="text-gray-400">{t('paramStartTime')}</span>
              <span className="text-gray-800 dark:text-gray-200">
                {data.started_at ? format(new Date(data.started_at), 'yyyy-MM-dd HH:mm:ss') : '-'}
              </span>
              <span className="text-gray-400">{t('paramStatus')}</span>
              <span>
                <LogStatusBadge status={String(data.status)} />
              </span>
            </div>
            {failuresTotal > 0 && (
              <div data-testid="contacts-log-detail-failures">
                <div className="mb-2 flex items-center justify-between">
                  <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {t('failuresTitle', { count: failuresTotal })}
                  </h4>
                  <Button variant="outline" size="sm" className="h-8 gap-1" onClick={handleExportFailures} data-testid="contacts-log-detail-failures-export">
                    <Download className="h-3.5 w-3.5" />
                    {t('exportFailures')}
                  </Button>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-[80px]">{t('colLineNo')}</TableHead>
                      <TableHead>{t('colRawValue')}</TableHead>
                      <TableHead>{t('colFailReason')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {failures.map((f) => (
                      <TableRow key={f.id}>
                        <TableCell className="text-gray-500">{f.row_no || '-'}</TableCell>
                        <TableCell className="text-gray-600 dark:text-gray-400">{f.email || '-'}</TableCell>
                        <TableCell className="text-red-600">{f.reason}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}
        <div className="flex flex-row justify-end gap-2 border-t border-gray-100 px-6 py-4 dark:border-gray-800">
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="contacts-log-detail-close">
            {t('closeBtn')}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function StatCard({ label, value, cls, 'data-testid': testId }: { label: string; value: number | string; cls?: string; 'data-testid'?: string }) {
  return (
    <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-800" data-testid={testId}>
      <p className="text-xs text-gray-400">{label}</p>
      <p className={cn('mt-1 text-lg font-semibold', cls)}>{value}</p>
    </div>
  );
}
