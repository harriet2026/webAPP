import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { useForm } from 'react-hook-form';
import type { DisposalSettings } from '@/types/disposal-settings';
import { zodResolver } from '@hookform/resolvers/zod';
import { defaultDisposalSettings, disposalSettingsSchema } from './schema';
import { ReviewSettingsTab } from './review-settings-tab';

// identity translator — assertions key off testids, not translated copy
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

function Harness() {
  const form = useForm<DisposalSettings>({
    defaultValues: defaultDisposalSettings(),
  });
  return <ReviewSettingsTab control={form.control} watch={form.watch} setValue={form.setValue} />;
}

describe('ReviewSettingsTab timeout mark positions (task-12 fix: subject_prefix/header)', () => {
  it('checking both position checkboxes writes ["subject_prefix", "header"] to the form, not the old subject/body values', async () => {
    render(<Harness />);

    // switch to mark first so the checkbox group renders
    await userEvent.click(screen.getByTestId('disposal-settings-timeout-disposal-mark'));

    const subjectPrefixBox = screen.getByTestId(
      'disposal-settings-timeout-mark-positions-subject_prefix',
    );
    const headerBox = screen.getByTestId('disposal-settings-timeout-mark-positions-header');
    expect(subjectPrefixBox).toBeInTheDocument();
    expect(headerBox).toBeInTheDocument();
    // the old (backend-rejected) position ids must not be rendered at all
    expect(
      screen.queryByTestId('disposal-settings-timeout-mark-positions-subject'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('disposal-settings-timeout-mark-positions-body'),
    ).not.toBeInTheDocument();

    await userEvent.click(subjectPrefixBox);
    await userEvent.click(headerBox);

    expect(subjectPrefixBox).toBeChecked();
    expect(headerBox).toBeChecked();
  });
});

describe('ReviewSettingsTab max_recheck_minutes (task-12 fix: backend-authoritative 1-60)', () => {
  it('renders the input with max=60 (not the stale 1440 ceiling)', () => {
    render(<Harness />);
    const input = screen.getByTestId('disposal-settings-max-recheck-minutes') as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.max).toBe('60');
    expect(input.min).toBe('1');
  });
});

describe('ReviewSettingsTab current-status copy linked to its switch (task-12)', () => {
  it('auto-deliver status text follows the switch state', async () => {
    render(<Harness />);
    const status = screen.getByTestId('disposal-settings-auto-deliver-status');
    // defaultDisposalSettings() review.timeout_auto_deliver defaults to true
    expect(status).toHaveTextContent('currentStatusstatusEnabled');

    await userEvent.click(screen.getByTestId('disposal-settings-auto-deliver'));
    expect(status).toHaveTextContent('currentStatusstatusDisabled');
  });

  it('sender queue-notify status text follows the switch state', async () => {
    render(<Harness />);
    const status = screen.getByTestId('disposal-settings-sender-queue-status');
    expect(status).toHaveTextContent('currentStatusstatusDisabled');

    await userEvent.click(screen.getByTestId('disposal-settings-sender-queue'));
    expect(status).toHaveTextContent('currentStatusstatusEnabled');
  });

  it('sender result-notify status text follows the switch state', async () => {
    render(<Harness />);
    const status = screen.getByTestId('disposal-settings-sender-result-status');
    // defaultDisposalSettings() review.sender_notify_on_result defaults to true
    expect(status).toHaveTextContent('currentStatusstatusEnabled');

    await userEvent.click(screen.getByTestId('disposal-settings-sender-result'));
    expect(status).toHaveTextContent('currentStatusstatusDisabled');
  });
});

