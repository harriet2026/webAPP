'use client';

import { useTranslations } from 'next-intl';
import { Eye } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ServerPagination } from '@/components/shared/server-pagination';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { AdminAuditLog } from '@/lib/api/admin-audit';
import { formatDate } from '@/lib/utils';
import { moduleOf, opTypeMeta } from './admin-audit-taxonomy';

const PAGE_SIZE_OPTIONS = [20, 50, 100];

interface AdminAuditTableProps {
  logs: AdminAuditLog[];
  onRowClick: (log: AdminAuditLog) => void;
  showTenant?: boolean;
  tenantNameOf?: (log: AdminAuditLog) => string;
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

export function AdminAuditTable({
  logs,
  onRowClick,
  showTenant,
  tenantNameOf,
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: AdminAuditTableProps) {
  const t = useTranslations();
  // Header column count (review finding #7): timestamp, admin user,
  // [effective tenant], module, opType, resourceType, result, view-details.
  const colSpan = showTenant ? 8 : 7;

  return (
    <div className="space-y-3" data-testid="admin-audit-table">
      <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              {/* GT-12441: 列名对齐 html_spec 原型 §2.4：时间/操作者/操作模块/
                  操作类型/操作对象/结果/操作。「操作者」「操作对象」复用
                  adminAudit.adminUser / resourceType（其值已同步改名，详情抽屉
                  同源字段随之一致）；结果列与筛选标签(操作结果)区分，用独立
                  resultColumn(结果)；操作列复用 common.actions(操作)。 */}
              <TableHead className="bg-muted/20">{t('logs.timestamp')}</TableHead>
              <TableHead className="bg-muted/20">{t('adminAudit.adminUser')}</TableHead>
              {showTenant ? (
                <TableHead className="bg-muted/20">{t('adminAudit.effectiveTenant')}</TableHead>
              ) : null}
              <TableHead className="bg-muted/20">{t('adminAudit.filter.module')}</TableHead>
              <TableHead className="bg-muted/20">{t('adminAudit.filter.opType')}</TableHead>
              <TableHead className="bg-muted/20">{t('adminAudit.resourceType')}</TableHead>
              <TableHead className="bg-muted/20">{t('adminAudit.resultColumn')}</TableHead>
              <TableHead className="sticky right-0 z-10 bg-muted/20">{t('common.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={colSpan} className="h-24 text-center text-muted-foreground">
                  {t('adminAudit.empty')}
                </TableCell>
              </TableRow>
            ) : (
              logs.map((log) => {
                const opMeta = opTypeMeta(log.action);
                const moduleRef = moduleOf(log.resource_type);
                const isFailed = log.status === 'failed';
                const operatorName = log.operator_name || log.username || '-';
                const tenantLabel = tenantNameOf ? tenantNameOf(log) : (log.tenant_name ?? '-');
                return (
                  <TableRow
                    key={log.id}
                    data-testid={`admin-audit-row-${log.id}`}
                    className={`cursor-pointer ${isFailed ? 'bg-red-50/40' : ''}`}
                    onClick={() => onRowClick(log)}
                  >
                    <TableCell className="text-muted-foreground">
                      {formatDate(log.created_at)}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{operatorName}</span>
                        <span className="text-xs text-muted-foreground">{log.username || '-'}</span>
                      </div>
                    </TableCell>
                    {showTenant ? <TableCell>{tenantLabel}</TableCell> : null}
                    <TableCell>
                      {/* Spec D1: hover shows the full 一级 / 二级 module path. */}
                      <div
                        className="flex flex-col"
                        title={`${t(moduleRef.topKey)} / ${t(moduleRef.subKey)}`}
                      >
                        <span className="text-xs text-muted-foreground">{t(moduleRef.topKey)}</span>
                        <span>{t(moduleRef.subKey)}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {/* GT-12442: html_spec 原型 §2.4 操作类型/操作结果徽章为
                          rounded(0.25rem 偏方)，共享 Badge 基类是 rounded-4xl
                          (胶囊)，此处覆盖为 rounded 对齐原型（tailwind-merge 同组
                          后者胜）。 */}
                      <Badge variant="outline" className={`rounded ${opMeta.badge}`}>
                        {t(opMeta.labelKey)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span
                        className="block max-w-[280px] truncate font-mono text-xs"
                        title={log.resource_type + (log.resource_id ? ` #${log.resource_id}` : '')}
                      >
                        {log.resource_type}
                        {log.resource_id ? ` #${log.resource_id}` : ''}
                      </span>
                    </TableCell>
                    <TableCell>
                      {isFailed ? (
                        <Badge variant="outline" className="rounded bg-red-50 text-red-700 ring-1 ring-red-200">
                          {t('adminAudit.stats.failed')}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="rounded bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
                          {t('adminAudit.stats.success')}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="sticky right-0 z-10 bg-inherit">
                      {/* GT-12443: html_spec 原型 §2.4「查看」= Eye 图标 + 「查看」
                          文字 + 蓝色 ghost（与认证日志「查看」按钮同款）。 */}
                      <Button
                        variant="ghost"
                        size="sm"
                        data-testid={`admin-audit-view-${log.id}`}
                        className="h-auto gap-1 p-1 text-primary hover:text-primary"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRowClick(log);
                        }}
                      >
                        <Eye className="h-4 w-4" />
                        {t('common.view')}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between">
        <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
          <SelectTrigger className="h-8 w-[110px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZE_OPTIONS.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <ServerPagination
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={onPageChange}
        />
      </div>
    </div>
  );
}
