// Product mock copied from v0/0908-e64f3bcd @ 37fcc1ac6b3b.
function threatSeriesValue(
  i: number,
  base: number,
  width: number,
  scale: number,
): number {
  const t = (Math.sin(i * 1.7 + base * 0.37) + 1) / 2; // 0..1，确定性
  return Math.floor((base + t * width) * scale);
}

interface RuleEffectivenessMockRow {
  id: string;
  policy_module: 'auth_spoofing' | 'similar_detection' | 'phishing_detection' | 'sender_filter';
  // 相似邮件检测/相同主题检测是两条独立策略（不同判定维度、不同误判特征），
  // 观察对象必须按策略拆分，不能合并为一个笼统的「相似检测」模块级观察对象。
  similar_detection_type?: 'similar_email' | 'same_subject';
  // 该策略自身的聚合方式：aggregate=全方向聚合为一个观察对象；否则为具体方向。
  similar_detection_scope?: 'aggregate' | 'receive' | 'send' | 'internal';
  sub_strategy_id: string;
  sub_strategy_name_snapshot: string;
  is_deleted: boolean;
  observed_days: number;
  hits: number;
  would_block_ratio: number;
  reviewed_ratio: number;
  weighted_reviewed_ratio: number;
  false_positive_rate: number | null;
  attribution_status: 'attributable' | 'excluded_not_attributable' | 'module_level_only';
  config_path: string;
  /**
   * 当前生效的策略版本号，默认为 1（自纳入观察以来未发生实质性变更）。
   * 大于 1 时会为 1..version_no-1 合成历史版本，演示「实质性修改重置观察期」。
   */
  version_no?: number;
  /** 历史版本的变更摘要，未指定时使用通用文案。 */
  version_change_summary?: string;
  /**
   * 覆盖模块级动作候选集合。发信人黑白名单下白名单规则（action=accept）观察期内
   * 命中即为放行，不会产生拦截类结果，因此用空数组覆盖模块级的拦截动作候选；
   * 黑名单规则沿用模块级候选（不设置该字段）。
   */
  actions?: RuleEffectivenessWouldBeAction[];
}

const RULE_EFFECTIVENESS_CONFIG_PATH: Record<RuleEffectivenessMockRow['policy_module'], string> = {
  auth_spoofing: '/security/pipeline?module=authSpoofing',
  similar_detection: '/security/pipeline?module=similarDetection',
  phishing_detection: '/agent-center/overview?agent=phishing&tab=config',
  sender_filter: '/security/sender-filter',
};

// 相似检测配置页按 detectionType Tab 划分（相似邮件检测/相同主题检测），跳转时
// 需要带上具体 Tab，而不是笼统跳到模块首个 Tab，否则用户还要自己再切一次。
const RULE_EFFECTIVENESS_SIMILAR_DETECTION_CONFIG_PATH: Record<'similar_email' | 'same_subject', string> = {
  similar_email: '/security/pipeline?module=similarDetection&detectionType=similar_email',
  same_subject: '/security/pipeline?module=similarDetection&detectionType=same_subject',
};

