import { describe, it, expect } from 'vitest';
import { segmentCoverageIssue, fixSegmentCoverage } from '@/types/intent-engine';
import type { ThresholdSegment } from '@/types/intent-engine';

describe('segmentCoverageIssue (GT-12171 D-06 间隙/重叠区分校验)', () => {
  it('完整覆盖 [0,1] 返回 null', () => {
    const segs: ThresholdSegment[] = [
      { min: 0, max: 0.3, action: 'proceed' },
      { min: 0.3, max: 0.7, action: 'quarantine' },
      { min: 0.7, max: 1, action: 'discard' },
    ];
    expect(segmentCoverageIssue(segs)).toBeNull();
  });

  it('中间缺口返回 gap', () => {
    const segs: ThresholdSegment[] = [
      { min: 0, max: 0.3, action: 'proceed' },
      { min: 0.5, max: 1, action: 'discard' },
    ];
    expect(segmentCoverageIssue(segs)).toBe('gap');
  });

  it('相邻区间重叠返回 overlap（不能再误报为未覆盖）', () => {
    const segs: ThresholdSegment[] = [
      { min: 0, max: 0.5, action: 'proceed' },
      { min: 0.3, max: 1, action: 'discard' },
    ];
    expect(segmentCoverageIssue(segs)).toBe('overlap');
  });

  it('空集 / undefined / 起点终点缺口均为 gap', () => {
    expect(segmentCoverageIssue([])).toBe('gap');
    expect(segmentCoverageIssue(undefined)).toBe('gap');
    expect(segmentCoverageIssue([{ min: 0.2, max: 1, action: 'discard' }])).toBe('gap');
    expect(segmentCoverageIssue([{ min: 0, max: 0.8, action: 'discard' }])).toBe('gap');
  });

  it('容差内的边界抖动不算问题', () => {
    const segs: ThresholdSegment[] = [
      { min: 0, max: 0.3005, action: 'proceed' },
      { min: 0.3, max: 1, action: 'discard' },
    ];
    expect(segmentCoverageIssue(segs)).toBeNull();
  });
});

describe('fixSegmentCoverage (GT-12171 D-06 智能填充统一修复)', () => {
  it('补齐中间缺口与起点终点', () => {
    const segs: ThresholdSegment[] = [
      { min: 0.1, max: 0.3, action: 'proceed' },
      { min: 0.5, max: 0.9, action: 'discard' },
    ];
    const fixed = fixSegmentCoverage(segs);
    expect(fixed).toEqual([
      { min: 0, max: 0.3, action: 'proceed' },
      { min: 0.3, max: 1, action: 'discard' },
    ]);
    expect(segmentCoverageIssue(fixed)).toBeNull();
  });

  it('钳掉重叠：后一段起点收到前一段终点（旧实现对重叠无效）', () => {
    const segs: ThresholdSegment[] = [
      { min: 0, max: 0.5, action: 'proceed' },
      { min: 0.3, max: 1, action: 'discard' },
    ];
    const fixed = fixSegmentCoverage(segs);
    expect(fixed).toEqual([
      { min: 0, max: 0.5, action: 'proceed' },
      { min: 0.5, max: 1, action: 'discard' },
    ]);
    expect(segmentCoverageIssue(fixed)).toBeNull();
  });

  it('被完全吞没的段丢弃', () => {
    const segs: ThresholdSegment[] = [
      { min: 0, max: 1, action: 'proceed' },
      { min: 0.2, max: 0.6, action: 'discard' },
    ];
    expect(fixSegmentCoverage(segs)).toEqual([{ min: 0, max: 1, action: 'proceed' }]);
  });

  it('空集回落为默认单段全覆盖', () => {
    expect(fixSegmentCoverage([])).toEqual([{ min: 0, max: 1, action: 'quarantine' }]);
  });

  it('已合法的区间原样保留', () => {
    const segs: ThresholdSegment[] = [
      { min: 0, max: 0.4, action: 'quarantine' },
      { min: 0.4, max: 1, action: 'discard' },
    ];
    expect(fixSegmentCoverage(segs)).toEqual(segs);
  });
});
