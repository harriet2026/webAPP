import { describe, it, expect } from 'vitest';
import {
  parseIPExpression,
  validateIPExpressionConfig,
  buildIPFilterRulePayload,
  ipConfigFieldsFromView,
  ipMatchesExpressionSimple,
  IP_EXPRESSION_ERROR_CODES,
} from '@/components/security/ip-filter-expression';
import { ruleSchema } from '@/components/security/IPFilterPage';

// GT-11464：ip_filter 前端 expression（表达式）类型 —— 与后端
// internal/models/ip_filter.go 同构的校验/构造纯函数测试。

// ─── 表达式解析 ───────────────────────────────────────────────────────────────

describe('parseIPExpression', () => {
  it('接受 ;/, 混用分隔的合法表达式（单IP/CIDR/区间/排除）', () => {
    const r = parseIPExpression('192.0.2.1;10.0.0.0/8,192.0.2.10-192.0.2.50;!192.0.2.33');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.items).toHaveLength(4);
      expect(r.items[0]).toEqual({ negated: false, kind: 'ip', value: '192.0.2.1' });
      expect(r.items[1]).toEqual({ negated: false, kind: 'cidr', value: '10.0.0.0/8' });
      expect(r.items[2]).toEqual({ negated: false, kind: 'between', value: '192.0.2.10-192.0.2.50' });
      expect(r.items[3]).toEqual({ negated: true, kind: 'ip', value: '192.0.2.33' });
    }
  });

  it('忽略空项（连续分隔符/首尾分隔符）', () => {
    const r = parseIPExpression(';;192.0.2.1,, ;10.0.0.0/8;');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.items).toHaveLength(2);
  });

  it('接受 IPv6 单IP/CIDR/区间', () => {
    const r = parseIPExpression('2001:db8::1;2001:db8::/32;2001:db8::1-2001:db8::9');
    expect(r.ok).toBe(true);
  });

  it('拒绝非法项', () => {
    for (const bad of ['999.1.1.1', 'not-an-ip', '10.0.0.0/33', '10.0.0.0/x', '1.2.3']) {
      const r = parseIPExpression(bad);
      expect(r.ok, bad).toBe(false);
    }
  });

  it('拒绝 IPv4 区间倒序（start > end）', () => {
    const r = parseIPExpression('192.0.2.50-192.0.2.10');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('expressionRangeInvalid');
  });

  it('拒绝区间两端不同族', () => {
    const r = parseIPExpression('192.0.2.1-2001:db8::1');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('expressionRangeInvalid');
  });

  it('拒绝重复项（含 ! 前缀区分）', () => {
    const r = parseIPExpression('192.0.2.1;192.0.2.1');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('expressionDuplicateItem');
    // !x 与 x 不算重复
    expect(parseIPExpression('192.0.2.1;!192.0.2.1').ok).toBe(true);
  });

  it('拒绝超过 100 项', () => {
    const expr = Array.from({ length: 101 }, (_, i) => `10.0.${Math.floor(i / 250)}.${(i % 250) + 1}`).join(';');
    const r = parseIPExpression(expr);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('expressionTooManyItems');
  });
});

// ─── 表达式整体校验（含组联动） ───────────────────────────────────────────────

describe('validateIPExpressionConfig', () => {
  it('纯排除项且无组 → expressionOnlyExclusions', () => {
    expect(validateIPExpressionConfig('!10.0.0.0/8', 0)).toBe('expressionOnlyExclusions');
  });

  it('纯排除项但有组 → 通过', () => {
    expect(validateIPExpressionConfig('!10.0.0.0/8', 1)).toBeNull();
  });

  it('空表达式且无组 → expressionRequired；空表达式有组 → 通过', () => {
    expect(validateIPExpressionConfig('', 0)).toBe('expressionRequired');
    expect(validateIPExpressionConfig('  ', 0)).toBe('expressionRequired');
    expect(validateIPExpressionConfig('', 2)).toBeNull();
  });

  it('合法表达式 → 通过', () => {
    expect(validateIPExpressionConfig('192.0.2.1;10.0.0.0/8;!192.0.2.33', 0)).toBeNull();
  });

  it('错误码全部注册在 IP_EXPRESSION_ERROR_CODES（供 i18n 奇偶校验用）', () => {
    for (const code of [
      'expressionRequired',
      'expressionOnlyExclusions',
      'expressionItemInvalid',
      'expressionRangeInvalid',
      'expressionDuplicateItem',
      'expressionTooManyItems',
    ]) {
      expect(IP_EXPRESSION_ERROR_CODES).toContain(code);
    }
  });
});

// ─── zod 表单校验（与后端同构的入口） ────────────────────────────────────────

const baseForm = {
  name: 'r1',
  description: '',
  list_type: 'blacklist' as const,
  demo_action: 'block' as const,
  priority: 100,
  is_active: true,
  valid_until: '',
};

