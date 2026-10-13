import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, expect, it, vi } from 'vitest';
import zh from '@/../messages/zh.json';
import type { PhishAdmissionRule } from '@/types/phishing-config';

const listRules = vi.fn();
const updateRule = vi.fn();
const setStatus = vi.fn();
const apiRequest = vi.fn();
vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/api/client')>(),
  useApiRequest: () => ({ apiRequest, effectiveTenantId: 1 }),
}));
vi.mock('@/lib/api/phishing-admission-rules', () => ({
  listAdmissionRules: (...args: unknown[]) => listRules(...args),
  createAdmissionRule: vi.fn(),
  updateAdmissionRule: (...args: unknown[]) => updateRule(...args),
  deleteAdmissionRule: vi.fn(),
  setAdmissionRuleStatus: (...args: unknown[]) => setStatus(...args),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
import { AdmissionRulesSection } from './admission-rules-section';

const rule: PhishAdmissionRule = {
  id: 5, rule_uid: 'r5', revision: 'rev-enabled', name: '准入规则', enabled: true, directions: ['inbound'],
  filter_on: false, require_url: true, sender_first_seen: false, require_qrcode: false, require_executable: false, max_size_kb: 0,
};
const listed = (value: PhishAdmissionRule) => [{ ...value, status: 'ready', tenant_id: 1, read_only: false, effective: value.enabled }];

beforeEach(() => {
  vi.clearAllMocks();
  apiRequest.mockResolvedValue({ items: [] });
  updateRule.mockResolvedValue({});
});

// GT-13175: enabled is part of the revision and the status endpoint returns
// 204 without it, so editing must wait for the refreshed list.
it('keeps edit disabled until the list refresh after a toggle delivers the new revision', async () => {
  let releaseRefresh: () => void = () => {};
  listRules.mockResolvedValueOnce(listed(rule)).mockImplementation(() => new Promise((resolve) => {
    releaseRefresh = () => resolve(listed({ ...rule, enabled: false, revision: 'rev-disabled' }));
  }));
  setStatus.mockResolvedValue(undefined);
  const user = userEvent.setup();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<NextIntlClientProvider locale="zh" messages={zh as never}><QueryClientProvider client={client}><AdmissionRulesSection /></QueryClientProvider></NextIntlClientProvider>);

  await user.click(await screen.findByTestId('admission-rule-enabled-5'));
  await waitFor(() => expect(setStatus).toHaveBeenCalledWith(5, false, expect.any(Function)));
  await waitFor(() => expect(listRules).toHaveBeenCalledTimes(2));
  expect(screen.getByTestId('admission-rule-edit-5')).toBeDisabled();
  expect(screen.getByRole('button', { name: zh.phishingConfig.admission.copy })).toBeDisabled();

  releaseRefresh();
  await waitFor(() => expect(screen.getByTestId('admission-rule-edit-5')).toBeEnabled());
  await user.click(screen.getByTestId('admission-rule-edit-5'));
  await user.click(await screen.findByTestId('rule-save'));
  await waitFor(() => expect(updateRule).toHaveBeenCalled());
  expect(updateRule.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ expected_revision: 'rev-disabled', enabled: false }));
});
