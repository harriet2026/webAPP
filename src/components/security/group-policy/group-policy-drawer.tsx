'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useApiRequest } from '@/lib/api/client';
import { useTenant } from '@/hooks/use-tenant';
import { useProductForm } from '@/contexts/product-form-context';
import type { Rule } from '@/types/unified-rules';
import type { Group } from '@/types/groups';
import { GROUP_TAG_PREFIX } from '@/types/groups';
import { GROUPS_LIST_QUERY, ruleToGroup } from '@/lib/api/groups';
import {
  TARGET_GROUP_KEYS,
  TARGET_GROUP_TYPE,
  type GroupPolicyFormValues,
  type GroupPolicyRule,
  type PolicyStatus,
  type StagePolicies,
  type TargetGroupKey,
  type TargetGroups,
} from '@/types/group-policy';
import {
  createGroupPolicy,
  updateGroupPolicy,
  emptyFormValues,
  groupPolicyPriorityRange,
  groupPolicyPriorityOutOfRange,
  selectableTargetGroups,
} from '@/lib/api/group-policy';
import { usePermission } from '@/hooks/use-permission';
import { visibleStages, type PolicyDef } from './stage-policies';
import { StagePolicyCard } from './stage-policy-card';
import { PolicyConfigPanel } from './policy-config-panel';

const NAME_RE = /^[A-Za-z0-9._\-一-龥]{1,64}$/;

const TARGET_BADGE_COLOR: Record<TargetGroupKey, string> = {
  senderGroup: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  senderIpGroup: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  recipientGroup: 'bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300',
  contentGroup: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  featureGroup: 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
};

// 「不限」哨兵值：base-ui Select 不允许空串 value
const TARGET_NONE = '__none__';

export interface GroupPolicyDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingPolicy: GroupPolicyRule | null;
  aiEnabled: boolean;
  onSaved?: () => void;
}

function tagOf(group: Group): string {
  return GROUP_TAG_PREFIX + group.name;
}

// 名单/基础设施类全局管控项折叠判定（demo isListOrInfraForced）：
// isGlobalForced 且非高风险 → 不以群组为配置维度，折叠为只读摘要卡
function isListOrInfraForced(p: PolicyDef): boolean {
  return p.isGlobalForced && !p.isHighRisk;
}

