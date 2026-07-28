import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// 与本目录既有组件测试一致：把 next-intl 打桩成回显 key，只断言结构，不断言译文。
vi.mock('next-intl', () => ({
  useTranslations: (ns: string) => {
    const t = (key: string) => `${ns}.${key}`;
    return t;
  },
}));

import { ThresholdSegmentConfig } from './ThresholdSegmentConfig';
import type { ThresholdSegment } from '@/types/intent-engine';

function renderConfig(segments: ThresholdSegment[]) {
  render(
    <ThresholdSegmentConfig
      segments={segments}
      onChange={() => {}}
      direction="receive"
    />,
  );
}

describe('ThresholdSegmentConfig 覆盖问题警告 (GT-12171 D-06)', () => {
  it('重叠区间：警告显示 overlapWarning，而不是误导性的 gapWarning', () => {
    renderConfig([
      { min: 0, max: 0.5, action: 'accept' },
      { min: 0.3, max: 1, action: 'reject' },
    ]);
    expect(screen.getByTestId('ie-coverage-warning').textContent).toContain(
      'intentEngine.threshold.overlapWarning',
    );
  });

  it('缺口区间：警告仍显示 gapWarning', () => {
    renderConfig([
      { min: 0, max: 0.3, action: 'accept' },
      { min: 0.5, max: 1, action: 'reject' },
    ]);
    expect(screen.getByTestId('ie-coverage-warning').textContent).toContain(
      'intentEngine.threshold.gapWarning',
    );
  });

  it('完整覆盖：不渲染警告', () => {
    renderConfig([
      { min: 0, max: 0.5, action: 'accept' },
      { min: 0.5, max: 1, action: 'reject' },
    ]);
    expect(screen.queryByTestId('ie-coverage-warning')).toBeNull();
  });
});
