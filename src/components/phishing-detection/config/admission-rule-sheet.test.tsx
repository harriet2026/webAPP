import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import zh from '@/../messages/zh.json';
import type { PhishAdmissionRule } from '@/types/phishing-config';
import { ApiError } from '@/lib/api/client';

const toastError = vi.fn();
const createAdmissionRuleMock = vi.fn();
const updateAdmissionRuleMock = vi.fn();
const apiRequestMock = vi.fn();

vi.mock('sonner', () => ({
  toast: { error: (...args: unknown[]) => toastError(...args), success: vi.fn() },
}));

vi.mock('@/lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/client')>();
  return {
    ...actual,
    useApiRequest: () => ({ apiRequest: apiRequestMock }),
  };
});

vi.mock('@/lib/api/phishing-admission-rules', () => ({
  createAdmissionRule: (...args: unknown[]) => createAdmissionRuleMock(...args),
  updateAdmissionRule: (...args: unknown[]) => updateAdmissionRuleMock(...args),
}));

import { AdmissionRuleSheet } from './admission-rule-sheet';

function renderSheet(onOpenChange = vi.fn(), onSaved = vi.fn(), rule: PhishAdmissionRule | null = null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <NextIntlClientProvider locale="zh" messages={zh as never}>
      <QueryClientProvider client={client}>
        <AdmissionRuleSheet
          open
          onOpenChange={onOpenChange}
          rule={rule}
          onSaved={onSaved}
        />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
  return { onOpenChange, onSaved };
}

beforeEach(() => {
  vi.clearAllMocks();
  Element.prototype.scrollIntoView = vi.fn();
  apiRequestMock.mockResolvedValue({ items: [] });
});

describe('AdmissionRuleSheet duplicate-name conflict (GT-12513)', () => {
  it('shows the localized conflict and preserves the open draft', async () => {
    const conflict = new ApiError(409, 'rule name already exists', {
      error: {
        code: 'phishing_admission.rule_name_exists',
        message: 'rule name already exists',
        params: { field: 'name' },
      },
    });
    let rejectCreate!: (reason: unknown) => void;
    createAdmissionRuleMock.mockImplementation(() => new Promise((_resolve, reject) => {
      rejectCreate = reject;
    }));
    const { onOpenChange, onSaved } = renderSheet();

    const nameInput = screen.getByTestId('rule-name-input');
    const saveButton = screen.getByTestId('rule-save');
    fireEvent.change(nameInput, { target: { value: '重复准入规则' } });
    fireEvent.click(saveButton);

    await waitFor(() => expect(saveButton).toBeDisabled());
    act(() => rejectCreate(conflict));

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith('准入规则名称已存在，请使用其他名称');
    });
    expect(saveButton).toBeEnabled();
    expect(screen.getByTestId('admission-rule-sheet')).toBeInTheDocument();
    expect(nameInput).toHaveValue('重复准入规则');
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });
});

