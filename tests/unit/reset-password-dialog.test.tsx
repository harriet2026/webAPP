// GT-12314 —— 重置密码对话框组件单测（生成/复制/提交/错误透传）。
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import zh from '../../messages/zh.json';
import { ResetPasswordDialog, generatePassword } from '@/components/admin/reset-password-dialog';
import { ApiError } from '@/lib/api/client';

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    success: (...a: unknown[]) => toastSuccess(...a),
    error: (...a: unknown[]) => toastError(...a),
  },
}));

function wrap(onSubmit: (pw: string) => Promise<void>, open = true) {
  return render(
    <NextIntlClientProvider locale="zh" messages={zh as unknown as Record<string, unknown>}>
      <ResetPasswordDialog open={open} onOpenChange={() => {}} username="admin" onSubmit={onSubmit} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('generatePassword', () => {
  it('生成 16 位且四类字符各至少一个（满足最严 N-of-4 复杂度）', () => {
    for (let i = 0; i < 20; i++) {
      const pw = generatePassword();
      expect(pw).toHaveLength(16);
      expect(/[A-Z]/.test(pw)).toBe(true);
      expect(/[a-z]/.test(pw)).toBe(true);
      expect(/[0-9]/.test(pw)).toBe(true);
      expect(/[!@#$%^&*]/.test(pw)).toBe(true);
    }
  });
});

describe('ResetPasswordDialog', () => {
  it('「生成」填充输入框并出现「复制密码」', async () => {
    wrap(async () => {});
    expect(screen.queryByTestId('reset-password-copy')).toBeNull();
    fireEvent.click(screen.getByTestId('reset-password-generate'));
    const input = screen.getByTestId('reset-password-input') as HTMLInputElement;
    expect(input.value).toHaveLength(16);
    expect(screen.getByTestId('reset-password-copy')).toBeTruthy();
  });

  it('空密码提交被拦截，不调 onSubmit', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    wrap(onSubmit);
    fireEvent.click(screen.getByTestId('reset-password-submit'));
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('提交成功走 onSubmit 并 toast 成功', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    wrap(onSubmit);
    fireEvent.change(screen.getByTestId('reset-password-input'), { target: { value: 'Str0ng!Pass99xx' } });
    fireEvent.click(screen.getByTestId('reset-password-submit'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('Str0ng!Pass99xx'));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
  });

  it('按稳定错误码本地化策略错误，不泄漏后端英文 message', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new ApiError(400, 'password must be at least 10 characters', {
      error: {
        code: 'account.password_too_short',
        message: 'password must be at least 10 characters',
        params: { field: 'password', min: 10 },
      },
    }));
    wrap(onSubmit);
    fireEvent.change(screen.getByTestId('reset-password-input'), { target: { value: 'Abc123!xy' } });
    fireEvent.click(screen.getByTestId('reset-password-submit'));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('密码至少需要 10 个字符'));
    expect(toastError).not.toHaveBeenCalledWith(expect.stringContaining('password must'));
  });
});
