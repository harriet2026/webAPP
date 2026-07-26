import { describe, it, expect } from 'vitest';
import { isValidLimitValue } from './limit-value';

// GT-12198: 附件数量上限接受 0 且无字段错误，与「只允许 -1 或正整数」的约束不一致。
describe('isValidLimitValue (GT-12198)', () => {
  it('rejects 0 (the reported defect)', () => {
    expect(isValidLimitValue(0, true)).toBe(false);
    expect(isValidLimitValue(0, false)).toBe(false);
  });

  it('accepts -1 only where unlimited is allowed', () => {
    expect(isValidLimitValue(-1, true)).toBe(true);
    expect(isValidLimitValue(-1, false)).toBe(false);
  });

  it('accepts positive integers', () => {
    expect(isValidLimitValue(1, true)).toBe(true);
    expect(isValidLimitValue(10, false)).toBe(true);
  });

  it('rejects other negatives', () => {
    expect(isValidLimitValue(-2, true)).toBe(false);
    expect(isValidLimitValue(-5, false)).toBe(false);
  });

  it('rejects non-integers and non-numerics', () => {
    expect(isValidLimitValue(1.5, true)).toBe(false);
    expect(isValidLimitValue(NaN, true)).toBe(false);
    expect(isValidLimitValue('abc', true)).toBe(false);
    expect(isValidLimitValue('', true)).toBe(false);
  });

  it('accepts numeric strings that are positive integers (input elements yield strings)', () => {
    expect(isValidLimitValue('10', false)).toBe(true);
    expect(isValidLimitValue('-1', true)).toBe(true);
    expect(isValidLimitValue('0', true)).toBe(false);
  });
});
