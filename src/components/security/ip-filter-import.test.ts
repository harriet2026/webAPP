import { describe, it, expect } from 'vitest';
import {
  parseImportText,
  parseImportInputs,
  parseExportEnvelope,
  buildImportPlan,
  parseActionAlias,
  actionMatchesListType,
  MAX_IMPORT_ROWS,
} from './ip-filter-import';

// GT-12137：IP 黑白名单批量导入的解析 + 去重纯逻辑覆盖。
// 原型要求：文本粘贴 + 文件上传 + 导入前预览 + 重复去重（覆盖/跳过）+ 上限 1000。
// 复开（导入格式与导出一致）：文件格式为 rule-settings/v1 JSON envelope，见 parseExportEnvelope。

const blOpts = (existing: string[] = [], defaultAction: 'reject' | 'quarantine' = 'reject') => ({
  listType: 'blacklist' as const,
  defaultAction,
  existingIpValues: existing,
});

describe('parseImportText - 基础解析', () => {
  it('文本粘贴：每行一个 IP/CIDR/区间，全部有效', () => {
    const r = parseImportText('1.2.3.4\n10.0.0.0/8\n192.168.1.1-192.168.1.9', blOpts());
    expect(r.total).toBe(3);
    expect(r.validCount).toBe(3);
    expect(r.errorCount).toBe(0);
    expect(r.rows.map((x) => x.kind)).toEqual(['single', 'single', 'range']);
    // 无动作列 → 回退默认动作
    expect(r.rows.every((x) => x.action === 'reject')).toBe(true);
  });

  it('空行被忽略，不计入行号与总数', () => {
    const r = parseImportText('1.1.1.1\n\n\n2.2.2.2\n', blOpts());
    expect(r.total).toBe(2);
    expect(r.rows.map((x) => x.lineNo)).toEqual([1, 2]);
  });

  it('非法 IP 与非法 CIDR 前缀被标错', () => {
    const r = parseImportText('999.1.1.1\n10.0.0.0/40\nnot-an-ip', blOpts());
    expect(r.errorCount).toBe(3);
    expect(r.rows[0].error).toBe('importInvalidIp');
    expect(r.rows[1].error).toBe('importInvalidIp');
  });

  it('IPv6 单地址与 CIDR', () => {
    const r = parseImportText('2001:db8::1\n2001:db8::/32', blOpts());
    expect(r.validCount).toBe(2);
    expect(r.errorCount).toBe(0);
  });
});

describe('parseImportText - CSV 三列', () => {
  it('IP,动作,备注 三列解析，动作别名生效', () => {
    const r = parseImportText('1.2.3.4,隔离,可疑源\n5.6.7.8,reject,黑IP', blOpts());
    expect(r.rows[0].action).toBe('quarantine');
    expect(r.rows[0].remark).toBe('可疑源');
    expect(r.rows[1].action).toBe('reject');
  });

  it('CSV 动作列为空 → 回退默认动作', () => {
    const r = parseImportText('1.2.3.4,,只有备注被顶到第三列?', { ...blOpts([], 'quarantine') });
    expect(r.rows[0].action).toBe('quarantine');
  });

  it('动作与目标名单不符（黑名单页导入白名单动作）判为非法', () => {
    const r = parseImportText('1.2.3.4,放行,x', blOpts());
    expect(r.rows[0].error).toBe('importActionListMismatch');
  });
});

describe('parseImportText - 去重', () => {
  it('批内重复：后出现者标 in_batch', () => {
    const r = parseImportText('1.2.3.4\n1.2.3.4\n2.2.2.2', blOpts());
    expect(r.rows[0].duplicate).toBe('none');
    expect(r.rows[1].duplicate).toBe('in_batch');
    expect(r.rows[2].duplicate).toBe('none');
    expect(r.duplicateCount).toBe(1);
  });

  it('与既有规则重复：标 existing', () => {
    const r = parseImportText('1.2.3.4\n9.9.9.9', blOpts(['1.2.3.4']));
    expect(r.rows[0].duplicate).toBe('existing');
    expect(r.rows[1].duplicate).toBe('none');
  });

  it('IPv6 大小写归一后判重', () => {
    const r = parseImportText('2001:DB8::1\n2001:db8::1', blOpts());
    expect(r.rows[1].duplicate).toBe('in_batch');
  });

  it('非法行不参与去重（不会挤掉合法重复判定）', () => {
    const r = parseImportText('bad\n1.2.3.4\n1.2.3.4', blOpts());
    expect(r.rows[0].error).toBeTruthy();
    expect(r.rows[2].duplicate).toBe('in_batch');
  });
});

