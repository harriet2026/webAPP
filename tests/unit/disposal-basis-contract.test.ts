import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// GT-12727 契约漂移守卫。
//
// 那个 bug 的形状：前端 formatter 读 hit_values 的 match_method / match_position /
// matched_content **且带兜底默认值**（关键词 / 正文 / -），而后端根本不产出这三个键
// —— 三个默认值一起生效，界面拼出一句语法通顺、语义完全错误的结论
// 「邮件 正文 匹配 关键词 -」。不报错、不红测试，显示得像模像样。
//
// 这不是孤例：disposal-basis-config.ts 有 70+ 处 val(v, 'xxx') 调用、30+ 个不同的
// 键，而后端 internal/disposalbasis 的注册表只声明其中一部分。本测试把
// 「前端读什么」与「后端声明产出什么」对上：
//
//   后端注册表 internal/disposalbasis/hitvalues_registry.go
//     → 生成 internal/disposalbasis/hit_values_contract.json（Go 侧
//       TestHitValuesContractInSyncWithRegistry 保证不过期）
//     → 本测试读该契约，断言前端读的每个键都被声明，或在下面的例外清单里。
//
// **这条测试若早存在，GT-12727 在写前端那一刻就会红。**

const REPO = path.resolve(__dirname, '../../..');
const CONFIG_PATH = path.join(
  REPO,
  'webapp/src/components/email-disposal/lib/disposal-basis-config.ts',
);
const CONTRACT_PATH = path.join(REPO, 'internal/disposalbasis/hit_values_contract.json');

interface Contract {
  content_rule_scopes: string[];
  hit_values: Record<string, string[]>;
}

const source = readFileSync(CONFIG_PATH, 'utf8');
const contract: Contract = JSON.parse(readFileSync(CONTRACT_PATH, 'utf8'));

// ---------------------------------------------------------------------------
// 已知未实现项（明账）。
//
// 这些 `<policy_key>.<hit_values 键>` 是前端已经在读、但**后端至今不产出**的
// 键。它们不是本次引入的，而是 GT-12727 揭出来的既有欠账 —— formatter 里的兜底
// 默认值会把它们渲染成看似正常的文案（`-`、"频率"、"未知"…），与 GT-12727 同类。
//
// 刻意不为了让测试变绿而删掉前端读取、也不把它们塞进契约：那等于把问题藏回去。
// 记在这里的每一项都是一笔明账：将来后端补上产出（在
// internal/disposalbasis/hitvalues_registry.go 的 policyHitValues 里声明并实际
// 采集）后，从本清单删掉即可 —— 清单只减不增，新增的违规会立刻红。
//
// 条目数 36（覆盖 21 个模块中的 17 个），即当前有 17 个模块的命中原因是部分或
// 完全没实现的。
// ---------------------------------------------------------------------------
const KNOWN_UNIMPLEMENTED = new Set<string>([
  // 阶段一：IP 策略
  'IPFREQ.time_window', // 频率统计窗口，ipfrequency 未写入 metadata
  'IPBL.entry_type', // 命中条目是静态/动态，未透出
  'RBL.category', // RBL 标记类别
  'RBL.rbl_source', // 命中的 RBL 源
  'OVERSEAS.country', // 来源国家/地区，geoip 结果未透出

  // 阶段二：身份层
  'AUTH.protocol', // SPF/DKIM/DMARC 中的哪一个
  'AUTH.detail', // 验证失败原因
  'AUTH.feature_type', // 仿冒特征类型
  'AUTH.score', // 仿冒相似度
  'AUTH.mail_from', // 信封发件人
  'AUTH.header_from', // 信头发件人
  'BEHAVIOR.abnormal_type', // 异常维度（频率/收件人数/…）
  'BEHAVIOR.detail', // 异常明细
  'RCPT.rcpt', // 校验失败的收件人
  'UBL.user', // 命中名单的用户

  // 阶段三：内容层
  'ATT-BASIC.timeout', // 扫描超时标记
  'ATT-BASIC.limit_type', // 超限维度（大小/数量/嵌套）
  'ATT-BASIC.size', // 附件大小
  'ATT-BASIC.level', // 嵌套层数
  'ATT-AV.timeout', // 扫描超时标记
  'ATT-AV.filename', // 检出病毒的附件名
  'ATT-AV.engine', // 反病毒引擎名
  'ATT-AV.version', // 引擎/病毒库版本
  'ATT-ENC.filename', // 加密附件名
  'URL.type', // 沙箱判定的威胁类型
  'INTENT.tag_id', // 意图引擎标签 id
  'INTENT.tag_label', // 意图引擎标签名

  // 阶段四：AI 检测
  'AI-PHISH.bec', // 是否 BEC
  'AI-SPOOF.spoof_type', // 仿冒类型（显示名/域名/…）
  'AI-TRACE.threat_type', // 回溯发现的威胁类型
  'AI-TRACE.capability', // 回溯能力

  // 阶段五：综合策略
  'SIM.subject_same', // 是否相同主题批量
  'SIM.similarity', // 相似度
  'SIM.similar_type', // 相似的已知邮件类型
  'SIM.dimension', // 相似维度
  // ACF 读的是 hit_values.detection_tags，但检测标签实际是 DisposalBasis 顶层的
  // detection_tags 字段，从来不进 hit_values —— 恒渲染成兜底的 "-"。
  'ACF.detection_tags',
]);

