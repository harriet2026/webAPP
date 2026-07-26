import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TagDeliveryPanel } from '@/components/security/similar-detection/TagDeliveryPanel';
import type { SimilarDetectionDirectionConfig } from '@/components/security/similar-detection/types';

// 与 sender-filter/recipient-status 等既有单测保持一致：next-intl 恒等翻译，
// 有 namespace 前缀原样返回 key（TagDeliveryPanel 用的是 useTranslations('similarDetection')）。
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

function baseConfig(overrides: Partial<SimilarDetectionDirectionConfig> = {}): SimilarDetectionDirectionConfig {
  return {
    observe_mode: false,
    window_minutes: 30,
    similarity_pct: 80,
    min_count: 10,
    action: 'mark-delivery',
    ...overrides,
  };
}

describe('TagDeliveryPanel', () => {
  it('两个标记开关默认关闭时，主题标记与信头标记的详情行都不渲染', () => {
    render(<TagDeliveryPanel value={baseConfig()} onChange={vi.fn()} />);
    expect(screen.getByTestId('similar-detection-tag-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('similar-detection-tag-subject-content')).toBeNull();
    expect(screen.queryByPlaceholderText('tagHeaderNamePlaceholder')).toBeNull();
    expect(screen.queryByPlaceholderText('tagHeaderValuePlaceholder')).toBeNull();
  });

  it('tag_subject_enabled=true 时展开主题标记：前后缀单选 + 内容输入框，回显已有值', () => {
    render(
      <TagDeliveryPanel
        value={baseConfig({ tag_subject_enabled: true, tag_subject_position: 'suffix', tag_subject_content: '[相似邮件]' })}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('similar-detection-tag-subject-content')).toHaveValue('[相似邮件]');
    expect(screen.getAllByRole('radio')).toHaveLength(2);
    const suffixRadio = screen.getAllByRole('radio')[1];
    expect(suffixRadio).toHaveAttribute('aria-checked', 'true');
  });

  it('tag_header_enabled=true 时展开信头标记：字段名/字段值两个输入框，回显已有值', () => {
    render(
      <TagDeliveryPanel
        value={baseConfig({ tag_header_enabled: true, tag_header_name: 'X-Similar-Tag', tag_header_value: 'matched' })}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByPlaceholderText('tagHeaderNamePlaceholder')).toHaveValue('X-Similar-Tag');
    expect(screen.getByPlaceholderText('tagHeaderValuePlaceholder')).toHaveValue('matched');
  });

  it('点击主题标记开关：onChange 收到 { tag_subject_enabled: true } patch', () => {
    const onChange = vi.fn();
    render(<TagDeliveryPanel value={baseConfig()} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('similar-detection-tag-subject-switch'));
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ tag_subject_enabled: true });
  });

  it('点击信头标记开关：onChange 收到 { tag_header_enabled: true } patch', () => {
    const onChange = vi.fn();
    render(<TagDeliveryPanel value={baseConfig()} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('similar-detection-tag-header-switch'));
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ tag_header_enabled: true });
  });

  it('修改主题标记内容输入框：onChange 收到 { tag_subject_content } patch', () => {
    const onChange = vi.fn();
    render(<TagDeliveryPanel value={baseConfig({ tag_subject_enabled: true })} onChange={onChange} />);
    fireEvent.change(screen.getByTestId('similar-detection-tag-subject-content'), { target: { value: '[命中]' } });
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ tag_subject_content: '[命中]' });
  });

  it('选择主题标记位置为后缀：onChange 收到 { tag_subject_position: "suffix" } patch', () => {
    const onChange = vi.fn();
    render(
      <TagDeliveryPanel value={baseConfig({ tag_subject_enabled: true, tag_subject_position: 'prefix' })} onChange={onChange} />,
    );
    fireEvent.click(screen.getAllByRole('radio')[1]);
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ tag_subject_position: 'suffix' });
  });

  it('修改信头字段名/字段值输入框：onChange 分别收到对应 patch', () => {
    const onChange = vi.fn();
    render(<TagDeliveryPanel value={baseConfig({ tag_header_enabled: true })} onChange={onChange} />);
    fireEvent.change(screen.getByPlaceholderText('tagHeaderNamePlaceholder'), { target: { value: 'X-Tag' } });
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ tag_header_name: 'X-Tag' });
    onChange.mockClear();
    fireEvent.change(screen.getByPlaceholderText('tagHeaderValuePlaceholder'), { target: { value: 'yes' } });
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ tag_header_value: 'yes' });
  });

  it('disabled=true 时开关/单选/输入框均禁用', () => {
    render(
      <TagDeliveryPanel
        value={baseConfig({ tag_subject_enabled: true, tag_header_enabled: true })}
        onChange={vi.fn()}
        disabled
      />,
    );
    expect(screen.getByTestId('similar-detection-tag-subject-switch')).toHaveAttribute('data-disabled');
    expect(screen.getByTestId('similar-detection-tag-header-switch')).toHaveAttribute('data-disabled');
    expect(screen.getByTestId('similar-detection-tag-subject-content')).toBeDisabled();
    expect(screen.getByPlaceholderText('tagHeaderNamePlaceholder')).toBeDisabled();
  });
});
