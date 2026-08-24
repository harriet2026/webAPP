import { describe, expect, it } from 'vitest';
import { applyCopyToDirections, markDirty, anyDirty, NO_DIRTY } from './copy-dirty';
import { createDefaultIntentEngineConfig } from './defaults';
import type { IntentDirection } from '@/types/intent-engine';

// GT-11753 / GT-12208：html_spec 层级5（v2 / 2026-07-17，差异 D-07）要求
// 「复制到其他方向」按方向标脏，且只对配置**实际变化**的目标方向标脏。
// v1 的无条件 setDirty(true) 会在目标本就一致时误报未保存（11753 的原始诉求），
// 而完全不标脏又会让复制结果无法保存（12208）。两者都由本组用例锁住。
describe('applyCopyToDirections (GT-11753 / GT-12208)', () => {
  const base = () => createDefaultIntentEngineConfig().directions;

  it('目标方向与源一致时不标脏（v1 误报「配置已修改未保存」的回归用例）', () => {
    const prev = base();
    // 缺省配置下 send 与 internal 同构，复制不应产生变化。
    const { changed, directions } = applyCopyToDirections(prev, 'send', ['internal']);
    expect(changed).toEqual([]);
    // 无变化时保持原引用，避免无谓重渲染。
    expect(directions).toBe(prev);
  });

  it('目标方向确有差异时标脏，使复制结果可被保存（GT-12208）', () => {
    const prev = base();
    // 制造差异：把 send 方向某意图关掉。
    prev.send.spam.enabled = !prev.send.spam.enabled;

    const { changed, directions } = applyCopyToDirections(prev, 'internal', ['send']);
    expect(changed).toEqual(['send']);
    expect(directions.send).toEqual(prev.internal);
  });

  it('只标脏真正变化的方向，不波及其他方向', () => {
    const prev = base();
    prev.send.spam.enabled = !prev.send.spam.enabled;

    // internal 与源一致、send 有差异 → 只有 send 进 changed。
    const { changed } = applyCopyToDirections(prev, 'internal', ['send', 'internal']);
    expect(changed).toEqual(['send']);
  });

  it('复制到自身被忽略，不标脏', () => {
    const prev = base();
    const { changed } = applyCopyToDirections(prev, 'receive', ['receive']);
    expect(changed).toEqual([]);
  });

  it('从 receive 复制时保留 proceed 语义', () => {
    const prev = base();
    const { directions, changed } = applyCopyToDirections(prev, 'receive', ['send']);
    expect(changed).toEqual(['send']);
    expect(directions.send).toEqual(prev.receive);
  });

  it('复制产生的是深拷贝，后续改目标不串改源', () => {
    const prev = base();
    prev.send.spam.enabled = !prev.send.spam.enabled;
    const { directions } = applyCopyToDirections(prev, 'internal', ['send']);
    directions.send.spam.enabled = !directions.send.spam.enabled;
    expect(directions.send.spam.enabled).not.toBe(directions.internal.spam.enabled);
  });
});

describe('markDirty / anyDirty', () => {
  it('空变化列表保持原对象引用', () => {
    expect(markDirty(NO_DIRTY, [])).toBe(NO_DIRTY);
  });

  it('按方向累积标脏', () => {
    const d = markDirty(NO_DIRTY, ['send', 'internal'] as IntentDirection[]);
    expect(d).toEqual({ receive: false, send: true, internal: true });
    expect(anyDirty(d)).toBe(true);
  });

  it('全部未脏时 anyDirty 为 false', () => {
    expect(anyDirty(NO_DIRTY)).toBe(false);
  });
});
