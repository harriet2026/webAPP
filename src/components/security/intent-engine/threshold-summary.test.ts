import { describe, it, expect } from 'vitest';
import { thresholdActionSummary } from '@/types/intent-engine';
import type { ThresholdSegment } from '@/types/intent-engine';

describe('thresholdActionSummary (GT-12171 D-03 区间处置摘要)', () => {
  it('按区间升序返回各段动作，accept 归一为 proceed', () => {
    const segs: ThresholdSegment[] = [
      { min: 0, max: 0.3, action: 'accept' },
      { min: 0.3, max: 0.7, action: 'quarantine' },
      { min: 0.7, max: 1, action: 'discard' },
    ];
    expect(thresholdActionSummary(segs)).toEqual(['proceed', 'quarantine', 'discard']);
  });

  it('乱序输入按 min 排序', () => {
    const segs: ThresholdSegment[] = [
      { min: 0.7, max: 1, action: 'discard' },
      { min: 0, max: 0.3, action: 'audit' },
      { min: 0.3, max: 0.7, action: 'quarantine' },
    ];
    expect(thresholdActionSummary(segs)).toEqual(['audit', 'quarantine', 'discard']);
  });

  it('相同动作按出现顺序去重', () => {
    const segs: ThresholdSegment[] = [
      { min: 0, max: 0.5, action: 'discard' },
      { min: 0.5, max: 1, action: 'discard' },
    ];
    expect(thresholdActionSummary(segs)).toEqual(['discard']);
  });

  it('空/undefined 返回空数组', () => {
    expect(thresholdActionSummary([])).toEqual([]);
    expect(thresholdActionSummary(undefined)).toEqual([]);
  });
});
