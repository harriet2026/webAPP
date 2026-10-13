import { describe, expect, it } from 'vitest';
import { formatMetric, formatMetricBytes } from './format_metric';

describe('infrastructure metric display', () => {
  it('limits precision, groups counts and removes redundant zeros', () => {
    expect(formatMetric(12.3456789, 'en')).toBe('12.35');
    expect(formatMetric(12, 'en')).toBe('12');
    expect(formatMetric(12345, 'en', 0)).toBe('12,345');
    expect(formatMetric(23.56789, 'en', 1)).toBe('23.6');
    expect(formatMetric(1.23456, 'ru')).toBe('1,23');
  });
  it('distinguishes tiny nonzero readings, zero and missing values', () => {
    expect(formatMetric(0.000001, 'en')).toBe('<0.01');
    expect(formatMetric(0.02, 'en', 1)).toBe('<0.1');
    expect(formatMetric(0, 'en')).toBe('0');
    expect(formatMetric(-0, 'en')).toBe('0');
    for (const value of [null, undefined, NaN, Infinity]) expect(formatMetric(value, 'en')).toBe('—');
  });
  it('selects bounded capacity units and handles invalid capacities', () => {
    expect(formatMetricBytes(0, 'en')).toBe('0 B');
    expect(formatMetricBytes(1024, 'en')).toBe('1 KB');
    expect(formatMetricBytes(1.234567 * 1024 ** 3, 'en')).toBe('1.23 GB');
    expect(formatMetricBytes(0.001, 'en')).toBe('<0.01 B');
    expect(formatMetricBytes(1024 ** 7, 'en')).toBe('1,048,576 PB');
    expect(formatMetricBytes(-1, 'en')).toBe('—');
  });
});
