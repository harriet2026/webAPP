import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { LinkFilters, type LinkFilterValues } from './link-filters';

vi.mock('next-intl', () => ({
  useLocale: () => 'zh',
  useTranslations: () => {
    const translate = (key: string) => key;
    translate.raw = (key: string) => key === 'linkLogs.aiSuggestions'
      ? ['本地黑名单命中的点击', '告警后仍继续访问的链接', '钓鱼邮件智能体判定的钓鱼链接']
      : [];
    return translate;
  },
}));

const VALUES: LinkFilterValues = {
  messageId: '',
  clicker: '',
  sender: '',
  srcUrl: '',
  triggerStage: 'cloud_intel',
  finalResult: 'passed',
  userAction: 'abandoned',
  clickSource: '',
  clickDate: '',
};

describe('LinkFilters AI suggestions', () => {
  it.each([
    [1, '本地黑名单命中的点击', { triggerStage: 'local_blacklist', finalResult: '', userAction: '' }],
    [2, '告警后仍继续访问的链接', { triggerStage: '', finalResult: 'alerted', userAction: 'proceeded' }],
    [3, '钓鱼邮件智能体判定的钓鱼链接', { triggerStage: 'phishing_agent', finalResult: '', userAction: '' }],
  ])('maps suggestion %i to a structured query', (index, text, expectedFilter) => {
    const onChange = vi.fn();
    render(
      <LinkFilters
        values={VALUES}
        onChange={onChange}
        onSearch={vi.fn()}
        onReset={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId(`link-logs-ai-suggestion-${index}`));

    expect(screen.getByTestId('link-logs-ai-input')).toHaveValue(text);
    expect(onChange).toHaveBeenCalledWith(expectedFilter);
  });
});
