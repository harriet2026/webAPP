import type { Template, ProtocolChecksConfig, AuthSpoofingAction, CheckItem } from '@/types/auth-spoofing';

type TemplateActions = {
  spf:   Record<string, AuthSpoofingAction>;
  dkim:  Record<string, AuthSpoofingAction>;
  dmarc: Record<string, AuthSpoofingAction>;
  ptr:   Record<string, AuthSpoofingAction>;
};

export const TEMPLATES: Record<'loose'|'standard'|'strict', TemplateActions> = {
  loose: {
    spf:  { fail:'quarantine', softfail:'mark-delivery', none:'mark-delivery', temperror:'mark-delivery', permerror:'mark-delivery' },
    dkim: { fail:'quarantine', neutral:'mark-delivery', partial:'mark-delivery', none:'mark-delivery', temperror:'mark-delivery' },
    dmarc:{ reject:'quarantine', quarantine:'mark-delivery', none:'mark-delivery', no_record:'mark-delivery', query_fail:'mark-delivery' },
    // PTR 三项见下方 strict 处的产品裁决说明：所有档位一律不拦截。
    ptr:  { noptr:'mark-delivery', nomatch:'mark-delivery', ehlo_mismatch:'mark-delivery' },
  },
  standard: {
    // 产品裁决：standard 的 spf.fail 用「隔离」而不是「拒收」。拒收是退回发件人、
    // 不可挽回，而 SPF 失败有真实的正常场景会踩到——企业换邮件服务商没来得及更新 SPF
    // 记录，以及邮件经中间服务器转发（转发天然让 SPF 失效，非常常见）。隔离至少让管理
    // 员看得到、捞得回来。strict 的 spf.fail 仍是 reject（严格档定位就是激进）。
    spf:  { fail:'quarantine', softfail:'quarantine', none:'mark-delivery', temperror:'mark-delivery', permerror:'mark-delivery' },
    dkim: { fail:'quarantine', neutral:'quarantine', partial:'mark-delivery', none:'mark-delivery', temperror:'mark-delivery' },
    // no_record（对方没发布 DMARC）在标准档由「隔离」降为「标记放行」（2026-08-11）。
    // 原值与同档的两个对照项自相矛盾：对方**没发布 SPF**(spf.none) 是标记放行，
    // DMARC**查不到**(query_fail) 也是标记放行，唯独"没发布 DMARC"被隔离。而 DMARC
    // 的部署率远低于 SPF——没配 SPF 的域名今天已经很少，没配 DMARC 的正规中小企业
    // 遍地都是，等于宽容了普及率高的、严办了普及率低的。标准档是**系统默认档**
    // (defaultStandardConfig)，开箱即生效，这条会造成大面积误杀。
    dmarc:{ reject:'reject', quarantine:'quarantine', none:'mark-delivery', no_record:'mark-delivery', query_fail:'mark-delivery' },
    // PTR 三项见下方 strict 处的产品裁决说明：所有档位一律不拦截。
    ptr:  { noptr:'mark-delivery', nomatch:'mark-delivery', ehlo_mismatch:'mark-delivery' },
  },
  strict: {
    spf:  { fail:'reject', softfail:'quarantine', none:'quarantine', temperror:'quarantine', permerror:'quarantine' },
    // dkim.fail 在严格档由「拒收」降为「隔离」（2026-08-11）。DKIM 签名在正常投递
    // 链路里 routinely 会坏：邮件列表改主题/加页脚、转发网关追加免责声明——正文被动
    // 一个字节 body hash 就对不上，这正是 ARC 存在的原因。RFC 6376 明确要求把验证
    // 失败的签名**当作没有签名**处理，而不是当作伪造证据。standard 档 spf.fail 用
    // 隔离而非拒收的那段理由（转发天然让 SPF 失效）对 DKIM 只多不少，此前没走过同样
    // 的讨论。拒收是退回发件人、不可挽回。
    //
    // partial（多签名里部分通过）三档一律标记放行：它意味着**至少有一个签名验通过
    // 了**，真实性证据严格多于 none，不该与 none 同罚；典型成因还是邮件列表加自己的
    // 签名把原签名改坏，与上面同源。守卫 TestDKIMPartialNeverHarsherThanNone。
    dkim: { fail:'quarantine', neutral:'quarantine', partial:'mark-delivery', none:'quarantine', temperror:'quarantine' },
    dmarc:{ reject:'reject', quarantine:'quarantine', none:'quarantine', no_record:'quarantine', query_fail:'quarantine' },
    // 产品裁决：PTR 的 noptr / nomatch / ehlo_mismatch 三项在 loose / standard /
    // strict **所有档位**下都只「标记放行」，一律不拦截。它们都是"缺少证据"而非
    // "有证据表明是坏的"——大量正规中小企业的邮件服务器压根没配 PTR，对它动手误杀面
    // 大；严格档往往被全量启用，误杀面反而更大，而"缺少证据"不足以支撑退信这种不可
    // 挽回的动作。守卫见 internal/api/auth_spoofing_test.go 的
    // TestPTRNeutralConditions_NeverBlockInAnyTemplate。
    ptr:  { noptr:'mark-delivery', nomatch:'mark-delivery', ehlo_mismatch:'mark-delivery' },
  },
};

function applyGroup(
  current: Record<string, CheckItem>,
  actions: Record<string, AuthSpoofingAction>,
): Record<string, CheckItem> {
  const out: Record<string, CheckItem> = {};
  // Process keys that exist in current config, applying template action if defined
  for (const k of Object.keys(current)) {
    const action = actions[k] ?? current[k].action;
    out[k] = { ...current[k], action, enabled: true };
  }
  // Also add keys that exist in the template but not yet in current config (e.g. newly added scenarios)
  for (const k of Object.keys(actions)) {
    if (!(k in out)) {
      out[k] = { enabled: true, action: actions[k], observe_mode: false };
    }
  }
  return out;
}

export function applyTemplate(p: ProtocolChecksConfig, name: 'loose'|'standard'|'strict'): ProtocolChecksConfig {
  const t = TEMPLATES[name];
  return {
    ...p,
    template: name,
    spf:   applyGroup(p.spf,   t.spf),
    dkim:  applyGroup(p.dkim,  t.dkim),
    dmarc: applyGroup(p.dmarc, t.dmarc),
    ptr:   applyGroup(p.ptr,   t.ptr),
  };
}

export function inferTemplate(p: ProtocolChecksConfig): Template {
  for (const [name, t] of Object.entries(TEMPLATES) as [string, TemplateActions][]) {
    if (matchesGroup(p.spf, t.spf) && matchesGroup(p.dkim, t.dkim) && matchesGroup(p.dmarc, t.dmarc) && matchesGroup(p.ptr, t.ptr)) {
      return name as Template;
    }
  }
  return 'custom';
}

function matchesGroup(actual: Record<string, CheckItem>, expected: Record<string, AuthSpoofingAction>): boolean {
  const allKeys = new Set([...Object.keys(actual), ...Object.keys(expected)]);
  for (const k of allKeys) {
    const item = actual[k];
    if (!item) continue;
    const wantAction = expected[k] ?? '';
    const effectiveAction = item.enabled ? (item.action ?? '') : 'accept';
    if (effectiveAction !== wantAction) return false;
  }
  return true;
}
