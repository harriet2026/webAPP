'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Info } from 'lucide-react';
import type { PolicyStatus } from '@/types/group-policy';
import type { PolicyDef } from './stage-policies';

// 右栏「配置详情」可选状态：三档可选 + custom 置灰展示（D1：params contract 未落地，
// 后端 validator 拒写 custom，本迭代仅按 demo 位置展示「敬请期待」，不可选）。
const SELECTABLE_STATUSES: PolicyStatus[] = ['inherit', 'enable', 'disable'];

export interface PolicyConfigPanelProps {
  def: PolicyDef;
  status: PolicyStatus;
  supportsCustom: boolean; // 形态门控：cloud 无自定义档（连置灰项也不显示）
  onChange: (next: PolicyStatus) => void;
}

// 群组策略抽屉右栏（demo renderConfigPanel）：全局默认参照卡 → 策略状态单选 →
// 意图引擎禁用高风险警告 → 海外检测禁用豁免原因。
export function PolicyConfigPanel({ def, status, supportsCustom, onChange }: PolicyConfigPanelProps) {
  const t = useTranslations();
  const tGp = useTranslations('groupPolicy');
  // 意图引擎禁用确认勾选（demo：仅 UI 勾选，不持久化）
  const [riskAcked, setRiskAcked] = useState(false);
  // 海外检测禁用豁免原因（demo：仅 UI，不持久化）
  const [exemptReason, setExemptReason] = useState('');

  const showCustomOption = supportsCustom && (def.hasParams || def.hasSubPolicies);

  return (
    <div className="w-[320px] border-l p-4 overflow-y-auto bg-muted/30 shrink-0" data-testid="group-policy-config-panel">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-medium text-sm text-muted-foreground">{tGp('configDetail')}</h3>
      </div>

      <div className="space-y-4">
        <h3 className="font-medium text-lg" data-testid="group-policy-config-panel-title">{t(def.nameKey)}</h3>

        {/* 全局默认配置只读参照（demo PolicyGlobalReference 的精简单行版，
            结构化 rows 依赖各全局模块的默认值契约，等 params contract 一并落地） */}
        <div className="rounded-lg border border-blue-100 bg-blue-50/60 dark:bg-blue-950/30 dark:border-blue-900 p-3" data-testid="group-policy-global-reference">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Info className="h-3.5 w-3.5 text-blue-500 shrink-0" />
            <span className="text-xs font-medium text-blue-700 dark:text-blue-300">{tGp('globalRefTitle')}</span>
          </div>
          <div className="text-xs text-blue-800 dark:text-blue-200">
            {def.globalDefaultKey ? t(def.globalDefaultKey) : tGp('globalDefaultInherit')}
          </div>
          <p className="text-[11px] text-blue-600/80 dark:text-blue-300/80 mt-2 leading-relaxed">
            {tGp('globalRefInheritNote')}
          </p>
        </div>

        {/* 策略状态四档单选 */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">{tGp('policyStateLabel')}</Label>
          <div className="space-y-2.5">
            {SELECTABLE_STATUSES.map((s) => (
              <label key={s} className="flex items-start gap-2 cursor-pointer">
                <input
                  type="radio"
                  name={`policy-state-${def.key}`}
                  checked={status === s}
                  onChange={() => onChange(s)}
                  className="w-4 h-4 mt-0.5 shrink-0"
                  data-testid={`group-policy-status-${def.key}-${s}`}
                />
                <span className="leading-tight">
                  <span className="block text-sm">{tGp(`policyStatus.${s}`)}</span>
                  <span className="block text-xs text-muted-foreground mt-0.5">
                    {tGp(`policyStatusNotes.${s}`)}
                  </span>
                </span>
              </label>
            ))}
            {showCustomOption && (
              // D1：custom 档置灰展示（敬请期待）；历史 custom 数据仍以选中态呈现
              <label className="flex items-start gap-2 cursor-not-allowed opacity-60">
                <input
                  type="radio"
                  name={`policy-state-${def.key}`}
                  checked={status === 'custom'}
                  disabled
                  readOnly
                  className="w-4 h-4 mt-0.5 shrink-0"
                  data-testid={`group-policy-status-${def.key}-custom`}
                />
                <span className="leading-tight">
                  <span className="flex items-center gap-1.5 text-sm">
                    {def.hasSubPolicies ? tGp('customSubChecks') : tGp('customParams')}
                    <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800">
                      {tGp('comingSoon')}
                    </Badge>
                  </span>
                  <span className="block text-xs text-muted-foreground mt-0.5">
                    {tGp('customComingSoonNote')}
                  </span>
                </span>
              </label>
            )}
          </div>
        </div>

        {/* 意图引擎禁用高风险警告（demo：红色横幅 + 我已知晓风险勾选） */}
        {def.isHighRisk && status === 'disable' && (
          <div className="p-3 bg-red-50 border border-red-200 dark:bg-red-950/40 dark:border-red-900 rounded-lg" data-testid="group-policy-high-risk-warning">
            <div className="flex items-start gap-2">
              <span className="text-red-500 font-bold">!</span>
              <div>
                <p className="text-sm text-red-700 dark:text-red-300 font-medium">{tGp('highRiskWarnTitle')}</p>
                <p className="text-xs text-red-600 dark:text-red-400 mt-1">{tGp('highRiskWarnIntentEngine')}</p>
                <label className="flex items-center gap-2 mt-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-4 h-4"
                    checked={riskAcked}
                    onChange={(e) => setRiskAcked(e.target.checked)}
                    data-testid="group-policy-high-risk-ack"
                  />
                  <span className="text-xs text-red-600 dark:text-red-400">{tGp('highRiskAck')}</span>
                </label>
              </div>
            </div>
          </div>
        )}

        {/* 海外邮件检测禁用 → 豁免原因（demo：纯 UI，不持久化） */}
        {def.key === 'overseas' && status === 'disable' && (
          <div className="space-y-2 pt-4 border-t">
            <Label>{tGp('overseasExemptReason')}</Label>
            <Textarea
              rows={3}
              value={exemptReason}
              onChange={(e) => setExemptReason(e.target.value)}
              placeholder={tGp('overseasExemptPlaceholder')}
              data-testid="group-policy-overseas-exempt-reason"
            />
          </div>
        )}
      </div>
    </div>
  );
}
