import type { ListType, WhitelistMode } from '@/types/sender-filter';

// GT-12693：从 SenderFilterDrawer 提出来的纯函数，便于与后端
// validatePriority 的角色范围一起被单测锁住（此前它内联在组件里，
// "默认值是否落在租户管理员的 100-1000 内"没有任何断言保护）。
//
// 取值依据 design/implement/spec/2026-05-03-sender-filter-design.md D8：
// 黑名单 500 / 白名单 800 / 白名单-直投 999。
export function getSenderFilterDefaultPriority(
  listType: ListType,
  whitelistMode?: WhitelistMode,
): number {
  if (listType === 'blacklist') return 500;
  return whitelistMode === 'direct_deliver' ? 999 : 800;
}