/** DISPOSAL_POLICY_MAP 里每个 policy_key 条目的源码块。 */
function policyBlocks(): { key: string; body: string }[] {
  const start = source.indexOf('export const DISPOSAL_POLICY_MAP');
  expect(start, 'DISPOSAL_POLICY_MAP 未找到，正则口径需更新').toBeGreaterThan(-1);
  const end = source.indexOf('\n};', start);
  expect(end, 'DISPOSAL_POLICY_MAP 的结束位置未找到').toBeGreaterThan(start);
  const region = source.slice(start, end);

  // 条目形如 `  IPFREQ: {` 或 `  'ATT-BASIC': {`（两空格缩进）。
  const entryRe = /^ {2}(?:'([A-Za-z0-9-]+)'|([A-Za-z0-9-]+)):\s*\{$/gm;
  const marks: { key: string; at: number }[] = [];
  for (let m = entryRe.exec(region); m; m = entryRe.exec(region)) {
    marks.push({ key: m[1] ?? m[2], at: m.index });
  }
  return marks.map((mark, i) => ({
    key: mark.key,
    body: region.slice(mark.at, i + 1 < marks.length ? marks[i + 1].at : region.length),
  }));
}

/** 一个条目块里读取的全部 hit_values 键：val(v, 'k') 与 v?.k / v.k 两种写法。 */
function readKeys(body: string): string[] {
  const keys = new Set<string>();
  for (const m of body.matchAll(/val\(\s*_?\w+\s*,\s*'([^']+)'/g)) keys.add(m[1]);
  for (const m of body.matchAll(/(?<![A-Za-z0-9_])_?v\??\.([A-Za-z_][A-Za-z0-9_]*)/g)) {
    keys.add(m[1]);
  }
  return [...keys].sort();
}

describe('处置依据 hit_values 契约守卫 (GT-12727)', () => {
  const blocks = policyBlocks();

  // 正则一旦因源码结构变动而匹配不到东西，本测试会"全绿"地什么也没查。
  it('静态扫描确实解析到了 policy_key 条目与 val() 读取', () => {
    expect(blocks.length).toBe(Object.keys(contract.hit_values).length);
    const total = blocks.reduce((n, b) => n + readKeys(b.body).length, 0);
    expect(total).toBeGreaterThan(50);
  });

  it('每个 policy_key 条目都在后端契约里有声明', () => {
    const unknown = blocks.map((b) => b.key).filter((k) => !(k in contract.hit_values));
    expect(unknown, `前端有后端不认识的 policy_key: ${unknown.join(', ')}`).toEqual([]);
  });

  it('前端读的每个 hit_values 键都被后端声明产出（或记在例外清单里）', () => {
    const bad: string[] = [];
    for (const { key, body } of blocks) {
      const declared = new Set(contract.hit_values[key] ?? []);
      for (const k of readKeys(body)) {
        const id = `${key}.${k}`;
        if (!declared.has(k) && !KNOWN_UNIMPLEMENTED.has(id)) bad.push(id);
      }
    }
    expect(
      bad,
      '前端读了后端不产出的 hit_values 键 —— formatter 的兜底默认值会把它渲染成\n' +
        '一句语义错误但语法通顺的结论（GT-12727 就是这么来的）。要么在\n' +
        'internal/disposalbasis/hitvalues_registry.go 里声明并实际产出，\n' +
        '要么把它显式记进本文件的 KNOWN_UNIMPLEMENTED 明账：\n' +
        bad.map((b) => `  '${b}',`).join('\n'),
    ).toEqual([]);
  });

  it('例外清单不留陈旧条目（后端补上产出后必须从清单删掉）', () => {
    const live = new Set<string>();
    for (const { key, body } of blocks) {
      for (const k of readKeys(body)) live.add(`${key}.${k}`);
    }
    const stale: string[] = [];
    for (const id of KNOWN_UNIMPLEMENTED) {
      const [pk, ...rest] = id.split('.');
      const k = rest.join('.');
      if (!live.has(id)) {
        stale.push(`${id}（前端已不再读取）`);
      } else if ((contract.hit_values[pk] ?? []).includes(k)) {
        stale.push(`${id}（后端已声明产出，欠账已还）`);
      }
    }
    expect(stale, `KNOWN_UNIMPLEMENTED 有陈旧条目，请删除:\n${stale.join('\n')}`).toEqual([]);
  });

  it('例外清单条目数与注释保持一致（改动清单时提醒同步注释）', () => {
    expect(KNOWN_UNIMPLEMENTED.size).toBe(36);
  });
});

describe('内容规则命中位置标签覆盖后端契约 (GT-12727)', () => {
  // crPositionLabel 未导出，直接扫源码里的 token 表。
  function positionTokens(): string[] {
    const fnStart = source.indexOf('function crPositionLabel');
    expect(fnStart, 'crPositionLabel 未找到').toBeGreaterThan(-1);
    const fnEnd = source.indexOf('\n}', fnStart);
    const body = source.slice(fnStart, fnEnd);
    return [...body.matchAll(/^\s{4}([a-z_]+):\s*\{\s*zh:/gm)].map((m) => m[1]).sort();
  }

  it('crPositionLabel 覆盖契约声明的全部内容范围 token', () => {
    const tokens = positionTokens();
    expect(tokens.length, 'token 表解析失败').toBeGreaterThan(0);
    const missing = contract.content_rule_scopes.filter((s) => !tokens.includes(s));
    expect(
      missing,
      `crPositionLabel 缺少范围标签 ${missing.join(', ')} —— 命中该位置时界面会直接` +
        '显示英文标识符（如 "attachment_types"）。',
    ).toEqual([]);
  });

  it('crPositionLabel 没有契约之外的多余 token', () => {
    const extra = positionTokens().filter((t) => !contract.content_rule_scopes.includes(t));
    expect(extra, `crPositionLabel 多出后端不存在的范围: ${extra.join(', ')}`).toEqual([]);
  });
});