// GT-12250：非法/重复邮箱此前是静默 return —— 用户看不到任何失败原因。
describe('ReviewSettingsTab reviewer email validation feedback (GT-12250)', () => {
  const err = 'disposal-settings-reviewer-email-error';

  it('shows a format error for an invalid address instead of failing silently', async () => {
    render(<Harness />);
    await userEvent.type(
      screen.getByTestId('disposal-settings-reviewer-email-input'),
      'not-an-email',
    );
    await userEvent.click(screen.getByTestId('disposal-settings-reviewer-email-add'));

    expect(screen.getByTestId(err)).toHaveTextContent('emailInvalid');
  });

  it('shows a duplicate error when the address is already in the list', async () => {
    render(<Harness />);
    const input = screen.getByTestId('disposal-settings-reviewer-email-input');
    const add = screen.getByTestId('disposal-settings-reviewer-email-add');

    await userEvent.type(input, 'a@corp.com');
    await userEvent.click(add);
    expect(screen.queryByTestId(err)).not.toBeInTheDocument();

    await userEvent.type(input, 'a@corp.com');
    await userEvent.click(add);
    expect(screen.getByTestId(err)).toHaveTextContent('emailDuplicate');
  });

  it('clears the error once the user edits the field again', async () => {
    render(<Harness />);
    const input = screen.getByTestId('disposal-settings-reviewer-email-input');
    await userEvent.type(input, 'bad');
    await userEvent.click(screen.getByTestId('disposal-settings-reviewer-email-add'));
    expect(screen.getByTestId(err)).toBeInTheDocument();

    await userEvent.type(input, 'x');
    expect(screen.queryByTestId(err)).not.toBeInTheDocument();
  });

  it('accepts a valid address: chip appears, input clears, no error', async () => {
    render(<Harness />);
    const input = screen.getByTestId('disposal-settings-reviewer-email-input');
    await userEvent.type(input, 'ok@corp.com');
    await userEvent.click(screen.getByTestId('disposal-settings-reviewer-email-add'));

    expect(screen.queryByTestId(err)).not.toBeInTheDocument();
    expect(input).toHaveValue('');
    expect(screen.getByText('ok@corp.com')).toBeInTheDocument();
  });
});

// GT-12251：非法数值此前只被 schema 挡住，界面上没有任何范围提示。
//
// 这里刻意复刻 disposal-settings-page.tsx 的表单配置：zodResolver + **默认的
// onSubmit 模式**（真实页面没有 mode: 'onChange'）。所以校验错误只在提交尝试后
// 才产生，测试必须经由 handleSubmit 触发——用 onChange 模式写会让测试在真实
// 页面不显示提示时依然通过（已实测：浏览器里输入 0 不会即时提示，点保存才提示）。
describe('ReviewSettingsTab custom duration range feedback (GT-12251)', () => {
  function ValidatingHarness() {
    const form = useForm<DisposalSettings>({
      defaultValues: defaultDisposalSettings(),
      resolver: zodResolver(disposalSettingsSchema),
    });
    return (
      <>
        <ReviewSettingsTab control={form.control} watch={form.watch} setValue={form.setValue} />
        <button type="button" data-testid="harness-save" onClick={form.handleSubmit(() => {})}>
          save
        </button>
      </>
    );
  }

  it('renders the 1-300 range error after a save attempt with duration 0', async () => {
    render(<ValidatingHarness />);
    await userEvent.click(screen.getByTestId('disposal-settings-duration-custom'));

    const input = screen.getByTestId('disposal-settings-custom-minutes');
    await userEvent.clear(input);
    await userEvent.type(input, '0');

    // 提交前不提示——与真实页面的 onSubmit 模式一致
    expect(screen.queryByTestId('disposal-settings-custom-minutes-error')).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId('harness-save'));

    expect(await screen.findByTestId('disposal-settings-custom-minutes-error')).toHaveTextContent(
      'customMinutesRange',
    );
    // 已编辑内容必须保留，便于用户就地改正
    expect(input).toHaveValue(0);
  });

  it('shows no range error for a valid duration', async () => {
    render(<ValidatingHarness />);
    await userEvent.click(screen.getByTestId('disposal-settings-duration-custom'));

    const input = screen.getByTestId('disposal-settings-custom-minutes');
    await userEvent.clear(input);
    await userEvent.type(input, '30');
    await userEvent.click(screen.getByTestId('harness-save'));

    expect(screen.queryByTestId('disposal-settings-custom-minutes-error')).not.toBeInTheDocument();
  });
});
