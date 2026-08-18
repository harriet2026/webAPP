'use client';

// 出站路由步骤三：路由规则（Task 7 落地 + Task 13 接通真实后端，design/implement/spec/
// 2026-07-29-mail-routing-backend-design.md，webapp/doc/html-spec/admin-forwarding/index.html
// §2.5 + layer-7-outbound-rules.html）。
//
// 规则 CRUD 走 unified-rules（真实后端权威，见 rule-mapping.ts）；TLS 等级现在读写真实字段
// metadata.tls_level（取代旧 mock-only mr_ext），控件恒可编辑；成功率读列表响应顶层的
// tls_success_rate（page=mail_routing_outbound 专属聚合，近 24h 无投递统计时为 null，列表显示
// 「—」）；通道 Select 列出真实 active proxysvr 组（DEV-8），channels prop 是父组件传入的全量
// proxysvr_groups 列表（与步骤二共用同一份查询结果，本组件不重复请求），用于失效引用检测/预览。
//
// GT-12321 硬约束：规则条件树里可能含有本表单不认识的条件（典型如 is_outbound——发信方向由
// 操作员自行在别处/历史数据中写入，本步骤三的六个 discrete 字段不包含方向选择）。这类"未知"
// 条件必须原样保留、不能被编辑/保存动作悄悄丢弃或覆盖，否则历史上正是这个坑（GT-12321）导致
// 收信方向的规则无法通过本页维护。splitConditions/buildConditionTree 把"已知六字段"与"其余
// 条件节点"分开处理；其余叶子条件交给紧凑型“更多条件”组件编辑，复合子树仍作为不透明节点
// 原样保留，保存时把两部分合并回同一棵树。

import { useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Plus, Pencil, Trash2, FlaskConical, AlertTriangle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { ListToolbar } from '@/components/mail-routing/shared/list-toolbar';
import { isIPv4, type RcptMatchType, type TlsLevel } from '@/components/mail-routing/mr-types';
import { useScopedApiRequest } from '@/lib/api/client';
import { getUnifiedRules, createUnifiedRule, updateUnifiedRule, deleteUnifiedRule } from '@/lib/api/unified-rules';
import { listActiveProxysvrGroups } from '@/lib/api/proxysvr';
import type { RuleNode } from '@/types/unified-rules';
import { MultiSelectFilter } from '@/components/email-disposal/lib/multi-select-filter';
import type { ProxysvrGroup } from '@/types/proxysvr';
import {
  unifiedToRow,
  rowToUnifiedPayload,
  sortRuleRows,
  type OutboundRuleRow,
  type ConditionTree,
} from './rule-mapping';
import type { OutboundChannelRow, OutboundProxyRow } from './outbound-types';
import { CompactConditionEditor } from './compact-condition-editor';
import { useApiErrorMessage } from '@/lib/api/use-api-error-message';

interface RuleStepProps {
  tenantId: number;
  /** 步骤二已配置的通道（父组件传入，与步骤二共用同一份查询结果，Mock 模式下用作通道 Select 选项）。 */
  channels: OutboundChannelRow[];
  /** 步骤一已配置的代理（父组件传入，用于通道内代理预览表 / HELO 派生 / 模拟链路）。 */
  proxies: OutboundProxyRow[];
}

const TLS_LEVELS: TlsLevel[] = ['plain', 'prefer', 'force', 'forceVerify'];
const LOOPBACK_HOSTS = ['127.0.0.1', 'localhost', 'mail.gateway.local'];

// 规则条件抽屉认识的六个 discrete 字段对应的 unified-rules 引擎字段名。收信人的 to/cc/bcc
// 由用户在 Select 里挑选，分别写入 recipient/cc/bcc 三个不同字段（layer-7 抽屉截图：收信人一栏
// 是"字段种类 Select + 值输入"，不是"匹配方式 Select"，与收信域名那一栏的匹配方式语义不同）。
const RCPT_DOMAIN_OPERATOR: Record<RcptMatchType, string> = { contains: 'contain', equals: 'eq', regex: 'match' };
const RCPT_DOMAIN_OPERATOR_REVERSE: Record<string, RcptMatchType> = { contain: 'contains', eq: 'equals', match: 'regex' };
/** 收信域名 Select 只有三个选项，白名单即 Select 的可选值集合。 */
const RCPT_DOMAIN_OPERATORS = Object.keys(RCPT_DOMAIN_OPERATOR_REVERSE);
type RcptUserKind = 'to' | 'cc' | 'bcc';
const RCPT_USER_FIELD: Record<RcptUserKind, string> = { to: 'recipient', cc: 'cc', bcc: 'bcc' };
const RCPT_USER_FIELD_REVERSE: Record<string, RcptUserKind> = { recipient: 'to', cc: 'cc', bcc: 'bcc' };

// 来源IP/发信域名/发信人/收信人 四个字段在表单里都只是一个纯文本 Input，没有算子选择器
// （不像收信域名有 Select）——但"没有选择器"不等于"只能表达一种算子"：unified-rules 引擎
// （internal/api/field_registry.go）给这些字段登记的算子集合里，除 within（要求换行分隔的
// 多值列表，与单值文本框语义不兼容）外，其余算子（eq/ne/contain/not_contain/match/suffix/
// prefix，client_ip 另有 cidr）都只是"拿字符串值做比较"的语义，可以在值可编辑的同时把原算子
// 静默透传保存，不必强制改写成写死的默认值——这是 review finding 1（"算子固化"）的落地方式。
const CLIENT_IP_OPERATORS = ['eq', 'ne', 'cidr', 'match'];
const SCALAR_TEXT_OPERATORS = ['eq', 'ne', 'contain', 'not_contain', 'match', 'suffix', 'prefix'];

// GT-12854：意图引擎标签逐值列出（不再按五类分组合并 3/4、7/9），支持多选，
// 补上此前缺失的「正常(1)」。取值语义与 internal/models/email_type.go::
// EmailTypeFromCacIntTag 对齐：1=正常、2=订阅、3=垃圾、4=广告、5=色情赌博、
// 6=涉政、7=钓鱼、8=账号失陷、9=病毒。条件树仍写引擎实际消费的 cac_int_tag。
const INTENT_TAG_ALL_VALUES = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

function normalizedIntentTagValues(raw: string): string {
  const values = raw
    .replaceAll(',', '\n')
    .split('\n')
    .map((value) => value.trim())
    .filter(Boolean);
  if (values.length === 0 || values.some((value) => !/^\d+$/.test(value))) return '';
  return [...new Set(values)].sort((a, b) => Number(a) - Number(b)).join('\n');
}

/** 把 cac_int_tag 条件节点解析成勾选值集合。eq 只接受单值；within 接受
 * 已知标签值（1~9）的任意子集。含未知值（如 0 或 12）的节点无法由勾选列表
 * 准确表达，返回 undefined 留在 otherConditions 原样透传，不能在一次普通
 * 编辑保存后被悄悄改写。 */
function intentTagsFromCondition(node: RuleNode): string[] | undefined {
  if (node.type !== 'condition' || node.field !== 'cac_int_tag' || !node.operator || !node.value) return undefined;
  if (node.operator !== 'eq' && node.operator !== 'within') return undefined;

  const normalized = normalizedIntentTagValues(node.value);
  if (!normalized) return undefined;
  const values = normalized.split('\n');
  if (node.operator === 'eq' && values.length > 1) return undefined;
  if (!values.every((value) => INTENT_TAG_ALL_VALUES.includes(value))) return undefined;
  return values;
}

type KnownSlot = 'clientIp' | 'senderDomain' | 'authUser' | 'rcptDomain' | 'rcptUser' | 'intentTag';

/** 已知条件字段 → 表单槽位 + 该槽位算子白名单。recipient/cc/bcc 三个字段名共享同一个
 * "收件人"槽位（rcptUser，表单只有一个 kind Select，不是三个独立输入框）。 */
const SLOT_BY_FIELD: Record<string, { slot: KnownSlot; operators: string[] }> = {
  client_ip: { slot: 'clientIp', operators: CLIENT_IP_OPERATORS },
  senderdomain: { slot: 'senderDomain', operators: SCALAR_TEXT_OPERATORS },
  auth_user: { slot: 'authUser', operators: SCALAR_TEXT_OPERATORS },
  recipient_domain: { slot: 'rcptDomain', operators: RCPT_DOMAIN_OPERATORS },
  recipient: { slot: 'rcptUser', operators: SCALAR_TEXT_OPERATORS },
  cc: { slot: 'rcptUser', operators: SCALAR_TEXT_OPERATORS },
  bcc: { slot: 'rcptUser', operators: SCALAR_TEXT_OPERATORS },
  cac_int_tag: { slot: 'intentTag', operators: ['eq', 'within'] },
};
const FIXED_CONDITION_FIELDS = Object.keys(SLOT_BY_FIELD);

interface RuleDraft {
  id: number;
  ruleName: string;
  priority: number;
  status: 'enabled' | 'disabled';
  channelId: string;
  tlsLevel: TlsLevel;
  targetHost: string;
  targetPort: number;
  sourceIp: string;
  /** 来源IP 条件节点的原始算子（编辑态回填；新建/该字段原本为空时 undefined，保存时落回
   * 默认算子 'cidr'）。见 review finding 1：不能恒写死为 'cidr'，否则 eq/match 等历史算子
   * 会被保存动作静默改写。 */
  sourceIpOperator?: string;
  fromDomain: string;
  fromDomainOperator?: string;
  fromUser: string;
  fromUserOperator?: string;
  rcptDomain: string;
  rcptDomainMatch: RcptMatchType;
  rcptUserKind: RcptUserKind;
  rcptUser: string;
  rcptUserOperator?: string;
  /** 已勾选的意图引擎标签值（cac_int_tag 字面值，如 ['1','3']；空数组=不限）。 */
  intentTags: string[];
  /** 编辑态中与 intentTags 等价的原始条件节点。勾选集合未变化时原样回写，避免把
   * 历史 eq/within 或值分隔符格式做无意义改写；改选后生成标准 within 节点。 */
  intentTagCondition?: RuleNode;
  /** 固定字段之外的更多条件（如 is_outbound），由 CompactConditionEditor 编辑；复合条件树、
   * 算子超出固定表单表达范围的节点和同槽位多余节点也存于此，保证原样透传。 */
  otherConditions: RuleNode[];
}

function emptyDraft(): RuleDraft {
  return {
    id: 0,
    ruleName: '',
    priority: 100,
    status: 'enabled',
    channelId: 'default',
    tlsLevel: 'prefer',
    targetHost: '',
    targetPort: 25,
    sourceIp: '',
    fromDomain: '',
    fromUser: '',
    rcptDomain: '',
    rcptDomainMatch: 'contains',
    rcptUserKind: 'to',
    rcptUser: '',
    intentTags: [],
    otherConditions: [],
  };
}

/** 把条件树拆成"六个已知槽位各自的节点"与"其余节点"——只解开顶层 AND 的一层 children
 * （或单一 condition 节点本身），不递归深入 OR/NOT 子树；后者作为不透明整体归入 other，
 * 保存时原样带回（不尝试理解/改写它）。
 *
 * 两条 review 修复点都在这里落地：
 * ① 算子固化（finding 1）：节点算子必须落在该字段的白名单（SLOT_BY_FIELD）内才会被
 *    认作"已知"、抽进对应表单字段；白名单之外的算子（典型如 within）该字段的表单
 *    压根无法表达，整节点原样并入 other，不假装认识、也不允许保存时被悄悄改写成默认算子。
 * ② 同槽位多字段丢失（finding 2）：recipient/cc/bcc 三个字段名共享同一个"收件人"槽位，
 *    只有第一个命中且算子可表达的节点占用该槽位，之后再遇到同槽位节点（不论算子是否
 *    可表达）一律并入 other——不会像旧版那样因为 known 按字段名（而非槽位）存储而被
 *    静默丢弃。 */
function splitConditions(tree: ConditionTree): { known: Partial<Record<KnownSlot, RuleNode>>; other: RuleNode[] } {
  const known: Partial<Record<KnownSlot, RuleNode>> = {};
  const other: RuleNode[] = [];
  const topChildren: RuleNode[] = tree.type === 'AND' ? tree.children ?? [] : [tree];
  for (const node of topChildren) {
    const mapping = node.type === 'condition' && node.field ? SLOT_BY_FIELD[node.field] : undefined;
    const operatorExpressible = !!mapping && !!node.operator && mapping.operators.includes(node.operator);
    const valueExpressible = mapping?.slot !== 'intentTag' || !!intentTagsFromCondition(node);
    if (mapping && operatorExpressible && valueExpressible && !known[mapping.slot]) {
      known[mapping.slot] = node;
    } else {
      other.push(node);
    }
  }
  return { known, other };
}

function draftFromRow(row: OutboundRuleRow): RuleDraft {
  const { known, other } = splitConditions(row.conditionTree);
  const rcptDomainNode = known.rcptDomain;
  const rcptUserNode = known.rcptUser;
  const intentTagNode = known.intentTag;
  const rcptUserKind = rcptUserNode?.field ? (RCPT_USER_FIELD_REVERSE[rcptUserNode.field] ?? 'to') : 'to';
  return {
    id: row.id,
    ruleName: row.ruleName,
    priority: row.priority,
    status: row.status,
    channelId: row.channelId,
    tlsLevel: row.tlsLevel ?? 'prefer',
    targetHost: row.targetHost,
    targetPort: row.targetPort,
    sourceIp: known.clientIp?.value ?? '',
    sourceIpOperator: known.clientIp?.operator,
    fromDomain: known.senderDomain?.value ?? '',
    fromDomainOperator: known.senderDomain?.operator,
    fromUser: known.authUser?.value ?? '',
    fromUserOperator: known.authUser?.operator,
    rcptDomain: rcptDomainNode?.value ?? '',
    rcptDomainMatch: rcptDomainNode?.operator ? (RCPT_DOMAIN_OPERATOR_REVERSE[rcptDomainNode.operator] ?? 'contains') : 'contains',
    rcptUserKind,
    rcptUser: rcptUserNode?.value ?? '',
    rcptUserOperator: rcptUserNode?.operator,
    intentTags: intentTagNode ? (intentTagsFromCondition(intentTagNode) ?? []) : [],
    intentTagCondition: intentTagNode,
    otherConditions: other,
  };
}

/** 六个 discrete 字段（非空才写入）+ otherConditions 原样合并为完整条件树。已知字段的算子
 * 优先用 draftFromRow 回填的原算子（编辑态）；字段原本为空（新建，或编辑态里该字段之前
 * 没有对应条件）时没有可回填的原算子，落回各字段的默认算子——与旧版行为一致（finding 1）。
 * 收信域名的算子由可见的 rcptDomainMatch Select 直接决定，不走回填（Select 本身就是
 * "这三种算子里选一种"的显式 UI，不存在"看不见的原算子"问题）。 */
function buildConditionTree(draft: RuleDraft): ConditionTree {
  const children: RuleNode[] = [...draft.otherConditions];
  const sourceIp = draft.sourceIp.trim();
  if (sourceIp) children.push({ type: 'condition', field: 'client_ip', operator: draft.sourceIpOperator ?? 'cidr', value: sourceIp });
  const fromDomain = draft.fromDomain.trim();
  if (fromDomain) children.push({ type: 'condition', field: 'senderdomain', operator: draft.fromDomainOperator ?? 'eq', value: fromDomain });
  const fromUser = draft.fromUser.trim();
  if (fromUser) children.push({ type: 'condition', field: 'auth_user', operator: draft.fromUserOperator ?? 'eq', value: fromUser });
  const rcptDomain = draft.rcptDomain.trim();
  if (rcptDomain) {
    children.push({ type: 'condition', field: 'recipient_domain', operator: RCPT_DOMAIN_OPERATOR[draft.rcptDomainMatch], value: rcptDomain });
  }
  const rcptUser = draft.rcptUser.trim();
  if (rcptUser) {
    children.push({ type: 'condition', field: RCPT_USER_FIELD[draft.rcptUserKind], operator: draft.rcptUserOperator ?? 'contain', value: rcptUser });
  }
  if (draft.intentTags.length > 0) {
    const selected = [...new Set(draft.intentTags)].sort((a, b) => Number(a) - Number(b));
    const originalTags = draft.intentTagCondition ? intentTagsFromCondition(draft.intentTagCondition) : undefined;
    const unchanged =
      !!originalTags && originalTags.length === selected.length && originalTags.every((v) => selected.includes(v));
    children.push(
      unchanged
        ? draft.intentTagCondition!
        : { type: 'condition', field: 'cac_int_tag', operator: 'within', value: selected.join('\n') },
    );
  }
  return { type: 'AND', children };
}

function isPublicIPv4(host: string): boolean {
  return isIPv4(host) && !host.startsWith('10.') && !host.startsWith('192.168.') && !host.startsWith('127.');
}

export function RuleStep({ tenantId, channels, proxies }: RuleStepProps) {
  const t = useTranslations('mailRouting.outbound.rule');
  const apiErrorMessage = useApiErrorMessage();
  const tRcpt = useTranslations('mailRouting.relay.fields');
  const ts = useTranslations('mailRouting.shared');
  const tc = useTranslations('common');
  const { apiRequest } = useScopedApiRequest(tenantId);
  const queryClient = useQueryClient();

  const queryKey = ['unified-rules', 'mail_routing_outbound', tenantId];
  const { data: rules = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => getUnifiedRules({ rule_class: 'route', stage: 'data', page: 'mail_routing_outbound' }, apiRequest),
  });
  const rows = useMemo(() => sortRuleRows(rules.map(unifiedToRow)), [rules]);

  const { data: activeGroups = [] } = useQuery<ProxysvrGroup[]>({
    queryKey: ['proxysvr-groups', 'active'],
    queryFn: () => listActiveProxysvrGroups(apiRequest),
  });

  const [search, setSearch] = useState('');
  const filteredRows = useMemo(() => {
    const kw = search.trim().toLowerCase();
    return rows.filter((r) => !kw || r.ruleName.toLowerCase().includes(kw));
  }, [rows, search]);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<RuleDraft>(emptyDraft());
  const [moreConditionsValid, setMoreConditionsValid] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<OutboundRuleRow | null>(null);
  const [simText, setSimText] = useState<string | null>(null);
  // React Query updates isPending on the next render. A fast double click can
  // therefore enter handleSave twice before the button becomes disabled.
  const saveStartedRef = useRef(false);

  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const openCreate = () => {
    saveStartedRef.current = false;
    setDraft(emptyDraft());
    setMoreConditionsValid(true);
    setEditingId(null);
    setSimText(null);
    setDrawerOpen(true);
  };

  const openEdit = (row: OutboundRuleRow) => {
    saveStartedRef.current = false;
    setDraft(draftFromRow(row));
    setMoreConditionsValid(true);
    setEditingId(row.id);
    setSimText(null);
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setEditingId(null);
  };

  // channels 是父组件传入的真实 proxysvr_groups 全量列表（含非 active 的，见
  // OutboundRoutingTab.tsx），行 id 是不带前缀的组 id 字符串；channelId 的 `psg:<id>` 前缀
  // 只是本表单内部编码，这里剥掉前缀再查找。
  const groupRowIdOf = (channelId: string): string | null => (channelId.startsWith('psg:') ? channelId.slice(4) : null);
  const channelOf = (channelId: string): OutboundChannelRow | undefined => {
    const gid = groupRowIdOf(channelId);
    return gid ? channels.find((c) => c.id === gid) : undefined;
  };

  const channelInvalid = (row: OutboundRuleRow): boolean => {
    if (row.channelId === 'default') return false;
    return !channelOf(row.channelId);
  };

  const channelDisplay = (row: OutboundRuleRow): string => {
    if (row.channelId === 'default') return t('defaultChannelLabel');
    const ch = channelOf(row.channelId);
    return ch ? t('channelWithCount', { name: ch.channelName, count: ch.proxyIds.length }) : t('channelUnavailable');
  };

  const firstProxyOf = (channelId: string): OutboundProxyRow | undefined => {
    const ch = channelOf(channelId);
    if (!ch || ch.proxyIds.length === 0) return undefined;
    return proxies.find((p) => p.id === ch.proxyIds[0]);
  };

  const heloDisplay = (row: OutboundRuleRow): string => {
    if (row.channelId === 'default') return t('systemDefaultHelo');
    const proxy = firstProxyOf(row.channelId);
    if (!proxy) return '—';
    return proxy.heloHostname || t('systemDefaultHelo');
  };

  const tlsLevelLabel = (level: TlsLevel): string => t(`tlsLevelLabels.${level}`);

  const draftChannelProxies = useMemo(() => {
    const gid = groupRowIdOf(draft.channelId);
    const ch = gid ? channels.find((c) => c.id === gid) : undefined;
    if (!ch) return [];
    return ch.proxyIds.map((id) => proxies.find((p) => p.id === id)).filter((p): p is OutboundProxyRow => !!p);
  }, [draft.channelId, channels, proxies]);

  // ─── 校验 ───────────────────────────────────────────────────────────────
  const nameErr = !draft.ruleName.trim() ? t('fields.ruleNameRequired') : '';
  const loopbackErr = LOOPBACK_HOSTS.includes(draft.targetHost.trim().toLowerCase()) ? t('fields.targetHostLoopback') : '';
  // 目的地址在 channel≠proxysvr 时是必填（浏览器实测发现的真实后端约束，见
  // rule-mapping.ts::rowToUnifiedPayload 顶部注释）：unified-rules 的
  // validateRouteRuleMetadata 对 channel=smtp 强制要求 next_hop_host 非空，"留空按收信域 MX
  // 投递" 这句 demo hint 文案在真实后端行不通——且新建请求不论 Mock 开关都直连真实后端
  // （task-2-brief 既定取舍，bare POST /unified-rules 不 mock），所以这不是可以只在"真实模式"
  // 才校验的分支，Mock 模式新建同样会打真实后端。channelId=proxysvr（真实模式具体通道）时
  // 目的地址由通道自身决定，不受此约束。
  const isPsgChannel = draft.channelId.startsWith('psg:');
  const targetHostRequiredErr = !isPsgChannel && !draft.targetHost.trim() ? t('fields.targetHostRequired') : '';
  const hasError = !!(nameErr || loopbackErr || (!loopbackErr && targetHostRequiredErr) || !moreConditionsValid);

  // 已知限制（浏览器实测发现，非本任务可解，超出 webapp 改动范围）：demo 允许保存一条真正
  // "全空条件"的兜底规则，但真实后端 internal/api/field_registry.go::validateConditionNode
  // 对 AND/OR 节点要求 len(children)>0，且 mail_routing_outbound（rule_class=route）不在
  // isAdvancedRulesCatchAllTree / isGroupPolicySentinelTree 的空树白名单里（那两个例外分别
  // 只服务 advanced_rules 的 tag 规则与 group_policy 哨兵规则）。加上"新建请求恒直连真实后端、
  // 不受 Mock 开关影响"（task-2-brief 既定取舍，bare POST /unified-rules 不 mock），意味着无论
  // 哪种模式，真正创建一条零条件的新规则都会被真实后端 400 拒绝——这里不额外加客户端拦截（那样
  // 会比 demo 更严格，且会掩盖"编辑一条已有 mock 兜底规则"这个仍然可行的路径），只是不承诺
  // 本行为在创建新规则时端到端可用；saveMutation 的 onError 会把后端的 400 原样 toast 出来，
  // 不会静默失败。
  const builtTree = useMemo(() => buildConditionTree(draft), [draft]);
  const noConditions = (builtTree.children ?? []).length === 0;

  const tlsConflictProxy = draftChannelProxies.find((p) => p.tlsMinVersion === '1.0' || p.tlsMinVersion === '1.1');
  const tlsConflictWarning =
    draft.tlsLevel === 'forceVerify' && tlsConflictProxy
      ? t('fields.tlsConflictWarning', { version: `TLSv${tlsConflictProxy.tlsMinVersion}` })
      : '';
  const tlsPlainPublicWarning = draft.tlsLevel === 'plain' && isPublicIPv4(draft.targetHost.trim()) ? t('fields.tlsPlainPublicWarning') : '';

  const saveMutation = useMutation({
    mutationFn: () => {
      // tlsSuccessRate 是服务端从 outbound_delivery_stats 计算的只读聚合（不经由这次保存写入，
      // 见 rule-mapping.ts rowToUnifiedPayload 不再引用该字段），这里填 null 只是满足
      // OutboundRuleRow 的类型要求。
      const row: OutboundRuleRow = {
        id: draft.id,
        ruleName: draft.ruleName.trim(),
        priority: draft.priority,
        status: draft.status,
        channelId: draft.channelId,
        tlsLevel: draft.tlsLevel,
        tlsSuccessRate: null,
        conditionTree: builtTree,
        targetHost: draft.targetHost.trim(),
        targetPort: draft.targetPort,
        updatedAt: '',
      };
      const payload = rowToUnifiedPayload(row);
      return editingId != null ? updateUnifiedRule(editingId, payload, apiRequest) : createUnifiedRule(payload, apiRequest);
    },
    onSuccess: () => {
      toast.success(editingId != null ? t('toasts.updated') : t('toasts.created'));
      if (noConditions) toast.warning(t('toasts.noConditionSaved'));
      closeDrawer();
      invalidate();
    },
    onError: (e: Error) => {
      saveStartedRef.current = false;
      toast.error(apiErrorMessage(e));
    },
  });

  const handleSave = () => {
    if (saveStartedRef.current) return;
    if (hasError) {
      toast.error(t('toasts.saveError'));
      return;
    }
    saveStartedRef.current = true;
    saveMutation.mutate();
  };

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteUnifiedRule(id, apiRequest),
    onSuccess: () => {
      toast.success(t('toasts.deleted'));
      setDeleteTarget(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(apiErrorMessage(e)),
  });

  const runSimulate = () => {
    const channelLabel = draft.channelId === 'default' ? t('defaultChannelLabel') : (channelOf(draft.channelId)?.channelName ?? t('channelUnavailable'));
    const proxy = draftChannelProxies[0];
    const helo = proxy ? proxy.heloHostname || t('systemDefaultHelo') : t('systemDefaultHelo');
    const lines = [
      t('simulate.channel', { channel: channelLabel }),
      ...(proxy ? [t('simulate.proxy', { name: proxy.name, egress: proxy.egressIp })] : []),
      t('simulate.helo', { helo }),
      t('simulate.tls', { level: tlsLevelLabel(draft.tlsLevel) }),
    ];
    const pre = [
      t('simulate.header', { name: draft.ruleName || '-' }),
      ...lines.map((l) => `├── ${l}`),
      `└── ${t('simulate.response')}`,
    ].join('\n');
    setSimText(pre);
  };

  const viewTopology = () => toast.message(t('viewTopologyToast'));

  return (
    <div className="space-y-4" data-testid="mr-ob-rule-root">
      <ListToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={t('searchPlaceholder')}
        onReset={() => setSearch('')}
        actions={
          <>
            <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={viewTopology} data-testid="mr-ob-rule-view-topology">
              {t('viewTopology')}
            </Button>
            <Button size="sm" className="h-9 gap-1.5" onClick={openCreate} data-testid="mr-ob-rule-create">
              <Plus className="h-4 w-4" />
              {ts('create')}
            </Button>
          </>
        }
        testIdPrefix="mr-ob-rule"
      />

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filteredRows.length === 0 ? (
        <div data-testid="mr-ob-rule-empty">
          <EmptyState
            title={ts('emptyText')}
            action={
              <Button variant="outline" size="sm" onClick={openCreate}>
                {ts('addNow')}
              </Button>
            }
          />
        </div>
      ) : (
        <>
          <Table data-testid="mr-ob-rule-table">
            <TableHeader>
              <TableRow>
                <TableHead>{t('columns.id')}</TableHead>
                <TableHead>{t('columns.ruleName')}</TableHead>
                <TableHead>{t('columns.priority')}</TableHead>
                <TableHead>{t('columns.status')}</TableHead>
                <TableHead>{t('columns.channel')}</TableHead>
                <TableHead>{t('columns.helo')}</TableHead>
                <TableHead>{t('columns.tlsLevel')}</TableHead>
                <TableHead>{t('columns.tlsSuccessRate')}</TableHead>
                <TableHead className="w-[200px]">{t('columns.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows.map((row) => {
                const invalid = channelInvalid(row);
                const showTlsAlert = row.tlsLevel === 'force' && typeof row.tlsSuccessRate === 'number' && row.tlsSuccessRate < 90;
                return (
                  <TableRow key={row.id} data-testid={`mr-ob-rule-row-${row.id}`}>
                    <TableCell className="text-muted-foreground">{row.id}</TableCell>
                    <TableCell className="font-medium">{row.ruleName}</TableCell>
                    <TableCell>{row.priority}</TableCell>
                    <TableCell>
                      {invalid ? (
                        <Badge variant="outline" className="border-amber-300 bg-amber-50 font-normal text-amber-700" data-testid={`mr-ob-rule-channel-invalid-${row.id}`}>
                          {t('channelInvalidBadge')}
                        </Badge>
                      ) : row.status === 'enabled' ? (
                        <Badge className="border-transparent bg-blue-600 font-normal text-white hover:bg-blue-600">{tc('enabled')}</Badge>
                      ) : (
                        <Badge className="border-transparent bg-gray-100 font-normal text-gray-500 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-400">{tc('disabled')}</Badge>
                      )}
                    </TableCell>
                    <TableCell>{channelDisplay(row)}</TableCell>
                    <TableCell>{heloDisplay(row)}</TableCell>
                    <TableCell>{tlsLevelLabel(row.tlsLevel)}</TableCell>
                    <TableCell>
                      {row.tlsSuccessRate === null ? (
                        '—'
                      ) : (
                        <span className={showTlsAlert ? 'inline-flex items-center gap-1 text-amber-600' : 'inline-flex items-center gap-1 text-gray-600'}>
                          {showTlsAlert && <AlertTriangle className="h-3.5 w-3.5" data-testid={`mr-ob-rule-tls-alert-${row.id}`} />}
                          {row.tlsSuccessRate}%
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-0.5">
                        <Button variant="ghost" size="sm" className="h-7 gap-1 text-gray-600" onClick={() => openEdit(row)} data-testid={`mr-ob-rule-simulate-${row.id}`}>
                          <FlaskConical className="h-3.5 w-3.5" />
                          {t('simulateButton')}
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 gap-1 text-blue-600" onClick={() => openEdit(row)} data-testid={`mr-ob-rule-edit-${row.id}`}>
                          <Pencil className="h-3.5 w-3.5" />
                          {t('editButton')}
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 gap-1 text-red-600" onClick={() => setDeleteTarget(row)} data-testid={`mr-ob-rule-delete-${row.id}`}>
                          <Trash2 className="h-3.5 w-3.5" />
                          {t('deleteButton')}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <div className="text-sm text-muted-foreground">{tc('total', { count: filteredRows.length })}</div>
        </>
      )}

      <Sheet open={drawerOpen} onOpenChange={(open) => !open && closeDrawer()}>
        <SheetContent side="right" className="w-full sm:max-w-xl" data-testid="mr-ob-rule-drawer">
          <SheetHeader>
            <SheetTitle>{editingId != null ? t('drawerTitleEdit') : t('drawerTitleNew')}</SheetTitle>
            <SheetDescription>{t('drawerDescription')}</SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
            <div className="space-y-3 rounded-lg border border-border p-4">
              <h4 className="text-sm font-medium">{t('sectionBasic')}</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>
                    {t('fields.ruleName')}
                    <span className="ml-0.5 text-destructive">*</span>
                  </Label>
                  <Input value={draft.ruleName} onChange={(e) => setDraft((d) => ({ ...d, ruleName: e.target.value }))} data-testid="mr-ob-rule-name-input" />
                  {nameErr && (
                    <p className="text-xs text-destructive" data-testid="mr-ob-rule-name-error">
                      {nameErr}
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>{t('fields.priority')}</Label>
                  <Input
                    type="number"
                    value={draft.priority}
                    onChange={(e) => setDraft((d) => ({ ...d, priority: Number(e.target.value) || 0 }))}
                    data-testid="mr-ob-rule-priority-input"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={draft.status === 'enabled'}
                  onCheckedChange={(c) => setDraft((d) => ({ ...d, status: c ? 'enabled' : 'disabled' }))}
                  data-testid="mr-ob-rule-active-switch"
                />
                {draft.status === 'enabled' ? t('fields.active') : t('fields.inactive')}
              </label>
            </div>

            <div className="space-y-3 rounded-lg border border-border p-4">
              <h4 className="text-sm font-medium">{t('sectionCondition')}</h4>
              {noConditions && (
                <div
                  className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-400"
                  data-testid="mr-ob-rule-no-condition-warning"
                >
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                  {t('noConditionWarning')}
                </div>
              )}
              <div className="space-y-1.5">
                <Label>{t('fields.sourceIp')}</Label>
                <Input
                  value={draft.sourceIp}
                  onChange={(e) => setDraft((d) => ({ ...d, sourceIp: e.target.value }))}
                  placeholder={t('fields.sourceIpPlaceholder')}
                  data-testid="mr-ob-rule-source-ip-input"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>{t('fields.fromDomain')}</Label>
                  <Input value={draft.fromDomain} onChange={(e) => setDraft((d) => ({ ...d, fromDomain: e.target.value }))} data-testid="mr-ob-rule-from-domain-input" />
                </div>
                <div className="space-y-1.5">
                  <Label>{t('fields.fromUser')}</Label>
                  <Input
                    value={draft.fromUser}
                    onChange={(e) => setDraft((d) => ({ ...d, fromUser: e.target.value }))}
                    placeholder={t('fields.fromUserPlaceholder')}
                    data-testid="mr-ob-rule-from-user-input"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>{t('fields.rcptDomain')}</Label>
                <div className="flex gap-2">
                  <Select value={draft.rcptDomainMatch} onValueChange={(v) => setDraft((d) => ({ ...d, rcptDomainMatch: v as RcptMatchType }))}>
                    <SelectTrigger className="w-28" data-testid="mr-ob-rule-rcpt-domain-match">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="contains">{tRcpt('rcptMatchContains')}</SelectItem>
                      <SelectItem value="equals">{tRcpt('rcptMatchEquals')}</SelectItem>
                      <SelectItem value="regex">{tRcpt('rcptMatchRegex')}</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    className="flex-1"
                    value={draft.rcptDomain}
                    onChange={(e) => setDraft((d) => ({ ...d, rcptDomain: e.target.value }))}
                    data-testid="mr-ob-rule-rcpt-domain-input"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>{t('fields.rcptUser')}</Label>
                <div className="flex gap-2">
                  <Select value={draft.rcptUserKind} onValueChange={(v) => setDraft((d) => ({ ...d, rcptUserKind: v as RcptUserKind }))}>
                    <SelectTrigger className="w-28" data-testid="mr-ob-rule-rcpt-user-kind">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="to">{t('fields.rcptKindTo')}</SelectItem>
                      <SelectItem value="cc">{t('fields.rcptKindCc')}</SelectItem>
                      <SelectItem value="bcc">{t('fields.rcptKindBcc')}</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    className="flex-1"
                    value={draft.rcptUser}
                    onChange={(e) => setDraft((d) => ({ ...d, rcptUser: e.target.value }))}
                    data-testid="mr-ob-rule-rcpt-user-input"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>{t('fields.intentTag')}</Label>
                <MultiSelectFilter
                  options={INTENT_TAG_ALL_VALUES.map((value) => ({
                    value,
                    label: t(`fields.intentTagValue${value}`),
                  }))}
                  value={draft.intentTags}
                  onChange={(intentTags) => setDraft((current) => ({ ...current, intentTags }))}
                  placeholder={t('fields.intentTagAny')}
                  selectedCountLabel={(count) => t('fields.intentTagSelected', { count })}
                  clearLabel={t('fields.intentTagClear')}
                  className="h-9 text-sm"
                  triggerTestId="mr-ob-rule-intent-tag-select"
                />
                <p className="text-xs text-muted-foreground">{t('fields.intentTagHint')}</p>
              </div>
              <CompactConditionEditor
                tenantId={tenantId}
                value={draft.otherConditions}
                onChange={(otherConditions) => setDraft((current) => ({ ...current, otherConditions }))}
                excludedFields={FIXED_CONDITION_FIELDS}
                onValidityChange={setMoreConditionsValid}
              />
            </div>

            <div className="space-y-3 rounded-lg border border-border p-4">
              <h4 className="text-sm font-medium">{t('sectionRouting')}</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>
                    {t('fields.targetHost')}
                    {!isPsgChannel && <span className="ml-0.5 text-destructive">*</span>}
                  </Label>
                  <Input value={draft.targetHost} onChange={(e) => setDraft((d) => ({ ...d, targetHost: e.target.value }))} data-testid="mr-ob-rule-target-host-input" />
                  <p className="text-xs text-muted-foreground">{t(isPsgChannel ? 'fields.targetHostHint' : 'fields.targetHostHintRequired')}</p>
                  {loopbackErr ? (
                    <p className="text-xs text-destructive" data-testid="mr-ob-rule-target-host-error">
                      {loopbackErr}
                    </p>
                  ) : (
                    targetHostRequiredErr && (
                      <p className="text-xs text-destructive" data-testid="mr-ob-rule-target-host-error">
                        {targetHostRequiredErr}
                      </p>
                    )
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>{t('fields.targetPort')}</Label>
                  <Input
                    type="number"
                    value={draft.targetPort}
                    onChange={(e) => setDraft((d) => ({ ...d, targetPort: Number(e.target.value) || 25 }))}
                    data-testid="mr-ob-rule-target-port-input"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>
                  {t('fields.tlsLevel')}
                  <span className="ml-0.5 text-destructive">*</span>
                </Label>
                <Select
                  value={draft.tlsLevel}
                  onValueChange={(v) => setDraft((d) => ({ ...d, tlsLevel: v as TlsLevel }))}
                >
                  <SelectTrigger className="w-fit" data-testid="mr-ob-rule-tls-level-select">
                    <SelectValue>{t(`tlsLevelLabels.${draft.tlsLevel}`)}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {TLS_LEVELS.map((lv) => (
                      <SelectItem key={lv} value={lv}>
                        {t(`tlsLevelLabels.${lv}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {tlsConflictWarning && (
                  <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-400" data-testid="mr-ob-rule-tls-conflict-warning">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                    {tlsConflictWarning}
                  </div>
                )}
                {tlsPlainPublicWarning && (
                  <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-400" data-testid="mr-ob-rule-tls-plain-warning">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                    {tlsPlainPublicWarning}
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>
                  {t('fields.channel')}
                  <span className="ml-0.5 text-destructive">*</span>
                </Label>
                <Select value={draft.channelId} onValueChange={(v) => setDraft((d) => ({ ...d, channelId: v ?? 'default' }))}>
                  <SelectTrigger className="w-fit" data-testid="mr-ob-rule-channel-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">{t('defaultChannelLabel')}</SelectItem>
                    {activeGroups.map((g) => (
                      <SelectItem key={g.id} value={`psg:${g.id}`}>
                        {g.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {draftChannelProxies.length > 0 && (
                <div className="overflow-hidden rounded-md border border-border" data-testid="mr-ob-rule-channel-proxy-preview">
                  <div className="bg-gray-50 px-3 py-1.5 text-xs text-gray-500 dark:bg-gray-900">{t('fields.channelProxyPreviewTitle')}</div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('fields.channelProxyColumns.name')}</TableHead>
                        <TableHead>{t('fields.channelProxyColumns.proxyIp')}</TableHead>
                        <TableHead>{t('fields.channelProxyColumns.egressIp')}</TableHead>
                        <TableHead>{t('fields.channelProxyColumns.helo')}</TableHead>
                        <TableHead>{t('fields.channelProxyColumns.status')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {draftChannelProxies.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell>{p.name}</TableCell>
                          <TableCell>{p.proxyIp}</TableCell>
                          <TableCell>{p.egressIp}</TableCell>
                          <TableCell>{p.heloHostname || t('systemDefaultHelo')}</TableCell>
                          <TableCell>
                            {p.probeStatus === 'normal' ? (
                              <Badge variant="outline" className="border-green-200 bg-green-50 font-normal text-green-600">{ts('probe.normal')}</Badge>
                            ) : (
                              <Badge variant="outline" className="border-red-200 bg-red-50 font-normal text-red-600">{ts('probe.abnormal')}</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            <div className="space-y-3 rounded-lg border border-border p-4">
              <div>
                <h4 className="text-sm font-medium">{t('sectionSimulate')}</h4>
                <p className="mt-0.5 text-xs text-muted-foreground">{t('simulateDesc')}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={runSimulate}
                data-testid="mr-ob-rule-simulate-run"
              >
                <FlaskConical className="h-3.5 w-3.5" />
                {t('simulateButton')}
              </Button>
              {simText && (
                <pre className="whitespace-pre-wrap rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-xs text-foreground/80" data-testid="mr-ob-rule-simulate-result">
                  {simText}
                </pre>
              )}
            </div>
          </div>
          <SheetFooter>
            <Button onClick={handleSave} disabled={saveMutation.isPending} data-testid="mr-ob-rule-save">
              {saveMutation.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              {tc('save')}
            </Button>
            <Button variant="outline" onClick={closeDrawer} data-testid="mr-ob-rule-cancel">
              {tc('cancel')}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent data-testid="mr-ob-rule-delete-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteDialogTitle', { name: deleteTarget?.ruleName ?? '' })}</AlertDialogTitle>
            <AlertDialogDescription>{t('deleteDialogDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              data-testid="mr-ob-rule-delete-confirm"
            >
              {t('deleteConfirmButton')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
