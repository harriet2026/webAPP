'use client';

import { useTranslations } from 'next-intl';
import { Eye, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/utils';
import { type LinkClickLog } from '@/lib/api/link-clicks';
import { stageMeta, verdictMeta, resultMeta, actionMeta } from './meta';

function Badge({ labelKey, color, t }: { labelKey: string; color: string; t: (k: string) => string }) {
  return <span className={`px-2 py-1 rounded text-xs font-medium ${color}`}>{t(labelKey)}</span>;
}

interface LinkTableProps {
  logs: LinkClickLog[];
  showTenant: boolean;
  onView: (log: LinkClickLog) => void;
  onDownload: (log: LinkClickLog) => void;
}

export function LinkTable({ logs, showTenant, onView, onDownload }: LinkTableProps) {
  const t = useTranslations();
  const colSpan = showTenant ? 11 : 10;

  return (
    <div data-testid="link-logs-table" className="overflow-x-auto border border-border rounded-lg">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 border-b border-border">
          <tr>
            <th className="px-4 py-3 text-left font-medium">{t('linkLogs.columns.clickTime')}</th>
            <th className="px-4 py-3 text-left font-medium">{t('linkLogs.columns.tid')}</th>
            {showTenant && <th className="px-4 py-3 text-left font-medium">{t('common.tenant')}</th>}
            <th className="px-4 py-3 text-left font-medium">{t('linkLogs.columns.clicker')}</th>
            <th className="px-4 py-3 text-left font-medium">{t('linkLogs.columns.sender')}</th>
            <th className="px-4 py-3 text-left font-medium">{t('linkLogs.columns.originalUrl')}</th>
            <th className="px-4 py-3 text-left font-medium">{t('linkLogs.columns.triggerStage')}</th>
            <th className="px-4 py-3 text-left font-medium">{t('linkLogs.columns.verdict')}</th>
            <th className="px-4 py-3 text-left font-medium">{t('linkLogs.columns.finalResult')}</th>
            <th className="px-4 py-3 text-left font-medium">{t('linkLogs.columns.userAction')}</th>
            <th className="px-4 py-3 text-right font-medium sticky right-0 bg-muted/50">{t('linkLogs.columns.action')}</th>
          </tr>
        </thead>
        <tbody>
          {logs.length === 0 ? (
            <tr><td data-testid="link-logs-empty" colSpan={colSpan} className="px-4 py-10 text-center text-muted-foreground">{t('linkLogs.empty')}</td></tr>
          ) : logs.map((log) => {
            const sm = stageMeta(log.trigger_stage);
            const vm = verdictMeta(log.verdict);
            const rm = resultMeta(log.final_result);
            const am = actionMeta(log.user_action);
            return (
              <tr key={log.id} data-testid={`link-logs-row-${log.id}`} className={`border-b border-border hover:bg-muted/30 ${log.final_result === 'alerted' ? 'bg-rose-50 dark:bg-rose-950/20' : ''}`}>
                <td className="px-4 py-3 text-xs whitespace-nowrap">{formatDate(log.occurred_at)}</td>
                <td className="px-4 py-3 text-xs font-medium text-blue-600 whitespace-nowrap">{log.message_uuid || log.message_id}</td>
                {showTenant && <td className="px-4 py-3 text-xs">{log.tenant_name || log.tenant_id || '-'}</td>}
                <td className="px-4 py-3 text-xs truncate">{log.clicker}</td>
                <td className="px-4 py-3 text-xs truncate">{log.sender || '-'}</td>
                <td className="px-4 py-3 text-xs text-blue-600 truncate max-w-xs" title={log.original_url}>{log.original_url}</td>
                <td className="px-4 py-3"><Badge labelKey={sm.labelKey} color={sm.color} t={t} /></td>
                <td className="px-4 py-3"><Badge labelKey={vm.labelKey} color={vm.color} t={t} /></td>
                <td className="px-4 py-3"><Badge labelKey={rm.labelKey} color={rm.color} t={t} /></td>
                <td className="px-4 py-3"><Badge labelKey={am.labelKey} color={am.color} t={t} /></td>
                <td className="px-4 py-3 sticky right-0 bg-background">
                  <div className="flex justify-end gap-1">
                    <Button data-testid={`link-logs-view-${log.id}`} variant="ghost" size="sm" className="h-auto p-1 gap-1 text-blue-600" onClick={() => onView(log)}>
                      <Eye className="h-4 w-4" />{t('linkLogs.view')}
                    </Button>
                    <Button data-testid={`link-logs-download-${log.id}`} variant="ghost" size="sm" className="h-auto p-1 gap-1" onClick={() => onDownload(log)}>
                      <Download className="h-4 w-4" />{t('linkLogs.download')}
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