const RULE_EFFECTIVENESS_MOCK_ROWS: RuleEffectivenessMockRow[] = [
  // 认证协议检查下 SPF/DKIM/DMARC/PTR 四个协议在配置页各自拥有独立的观察开关
  // （spf_observe_mode/dkim_observe_mode/dmarc_observe_mode/ptr_observe_mode），
  // 已不再共用一个全局开关，因此拆成 4 个独立观察对象，而不是 1 个。
  {
    id: 'auth-protocol_check_spf',
    policy_module: 'auth_spoofing',
    sub_strategy_id: 'protocol_check_spf',
    sub_strategy_name_snapshot: 'SPF 检查',
    is_deleted: false,
    observed_days: 12,
    hits: 58,
    would_block_ratio: 0.66,
    reviewed_ratio: 0.42,
    weighted_reviewed_ratio: 0.35,
    false_positive_rate: 0.03,
    attribution_status: 'attributable',
      config_path: RULE_EFFECTIVENESS_CONFIG_PATH.auth_spoofing,
  },
  {
    id: 'auth-protocol_check_dkim',
    policy_module: 'auth_spoofing',
    sub_strategy_id: 'protocol_check_dkim',
    sub_strategy_name_snapshot: 'DKIM 检查',
    is_deleted: false,
    observed_days: 12,
    hits: 14,
    would_block_ratio: 0.5,
    reviewed_ratio: 0.36,
    weighted_reviewed_ratio: 0.29,
    false_positive_rate: 0.07,
    attribution_status: 'attributable',
      config_path: RULE_EFFECTIVENESS_CONFIG_PATH.auth_spoofing,
  },
  {
    id: 'auth-protocol_check_dmarc',
    policy_module: 'auth_spoofing',
    sub_strategy_id: 'protocol_check_dmarc',
    sub_strategy_name_snapshot: 'DMARC 检查',
    is_deleted: false,
    observed_days: 12,
    hits: 11,
    would_block_ratio: 0.55,
    reviewed_ratio: 0.45,
    weighted_reviewed_ratio: 0.31,
    false_positive_rate: 0.05,
    attribution_status: 'attributable',
      config_path: RULE_EFFECTIVENESS_CONFIG_PATH.auth_spoofing,
  },
  {
    id: 'auth-protocol_check_ptr',
    policy_module: 'auth_spoofing',
    sub_strategy_id: 'protocol_check_ptr',
    sub_strategy_name_snapshot: 'PTR 检查',
    is_deleted: false,
    observed_days: 4,
    hits: 3,
    would_block_ratio: 0.33,
    reviewed_ratio: 0.1,
    weighted_reviewed_ratio: 0.04,
    false_positive_rate: null,
    attribution_status: 'attributable',
      config_path: RULE_EFFECTIVENESS_CONFIG_PATH.auth_spoofing,
  },
  // 基础格式检查——每一项在配置页各自独立 observe_mode，必须拆成 3 个独立
  // 观察对象，合并统计会掩盖各项截然不同的命中特征。
  {
    id: 'auth-format_check_mailfrom_empty',
    policy_module: 'auth_spoofing',
    sub_strategy_id: 'format_check_mailfrom_empty',
    sub_strategy_name_snapshot: '无效 MAIL FROM',
    is_deleted: false,
    observed_days: 5,
    hits: 9,
    would_block_ratio: 0.44,
    reviewed_ratio: 0.11,
    weighted_reviewed_ratio: 0.06,
    false_positive_rate: null,
    attribution_status: 'attributable',
      config_path: RULE_EFFECTIVENESS_CONFIG_PATH.auth_spoofing,
  },
  {
    id: 'auth-format_check_mailfrom_invalid',
    policy_module: 'auth_spoofing',
    sub_strategy_id: 'format_check_mailfrom_invalid',
    sub_strategy_name_snapshot: 'MAIL FROM 格式错误',
    is_deleted: false,
    observed_days: 19,
    hits: 33,
    would_block_ratio: 0.52,
    reviewed_ratio: 0.36,
    weighted_reviewed_ratio: 0.27,
    false_positive_rate: 0.08,
    attribution_status: 'attributable',
      config_path: RULE_EFFECTIVENESS_CONFIG_PATH.auth_spoofing,
  },
  {
    id: 'auth-format_check_envelope_header_mismatch',
    policy_module: 'auth_spoofing',
    sub_strategy_id: 'format_check_envelope_header_mismatch',
    sub_strategy_name_snapshot: '信封头不一致',
    is_deleted: false,
    observed_days: 38,
    hits: 47,
    would_block_ratio: 0.38,
    reviewed_ratio: 0.62,
    weighted_reviewed_ratio: 0.49,
    false_positive_rate: 0.23,
    attribution_status: 'attributable',
      config_path: RULE_EFFECTIVENESS_CONFIG_PATH.auth_spoofing,
    // 示例：该规则在观察期内被实质性修改过一次（信封头比对范围调整），
    // 触发观察期重置——当前 observed_days=38 只反映 v2 的观察时长，
    // v1 的历史观察数据保留在 version_history 中，不叠加进当前统计。
    version_no: 2,
    version_change_summary: '信封头比对范围调整（新增 Reply-To 校验），触发观察期重置',
  },
  // 展示名��冒检测——按方向（收/发/内部）各自独立 observe_mode，风险模型
  // 不同（内部方向样本天然更少），必须拆成 3 个独立观察对象。
  {
    id: 'auth-display_name_spoofing_inbound',
    policy_module: 'auth_spoofing',
    sub_strategy_id: 'display_name_spoofing_inbound',
    sub_strategy_name_snapshot: '收件方向',
    is_deleted: false,
    observed_days: 34,
    hits: 121,
    would_block_ratio: 0.71,
    reviewed_ratio: 0.55,
    weighted_reviewed_ratio: 0.46,
    false_positive_rate: 0.18,
    attribution_status: 'attributable',
      config_path: RULE_EFFECTIVENESS_CONFIG_PATH.auth_spoofing,
  },
  {
    id: 'auth-display_name_spoofing_outbound',
    policy_module: 'auth_spoofing',
    sub_strategy_id: 'display_name_spoofing_outbound',
    sub_strategy_name_snapshot: '发件方向',
    is_deleted: false,
    observed_days: 34,
    hits: 24,
    would_block_ratio: 0.42,
    reviewed_ratio: 0.5,
    weighted_reviewed_ratio: 0.38,
    false_positive_rate: 0.07,
    attribution_status: 'attributable',
      config_path: RULE_EFFECTIVENESS_CONFIG_PATH.auth_spoofing,
  },
  {
    id: 'auth-display_name_spoofing_internal',
    policy_module: 'auth_spoofing',
    sub_strategy_id: 'display_name_spoofing_internal',
    sub_strategy_name_snapshot: '内部方向',
    is_deleted: false,
    observed_days: 4,
    hits: 3,
    would_block_ratio: 0.33,
    reviewed_ratio: 0,
    weighted_reviewed_ratio: 0,
    false_positive_rate: null,
    attribution_status: 'attributable',
      config_path: RULE_EFFECTIVENESS_CONFIG_PATH.auth_spoofing,
  },
  {
    id: 'auth-similar_domain',
    policy_module: 'auth_spoofing',
    sub_strategy_id: 'similar_domain',
    sub_strategy_name_snapshot: '相似域名检测',
    is_deleted: false,
    observed_days: 41,
    hits: 203,
    would_block_ratio: 0.68,
    reviewed_ratio: 0.61,
    weighted_reviewed_ratio: 0.53,
    false_positive_rate: 0.06,
    attribution_status: 'attributable',
      config_path: RULE_EFFECTIVENESS_CONFIG_PATH.auth_spoofing,
  },
  // DKIM 外发签名、ARC 签名管理的是密钥/域名生命周期，没有 action/observe_mode，
  // 不是可观察的检测规则，不纳入观察模式统计范围（已从 mock 数据中移除）。
  // 相似邮件检测（similar_email）——按内容相似度判定，命中样本天然偏少。
  // 该策略在 mock 场景下设为 separate（按方向独立配置），故拆成 3 个观察对象。
  {
    id: 'similar-similar_email-receive',
    policy_module: 'similar_detection',
    similar_detection_type: 'similar_email',
    similar_detection_scope: 'receive',
    sub_strategy_id: 'receive',
    sub_strategy_name_snapshot: '收件方向',
    is_deleted: false,
    observed_days: 18,
    hits: 97,
    would_block_ratio: 0.58,
    reviewed_ratio: 0.37,
    weighted_reviewed_ratio: 0.29,
    false_positive_rate: 0.11,
    attribution_status: 'attributable',
      config_path: RULE_EFFECTIVENESS_SIMILAR_DETECTION_CONFIG_PATH.similar_email,
  },
  {
    id: 'similar-similar_email-send',
    policy_module: 'similar_detection',
    similar_detection_type: 'similar_email',
    similar_detection_scope: 'send',
    sub_strategy_id: 'send',
    sub_strategy_name_snapshot: '发件方向',
    is_deleted: false,
    observed_days: 27,
    hits: 63,
    would_block_ratio: 0.44,
    reviewed_ratio: 0.48,
    weighted_reviewed_ratio: 0.4,
    false_positive_rate: 0.21,
    attribution_status: 'attributable',
      config_path: RULE_EFFECTIVENESS_SIMILAR_DETECTION_CONFIG_PATH.similar_email,
  },
  {
    id: 'similar-similar_email-internal',
    policy_module: 'similar_detection',
    similar_detection_type: 'similar_email',
    similar_detection_scope: 'internal',
    sub_strategy_id: 'internal',
    sub_strategy_name_snapshot: '内部方向',
    is_deleted: false,
    observed_days: 3,
    hits: 5,
    would_block_ratio: 0.4,
    reviewed_ratio: 0,
    weighted_reviewed_ratio: 0,
    false_positive_rate: null,
    attribution_status: 'attributable',
      config_path: RULE_EFFECTIVENESS_SIMILAR_DETECTION_CONFIG_PATH.similar_email,
  },
  // 相同主题检测（same_subject）——按主题标准化后判定，命中样本量通常更大，
  // 误判后果（正常批量通知邮件被打标/拦截）也更广，误判率阈值应更严格。
  // 该策略在 mock 场景下设为 aggregate（全方向聚合为一个观察对象）。
  {
    id: 'similar-same_subject-aggregate',
    policy_module: 'similar_detection',
    similar_detection_type: 'same_subject',
    similar_detection_scope: 'aggregate',
    sub_strategy_id: 'aggregate',
    sub_strategy_name_snapshot: '全方向聚合',
    is_deleted: false,
    observed_days: 15,
    hits: 214,
    would_block_ratio: 0.31,
    reviewed_ratio: 0.42,
    weighted_reviewed_ratio: 0.35,
    false_positive_rate: 0.27,
    attribution_status: 'attributable',
      config_path: RULE_EFFECTIVENESS_SIMILAR_DETECTION_CONFIG_PATH.same_subject,
    // 示例：该策略执行动作曾从「隔离」调整为「审核」，属于实质性变更，
    // 触发过一次观察期重置。
    version_no: 2,
    version_change_summary: '执行动作调整：隔离 → 审核，触发观察期重置',
  },
  // 钓鱼邮件智能体按版本归属拆分为准入规则、风险处置策略和运行时策略。
  // 三条记录分别演示独立版本号、观察起始时间和历史版本，不使用智能体整体版本。
  {
    id: 'phishing-admission-rule-url',
    policy_module: 'phishing_detection',
    sub_strategy_id: 'admission_rule:rule-url-001',
    sub_strategy_name_snapshot: '准入规则 · 外部链接邮件',
    is_deleted: false,
    observed_days: 9,
    hits: 87,
    would_block_ratio: 0.69,
    reviewed_ratio: 0.34,
    weighted_reviewed_ratio: 0.27,
    false_positive_rate: 0.06,
    attribution_status: 'attributable',
    config_path: RULE_EFFECTIVENESS_CONFIG_PATH.phishing_detection,
    version_no: 2,
    version_change_summary: '准入条件调整：增加二维码链接校验，触发观察期重置',
  },
  {
    id: 'phishing-risk-policy',
    policy_module: 'phishing_detection',
    sub_strategy_id: 'risk_policy',
    sub_strategy_name_snapshot: '风险处置策略',
    is_deleted: false,
    observed_days: 16,
    hits: 196,
    would_block_ratio: 0.76,
    reviewed_ratio: 0.31,
    weighted_reviewed_ratio: 0.25,
    false_positive_rate: 0.04,
    attribution_status: 'attributable',
    config_path: RULE_EFFECTIVENESS_CONFIG_PATH.phishing_detection,
    version_no: 3,
    version_change_summary: '高风险处置调整：审核 → 隔离，触发观察期重置',
  },
  {
    id: 'phishing-runtime-policy',
    policy_module: 'phishing_detection',
    sub_strategy_id: 'runtime_policy',
    sub_strategy_name_snapshot: '运行时策略',
    is_deleted: false,
    observed_days: 24,
    hits: 341,
    would_block_ratio: 0.74,
    reviewed_ratio: 0.29,
    weighted_reviewed_ratio: 0.24,
    false_positive_rate: 0.05,
    attribution_status: 'attributable',
    config_path: RULE_EFFECTIVENESS_CONFIG_PATH.phishing_detection,
    version_no: 2,
    version_change_summary: '观察超时配置调整：30 分钟 → 60 分钟，触发观察期重置',
  },
  {
    id: 'phishing-agent',
    policy_module: 'phishing_detection',
    sub_strategy_id: 'engine',
    sub_strategy_name_snapshot: '钓鱼检测智能体',
    is_deleted: false,
    observed_days: 22,
    hits: 341,
    would_block_ratio: 0.74,
    reviewed_ratio: 0.29,
    weighted_reviewed_ratio: 0.24,
    false_positive_rate: 0.05,
    attribution_status: 'attributable',
    config_path: RULE_EFFECTIVENESS_CONFIG_PATH.phishing_detection,
    version_no: 1,
  },
  // 发信人黑白名单——按单条规则拆分观察对象（与 src/lib/mock/fixtures.ts 中
  // mockSenderFilterRulesList 的 id 1-5 一一对应），而不是笼统的模块级观察对象，
  // 演示黑名单/白名单规则各自不同的命中特征与策略版本管理。
  {
    id: 'sender-filter-rule-1',
    policy_module: 'sender_filter',
    sub_strategy_id: 'rule:1',
    sub_strategy_name_snapshot: '垃圾邮件发送者',
    is_deleted: false,
    observed_days: 26,
    hits: 62,
    would_block_ratio: 0.82,
    reviewed_ratio: 0.4,
    weighted_reviewed_ratio: 0.33,
    false_positive_rate: 0.04,
    attribution_status: 'attributable',
    config_path: RULE_EFFECTIVENESS_CONFIG_PATH.sender_filter,
    version_no: 1,
  },
  {
    id: 'sender-filter-rule-2',
    policy_module: 'sender_filter',
    sub_strategy_id: 'rule:2',
    sub_strategy_name_snapshot: '钓鱼域名',
    is_deleted: false,
    observed_days: 18,
    hits: 45,
    would_block_ratio: 0.65,
    reviewed_ratio: 0.5,
    weighted_reviewed_ratio: 0.42,
    false_positive_rate: 0.09,
    attribution_status: 'attributable',
    config_path: RULE_EFFECTIVENESS_CONFIG_PATH.sender_filter,
    // 示例：该规则的匹配条件曾发生实质性调整（新增子域名通配符匹配），触发过一次
    // 观察期重置——当前 observed_days=18 只反映 v2 的观察时长。
    version_no: 2,
    version_change_summary: '匹配条件调整：新增子域名通配符匹配，触发观察期重置',
  },
  {
    id: 'sender-filter-rule-3',
    policy_module: 'sender_filter',
    sub_strategy_id: 'rule:3',
    sub_strategy_name_snapshot: '可疑群组',
    is_deleted: false,
    observed_days: 50,
    hits: 30,
    would_block_ratio: 0.3,
    reviewed_ratio: 0.6,
    weighted_reviewed_ratio: 0.5,
    false_positive_rate: 0.15,
    attribution_status: 'attributable',
    config_path: RULE_EFFECTIVENESS_CONFIG_PATH.sender_filter,
    version_no: 1,
  },
  // 白名单规则（action=accept）——观察期内命中即为放行，不产生拦截类结果，
  // 因此用 actions: [] 覆盖模块级的拦截动作候选。
  {
    id: 'sender-filter-rule-4',
    policy_module: 'sender_filter',
    sub_strategy_id: 'rule:4',
    sub_strategy_name_snapshot: '可信合作伙伴',
    is_deleted: false,
    observed_days: 15,
    hits: 40,
    would_block_ratio: 0,
    reviewed_ratio: 0.2,
    weighted_reviewed_ratio: 0.15,
    false_positive_rate: 0.01,
    attribution_status: 'attributable',
    config_path: RULE_EFFECTIVENESS_CONFIG_PATH.sender_filter,
    version_no: 1,
    actions: [],
  },
  {
    id: 'sender-filter-rule-5',
    policy_module: 'sender_filter',
    sub_strategy_id: 'rule:5',
    sub_strategy_name_snapshot: '内部财务组',
    is_deleted: false,
    observed_days: 8,
    hits: 25,
    would_block_ratio: 0,
    reviewed_ratio: 0.1,
    weighted_reviewed_ratio: 0.08,
    false_positive_rate: 0.02,
    attribution_status: 'attributable',
    config_path: RULE_EFFECTIVENESS_CONFIG_PATH.sender_filter,
    // 示例：该规则的白名单成员组曾发生实质性调整（财务部门人员变更），触发过一次
    // 观察期重置。
    version_no: 2,
    version_change_summary: '白名单成员组调整（财务部门人员变更），触发观察期重置',
    actions: [],
  },
];


