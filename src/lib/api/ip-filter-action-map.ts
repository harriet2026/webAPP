import type {
  DemoAction,
  DemoBlacklistAction,
  DemoWhitelistAction,
  HeaderKV,
  IPFilterAction,
  IPFilterListType,
} from '@/types/ip-filter';

// 白名单「标记投递」= accept + 该 header（implement.md：mark 对应 accept + 添加特定 header）。
export const WHITELIST_TAG_HEADER: HeaderKV = { key: 'X-Whitelist', value: 'yes' };

// demo 动作(UI) → 网关统一 action(payload)
const DEMO_TO_GATEWAY: Record<DemoAction, IPFilterAction> = {
  block: 'reject',
  quarantine: 'quarantine',
  drop: 'discard',
  review: 'audit',
  deliver: 'accept',
  tagDeliver: 'accept',
};

// 网关统一 action → demo 动作(UI) 的基础反查（accept 的黑/白/标记细分单独处理）
const GATEWAY_TO_DEMO: Partial<Record<IPFilterAction, DemoAction>> = {
  reject: 'block',
  quarantine: 'quarantine',
  discard: 'drop',
  audit: 'review',
  // sideline 无 demo 对应，读回时降级为 review 展示（见 fromGatewayView）
};

/** 提交：把 UI 的 demo 动作映射为网关 payload 的 action(+ add_headers)。 */
export function toGatewayPayload(demoAction: DemoAction): { action: IPFilterAction; add_headers?: HeaderKV[] } {
  if (demoAction === 'tagDeliver') {
    return { action: 'accept', add_headers: [{ ...WHITELIST_TAG_HEADER }] };
  }
  return { action: DEMO_TO_GATEWAY[demoAction] };
}

function hasTagHeader(headers?: HeaderKV[]): boolean {
  return !!headers?.some((h) => h.key.toUpperCase() === WHITELIST_TAG_HEADER.key.toUpperCase());
}

/** 读回：把网关 action(+ add_headers + 名单类型) 映射回 UI 的 demo 动作。 */
export function fromGatewayView(
  action: IPFilterAction,
  addHeaders: HeaderKV[] | undefined,
  listType: IPFilterListType,
): DemoAction {
  if (action === 'accept') {
    return hasTagHeader(addHeaders) ? 'tagDeliver' : 'deliver';
  }
  if (action === 'sideline') {
    // 网关额外动作，无 demo 词表对应：黑名单场景按「审核」近义展示。
    return 'review';
  }
  return GATEWAY_TO_DEMO[action] ?? (listType === 'whitelist' ? 'deliver' : 'block');
}

export const BLACKLIST_DEMO_ACTIONS: DemoBlacklistAction[] = ['quarantine', 'review', 'block', 'drop'];
export const WHITELIST_DEMO_ACTIONS: DemoWhitelistAction[] = ['deliver', 'tagDeliver'];

// demo 动作 → i18n key（label）
export const DEMO_ACTION_LABEL_KEY: Record<DemoAction, string> = {
  block: 'ipFilter.actionBlock',
  quarantine: 'ipFilter.actionQuarantine',
  drop: 'ipFilter.actionDrop',
  review: 'ipFilter.actionReview',
  deliver: 'ipFilter.actionDeliver',
  tagDeliver: 'ipFilter.actionTagDeliver',
};

// demo 动作 → 列表 Tooltip i18n key
export const DEMO_ACTION_TIP_KEY: Record<DemoAction, string> = {
  block: 'ipFilter.actionBlockListTip',
  quarantine: 'ipFilter.actionQuarantineListTip',
  drop: 'ipFilter.actionDropListTip',
  review: 'ipFilter.actionReviewListTip',
  deliver: 'ipFilter.actionDeliverListTip',
  tagDeliver: 'ipFilter.actionTagDeliverListTip',
};

// demo 动作 → 表格/预览 Badge 颜色（对齐 demo connection-layer-page.tsx getActionBadge）
export const DEMO_ACTION_BADGE_CLASS: Record<DemoAction, string> = {
  quarantine: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  review: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  block: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  drop: 'bg-red-200 text-red-900 dark:bg-red-950 dark:text-red-300',
  deliver: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  tagDeliver: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200',
};
