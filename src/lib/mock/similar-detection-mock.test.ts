import { describe, it, expect } from 'vitest';
import { dispatch, isMockable } from '@/lib/mock/dispatcher';
import { defaultConfig } from '@/components/security/similar-detection/defaults';
import type { SimilarDetectionConfig } from '@/components/security/similar-detection/types';

// 注意：fixtures.ts 里的相似检测 mock 状态是 module-scope 单例，PUT 会改写它。
// 因此本文件里 GET 的默认值断言必须排在任何 PUT 用例之前（vitest 默认按声明
// 顺序串行跑同一 describe 内的用例）。
describe('similar-detection mock', () => {
  it('GET /security/similar-detection 被 mock 覆盖', () => {
    expect(isMockable('GET', '/security/similar-detection')).toBe(true);
  });

  it('PUT /security/similar-detection 被 mock 覆盖', () => {
    expect(isMockable('PUT', '/security/similar-detection')).toBe(true);
  });

  it('GET 返回 demo 默认值（deep-equal defaultConfig() + version 3）', () => {
    const res = dispatch({ method: 'GET', path: '/security/similar-detection' });
    const data = res.data as SimilarDetectionConfig;
    expect(data).toEqual({ ...defaultConfig(), version: 3 });
  });

  it('PUT 回显 body 字段并把 version 置为 expected_version+1', () => {
    const body = {
      ...defaultConfig(),
      mode: 'aggregate',
      expected_version: 3,
    };
    const res = dispatch({ method: 'PUT', path: '/security/similar-detection', body });
    const data = res.data as SimilarDetectionConfig;
    expect(data.mode).toBe('aggregate');
    expect(data.version).toBe(4);
  });

  it('PUT 缺省 expected_version 时 version 回退为 4', () => {
    const res = dispatch({
      method: 'PUT',
      path: '/security/similar-detection',
      body: { ...defaultConfig(), mode: 'separate' },
    });
    const data = res.data as SimilarDetectionConfig;
    expect(data.version).toBe(4);
  });
});
