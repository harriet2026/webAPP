import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import zh from '@/../messages/zh.json';

const access = vi.fn();
vi.mock('../access', () => ({ usePhishingAccess: () => access() }));
vi.mock('./admission-rules-section', () => ({
  AdmissionRulesSection: ({ readOnly }: { readOnly: boolean }) => (
    <button data-testid="admission-rule-create" disabled={readOnly}>create</button>
  ),
}));
vi.mock('./runtime-risk-section', () => ({ RuntimeRiskSection: () => <div /> }));

import { PhishingConfigPage } from './phishing-config-page';

function renderPage() {
  render(<NextIntlClientProvider locale="zh" messages={zh as never}><PhishingConfigPage /></NextIntlClientProvider>);
}

describe('PhishingConfigPage permissions', () => {
  beforeEach(() => {
    access.mockReturnValue({ status: 'ready', canView: true, canEdit: false, readOnly: true });
  });

  it('disables admission-rule creation and explains an auditor denial', () => {
    renderPage();
    expect(screen.getByTestId('admission-rule-create')).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('当前账号只有查看权限，配置控件不可操作。');
  });

  it('enables admission-rule creation for tenant operations', () => {
    access.mockReturnValue({ status: 'ready', canView: true, canEdit: true, readOnly: false });
    renderPage();
    expect(screen.getByTestId('admission-rule-create')).toBeEnabled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
