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

vi.mock('@/lib/api/phishing-config', () => ({
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

function makeGroupRule(id: number, name: string, type: 'sender' | 'recipient') {
  const stage = type === 'sender' ? 'mail' : 'rcpt';
  const field = type === 'sender' ? 'sender' : 'recipient';
  return {
    id,
    name,
    stage,
    tags: [`grp:${name}`],
    metadata: { group_type: type },
    condition_tree: { type: 'condition', field, operator: 'within', value: `${name}@example.com` },
    is_active: true,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  };
}

describe('AdmissionRuleSheet sender/recipient group dropdown filters', () => {
  beforeEach(() => {
    // OrgContactTreeSelect 与群组下拉共用同一个 apiRequestMock，因此需要按 URL
    // 区分响应：只对群组管理的 /unified-rules 查询返回群组数据，组织通讯录相关
    // 请求（部门/联系人）返回空列表，避免其解析出错导致整个组件树崩溃。
    apiRequestMock.mockImplementation((url: string) => {
      if (url.includes('/unified-rules')) {
        return Promise.resolve({
          items: [
            makeGroupRule(1, '财务人员', 'recipient'),
            makeGroupRule(2, 'IT管理员', 'recipient'),
            makeGroupRule(3, '全体员工', 'recipient'),
            makeGroupRule(4, '高管邮箱', 'sender'),
          ],
        });
      }
      return Promise.resolve({ items: [] });
    });
  });

  it('shows only the recipient group dropdown by default (inbound direction)', async () => {
    renderSheet();
    fireEvent.click(screen.getByTestId('rule-recipient-filter'));
    await waitFor(() => expect(screen.getByTestId('rule-recipient-group-trigger')).toBeInTheDocument());
    expect(screen.queryByTestId('rule-sender-group-trigger')).not.toBeInTheDocument();
  });

  it('filters options via search and toggles a selection into a removable chip', async () => {
    renderSheet();
    fireEvent.click(screen.getByTestId('rule-recipient-filter'));
    const trigger = await screen.findByTestId('rule-recipient-group-trigger');
    fireEvent.click(trigger);

    const search = await screen.findByTestId('rule-recipient-group-search');
    fireEvent.change(search, { target: { value: '财务' } });

    expect(await screen.findByTestId('rule-recipient-group-option-grp_财务人员')).toBeInTheDocument();
    expect(screen.queryByTestId('rule-recipient-group-option-grp_IT管理员')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('rule-recipient-group-option-grp_财务人员'));

    await waitFor(() => {
      expect(screen.getByTestId('rule-recipient-group-chip-grp_财务人员')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('rule-sender-group-chip-grp_财务人员')).not.toBeInTheDocument();
  });

  it('switches to the sender group dropdown when direction is outbound only', async () => {
    renderSheet();
    fireEvent.click(screen.getByTestId('rule-recipient-filter'));
    await screen.findByTestId('rule-recipient-group-trigger');

    fireEvent.click(screen.getByTestId('rule-direction-inbound'));
    fireEvent.click(screen.getByTestId('rule-direction-outbound'));

    await waitFor(() => expect(screen.getByTestId('rule-sender-group-trigger')).toBeInTheDocument());
    expect(screen.queryByTestId('rule-recipient-group-trigger')).not.toBeInTheDocument();
  });
});
