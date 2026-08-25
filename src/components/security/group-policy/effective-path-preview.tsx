'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowDown, AlertTriangle, CircleSlash, GitBranch, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { GroupPolicyRule, PolicyStageEntry } from '@/types/group-policy';
import { visibleStages, stageNumberOf, type StageDef } from './stage-policies';
import { STATUS_BADGE_COLOR } from './rule-config-detail';

export interface EffectivePathPreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rules: GroupPolicyRule[];
  aiEnabled: boolean;
}

// 终态处置动作：命中即短路流水线（demo configTerminalActions 口径）。
// 注意：这是「基于策略配置的模拟推演」，实际处置以引擎为准（面板顶部有口径说明）。
const TERMINAL_ACTION_VALUES = ['quarantine', 'reject', 'block', 'drop'] as const;
const TERMINAL_KEYWORDS: Record<string, (typeof TERMINAL_ACTION_VALUES)[number]> = {
  隔离: 'quarantine',
  拒绝: 'reject',
  阻断: 'block',
  丢弃: 'drop',
};

function terminalActionsOf(entry: PolicyStageEntry): string[] {
  if (entry.status === 'disable') return [];
  const params = entry.params ?? {};
  if (params.observe === '1' || params.observe === true) return [];
  const hits = new Set<string>();
  for (const [k, v] of Object.entries(params)) {
    if (k === 'observe') continue;
    if (typeof v === 'string' && (TERMINAL_ACTION_VALUES as readonly string[]).includes(v)) {
      hits.add(v);
    }
  }
  if (entry.summary) {
    for (const [kw, action] of Object.entries(TERMINAL_KEYWORDS)) {
      if (entry.summary.includes(kw)) hits.add(action);
    }
  }
  return Array.from(hits);
}

interface Contribution {
  rule: GroupPolicyRule;
  policyKey: string;
  entry: PolicyStageEntry;
}

interface StageView {
  stage: StageDef;
  stageNum: number;
  byModule: Map<string, Contribution[]>;
  executed: boolean;
  terminal: { actions: string[]; rule: string; priority: number } | null;
}

