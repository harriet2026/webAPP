'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState, useMemo } from 'react';
import {
  Tag, Zap, ExternalLink,
  Info, Loader2, Power, PowerOff, ArrowDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter,
} from '@/components/ui/sheet';
import { getUnifiedRules, toggleUnifiedRule } from '@/lib/api/unified-rules';
import type { Rule, StageType, RuleNode, RuleMetadata } from '@/types/unified-rules';
import { useApiRequest } from '@/lib/api/client';
import { useTenant } from '@/hooks/use-tenant';
import { Link } from '@/i18n/navigation';
import { PageHeader, PageShell } from '@/components/shared/page-shell';
import { cn } from '@/lib/utils';
import { StatusBadge } from '@/components/shared/status-badge';
import { toast } from 'sonner';

// ─── Constants ────────────────────────────────────────────────────────────────

const STAGE_ORDER: StageType[] = ['onconnect', 'mail', 'rcpt', 'header', 'data'];
const SIDELINE_STAGE: StageType = 'sideline';

const STAGE_HREFS: Record<string, string> = {
  onconnect: '/rules/onconnect',
  mail: '/rules/mail',
  rcpt: '/rules/rcpt',
  header: '/rules/header',
  data: '/rules/data',
  sideline: '/rules/sideline',
};

const STAGE_LABELS: Record<string, string> = {
  onconnect: 'CONNECT',
  mail: 'MAIL FROM',
  rcpt: 'RCPT TO',
  header: 'HEADER',
  data: 'DATA',
  sideline: '旁路阶段',
};

const OPERATOR_KEYS: Record<string, string> = {
  eq: 'equal', ne: 'notEqual', contain: 'contain', not_contain: 'notContain',
  match: 'match', suffix: 'suffix', prefix: 'prefix', cidr: 'cidr',
  within: 'within', isNull: 'isNull', isNotNull: 'isNotNull',
  gt: 'greaterThan', lt: 'lessThan', ge: 'greaterEqual', le: 'lessEqual',
  hasTag: 'hasTag', hasAnyTag: 'hasAnyTag', hasAllTags: 'hasAllTags',
};

const ACTION_DESCRIPTIONS: Record<string, string> = {
  reject: '拒绝投递',
  disconnect: '断开连接',
  tempfail: '临时拒绝',
  quarantine: '移入隔离区',
  sideline: '转至旁路检测',
  audit: '移入审核队列',
  bounce: '退信',
  discard: '静默丢弃',
  accept: '放行',
};

// ─── Utilities ────────────────────────────────────────────────────────────────

type ActionCategory = 'terminate' | 'passthrough';

function categorizeAction(action: string | undefined): ActionCategory {
  return (action === 'accept' || action === 'quarantine') ? 'passthrough' : 'terminate';
}

function isHardStop(action: string | undefined): boolean {
  return ['reject', 'disconnect', 'tempfail', 'bounce', 'discard'].includes(action || '');
}

function terminateColor(action: string | undefined): 'red' | 'amber' {
  return isHardStop(action) ? 'red' : 'amber';
}

function snakeToCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function renderConditionNode(
  node: RuleNode,
  getField: (f: string) => string,
  getOp: (o: string) => string,
  conj: { and: string; or: string; not: string },
): string {
  if (node.type === 'condition') {
    const f = getField(node.field || '');
    const opKey = OPERATOR_KEYS[node.operator || ''] || node.operator || '';
    const o = getOp(opKey);
    const noVal = node.operator === 'isNull' || node.operator === 'isNotNull';
    const v = noVal ? '' : ` ${node.value || ''}`;
    return `${f} ${o}${v}`;
  }
  const children = (node.children || []).map(c => renderConditionNode(c, getField, getOp, conj));
  if (node.type === 'NOT') return `${conj.not}(${children[0] || ''})`;
  const sep = node.type === 'AND' ? ` ${conj.and} ` : ` ${conj.or} `;
  return children.join(sep);
}

function parseConditionTree(raw: string | RuleNode | null | undefined): RuleNode | null {
  if (!raw) return null;
  try { return typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return null; }
}

function parseMetadata(raw: string | null | undefined): RuleMetadata {
  if (!raw) return {};
  try { return typeof raw === 'string' ? JSON.parse(raw) : (raw as RuleMetadata); } catch { return {}; }
}

// ─── Rule summary ─────────────────────────────────────────────────────────────

function useRuleSummaryText(rule: Rule, maxLength = 90): { display: string; full: string } {
  const t = useTranslations('advancedRules');
  const tree = parseConditionTree(rule.condition_tree);

  let prefix = '';
  if (rule.rule_class === 'tag') {
    const tags = (rule.tags || []);
    prefix = tags.length > 0 ? `打标签 ${tags.slice(0, 3).join(', ')}${tags.length > 3 ? ' …' : ''}` : '打标签';
  } else {
    prefix = ACTION_DESCRIPTIONS[rule.action || ''] || rule.action || '';
  }

  let condText = '';
  if (tree) {
    const getField = (f: string) => { try { return t(`fields.${snakeToCamel(f)}`); } catch { return f; } };
    const getOp = (o: string) => { try { return t(`operators.${o}`); } catch { return o; } };
    condText = renderConditionNode(tree, getField, getOp, { and: '且', or: '或', not: '非' });
  }

  const full = condText ? `${prefix} | 当 ${condText}` : prefix;
  const display = full.length > maxLength ? full.slice(0, maxLength) + '…' : full;
  return { display, full };
}

