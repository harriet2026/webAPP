import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';
import zh from '../../../messages/zh.json';
import { RuleExecutionWarning } from './RuleExecutionWarning';

describe('RuleExecutionWarning', () => {
  it('shows an actionable warning for a rule blocked by the server', () => {
    render(<NextIntlClientProvider locale="zh" messages={zh}>
      <RuleExecutionWarning reason="retired field: sideline_phish_risk" />
    </NextIntlClientProvider>);
    expect(screen.getByRole('status')).toHaveTextContent('整条规则已阻止执行');
    expect(screen.getByRole('status')).toHaveTextContent('钓鱼风险策略');
    expect(screen.getByRole('status')).toHaveAttribute('title', 'retired field: sideline_phish_risk');
  });
  it('does not warn for executable rules', () => {
    const { container } = render(<NextIntlClientProvider locale="zh" messages={zh}>
      <RuleExecutionWarning />
    </NextIntlClientProvider>);
    expect(container).toBeEmptyDOMElement();
  });
});
