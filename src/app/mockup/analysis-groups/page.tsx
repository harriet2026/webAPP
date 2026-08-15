'use client';

import { useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Info,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Users,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * ⚠️ 纯前端可视化草案（Mockup），不连接真实数据 / 不修改任何生产文件。
 * 用于向产品/研判团队展示：群发邮件场景下，"安全分析"模块的 UI 调整思路。
 * 参考: src/components/email-disposal/sections/analysis-section.tsx
 *       src/components/email-disposal/components/recipient-status.tsx
 *       src/components/email-disposal/components/disposal-basis-cell.tsx
 */

type GroupResult = 'quarantined' | 'blocked' | 'delivered';

interface RecipientGroup {
  id: string;
  recipients: string[];
  result: GroupResult;
  stage3Hit?: { module: string; rule: string; ruleId: string };
  stage5Hit?: { module: string; rule: string; ruleId: string };
  action: string;
}

const GROUPS: RecipientGroup[] = [
  {
    id: 'g1',
    recipients: ['user1@company.com', 'user2@company.com'],
    result: 'quarantined',
    stage3Hit: { module: '内容规则', rule: '银行卡号检测', ruleId: 'CR-000004' },
    action: '隔离',
  },
  {
    id: 'g2',
    recipients: ['user3@company.com'],
    result: 'blocked',
    stage3Hit: { module: '内容规则', rule: '身份证外发管控', ruleId: 'CR-000001' },
    action: '拦截',
  },
  {
    id: 'g3',
    recipients: ['user4@company.com', 'user5@company.com'],
    result: 'delivered',
    stage5Hit: { module: '路由规则', rule: '财务部内部直投白名单', ruleId: 'RT-000012' },
    action: '正常投递',
  },
];

const RESULT_STYLE: Record<GroupResult, string> = {
  quarantined: 'border-amber-200 bg-amber-50 text-amber-700',
  blocked: 'border-red-200 bg-red-50 text-red-700',
  delivered: 'border-emerald-200 bg-emerald-50 text-emerald-700',
};

const RESULT_ICON: Record<GroupResult, React.ReactNode> = {
  quarantined: <ShieldAlert className="h-3.5 w-3.5" />,
  blocked: <ShieldX className="h-3.5 w-3.5" />,
  delivered: <ShieldCheck className="h-3.5 w-3.5" />,
};

const RESULT_LABEL: Record<GroupResult, string> = {
  quarantined: '已隔离',
  blocked: '已拦截',
  delivered: '已投递',
};

const ACTION_BADGE_STYLE: Record<string, string> = {
  隔离: 'bg-amber-100 text-amber-700',
  拦截: 'bg-red-100 text-red-700',
  正常投递: 'bg-emerald-100 text-emerald-700',
};

function GroupScopeLine({ group }: { group: RecipientGroup }) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <Users className="h-3.5 w-3.5 shrink-0" />
      <span>
        适用范围：{group.recipients.join('、')}（{group.recipients.length} 人）
      </span>
    </div>
  );
}

