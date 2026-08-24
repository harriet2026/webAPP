import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AggregateCard } from '@/components/security/similar-detection/AggregateCard';
import type { SimilarDetectionDirectionConfig } from '@/components/security/similar-detection/types';

// 与 tag-delivery-panel 等既有单测保持一致：next-intl 恒等翻译，有 namespace 前缀原样返回 key。
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

function baseConfig(overrides: Partial<SimilarDetectionDirectionConfig> = {}): SimilarDetectionDirectionConfig {
  return {
    observe_mode: false,
    window_minutes: 30,
    similarity_pct: 80,
    min_count: 10,
    action: 'quarantine',
    ...overrides,
  };
}

describe('AggregateCard', () => {
  it('字段区使用 grid-cols-2 min-[1366px]:grid-cols-4 响应式栅格', () => {
    render(<AggregateCard detectionType="similar_email" value={baseConfig()} onChange={vi.fn()} />);
    const card = screen.getByTestId('similar-detection-card-aggregate');
    const grid = card.querySelector('.grid');
    expect(grid).not.toBeNull();
    // 布局改版：默认 2 列,≥1366px 展开为 4 列(旧 grid-cols-1/md/lg 断点已弃用)。
    expect(grid!.className).toContain('grid-cols-2');
    expect(grid!.className).toContain('min-[1366px]:grid-cols-4');
  });

  it('无同步按钮', () => {
    render(<AggregateCard detectionType="similar_email" value={baseConfig()} onChange={vi.fn()} />);
    expect(screen.queryByText('syncToOthers')).toBeNull();
  });

  it('观察模式开启时也不出现查看观察日志链接', () => {
    render(<AggregateCard detectionType="similar_email" value={baseConfig({ observe_mode: true })} onChange={vi.fn()} />);
    expect(screen.queryByText('viewObserveLogs')).toBeNull();
    expect(screen.getByTestId('similar-detection-action-aggregate')).toBeDisabled();
  });

  it('触发动作 Select 全宽 w-full', () => {
    render(<AggregateCard detectionType="similar_email" value={baseConfig()} onChange={vi.fn()} />);
    expect(screen.getByTestId('similar-detection-action-aggregate').className).toContain('w-full');
  });

  it('detectionType=similar_email 时渲染相似度 Slider，same_subject 时不渲染', () => {
    const { rerender } = render(<AggregateCard detectionType="similar_email" value={baseConfig()} onChange={vi.fn()} />);
    expect(screen.getByRole('slider')).toBeInTheDocument();
    rerender(<AggregateCard detectionType="same_subject" value={baseConfig()} onChange={vi.fn()} />);
    expect(screen.queryByRole('slider')).toBeNull();
  });

  it('检测窗口输入框：输入 "0" 取整钳制为 1', () => {
    const onChange = vi.fn();
    render(<AggregateCard detectionType="similar_email" value={baseConfig({ window_minutes: 30 })} onChange={onChange} />);
    const inputs = screen.getAllByRole('spinbutton');
    fireEvent.change(inputs[0], { target: { value: '0' } });
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ window_minutes: 1 });
  });

  it('action=accept 且非观察态：TagDeliveryPanel 渲染在栅格下方', () => {
    render(<AggregateCard detectionType="similar_email" value={baseConfig({ action: 'accept' })} onChange={vi.fn()} />);
    expect(screen.getByTestId('similar-detection-tag-panel')).toBeInTheDocument();
  });

  it('action=accept 但观察态开启：TagDeliveryPanel 不渲染', () => {
    render(
      <AggregateCard
        detectionType="similar_email"
        value={baseConfig({ action: 'accept', observe_mode: true })}
        onChange={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('similar-detection-tag-panel')).toBeNull();
  });
});
