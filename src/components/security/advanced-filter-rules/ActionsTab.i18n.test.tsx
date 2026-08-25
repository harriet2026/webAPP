import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import zh from '../../../../messages/zh.json';
import { ActionsTab } from './ActionsTab';
import { defaultAddonParams } from './AddonsPanel';
import { emptyRuleForm, type RuleForm } from './rule-form';

describe('ActionsTab 国际化格式化', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('修改邮件头提示把模板变量显示为带花括号的字面量', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const form: RuleForm = {
      ...emptyRuleForm(),
      primaryAction: 'proceed',
      addons: {
        modifyHeader: {
          enabled: true,
          params: defaultAddonParams('modifyHeader'),
        },
      },
    };

    render(
      <NextIntlClientProvider locale="zh" messages={zh}>
        <ActionsTab form={form} setForm={vi.fn()} fieldDefs={{}} />
      </NextIntlClientProvider>,
    );

    fireEvent.click(screen.getByTestId('addon-row-modifyHeader'));

    expect(screen.getByText('支持变量：{sender}、{recipient}、{subject}')).toBeInTheDocument();
    expect(consoleError.mock.calls.flat().join(' ')).not.toContain('FORMATTING_ERROR');
  });
});
