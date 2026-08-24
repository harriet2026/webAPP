import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import zh from '@/../messages/zh.json';
import { ApiError } from '@/lib/api/client';

const toastError = vi.fn();
const createAdmissionRuleMock = vi.fn();
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
  updateAdmissionRule: vi.fn(),
}));

import { AdmissionRuleSheet } from './admission-rule-sheet';

function renderSheet(onOpenChange = vi.fn(), onSaved = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <NextIntlClientProvider locale="zh" messages={zh as never}>
      <QueryClientProvider client={client}>
        <AdmissionRuleSheet
          open
          onOpenChange={onOpenChange}
          rule={null}
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
