import { describe, it, expect } from 'vitest';
import { moduleOf } from '@/components/admin-audit/admin-audit-taxonomy';
import zh from '../../messages/zh.json';
import en from '../../messages/en.json';
import th from '../../messages/th.json';
import ru from '../../messages/ru.json';

// GT-12449：bounce_dsn_settings 功能已下线，但历史审计行里仍有
// resource=bounce_dsn 的记录。admin-audit-taxonomy.ts 里的 RESOURCE_TO_SIDEBAR
// 映射（经 moduleOf() 暴露）是它们的【解码表】，删掉会让那些行在管理台失去
// 分类显示——不报错、没有别的用例覆盖。
//
// 注：admin-audit-taxonomy.ts 并不导出一个叫 AUDIT_RESOURCE_TAXONOMY 的符号
// （占位名，见 task-9-brief.md 的实施提示）；它导出的是 moduleOf(resourceType)
// 函数，内部按 RESOURCE_TO_SIDEBAR 表把 resource_type 解析成 { topKey, subKey }。
describe('bounce_dsn 审计分类必须保留', () => {
  it('taxonomy 仍能解码 bounce_dsn', () => {
    const mod = moduleOf('bounce_dsn');
    expect(mod).toBeDefined();
    expect(mod.subKey).toBe('sidebar.bounceDsnSettings');
  });

  it.each([['zh', zh], ['en', en], ['th', th], ['ru', ru]] as const)(
    '%s 语言包仍有 sidebar.bounceDsnSettings',
    (_name, msgs) => {
      const sidebar = (msgs as { sidebar?: Record<string, unknown> }).sidebar;
      expect(sidebar?.bounceDsnSettings).toBeTruthy();
    },
  );
});
