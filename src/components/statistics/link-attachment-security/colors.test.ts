import { describe, it, expect } from 'vitest';
import {
  severityLevel,
  linkDetectionRateLevel,
  attachmentDetectionRateLevel,
  blockRateLevel,
} from './colors';

// spec §4.8 threshold rules. These pure helpers back the KPI card colors and the
// detail-table 拦截率 dot, so the boundary behavior is asserted here rather than
// by rendering the components (which the inline closures previously prevented).

describe('severityLevel', () => {
  it('classifies against inclusive lower bounds', () => {
    expect(severityLevel(20, 15, 5)).toBe('high');
    expect(severityLevel(15, 15, 5)).toBe('high'); // boundary is inclusive
    expect(severityLevel(14.9, 15, 5)).toBe('mid');
    expect(severityLevel(5, 15, 5)).toBe('mid'); // boundary is inclusive
    expect(severityLevel(4.9, 15, 5)).toBe('low');
    expect(severityLevel(0, 15, 5)).toBe('low');
  });
});

describe('linkDetectionRateLevel — ≥15 high / 5–15 mid / <5 low', () => {
  it.each([
    [15, 'high'],
    [30, 'high'],
    [14.9, 'mid'],
    [5, 'mid'],
    [4.9, 'low'],
    [0, 'low'],
  ] as const)('rate %d → %s', (rate, level) => {
    expect(linkDetectionRateLevel(rate)).toBe(level);
  });
});

describe('attachmentDetectionRateLevel — ≥5 high / 1–5 mid / <1 low', () => {
  it.each([
    [5, 'high'],
    [9, 'high'],
    [4.9, 'mid'],
    [1, 'mid'],
    [0.9, 'low'],
    [0, 'low'],
  ] as const)('rate %d → %s', (rate, level) => {
    expect(attachmentDetectionRateLevel(rate)).toBe(level);
  });
});

describe('blockRateLevel — ≥97 high / 95–97 mid / <95 low', () => {
  it.each([
    [97, 'high'],
    [100, 'high'],
    [96.9, 'mid'],
    [95, 'mid'],
    [94.9, 'low'],
    [0, 'low'],
  ] as const)('rate %d → %s', (rate, level) => {
    expect(blockRateLevel(rate)).toBe(level);
  });
});
