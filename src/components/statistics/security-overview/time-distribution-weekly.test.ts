import { describe, it, expect } from 'vitest';
import { padWeeklyMatrix, WEEKLY_MATRIX_DAYS, WEEKLY_MATRIX_HOURS } from './weekly-matrix';

// Simulate the Map building logic from TimeDistributionCard
function buildWeeklyMap(matrix: Array<{ day: number; hour: number; value: number }>) {
  const map = new Map<string, number>();
  for (const cell of matrix) {
    map.set(`${cell.day}-${cell.hour}`, cell.value);
  }
  return map;
}

describe('weekly heatmap matrix processing', () => {
  it('builds lookup map from weekly_matrix data', () => {
    const matrix = [
      { day: 0, hour: 9, value: 42 },
      { day: 3, hour: 14, value: 7 },
    ];
    const map = buildWeeklyMap(matrix);
    expect(map.get('0-9')).toBe(42);
    expect(map.get('3-14')).toBe(7);
    expect(map.get('1-0')).toBeUndefined();
  });

  it('empty matrix produces empty map', () => {
    expect(buildWeeklyMap([]).size).toBe(0);
  });

  it('max value computation guards against divide-by-zero', () => {
    const values = [0, 0, 0];
    const maxValue = Math.max(...values, 1); // the Math.max(..., 1) guard
    expect(maxValue).toBe(1);
  });

  it('opacity floor prevents invisible cells', () => {
    const value = 0;
    const maxValue = 10;
    const opacity = Math.max(value / maxValue, 0.05);
    expect(opacity).toBe(0.05);
  });
});

// GT-12587：上面那组用例是"复刻组件里的 Map 构造逻辑"的副本——改坏组件它也
// 不会红。下面这组直接测组件真正 import 的那个模块。
describe('周内矩阵补齐 (GT-12587)', () => {
  it('稀疏输入补成完整 7×24，缺的格子补 0', () => {
    const padded = padWeeklyMatrix([
      { day: 1, hour: 9, value: 5 },
      { day: 3, hour: 14, value: 2 },
    ]);
    expect(padded).toHaveLength(WEEKLY_MATRIX_DAYS * WEEKLY_MATRIX_HOURS);

    const seen = new Map<string, number>();
    for (const c of padded) {
      const key = `${c.day}:${c.hour}`;
      expect(seen.has(key), `重复格子 ${key}`).toBe(false);
      seen.set(key, c.value);
    }
    // 覆盖全笛卡尔积——只断言几个具体格子的话，补零只补了一部分也能过。
    for (let d = 0; d < WEEKLY_MATRIX_DAYS; d += 1) {
      for (let h = 0; h < WEEKLY_MATRIX_HOURS; h += 1) {
        expect(seen.has(`${d}:${h}`), `缺格子 ${d}:${h}`).toBe(true);
      }
    }
    expect(seen.get('1:9')).toBe(5);
    expect(seen.get('3:14')).toBe(2);
    expect(seen.get('0:0')).toBe(0);
  });

  it('空输入也产出完整网格（全 0），而不是空数组', () => {
    const padded = padWeeklyMatrix([]);
    expect(padded).toHaveLength(168);
    expect(padded.every((c) => c.value === 0)).toBe(true);
  });

  it('越界格子被丢弃而不是钳位（钳位会静默污染真实格子）', () => {
    const padded = padWeeklyMatrix([
      { day: 7, hour: 0, value: 9 },
      { day: -1, hour: 3, value: 9 },
      { day: 2, hour: 24, value: 9 },
    ]);
    expect(padded).toHaveLength(168);
    expect(padded.every((c) => c.value === 0)).toBe(true);
  });
});
