import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, expect, it, vi } from 'vitest';
import zh from '@/../messages/zh.json';
import type { PhishAdmissionRule } from '@/types/phishing-config';

const listRules = vi.fn();
const createRule = vi.fn();
const deleteRule = vi.fn();
const apiRequest = vi.fn();
vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/api/client')>(),
  useApiRequest: () => ({ apiRequest, effectiveTenantId: 1 }),
}));
vi.mock('@/lib/api/phishing-admission-rules', () => ({
  listAdmissionRules: (...args: unknown[]) => listRules(...args),
  createAdmissionRule: (...args: unknown[]) => createRule(...args),
  updateAdmissionRule: vi.fn(), deleteAdmissionRule: (...args: unknown[]) => deleteRule(...args), setAdmissionRuleStatus: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
import { AdmissionRulesSection } from './admission-rules-section';

beforeEach(() => {
  vi.clearAllMocks();
  apiRequest.mockResolvedValue({ items: [] });
  createRule.mockResolvedValue({});
});

it('lets an administrator delete an unsupported rule without inventing editable settings', async () => {
  const old = { id: 7, rule_uid: 'old', name: '旧规则', enabled: true, tenant_id: 1, status: 'rebuild_required', read_only: false, effective: false };
  listRules.mockResolvedValue([old]);
  deleteRule.mockImplementation(async () => { listRules.mockResolvedValue([]); });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<NextIntlClientProvider locale="zh" messages={zh as never}><QueryClientProvider client={client}><AdmissionRulesSection /></QueryClientProvider></NextIntlClientProvider>);
  const row = await screen.findByTestId('admission-rule-row');
  expect(within(row).getByText('需要重建')).toBeInTheDocument();
  expect(within(row).getByRole('button', { name: zh.phishingConfig.admission.edit })).toBeDisabled();
  expect(within(row).getByRole('button', { name: zh.phishingConfig.admission.copy })).toBeDisabled();
  expect(within(row).getByRole('switch')).toHaveAttribute('aria-disabled', 'true');
  expect(within(row).queryByText(zh.phishingConfig.admission.allRecipients)).not.toBeInTheDocument();
  fireEvent.click(within(row).getByRole('button', { name: zh.phishingConfig.admission.delete }));
  const dialog = await screen.findByRole('alertdialog');
  fireEvent.click(within(dialog).getByRole('button', { name: zh.phishingConfig.admission.delete }));
  await waitFor(() => expect(screen.queryByText('旧规则')).not.toBeInTheDocument());
  expect(deleteRule).toHaveBeenCalledWith(7, expect.any(Function));
  expect(screen.getByTestId('admission-rule-create')).toBeEnabled();
});

it('searches the URL signal and copies KB and migrated scope without enabling the copy', async () => {
  const rule: PhishAdmissionRule = {
    id: 1, rule_uid: 'source-rule', revision: 'current', name: '链接候选',
    enabled: true, directions: ['inbound'], filter_on: true,
    recipient_tags: ['grp:legacy'], recipient_emails: ['alice@example.com'],
    require_url: true, sender_first_seen: false, require_qrcode: false,
    require_executable: false, max_size_kb: 5120,
  };
  listRules.mockResolvedValue([{ ...rule, status: 'ready', tenant_id: 1, read_only: false, effective: true }]);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<NextIntlClientProvider locale="zh" messages={zh as never}><QueryClientProvider client={client}><AdmissionRulesSection /></QueryClientProvider></NextIntlClientProvider>);
  await screen.findByText('链接候选');
  expect(screen.getByText('grp:legacy, alice@example.com')).toHaveAttribute('title', 'grp:legacy, alice@example.com');
  fireEvent.change(screen.getByPlaceholderText(zh.phishingConfig.admission.searchPlaceholder), { target: { value: 'URL' } });
  expect(screen.getByText('链接候选')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: zh.phishingConfig.admission.copy }));
  await waitFor(() => expect(createRule).toHaveBeenCalledWith(expect.objectContaining({
    enabled: false, require_url: true, sender_first_seen: false, max_size_kb: 5120,
    recipient_tags: ['grp:legacy'], recipient_emails: ['alice@example.com'],
  }), expect.any(Function)));
  const payload = createRule.mock.calls[0][0];
  expect(payload).not.toHaveProperty('id');
  expect(payload).not.toHaveProperty('revision');
  expect(payload).not.toHaveProperty('max_size_mb');
});

it('keeps valid rows usable beside damaged and inherited unsupported rows', async () => {
  listRules.mockResolvedValue([
    { id: 1, rule_uid: 'global-old', name: '全局旧规则', enabled: false, tenant_id: null, status: 'rebuild_required', read_only: true, effective: false },
    { id: 2, rule_uid: 'damaged', name: '损坏规则', enabled: true, tenant_id: 1, status: 'integrity_error', read_only: false, effective: false },
    { id: 3, rule_uid: 'valid', revision: 'current', name: '有效规则', enabled: true, tenant_id: 1, status: 'ready', read_only: false, effective: true, directions: ['inbound'], require_url: true, max_size_kb: 1 },
  ]);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<NextIntlClientProvider locale="zh" messages={zh as never}><QueryClientProvider client={client}><AdmissionRulesSection /></QueryClientProvider></NextIntlClientProvider>);
  const rows = await screen.findAllByTestId('admission-rule-row');
  expect(within(rows[0]).getByRole('button', { name: zh.phishingConfig.admission.delete })).toBeDisabled();
  expect(within(rows[1]).getByRole('button', { name: zh.phishingConfig.admission.delete })).toBeEnabled();
  expect(within(rows[1]).getByRole('button', { name: zh.phishingConfig.admission.edit })).toBeDisabled();
  expect(within(rows[2]).getByRole('button', { name: zh.phishingConfig.admission.edit })).toBeEnabled();
  expect(within(rows[2]).getByText(/URL/)).toBeInTheDocument();
  expect(screen.getByRole('alert')).toBeInTheDocument();
});
