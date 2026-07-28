// GT-12501: 验收要求隐藏的入口不得回归——
// 1) 语言切换器仅提供 中文/English（th/ru 词典与路由保留但不在切换器展示）；
// 2) 「日志审计」组不含「邮件调查中心」入口（页面 /logs/mail-investigation 保留）。
// 「个人信息」快捷弹窗入口的隐藏由 header.tsx 直接移除（无独立可断言常量）。
import { describe, expect, test } from 'vitest';
import { languages, sidebarNavItems } from '@/lib/constants';

describe('GT-12501 hidden entries stay hidden', () => {
  test('language switcher offers only zh and en', () => {
    expect(languages.map((l) => l.code)).toEqual(['zh', 'en']);
  });

  test('logs group has no mail-investigation child', () => {
    const logs = sidebarNavItems.find((i) => i.id === 'logs');
    expect(logs).toBeTruthy();
    expect((logs!.children ?? []).map((c) => c.id)).not.toContain('mail-investigation');
  });
});