// 有效执行路径预览（demo EffectivePathDialog）：选目标群组 → 合并命中的已启用
// 策略 → 阶段 1→5 时间线 + 同模块优先级仲裁 + 终态短路点。
// 仲裁方向按项目权威定义「数值越大越优先」（差异 #11：demo 源码方向相反，勿照抄）。
export function EffectivePathPreview({
  open,
  onOpenChange,
  rules,
  aiEnabled,
}: EffectivePathPreviewProps) {
  const t = useTranslations();
  const tGp = useTranslations('groupPolicy');

  const groupNames = useMemo(() => {
    const set = new Set<string>();
    for (const r of rules) {
      for (const tags of Object.values(r.targetGroups ?? {})) {
        for (const tag of tags ?? []) set.add(tag);
      }
    }
    return Array.from(set);
  }, [rules]);

  const [selected, setSelected] = useState('');
  const activeGroup = selected || groupNames[0] || '';

  // 命中该群组的已启用策略，按优先级降序（数值越大越优先，最优先排最前）
  const matching = useMemo(
    () =>
      rules
        .filter(
          (r) =>
            r.isActive &&
            Object.values(r.targetGroups ?? {}).some((tags) => (tags ?? []).includes(activeGroup)),
        )
        .sort((a, b) => b.priority - a.priority),
    [rules, activeGroup],
  );

  const stages = useMemo(() => visibleStages(aiEnabled), [aiEnabled]);

  const { stageViews, scStage, scAction, scRule, scPriority } = useMemo(() => {
    let shortCircuited = false;
    let sStage: number | null = null;
    let sAction = '';
    let sRule = '';
    let sPriority = 0;
    const views: StageView[] = [];
    for (const stage of stages) {
      const stageNum = stageNumberOf(stage.key);
      const stageKeys = new Set(stage.policies.map((p) => p.key));
      const contributions: Contribution[] = matching.flatMap((rule) =>
        Object.entries(rule.stagePolicies ?? {})
          .filter(([k, e]) => stageKeys.has(k) && e.status !== 'inherit')
          .map(([k, e]) => ({ rule, policyKey: k, entry: e })),
      );
      const byModule = new Map<string, Contribution[]>();
      for (const c of contributions) {
        byModule.set(c.policyKey, [...(byModule.get(c.policyKey) ?? []), c]);
      }
      const executed = !shortCircuited;
      let terminal: StageView['terminal'] = null;
      if (executed) {
        for (const c of contributions) {
          const acts = terminalActionsOf(c.entry);
          if (acts.length) {
            terminal = { actions: acts, rule: c.rule.name, priority: c.rule.priority };
            break;
          }
        }
        if (terminal) {
          shortCircuited = true;
          sStage = stageNum;
          sAction = terminal.actions.map((a) => tGp(`terminalActions.${a}`)).join('/');
          sRule = terminal.rule;
          sPriority = terminal.priority;
        }
      }
      views.push({ stage, stageNum, byModule, executed, terminal });
    }
    return { stageViews: views, scStage: sStage, scAction: sAction, scRule: sRule, scPriority: sPriority };
  }, [stages, matching, tGp]);

  // 被短路跳过、且优先级更大（更优先）的规则——解释「高优先级不生效」的反直觉现象
  const ignoredHigherPriority = useMemo(() => {
    if (scStage == null) return [];
    return matching.filter(
      (r) =>
        r.priority > scPriority &&
        Object.keys(r.stagePolicies ?? {}).every((k) => {
          for (const stage of stages) {
            if (stage.policies.some((p) => p.key === k)) return stageNumberOf(stage.key) > scStage;
          }
          return true;
        }),
    );
  }, [matching, scStage, scPriority, stages]);

  const pad4 = (n: number) => String(n).padStart(4, '0');

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-3xl w-full flex flex-col p-0" data-testid="group-policy-path-preview" showCloseButton={false}>
        <SheetHeader className="px-6 py-4 border-b">
          <SheetTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5" />
            {tGp('previewTitle')}
          </SheetTitle>
          <p className="text-sm text-muted-foreground">{tGp('previewDescription')}</p>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <div className="flex items-center gap-3">
            <Label className="text-sm shrink-0">{tGp('previewSelectGroup')}</Label>
            <Select value={activeGroup} onValueChange={(v) => setSelected(v ?? '')}>
              <SelectTrigger className="w-[240px]" data-testid="group-policy-path-group-select">
                <SelectValue placeholder={tGp('previewSelectPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {groupNames.map((g) => (
                  <SelectItem key={g} value={g}>{g}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground" data-testid="group-policy-path-matched-count">
              {tGp('previewMatchedCount', { count: matching.length })}
            </span>
          </div>

          {/* 模拟口径说明（D3）：这是前端推演，实际处置以引擎为准 */}
          <div className="flex items-start gap-2 text-xs text-muted-foreground" data-testid="group-policy-path-simulation-note">
            <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            {tGp('previewSimulationNote')}
          </div>

          {matching.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center" data-testid="group-policy-path-empty">
              {tGp('previewEmpty')}
            </div>
          ) : (
            <>
              {/* 命中策略一览（按优先级降序，数值越大越优先） */}
              <div className="flex flex-wrap gap-2">
                {matching.map((r) => (
                  <Badge key={r.id} variant="outline" className="text-xs" data-testid={`group-policy-path-hit-${r.id}`}>
                    {tGp('previewHitBadge', { priority: pad4(r.priority), name: r.name })}
                  </Badge>
                ))}
              </div>

              {/* 短路提示横幅 */}
              {scStage != null && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-950/40 dark:border-amber-900" data-testid="group-policy-path-short-circuit">
                  <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-800 dark:text-amber-200 leading-relaxed space-y-1">
                    <p>{tGp('previewShortCircuit', { stage: scStage, rule: scRule, action: scAction })}</p>
                    {ignoredHigherPriority.length > 0 && (
                      <p>
                        {tGp('previewIgnoredHigher', {
                          rules: ignoredHigherPriority.map((r) => r.name).join('、'),
                        })}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* 阶段流水线时间线 */}
              <div className="space-y-2">
                {stageViews.map((sv, idx) => {
                  const moduleEntries = Array.from(sv.byModule.entries());
                  return (
                    <div key={sv.stage.key}>
                      <div
                        className={cn(
                          'rounded-lg border p-3',
                          !sv.executed && 'opacity-50',
                          sv.terminal
                            ? 'border-amber-300 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/30'
                            : 'bg-background',
                        )}
                        data-testid={`group-policy-path-stage-${sv.stageNum}`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">{t(sv.stage.nameKey)}</span>
                          {!sv.executed ? (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <CircleSlash className="h-3.5 w-3.5" />
                              {tGp('previewNotExecuted')}
                            </span>
                          ) : sv.terminal ? (
                            <span className="text-xs text-amber-700 dark:text-amber-300 font-medium">
                              {tGp('previewShortCircuitPoint', {
                                action: sv.terminal.actions.map((a) => tGp(`terminalActions.${a}`)).join('/'),
                              })}
                            </span>
                          ) : moduleEntries.length === 0 ? (
                            <span className="text-xs text-muted-foreground">{tGp('previewNoGroupConfig')}</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">{tGp('previewExecuted')}</span>
                          )}
                        </div>

                        {moduleEntries.length > 0 && (
                          <div className="mt-2 space-y-1.5">
                            {moduleEntries.map(([modKey, entries]) => {
                              const conflict = entries.length > 1;
                              // 同模块冲突仲裁：优先级数值最大者生效
                              const winner = entries.reduce((a, b) => (a.rule.priority >= b.rule.priority ? a : b));
                              const def = sv.stage.policies.find((p) => p.key === modKey);
                              return (
                                <div key={modKey} className="text-xs">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-medium">{def ? t(def.nameKey) : modKey}</span>
                                    {entries.map((e) => (
                                      <Badge
                                        key={e.rule.id}
                                        variant="secondary"
                                        className={`text-[11px] ${STATUS_BADGE_COLOR[e.entry.status]}`}
                                      >
                                        {e.rule.name}（{pad4(e.rule.priority)}）
                                        {e.entry.summary ? `·${e.entry.summary}` : ''}
                                      </Badge>
                                    ))}
                                  </div>
                                  {conflict && (
                                    <div className="text-[11px] text-violet-600 dark:text-violet-400 mt-0.5" data-testid={`group-policy-path-conflict-${modKey}`}>
                                      {tGp('previewConflict', { rule: winner.rule.name, priority: pad4(winner.rule.priority) })}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      {idx < stageViews.length - 1 && (
                        <div className="flex justify-center py-0.5">
                          <ArrowDown className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
