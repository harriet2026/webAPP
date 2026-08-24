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

/** 提交：动作值原样发送；白名单标记通过独立开关生成 add_headers。 */
export function toGatewayPayload(action: DemoAction, addWhitelistTag = false): { action: IPFilterAction; add_headers?: HeaderKV[] } {
  if (action === 'accept' && addWhitelistTag) {
    return { action: 'accept', add_headers: [{ ...WHITELIST_TAG_HEADER }] };
  }
  return { action };
}

export function hasWhitelistTag(headers?: HeaderKV[]): boolean {
  return !!headers?.some((h) => h.key.toUpperCase() === WHITELIST_TAG_HEADER.key.toUpperCase());
}

/** 读回：UI 与 API 使用相同动作值；sideline 仍是 IP 模块扩展动作。 */
export function fromGatewayView(
  action: IPFilterAction,
  _addHeaders: HeaderKV[] | undefined,
  listType: IPFilterListType,
): DemoAction {
  if (action === 'accept' || action === 'reject' || action === 'quarantine' || action === 'discard' || action === 'audit') {
    return action;
  }
  return listType === 'whitelist' ? 'accept' : 'audit';
}

export const BLACKLIST_DEMO_ACTIONS: DemoBlacklistAction[] = ['quarantine', 'audit', 'reject', 'discard'];
export const WHITELIST_DEMO_ACTIONS: DemoWhitelistAction[] = ['accept'];

// demo 动作 → i18n key（label）
export const DEMO_ACTION_LABEL_KEY: Record<DemoAction, string> = {
  reject: 'ipFilter.actionReject',
  quarantine: 'ipFilter.actionQuarantine',
  discard: 'ipFilter.actionDiscard',
  audit: 'ipFilter.actionAudit',
  accept: 'ipFilter.actionAccept',
};

// demo 动作 → 列表 Tooltip i18n key
export const DEMO_ACTION_TIP_KEY: Record<DemoAction, string> = {
  reject: 'ipFilter.actionBlockListTip',
  quarantine: 'ipFilter.actionQuarantineListTip',
  discard: 'ipFilter.actionDropListTip',
  audit: 'ipFilter.actionReviewListTip',
  accept: 'ipFilter.actionDeliverListTip',
};

// demo 动作 → 表格/预览 Badge 颜色（对齐 demo connection-layer-page.tsx getActionBadge）
export const DEMO_ACTION_BADGE_CLASS: Record<DemoAction, string> = {
  quarantine: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  audit: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  reject: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  discard: 'bg-red-200 text-red-900 dark:bg-red-950 dark:text-red-300',
  accept: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
};
