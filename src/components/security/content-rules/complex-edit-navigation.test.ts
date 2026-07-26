import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * GT-11698 回归守卫。
 *
 * 复杂内容规则的编辑图标要跳到 `/rules/data?edit_rule_id=<id>`。上一轮修复只对
 * href 字符串做了单测（complexContentRuleEditHref 返回值正确），但浏览器里仍然
 * 404 —— 因为 ContentRulesPage 当时从 `next/navigation` 取 useRouter。
 *
 * 本仓没有 middleware.ts，next-intl 不做 locale 重写，所有路由都必须带显式 locale
 * 段（src/app/page.tsx 直接重定向到 /zh）。用 next/navigation 的 router.push 推
 * 一个不带 locale 的绝对路径，会被 App Router 匹配成 [locale]="rules" +
 * (dashboard)/data —— 该路由不存在，于是 404。实测：
 *   /rules/data?edit_rule_id=1     -> 404
 *   /zh/rules/data?edit_rule_id=1  -> 307（非 404）
 *
 * 所以 href 字符串对不代表跳转对：真正的不变式是「这个组件必须用 locale-aware
 * router」。href 单测抓不到，这条才抓得到。
 */
describe('ContentRulesPage complex-rule navigation (GT-11698)', () => {
  const src = readFileSync(
    resolve(__dirname, '../ContentRulesPage.tsx'),
    'utf8',
  );

  it('从 @/i18n/navigation 取 useRouter，而不是 next/navigation', () => {
    expect(src).toMatch(/import\s*\{[^}]*\buseRouter\b[^}]*\}\s*from\s*["']@\/i18n\/navigation["']/);
  });

  it('不从 next/navigation 引入 useRouter', () => {
    expect(src).not.toMatch(/import\s*\{[^}]*\buseRouter\b[^}]*\}\s*from\s*["']next\/navigation["']/);
  });
});
