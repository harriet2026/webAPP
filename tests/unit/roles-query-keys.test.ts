import { describe, expect, it } from 'vitest';
import { roleQueryKeys } from '@/lib/api/roles';

// GT-12253 防回归：角色"列表"与"详情"的 react-query key 必须处于不同命名空间。
// 旧写法两者都是 ['roles', <number>]，平台管理员代登录的租户 id 与角色 id 相同
// 时缓存互相覆盖，(roles ?? []).filter 抛 TypeError。
describe('roleQueryKeys (GT-12253)', () => {
  it('数字入参下列表与详情 key 不相同', () => {
    expect(roleQueryKeys.list(5)).not.toEqual(roleQueryKeys.detail(5));
  });
  it('都保留 roles 前缀（invalidateQueries 按前缀失效仍生效）', () => {
    expect(roleQueryKeys.list('platform')[0]).toBe('roles');
    expect(roleQueryKeys.detail(1)[0]).toBe('roles');
  });
  it('列表 key 空作用域回落 default', () => {
    expect(roleQueryKeys.list(undefined)).toEqual(['roles', 'list', 'default']);
  });
});
