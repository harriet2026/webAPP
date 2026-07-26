import { describe, it, expect } from 'vitest';

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