type RuleEffectivenessWouldBeAction = 'accept' | 'quarantine' | 'audit' | 'reject' | 'discard' | 'recall';

// 命中构成的候选「拦截类」处置动作必须逐模块对齐系统真实支持的动作枚举，不能
// 三个模块共用同一份列表：reject 只有身份认证与仿冒检测���AuthSpoofingAction）
// 支持，相似检测（SimilarDetectionAction）与钓鱼检测智能体（PolicyDisposition）
// 都没有 reject，只有 quarantine/discard/audit。accept（投递）/recall（召回）
// 是命中最终结果里必然存在的两类，与模块无关，单独在下方计算。
const RULE_EFFECTIVENESS_MODULE_ACTIONS: Record<RuleEffectivenessMockRow['policy_module'], RuleEffectivenessWouldBeAction[]> = {
  auth_spoofing: ['reject', 'discard', 'quarantine', 'audit'],
  similar_detection: ['discard', 'quarantine', 'audit'],
  phishing_detection: ['discard', 'quarantine', 'audit'],
  // 黑名单规则动作与 BlacklistAction 对齐（reject/quarantine/audit/discard）；
  // 白名单规则（action=accept）通过每行的 `actions: []` 覆盖，不落到这个默认集合。
  sender_filter: ['reject', 'discard', 'quarantine', 'audit'],
};

