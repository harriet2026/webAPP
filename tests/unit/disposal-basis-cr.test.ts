import { describe, expect, it } from 'vitest';
import { DISPOSAL_POLICY_MAP, resolveHitModules } from '@/components/email-disposal/lib/disposal-basis-config';

const CR = DISPOSAL_POLICY_MAP.CR;

describe('内容规则处置依据文案', () => {
  it('正则命中显示"正则表达式"而不是"关键词"', () => {
    const v = { match_method: 'regex', match_content: '^(发票|代开).*$', match_position: 'subject', matched_content: '发票代开' };
    expect(CR.hitDetail(v, 'zh')).toContain('正则表达式');
    expect(CR.hitDetail(v, 'zh')).not.toContain('关键词');
  });

  it('列表摘要同样显示真实匹配方式（验收标准 #4）', () => {
    const v = { match_method: 'regex', match_content: '发票' };
    expect(CR.listSummary(v, 'zh')).toContain('正则表达式');
    expect(CR.listSummary(v, 'zh')).not.toContain('关键词');
  });

  it('多位置命中按下标配对展示', () => {
    const v = {
      match_method: 'regex',
      match_content: '发票',
      match_position: 'subject,attachment_names',
      matched_content: '发票代开 | 发票.pdf',
    };
    const s = CR.hitDetail(v, 'zh');
    expect(s).toContain('主题');
    expect(s).toContain('附件名称');
    expect(s).toContain('发票代开');
    expect(s).toContain('发票.pdf');
  });

  // GT-12727 终审修复项1：hitDetail 用真实换行符（而非分隔符）分隔"命中规则头"
  // 与"实际命中"两段，前端消费点必须配 `whitespace-pre-line` 才能渲染成两行
  // （spec §3.6.3）。这里钉死格式化字符串里确实是字面 \n（而不是被转义成
  // "\\n" 文本或被替换成空格/顿号之类的伪换行），防止未来有人把 `\n` 误改成
  // 普通分隔符导致两行诉求在源头就丢失。
  it('命中详情用真实换行符分隔"命中规则头"与"实际命中"两段（配合 whitespace-pre-line 渲染两行）', () => {
    const v = {
      match_method: 'regex',
      match_content: '^(发票|代开).*$',
      match_position: 'subject,attachment_names',
      matched_content: '发票代开 | 发票.pdf',
    };
    const s = CR.hitDetail(v, 'zh');
    const lines = s.split('\n');
    expect(lines.length).toBe(2);
    expect(lines[0]).toContain('匹配');
    expect(lines[0]).not.toContain('实际命中');
    expect(lines[1]).toContain('实际命中：');
    expect(lines[1]).toContain('发票代开');
    expect(lines[1]).toContain('发票.pdf');
  });

  it('content_group 走独立文案，不套位置模板', () => {
    const v = { match_method: 'content_group', match_content: '财务敏感词' };
    const s = CR.hitDetail(v, 'zh');
    expect(s).toContain('内容组');
    expect(s).toContain('财务敏感词');
    expect(s).not.toContain('正文');
  });

  it('字段缺失时不编造：不得回落成"正文/关键词/-"', () => {
    const s = CR.hitDetail({}, 'zh');
    expect(s).not.toContain('关键词');
    expect(s).not.toContain('正文');
    expect(s).not.toContain(' - ');
  });

  // GT-12727 §7.10.4：原用例只断言 not.toContain('html_body')，对 en 近乎恒真
  //（英文文案本来就写 'HTML body'，只差一个空格），等于没测。改为逐语言断言
  // 真实译文。
  it('四语都有本地化位置标签，而不是原样吐 token', () => {
    const v = { match_method: 'regex', match_content: 'x', match_position: 'html_body', matched_content: 'y' };
    const expected: Record<'zh' | 'en' | 'th' | 'ru', string> = {
      zh: 'HTML 正文',
      en: 'HTML body',
      th: 'เนื้อหา HTML',
      ru: 'HTML-текст',
    };
    for (const lang of ['zh', 'en', 'th', 'ru'] as const) {
      expect(CR.hitDetail(v, lang)).toContain(expected[lang]);
      expect(CR.hitDetail(v, lang)).not.toContain('html_body');
    }
  });

  // GT-12727 §7.10.4：match_content 缺失时渲染出空引号（`匹配 关键词 ""`）
  // 与本工单要消灭的"空洞占位"同类。
  it('match_content 缺失时不得渲染空引号', () => {
    const v = { match_method: 'keyword', match_position: 'subject', matched_content: '发票' };
    for (const lang of ['zh', 'en', 'th', 'ru'] as const) {
      const s = CR.hitDetail(v, lang);
      expect(s).not.toContain('""');
      expect(s).not.toContain('“”');
    }
    // 有内容时引号照常出现。
    expect(CR.hitDetail({ ...v, match_content: '发票' }, 'zh')).toContain('“发票”');
  });
});

