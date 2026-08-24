import { createElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DirectionCard } from '@/components/security/similar-detection/DirectionCard';
import type { SimilarDetectionDirectionConfig } from '@/components/security/similar-detection/types';

// 与 tag-delivery-panel 等既有单测保持一致：next-intl 恒等翻译，有 namespace 前缀原样返回 key。
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...props }: { href: string; children: ReactNode; [k: string]: unknown }) =>
    createElement('a', { href, ...props }, children),
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

describe('DirectionCard', () => {
  it('detectionType=similar_email 时渲染相似度 Slider', () => {
    render(
      <DirectionCard direction="receive" detectionType="similar_email" value={baseConfig()} onChange={vi.fn()} onSync={vi.fn()} />,
    );
    expect(screen.getByText('similarityThreshold')).toBeInTheDocument();
    expect(screen.getByRole('slider')).toBeInTheDocument();
  });

  it('detectionType=same_subject 时不渲染相似度 Slider', () => {
    render(
      <DirectionCard direction="receive" detectionType="same_subject" value={baseConfig()} onChange={vi.fn()} onSync={vi.fn()} />,
    );
    expect(screen.queryByText('similarityThreshold')).toBeNull();
    expect(screen.queryByRole('slider')).toBeNull();
  });

  it('观察模式开启：动作 Select disabled + 观察 Badge + 查看观察日志链接出现，卡片呈 amber 边框', () => {
    render(
      <DirectionCard
        direction="send"
        detectionType="similar_email"
        value={baseConfig({ observe_mode: true })}
        onChange={vi.fn()}
        onSync={vi.fn()}
      />,
    );
    const card = screen.getByTestId('similar-detection-card-send');
    expect(card.className).toContain('border-amber-300');
    expect(screen.getByTestId('similar-detection-action-send')).toBeDisabled();
    expect(screen.getByText('viewObserveLogs')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /viewObserveLogs/ })).toHaveAttribute(
      'href',
      '/logs/email?similar=matched&direction=send',
    );
    // 观察 Badge 在头部单独渲染一次（不包括观察行的普通文字）
    expect(screen.getAllByText('observeMode').length).toBeGreaterThanOrEqual(2);
  });

  it('观察模式关闭：动作 Select 可用，无日志链接，卡片呈 blue 边框', () => {
    render(
      <DirectionCard
        direction="internal"
        detectionType="similar_email"
        value={baseConfig({ observe_mode: false })}
        onChange={vi.fn()}
        onSync={vi.fn()}
      />,
    );
    const card = screen.getByTestId('similar-detection-card-internal');
    expect(card.className).toContain('border-blue-200');
    expect(screen.getByTestId('similar-detection-action-internal')).not.toBeDisabled();
    expect(screen.queryByText('viewObserveLogs')).toBeNull();
  });

  it('检测窗口输入框：输入 "0" 取整钳制为 1', () => {
    const onChange = vi.fn();
    render(
      <DirectionCard direction="receive" detectionType="similar_email" value={baseConfig({ window_minutes: 30 })} onChange={onChange} onSync={vi.fn()} />,
    );
    const inputs = screen.getAllByRole('spinbutton');
    // 第一个数字输入为检测窗口
    fireEvent.change(inputs[0], { target: { value: '0' } });
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ window_minutes: 1 });
  });

  it('触发数量输入框：输入 "7.8" 四舍五入为 8', () => {
    const onChange = vi.fn();
    render(
      <DirectionCard direction="receive" detectionType="same_subject" value={baseConfig({ min_count: 10 })} onChange={onChange} onSync={vi.fn()} />,
    );
    // same_subject 无 Slider，数字输入依次为：窗口、触发数量
    const inputs = screen.getAllByRole('spinbutton');
    fireEvent.change(inputs[1], { target: { value: '7.8' } });
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ min_count: 8 });
  });

  it('action=accept 且非观察态：渲染 TagDeliveryPanel', () => {
    render(
      <DirectionCard
        direction="internal"
        detectionType="similar_email"
        value={baseConfig({ action: 'accept', observe_mode: false })}
        onChange={vi.fn()}
        onSync={vi.fn()}
      />,
    );
    expect(screen.getByTestId('similar-detection-tag-panel')).toBeInTheDocument();
  });

  it('action=accept 但观察态开启：TagDeliveryPanel 不渲染', () => {
    render(
      <DirectionCard
        direction="internal"
        detectionType="similar_email"
        value={baseConfig({ action: 'accept', observe_mode: true })}
        onChange={vi.fn()}
        onSync={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('similar-detection-tag-panel')).toBeNull();
  });

  it('点击"同步到其他方向"按钮触发 onSync', () => {
    const onSync = vi.fn();
    render(
      <DirectionCard direction="receive" detectionType="similar_email" value={baseConfig()} onChange={vi.fn()} onSync={onSync} />,
    );
    fireEvent.click(screen.getByTestId('similar-detection-sync-receive'));
    expect(onSync).toHaveBeenCalledOnce();
  });

  it('disabled=true 时同步按钮与观察开关均禁用', () => {
    render(
      <DirectionCard
        direction="receive"
        detectionType="similar_email"
        value={baseConfig()}
        onChange={vi.fn()}
        onSync={vi.fn()}
        disabled
      />,
    );
    expect(screen.getByTestId('similar-detection-sync-receive')).toBeDisabled();
    expect(screen.getByTestId('similar-detection-observe-receive')).toHaveAttribute('data-disabled');
  });
});
