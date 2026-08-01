import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import zh from '../../messages/zh.json';

// GT-12045 / GT-12048 / GT-12049: three RBL-filter zh text labels drifted from
// the html_spec (webapp/doc/html-spec/filter-rules-pipeline-rbl-filter/).
//   GT-12045 — action field label must read "操作" (html_spec layer-1, common.action),
//             not "动作".
//   GT-12048 — greylist entry button must read "点击配置" (html_spec greylistConfigure,
//             whose demo source is the mojibake "点�配置"), not "配置灰名单".
//   GT-12049 — an illegal RBL server must prompt "请输入有效的域名格式"
//             (html_spec index.html:477), not "域名格式无效".
const SOURCE = readFileSync(
  path.resolve(import.meta.dirname, '../../src/components/security/RBLFilterPage.tsx'),
  'utf-8',
);

describe('RBL filter html-spec text alignment', () => {
  // GT-12682 取代了 GT-12045：处置区改版后不再有「操作」这个字段标签，
  // 执行动作变成一张标题为「执行动作」的策略卡片（与灰名单策略互斥）。
  // productAction 这个 key 仍保留在词表里供其他处复用，但配置页不再渲染它。
  it('GT-12682: the action field label became the 执行动作 strategy card title', () => {
    expect(zh.rblFilter.actionSectionTitle).toBe('执行动作');
    expect(SOURCE).toContain("t('rblFilter.actionSectionTitle')");
    expect(SOURCE).toContain("t('rblFilter.greylistSectionTitle')");
    expect(SOURCE).not.toContain("t('rblFilter.productAction')");
  });

  it('GT-12048: greylist entry button is 点击配置', () => {
    expect(zh.rblFilter.greylistConfigure).toBe('点击配置');
    expect(SOURCE).toContain("t('rblFilter.greylistConfigure')");
  });

  it('GT-12049: invalid RBL server prompt is 请输入有效的域名格式', () => {
    expect(zh.rblFilter.domainInvalid).toBe('请输入有效的域名格式');
    // domainInvalid flows through validateServer() into both the inline error and toast.error
    expect(SOURCE).toContain("t('rblFilter.domainInvalid')");
    expect(SOURCE).toContain('toast.error(error)');
  });
});
