'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, RotateCcw, Search, Loader2, Upload, Download, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useApiRequest } from '@/lib/api/client';
import { useTenant } from '@/hooks/use-tenant';
import { usePermission } from '@/hooks/use-permission';
import { toast } from 'sonner';
import type { Rule } from '@/types/unified-rules';
import type { Group, GroupType } from '@/types/groups';
import { GROUPS_LIST_QUERY } from '@/lib/api/groups';
import { ruleToGroup, buildRulePayload, importMembers, exportMembers } from '@/lib/api/groups';
import { GroupEditDialog } from './group-edit-dialog';
import { FeatureGroupDrawer } from './feature-group-drawer';
import { summarizeConditionTree, summarizeFeaturePreview } from './feature-group-preview';
import { useApiErrorMessage } from '@/lib/api/use-api-error-message';

const ALL_TYPES: GroupType[] = ['ip', 'sender', 'recipient', 'content', 'feature'];

// 群组类型 Badge 配色（demo getTypeBadgeColor 口径，与策略表适用对象 Badge 同色族）
const TYPE_BADGE_COLOR: Record<GroupType, string> = {
  ip: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  sender: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  recipient: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  content: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  feature: 'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200',
};

interface GroupManagementPageProps {
  /**
   * 平台作用域模式（平台安全策略 → 群组策略 tab 嵌入）：只呈现 IP 组、
   * 加平台语义提示条。请求不带租户上下文 → 后端落 tenant_id NULL 平台组
   * （spec 2026-07-21-platform-ip-group-policy-tab-design §5.2）。
   */
  platformScope?: boolean;
}