function allocateActionCounts(
  actions: RuleEffectivenessWouldBeAction[],
  total: number,
  seed: number,
): { action: RuleEffectivenessWouldBeAction; count: number }[] {
  if (actions.length === 0 || total <= 0) return [];
  const weights = actions.map((_, i) => 0.4 + threatSeriesValue(seed + i, 1, 4, 1) / 10);
  const weightSum = weights.reduce((sum, w) => sum + w, 0);
  let allocated = 0;
  return actions.map((action, i) => {
    const isLast = i === actions.length - 1;
    const count = isLast ? total - allocated : Math.round((weights[i] / weightSum) * total);
    allocated += count;
    return { action, count: Math.max(0, count) };
  });
}

function ruleEffectivenessActionBreakdown(
  row: RuleEffectivenessMockRow,
  index: number,
): { action: RuleEffectivenessWouldBeAction; count: number }[] {
  const actions = row.actions ?? RULE_EFFECTIVENESS_MODULE_ACTIONS[row.policy_module];
  const total = row.hits;
  if (total <= 0) return [];
  if (actions.length === 0) {
    // 白名单规则：命中即放行，观察期内不产生拦截类结果。
    return [{ action: 'accept' as const, count: total }];
  }

  // 投递（accept）：观察模式下命中本身不拦截，最终正常送达的占比——用确定性
  // 伪随机取 55%~75% 区间，作为观察态命中结果里天然占大头的一类。
  const acceptRatio = (55 + threatSeriesValue(index, 1, 20, 1)) / 100;
  const acceptCount = Math.min(total, Math.round(total * acceptRatio));

  // 召回（recall）：投���之后小比例人工召回，2%~6%，数据来源与规则拦截逻辑
  // 无关，按小比例随机生成。
  const recallRatio = (2 + threatSeriesValue(index + 5, 1, 4, 1)) / 100;
  const recallCount = Math.min(total - acceptCount, Math.round(total * recallRatio));

  // 剩余命中走「拒收/丢弃」等强处置或「隔离/审核」等弱处置；would_block_ratio
  // 控制强弱处置的比例，每组内部再按权重细分，保证命中总数不丢失。
  const remaining = total - acceptCount - recallCount;
  const strictCount = Math.round(remaining * row.would_block_ratio);
  const looseCount = remaining - strictCount;
  const strictActions = actions.filter((a) => a === 'reject' || a === 'discard');
  const looseActions = actions.filter((a) => a === 'quarantine' || a === 'audit');

  return [
    { action: 'accept' as const, count: acceptCount },
    ...allocateActionCounts(strictActions, strictCount, index),
    ...allocateActionCounts(looseActions, looseCount, index + 10),
    { action: 'recall' as const, count: recallCount },
  ].filter((item) => item.count > 0);
}

