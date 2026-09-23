import type {
  PolicyModule,
  RuleEffectivenessRow,
  SimilarDetectionType,
  WouldBeAction,
} from '@/lib/api/rule-effectiveness-view';

// 规则效能统计（观察模式）页面的共享常量。
// 颜色沿用安全总览「威胁语义色阶」token，不新增配色。

export const POLICY_MODULES: PolicyModule[] = ['auth_spoofing', 'similar_detection', 'phishing_detection'];

export const SIMILAR_DETECTION_TYPES: SimilarDetectionType[] = ['similar_email', 'same_subject'];

// 相似检测下相似邮件检测/相同主题检测是两条独立策略（不同判定维度、不同误判特征），
// 筛选栏、明细表、趋势图必须能按策略单独区分，不能只提供一个笼统的「相似检测」勾选项，
// 否则用户看到命中/误判数字后无法判断该去处理哪一条策略。
export type ModuleFilterOption =
  | 'auth_spoofing'
  | 'similar_detection_similar_email'
  | 'similar_detection_same_subject'
  | 'phishing_detection';

export const MODULE_FILTER_OPTIONS: ModuleFilterOption[] = [
  'auth_spoofing',
  'similar_detection_similar_email',
  'similar_detection_same_subject',
  'phishing_detection',
];

/** 把筛选栏勾选项拆解为请求参数：模块集合 + （若命中相似检测）具体策略集合。 */
export function resolveModuleFilterParams(options: ModuleFilterOption[]): {
  modules: PolicyModule[];
  similarDetectionTypes: SimilarDetectionType[];
} {
  const modules = new Set<PolicyModule>();
  const similarDetectionTypes = new Set<SimilarDetectionType>();
  options.forEach((opt) => {
    if (opt === 'similar_detection_similar_email') {
      modules.add('similar_detection');
      similarDetectionTypes.add('similar_email');
    } else if (opt === 'similar_detection_same_subject') {
      modules.add('similar_detection');
      similarDetectionTypes.add('same_subject');
    } else {
      modules.add(opt);
    }
  });
  return { modules: [...modules], similarDetectionTypes: [...similarDetectionTypes] };
}

/**
 * 明细表/超时告警条「策略路径」列——不再用「策略模块」+「子策略/方向名称」
 * 两栏拆分呈现，而是拼成与配置页导航一致的完整路径（如「身份认证与仿冒检测
 * → 基础格式检查 → 无效 MAIL FROM」），用户一眼就能看出该去配置页的哪一级处理，
 * 不需要先理解报表内部的分栏逻辑。
 *
 * 已知的身份认证与仿冒检测子策略 id——与 AuthSpoofingSubStrategy 保持一致，
 * 用于判断某一行是否命中已知路径，命中不了时退化为「模块名 + 原始名称快照」，
 * 而不是让路径直接显示一个陌生的技术 id。
 */
const KNOWN_AUTH_SUB_STRATEGY_IDS = new Set<string>([
  'protocol_check_spf',
  'protocol_check_dkim',
  'protocol_check_dmarc',
  'protocol_check_ptr',
  'format_check_mailfrom_empty',
  'format_check_mailfrom_invalid',
  'format_check_envelope_header_mismatch',
  'display_name_spoofing_inbound',
  'display_name_spoofing_outbound',
  'display_name_spoofing_internal',
  'similar_domain',
]);

function similarDetectionScopeKey(scope: RuleEffectivenessRow['similar_detection_scope']): string {
  switch (scope) {
    case 'receive':
      return 'directionReceive';
    case 'send':
      return 'directionSend';
    case 'internal':
      return 'directionInternal';
    default:
      return 'aggregateScope';
  }
}

/**
 * 返回该观察对象在 `ruleEffectiveness.path` i18n 命名空间下的路径 key 数组，
 * 按序对应「一级模块 → 二级子模块/策略 → 三级具体项」，层级数按各模块真实
 * 结构决定，不强行对齐层数（例如协议检测、相似域名检测只有两级）。
 */
