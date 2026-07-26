import { describe, it, expect } from 'vitest';
import zh from '../../../../messages/zh.json';

// GT-11686: the 规则描述 textarea in ContentRuleDrawer was labelled with
// `contentRules.description`, which is the PAGE-HEADER blurb ("通过关键词、正则
// 表达式或内容组匹配邮件内容") — a whole sentence rendered as a field label. The
// key existed and resolved fine, so the i18n-literal-keys guard could not see
// it: this is a "valid key, wrong meaning" bug, and only a semantic assertion
// catches it.
describe('content-rules drawer labels (GT-11686)', () => {
  const cr = (zh as unknown as Record<string, Record<string, string>>).contentRules;

  it('has a dedicated field label for the rule description', () => {
    expect(cr.ruleDescription).toBeTruthy();
  });

  it('the field label is not the page-header blurb', () => {
    expect(cr.ruleDescription).not.toBe(cr.description);
    expect(cr.ruleDescription).not.toBe(cr.title);
  });

  it('the field label reads like a label, not a sentence', () => {
    // The old value was a 20-character sentence describing the whole feature.
    expect(cr.ruleDescription.length).toBeLessThanOrEqual(8);
    expect(cr.description.length).toBeGreaterThan(8);
  });
});