describe('parseImportText - 上限', () => {
  it('超过 1000 条截断并置 exceededLimit', () => {
    const text = Array.from({ length: MAX_IMPORT_ROWS + 5 }, (_, i) => `10.${(i >> 16) & 255}.${(i >> 8) & 255}.${i & 255}`).join('\n');
    const r = parseImportText(text, blOpts());
    expect(r.total).toBe(MAX_IMPORT_ROWS);
    expect(r.exceededLimit).toBe(true);
  });
});

describe('buildImportPlan - 提交计划', () => {
  it('非法行与批内重复永远不提交', () => {
    const r = parseImportText('bad\n1.2.3.4\n1.2.3.4', blOpts());
    const plan = buildImportPlan(r.rows, 'skip');
    expect(plan).toHaveLength(1);
    expect(plan[0].ipValue).toBe('1.2.3.4');
    expect(plan[0].mode).toBe('create');
  });

  it('existing 重复：skip 策略跳过', () => {
    const r = parseImportText('1.2.3.4\n2.2.2.2', blOpts(['1.2.3.4']));
    const plan = buildImportPlan(r.rows, 'skip');
    expect(plan.map((p) => p.ipValue)).toEqual(['2.2.2.2']);
  });

  it('existing 重复：overwrite 策略标记为 overwrite', () => {
    const r = parseImportText('1.2.3.4\n2.2.2.2', blOpts(['1.2.3.4']));
    const plan = buildImportPlan(r.rows, 'overwrite');
    expect(plan).toHaveLength(2);
    expect(plan.find((p) => p.ipValue === '1.2.3.4')?.mode).toBe('overwrite');
    expect(plan.find((p) => p.ipValue === '2.2.2.2')?.mode).toBe('create');
  });
});

// ===== 复开：导入格式 = 导出格式（rule-settings/v1 JSON envelope） =====

// 与 handleExport 下载文件同构的最小 envelope。
const envelope = (rules: unknown[], extra: Record<string, unknown> = {}) => JSON.stringify({
  version: 'rule-settings/v1',
  scope: 'ip_filter',
  exported_at: '2026-07-21T00:00:00Z',
  tenant_context: { mode: 'multi' },
  data: { rules },
  ...extra,
});

const exportedRule = (over: Record<string, unknown> = {}, metaOver: Record<string, unknown> = {}) => ({
  id: 1,
  name: 'bl-rule-1',
  description: '导出备注',
  action: 'reject',
  priority: 42,
  is_active: false,
  metadata: JSON.stringify({
    feature: 'ip_filter',
    list_type: 'blacklist',
    ip_config_type: 'single',
    ip_value: '1.2.3.4',
    ...metaOver,
  }),
  ...over,
});

describe('parseExportEnvelope - 导出 JSON 解析', () => {
  it('导出 envelope 直接导回：IP/动作/名称/优先级/启用状态全保留', () => {
    const r = parseExportEnvelope(envelope([exportedRule()]), 'blacklist');
    if ('error' in r) throw new Error('unexpected envelope error');
    expect(r.rules).toHaveLength(1);
    const row = r.rules[0];
    expect(row.error).toBeNull();
    expect(row.ipValue).toBe('1.2.3.4');
    expect(row.action).toBe('reject');
    expect(row.remark).toBe('导出备注');
    expect(row.name).toBe('bl-rule-1');
    expect(row.priority).toBe(42);
    expect(row.isActive).toBe(false);
  });

  it('metadata 为对象（非字符串）同样接受；accept 与标记配置独立回填', () => {
    const rule = {
      name: 'wl-1', action: 'accept', priority: 7, is_active: true,
      metadata: {
        feature: 'ip_filter', list_type: 'whitelist', ip_config_type: 'single',
        ip_value: '9.9.9.9', add_headers: [{ key: 'X-Whitelist', value: 'yes' }],
      },
    };
    const r = parseExportEnvelope(envelope([rule]), 'whitelist');
    if ('error' in r) throw new Error('unexpected envelope error');
    expect(r.rules[0].action).toBe('accept');
    expect(r.rules[0].addWhitelistTag).toBe(true);
    expect(r.rules[0].error).toBeNull();
  });

  it('range 类型规则 kind=range', () => {
    const r = parseExportEnvelope(
      envelope([exportedRule({}, { ip_config_type: 'range', ip_value: '10.0.0.1-10.0.0.9' })]),
      'blacklist',
    );
    if ('error' in r) throw new Error('unexpected envelope error');
    expect(r.rules[0].kind).toBe('range');
    expect(r.rules[0].error).toBeNull();
  });

  it('非 JSON → importJsonInvalid；缺 rules → importJsonNotEnvelope；scope 不符 → importJsonWrongScope', () => {
    expect(parseExportEnvelope('1.2.3.4\n5.6.7.8', 'blacklist')).toEqual({ error: 'importJsonInvalid' });
    expect(parseExportEnvelope('{"foo":1}', 'blacklist')).toEqual({ error: 'importJsonNotEnvelope' });
    expect(parseExportEnvelope(envelope([], { scope: 'sender_filter' }), 'blacklist')).toEqual({ error: 'importJsonWrongScope' });
  });

  it('裸 {rules:[...]} 也接受（与后端 importIPFilterRules 宽容度一致）', () => {
    const r = parseExportEnvelope(JSON.stringify({ rules: [exportedRule()] }), 'blacklist');
    if ('error' in r) throw new Error('unexpected envelope error');
    expect(r.rules[0].error).toBeNull();
  });

  it('黑名单文件导进白名单页 → 行级 importListTypeMismatch，不静默落错名单', () => {
    const r = parseExportEnvelope(envelope([exportedRule()]), 'whitelist');
    if ('error' in r) throw new Error('unexpected envelope error');
    expect(r.rules[0].error).toBe('importListTypeMismatch');
  });

  it('expression 规则 → 行级 importExpressionUnsupported（预览可见但不导入）', () => {
    const r = parseExportEnvelope(
      envelope([exportedRule({}, { ip_config_type: 'expression', ip_value: '1.1.1.1 || 2.2.2.0/24' })]),
      'blacklist',
    );
    if ('error' in r) throw new Error('unexpected envelope error');
    expect(r.rules[0].error).toBe('importExpressionUnsupported');
  });

  it('metadata 缺失/非 ip_filter → 行级 importJsonBadRule', () => {
    const r = parseExportEnvelope(envelope([{ name: 'x', action: 'reject' }]), 'blacklist');
    if ('error' in r) throw new Error('unexpected envelope error');
    expect(r.rules[0].error).toBe('importJsonBadRule');
  });

  it('手改文件动作与名单不符（黑名单文件里 accept）→ importActionListMismatch', () => {
    const r = parseExportEnvelope(envelope([exportedRule({ action: 'accept' })]), 'blacklist');
    if ('error' in r) throw new Error('unexpected envelope error');
    expect(r.rules[0].error).toBe('importActionListMismatch');
  });
});