export default function AnalysisGroupsMockupPage() {
  const [multiMode, setMultiMode] = useState(true);
  const [stage3Expanded, setStage3Expanded] = useState(true);
  const [stage5Expanded, setStage5Expanded] = useState(true);

  const groups = multiMode ? GROUPS : [GROUPS[0]];
  const isMulti = groups.length > 1;
  const totalRecipients = groups.reduce((sum, g) => sum + g.recipients.length, 0);
  const distinctResults = new Set(groups.map((g) => g.result)).size;

  const stage3Groups = groups.filter((g) => g.stage3Hit);
  const stage5Groups = groups.filter((g) => g.stage5Hit);

  return (
    <div className="min-h-full bg-muted/20 p-6 md:p-10">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* 页面说明 + 演示开关 */}
        <div className="rounded-lg border border-dashed bg-background p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-2">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="text-sm text-muted-foreground">
                <p className="font-medium text-foreground">安全分析模块 · 群发场景优化草案（纯前端 Mockup，不连接真实数据）</p>
                <p className="mt-1">
                  邮件："Q2财务报表 - 紧急审批（多投信）" · 收件人 5 人 · 不同收件人命中不同内容规则/路由规则，处置结果不同。
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 shrink-0 text-xs"
              onClick={() => setMultiMode((v) => !v)}
            >
              {multiMode ? '切换为单收件人邮件（现状对照）' : '切换为群发多结果邮件（优化后）'}
            </Button>
          </div>
        </div>

        {/* 卡片容器：对齐详情弹窗“安全分析” Tab 的卡片间距 */}
        <div className="space-y-5 rounded-lg border bg-background p-5">
          {/* 1. 群发结果摘要行——仅分组数 > 1 时出现 */}
          {isMulti && (
            <div
              className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border bg-muted/40 px-4 py-3"
              data-testid="analysis-multi-summary"
            >
              <div className="flex items-center gap-2 text-sm font-medium">
                <Users className="h-4 w-4 text-muted-foreground" />
                {totalRecipients} 位收件人 · {distinctResults} 种处置结果
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {groups.map((g) => (
                  <Badge key={g.id} variant="outline" className={cn('gap-1 text-xs', RESULT_STYLE[g.result])}>
                    {RESULT_ICON[g.result]}
                    {RESULT_LABEL[g.result]}（{g.recipients.length}人）
                  </Badge>
                ))}
              </div>
              <span className="ml-auto text-xs text-muted-foreground">以下阶段3/阶段5已按分组展开，其余阶段对全部收件人一致</span>
            </div>
          )}

          {/* 2. 检测流水线——5 阶段卡片（阶段1/2/4 保持现状单一卡片） */}
          <div>
            <div className="mb-4 flex items-center justify-between">
              <h4 className="text-sm font-semibold">检测流程</h4>
              <span className="text-xs text-muted-foreground">总耗时: 86ms</span>
            </div>
            <div className="flex items-start gap-0 overflow-x-auto pb-2">
              {/* 阶段1 */}
              <StageCard label="阶段 1" name="连接层检测" status="通过" count={4} ms={8} />
              <Connector />
              {/* 阶段2 */}
              <StageCard label="阶段 2" name="身份层检测" status="可疑" count={5} ms={undefined} tone="warn" />
              <Connector />
              {/* 阶段3：可分叉 —— 群发模式下展示分组徽标 + 分组展开 */}
              <StageCard
                label="阶段 3"
                name="内容层检测"
                status="命中"
                count={3}
                ms={34}
                tone="hit"
                forked={isMulti}
                forkCount={stage3Groups.length}
              />
              <Connector />
              {/* 阶段4 */}
              <StageCard label="阶段 4" name="AI 智能分析" status="跳过" count={5} ms={undefined} tone="skip" />
              <Connector />
              {/* 阶段5：可分叉 */}
              <StageCard
                label="阶段 5"
                name="综合分析"
                status="命中"
                count={3}
                ms={undefined}
                tone="hit"
                forked={isMulti}
                forkCount={stage5Groups.length}
              />
            </div>
          </div>

          {/* 3. 阶段3 分组明细展开区（仅命中且多结果时展示） */}
          {isMulti && stage3Groups.length > 0 && (
            <ExpandableGroupDetail
              title="阶段 3· 内容层检测 — 按分组展开命中详情"
              expanded={stage3Expanded}
              onToggle={() => setStage3Expanded((v) => !v)}
              groups={stage3Groups}
              hitKey="stage3Hit"
            />
          )}

          {/* 4. 阶段5 分组明细展开区 */}
          {isMulti && stage5Groups.length > 0 && (
            <ExpandableGroupDetail
              title="阶段 5· 综合分析 — 按分组展开命中详情"
              expanded={stage5Expanded}
              onToggle={() => setStage5Expanded((v) => !v)}
              groups={stage5Groups}
              hitKey="stage5Hit"
            />
          )}

          {/* 5. 处置依据——单结果=1张卡（现状），多结果=按策略模块分组渲染多张卡 */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold">处置依据</h4>
            {groups.map((g) => {
              const hit = g.stage3Hit ?? g.stage5Hit;
              return (
                <div key={g.id} className="rounded-lg border bg-card p-4" data-testid={`analysis-disposal-basis-${g.id}`}>
                  <div className="mb-3 flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 text-orange-600" />
                    <h5 className="text-sm font-semibold">
                      {hit ? hit.module : '默认策略'}
                    </h5>
                    <span
                      className={cn('ml-auto rounded px-2 py-0.5 text-xs font-medium', ACTION_BADGE_STYLE[g.action])}
                    >
                      {g.action}
                    </span>
                  </div>
                  {isMulti && <div className="mb-2.5"><GroupScopeLine group={g} /></div>}
                  <div className="grid grid-cols-[72px_1fr] gap-x-3 gap-y-2 text-sm">
                    <span className="text-muted-foreground">规则名称</span>
                    <span className="min-w-0 truncate text-primary">
                      {hit ? `${hit.rule}（${hit.ruleId}）` : '—'}
                    </span>
                    <span className="text-muted-foreground">命中详情</span>
                    <span className="leading-relaxed text-muted-foreground">
                      {hit
                        ? `正文命中「${hit.rule}」关键词/正则规则，动作：${g.action}`
                        : '未命中任何策略，按默认动作处理'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 6. 事后处置时间线——每条事件补充收件人标签（配套小改动示意） */}
          <div>
            <h4 className="mb-3 text-sm font-semibold">事后处置时间线</h4>
            <div className="relative space-y-3 border-l-2 border-border pl-6">
              <TimelineItem time="10:30:45" text="检测完成" recipients={undefined} done />
              {isMulti ? (
                <>
                  <TimelineItem time="10:31:02" text="研判人员：隔离" recipients={['user1@company.com', 'user2@company.com']} />
                  <TimelineItem time="10:31:15" text="研判人员：拦截确认" recipients={['user3@company.com']} />
                  <TimelineItem time="10:31:20" text="系统：正常投递" recipients={['user4@company.com', 'user5@company.com']} />
                </>
              ) : (
                <TimelineItem time="10:31:02" text="研判人员：隔离" recipients={['user1@company.com']} />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Connector() {
  return (
    <div className="mt-12 flex items-center px-1">
      <div className="h-0.5 w-4 bg-border" />
      <ArrowRight className="-ml-0.5 h-3 w-3 text-muted-foreground" />
    </div>
  );
}

function StageCard({
  label,
  name,
  status,
  count,
  ms,
  tone = 'pass',
  forked = false,
  forkCount,
}: {
  label: string;
  name: string;
  status: string;
  count: number;
  ms: number | undefined;
  tone?: 'pass' | 'warn' | 'skip' | 'hit';
  forked?: boolean;
  forkCount?: number;
}) {
  const cardTone = {
    pass: 'border-emerald-200 bg-emerald-50/40',
    warn: 'border-amber-200 bg-amber-50/40',
    skip: 'border-border bg-muted/20',
    hit: 'border-emerald-200 bg-emerald-50/40',
  }[tone];
  const badgeTone = {
    pass: 'border-emerald-300 text-emerald-700 bg-emerald-50',
    warn: 'border-amber-300 text-amber-700 bg-amber-50',
    skip: 'border-border text-muted-foreground bg-muted/40',
    hit: 'border-emerald-300 text-emerald-700 bg-emerald-50',
  }[tone];

  return (
    <div className={cn('relative min-w-[180px] max-w-[200px] rounded-lg border p-3 text-center', cardTone)}>
      {forked && (
        <span
          className="absolute -top-2 -right-2 flex items-center gap-1 rounded-full border border-violet-300 bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-700"
          title="不同收件人在此阶段的检测结果存在分叉"
        >
          <Users className="h-3 w-3" />
          {forkCount}组
        </span>
      )}
      <div className="mb-1 text-xs text-muted-foreground">{label}</div>
      <div className="mb-2 text-sm font-medium">{name}</div>
      <div className="mb-2 flex justify-center">
        <CheckCircle2 className={cn('h-6 w-6', tone === 'skip' ? 'text-muted-foreground' : 'text-emerald-500')} />
      </div>
      <Badge variant="outline" className={cn('mb-1 text-xs', badgeTone)}>
        {status}
      </Badge>
      <div className="text-xs text-muted-foreground">{count} 项策略</div>
      <div className="text-xs text-muted-foreground/70">{ms != null ? `${ms}ms` : '—'}</div>
    </div>
  );
}

function ExpandableGroupDetail({
  title,
  expanded,
  onToggle,
  groups,
  hitKey,
}: {
  title: string;
  expanded: boolean;
  onToggle: () => void;
  groups: RecipientGroup[];
  hitKey: 'stage3Hit' | 'stage5Hit';
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-violet-200 bg-violet-50/40">
      <button
        type="button"
        className="flex w-full items-center justify-between p-3 text-left"
        aria-expanded={expanded}
        onClick={onToggle}
      >
        <span className="flex items-center gap-2 text-sm font-medium text-violet-800">
          <Users className="h-4 w-4" />
          {title}
        </span>
        <ChevronDown className={cn('h-4 w-4 text-violet-600 transition-transform', !expanded && '-rotate-90')} />
      </button>
      {expanded && (
        <div className="space-y-2 border-t border-violet-100 p-3">
          {groups.map((g) => {
            const hit = g[hitKey]!;
            return (
              <div key={g.id} className="flex items-start justify-between gap-3 rounded-md bg-background/70 p-2.5 text-xs">
                <div className="min-w-0">
                  <div className="mb-1 flex items-center gap-1.5 text-muted-foreground">
                    <Users className="h-3 w-3" />
                    {g.recipients.join('、')}（{g.recipients.length}人）
                  </div>
                  <div className="truncate font-medium text-foreground">
                    {hit.rule}（{hit.ruleId}）
                  </div>
                </div>
                <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium', ACTION_BADGE_STYLE[g.action])}>
                  {g.action}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TimelineItem({
  time,
  text,
  recipients,
  done = false,
}: {
  time: string;
  text: string;
  recipients: string[] | undefined;
  done?: boolean;
}) {
  return (
    <div className="relative -ml-[25px]">
      <div
        className={cn(
          'absolute left-0 flex h-4 w-4 items-center justify-center rounded-full',
          done ? 'bg-emerald-500' : 'bg-gray-500',
        )}
      >
        <CheckCircle2 className="h-2.5 w-2.5 text-white" />
      </div>
      <div className="ml-6 rounded-lg border bg-muted/30 p-2.5 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground">{time}</span>
          <span className="font-medium">{text}</span>
        </div>
        {recipients && (
          <div className="mt-1 flex flex-wrap gap-1">
            {recipients.map((r) => (
              <Badge key={r} variant="outline" className="text-[11px]">
                {r}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
