import type {
  PolicyModule,
  RuleEffectivenessRow,
  SimilarDetectionType,
  WouldBeAction,
} from '@/lib/api/rule-effectiveness-view';

export const POLICY_MODULES: PolicyModule[] = [
  'auth_spoofing',
  'similar_detection',
  'phishing_detection',
  'sender_filter',
  'behavior_control',
  'content_rules',
  'intent_engine',
  'advanced_filter_rules',
  'recipient_check',
];

export const SIMILAR_DETECTION_TYPES: SimilarDetectionType[] = ['similar_email', 'same_subject'];

export type ModuleFilterOption =
  | 'auth_spoofing'
  | 'similar_detection_similar_email'
  | 'similar_detection_same_subject'
  | 'phishing_detection'
  | 'sender_filter'
  | 'behavior_control'
  | 'content_rules'
  | 'intent_engine'
  | 'advanced_filter_rules'
  | 'recipient_check';

export const MODULE_FILTER_OPTIONS: ModuleFilterOption[] = [
  'auth_spoofing',
  'similar_detection_similar_email',
  'similar_detection_same_subject',
  'phishing_detection',
  'sender_filter',
  'behavior_control',
  'content_rules',
  'intent_engine',
  'advanced_filter_rules',
  'recipient_check',
];

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

const KNOWN_AUTH_SUB_STRATEGY_IDS = new Set<string>([
  'protocol_check_spf', 'protocol_check_dkim', 'protocol_check_dmarc', 'protocol_check_ptr',
  'format_check_mailfrom_empty', 'format_check_mailfrom_invalid', 'format_check_envelope_header_mismatch',
  'display_name_spoofing_inbound', 'display_name_spoofing_outbound', 'display_name_spoofing_internal',
  'similar_domain',
]);

function similarDetectionScopeKey(scope: RuleEffectivenessRow['similar_detection_scope']): string {
  switch (scope) {
    case 'receive': return 'directionReceive';
    case 'send': return 'directionSend';
    case 'internal': return 'directionInternal';
    default: return 'aggregateScope';
  }
}

export function strategyPathKeys(
  row: Pick<RuleEffectivenessRow, 'policy_module' | 'sub_strategy_id' | 'similar_detection_type' | 'similar_detection_scope'>,
): string[] {
  if (row.policy_module === 'similar_detection') {
    const typeKey = row.similar_detection_type === 'same_subject' ? 'sameSubject' : 'similarEmail';
    return ['similarDetection', typeKey, similarDetectionScopeKey(row.similar_detection_scope)];
  }
  if (row.policy_module === 'phishing_detection') return ['phishingDetection'];
  if (row.policy_module === 'sender_filter') return ['senderFilter'];
  if (row.policy_module === 'behavior_control') return ['behaviorControl'];
  if (row.policy_module === 'content_rules') return ['contentRules'];
  if (row.policy_module === 'intent_engine') return ['intentEngine'];
  if (row.policy_module === 'advanced_filter_rules') return ['advancedFilterRules'];
  if (row.policy_module === 'recipient_check') return ['recipientCheck'];
  switch (row.sub_strategy_id) {
    case 'protocol_check_spf': return ['authSpoofing', 'protocolCheck', 'protocolCheckSpf'];
    case 'protocol_check_dkim': return ['authSpoofing', 'protocolCheck', 'protocolCheckDkim'];
    case 'protocol_check_dmarc': return ['authSpoofing', 'protocolCheck', 'protocolCheckDmarc'];
    case 'protocol_check_ptr': return ['authSpoofing', 'protocolCheck', 'protocolCheckPtr'];
    case 'format_check_mailfrom_empty': return ['authSpoofing', 'formatCheck', 'formatCheckMailfromEmpty'];
    case 'format_check_mailfrom_invalid': return ['authSpoofing', 'formatCheck', 'formatCheckMailfromInvalid'];
    case 'format_check_envelope_header_mismatch': return ['authSpoofing', 'formatCheck', 'formatCheckEnvelopeMismatch'];
    case 'display_name_spoofing_inbound': return ['authSpoofing', 'displayNameSpoofing', 'directionReceive'];
    case 'display_name_spoofing_outbound': return ['authSpoofing', 'displayNameSpoofing', 'directionSend'];
    case 'display_name_spoofing_internal': return ['authSpoofing', 'displayNameSpoofing', 'directionInternal'];
    case 'similar_domain': return ['authSpoofing', 'similarDomain'];
    default: return ['authSpoofing'];
  }
}

export function strategyPathLabels(
  row: Pick<RuleEffectivenessRow, 'policy_module' | 'sub_strategy_id' | 'sub_strategy_name_snapshot' | 'similar_detection_type' | 'similar_detection_scope'>,
  translatePath: (key: string) => string,
): string[] {
  const labels = strategyPathKeys(row).map(translatePath);
  if (row.policy_module === 'auth_spoofing' && !KNOWN_AUTH_SUB_STRATEGY_IDS.has(row.sub_strategy_id)) {
    labels.push(row.sub_strategy_name_snapshot);
  }
  if (
    row.policy_module === 'sender_filter' ||
    row.policy_module === 'behavior_control' ||
    row.policy_module === 'content_rules' ||
    row.policy_module === 'intent_engine' ||
    row.policy_module === 'advanced_filter_rules' ||
    row.policy_module === 'recipient_check'
  ) {
    labels.push(row.sub_strategy_name_snapshot);
  }
  return labels;
}

export const OBSERVE_DURATION_BUCKETS = ['lt7', '7to30', 'gt30'] as const;
export const OBSERVE_TIMEOUT_DAYS = 30;

export const MODULE_COLORS: Record<PolicyModule, string> = {
  auth_spoofing: '#3B82F6',
  similar_detection: '#8B5CF6',
  phishing_detection: '#F59E0B',
  sender_filter: '#10B981',
  behavior_control: '#0EA5E9',
  content_rules: '#EC4899',
  intent_engine: '#6366F1',
  // 与现有六色（蓝/紫/琥珀/绿/天蓝/玫红）区分的第七色——橙棕。
  advanced_filter_rules: '#EA580C',
  recipient_check: '#14B8A6',
};

export function moduleColor(module: PolicyModule): string {
  return MODULE_COLORS[module] ?? '#6b7280';
}

export const WOULD_BE_ACTION_COLORS: Record<WouldBeAction, string> = {
  accept: '#10B981', quarantine: '#F59E0B', audit: '#8B5CF6', reject: '#EF4444', discard: '#DC2626', recall: '#0EA5E9',
};

export function actionColor(action: WouldBeAction): string {
  return WOULD_BE_ACTION_COLORS[action] ?? '#6b7280';
}