function RuleSummary({ rule, maxLength = 90 }: { rule: Rule; maxLength?: number }) {
  const { display, full } = useRuleSummaryText(rule, maxLength);
  return (
    <span
      className="text-xs text-muted-foreground truncate block"
      title={full.length > maxLength ? full : undefined}
    >
      {display}
    </span>
  );
}

// ─── Condition tree viewer ────────────────────────────────────────────────────

function ConditionTreeNodeView({ node }: { node: RuleNode }) {
  const t = useTranslations('advancedRules');
  const getField = (f: string) => { try { return t(`fields.${snakeToCamel(f)}`); } catch { return f; } };
  const getOp = (o: string) => { try { return t(`operators.${o}`); } catch { return o; } };

  if (node.type === 'condition') {
    const noVal = node.operator === 'isNull' || node.operator === 'isNotNull';
    return (
      <div className="flex flex-wrap items-center gap-1.5 text-sm py-0.5">
        <span className="font-medium text-foreground">{getField(node.field || '')}</span>
        <Badge variant="outline" className="text-xs px-1.5 py-0">
          {getOp(OPERATOR_KEYS[node.operator || ''] || node.operator || '')}
        </Badge>
        {!noVal && node.value && (
          <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{node.value}</span>
        )}
      </div>
    );
  }

  const typeLabel =
    node.type === 'NOT' ? '非 (NOT)' :
    node.type === 'AND' ? t('allMustMatch') :
    t('anyMustMatch');
  const borderColor =
    node.type === 'AND' ? 'border-blue-300 dark:border-blue-700' :
    node.type === 'OR' ? 'border-amber-300 dark:border-amber-700' :
    'border-red-300 dark:border-red-700';

  return (
    <div className="space-y-1">
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{typeLabel}</div>
      <div className={cn('ml-2 space-y-1 border-l-2 pl-3', borderColor)}>
        {(node.children || []).map((child, i) => (
          <ConditionTreeNodeView key={i} node={child} />
        ))}
      </div>
    </div>
  );
}

// ─── Action badge ─────────────────────────────────────────────────────────────

function ActionBadge({ action }: { action: string | undefined }) {
  const cat = categorizeAction(action);
  if (cat === 'passthrough') {
    const icon = action === 'quarantine' ? '📥' : '✓';
    return (
      <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium shrink-0 bg-green-50 text-green-700 border border-green-200 dark:bg-green-950/60 dark:text-green-300 dark:border-green-800">
        {icon} {action}
      </span>
    );
  }
  const color = terminateColor(action);
  const cls = color === 'red'
    ? 'bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800'
    : 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800';
  const icon = color === 'red' ? '⊘' : '↗';
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium shrink-0', cls)}>
      {icon} {action || '?'}
    </span>
  );
}

// ─── Flow exit badge ──────────────────────────────────────────────────────────

function FlowExitBadge({ action }: { action: string | undefined }) {
  if (action === 'accept' || action === 'quarantine') return null;
  if (isHardStop(action)) {
    return (
      <span
        title="此动作命中后邮件流永久终止，不再进入后续阶段"
        className="text-[10px] font-bold text-red-500 shrink-0 whitespace-nowrap"
      >
        → EXIT
      </span>
    );
  }
  const label =
    action === 'sideline' ? '→ 旁路' :
    action === 'audit' ? '→ 审核' : '→ 转移';
  return (
    <span
      title={`邮件流终止于此，转入${label.slice(2)}队列`}
      className="text-[10px] font-bold text-amber-500 shrink-0 whitespace-nowrap"
    >
      {label}
    </span>
  );
}

// ─── Tag rule row ─────────────────────────────────────────────────────────────