// GT-12727 spec §7.10.3：命中模块清单的两种行格式。
describe('resolveHitModules 双格式', () => {
  // 输入刻意用**序列化后的真实形状**（JSON.parse），不是手写对象字面量。
  // 上一轮 Critical-1 的缺陷（Go 的 omitempty 让 `[]` 在 Marshal 时整字段蒸发）
  // 之所以被两边测试同时漏掉，就是因为 TS 侧手写 `effective_for: []`、
  // Go 侧只断言内存值——**两边都不过序列化边界**。
  // 下面这串字节与 Go 侧 TestEffectiveForTriStateSurvivesJSON 钉死的形状一致。
  const SERIALIZED = `{
    "policy_key": "IPBL",
    "modules": [
      {"policy_key":"IPBL","rule_id":"IPBL-11","action":"reject","recipients":["a@x","b@x"],"effective_for":["a@x"]},
      {"policy_key":"CR","rule_id":"CR-66","action":"quarantine","recipients":["b@x"],"effective_for":[]},
      {"policy_key":"IPFREQ","rule_name":"连接频率","action":"reject"}
    ]
  }`;

  it('新格式直接用 modules，三态 effective_for 跨序列化边界仍可区分', () => {
    const mods = resolveHitModules(JSON.parse(SERIALIZED));
    expect(mods).toHaveLength(3);
    // 生效于部分收件人
    expect(mods[0].effective_for).toEqual(['a@x']);
    // 确知未生效：`[]` 必须原样到达前端，不能变成 undefined
    expect(Array.isArray(mods[1].effective_for)).toBe(true);
    expect(mods[1].effective_for).toEqual([]);
    // 无归属信息：字段缺席
    expect(mods[2].effective_for).toBeUndefined();
  });

  it('老格式回落 per_recipient：去重且 effective_for 保持 undefined（不得标成"未生效"）', () => {
    const basis = {
      policy_key: 'CR',
      per_recipient: [
        { policy_key: 'CR', rule_id: 'CR-66', action: 'quarantine', rule_name: '内容规则A' },
        { policy_key: 'CR', rule_id: 'CR-66', action: 'quarantine', rule_name: '内容规则A' },
        { policy_key: 'IPBL', rule_id: 'IPBL-11', action: 'reject', rule_name: 'IP黑名单' },
      ],
    };
    const mods = resolveHitModules(basis);
    expect(mods).toHaveLength(2);
    for (const m of mods) {
      expect(m.effective_for).toBeUndefined();
      expect(m.recipients).toBeUndefined();
    }
  });

  it('modules 存在时不再回落 per_recipient', () => {
    const basis = {
      policy_key: 'CR',
      modules: [{ policy_key: 'CR', rule_id: 'CR-66', action: 'quarantine' }],
      per_recipient: [{ policy_key: 'IPBL', rule_id: 'IPBL-11', action: 'reject' }],
    };
    expect(resolveHitModules(basis).map((m) => m.policy_key)).toEqual(['CR']);
  });

  // 与后端 MF-3 同一个坑：未映射页（ip_frequency 等）的 policy_key 与显示态
  // rule_id **都是空串**，只用 (policy_key, rule_id, action) 做键会把两条不同的
  // 规则坍缩成一条、rule_name 取先到者。
  it('老格式去重键不得让未映射页坍缩', () => {
    const basis = JSON.parse(`{
      "policy_key": "",
      "per_recipient": [
        {"policy_key":"","rule_id":"","action":"reject","rule_name":"频率规则A"},
        {"policy_key":"","rule_id":"","action":"reject","rule_name":"频率规则B"},
        {"policy_key":"","rule_id":"","action":"reject","rule_name":"频率规则A"}
      ]
    }`);
    const mods = resolveHitModules(basis);
    expect(mods).toHaveLength(2);
    expect(mods.map((m) => m.rule_name)).toEqual(['频率规则A', '频率规则B']);
  });

  it('两者皆无时返回空数组', () => {
    expect(resolveHitModules(undefined)).toEqual([]);
    expect(resolveHitModules({ policy_key: 'CR' })).toEqual([]);
  });
});
