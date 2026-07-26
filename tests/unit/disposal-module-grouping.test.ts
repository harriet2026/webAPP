import { describe, expect, it } from 'vitest';
import {
  DISPOSAL_POLICY_MAP,
  groupDisposalModulesByStage,
} from '../../src/components/email-disposal/lib/disposal-basis-config';

// GT-12236: 处置依据"模块筛选"此前按 policy_key 逐项渲染（21 项），其中
// 附件安全检测被拆成 ATT-BASIC / ATT-QR / ATT-ENC 三项且重复显示同名。
// 原型（layer-3-search-disposal-basis.html）要求按模块语义展示 19 项，
// 附件安全检测作为单一模块出现一次。修复：按模块名分组合并。
describe('GT-12236 groupDisposalModulesByStage', () => {
  it('附件安全检测在阶段三合并为单一模块，包含全部三个 ATT key', () => {
    const groups = groupDisposalModulesByStage('zh');
    const attGroups = groups.filter(
      (g) => g.stage === 3 && g.moduleName === '附件安全检测',
    );
    expect(attGroups).toHaveLength(1);
    expect(attGroups[0].keys.sort()).toEqual(['ATT-BASIC', 'ATT-ENC', 'ATT-QR']);
  });

  it('阶段三模块数为 5（附件安全检测/反病毒引擎/URL防护/内容规则/意图引擎）', () => {
    const groups = groupDisposalModulesByStage('zh');
    const stage3 = groups.filter((g) => g.stage === 3);
    expect(stage3.map((g) => g.moduleName).sort()).toEqual(
      ['URL防护', '内容规则', '意图引擎', '反病毒引擎', '附件安全检测'].sort(),
    );
  });

  it('合并后总模块数 = 21 个 policy_key - 2 个被合并的重复项 = 19', () => {
    const totalKeys = Object.keys(DISPOSAL_POLICY_MAP).length;
    expect(totalKeys).toBe(21);
    const groups = groupDisposalModulesByStage('zh');
    expect(groups).toHaveLength(19);
    // 分组不丢 key：所有 key 的并集仍等于原 21 个 policy_key。
    const flattened = groups.flatMap((g) => g.keys).sort();
    expect(flattened).toEqual(Object.keys(DISPOSAL_POLICY_MAP).sort());
  });

  it('同阶段内不存在同名模块（重复显示已消除）', () => {
    const groups = groupDisposalModulesByStage('zh');
    const seen = new Set<string>();
    for (const g of groups) {
      const id = `${g.stage}:${g.moduleName}`;
      expect(seen.has(id), `duplicate module ${id}`).toBe(false);
      seen.add(id);
    }
  });
});
