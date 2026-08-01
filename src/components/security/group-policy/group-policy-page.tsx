'use client';

import { Fragment, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, RefreshCw, Loader2, GitBranch, Info, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { PageHeader, PageShell, PageSurface } from '@/components/shared/page-shell';
import { useApiRequest } from '@/lib/api/client';
import { useTenant } from '@/hooks/use-tenant';
import { usePermission } from '@/hooks/use-permission';
import { useProductForm } from '@/contexts/product-form-context';
import { toast } from 'sonner';
import type { GroupPolicyRule, TargetGroups } from '@/types/group-policy';
import {
  deleteGroupPolicy,
  listGroupPolicies,
} from '@/lib/api/group-policy';
import { GroupManagementPage } from '@/components/security/groups/group-management-page';
import { GroupPolicyDrawer } from './group-policy-drawer';
import { EffectivePathPreview } from './effective-path-preview';
import {
  TARGET_GROUP_KEYS,
  TARGET_GROUP_TYPE,
} from '@/types/group-policy';
import { STAGE_POLICIES, findPolicy } from './stage-policies';
import { RuleConfigDetail, STATUS_BADGE_COLOR, stageNumberForPolicy } from './rule-config-detail';
import { useApiErrorMessage } from '@/lib/api/use-api-error-message';

const QUERY_KEY = ['group-policies'] as const;

const TARGET_BADGE_COLOR: Record<keyof TargetGroups, string> = {
  senderGroup: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  senderIpGroup: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  recipientGroup: 'bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300',
  contentGroup: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  featureGroup: 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
};

export function GroupPolicyPage() {
  const t = useTranslations();
  const apiErrorMessage = useApiErrorMessage();
  const tGp = useTranslations('groupPolicy');
  const tCommon = useTranslations('common');
  const queryClient = useQueryClient();
  const { effectiveTenantId } = useTenant();
  const { isSystemAdmin, isTenantAdmin } = usePermission();
  const { apiRequest } = useApiRequest();
  const { capabilities } = useProductForm();

  const aiEnabled = !!capabilities?.ai;
  // Group management is tenant-owned in multi-tenant forms. The sidebar is
  // hidden by the feature registry for a platform viewer, but a user can still
  // paste /security/groups into the address bar; do not render or fetch the
  // tenant data in that case.
  const platformWithoutTenant = !!capabilities?.multiTenant && isSystemAdmin && effectiveTenantId === null;

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<GroupPolicyRule | null>(null);
  const [deletingPolicy, setDeletingPolicy] = useState<GroupPolicyRule | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  // 策略配置详情展开的规则 id 集合（demo expandedRuleIds）
  const [expandedRuleIds, setExpandedRuleIds] = useState<Set<number>>(new Set());
  const toggleRuleExpand = (id: number) =>
    setExpandedRuleIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const { data: policies, isLoading, isFetching, refetch } = useQuery<GroupPolicyRule[]>({
    queryKey: [...QUERY_KEY, effectiveTenantId],
    queryFn: () => listGroupPolicies(apiRequest),
    enabled: !platformWithoutTenant,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteGroupPolicy(apiRequest, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success(tCommon('deleteSuccess'));
      setDeletingPolicy(null);
    },
    onError: (e: Error) => toast.error(apiErrorMessage(e)),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) =>
      apiRequest(`/unified-rules/${id}`, { method: 'PUT', body: { is_active: isActive } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: (e: Error) => toast.error(apiErrorMessage(e)),
  });

  const targetGroupBadges = (rule: GroupPolicyRule) =>
    TARGET_GROUP_KEYS.flatMap((k) =>
      (rule.targetGroups[k] ?? []).map((tag) => (
        <Badge key={`${k}-${tag}`} variant="outline" className={`text-xs ${TARGET_BADGE_COLOR[k]}`}>
          {tGp(`targetGroupTypes.${TARGET_GROUP_TYPE[k]}`)}:{tag}
        </Badge>
      )),
    );

  // 策略配置列（demo 口径）：▸/▾ 展开按钮 + 逐条「【阶段N】+ 摘要徽标」，
  // 徽标文案优先 summary，无 summary 时回退模块名，配色按状态三色
  const policySummary = (rule: GroupPolicyRule, expanded: boolean) => {
    const entries = Object.entries(rule.stagePolicies ?? {})
      .sort(([a], [b]) => stageNumberForPolicy(a) - stageNumberForPolicy(b));
    return (
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={() => toggleRuleExpand(rule.id)}
          className="inline-flex items-center mt-0.5 text-muted-foreground hover:text-foreground shrink-0"
          aria-label={expanded ? tGp('collapseConfig') : tGp('expandConfig')}
          data-testid={`group-policy-rule-expand-${rule.id}`}
        >
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <div className="flex flex-wrap gap-2 items-center">
          {entries.length > 0 ? (
            entries.map(([key, entry]) => {
              const def = findPolicy(key);
              const label = entry.summary || (def ? t(def.nameKey) : key);
              return (
                <div key={key} className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground">
                    {tGp('stagePrefix', { stage: stageNumberForPolicy(key) })}
                  </span>
                  <Badge variant="secondary" className={`text-xs ${STATUS_BADGE_COLOR[entry.status]}`}>
                    {label}
                  </Badge>
                </div>
              );
            })
          ) : (
            <span className="text-xs text-muted-foreground">{tGp('noPolicyConfigured')}</span>
          )}
        </div>
      </div>
    );
  };

  const stageCount = useMemo(() => STAGE_POLICIES.filter((s) => !s.requiresAI || aiEnabled).length, [aiEnabled]);

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

  if (platformWithoutTenant) {
    return (
      <div className="flex items-center justify-center min-h-[400px]" data-testid="group-management-tenant-required">
        <div className="text-center">
          <h1 className="text-2xl font-bold">403</h1>
          <p className="text-muted-foreground">{tCommon('accessDenied')}</p>
        </div>
      </div>
    );
  }

  return (
    <PageShell>
      <PageHeader
        eyebrow={tGp('eyebrow')}
        title={tGp('title')}
        actions={
          <Button
            variant="outline"
            data-testid="group-policy-refresh"
            onClick={() => {
              // 页级刷新统一驱动两张卡片：策略列表 + 群组列表
              refetch();
              queryClient.invalidateQueries({ queryKey: ['groups'] });
            }}
            disabled={isFetching}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
            {tCommon('refresh')}
          </Button>
        }
      />
      {/* 卡片一：群组管理（demo 顺序：群组管理在上、群组策略规则在下） */}
      <PageSurface>
        <GroupManagementPage />
      </PageSurface>

      {/* 卡片二：群组策略规则 */}
      <PageSurface>
        <Card data-testid="group-policy-card">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <CardTitle className="text-lg">{tGp('policyCardTitle')}</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">{tGp('policyCardDescription')}</p>
                {/* 执行顺序 vs 优先级说明条（demo；方向按项目定义：数值越大越优先） */}
                <div className="flex items-start gap-2 mt-2 p-2.5 rounded-md bg-blue-50 border border-blue-100 dark:bg-blue-950/30 dark:border-blue-900" data-testid="group-policy-order-note">
                  <Info className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
                    {tGp('executionOrderNote')}
                  </p>
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button
                  variant="outline"
                  data-testid="group-policy-preview-path"
                  onClick={() => setPreviewOpen(true)}
                >
                  <GitBranch className="h-4 w-4 mr-1" />
                  {tGp('previewPath')}
                </Button>
                <Button
                  data-testid="group-policy-new"
                  onClick={() => {
                    setEditingPolicy(null);
                    setDrawerOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  {tGp('newPolicy')}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[180px]">{tGp('name')}</TableHead>
                    <TableHead className="w-[260px]">{tGp('targetGroups')}</TableHead>
                    <TableHead>{tGp('policyConfig')}</TableHead>
                    <TableHead className="w-[70px] text-center">{tCommon('status')}</TableHead>
                    <TableHead className="w-[90px] text-center">
                      <div className="flex items-center justify-center gap-1">
                        {tGp('priority')}
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <button type="button" className="inline-flex" aria-label={tGp('priorityHintAria')} data-testid="group-policy-priority-tooltip">
                                  <Info className="h-3.5 w-3.5 text-muted-foreground" />
                                </button>
                              }
                            />
                            <TooltipContent className="max-w-[260px]">{tGp('priorityHint')}</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </TableHead>
                    <TableHead className="w-[120px]">{tCommon('actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(policies ?? []).map((rule) => {
                    const expanded = expandedRuleIds.has(rule.id);
                    return (
                    <Fragment key={rule.id}>
                    <TableRow className={!rule.isActive ? 'opacity-50' : ''} data-testid={`group-policy-rule-row-${rule.id}`}>
                      <TableCell className="font-medium">
                        <div>{rule.name}</div>
                        {rule.description && (
                          <div className="text-xs text-muted-foreground line-clamp-1">{rule.description}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">{targetGroupBadges(rule)}</div>
                      </TableCell>
                      <TableCell>{policySummary(rule, expanded)}</TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={rule.isActive}
                          data-testid={`group-policy-rule-toggle-${rule.id}`}
                          onCheckedChange={() =>
                            toggleMutation.mutate({ id: rule.id, isActive: !rule.isActive })
                          }
                        />
                      </TableCell>
                      <TableCell className="font-mono text-sm text-center" data-testid={`group-policy-rule-priority-${rule.id}`}>
                        {String(rule.priority).padStart(4, '0')}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            data-testid={`group-policy-rule-edit-${rule.id}`}
                            onClick={() => {
                              setEditingPolicy(rule);
                              setDrawerOpen(true);
                            }}
                            title={tGp('editPolicy')}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            data-testid={`group-policy-rule-delete-${rule.id}`}
                            onClick={() => setDeletingPolicy(rule)}
                            title={tCommon('delete')}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {expanded && (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={6} className="bg-muted/30 p-0">
                          <RuleConfigDetail rule={rule} aiEnabled={aiEnabled} />
                        </TableCell>
                      </TableRow>
                    )}
                    </Fragment>
                    );
                  })}
                  {(policies ?? []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        {tCommon('noData')}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              {tGp('stageCountHint', { count: stageCount })}
            </p>
          </CardContent>
        </Card>
      </PageSurface>

      <GroupPolicyDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        editingPolicy={editingPolicy}
        aiEnabled={aiEnabled}
        onSaved={() => setDrawerOpen(false)}
      />

      <EffectivePathPreview
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        rules={policies ?? []}
        aiEnabled={aiEnabled}
      />

      <ConfirmDialog
        open={deletingPolicy != null}
        onOpenChange={(open) => !open && setDeletingPolicy(null)}
        title={tGp('deleteConfirm')}
        description={deletingPolicy ? tGp('deleteConfirmDesc', { name: deletingPolicy.name }) : ''}
        variant="destructive"
        onConfirm={() => deletingPolicy && deleteMutation.mutate(deletingPolicy.id)}
      />
    </PageShell>
  );
}