describe('parseImportInputs - 文本 + JSON 文件合并管线', () => {
  it('文本行与文件行合并去重：文件里的 IP 与文本重复标 in_batch', () => {
    const env = parseExportEnvelope(envelope([exportedRule()]), 'blacklist');
    if ('error' in env) throw new Error('unexpected');
    const r = parseImportInputs({ text: '1.2.3.4\n8.8.8.8', envelopeRows: env.rules }, blOpts());
    expect(r.total).toBe(3);
    expect(r.rows[2].duplicate).toBe('in_batch'); // 文件行在后
    expect(r.duplicateCount).toBe(1);
  });

  it('上限跨来源统一生效', () => {
    const text = Array.from({ length: MAX_IMPORT_ROWS }, (_, i) => `10.${(i >> 16) & 255}.${(i >> 8) & 255}.${i & 255}`).join('\n');
    const env = parseExportEnvelope(envelope([exportedRule()]), 'blacklist');
    if ('error' in env) throw new Error('unexpected');
    const r = parseImportInputs({ text, envelopeRows: env.rules }, blOpts());
    expect(r.total).toBe(MAX_IMPORT_ROWS);
    expect(r.exceededLimit).toBe(true);
  });

  it('文件行的 name/priority/isActive 一路透传到提交计划；文本行不带', () => {
    const env = parseExportEnvelope(envelope([exportedRule()]), 'blacklist');
    if ('error' in env) throw new Error('unexpected');
    const r = parseImportInputs({ text: '8.8.8.8', envelopeRows: env.rules }, blOpts());
    const plan = buildImportPlan(r.rows, 'skip');
    expect(plan).toHaveLength(2);
    const fromText = plan.find((p) => p.ipValue === '8.8.8.8');
    const fromFile = plan.find((p) => p.ipValue === '1.2.3.4');
    expect(fromText?.name).toBeUndefined();
    expect(fromFile?.name).toBe('bl-rule-1');
    expect(fromFile?.priority).toBe(42);
    expect(fromFile?.isActive).toBe(false);
  });
});

describe('工具函数', () => {
  it('parseActionAlias 识别中英与内部词表，空/未知返回 null', () => {
    expect(parseActionAlias('隔离')).toBe('quarantine');
    expect(parseActionAlias('REJECT')).toBe('reject');
    expect(parseActionAlias('投递')).toBe('accept');
    expect(parseActionAlias('')).toBeNull();
    expect(parseActionAlias('乱写')).toBeNull();
  });

  it('actionMatchesListType 区分黑白名单动作', () => {
    expect(actionMatchesListType('reject', 'blacklist')).toBe(true);
    expect(actionMatchesListType('accept', 'blacklist')).toBe(false);
    expect(actionMatchesListType('accept', 'whitelist')).toBe(true);
    expect(actionMatchesListType('quarantine', 'whitelist')).toBe(false);
  });
});
