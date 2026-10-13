// Version snapshots deliberately retain stable backend field paths. Keep the
// presentation mapping in one registry so every observation module uses the
// same localization boundary and newly introduced fields have one extension
// point. Unknown paths must never be exposed in the UI.

export type VersionFieldLabelKey =
  | 'action'
  | 'detectionWindow'
  | 'similarityThreshold'
  | 'triggerCount'
  | 'maxRecipientsPerWindow'
  | 'observationMode'
  | 'detectionMode'
  | 'directions'
  | 'ignoreCase'
  | 'ignoreReplyForwardPrefix'
  | 'ignoreNumbers'
  | 'similarSubject'
  | 'subjectMarkEnabled'
  | 'subjectMarkPosition'
  | 'subjectMarkContent'
  | 'subjectPrefixMarkContent'
  | 'subjectSuffixMarkContent'
  | 'headerMarkEnabled'
  | 'headerName'
  | 'headerValue'
  | 'headerMarks'
  | 'bodyMarkEnabled'
  | 'bodyMarkContent'
  | 'bodyPrefixMarkContent'
  | 'bodySuffixMarkContent'
  | 'condition'
  | 'stage'
  | 'priority'
  | 'tags'
  | 'effectiveStart'
  | 'effectiveEnd'
  | 'runMode'
  | 'observationAction'
  | 'observationMark'
  | 'realtimeWait'
  | 'backgroundRecheck'
  | 'continueAfterTimeout'
  | 'riskLevel'
  | 'confidenceMin'
  | 'confidenceMax'
  | 'upperInclusive'
  | 'lowRiskCutoff'
  | 'mediumRiskCutoff'
  | 'highRiskCutoff'
  | 'baseDisposition'
  | 'markPositions'
  | 'markText'
  | 'admissionRuleEnabled'
  | 'admissionFilterEnabled'
  | 'recipientGroups'
  | 'recipientDepartments'
  | 'recipientAddresses'
  | 'recipientTags'
  | 'senderGroups'
  | 'senderDepartments'
  | 'senderAddresses'
  | 'requireUrl'
  | 'maxMessageSize'
  | 'senderFirstSeen'
  | 'requireQrCode'
  | 'requireExecutable'
  | 'formatVersion'
  | 'policyFeature'
  | 'policySubfeature'
  | 'policyItem'
  | 'configurationSource'
  | 'detectionType'
  | 'mailDirection'
  | 'other';

const EXACT_FIELD_SUFFIXES: ReadonlyArray<readonly [string, VersionFieldLabelKey]> = [
  // Version snapshots store the shared addon projection, not the UI's flat
  // tag_* controls. Scope these aliases to metadata rather than any same leaf.
  ['.configuration.metadata.subject_prefix', 'subjectPrefixMarkContent'],
  ['.configuration.metadata.subject_suffix', 'subjectSuffixMarkContent'],
  ['.configuration.metadata.body_prefix_text', 'bodyPrefixMarkContent'],
  ['.configuration.metadata.body_suffix_text', 'bodySuffixMarkContent'],
  ['.configuration.metadata.add_headers', 'headerMarks'],
  ['.configuration.detection.parameters.min_count', 'triggerCount'],
  ['.configuration.detection.parameters.similarity_pct', 'similarityThreshold'],
  ['.configuration.detection.parameters.window_minutes', 'detectionWindow'],
  ['.configuration.detection.parameters.max_recipients_per_window', 'maxRecipientsPerWindow'],
  ['.configuration.detection.subject_normalization.ignore_case', 'ignoreCase'],
  ['.configuration.detection.subject_normalization.ignore_re_prefix', 'ignoreReplyForwardPrefix'],
  ['.configuration.detection.subject_normalization.ignore_numbers', 'ignoreNumbers'],
  ['.configuration.detection.subject_normalization.similar_subject', 'similarSubject'],
  ['.configuration.cutoffs.low', 'lowRiskCutoff'],
  ['.configuration.cutoffs.medium', 'mediumRiskCutoff'],
  ['.configuration.cutoffs.high', 'highRiskCutoff'],
];