// 群组策略编辑抽屉（demo GroupPolicyDrawer）：80vw 三栏 ——
// 左栏适用对象（每类单选 Select + 已选 Badge）/ 中栏五阶段策略卡画布 /
// 右栏 320px 配置详情（点卡打开、可收起）。规则名称必填通栏置顶。
export function GroupPolicyDrawer({
  open,
  onOpenChange,
  editingPolicy,
  aiEnabled,
  onSaved,
}: GroupPolicyDrawerProps) {
  const t = useTranslations();
  const tGp = useTranslations('groupPolicy');
  const tCommon = useTranslations('common');
  const { apiRequest } = useApiRequest();
  const { effectiveTenantId } = useTenant();
  const { effectiveForm } = useProductForm();
  const queryClient = useQueryClient();
  const isEdit = editingPolicy != null;

  // 形态门控：云网关不支持自定义档（spec §4.4；本迭代 custom 本就置灰，cloud 下连置灰项都不显示）
  const supportsCustom = effectiveForm !== 'cloud';

  const [values, setValues] = useState<GroupPolicyFormValues>(emptyFormValues());
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [nameTouched, setNameTouched] = useState(false);
  // 右栏配置详情：当前选中的策略卡 + 面板展开态（demo selectedPolicy/configPanelOpen）
  const [selectedPolicy, setSelectedPolicy] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErrorMsg(null);
    setNameTouched(false);
    setSelectedPolicy(null);
    setPanelOpen(false);
    if (editingPolicy) {
      setValues({
        name: editingPolicy.name,
        description: editingPolicy.description,
        targetGroups: {
          senderGroup: [...(editingPolicy.targetGroups.senderGroup ?? [])],
          senderIpGroup: [...(editingPolicy.targetGroups.senderIpGroup ?? [])],
          recipientGroup: [...(editingPolicy.targetGroups.recipientGroup ?? [])],
          contentGroup: [...(editingPolicy.targetGroups.contentGroup ?? [])],
          featureGroup: [...(editingPolicy.targetGroups.featureGroup ?? [])],
        },
        stagePolicies: { ...(editingPolicy.stagePolicies ?? {}) },
        isActive: editingPolicy.isActive,
        priority: editingPolicy.priority,
      });
    } else {
      setValues(emptyFormValues());
    }
  }, [open, editingPolicy]);

  const { data: groups = [] } = useQuery<Group[]>({
    queryKey: ['groups', 'all'],
    queryFn: async () => {
      const qs = new URLSearchParams(GROUPS_LIST_QUERY).toString();
      const res = await apiRequest<{ items: Rule[] }>(`/unified-rules?${qs}`, { method: 'GET' });
      // GT-12273：只保留可保存的活跃群组（失效项选中后保存必然 400）。
      return selectableTargetGroups(res.items ?? [], ruleToGroup);
    },
    enabled: open,
  });

  const groupsByKey = useMemo(() => {
    const map: Record<TargetGroupKey, Group[]> = {
      senderGroup: [],
      senderIpGroup: [],
      recipientGroup: [],
      contentGroup: [],
      featureGroup: [],
    };
    for (const g of groups) {
      for (const key of TARGET_GROUP_KEYS) {
        if (g.type === TARGET_GROUP_TYPE[key]) map[key].push(g);
      }
    }
    return map;
  }, [groups]);

  const upsertMutation = useMutation({
    mutationFn: async () => {
      if (isEdit && editingPolicy) {
        return updateGroupPolicy(apiRequest, editingPolicy.id, values);
      }
      return createGroupPolicy(apiRequest, values, effectiveTenantId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group-policies'] });
      toast.success(tCommon('saveSuccess'));
      onSaved?.();
      onOpenChange(false);
    },
    onError: (e: Error) => {
      const msg = e.message ?? 'error';
      setErrorMsg(msg);
      toast.error(msg);
    },
  });

  // 适用对象：每类单选（demo Select×5；targetGroups 每类保留数组契约，写入 [tag] 或 []）
  const setTarget = (key: TargetGroupKey, tag: string | null) => {
    setValues((prev) => ({
      ...prev,
      targetGroups: {
        ...prev.targetGroups,
        [key]: tag && tag !== TARGET_NONE ? [tag] : [],
      } as TargetGroups,
    }));
  };

  const setPolicyStatus = (policyKey: string, status: PolicyStatus) => {
    setValues((prev) => {
      const next: StagePolicies = { ...prev.stagePolicies };
      if (status === 'inherit') {
        delete next[policyKey];
      } else {
        next[policyKey] = { status, params: prev.stagePolicies[policyKey]?.params };
      }
      return { ...prev, stagePolicies: next };
    });
  };

  // 规则名称实时校验（demo：红框 + 提示 + 保存禁用）
  const trimmedName = values.name.trim();
  const nameEmpty = trimmedName.length === 0;
  const namePatternBad = !nameEmpty && !NAME_RE.test(trimmedName);
  const nameInvalid = nameEmpty || namePatternBad;
  const showNameError = (nameTouched && nameEmpty) || namePatternBad;
  const nameErrorText = nameEmpty ? tGp('nameRequired') : t('groups.namePattern');

  const handleSubmit = async () => {
    setErrorMsg(null);
    setNameTouched(true);
    if (nameInvalid) return;
    const hasAnyTarget = TARGET_GROUP_KEYS.some((k) => values.targetGroups[k].length > 0);
    if (!hasAnyTarget) {
      setErrorMsg(tGp('errorNoTargetGroup'));
      return;
    }
    setSubmitting(true);
    try {
      await upsertMutation.mutateAsync();
    } finally {
      setSubmitting(false);
    }
  };

  const { isSystemAdmin } = usePermission();
  // GT-12276：与服务端 validatePriority 同口径——项目全局 0-9999，租户管理员
  // 收窄为 100-1000（GT-11507）。数值越大越优先。
  const { min: priorityMin, max: priorityMax } = groupPolicyPriorityRange(isSystemAdmin);
  const priorityOutOfRange = groupPolicyPriorityOutOfRange(values.priority, isSystemAdmin);
  // GT-11941：阶段1(IP 策略)对租户管理员整列只读。IP 频率限制 / IP 黑白名单属
  // 全局统一管控,按名单与连接层统一生效,不按群组配置;租户管理员可以**定义**
  // IP 组作为条件,但不能在这一阶段配置差异化策略。
  // 注意:这里收窄的是"阶段执行",不是"群组定义"——群组类型对所有角色开放。
  const stageIsReadOnly = (stageKey: string) => !isSystemAdmin && stageKey === 'stage1';

  const stages = visibleStages(aiEnabled);
  const selectedDef = useMemo(() => {
    if (!selectedPolicy) return null;
    for (const stage of stages) {
      const def = stage.policies.find((p) => p.key === selectedPolicy);
      if (def) return def;
    }
    return null;
  }, [stages, selectedPolicy]);

  const handleCardClick = (policyKey: string) => {
    if (selectedPolicy === policyKey) {
      setPanelOpen((v) => !v);
    } else {
      setSelectedPolicy(policyKey);
      setPanelOpen(true);
    }
  };

  const statusOf = (key: string): PolicyStatus => values.stagePolicies[key]?.status ?? 'inherit';

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        if (!v && (values.name || TARGET_GROUP_KEYS.some((k) => values.targetGroups[k].length > 0))) {
          if (!window.confirm(tCommon('unsavedChanges') as string)) return;
        }
        onOpenChange(v);
      }}
    >
      <SheetContent side="right" className="sm:max-w-none data-[side=right]:w-[80vw] flex flex-col p-0" data-testid="group-policy-drawer" showCloseButton={false}>
        <SheetHeader className="px-6 py-4 border-b">
          <SheetTitle>{isEdit ? tGp('editPolicy') : tGp('newPolicy')}</SheetTitle>
          <p className="text-sm text-muted-foreground">{tGp('drawerSubtitle')}</p>
        </SheetHeader>

        {/* 规则名称必填通栏（demo：置于内容区顶部，进入抽屉第一眼可见）+ 描述/优先级（保留既有能力） */}
        <div className="px-6 pt-4">
          <div className="flex flex-wrap gap-4 items-start">
            <div className="space-y-1.5 w-full max-w-xl">
              <Label htmlFor="group-policy-name" className="text-sm">
                {tGp('name')} <span className="text-red-500">*</span>
              </Label>
              <Input
                id="group-policy-name"
                value={values.name}
                onChange={(e) => {
                  setValues((p) => ({ ...p, name: e.target.value }));
                  if (!nameTouched) setNameTouched(true);
                }}
                placeholder={tGp('namePlaceholder')}
                aria-invalid={showNameError || undefined}
                aria-describedby={showNameError ? 'group-policy-name-error' : undefined}
                className={showNameError ? 'border-destructive focus-visible:ring-destructive' : ''}
                data-testid="group-policy-drawer-name"
              />
              {showNameError && (
                <p id="group-policy-name-error" className="text-xs text-destructive" data-testid="group-policy-drawer-name-error">
                  {nameErrorText}
                </p>
              )}
            </div>
            <div className="space-y-1.5 w-40">
              <Label className="text-sm">{tGp('priority')}</Label>
              <Input
                type="number"
                min={priorityMin}
                max={priorityMax}
                value={values.priority}
                onChange={(e) => setValues((p) => ({ ...p, priority: Number(e.target.value) || 0 }))}
                aria-describedby={priorityOutOfRange ? 'group-policy-priority-error' : undefined}
                className={priorityOutOfRange ? 'border-destructive focus-visible:ring-destructive' : ''}
                data-testid="group-policy-drawer-priority"
              />
              {/* GT-12276：输入约束与服务端 validatePriority 同口径（租户管理员
                  100-1000，平台管理员 0-9999），避免"UI 可填但保存 400"。 */}
              <p
                id="group-policy-priority-error"
                className={priorityOutOfRange ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}
                data-testid="group-policy-drawer-priority-range"
              >
                {tGp('priorityRange', { min: priorityMin, max: priorityMax })}
              </p>
            </div>
            <div className="space-y-1.5 flex-1 min-w-52">
              <Label className="text-sm">{tGp('description')}</Label>
              <Input
                value={values.description}
                onChange={(e) => setValues((p) => ({ ...p, description: e.target.value }))}
                placeholder={tGp('descriptionPlaceholder')}
                data-testid="group-policy-drawer-description"
              />
            </div>
          </div>
          {errorMsg && <p className="text-sm text-destructive mt-2" data-testid="group-policy-drawer-error">{errorMsg}</p>}
        </div>

        {/* 三栏布局：适用对象 / 五阶段画布 / 配置详情 */}
        <div className="flex-1 flex overflow-hidden mt-4 border-t">
          {/* 左栏：适用对象（200px，每类单选） */}
          <div className="w-[200px] border-r p-4 space-y-4 overflow-y-auto bg-muted/30 shrink-0" data-testid="group-policy-drawer-targets">
            <h3 className="font-medium text-sm text-muted-foreground">{tGp('sectionTargets')}</h3>
            <div className="space-y-3">
              {TARGET_GROUP_KEYS.map((key) => {
                const groupType = TARGET_GROUP_TYPE[key];
                const options = groupsByKey[key];
                const selected = values.targetGroups[key][0] ?? '';
                return (
                  <div key={key} className="space-y-2">
                    <Label className="text-xs">
                      {key === 'senderIpGroup' ? tGp('targetSenderIpLabel') : tGp(`targetGroupTypes.${groupType}`)}
                    </Label>
                    <Select
                      value={selected || null}
                      onValueChange={(v) => setTarget(key, v)}
                    >
                      <SelectTrigger className="h-8 text-xs w-full" data-testid={`group-policy-target-${groupType}`}>
                        <SelectValue placeholder={tGp('selectGroupPlaceholder')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={TARGET_NONE}>{tGp('targetNone')}</SelectItem>
                        {options.map((g) => (
                          <SelectItem key={g.ruleId} value={tagOf(g)}>{g.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}
            </div>

            {/* 已选对象 */}
            <div className="pt-4 border-t space-y-2">
              <p className="text-xs text-muted-foreground">{tGp('selectedTargets')}</p>
              {TARGET_GROUP_KEYS.flatMap((key) =>
                values.targetGroups[key].map((tag) => (
                  <Badge
                    key={`${key}-${tag}`}
                    variant="outline"
                    className={`text-xs ${TARGET_BADGE_COLOR[key]}`}
                    data-testid={`group-policy-selected-target-${TARGET_GROUP_TYPE[key]}`}
                  >
                    {tGp(`targetGroupTypes.${TARGET_GROUP_TYPE[key]}`)}:{tag.startsWith(GROUP_TAG_PREFIX) ? tag.slice(GROUP_TAG_PREFIX.length) : tag}
                  </Badge>
                )),
              )}
            </div>
          </div>

          {/* 中栏：五阶段策略卡画布 */}
          <div className="flex-1 p-4 overflow-auto" data-testid="group-policy-drawer-canvas">
            <h3 className="font-medium text-sm text-muted-foreground mb-4">{tGp('sectionPipeline')}</h3>
            <div className="flex gap-3 min-w-max">
              {stages.map((stage) => {
                const globalManaged = stage.policies.filter(isListOrInfraForced);
                const configurable = stage.policies.filter((p) => !isListOrInfraForced(p));
                const readOnly = stageIsReadOnly(stage.key);
                return (
                  <div key={stage.key} className="w-[180px] flex-shrink-0" data-testid={`group-policy-stage-column-${stage.key}`}>
                    <div className="p-2 rounded-t-lg text-center text-sm font-medium bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-300">
                      {t(stage.nameKey)}
                    </div>
                    <div
                      className={`border border-t-0 rounded-b-lg p-2 space-y-2 min-h-[300px] bg-muted/30${
                        readOnly ? ' opacity-60' : ''
                      }`}
                      aria-disabled={readOnly || undefined}
                      data-readonly={readOnly ? 'true' : undefined}
                      data-testid={`group-policy-stage-body-${stage.key}`}
                    >
                      {/* GT-12275（重开轮）：租户视角的阶段一不再暴露任何策略
                          卡（此前只读展示 RBL/海外等 4 张卡，越出"租户只配置
                          非阶段一"的角色边界），收敛为一张"平台统一管控"占位
                          说明卡。 */}
                      {readOnly ? (
                        <div
                          className="p-2.5 rounded-lg border border-dashed border-muted-foreground/30 bg-muted/40"
                          data-testid={`group-policy-stage-readonly-${stage.key}`}
                        >
                          <div className="flex items-center gap-1.5">
                            <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="text-xs font-medium text-muted-foreground">{tGp('globalManagedTitle')}</span>
                          </div>
                          <p className="text-[11px] text-muted-foreground/80 mt-1 leading-relaxed">
                            {tGp('stageReadOnlyForTenant')}
                          </p>
                          <p className="text-[11px] text-muted-foreground/80 mt-1 leading-relaxed">
                            {stage.policies.map((p) => t(p.nameKey)).join('、')}
                          </p>
                        </div>
                      ) : (
                      <>
                      {configurable.map((def) => (
                        <StagePolicyCard
                          key={def.key}
                          def={def}
                          status={statusOf(def.key)}
                          selected={selectedPolicy === def.key && panelOpen}
                          onClick={() => handleCardClick(def.key)}
                        />
                      ))}
                      {/* 名单/基础设施类全局管控项：折叠为只读摘要（demo 全局统一管控卡） */}
                      {globalManaged.length > 0 && (
                        <div className="p-2.5 rounded-lg border border-dashed border-muted-foreground/30 bg-muted/40" data-testid={`group-policy-global-managed-${stage.key}`}>
                          <div className="flex items-center gap-1.5">
                            <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="text-xs font-medium text-muted-foreground">{tGp('globalManagedTitle')}</span>
                          </div>
                          <p className="text-[11px] text-muted-foreground/80 mt-1 leading-relaxed">
                            {globalManaged.map((p) => t(p.nameKey)).join('、')}
                          </p>
                          <p className="text-[11px] text-muted-foreground/80 mt-0.5">{tGp('globalManagedNote')}</p>
                        </div>
                      )}
                      </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 右栏：配置详情（320px，可收起） */}
          {panelOpen && selectedDef && (
            <PolicyConfigPanel
              def={selectedDef}
              status={statusOf(selectedDef.key)}
              supportsCustom={supportsCustom}
              onChange={(next) => setPolicyStatus(selectedDef.key, next)}
            />
          )}
        </div>

        <SheetFooter className="px-6 py-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tCommon('cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || nameInvalid || priorityOutOfRange} data-testid="group-policy-drawer-save">
            {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {tCommon('save')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
