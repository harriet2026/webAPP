import { describe, expect, it } from 'vitest';
import { computeEffectiveness } from './effectiveness';

describe('computeEffectiveness', () => {
  it('null fp_rate scores accuracy at full marks (40)', () => {
    const r = computeEffectiveness({
      hits: 0,
      fpRate: null,
      enabled: false,
      hasEmptyValueCondition: true,
      hasGreyedField: false,
    });
    expect(r.accuracy).toBe(40);
    expect(r.activity).toBe(0);
    expect(r.health).toBe(0);
    expect(r.score).toBe(40);
  });

  it('fp_rate=0.5 halves accuracy to 20', () => {
    const r = computeEffectiveness({
      hits: 0,
      fpRate: 0.5,
      enabled: false,
      hasEmptyValueCondition: false,
      hasGreyedField: false,
    });
    expect(r.accuracy).toBe(20);
  });

  it('fp_rate=1 (all reversed) zeroes accuracy', () => {
    const r = computeEffectiveness({
      hits: 0,
      fpRate: 1,
      enabled: false,
      hasEmptyValueCondition: false,
      hasGreyedField: false,
    });
    expect(r.accuracy).toBe(0);
  });

  it('activity caps at 40 once hits >= 30 (min(1, hits/30) clamp)', () => {
    const at30 = computeEffectiveness({ hits: 30, fpRate: null, enabled: false, hasEmptyValueCondition: false, hasGreyedField: false });
    const at60 = computeEffectiveness({ hits: 60, fpRate: null, enabled: false, hasEmptyValueCondition: false, hasGreyedField: false });
    expect(at30.activity).toBe(40);
    expect(at60.activity).toBe(40);
  });

  it('activity scales linearly below the 30-hit cap', () => {
    const r = computeEffectiveness({ hits: 15, fpRate: null, enabled: false, hasEmptyValueCondition: false, hasGreyedField: false });
    expect(r.activity).toBe(20); // 15/30 * 40
  });

  it('health branch: enabled + no empty condition + no greyed field -> 20', () => {
    const r = computeEffectiveness({
      hits: 30,
      fpRate: 0,
      enabled: true,
      hasEmptyValueCondition: false,
      hasGreyedField: false,
    });
    expect(r.health).toBe(20);
    expect(r.score).toBe(100); // 40 + 40 + 20
  });

  it('health branch: disabled rule -> 0 even if conditions are otherwise healthy', () => {
    const r = computeEffectiveness({
      hits: 30,
      fpRate: 0,
      enabled: false,
      hasEmptyValueCondition: false,
      hasGreyedField: false,
    });
    expect(r.health).toBe(0);
  });

  it('health branch: an empty-value condition alone zeroes health', () => {
    const r = computeEffectiveness({
      hits: 30,
      fpRate: 0,
      enabled: true,
      hasEmptyValueCondition: true,
      hasGreyedField: false,
    });
    expect(r.health).toBe(0);
  });

  it('health branch: a greyed-out field alone zeroes health', () => {
    const r = computeEffectiveness({
      hits: 30,
      fpRate: 0,
      enabled: true,
      hasEmptyValueCondition: false,
      hasGreyedField: true,
    });
    expect(r.health).toBe(0);
  });

  it('score rounds fractional totals to the nearest integer', () => {
    // hits=10 -> activity = 10/30*40 = 13.333...; fpRate=0.1 -> accuracy = 36; health=0
    const r = computeEffectiveness({ hits: 10, fpRate: 0.1, enabled: false, hasEmptyValueCondition: false, hasGreyedField: false });
    expect(r.activity).toBeCloseTo(13.333, 2);
    expect(r.accuracy).toBe(36);
    expect(r.score).toBe(Math.round(13.333 + 36));
    expect(r.score).toBe(49);
  });

  it('negative/non-finite hits are clamped to 0 (defensive, not a real backend value)', () => {
    const r = computeEffectiveness({ hits: -5, fpRate: null, enabled: false, hasEmptyValueCondition: false, hasGreyedField: false });
    expect(r.activity).toBe(0);
  });

  it('score maxes at 100 when every branch is perfect', () => {
    const r = computeEffectiveness({
      hits: 1000,
      fpRate: 0,
      enabled: true,
      hasEmptyValueCondition: false,
      hasGreyedField: false,
    });
    expect(r.score).toBe(100);
  });
});
