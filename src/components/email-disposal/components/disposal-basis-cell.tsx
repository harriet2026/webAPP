'use client';

import { useTranslations } from 'next-intl';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { useProductForm } from '@/contexts/product-form-context';
import type { DisposalBasis } from '@/types/email-disposal';
import {
  formatListReason,
  formatMultiBasisListReason,
  getModuleName,
  groupRecipientBasisByPolicy,
  isStage1Policy,
  sortBasisGroupsForTooltip,
  type DisposalLang,
} from '../lib/disposal-basis-config';

interface DisposalBasisCellProps {
  /** 邮件的处置依据；mixed 记录（群发邮件多依据）通过 per_recipient[] 携带
   *  逐收件人命中信息，详见 groupRecipientBasisByPolicy()。 */
  basis: DisposalBasis | undefined;
  /** disposal_basis 为空时的自由文本兜底（GT-12578/12686：不参与合成的规
   *  则命中后仍要在列表可见）。 */
  reason: string | undefined;
  lang: DisposalLang;
  /** 当前生效的"处置依据"筛选值（策略模块/具体规则），用于把命中筛选值
   *  的桶排到主文案与 Tooltip 最前面。不传时不做任何优先级排序。 */
  highlightPolicyKeys?: string[];
  highlightRuleIds?: string[];
}

// "处置依据"列：群发邮件多处置依据支撑（GT-12946）。
//
// 视觉语言与"执行动作"/"邮件状态"两列刻意不同——那两列复用彩色 Badge 组
// 件（结果类维度，7 类封闭枚举有天然可复用的语义配色）；处置依据是开放的
// ~30 个策略模块 + 具体规则组合，硬套彩色徽章只会让配色显得随意。这里维持
// 现状的纯文本 + Tooltip 风格：
// - 单模块命中：不变，直接是 formatListReason() 的摘要文本。
// - 多模块命中：主文案 = 优先桶摘要 + "等 N 项"（N = 模块数，与主文案同
//   等字重，不做灰色弱化——没有 Badge 可承载主次层级，弱化反而显得突兀）。
// - Tooltip 按 policy_key 分组展开，组标题"模块（N 人）"，组内逐收件人展
//   示"邮箱 — 规则：规则名（规则ID）"，命中筛选值的组排最前。
// - 阶段1平台策略遮蔽按组生效：命中平台策略的组标题/规则名替换为遮蔽占位
//   文案，其余真实模块组正常展示、互不影响。
export function DisposalBasisCell({
  basis,
  reason,
  lang,
  highlightPolicyKeys,
  highlightRuleIds,
}: DisposalBasisCellProps) {
  const t = useTranslations('emailDisposal.table');
  const tFeatures = useTranslations('emailDisposal.detail.features');
  const { viewer, capabilities } = useProductForm();
  const isTenantViewer = viewer === 'tenant' && capabilities?.multiTenant === true;

  if (!basis?.policy_key && !basis?.per_recipient?.length) {
    if (reason) {
      // GT-12578 / GT-12686：disposal_basis 为空（未参与合成）时回退现有
      // MailLog.Reason 自由文本，此前这里直接落 '—' 会让 mail_marking 这
      // 类规则命中后列表上什么都看不到。
      return (
        <Tooltip>
          <TooltipTrigger render={<span className="cursor-default truncate block" />}>
            {reason}
          </TooltipTrigger>
          <TooltipContent className="max-w-md text-xs">{reason}</TooltipContent>
        </Tooltip>
      );
    }
    return <>{'—'}</>;
  }

  const groups = groupRecipientBasisByPolicy(basis);

  // 没有 per_recipient（非 mixed，或未提供多依据的既有 mixed 记录）时退化
  // 为单值渲染，与修改前的行为完全一致。
  if (groups.length <= 1) {
    const isPlatformPolicy = isTenantViewer && isStage1Policy(basis.policy_key);
    const label = isPlatformPolicy
      ? tFeatures('platformPolicyListReason')
      : formatListReason(basis, lang);
    return (
      <Tooltip>
        <TooltipTrigger render={<span className="cursor-default truncate block" />}>
          {label}
        </TooltipTrigger>
        <TooltipContent className="max-w-md text-xs">
          {isPlatformPolicy ? tFeatures('platformPolicyHitDetail') : label}
        </TooltipContent>
      </Tooltip>
    );
  }

  const mainLabel = formatMultiBasisListReason(
    groups,
    lang,
    highlightPolicyKeys,
    highlightRuleIds,
  );
  const orderedGroups = sortBasisGroupsForTooltip(
    groups,
    highlightPolicyKeys,
    highlightRuleIds,
  );

  return (
    <Tooltip>
      <TooltipTrigger render={<span className="cursor-default truncate block" />}>
        {mainLabel}
      </TooltipTrigger>
      <TooltipContent className="max-w-md text-xs space-y-2">
        {orderedGroups.map((group) => {
          const isPlatformPolicy = isTenantViewer && isStage1Policy(group.policyKey);
          const moduleLabel = isPlatformPolicy
            ? tFeatures('platformPolicyListReason')
            : getModuleName(group.policyKey, lang);
          return (
            <div key={group.policyKey}>
              <div className="font-medium">
                {t('disposalBasisGroupHeader', {
                  module: moduleLabel,
                  count: group.entries.length,
                })}
              </div>
              <ul className="mt-0.5 space-y-0.5">
                {group.entries.map((entry, i) => (
                  <li key={`${entry.recipient ?? i}-${entry.rule_id ?? i}`}>
                    {isPlatformPolicy
                      ? t('disposalBasisPlatformRuleLine', {
                          recipient: entry.recipient ?? '—',
                          policyLabel: tFeatures('platformPolicyListReason'),
                        })
                      : t('disposalBasisRuleLine', {
                          recipient: entry.recipient ?? '—',
                          ruleName: entry.rule_name ?? '',
                          ruleId: entry.rule_id ?? '',
                        })}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </TooltipContent>
    </Tooltip>
  );
}
