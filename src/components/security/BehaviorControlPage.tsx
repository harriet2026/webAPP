'use client';

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Download, Info, Plus, RotateCcw, Search, Upload } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { BehaviorControlTable } from './behavior-control/BehaviorControlTable';
import { BehaviorControlDrawer } from './behavior-control/BehaviorControlDrawer';
import {
  deleteBehaviorControlRule,
  listBehaviorControlRules,
  resolveBehaviorControlRule,
} from '@/lib/api/behavior-control';
import type { BehaviorControlRuleView } from '@/types/behavior-control';
import { useApiRequest } from '@/lib/api/client';
import { useAuth } from '@/contexts/auth-context';
import { RuleImportExportDialog } from '@/components/rules/RuleImportExportDialog';
import { executeUnifiedRulesImport, exportUnifiedRules, previewUnifiedRulesImport } from '@/lib/api/unified-rules';
import { ModuleMasterSwitch } from '@/components/security/ModuleMasterSwitch';

interface Props {
  embedded?: boolean;
}

const PAGE_SIZES = [10, 20, 50, 100];

export function BehaviorControlPage({ embedded = false }: Props) {
  const t = useTranslations();
  const qc = useQueryClient();
  const { apiRequest } = useApiRequest();
  const { isSystemAdmin } = useAuth();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [dirFilter, setDirFilter] = useState<string>('all');
  const [objFilter, setObjFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<BehaviorControlRuleView | null>(null);
  const [drawerDefaults, setDrawerDefaults] = useState<Partial<import('@/types/behavior-control').BehaviorControlFormData> | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<BehaviorControlRuleView | null>(null);
  const [importExportOpen, setImportExportOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['behavior-control-rules'],
    queryFn: () => listBehaviorControlRules(apiRequest),
  });

  const { data: tenantOptions = [] } = useQuery({
    queryKey: ['tenants', 'options'],
    queryFn: async () => {
      const response = await apiRequest<{ items: Array<{ id: number; name: string }> }>('/tenants');
      return response.items.map((tenant) => ({ id: tenant.id, name: tenant.name }));
    },
    enabled: isSystemAdmin,
  });

  const views = useMemo(() => {
    if (!data?.items) return [];
    return data.items.map(resolveBehaviorControlRule);
  }, [data]);

  const filtered = useMemo(() => {
    let result = views;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((v) =>
        v.rule.name.toLowerCase().includes(q) ||
        (v.meta?.object_config.value ?? '').toLowerCase().includes(q) ||
        v.list_id_display.toLowerCase().includes(q),
      );
    }
    if (dirFilter !== 'all') {
      result = result.filter((v) => v.meta?.direction === dirFilter);
    }
    if (objFilter !== 'all') {
      result = result.filter((v) => v.meta?.object_config.type === objFilter);
    }
    if (statusFilter === 'enabled') {
      result = result.filter((v) => v.rule.is_active);
    } else if (statusFilter === 'disabled') {
      result = result.filter((v) => !v.rule.is_active);
    }
    // demo default sort: ascending by priority (design/origin/demo .../utils.ts sortRulesByPriority, sortAscending=true)
    return [...result].sort((a, b) => a.rule.priority - b.rule.priority);
  }, [views, search, dirFilter, objFilter, statusFilter]);

  const paged = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));

  const handleEdit = (view: BehaviorControlRuleView) => {
    setEditing(view);
    setDrawerDefaults(undefined);
    setDrawerOpen(true);
  };

  const handleCreate = () => {
    setEditing(null);
    setDrawerDefaults(undefined);
    setDrawerOpen(true);
  };

  const handleResetFilters = () => {
    setSearch('');
    setDirFilter('all');
    setObjFilter('all');
    setStatusFilter('all');
    setPage(1);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteBehaviorControlRule(deleteTarget.rule.id, apiRequest);
      qc.invalidateQueries({ queryKey: ['behavior-control-rules'] });
      toast.success(t('behaviorControl.toast.saveOk'));
    } catch (e: unknown) {
      toast.error((e as Error)?.message ?? t('common.error'));
    }
    setDeleteTarget(null);
  };

  return (
    <ModuleMasterSwitch page="behavior_control" title={t('behaviorControl.title')}>
    <div className="space-y-4">
      {!embedded && (
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">{t('behaviorControl.title')}</h1>
        </div>
      )}
      <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
        <div className="flex items-center gap-2 text-sm text-blue-700 dark:text-blue-300">
          <Info className="h-4 w-4 flex-shrink-0" />
          <span>{t('behaviorControl.infoTip')}</span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 flex-1">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t('behaviorControl.searchPlaceholder')}
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="pl-9 w-full"
            />
          </div>
          <Select value={dirFilter} onValueChange={(v) => { setDirFilter(v ?? 'all'); setPage(1); }}>
            <SelectTrigger className="w-[120px]"><SelectValue placeholder={t('behaviorControl.filter.allDirections')} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('behaviorControl.filter.allDirections')}</SelectItem>
              {(['inbound', 'outbound', 'internal', 'bidirectional'] as const).map((d) => (
                <SelectItem key={d} value={d}>{t(`behaviorControl.direction.${d}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={objFilter} onValueChange={(v) => { setObjFilter(v ?? 'all'); setPage(1); }}>
            <SelectTrigger className="w-[120px]"><SelectValue placeholder={t('behaviorControl.filter.allTypes')} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('behaviorControl.filter.allTypes')}</SelectItem>
              {(['global', 'sender', 'senderIp', 'senderDomain'] as const).map((ot) => (
                <SelectItem key={ot} value={ot}>{t(`behaviorControl.object.${ot}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v ?? 'all'); setPage(1); }}>
            <SelectTrigger className="w-[120px]"><SelectValue placeholder={t('behaviorControl.filter.allStatus')} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('behaviorControl.filter.allStatus')}</SelectItem>
              <SelectItem value="enabled">{t('behaviorControl.filter.enabled')}</SelectItem>
              <SelectItem value="disabled">{t('behaviorControl.filter.disabled')}</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={handleResetFilters}>
            <RotateCcw className="h-4 w-4 mr-1" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={handleCreate}><Plus className="mr-1 h-4 w-4" />{t('behaviorControl.addRule')}</Button>
          <Button variant="outline" size="sm" onClick={() => setImportExportOpen(true)}><Upload className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" onClick={() => setImportExportOpen(true)}><Download className="h-4 w-4" /></Button>
        </div>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-muted-foreground">{t('common.loading')}</div>
      ) : (
        <>
          <BehaviorControlTable
            views={paged}
            onEdit={handleEdit}
            onDelete={(v) => setDeleteTarget(v)}
          />
          {filtered.length === 0 && (
            <div className="flex justify-center pb-2">
              <Button onClick={handleCreate}>{t('behaviorControl.createNow')}</Button>
            </div>
          )}
          {totalPages <= 1 ? (
            <div className="flex items-center justify-start px-4 py-3 border-t">
              <div className="text-sm text-muted-foreground">
                {t('behaviorControl.pagination.total')} {filtered.length} {t('behaviorControl.pagination.rules')}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <div className="text-sm text-muted-foreground">
                {t('behaviorControl.pagination.total')} {filtered.length} {t('behaviorControl.pagination.rules')}
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => setPage(page - 1)}
                    disabled={page === 1}
                  >
                    &lt;
                  </Button>
                  {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                    let pageNum: number;
                    if (totalPages <= 7) {
                      pageNum = i + 1;
                    } else if (page <= 4) {
                      pageNum = i + 1;
                      if (i === 6) pageNum = totalPages;
                      if (i === 5) return <span key={i} className="px-1 text-muted-foreground">...</span>;
                    } else if (page >= totalPages - 3) {
                      pageNum = totalPages - 6 + i;
                      if (i === 0) pageNum = 1;
                      if (i === 1) return <span key={i} className="px-1 text-muted-foreground">...</span>;
                    } else {
                      if (i === 0) pageNum = 1;
                      else if (i === 1) return <span key={i} className="px-1 text-muted-foreground">...</span>;
                      else if (i === 5) return <span key={i} className="px-1 text-muted-foreground">...</span>;
                      else if (i === 6) pageNum = totalPages;
                      else pageNum = page - 2 + i;
                    }
                    return (
                      <Button
                        key={i}
                        variant={page === pageNum ? 'default' : 'outline'}
                        size="sm"
                        className={cn('h-8 w-8 p-0', page === pageNum && 'bg-primary text-primary-foreground')}
                        onClick={() => setPage(pageNum)}
                      >
                        {pageNum}
                      </Button>
                    );
                  })}
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => setPage(page + 1)}
                    disabled={page === totalPages}
                  >
                    &gt;
                  </Button>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">{t('behaviorControl.pagination.goToPage')}</span>
                  <input
                    type="number"
                    min={1}
                    max={totalPages}
                    placeholder={String(page)}
                    className="h-8 w-14 px-2 border rounded-md text-sm text-center bg-background"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const value = parseInt((e.target as HTMLInputElement).value, 10);
                        if (value >= 1 && value <= totalPages) setPage(value);
                        (e.target as HTMLInputElement).value = '';
                      }
                    }}
                  />
                  <span className="text-muted-foreground">{t('behaviorControl.pagination.page')}</span>
                </div>
                <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v ?? '20')); setPage(1); }}>
                  <SelectTrigger className="w-[110px] h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAGE_SIZES.map((s) => (
                      <SelectItem key={s} value={String(s)}>{t(`behaviorControl.pagination.perPage${s}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </>
      )}

      <BehaviorControlDrawer open={drawerOpen} onOpenChange={setDrawerOpen} editing={editing} defaults={drawerDefaults} />

      {deleteTarget && (
        <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('behaviorControl.delete.title')}</AlertDialogTitle>
              <AlertDialogDescription>{t('behaviorControl.delete.warning')}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{t('common.delete')}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      <RuleImportExportDialog
        open={importExportOpen}
        onOpenChange={setImportExportOpen}
        scopeLabel={t('behaviorControl.title')}
        variant="unified-rules"
        adminContext={isSystemAdmin ? 'system-admin' : 'tenant-admin'}
        tenantOptions={tenantOptions}
        onExport={(selection) => exportUnifiedRules(selection, apiRequest, 'behavior_control')}
        onPreviewImport={(payload) => previewUnifiedRulesImport(payload, apiRequest, 'behavior_control')}
        onExecuteImport={async (payload) => {
          const response = await executeUnifiedRulesImport(payload, apiRequest, 'behavior_control');
          qc.invalidateQueries({ queryKey: ['behavior-control-rules'] });
          return response;
        }}
      />
    </div>
    </ModuleMasterSwitch>
  );
}