export function strategyPathKeys(
  row: Pick<RuleEffectivenessRow, 'policy_module' | 'sub_strategy_id' | 'similar_detection_type' | 'similar_detection_scope'>,
): string[] {
  if (row.policy_module === 'similar_detection') {
    const typeKey = row.similar_detection_type === 'same_subject' ? 'sameSubject' : 'similarEmail';
    return ['similarDetection', typeKey, similarDetectionScopeKey(row.similar_detection_scope)];
  }
  if (row.policy_module === 'phishing_detection') {
    return ['phishingDetection'];
  }
  switch (row.sub_strategy_id) {
    case 'protocol_check_spf':
      return ['authSpoofing', 'protocolCheck', 'protocolCheckSpf'];
    case 'protocol_check_dkim':
      return ['authSpoofing', 'protocolCheck', 'protocolCheckDkim'];
    case 'protocol_check_dmarc':
      return ['authSpoofing', 'protocolCheck', 'protocolCheckDmarc'];
    case 'protocol_check_ptr':
      return ['authSpoofing', 'protocolCheck', 'protocolCheckPtr'];
    case 'format_check_mailfrom_empty':
      return ['authSpoofing', 'formatCheck', 'formatCheckMailfromEmpty'];
    case 'format_check_mailfrom_invalid':
      return ['authSpoofing', 'formatCheck', 'formatCheckMailfromInvalid'];
    case 'format_check_envelope_header_mismatch':
      return ['authSpoofing', 'formatCheck', 'formatCheckEnvelopeMismatch'];
    case 'display_name_spoofing_inbound':
      return ['authSpoofing', 'displayNameSpoofing', 'directionReceive'];
    case 'display_name_spoofing_outbound':
      return ['authSpoofing', 'displayNameSpoofing', 'directionSend'];
    case 'display_name_spoofing_internal':
      return ['authSpoofing', 'displayNameSpoofing', 'directionInternal'];
    case 'similar_domain':
      return ['authSpoofing', 'similarDomain'];
    default:
      return ['authSpoofing'];
  }
}

/**
 * 把路径 key 数组解析为最终展示文案数组——身份认证与仿冒检测下若命中未知的
 * sub_strategy_id（不在 KNOWN_AUTH_SUB_STRATEGY_IDS 内），在模块名后追加原始
 * 名称快照作为兜底的最后一级，而不是让路径断在模块名就不再往下细化。
 */
export function strategyPathLabels(
  row: Pick<
    RuleEffectivenessRow,
    'policy_module' | 'sub_strategy_id' | 'sub_strategy_name_snapshot' | 'similar_detection_type' | 'similar_detection_scope'
  >,
  translatePath: (key: string) => string,
): string[] {
  const labels = strategyPathKeys(row).map((key) => translatePath(key));
  if (row.policy_module === 'auth_spoofing' && !KNOWN_AUTH_SUB_STRATEGY_IDS.has(row.sub_strategy_id)) {
    labels.push(row.sub_strategy_name_snapshot);
  }
  return labels;
}

export const OBSERVE_DURATION_BUCKETS = ['lt7', '7to30', 'gt30'] as const;

/** 超过该观察天数视为「待评估」，触发超时告警条。 */
export const OBSERVE_TIMEOUT_DAYS = 30;

export const MODULE_COLORS: Record<PolicyModule, string> = {
  auth_spoofing: '#3B82F6',
  similar_detection: '#8B5CF6',
  phishing_detection: '#F59E0B',
};

export function moduleColor(module: PolicyModule): string {
  return MODULE_COLORS[module] ?? '#6b7280';
}

export const WOULD_BE_ACTION_COLORS: Record<WouldBeAction, string> = {
  accept: '#10B981',
  quarantine: '#F59E0B',
  audit: '#8B5CF6',
  reject: '#EF4444',
  discard: '#DC2626',
  recall: '#0EA5E9',
};

export function actionColor(action: WouldBeAction): string {
  return WOULD_BE_ACTION_COLORS[action] ?? '#6b7280';
}
