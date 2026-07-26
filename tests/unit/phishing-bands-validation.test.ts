import { describe, it, expect } from 'vitest';
import { validateBandsContiguous } from '@/components/phishing-detection/config/confidence-bands-editor';

describe('validateBandsContiguous', () => {
  it('rejects an empty band set', () => {
    expect(validateBandsContiguous([])).not.toBeNull();
  });

  it('rejects when the first band does not start at 0', () => {
    expect(
      validateBandsContiguous([
        { min: 10, max: 50 },
        { min: 50, max: 100 },
      ]),
    ).not.toBeNull();
  });

  it('rejects when the last band does not reach 100', () => {
    expect(
      validateBandsContiguous([
        { min: 0, max: 50 },
        { min: 50, max: 90 },
      ]),
    ).not.toBeNull();
  });

  it('rejects a gap', () => {
    expect(
      validateBandsContiguous([
        { min: 0, max: 40 },
        { min: 50, max: 100 },
      ]),
    ).not.toBeNull();
  });

  it('rejects an overlap', () => {
    expect(
      validateBandsContiguous([
        { min: 0, max: 60 },
        { min: 50, max: 100 },
      ]),
    ).not.toBeNull();
  });

  it('rejects min >= max inside a single band', () => {
    expect(
      validateBandsContiguous([
        { min: 0, max: 0 },
        { min: 0, max: 100 },
      ]),
    ).not.toBeNull();
  });

  it('accepts contiguous 0-100 coverage', () => {
    expect(
      validateBandsContiguous([
        { min: 0, max: 50 },
        { min: 50, max: 100 },
      ]),
    ).toBeNull();
  });

  it('accepts a 4-band split that touches both ends', () => {
    expect(
      validateBandsContiguous([
        { min: 0, max: 40 },
        { min: 40, max: 70 },
        { min: 70, max: 90 },
        { min: 90, max: 100 },
      ]),
    ).toBeNull();
  });
});