describe('AdmissionRuleSheet directional scopes', () => {
  it('saves URL as the only signal without requiring another risk feature', async () => {
    createAdmissionRuleMock.mockResolvedValue({});
    renderSheet();
    fireEvent.change(screen.getByTestId('rule-name-input'), { target: { value: '普通链接准入' } });
    fireEvent.click(screen.getByTestId('rule-sender-first-seen'));
    expect(screen.getByTestId('rule-save')).toBeEnabled();
    fireEvent.click(screen.getByTestId('rule-save'));
    await waitFor(() => expect(createAdmissionRuleMock).toHaveBeenCalledWith(
      expect.objectContaining({ require_url: true, sender_first_seen: false, require_qrcode: false, require_executable: false }),
      expect.any(Function),
    ));
  });

  it('switches outbound rules to sender scope while mixed directions expose both sides', async () => {
    renderSheet();
    fireEvent.click(screen.getByTestId('rule-recipient-filter'));
    expect(screen.getByTestId('rule-scope-recipient')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('rule-direction-outbound'));
    expect(screen.getByTestId('rule-scope-recipient')).toBeInTheDocument();
    expect(screen.getByTestId('rule-scope-sender')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('rule-direction-inbound'));
    expect(screen.queryByTestId('rule-scope-recipient')).not.toBeInTheDocument();
    expect(screen.getByTestId('rule-scope-sender')).toBeInTheDocument();
  });

  it('accepts 可执行文件 as the sole risk signal and sends the normalized field', async () => {
    createAdmissionRuleMock.mockResolvedValue({});
    renderSheet();
    fireEvent.change(screen.getByTestId('rule-name-input'), { target: { value: '可执行文件准入' } });
    fireEvent.click(screen.getByTestId('rule-require-url'));
    fireEvent.click(screen.getByTestId('rule-sender-first-seen'));
    expect(screen.getByTestId('rule-save')).toBeDisabled();
    fireEvent.click(screen.getByTestId('rule-require-executable'));
    fireEvent.click(screen.getByTestId('rule-save'));

    await waitFor(() => expect(createAdmissionRuleMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: '可执行文件准入',
        sender_first_seen: false,
        require_qrcode: false,
        require_executable: true,
      }),
      expect.any(Function),
    ));
  });

  it('saves an integer KB limit and rejects fractions instead of silently removing the limit', async () => {
    createAdmissionRuleMock.mockResolvedValue({});
    renderSheet();
    fireEvent.change(screen.getByTestId('rule-name-input'), { target: { value: '小邮件' } });
    const size = screen.getByTestId('rule-max-size-input');
    fireEvent.change(size, { target: { value: '0.5' } });
    expect(screen.getByTestId('rule-save')).toBeDisabled();
    fireEvent.change(size, { target: { value: '128' } });
    expect(screen.getByText('KB')).toBeInTheDocument();
    expect(screen.getByText('基础筛选')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('rule-save'));
    await waitFor(() => expect(createAdmissionRuleMock).toHaveBeenCalledWith(
      expect.objectContaining({ max_size_kb: 128 }), expect.any(Function),
    ));
  });

  it('persists group UIDs, canonical department paths, and lowercase exact emails', async () => {
    apiRequestMock.mockImplementation((url: string) => {
      if (url.startsWith('/unified-rules?')) {
        return Promise.resolve({
          items: [{
            id: 7,
            rule_uid: 'rule-uid-finance',
            name: '财务组',
            rule_class: 'tag',
            stage: 'rcpt',
            priority: 0,
            condition_tree: JSON.stringify({ type: 'condition', field: 'recipient', operator: 'within', value: 'cfo@example.com' }),
            tags: ['grp:财务组'],
            is_active: true,
            created_at: '',
            updated_at: '',
          }],
        });
      }
      if (url === '/contacts/_departments') {
        return Promise.resolve({
          items: [{
            path: '研发部 / 财务组',
            name: '财务组',
            parent_path: '研发部',
            member_count: 3,
            source_names: ['AD'],
          }],
        });
      }
      return Promise.resolve({ items: [] });
    });
    createAdmissionRuleMock.mockResolvedValue({});
    renderSheet();

    fireEvent.change(screen.getByTestId('rule-name-input'), { target: { value: '财务收件准入' } });
    fireEvent.click(screen.getByTestId('rule-recipient-filter'));
    await waitFor(() => expect(screen.getByTestId('rule-recipient-group-trigger')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('rule-recipient-group-trigger'));
    fireEvent.click(await screen.findByTestId('rule-recipient-group-option-rule_uid_finance'));
    fireEvent.click(await screen.findByTestId('rule-recipient-dept-toggle-研发部'));
    fireEvent.change(screen.getByTestId('rule-recipient-dept-email-input'), { target: { value: 'CFO@EXAMPLE.COM' } });
    fireEvent.keyDown(screen.getByTestId('rule-recipient-dept-email-input'), { key: 'Enter' });
    fireEvent.click(screen.getByTestId('rule-save'));

    await waitFor(() => expect(createAdmissionRuleMock).toHaveBeenCalledWith(
      expect.objectContaining({
        recipient_groups: ['rule-uid-finance'],
        recipient_depts: ['研发部', '研发部 / 财务组'],
        recipient_emails: ['cfo@example.com'],
      }),
      expect.any(Function),
    ));
  });
});

  it('keeps migrated legacy scope and KB when editing another field', async () => {
    updateAdmissionRuleMock.mockResolvedValue(undefined);
    const rule = {
      id: 15, rule_uid: 'migrated-rule', revision: 'current-revision', name: '迁移规则',
      enabled: true, directions: ['inbound'] as PhishAdmissionRule['directions'],
      filter_on: true, recipient_tags: ['grp:历史保护范围'], max_size_kb: 5120,
      require_url: true, sender_first_seen: false, require_qrcode: false,
    };
    renderSheet(undefined, undefined, rule);
    expect(screen.getByTestId('rule-max-size-input')).toHaveValue('5120');
    fireEvent.change(screen.getByTestId('rule-name-input'), { target: { value: '迁移规则改名' } });
    expect(screen.getByTestId('rule-save')).toBeEnabled();
    fireEvent.click(screen.getByTestId('rule-save'));
    await waitFor(() => expect(updateAdmissionRuleMock).toHaveBeenCalledWith(15,
      expect.objectContaining({ recipient_tags: ['grp:历史保护范围'], max_size_kb: 5120, expected_revision: 'current-revision' }),
      expect.any(Function),
    ));
  });

it.each(['-1', 'invalid', '102400001'])('does not save an invalid KB input: %s', (value) => {
  renderSheet();
  fireEvent.change(screen.getByTestId('rule-name-input'), { target: { value: '大小校验' } });
  fireEvent.change(screen.getByTestId('rule-max-size-input'), { target: { value } });
  expect(screen.getByTestId('rule-save')).toBeDisabled();
});

it.each(['', '0'])('saves unlimited size from %j in the two-section form', async (value) => {
  createAdmissionRuleMock.mockResolvedValue({});
  renderSheet();
  fireEvent.change(screen.getByTestId('rule-name-input'), { target: { value: '不限大小' } });
  fireEvent.change(screen.getByTestId('rule-max-size-input'), { target: { value } });
  expect(screen.getByRole('region', { name: '基础筛选' })).toContainElement(screen.getByTestId('rule-max-size-input'));
  expect(screen.getByRole('region', { name: '风险信号' })).toContainElement(screen.getByTestId('rule-require-url'));
  expect(screen.queryByText('匹配条件预览')).not.toBeInTheDocument();
  fireEvent.click(screen.getByTestId('rule-save'));
  await waitFor(() => expect(createAdmissionRuleMock).toHaveBeenCalledWith(expect.objectContaining({ max_size_kb: 0 }), expect.any(Function)));
});