const FIELD_LEAF_LABELS: Readonly<Record<string, VersionFieldLabelKey>> = {
  action: 'action',
  window_minutes: 'detectionWindow',
  similarity_pct: 'similarityThreshold',
  min_count: 'triggerCount',
  max_recipients_per_window: 'maxRecipientsPerWindow',
  observe_mode: 'observationMode',
  mode: 'detectionMode',
  directions: 'directions',
  enabled_directions: 'directions',
  ignore_case: 'ignoreCase',
  ignore_re_prefix: 'ignoreReplyForwardPrefix',
  ignore_numbers: 'ignoreNumbers',
  similar_subject: 'similarSubject',
  tag_subject_enabled: 'subjectMarkEnabled',
  tag_subject_position: 'subjectMarkPosition',
  tag_subject_content: 'subjectMarkContent',
  tag_header_enabled: 'headerMarkEnabled',
  tag_header_name: 'headerName',
  tag_header_value: 'headerValue',
  tag_body_enabled: 'bodyMarkEnabled',
  tag_body_content: 'bodyMarkContent',
  condition: 'condition',
  stage: 'stage',
  priority: 'priority',
  tags: 'tags',
  valid_from: 'effectiveStart',
  valid_until: 'effectiveEnd',
  run_mode: 'runMode',
  observe_action: 'observationAction',
  observe_mark_enabled: 'observationMark',
  timeout_minutes: 'realtimeWait',
  max_recheck_minutes: 'backgroundRecheck',
  timeout_async_enabled: 'continueAfterTimeout',
  risk_level: 'riskLevel',
  confidence_min: 'confidenceMin',
  confidence_max: 'confidenceMax',
  upper_inclusive: 'upperInclusive',
  base_disposition: 'baseDisposition',
  mark_positions: 'markPositions',
  mark_text: 'markText',
  enabled: 'admissionRuleEnabled',
  filter_on: 'admissionFilterEnabled',
  recipient_groups: 'recipientGroups',
  recipient_depts: 'recipientDepartments',
  recipient_emails: 'recipientAddresses',
  recipient_tags: 'recipientTags',
  sender_groups: 'senderGroups',
  sender_depts: 'senderDepartments',
  sender_emails: 'senderAddresses',
  require_url: 'requireUrl',
  max_size_kb: 'maxMessageSize',
  sender_first_seen: 'senderFirstSeen',
  require_qrcode: 'requireQrCode',
  require_executable: 'requireExecutable',
  format_version: 'formatVersion',
  feature: 'policyFeature',
  subfeature: 'policySubfeature',
  subkey: 'policyItem',
  managed_by: 'configurationSource',
  detection_type: 'detectionType',
  direction: 'mailDirection',
  similar_action: 'action',
  configured_action: 'action',
  ui_action: 'action',
};

export function versionFieldLabelKey(field: string): VersionFieldLabelKey {
  const normalized = field.trim().toLowerCase();
  const exact = EXACT_FIELD_SUFFIXES.find(([suffix]) => normalized.endsWith(suffix));
  if (exact) return exact[1];
  const leaf = normalized.slice(normalized.lastIndexOf('.') + 1);
  return FIELD_LEAF_LABELS[leaf] ?? 'other';
}

/** Read only the registered header name/value shape; never stringify metadata. */
export function versionHeaderMarkEntries(value: unknown): Array<{name: string; value: string}> | undefined {
  if (!Array.isArray(value)) return undefined;
  const entries: Array<{name: string; value: string}> = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return undefined;
    const header = entry as {name?: unknown; key?: unknown; value?: unknown};
    const name = typeof header.name === 'string' ? header.name : header.key;
    if (typeof name !== 'string' || typeof header.value !== 'string') return undefined;
    entries.push({name, value: header.value});
  }
  return entries;
}

export type VersionValueLabelKey =
  | 'observe'
  | 'realtime'
  | 'aggregate'
  | 'separate'
  | 'receive'
  | 'send'
  | 'inbound'
  | 'outbound'
  | 'internal'
  | 'prefix'
  | 'suffix'
  | 'subjectPrefix'
  | 'subject'
  | 'header'
  | 'body'
  | 'suspicious'
  | 'low'
  | 'medium'
  | 'high'
  | 'block'
  | 'review'
  | 'markDelivery'
  | 'threshold';

const VALUE_LABELS: Readonly<Record<string, VersionValueLabelKey>> = {
  observe: 'observe',
  realtime: 'realtime',
  aggregate: 'aggregate',
  separate: 'separate',
  receive: 'receive',
  send: 'send',
  inbound: 'inbound',
  outbound: 'outbound',
  internal: 'internal',
  prefix: 'prefix',
  suffix: 'suffix',
  subject_prefix: 'subjectPrefix',
  subject: 'subject',
  header: 'header',
  body: 'body',
  suspicious: 'suspicious',
  low: 'low',
  medium: 'medium',
  high: 'high',
  block: 'block',
  review: 'review',
  'mark-delivery': 'markDelivery',
  threshold: 'threshold',
};

export function versionValueLabelKey(value: string): VersionValueLabelKey | undefined {
  return VALUE_LABELS[value.trim().toLowerCase()];
}
