import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// 与本目录既有组件测试一致：把 next-intl 打桩成回显 key，只断言结构，不断言译文。
vi.mock('next-intl', () => ({
  useTranslations: (ns: string) => (key: string) => `${ns}.${key}`,
}));

import { IntentCard } from './IntentCard';
import type { IntentSingleConfig } from '@/types/intent-engine';

function renderCard(value: IntentSingleConfig) {
  render(
    <IntentCard
      intent="porn_gambling"
      direction="receive"
      value={value}
      expanded={false}
      engineEnabled
      onToggleExpand={() => {}}
      onChange={() => {}}
    />,
  );
}

describe('IntentCard 卡头动作 Badge (GT-12171 D-03)', () => {
  it('分段阈值模式：卡头显示区间处置摘要（各段动作按区间去重）', () => {
    renderCard({
      enabled: true,
      action: 'discard',
      detection_mode: 'threshold',
      threshold_segments: [
        { min: 0, max: 0.3, action: 'audit' },
        { min: 0.3, max: 0.6, action: 'quarantine' },
        { min: 0.6, max: 1, action: 'discard' },
      ],
    });
    const summary = screen.getByTestId('ie-action-summary-receive-porn_gambling');
    // next-intl 被打桩为回显 key，动作标签为 intentEngine.action.<action>
    expect(summary.textContent).toBe(
      'intentEngine.action.audit · intentEngine.action.quarantine · intentEngine.action.discard',
    );
    // 阈值模式下不再渲染分类模式的单一动作 Badge。
    expect(screen.queryByTestId('ie-action-badge-receive-porn_gambling')).toBeNull();
  });

  it('分类模式：卡头仍显示单一动作 Badge，不显示区间摘要', () => {
    renderCard({
      enabled: true,
      action: 'discard',
      detection_mode: 'classification',
    });
    expect(screen.getByTestId('ie-action-badge-receive-porn_gambling').textContent).toBe(
      'intentEngine.action.discard',
    );
    expect(screen.queryByTestId('ie-action-summary-receive-porn_gambling')).toBeNull();
  });
});
