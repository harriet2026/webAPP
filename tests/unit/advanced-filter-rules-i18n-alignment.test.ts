import { describe, it, expect } from 'vitest';
import zh from '../../messages/zh.json';
import en from '../../messages/en.json';
import th from '../../messages/th.json';
import ru from '../../messages/ru.json';

// GT-12076: two prototype/product alignment fixes for the advanced-filter-rules
// (V3) module.
//   Item 4 — the 生效范围 scope triplet used 收件/发件/内部, but 7 other modules
//            (behaviorControl / attachmentSecurity / similarDetection / emailDisposal
//            / securityOverview / deliveryTraffic / mailflow) and the html_spec
//            prototype all use 接收/外发/域内. advanced-rules was the outlier.
//   Item 5 — the module name must be the FULL "高级过滤规则" everywhere it is
//            referenced (pipeline node card, group-policy stage list), in every
//            locale — the pipeline node and group-policy reference had abbreviated
//            forms ("Advanced Rules" / 高级规则).
const LOCALES = { zh, en, th, ru } as Record<string, any>;

describe('advanced-filter-rules i18n alignment (GT-12076)', () => {
  it('zh 生效范围 uses the product-standard 接收/外发/域内 triplet', () => {
    const a = zh.advancedRulesFeature;
    expect([a.scopeIncoming, a.scopeOutgoing, a.scopeInternal]).toEqual(['接收', '外发', '域内']);
    // must not regress to the old outlier wording
    expect([a.scopeIncoming, a.scopeOutgoing, a.scopeInternal]).not.toContain('收件');
  });

  it('zh scope triplet matches the shared product-standard direction labels', () => {
    // Cross-module consistency guard: same wording as behaviorControl.direction.
    const a = zh.advancedRulesFeature;
    const std = zh.behaviorControl.direction;
    expect([a.scopeIncoming, a.scopeOutgoing, a.scopeInternal]).toEqual([std.inbound, std.outbound, std.internal]);
  });

  for (const [locale, m] of Object.entries(LOCALES)) {
    it(`${locale} names the module by its full name in every reference`, () => {
      const full = m.advancedRulesFeature.title as string;
      expect(full.trim()).not.toBe('');
      // pipeline node card + group-policy stage list must use the same full name.
      expect(m.pipeline.advancedRules).toBe(full);
      expect(m.groupPolicy.policies.advancedRules).toBe(full);
    });
  }

  it('zh full name is 高级过滤规则, not the 高级规则 abbreviation', () => {
    expect(zh.advancedRulesFeature.title).toBe('高级过滤规则');
    expect(zh.pipeline.advancedRules).toBe('高级过滤规则');
    expect(zh.groupPolicy.policies.advancedRules).toBe('高级过滤规则');
  });
});
