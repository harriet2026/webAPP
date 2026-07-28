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
    // 5 forms × 41 features × 2 viewers × 2 granted states.
    // 这个数字是「生成的向量被截断」的哨兵，所以刻意写死而不是从 registry 推导 ——
    // 若从 registry.length 推导，向量文件整体缺失时它会跟着变小、断言恒真。
    // registry 增删条目时同步改这里（并重新生成向量）。
    expect(registry).toHaveLength(41);
    expect(rows.length).toBe(41 * 5 * 2 * 2);
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