export function GroupManagementPage({ platformScope = false }: GroupManagementPageProps = {}) {
  const t = useTranslations('groups');
  const apiErrorMessage = useApiErrorMessage();
  const tCommon = useTranslations('common');
  const tRules = useTranslations('rules');
  // 条件预览用条件目录标签（与高级过滤规则条件编辑器同一 i18n 源）
  const tConditions = useTranslations('advancedRulesFeature.v3Conditions.conditions');
  const router = useRouter();
  const queryClient = useQueryClient();
  const { effectiveTenantId } = useTenant();
  const { isSystemAdmin, isTenantAdmin } = usePermission();
  const { apiRequest } = useApiRequest();

  // GT-11941：群组是可复用的命名集合(条件定义),不是阶段执行——定义一个 IP 组
  // 并不等于要在阶段1执行它。需求 F1「五类群组管理 P0」对租户管理员同样成立,
  // 故不再按角色裁剪群组类型。
  //
  // 需要按角色收窄的是**策略流水线的阶段1**(IP 频率限制/IP 黑白名单属全局统一
  // 管控),那由 group-policy-drawer 置灰表达。
  //
  // 平台作用域模式（platformScope）例外：v1 平台级只放开 IP 组（后端
  // validatePlatformGroupScope 同步收窄），其余四类的平台级消费路径未验证。
  const allowedTypes = useMemo<GroupType[]>(
    () => (platformScope ? ['ip'] : ALL_TYPES),
    [platformScope],
  );

  const [activeTab, setActiveTab] = useState<GroupType>('ip');
  const [searchTerm, setSearchTerm] = useState('');
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deletingGroup, setDeletingGroup] = useState<Group | null>(null);
  const [complexGroup, setComplexGroup] = useState<Group | null>(null);
  const [featureDrawerOpen, setFeatureDrawerOpen] = useState(false);
  const [featureEditingGroup, setFeatureEditingGroup] = useState<Group | null>(null);
  const pendingImportGroupRef = useRef<Group | null>(null);
  const [importingRuleId, setImportingRuleId] = useState<number | null>(null);
  const [exportingRuleId, setExportingRuleId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // 工具栏「批量导入」：先选目标群组，确认后打开文件选择器（复用行级 importMembers）
  const [batchImportOpen, setBatchImportOpen] = useState(false);
  const [batchImportRuleId, setBatchImportRuleId] = useState<string>('');
  const [exportingAll, setExportingAll] = useState(false);

  useEffect(() => {
    if (!allowedTypes.includes(activeTab)) {
      setActiveTab(allowedTypes[0]);
    }
  }, [allowedTypes, activeTab]);

  const { data: rules, isLoading, refetch } = useQuery<Rule[]>({
    queryKey: ['groups', effectiveTenantId],
    queryFn: async () => {
      const qs = new URLSearchParams(GROUPS_LIST_QUERY).toString();
      const res = await apiRequest<{ items: Rule[] }>(`/unified-rules?${qs}`, { method: 'GET' });
      return res.items ?? [];
    },
  });

  const groupsByType = useMemo(() => {
    const map: Record<GroupType, Group[]> = { ip: [], sender: [], recipient: [], content: [], feature: [] };
    const ruleById = new Map<number, Rule>();
    for (const r of rules ?? []) {
      const g = ruleToGroup(r);
      if (g) {
        map[g.type].push(g);
        ruleById.set(g.ruleId, r);
      }
    }
    return { map, ruleById };
  }, [rules]);

  const ruleById = groupsByType.ruleById;

  const allGroups = useMemo(() => ALL_TYPES.flatMap(type => groupsByType.map[type]), [groupsByType]);

  const filtered = (groupsByType.map[activeTab] ?? []).filter(g =>
    !searchTerm || g.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const upsertMutation = useMutation({
    mutationFn: async ({ id, body }: { id?: number; body: ReturnType<typeof buildRulePayload> }) => {
      const url = id ? `/unified-rules/${id}` : '/unified-rules';
      const method = id ? 'PUT' : 'POST';
      return apiRequest<Rule>(url, { method, body });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups', effectiveTenantId] });
      toast.success(tCommon('saveSuccess'));
    },
    onError: (e: Error) => toast.error(apiErrorMessage(e)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/unified-rules/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups', effectiveTenantId] });
      toast.success(tCommon('deleteSuccess'));
      setDeletingGroup(null);
    },
    onError: (e: Error) => toast.error(apiErrorMessage(e)),
  });

  // GT-12260：接口早就按行返回 {line, value, reason}，此前只取了 .length 塞进
  // toast，逐行原因被整个丢弃 —— 管理员无法定位批量文件里到底哪几行有问题。
  // 这里把明细留下来，用弹窗展示。
  const [importFailures, setImportFailures] = useState<
    { groupName: string; imported: number; failed: { line: number; value: string; reason: string }[] } | null
  >(null);

  const handleImportFile = async (file: File) => {
    const target = pendingImportGroupRef.current;
    if (!target) return;
    setImportingRuleId(target.ruleId);
    try {
      const result = await importMembers(target.ruleId, file, { tenantId: effectiveTenantId });
      if (result.failed.length > 0) {
        toast.warning(t('importPartial', { imported: result.imported, failed: result.failed.length }));
        setImportFailures({ groupName: target.name, imported: result.imported, failed: result.failed });
      } else {
        toast.success(t('importSuccess', { count: result.imported }));
      }
      await refetch();
    } catch (e) {
      toast.error(apiErrorMessage(e, String(e)));
    } finally {
      setImportingRuleId(null);
      pendingImportGroupRef.current = null;
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleExport = async (group: Group) => {
    setExportingRuleId(group.ruleId);
    try {
      const blob = await exportMembers(group.ruleId, { tenantId: effectiveTenantId });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const safeName = group.name.replace(/[^a-zA-Z0-9_-]+/g, '_') || 'group';
      link.href = url;
      link.download = `${safeName}-members.txt`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(apiErrorMessage(e, String(e)));
    } finally {
      setExportingRuleId(null);
    }
  };

  // 工具栏「导出」：把当前 Tab 全部群组的成员合并为单个文本文件（分组名作节头），
  // 复用行级 exportMembers 契约，不新增后端接口。
  const handleExportAll = async (type: GroupType) => {
    const list = groupsByType.map[type] ?? [];
    if (list.length === 0) {
      toast.info(tCommon('noData'));
      return;
    }
    setExportingAll(true);
    try {
      const sections: string[] = [];
      for (const g of list) {
        const blob = await exportMembers(g.ruleId, { tenantId: effectiveTenantId });
        const text = await blob.text();
        sections.push(`# ${g.name}\n${text.trimEnd()}`);
      }
      const merged = new Blob([sections.join('\n\n') + '\n'], { type: 'text/plain' });
      const url = URL.createObjectURL(merged);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${type}-groups-members.txt`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(apiErrorMessage(e, String(e)));
    } finally {
      setExportingAll(false);
    }
  };

  const handleSubmit = async (values: { name: string; type: GroupType; members: string[]; scopes?: string[] }) => {
    if (editingGroup) {
      const body = buildRulePayload(values, false);
      await upsertMutation.mutateAsync({ id: editingGroup.ruleId, body });
    } else {
      const body = buildRulePayload(values, true);
      await upsertMutation.mutateAsync({ body });
    }
  };

  const renderFeatureTab = () => {
    const list = filtered.filter(g => g.type === 'feature');
    return (
      <TabsContent key="feature" value="feature" className="space-y-4 mt-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 flex-1">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input data-testid="groups-search" className="pl-9" placeholder={t('groupName')} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
            </div>
            <Button data-testid="groups-search-reset" variant="outline" size="sm" onClick={() => setSearchTerm('')}>
              <RotateCcw className="h-4 w-4 mr-1" />{tCommon('reset')}
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button data-testid="groups-new" onClick={() => { setFeatureEditingGroup(null); setActiveTab('feature'); setFeatureDrawerOpen(true); }}>
              <Plus className="h-4 w-4 mr-1" />{t('newGroupOfType', { typeLabel: t('featureGroup') })}
            </Button>
            {/* 特征组无成员名单概念：按 demo 保留按钮位，置灰并说明 */}
            <Button data-testid="groups-batch-import" variant="outline" disabled title={t('featureImportExportNA')}>
              <Upload className="h-4 w-4 mr-1" />{t('batchImport')}
            </Button>
            <Button data-testid="groups-export-all" variant="outline" disabled title={t('featureImportExportNA')}>
              <Download className="h-4 w-4 mr-1" />{tCommon('export')}
            </Button>
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('groupName')}</TableHead>
              <TableHead>{t('columnType')}</TableHead>
              <TableHead className="text-center">{t('conditionCount')}</TableHead>
              <TableHead>{t('conditionPreview')}</TableHead>
              <TableHead className="text-center">{t('referenceCount')}</TableHead>
              <TableHead className="w-[100px]">{tCommon('actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map(g => {
              const rule = ruleById.get(g.ruleId);
              // 条件预览优先 demo 口径（"(A 或 B) 且 C" 人类可读标签），
              // 树形不符合 serde 两组形态时回落到表达式摘要
              const preview = rule
                ? summarizeFeaturePreview(
                    rule.condition_tree,
                    key => tConditions(key),
                    t('previewOr'),
                    t('previewAnd'),
                  ) ?? summarizeConditionTree(rule.condition_tree)
                : '';
              return (
                <TableRow key={g.ruleId} data-testid={`groups-row-${g.ruleId}`}>
                  <TableCell className="font-medium">{g.name}</TableCell>
                  <TableCell><Badge variant="secondary" className={TYPE_BADGE_COLOR[g.type]}>{t(`${g.type}Group`)}</Badge></TableCell>
                  <TableCell className="text-center" data-testid={`groups-member-count-${g.ruleId}`}>{g.memberCount ?? 0}</TableCell>
                  <TableCell>
                    <div className="line-clamp-1 text-xs text-muted-foreground" title={preview} data-testid={`groups-condition-preview-${g.ruleId}`}>
                      {preview || '—'}
                    </div>
                  </TableCell>
                  <TableCell className="text-center" data-testid={`groups-reference-count-${g.ruleId}`}>{g.referenceCount}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" data-testid={`groups-row-edit-${g.ruleId}`}
                        onClick={() => { setFeatureEditingGroup(g); setActiveTab('feature'); setFeatureDrawerOpen(true); }}
                        title={tRules('editRule')}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" data-testid={`groups-row-delete-${g.ruleId}`}
                        disabled={g.referenceCount > 0}
                        onClick={() => setDeletingGroup(g)}
                        title={g.referenceCount > 0 ? t('deleteBlocked', { count: g.referenceCount }) : tCommon('delete')}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {list.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">{tCommon('noData')}</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TabsContent>
    );
  };

  const renderTab = (type: GroupType) => {
    if (type === 'feature') return renderFeatureTab();
    const list = filtered.filter(g => g.type === type);
    return (
      <TabsContent key={type} value={type} className="space-y-4 mt-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 flex-1">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input data-testid="groups-search" className="pl-9" placeholder={t('groupName')} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
            </div>
            <Button data-testid="groups-search-reset" variant="outline" size="sm" onClick={() => setSearchTerm('')}>
              <RotateCcw className="h-4 w-4 mr-1" />{tCommon('reset')}
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button data-testid="groups-new" onClick={() => { setEditingGroup(null); setActiveTab(type); setDialogOpen(true); }}>
              <Plus className="h-4 w-4 mr-1" />{t('newGroupOfType', { typeLabel: t(`${type}Group`) })}
            </Button>
            <Button
              data-testid="groups-batch-import"
              variant="outline"
              onClick={() => { setBatchImportRuleId(''); setBatchImportOpen(true); }}
            >
              <Upload className="h-4 w-4 mr-1" />{t('batchImport')}
            </Button>
            <Button
              data-testid="groups-export-all"
              variant="outline"
              disabled={exportingAll}
              onClick={() => handleExportAll(type)}
            >
              {exportingAll
                ? <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                : <Download className="h-4 w-4 mr-1" />}
              {tCommon('export')}
            </Button>
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('groupName')}</TableHead>
              <TableHead>{t('columnType')}</TableHead>
              <TableHead className="text-center">{t('memberCount')}</TableHead>
              <TableHead className="text-center">{t('referenceCount')}</TableHead>
              <TableHead className="w-[160px]">{tCommon('actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map(g => (
              <TableRow key={g.ruleId} data-testid={`groups-row-${g.ruleId}`}>
                <TableCell className="font-medium">{g.name}</TableCell>
                <TableCell><Badge variant="secondary" className={TYPE_BADGE_COLOR[g.type]}>{t(`${g.type}Group`)}</Badge></TableCell>
                <TableCell className="text-center" data-testid={`groups-member-count-${g.ruleId}`}>
                  {g.memberCount === null
                    ? <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">{t('complexCondition')}</Badge>
                    : g.memberCount}
                </TableCell>
                <TableCell className="text-center" data-testid={`groups-reference-count-${g.ruleId}`}>{g.referenceCount}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" data-testid={`groups-row-import-${g.ruleId}`}
                      disabled={importingRuleId === g.ruleId}
                      onClick={() => {
                        pendingImportGroupRef.current = g;
                        queueMicrotask(() => fileInputRef.current?.click());
                      }}
                      title={t('importMembersFor', { name: g.name })}>
                      {importingRuleId === g.ruleId
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <Upload className="h-4 w-4" />}
                    </Button>
                    <Button variant="ghost" size="icon" data-testid={`groups-row-export-${g.ruleId}`}
                      disabled={exportingRuleId === g.ruleId}
                      onClick={() => handleExport(g)}
                      title={t('exportMembersFor', { name: g.name })}>
                      {exportingRuleId === g.ruleId
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <Download className="h-4 w-4" />}
                    </Button>
                    <Button variant="ghost" size="icon" data-testid={`groups-row-edit-${g.ruleId}`}
                      onClick={() => {
                        if (g.memberCount === null) {
                          setComplexGroup(g);
                          return;
                        }
                        setEditingGroup(g);
                        setDialogOpen(true);
                      }}
                      title={g.memberCount === null ? t('complexConditionTip') : tRules('editRule')}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" data-testid={`groups-row-delete-${g.ruleId}`}
                      disabled={g.referenceCount > 0}
                      onClick={() => setDeletingGroup(g)}
                      title={g.referenceCount > 0 ? t('deleteBlocked', { count: g.referenceCount }) : tCommon('delete')}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {list.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">{tCommon('noData')}</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TabsContent>
    );
  };

  if (!isSystemAdmin && !isTenantAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <h1 className="text-2xl font-bold">403</h1>
          <p className="text-muted-foreground">{tCommon('accessDenied')}</p>
        </div>
      </div>
    );
  }

  const batchImportCandidates = (groupsByType.map[activeTab] ?? []).filter(g => g.type !== 'feature');

  // 作为「群组策略」合并页的卡片一嵌入渲染（demo：同页两卡片，仅一个页级页头），
  // 不再自带 PageShell/PageHeader；刷新由外层页头统一触发（invalidate ['groups']）。
  return (
    <>
      {isLoading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin" /></div>
      ) : (
        <Card data-testid="groups-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">{platformScope ? t('platformIpGroupTitle') : t('title')}</CardTitle>
          </CardHeader>
          <CardContent>
            {platformScope && (
              <div className="mb-4 flex items-start gap-2 rounded-md border border-info/20 bg-info/10 px-4 py-3 text-sm text-info" data-testid="groups-platform-scope-hint">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="text-pretty">{t('platformScopeHint')}</span>
              </div>
            )}
            <Tabs value={activeTab} onValueChange={v => setActiveTab(v as GroupType)}>
              {/* 单类型（平台作用域仅 IP 组）时无需类型切换栏 */}
              {allowedTypes.length > 1 && (
                <TabsList>
                  {allowedTypes.map(t2 => <TabsTrigger key={t2} value={t2} data-testid={`groups-tab-${t2}`}>{t(`${t2}Group`)}</TabsTrigger>)}
                </TabsList>
              )}
              {allowedTypes.map(renderTab)}
            </Tabs>
          </CardContent>
        </Card>
      )}
      <Dialog open={batchImportOpen} onOpenChange={setBatchImportOpen}>
        <DialogContent className="sm:max-w-md" data-testid="groups-batch-import-dialog" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{t('batchImport')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">{t('batchImportHint')}</p>
            <Select value={batchImportRuleId} onValueChange={v => setBatchImportRuleId(v ?? '')}>
              <SelectTrigger data-testid="groups-batch-import-target">
                <SelectValue placeholder={t('batchImportTargetGroup')} />
              </SelectTrigger>
              <SelectContent>
                {batchImportCandidates.map(g => (
                  <SelectItem key={g.ruleId} value={String(g.ruleId)}>{g.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchImportOpen(false)}>{tCommon('cancel')}</Button>
            <Button
              data-testid="groups-batch-import-confirm"
              disabled={!batchImportRuleId}
              onClick={() => {
                const g = batchImportCandidates.find(x => String(x.ruleId) === batchImportRuleId);
                if (!g) return;
                pendingImportGroupRef.current = g;
                setBatchImportOpen(false);
                queueMicrotask(() => fileInputRef.current?.click());
              }}
            >
              {t('chooseFile')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <input
        type="file"
        accept=".txt,.csv,text/plain"
        hidden
        ref={fileInputRef}
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) handleImportFile(f);
        }}
      />
      <GroupEditDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initialGroup={editingGroup}
        initialType={activeTab}
        existingNames={allGroups.map(g => g.name)}
        allowedTypes={allowedTypes}
        onSubmit={handleSubmit}
        onSwitchToFeature={() => {
          setFeatureEditingGroup(null);
          setActiveTab('feature');
          setFeatureDrawerOpen(true);
        }}
      />
      <FeatureGroupDrawer
        open={featureDrawerOpen}
        onOpenChange={setFeatureDrawerOpen}
        initialGroup={featureEditingGroup}
        initialRule={featureEditingGroup ? ruleById.get(featureEditingGroup.ruleId) ?? null : null}
        existingNames={allGroups.map(g => g.name)}
      />
      <ConfirmDialog
        open={deletingGroup != null}
        onOpenChange={open => !open && setDeletingGroup(null)}
        title={t('deleteConfirm')}
        onConfirm={() => deletingGroup && deleteMutation.mutate(deletingGroup.ruleId)}
        variant="destructive"
      />
      {/* GT-12260：导入部分成功时逐行展示失败值、行号与原因 */}
      <Dialog open={importFailures != null} onOpenChange={open => !open && setImportFailures(null)}>
        <DialogContent className="max-w-2xl" data-testid="import-failures-dialog" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>
              {t('importFailuresTitle', {
                name: importFailures?.groupName ?? '',
                imported: importFailures?.imported ?? 0,
                failed: importFailures?.failed.length ?? 0,
              })}
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[50vh] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]">{t('importFailureLine')}</TableHead>
                  <TableHead>{t('importFailureValue')}</TableHead>
                  <TableHead>{t('importFailureReason')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(importFailures?.failed ?? []).map((f, i) => (
                  <TableRow key={`${f.line}-${i}`} data-testid={`import-failure-row-${f.line}`}>
                    <TableCell className="tabular-nums">{f.line}</TableCell>
                    <TableCell className="break-all font-mono text-xs">{f.value}</TableCell>
                    <TableCell className="text-destructive text-xs">{f.reason}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportFailures(null)}>{tCommon('close')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={complexGroup != null}
        onOpenChange={open => !open && setComplexGroup(null)}
        title={t('complexCondition')}
        description={t('complexConditionTip')}
        onConfirm={() => router.push('/rules/tag')}
      />
    </>
  );
}
