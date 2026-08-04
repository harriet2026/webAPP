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
  getAdmissionTagSuggestions: vi.fn().mockResolvedValue([]),
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
