import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import zh from '@/../messages/zh.json';
import { AuthSpoofingTagPanel } from './AuthSpoofingTagPanel';

describe('AuthSpoofingTagPanel', () => {
  it('marks a Chinese header name invalid while leaving a Chinese header value valid', () => {
    render(
      <NextIntlClientProvider locale="zh" messages={zh}>
        <AuthSpoofingTagPanel
          value={{
            tag_header_enabled: true,
            tag_header_name: '测试信头Key',
            tag_header_value: '测试信头Value',
          }}
          onChange={vi.fn()}
        />
      </NextIntlClientProvider>,
    );

    expect(screen.getByTestId('auth-spoofing-tag-header-name')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(screen.getByTestId('auth-spoofing-tag-header-name-error')).toHaveTextContent(
      '信头名称仅支持英文字母、数字和连字符，长度不超过64个字符',
    );
    expect(screen.getByTestId('auth-spoofing-tag-header-value')).not.toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  it('exposes stable subject-position selectors without changing selection behavior', () => {
    const onChange = vi.fn();
    render(
      <NextIntlClientProvider locale="zh" messages={zh}>
        <AuthSpoofingTagPanel
          value={{
            tag_subject_enabled: true,
            tag_subject_position: 'prefix',
            tag_subject_content: '[安全]',
          }}
          onChange={onChange}
        />
      </NextIntlClientProvider>,
    );

    const prefix = screen.getByTestId('auth-spoofing-tag-subject-position-prefix');
    const suffix = screen.getByTestId('auth-spoofing-tag-subject-position-suffix');
    expect(prefix).toHaveAttribute('role', 'radio');
    expect(suffix).toHaveAttribute('role', 'radio');
    expect(prefix).toHaveAttribute('aria-checked', 'true');
    expect(suffix).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(suffix);
    expect(onChange).toHaveBeenCalledWith({ tag_subject_position: 'suffix' });
  });
});
