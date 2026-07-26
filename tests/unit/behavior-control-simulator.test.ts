import { describe, expect, it } from 'vitest';
import { simulateBehaviorControl } from '@/lib/behavior-control-simulator';

describe('simulateBehaviorControl', () => {
  it('当唯一发信 IP 数达到 ip_count 阈值时命中', () => {
    expect(simulateBehaviorControl({
      dimensionA: 'ip_count',
      thresholdA: 3,
      inputs: { uniqueSenderIPCount: 3, mailCount: 50, recipientCount: 30 },
    })).toEqual({ condition: 'A', dimension: 'ip_count', count: 3, threshold: 3 });
  });

  it('当唯一发信 IP 数低于 ip_count 阈值时不命中', () => {
    expect(simulateBehaviorControl({
      dimensionA: 'ip_count',
      thresholdA: 3,
      inputs: { uniqueSenderIPCount: 2, mailCount: 50, recipientCount: 30 },
    })).toBeNull();
  });

  it('主条件未命中时，使用 ip_count 的 OR 条件仍可命中', () => {
    expect(simulateBehaviorControl({
      dimensionA: 'mail_count',
      thresholdA: 100,
      orEnabled: true,
      dimensionB: 'ip_count',
      thresholdB: 2,
      inputs: { uniqueSenderIPCount: 2, mailCount: 50, recipientCount: 30 },
    })).toEqual({ condition: 'B', dimension: 'ip_count', count: 2, threshold: 2 });
  });
});
