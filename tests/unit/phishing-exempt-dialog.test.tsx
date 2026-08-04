import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

import { ExemptDialog } from '@/components/phishing-detection/exempt-dialog';

function renderDialog(onSubmit = vi.fn()) {
  render(<ExemptDialog open onOpenChange={vi.fn()} onSubmit={onSubmit} />);
  return {
    onSubmit,
    reason: screen.getByPlaceholderText('exempt.reasonPlaceholder'),
    submit: screen.getByRole('button', { name: 'exempt.submit' }),
  };
}

describe('ExemptDialog', () => {
  it('keeps submit disabled until a non-blank reason is entered (GT-12522)', async () => {
    const { reason, submit } = renderDialog();

    expect(submit).toBeDisabled();

    fireEvent.change(reason, { target: { value: '   ' } });
    expect(submit).toBeDisabled();

    fireEvent.change(reason, { target: { value: '  误报测试  ' } });
    await waitFor(() => expect(submit).toBeEnabled());
  });

  it('submits the trimmed reason', async () => {
    const onSubmit = vi.fn();
    const { reason, submit } = renderDialog(onSubmit);

    fireEvent.change(reason, { target: { value: '  误报测试  ' } });
    await waitFor(() => expect(submit).toBeEnabled());
    fireEvent.click(submit);

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('误报测试'));
  });
});
