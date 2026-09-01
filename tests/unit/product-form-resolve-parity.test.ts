import { describe, it, expect } from 'vitest';
import vectors from '@/lib/product-form/__fixtures__/parity_vectors.json';
import registry from '@/lib/product-form/__fixtures__/registry_for_test.json';
import { resolve, PRESETS, type FeatureDef } from '@/lib/product-form/resolve';

interface VectorRow {
  form: string;
  viewer: string;
  feature: string;
  granted: boolean;
  out: { visible: boolean; locked: boolean; canEdit: boolean; readOnly: boolean };
}

describe('resolve parity with Go', () => {
  it('matches every Go vector', () => {
    const byId = new Map<string, FeatureDef>(
      (registry as FeatureDef[]).map((f) => [f.id, f]),
    );
    const rows = vectors as VectorRow[];
    // 5 forms × 42 features × 2 viewers × 2 granted states.
    // 这个数字是「生成的向量被截断」的哨兵，所以刻意写死而不是从 registry 推导 ——
    // 若从 registry.length 推导，向量文件整体缺失时它会跟着变小、断言恒真。
    // registry 增删条目时同步改这里（并重新生成向量）。
    // attachment-sandbox（附件沙箱能力开关，2026-01）目前只在前端注册表落地，
    // 对应的 20 条向量按 resolve() 本身的状态机手工推导（与既有 grantable
    // 特性同构），后端接入后需要用 Go 生成的向量替换校验。
    expect(registry).toHaveLength(42);
    expect(rows.length).toBe(42 * 5 * 2 * 2);
    for (const row of rows) {
      const f = byId.get(row.feature);
      expect(f, `fixture missing feature ${row.feature}`).toBeDefined();
      const grants = row.granted ? [row.feature] : [];
      const got = resolve(f!, PRESETS[row.form], row.viewer as 'platform' | 'tenant', grants);
      const key = { feature: row.feature, form: row.form, viewer: row.viewer, granted: row.granted };
      expect({ ...key, ...got }).toEqual({ ...key, ...row.out });
    }
  });
});