describe('ruleSchema (expression)', () => {
  it('合法表达式通过', () => {
    const r = ruleSchema.safeParse({
      ...baseForm,
      ip_config_type: 'expression',
      ip_value: '192.0.2.1;10.0.0.0/8;192.0.2.10-192.0.2.50;!192.0.2.33',
      ip_groups: [1, 2],
    });
    expect(r.success).toBe(true);
  });

  it('纯排除且无组被拒绝', () => {
    const r = ruleSchema.safeParse({
      ...baseForm,
      ip_config_type: 'expression',
      ip_value: '!10.0.0.0/8',
      ip_groups: [],
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.message === 'expressionOnlyExclusions')).toBe(true);
    }
  });

  it('IPv4 区间倒序被拒绝', () => {
    const r = ruleSchema.safeParse({
      ...baseForm,
      ip_config_type: 'expression',
      ip_value: '192.0.2.50-192.0.2.10',
      ip_groups: [],
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.message === 'expressionRangeInvalid')).toBe(true);
    }
  });

  it('超过 20 个组被拒绝', () => {
    const r = ruleSchema.safeParse({
      ...baseForm,
      ip_config_type: 'expression',
      ip_value: '192.0.2.1',
      ip_groups: Array.from({ length: 21 }, (_, i) => i + 1),
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.message === 'expressionTooManyGroups')).toBe(true);
    }
  });

  it('旧 single/range 语义不变；ipGroup 不再是合法类型', () => {
    expect(ruleSchema.safeParse({ ...baseForm, ip_config_type: 'single', ip_value: '10.0.0.1' }).success).toBe(true);
    expect(ruleSchema.safeParse({ ...baseForm, ip_config_type: 'range', ip_value: '10.0.0.0/8' }).success).toBe(true);
    expect(ruleSchema.safeParse({ ...baseForm, ip_config_type: 'ipGroup', ip_value: '' }).success).toBe(false);
  });
});

// ─── payload 构造 / 编辑回填 ─────────────────────────────────────────────────

describe('buildIPFilterRulePayload', () => {
  it('expression 类型携带 ip_groups、ip_value 原样 trim 文本', () => {
    const payload = buildIPFilterRulePayload(
      {
        ...baseForm,
        ip_config_type: 'expression',
        ip_value: '  192.0.2.1;!192.0.2.33 ',
        ip_groups: [12, 7],
      },
      { action: 'reject', add_headers: undefined },
    );
    expect(payload.ip_config_type).toBe('expression');
    expect(payload.ip_value).toBe('192.0.2.1;!192.0.2.33');
    expect(payload.ip_groups).toEqual([12, 7]);
    expect(payload.action).toBe('reject');
  });

  it('single/range 类型不携带 ip_groups', () => {
    const payload = buildIPFilterRulePayload(
      { ...baseForm, ip_config_type: 'single', ip_value: '10.0.0.1', ip_groups: [3] },
      { action: 'reject', add_headers: undefined },
    );
    expect(payload.ip_groups).toBeUndefined();
    expect(payload.ip_value).toBe('10.0.0.1');
  });

  it('valid_until 转 RFC3339，空值省略', () => {
    const p1 = buildIPFilterRulePayload(
      { ...baseForm, ip_config_type: 'single', ip_value: '10.0.0.1', valid_until: '2030-01-02' },
      { action: 'reject', add_headers: undefined },
    );
    expect(p1.valid_until).toMatch(/^2030-01-0\dT/);
    const p2 = buildIPFilterRulePayload(
      { ...baseForm, ip_config_type: 'single', ip_value: '10.0.0.1', valid_until: '' },
      { action: 'reject', add_headers: undefined },
    );
    expect(p2.valid_until).toBeUndefined();
  });
});

describe('ipConfigFieldsFromView', () => {
  it('expression 行回填 ip_groups（缺省为空数组）', () => {
    expect(
      ipConfigFieldsFromView({ ip_config_type: 'expression', ip_value: '192.0.2.1;!192.0.2.33', ip_groups: [8101] }),
    ).toEqual({ ip_config_type: 'expression', ip_value: '192.0.2.1;!192.0.2.33', ip_groups: [8101] });
    expect(ipConfigFieldsFromView({ ip_config_type: 'range', ip_value: '10.0.0.0/8' })).toEqual({
      ip_config_type: 'range',
      ip_value: '10.0.0.0/8',
      ip_groups: [],
    });
  });
});

// ─── 模拟测试的简化命中（仅内联项，忽略组） ──────────────────────────────────

describe('ipMatchesExpressionSimple', () => {
  it('正向命中且未被排除 → true；被排除 → false', () => {
    const expr = '192.0.2.0/24;!192.0.2.33';
    expect(ipMatchesExpressionSimple('192.0.2.10', expr)).toBe(true);
    expect(ipMatchesExpressionSimple('192.0.2.33', expr)).toBe(false);
    expect(ipMatchesExpressionSimple('10.9.9.9', expr)).toBe(false);
  });

  it('区间项按 IPv4 数值比较', () => {
    const expr = '192.0.2.10-192.0.2.50';
    expect(ipMatchesExpressionSimple('192.0.2.30', expr)).toBe(true);
    expect(ipMatchesExpressionSimple('192.0.2.51', expr)).toBe(false);
  });
});