function TagRuleRow({ rule, onSelect }: { rule: Rule; onSelect: (r: Rule) => void }) {
  return (
    <button
      onClick={() => onSelect(rule)}
      className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-left hover:bg-muted/50 transition-colors border-l-2 border-blue-300 dark:border-blue-700"
    >
      <span className="text-xs font-mono text-muted-foreground w-10 shrink-0 text-right">{rule.priority}</span>
      <div className="flex flex-wrap gap-1 shrink-0 max-w-[140px]">
        {(rule.tags || []).slice(0, 2).map((tag, i) => (
          <Badge key={i} variant={tag.startsWith('sys:') ? 'default' : 'secondary'} className="text-[10px] px-1.5 py-0">
            {tag}
          </Badge>
        ))}
        {(rule.tags || []).length > 2 && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">+{(rule.tags || []).length - 2}</Badge>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium truncate">{rule.name}</span>
          {!rule.is_active && <Badge variant="outline" className="text-[10px] px-1 py-0 opacity-60 shrink-0">禁用</Badge>}
        </div>
        <RuleSummary rule={rule} />
      </div>
    </button>
  );
}

// ─── Action rule row ──────────────────────────────────────────────────────────

function ActionRuleRow({ rule, onSelect }: { rule: Rule; onSelect: (r: Rule) => void }) {
  const color = rule.action === 'accept' ? 'green' : terminateColor(rule.action);
  const borderCls = { red: 'border-red-400', amber: 'border-amber-400', green: 'border-green-400' }[color];
  return (
    <button
      onClick={() => onSelect(rule)}
      className={cn('w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-left hover:bg-muted/50 transition-colors border-l-2', borderCls)}
    >
      <span className="text-xs font-mono text-muted-foreground w-10 shrink-0 text-right">{rule.priority}</span>
      <ActionBadge action={rule.action} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium truncate">{rule.name}</span>
          {!rule.is_active && <Badge variant="outline" className="text-[10px] px-1 py-0 opacity-60 shrink-0">禁用</Badge>}
        </div>
        <RuleSummary rule={rule} />
      </div>
      <FlowExitBadge action={rule.action} />
    </button>
  );
}

// ─── countByAction + ActionCountBadges ────────────────────────────────────────

const ACTION_BADGE_CLS: Record<string, string> = {
  '🏷 标签': 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800',
  reject:     'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800',
  bounce:     'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800',
  discard:    'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800',
  disconnect: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800',
  tempfail:   'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800',
  accept:     'bg-green-50 text-green-700 border-green-200 dark:bg-green-950/60 dark:text-green-300 dark:border-green-800',
  quarantine: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800',
  audit:      'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/60 dark:text-orange-300 dark:border-orange-800',
};

function countByAction(tagRules: Rule[], actionRules: Rule[]): Record<string, number> {
  const counts: Record<string, number> = {};
  if (tagRules.length > 0) counts['🏷 标签'] = tagRules.length;
  for (const r of actionRules) {
    const key = r.action || 'unknown';
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function ActionCountBadges({ tagRules, actionRules }: { tagRules: Rule[]; actionRules: Rule[] }) {
  const counts = countByAction(tagRules, actionRules);
  const entries = Object.entries(counts);
  if (entries.length === 0) {
    return <span className="text-[10px] text-muted-foreground/50">暂无规则</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {entries.map(([action, count]) => (
        <span
          key={action}
          className={cn(
            'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium border',
            ACTION_BADGE_CLS[action] ?? 'bg-muted text-muted-foreground border-border',
          )}
        >
          {action} ×{count}
        </span>
      ))}
    </div>
  );
}

// ─── Stage IO static config ───────────────────────────────────────────────────

interface IOEntry {
  badge: string;
  badgeCls: string;
  desc: string;
}

interface StageIOConfig {
  entries: IOEntry[];
}

const STAGE_ENTRY: Record<string, StageIOConfig> = {
  onconnect: {
    entries: [{ badge: '客户端 TCP 连接', badgeCls: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700', desc: '每封邮件从此起' }],
  },
  mail: {
    entries: [{ badge: 'CONNECT 无命中', badgeCls: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700', desc: '→ 进入本阶段' }],
  },
  rcpt: {
    entries: [{ badge: 'MAIL FROM 无命中', badgeCls: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700', desc: '→ 进入本阶段' }],
  },
  header: {
    entries: [{ badge: 'RCPT TO 无命中', badgeCls: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700', desc: '→ 进入本阶段' }],
  },
  data: {
    entries: [{ badge: 'HEADER 无命中', badgeCls: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700', desc: '→ 进入本阶段（收取完整邮件正文）' }],
  },
  sideline: {
    entries: [{ badge: 'DATA 无命中 + 入站邮件', badgeCls: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-700', desc: '默认旁路' }],
  },
};

const STAGE_EXIT: Record<string, StageIOConfig> = {
  onconnect: {
    entries: [
      { badge: 'reject',   badgeCls: ACTION_BADGE_CLS.reject,   desc: '拒绝连接' },
      { badge: 'disconnect', badgeCls: ACTION_BADGE_CLS.disconnect, desc: '断开连接' },
      { badge: 'tempfail', badgeCls: ACTION_BADGE_CLS.tempfail, desc: '临时失败，客户端稍后重试' },
      { badge: '无命中',   badgeCls: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700', desc: '→ 继续下一阶段' },
    ],
  },
  mail: {
    entries: [
      { badge: 'reject',  badgeCls: ACTION_BADGE_CLS.reject,  desc: '拒绝发件人（5xx）' },
      { badge: 'bounce',  badgeCls: ACTION_BADGE_CLS.bounce,  desc: '生成 DSN 退信' },
      { badge: '无命中',  badgeCls: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700', desc: '→ 继续下一阶段' },
    ],
  },
  rcpt: {
    entries: [
      { badge: 'reject',  badgeCls: ACTION_BADGE_CLS.reject,  desc: '拒绝该收件人' },
      { badge: '无命中',  badgeCls: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700', desc: '→ 继续下一阶段' },
    ],
  },
  header: {
    entries: [
      { badge: 'reject',  badgeCls: ACTION_BADGE_CLS.reject,  desc: '拒绝' },
      { badge: 'discard', badgeCls: ACTION_BADGE_CLS.discard, desc: '静默丢弃' },
      { badge: '无命中',  badgeCls: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700', desc: '→ 继续下一阶段' },
    ],
  },
  data: {
    entries: [
      { badge: 'reject',     badgeCls: ACTION_BADGE_CLS.reject,     desc: '拒绝（5xx）' },
      { badge: 'bounce',     badgeCls: ACTION_BADGE_CLS.bounce,     desc: '生成 DSN 退信' },
      { badge: 'discard',    badgeCls: ACTION_BADGE_CLS.discard,    desc: '静默丢弃' },
      { badge: 'accept',     badgeCls: ACTION_BADGE_CLS.accept,     desc: '直接投递（如白名单命中）' },
      { badge: 'quarantine', badgeCls: ACTION_BADGE_CLS.quarantine, desc: '进入隔离区' },
      { badge: 'audit',      badgeCls: ACTION_BADGE_CLS.audit,      desc: '→ 右侧审核队列' },
      { badge: '无命中·入站', badgeCls: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-700', desc: '→ 默认旁路（下方）' },
    ],
  },
  sideline: {
    entries: [
      { badge: 'accept',     badgeCls: ACTION_BADGE_CLS.accept,     desc: '投递' },
      { badge: 'quarantine', badgeCls: ACTION_BADGE_CLS.quarantine, desc: '进入隔离区' },
      { badge: 'reject',     badgeCls: ACTION_BADGE_CLS.reject,     desc: '拒绝退信' },
      { badge: 'discard',    badgeCls: ACTION_BADGE_CLS.discard,    desc: '静默丢弃' },
      { badge: '无命中',     badgeCls: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700', desc: '→ 默认投递' },
    ],
  },
};

function StageIOSection({
  label,
  labelCls,
  entries,
  borderCls,
}: {
  label: string;
  labelCls: string;
  entries: IOEntry[];
  borderCls: string;
}) {
  return (
    <div className={cn('border-t pt-2 mt-2', borderCls)}>
      <div className={cn('text-[10px] font-semibold uppercase tracking-wide mb-1.5', labelCls)}>
        {label}
      </div>
      <div className="space-y-1">
        {entries.map((e, i) => (
          <div key={i} className="flex items-center gap-1.5 text-[11px]">
            <span className={cn('rounded px-1.5 py-0.5 font-medium border whitespace-nowrap', e.badgeCls)}>
              {e.badge}
            </span>
            <span className="text-muted-foreground">{e.desc}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── StageNode ────────────────────────────────────────────────────────────────

interface StageNodeProps {
  stage: StageType;
  tagRules: Rule[];
  actionRules: Rule[];
  onClick: () => void;
  subtitle?: string;
  isSideline?: boolean;
}

function StageNode({ stage, tagRules, actionRules, onClick, subtitle, isSideline }: StageNodeProps) {
  const label = STAGE_LABELS[stage] ?? stage;
  const href = STAGE_HREFS[stage] as Parameters<typeof Link>[0]['href'];
  const entry = STAGE_ENTRY[stage];
  const exit = STAGE_EXIT[stage];
  const borderCls = isSideline
    ? 'border-amber-400 dark:border-amber-600'
    : 'border-slate-400 dark:border-slate-500';
  const sectionBorder = isSideline ? 'border-amber-200 dark:border-amber-800' : 'border-border/40';
  const sectionLabelCls = isSideline ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground';

  return (
    <div
      className={cn(
        'w-full rounded-xl border-2 bg-card cursor-pointer hover:bg-muted/20 transition-colors',
        isSideline ? 'bg-amber-50/40 dark:bg-amber-950/10' : '',
        borderCls,
      )}
      onClick={onClick}
      data-testid={`stage-node-${stage}`}
    >
      <div className="px-3 py-2.5">
        <div className="flex items-center justify-between mb-1">
          <span className="font-semibold text-sm">{label}</span>
          <div className="flex items-center gap-2 shrink-0">
            {!isSideline && (
              <Link
                href={`/rules/tag?stage=${stage}` as Parameters<typeof Link>[0]['href']}
                onClick={e => e.stopPropagation()}
                className="text-[10px] text-primary hover:underline flex items-center gap-0.5"
              >
                <Tag className="h-2.5 w-2.5" />标签管理
              </Link>
            )}
            <Link
              href={href}
              onClick={e => e.stopPropagation()}
              className="text-[10px] text-primary hover:underline flex items-center gap-0.5"
            >
              <ExternalLink className="h-2.5 w-2.5" />详情
            </Link>
          </div>
        </div>

        {subtitle && (
          <div className="text-[10px] text-muted-foreground mb-1.5">{subtitle}</div>
        )}

        <ActionCountBadges tagRules={tagRules} actionRules={actionRules} />

        {isSideline && (
          <div className="mt-2 space-y-1.5">
            <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-white dark:bg-amber-950/20 px-2 py-1.5">
              <div className="text-[10px] font-semibold text-amber-800 dark:text-amber-300 mb-0.5">🛡️ 附件安全扫描</div>
              <div className="text-[10px] text-muted-foreground">
                默认开 · <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded">sys:noattachscan</code>（所有收件人）可关
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5 pl-2 border-l-2 border-amber-300 dark:border-amber-700">
                解压&嵌套检测 · QR/图像扫描 + 短链展开 · Office宏/PDF脚本 · 🦠 反病毒
              </div>
            </div>
            <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-white dark:bg-amber-950/20 px-2 py-1.5">
              <div className="text-[10px] font-semibold text-amber-800 dark:text-amber-300 mb-0.5">🎣 钓鱼 LLM 检测</div>
              <div className="text-[10px] text-muted-foreground">
                默认关 · 任一收件人有 <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded">sys:phishagent</code> 开启
              </div>
            </div>
          </div>
        )}

        {entry && (
          <StageIOSection
            label="可能入口"
            labelCls={isSideline ? 'text-amber-700 dark:text-amber-400' : 'text-blue-600 dark:text-blue-400'}
            entries={entry.entries}
            borderCls={sectionBorder}
          />
        )}
        {exit && (
          <StageIOSection
            label="可能出口"
            labelCls={sectionLabelCls}
            entries={exit.entries}
            borderCls={sectionBorder}
          />
        )}
      </div>
    </div>
  );
}

// ─── StageSheet ───────────────────────────────────────────────────────────────

function StageSheet({
  stage,
  tagRules,
  actionRules,
  onClose,
  onSelectRule,
}: {
  stage: StageType | null;
  tagRules: Rule[];
  actionRules: Rule[];
  onClose: () => void;
  onSelectRule: (r: Rule) => void;
}) {
  const stageLabel = stage ? (STAGE_LABELS[stage] ?? stage) : '';
  const href = stage ? (STAGE_HREFS[stage] as Parameters<typeof Link>[0]['href']) : '/rules/data';
  const tagHref = '/rules/tag' as Parameters<typeof Link>[0]['href'];

  const sortedTag = [...tagRules].sort((a, b) => b.priority - a.priority);
  const sortedAction = [...actionRules].sort((a, b) => b.priority - a.priority);

  return (
    <Sheet open={!!stage} onOpenChange={open => !open && onClose()}>
      <SheetContent side="right" className="w-[480px] sm:w-[520px] p-0 flex flex-col">
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-border/60 shrink-0">
          <SheetTitle className="text-base font-semibold">{stageLabel} 阶段规则</SheetTitle>
          <div className="flex items-center gap-2 mt-1">
            <Link href={href} className="text-xs text-primary hover:underline flex items-center gap-1">
              <ExternalLink className="h-3 w-3" />前往详情页
            </Link>
            <span className="text-muted-foreground/40">·</span>
            <Link href={tagHref} className="text-xs text-primary hover:underline flex items-center gap-1">
              <Tag className="h-3 w-3" />标签规则页
            </Link>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          <div className="border-b border-border/30">
            <div className="px-4 py-1.5 flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
              <Tag className="h-3.5 w-3.5" />
              <span className="text-xs font-semibold uppercase tracking-wide">标签规则</span>
              {sortedTag.length > 0 && <span className="text-xs opacity-60">({sortedTag.length})</span>}
            </div>
            <div className="px-3 pb-2 space-y-0.5">
              {sortedTag.length === 0 ? (
                <div className="flex items-center gap-2 pl-4 py-1">
                  <span className="text-xs text-muted-foreground/50">暂无规则</span>
                  <Link href={tagHref} className="text-xs text-primary hover:underline">去创建 →</Link>
                </div>
              ) : sortedTag.map(r => <div key={r.id}><TagRuleRow rule={r} onSelect={onSelectRule} /></div>)}
            </div>
          </div>

          <div>
            <div className="px-4 py-1.5 flex items-center gap-1.5 text-foreground">
              <Zap className="h-3.5 w-3.5" />
              <span className="text-xs font-semibold uppercase tracking-wide">动作规则</span>
              {sortedAction.length > 0 && <span className="text-xs opacity-60">({sortedAction.length})</span>}
            </div>
            <div className="px-3 pb-4 space-y-0.5">
              {sortedAction.length === 0 ? (
                <div className="flex items-center gap-2 pl-4 py-1">
                  <span className="text-xs text-muted-foreground/50">暂无规则</span>
                  <Link href={href} className="text-xs text-primary hover:underline">去创建 →</Link>
                </div>
              ) : sortedAction.map(r => <div key={r.id}><ActionRuleRow rule={r} onSelect={onSelectRule} /></div>)}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── DashedArrow ──────────────────────────────────────────────────────────────

function DashedArrow({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center my-1">
      <div className="w-0.5 opacity-60"
           style={{ backgroundImage: 'repeating-linear-gradient(to bottom, #f59e0b 0, #f59e0b 4px, transparent 4px, transparent 8px)', height: '12px' }} />
      <div className="bg-amber-50 dark:bg-amber-950/40 border border-dashed border-amber-400 dark:border-amber-600 rounded px-2 py-0.5 text-[10px] text-amber-800 dark:text-amber-300 font-semibold whitespace-nowrap">
        {label}
      </div>
      <div className="w-0.5 opacity-60"
           style={{ backgroundImage: 'repeating-linear-gradient(to bottom, #f59e0b 0, #f59e0b 4px, transparent 4px, transparent 8px)', height: '12px' }} />
      <div className="text-amber-400 text-sm leading-none">▼</div>
    </div>
  );
}

// ─── AuditQueueNode ───────────────────────────────────────────────────────────

interface AuditQueueNodeProps {
  title: string;
  icon: string;
  entryBadge: string;
  approveLabel: string;
  timeoutExtra?: React.ReactNode;
}

function AuditQueueNode({ title, icon, entryBadge, approveLabel, timeoutExtra }: AuditQueueNodeProps) {
  return (
    <div className="rounded-xl border-2 border-orange-400 dark:border-orange-600 bg-card p-3 space-y-2">
      <div className="font-semibold text-sm text-orange-700 dark:text-orange-400">{icon} {title}</div>

      <div className="border-t border-dashed border-orange-200 dark:border-orange-800 pt-2">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-orange-600 dark:text-orange-400 mb-1">可能入口</div>
        <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium border bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/60 dark:text-orange-300 dark:border-orange-800">
          {entryBadge}
        </span>
      </div>

      <div className="border-t border-dashed border-orange-200 dark:border-orange-800 pt-2">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-orange-600 dark:text-orange-400 mb-1.5">可能处理</div>

        <div className="rounded-lg bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 px-2 py-1 text-center text-[10px] font-semibold text-orange-800 dark:text-orange-300 mb-2">
          ⏳ 等待管理员审批
        </div>

        <div className="flex gap-2 mb-2">
          <div className="flex-1 space-y-0.5">
            <div className="text-[10px] text-muted-foreground text-center">批准</div>
            <div className="flex items-center gap-1">
              <div className="flex-1 h-px bg-green-400" />
              <span className="text-green-500 text-xs">▶</span>
              <span className="rounded px-1.5 py-0.5 text-[10px] font-medium border bg-green-50 text-green-700 border-green-200 dark:bg-green-950/60 dark:text-green-300 dark:border-green-800 whitespace-nowrap">
                {approveLabel}
              </span>
            </div>
          </div>
          <div className="flex-1 space-y-0.5">
            <div className="text-[10px] text-muted-foreground text-center">拒绝</div>
            <div className="flex items-center gap-1">
              <div className="flex-1 h-px bg-red-400" />
              <span className="text-red-500 text-xs">▶</span>
              <span className="rounded px-1.5 py-0.5 text-[10px] font-medium border bg-red-50 text-red-700 border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800 whitespace-nowrap">
                reject 终止
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-lg bg-muted/40 border border-border/40 px-2 py-1.5 space-y-0.5">
          <div className="text-[10px] font-semibold text-muted-foreground">⏰ 超时（可配置）</div>
          {timeoutExtra}
        </div>
      </div>
    </div>
  );
}

// ─── Rule detail drawer ───────────────────────────────────────────────────────

function RuleDetailSheet({ rule, onClose, onToggle }: {
  rule: Rule | null;
  onClose: () => void;
  onToggle: (r: Rule) => void;
}) {
  const t = useTranslations();

  const tree = rule ? parseConditionTree(rule.condition_tree) : null;
  const meta = rule ? parseMetadata(rule.metadata) : {};

  const editHref = !rule ? '/rules/tag' :
    rule.rule_class === 'tag' ? '/rules/tag' :
    rule.rule_class === 'route' ? '/rules/route' :
    `${STAGE_HREFS[rule.stage] || '/rules/data'}?edit_rule_id=${rule.id}` as string;

  const stageKey = rule
    ? `sidebar.stage${rule.stage.charAt(0).toUpperCase() + rule.stage.slice(1)}` as Parameters<typeof t>[0]
    : 'sidebar.stageData' as Parameters<typeof t>[0];

  return (
    <Sheet open={!!rule} onOpenChange={open => !open && onClose()}>
      <SheetContent side="right" className="w-[480px] sm:w-[520px] p-0 flex flex-col">
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-border/60 shrink-0">
          <SheetTitle className="text-base font-semibold">{rule?.name || ''}</SheetTitle>
          {rule && (
            <div className="flex flex-wrap items-center gap-1.5 mt-1">
              <Badge variant="outline" className="text-xs">ID: {rule.id}</Badge>
              <Badge variant="outline" className="text-xs">{t(stageKey)}</Badge>
              <Badge variant="outline" className="text-xs">优先级 {rule.priority}</Badge>
              <StatusBadge
                status={rule.is_active ? t('common.enabled') : t('common.disabled')}
                variant={rule.is_active ? 'success' : 'default'}
              />
            </div>
          )}
        </SheetHeader>

        {rule && (
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
            {rule.rule_class === 'tag' && (
              <div className="space-y-1.5">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">打标签</div>
                <div className="flex flex-wrap gap-1.5">
                  {(rule.tags || []).map((tag, i) => (
                    <Badge key={i} variant={tag.startsWith('sys:') ? 'default' : 'secondary'} className="text-xs">
                      <Tag className="h-3 w-3 mr-1" />{tag}
                    </Badge>
                  ))}
                  {(rule.tags || []).length === 0 && <span className="text-xs text-muted-foreground">—</span>}
                </div>
              </div>
            )}

            {rule.rule_class === 'action' && (
              <div className="space-y-1.5">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">执行动作</div>
                <ActionBadge action={rule.action} />
                {rule.action === 'sideline' && (
                  <p className="text-xs text-muted-foreground">
                    最大检查时间: {meta.max_check_time || 30} 分钟 · 超时: {meta.timeout_minutes || 1440} 分钟
                  </p>
                )}
                {rule.action === 'audit' && (
                  <p className="text-xs text-muted-foreground">超时: {meta.timeout_minutes || 10080} 分钟</p>
                )}
                {rule.action === 'accept' && (
                  (meta.subject_prefix || (Array.isArray(meta.add_headers) && meta.add_headers.length > 0)) && (
                    <div className="text-xs text-muted-foreground space-y-0.5">
                      {meta.subject_prefix && <div>主题前缀: [{meta.subject_prefix}]</div>}
                      {Array.isArray(meta.add_headers) && meta.add_headers.map((h: { name: string; value: string }, i: number) => (
                        <div key={i}>追加信头: {h.name}: {h.value}</div>
                      ))}
                    </div>
                  )
                )}
              </div>
            )}

            {rule.rule_class === 'route' && (
              <div className="space-y-1.5">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">下一跳</div>
                <code className="text-sm bg-muted px-2 py-1 rounded inline-block">
                  {meta.next_hop_host}:{meta.next_hop_port || 25}
                  <span className="text-muted-foreground ml-2 text-xs">({meta.next_hop_type})</span>
                </code>
              </div>
            )}

            <div className="space-y-1.5">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">触发条件</div>
              {tree ? (
                <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                  <ConditionTreeNodeView node={tree} />
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">—</p>
              )}
            </div>

            {rule.description && (
              <div className="space-y-1.5">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">描述</div>
                <p className="text-sm text-muted-foreground">{rule.description}</p>
              </div>
            )}

            <div className="text-xs text-muted-foreground/50 space-y-0.5 pt-2 border-t border-border/40">
              <div>创建: {rule.created_at}</div>
              <div>更新: {rule.updated_at}</div>
            </div>
          </div>
        )}

        {rule && (
          <SheetFooter className="px-5 py-4 border-t border-border/60 shrink-0">
            <div className="flex items-center gap-2 w-full">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onToggle(rule)}
                className="flex items-center gap-1.5"
              >
                {rule.is_active
                  ? <><PowerOff className="h-3.5 w-3.5" />禁用</>
                  : <><Power className="h-3.5 w-3.5" />启用</>}
              </Button>
              <div className="flex-1" />
              <Link href={editHref as Parameters<typeof Link>[0]['href']}>
                <Button size="sm" className="flex items-center gap-1.5">
                  <ExternalLink className="h-3.5 w-3.5" />
                  在原页面编辑
                </Button>
              </Link>
            </div>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function RulePipelinePage() {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const { effectiveTenantId } = useTenant();
  const { apiRequest } = useApiRequest();

  const { data: tagRules = [], isLoading: loadingTag } = useQuery({
    queryKey: ['unified-rules', 'tag', effectiveTenantId],
    queryFn: () => getUnifiedRules({ rule_class: 'tag' }, apiRequest),
  });

  const { data: actionRules = [], isLoading: loadingAction } = useQuery({
    queryKey: ['unified-rules', 'action', effectiveTenantId],
    queryFn: () => getUnifiedRules({ rule_class: 'action' }, apiRequest),
  });

  const isLoading = loadingTag || loadingAction;

  const tagByStage = useMemo(() => {
    const m: Partial<Record<StageType, Rule[]>> = {};
    for (const r of tagRules) {
      const s = r.stage as StageType;
      (m[s] ??= []).push(r);
    }
    return m;
  }, [tagRules]);

  const actionByStage = useMemo(() => {
    const m: Partial<Record<StageType, Rule[]>> = {};
    for (const r of actionRules) {
      const s = r.stage as StageType;
      (m[s] ??= []).push(r);
    }
    return m;
  }, [actionRules]);

  const [selectedRule, setSelectedRule] = useState<Rule | null>(null);
  const [openStage, setOpenStage] = useState<StageType | null>(null);

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      toggleUnifiedRule(id, isActive, apiRequest),
    onSuccess: updated => {
      queryClient.invalidateQueries({ queryKey: ['unified-rules'] });
      toast.success(t('common.updateSuccess'));
      setSelectedRule(prev => (prev?.id === updated.id ? updated : prev));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (isLoading) {
    return (
      <PageShell>
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        eyebrow={t('advancedRules.pipelineEyebrow')}
        title={t('advancedRules.pipelineTitle')}
        description={t('advancedRules.pipelineSubtitle')}
      />

      {/* Priority explanation banner */}
      <div className="rounded-xl border border-blue-200 bg-blue-50/60 dark:border-blue-800 dark:bg-blue-950/30 px-4 py-3">
        <div className="flex items-start gap-2.5">
          <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-blue-800 dark:text-blue-300">规则优先级与阶段执行说明</p>
            <ul className="text-xs text-blue-700 dark:text-blue-400 space-y-0.5 list-disc list-inside">
              <li>邮件按阶段顺序处理：CONNECT → MAIL FROM → RCPT TO → HEADER → DATA</li>
              <li>同阶段内规则按<strong>优先级数值从大到小</strong>依次评估，首条命中规则生效，立即退出本阶段</li>
              <li>reject / bounce / discard 等终止类动作命中后，邮件流在本阶段永久终止</li>
              <li>DATA 阶段完成后，入站邮件若无任何规则命中，<strong>默认进入旁路阶段</strong>进行异步深度检测</li>
              <li>外发邮件（SASL 认证用户发送）不进入旁路阶段</li>
              <li>标签规则用于给收件人添加标签，供后续阶段规则匹配使用</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Two-column pipeline */}
      <div className="flex gap-4 items-start">

        {/* LEFT: vertical pipeline */}
        <div className="flex flex-col items-center gap-0 w-56 shrink-0">

          <div className="bg-blue-500 text-white rounded-lg px-4 py-1.5 text-xs font-bold">
            📧 邮件到达
          </div>

          {STAGE_ORDER.slice(0, -1).map(stage => (
            <div key={stage} className="w-full flex flex-col items-center">
              <div className="flex items-center gap-1.5 my-1 self-start pl-2">
                <ArrowDown className="h-3 w-3 text-muted-foreground/50" />
                <span className="text-[10px] text-muted-foreground/60">无命中</span>
              </div>
              <StageNode
                stage={stage}
                tagRules={tagByStage[stage] || []}
                actionRules={actionByStage[stage] || []}
                onClick={() => setOpenStage(stage)}
              />
            </div>
          ))}

          {/* DATA stage */}
          <div className="w-full flex flex-col items-center">
            <div className="flex items-center gap-1.5 my-1 self-start pl-2">
              <ArrowDown className="h-3 w-3 text-muted-foreground/50" />
              <span className="text-[10px] text-muted-foreground/60">无命中</span>
            </div>
            <StageNode
              stage="data"
              tagRules={tagByStage['data'] || []}
              actionRules={actionByStage['data'] || []}
              onClick={() => setOpenStage('data')}
              subtitle="🔗 链接保护（租户配置）"
            />
          </div>

          {/* DATA → SIDELINE dashed arrow */}
          <DashedArrow label="无命中入站邮件（默认旁路）" />

          {/* SIDELINE */}
          <StageNode
            stage={SIDELINE_STAGE}
            tagRules={tagByStage[SIDELINE_STAGE] || []}
            actionRules={actionByStage[SIDELINE_STAGE] || []}
            onClick={() => setOpenStage(SIDELINE_STAGE)}
            isSideline
          />
        </div>

        {/* RIGHT: audit queues */}
        <div className="flex-1 flex flex-col gap-4 pt-[420px]">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            审核队列（DATA 阶段 audit 出口）
          </div>

          <AuditQueueNode
            title="入站审核队列"
            icon="📨"
            entryBadge="DATA audit + 入站邮件"
            approveLabel="accept 投递"
            timeoutExtra={
              <div className="text-[10px] text-muted-foreground space-y-0.5">
                <div>
                  <span className="bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 rounded px-1">auto-accept</span>
                  {' → 投递'}
                </div>
                <div>
                  <span className="bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 rounded px-1">auto-reject</span>
                  {' → 终止'}
                </div>
                <div>
                  <span className="bg-muted text-muted-foreground rounded px-1">keep_pending</span>
                  {' 继续等待'}
                </div>
              </div>
            }
          />

          <AuditQueueNode
            title="外发审核队列"
            icon="📤"
            entryBadge="DATA audit + 外发邮件"
            approveLabel="重新投递"
            timeoutExtra={
              <div className="text-[10px] text-muted-foreground space-y-0.5">
                <div>
                  <span className="bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 rounded px-1">auto-accept</span>
                  {' → 重新投递（默认）'}
                </div>
                <div>
                  <span className="bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 rounded px-1">auto-reject</span>
                  {' → 终止'}
                </div>
              </div>
            }
          />
        </div>
      </div>

      {/* Legend */}
      <div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">图例</div>
        <div className="flex flex-wrap gap-2 text-[11px]">
          <span className="rounded px-2 py-0.5 border bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800">🏷 标签规则</span>
          <span className="rounded px-2 py-0.5 border bg-red-50 text-red-700 border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800">红色 = 终止类（reject · bounce · disconnect · tempfail · discard）</span>
          <span className="rounded px-2 py-0.5 border bg-green-50 text-green-700 border-green-200 dark:bg-green-950/60 dark:text-green-300 dark:border-green-800">accept（投递）</span>
          <span className="rounded px-2 py-0.5 border bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800">quarantine（隔离）</span>
          <span className="rounded px-2 py-0.5 border bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/60 dark:text-orange-300 dark:border-orange-800">audit（审核队列）</span>
          <span className="text-muted-foreground">×N = 当前启用规则数量 · 点击阶段框查看规则列表</span>
        </div>
      </div>

      {/* Stage detail sidebar */}
      <StageSheet
        stage={openStage}
        tagRules={openStage ? (tagByStage[openStage] || []) : []}
        actionRules={openStage ? (actionByStage[openStage] || []) : []}
        onClose={() => setOpenStage(null)}
        onSelectRule={rule => { setOpenStage(null); setSelectedRule(rule); }}
      />

      {/* Rule detail drawer */}
      <RuleDetailSheet
        rule={selectedRule}
        onClose={() => setSelectedRule(null)}
        onToggle={rule => toggleMutation.mutate({ id: rule.id, isActive: !rule.is_active })}
      />
    </PageShell>
  );
}