/**
 * 为 version_no > 1 的行合成历史版本清单��1..version_no-1），演示「实质性
 * 修改触发观察期重置」：当前行的 observed_since/observed_days/hits/命中构成
 * 只反映当前版本（version_no）的数据，历史版本各自独立的命中数、生效区间
 * 单独存放在这里，不叠加进当前版本的统计口径。
 */
function ruleEffectivenessVersionHistory(
  row: RuleEffectivenessMockRow,
  index: number,
  observedSince: string,
): { version_no: number; effective_at: string; superseded_at: string | null; change_type: 'substantive'; change_summary: string; hits: number }[] {
  const versionNo = row.version_no ?? 1;
  if (versionNo <= 1) return [];
  const entries: { version_no: number; effective_at: string; superseded_at: string | null; change_type: 'substantive'; change_summary: string; hits: number }[] = [];
  let supersededAt = observedSince;
  for (let v = versionNo - 1; v >= 1; v -= 1) {
    const spanDays = 10 + threatSeriesValue(index + v, 1, 15, 1);
    const effectiveAt = new Date(new Date(supersededAt).getTime() - spanDays * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const historyHits = 5 + threatSeriesValue(index + v * 3, 1, 40, 1);
    entries.unshift({
      version_no: v,
      effective_at: effectiveAt,
      superseded_at: supersededAt,
      change_type: 'substantive' as const,
      change_summary: row.version_change_summary ?? '匹配条件/执行动作发生实质性调整，重新开始观察',
      hits: historyHits,
    });
    supersededAt = effectiveAt;
  }
  return entries;
}

function ruleEffectivenessRowToApi(row: RuleEffectivenessMockRow, index: number) {
  const observedSince = new Date(Date.now() - row.observed_days * 86_400_000).toISOString().slice(0, 10);
  const reviewedCount = Math.round(row.hits * row.reviewed_ratio);
  const weightedReviewedCount = Math.round(row.hits * row.weighted_reviewed_ratio);
  return {
    id: row.id,
    policy_module: row.policy_module,
    similar_detection_type: row.similar_detection_type,
    similar_detection_scope: row.similar_detection_scope,
    sub_strategy_id: row.sub_strategy_id,
    sub_strategy_name_snapshot: row.sub_strategy_name_snapshot,
    is_deleted: row.is_deleted,
    version_no: row.version_no ?? 1,
    observed_since: observedSince,
    observed_days: row.observed_days,
    hits: row.hits,
    reviewed_count: reviewedCount,
    weighted_reviewed_count: weightedReviewedCount,
    false_positive_rate: row.false_positive_rate,
    false_negative_rate: null,
    risk_direction: 'configured_block' as const,
    risk_unavailable_reason: row.false_positive_rate == null ? 'no_hits' : '',
    configured_action: 'quarantine',
    attribution_status: row.attribution_status,

    action_breakdown: ruleEffectivenessActionBreakdown(row, index),
    version_history: ruleEffectivenessVersionHistory(row, index, observedSince),
    current_version_changes: [],
    current_version_change_summary: row.version_no && row.version_no > 1
      ? row.version_change_summary ?? '匹配条件/执行动作发生实质性调整，重新开始观察'
      : '',
    config_path: row.config_path,
  };
}

const RULE_EFFECTIVENESS_TREND_DATES = [
  '11/1', '11/2', '11/3', '11/4', '11/5', '11/6', '11/7',
];

export function mockRuleEffectivenessFor(
  startDate: string,
  endDate: string,
  modules: string[],
  durationBuckets: string[],
  // 仅在 modules 命中 similar_detection 时生效——进一步收窄到相似邮件检测/
  // 相同主题检测中的具体策���。为空表示两条策略都要。
  similarDetectionTypes: string[] = [],
) {
  const moduleFilter = modules.length > 0 ? new Set(modules) : null;
  const durationFilter = durationBuckets.length > 0 ? new Set(durationBuckets) : null;
  const similarTypeFilter = similarDetectionTypes.length > 0 ? new Set(similarDetectionTypes) : null;

  function bucketOf(days: number): string {
    if (days < 7) return 'lt7';
    if (days <= 30) return '7to30';
    return 'gt30';
  }

  const filteredRows = RULE_EFFECTIVENESS_MOCK_ROWS.filter((row) => {
    if (moduleFilter && !moduleFilter.has(row.policy_module)) return false;
    if (durationFilter && !durationFilter.has(bucketOf(row.observed_days))) return false;
    if (
      row.policy_module === 'similar_detection' &&
      similarTypeFilter &&
      row.similar_detection_type &&
      !similarTypeFilter.has(row.similar_detection_type)
    ) {
      return false;
    }
    return true;
  });

  const rows = filteredRows.map((row, index) => ruleEffectivenessRowToApi(row, index));

  const totalHits = rows.reduce((sum, row) => sum + row.hits, 0);
  const avgObservedDays = rows.length > 0
    ? Math.round(rows.reduce((sum, row) => sum + row.observed_days, 0) / rows.length)
    : 0;
  const pendingReviewCount = rows.filter((row) => row.observed_days > 30 && row.hits > 0).length;

  // 相似邮件检测/相同主题检测是两条独立策略，各占一条趋势线，不合并成一条
  // 「相似检测」总量线，否则会掩盖两条策略各自的真实变化趋势。
  const trend = RULE_EFFECTIVENESS_TREND_DATES.map((date, i) => ({
    date,
    auth_spoofing: threatSeriesValue(i, 8, 14, 1),
    similar_detection_similar_email: threatSeriesValue(i + 2, 3, 7, 1),
    similar_detection_same_subject: threatSeriesValue(i + 3, 6, 13, 1),
    phishing_detection: threatSeriesValue(i + 4, 12, 18, 1),
  }));

  return {
    kpi: {
      observing_count: rows.length,
      observing_count_delta: rows.length > 0 ? 1 : null,
      total_hits: totalHits,
      total_hits_delta: totalHits > 0 ? 42 : null,
      avg_observed_days: avgObservedDays,
      pending_review_count: pendingReviewCount,
    },
    trend,
    rows,
    degraded_modules: [],
  };
}
