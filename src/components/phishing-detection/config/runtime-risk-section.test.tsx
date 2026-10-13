import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import zh from '@/../messages/zh.json';
import serverRiskError from '../../../../../internal/api/testdata/phishing-risk-policy-error.json';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api/client';
import { UnsavedGuardProvider } from '@/contexts/unsaved-guard-context';
import type { PhishAgentConfig } from '@/types/phishing-config';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
const getConfig = vi.fn();
const putConfig = vi.fn();
vi.mock('@/lib/api/phishing-config', () => ({
  getPhishingConfig: (...args: unknown[]) => getConfig(...args),
  putPhishingConfig: (...args: unknown[]) => putConfig(...args),
}));
vi.mock('@/lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/client')>();
  return { ...actual, useApiRequest: () => ({ apiRequest: vi.fn(), effectiveTenantId: 9 }) };
});

import { RuntimeRiskSection } from './runtime-risk-section';

const baseline: PhishAgentConfig = {
  risk_policy: {
    cutoffs: { low: 40, medium: 70, high: 90 },
    policies: {
      suspicious: { base_disposition: 'proceed', mark_positions: ['subject_prefix'], mark_text: '[可疑]' },
      low: { base_disposition: 'audit' }, medium: { base_disposition: 'quarantine' }, high: { base_disposition: 'discard' },
    },
    version: 3, updated_at: '2026-08-18T00:00:00Z',
  },
  runtime_policy: { run_mode: 'realtime', observe_action: 'accept', observe_mark_enabled: false, timeout_minutes: 15, max_recheck_minutes: 30, timeout_async_enabled: true, version: 5, updated_at: '2026-08-18T00:00:00Z' },
};

function renderSection() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<NextIntlClientProvider locale="zh" messages={zh as never}><QueryClientProvider client={client}><UnsavedGuardProvider><RuntimeRiskSection /></UnsavedGuardProvider></QueryClientProvider></NextIntlClientProvider>);
  return client;
}

async function openEditor() {
  const client = renderSection();
  fireEvent.click(await screen.findByRole('button', { name: '编辑' }));
  await screen.findByTestId('runtime-risk-sheet');
  return client;
}

describe('RuntimeRiskSection atomic draft', () => {
  beforeEach(() => { vi.clearAllMocks(); getConfig.mockResolvedValue(structuredClone(baseline)); putConfig.mockResolvedValue(structuredClone(baseline)); });

  it.each([
    ['audit', 'realtime'], ['quarantine', 'realtime'],
    ['audit', 'observe'], ['quarantine', 'observe'],
  ] as const)('blocks a conflicting suspicious %s draft in %s until low risk is adjusted', async (action, mode) => {
    const initial = structuredClone(baseline);
    initial.risk_policy.policies.low = { base_disposition: 'proceed' };
    initial.runtime_policy.run_mode = mode;
    getConfig.mockResolvedValue(initial);
    const user = userEvent.setup();
    await openEditor();
    await user.click(screen.getByTestId('disposition-suspicious'));
    await user.click(await screen.findByTestId(`disposition-option-suspicious-${action}`));
    const error = screen.getByTestId('runtime-policy-error');
    expect(error).toHaveTextContent('可疑');
    expect(error).toHaveTextContent('低风险');
    expect(error).toHaveTextContent('进行下一步');
    expect(screen.getByTestId('runtime-save')).toBeDisabled();
    expect(putConfig).not.toHaveBeenCalled();
    await user.click(screen.getByTestId('disposition-low'));
    await user.click(await screen.findByTestId(`disposition-option-low-${action}`));
    expect(screen.queryByTestId('runtime-policy-error')).not.toBeInTheDocument();
    expect(screen.getByTestId('runtime-save')).toBeEnabled();
    await user.click(screen.getByTestId('runtime-save'));
    await waitFor(() => expect(putConfig).toHaveBeenCalledTimes(1));
    expect(putConfig.mock.calls[0]?.[0].risk_policy.policies.suspicious).toEqual({ base_disposition: action });
    expect(putConfig.mock.calls[0]?.[0].risk_policy.policies.low).toEqual({ base_disposition: action });
  });

  it('explains a real server risk-policy error and keeps the draft', async () => {
    putConfig.mockRejectedValue(new ApiError(400, serverRiskError.error.message, serverRiskError));
    await openEditor();
    fireEvent.click(screen.getByTestId('runtime-save'));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('低风险')));
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('可疑'));
    expect(toast.error).not.toHaveBeenCalledWith('保存失败');
    expect(screen.getByTestId('runtime-risk-sheet')).toBeInTheDocument();
    expect(screen.getByTestId('cutoff-low')).toHaveValue(40);
  });

  it('allows the server maximum cutoff of 100', async () => {
    await openEditor();
    fireEvent.change(screen.getByTestId('cutoff-high'), { target: { value: '100' } });
    expect(screen.getByTestId('runtime-save')).toBeEnabled();
    fireEvent.click(screen.getByTestId('runtime-save'));
    await waitFor(() => expect(putConfig).toHaveBeenCalled());
    expect(putConfig.mock.calls[0]?.[0].risk_policy.cutoffs.high).toBe(100);
  });

  it('renders four rows from three shared cutoffs and only shows mark settings for proceed', async () => {
    await openEditor();
    expect(screen.getByTestId('risk-row-suspicious')).toHaveTextContent('0%–40%');
    expect(screen.getByTestId('risk-row-low')).toHaveTextContent('40%–70%');
    expect(screen.getByTestId('risk-row-medium')).toHaveTextContent('70%–90%');
    expect(screen.getByTestId('risk-row-high')).toHaveTextContent('90%–100%');
    expect(screen.getByTestId('mark-addon-suspicious')).toBeInTheDocument();
    expect(screen.queryByTestId('mark-addon-low')).not.toBeInTheDocument();
    fireEvent.change(screen.getByTestId('cutoff-low'), { target: { value: '35' } });
    expect(screen.getByTestId('risk-row-suspicious')).toHaveTextContent('0%–35%');
    expect(screen.getByTestId('risk-row-low')).toHaveTextContent('35%–70%');
  });

  it('GT-13356: shows the confidence cutoffs as percentages but submits the integer cutoff', async () => {
    const user = userEvent.setup();
    await openEditor();
    for (const cutoff of ['low', 'medium', 'high']) {
      expect(screen.getByTestId(`cutoff-${cutoff}-unit`)).toHaveTextContent('%');
    }
    expect(screen.getByTestId('runtime-risk-sheet')).toHaveTextContent('四档连续覆盖 0%–100%');
    fireEvent.change(screen.getByTestId('cutoff-low'), { target: { value: '35' } });
    await user.click(screen.getByTestId('runtime-save'));
    await waitFor(() => expect(putConfig).toHaveBeenCalled());
    expect(putConfig.mock.calls[0]?.[0].risk_policy.cutoffs).toEqual({ low: 35, medium: 70, high: 90 });
  });

  it('saves runtime and risk domains with one aggregate PUT', async () => {
    await openEditor();
    fireEvent.change(screen.getByTestId('cutoff-low'), { target: { value: '35' } });
    fireEvent.click(screen.getByTestId('runtime-save'));
    await waitFor(() => expect(putConfig).toHaveBeenCalledTimes(1));
    expect(putConfig).toHaveBeenCalledWith(expect.objectContaining({
      risk_policy: expect.objectContaining({ cutoffs: { low: 35, medium: 70, high: 90 }, expected_version: 3 }),
      runtime_policy: expect.objectContaining({ expected_version: 5, timeout_async_enabled: true }),
    }), expect.any(Function));
  });

  it('requires confirmation before disabling timeout auto delivery', async () => {
    const user = userEvent.setup();
    await openEditor();
    const timeoutSwitch = screen.getByTestId('timeout-async-enabled');

    await user.click(timeoutSwitch);
    const dialog = await screen.findByTestId('confirm-dialog');
    expect(dialog).toHaveTextContent('确认关闭超时自动投递？');
    expect(dialog).toHaveTextContent('关闭后超时邮件将不会自动投递，可能延误正常邮件投递。');
    expect(timeoutSwitch).toBeChecked();

    await user.click(screen.getByTestId('confirm-dialog-cancel'));
    await waitFor(() => expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument());
    expect(timeoutSwitch).toBeChecked();

    await user.click(timeoutSwitch);
    await user.click(await screen.findByTestId('confirm-dialog-confirm'));
    expect(timeoutSwitch).not.toBeChecked();

    await user.click(screen.getByTestId('runtime-save'));
    await waitFor(() => expect(putConfig).toHaveBeenCalledWith(expect.objectContaining({
      runtime_policy: expect.objectContaining({ timeout_async_enabled: false }),
    }), expect.any(Function)));
  });

  it('keeps inferred next CAS versions when publication is pending and GET is still stale', async () => {
    putConfig.mockResolvedValue({
      committed: true,
      published: false,
      status: 'publication_pending',
    });
    // Initial load and the background post-save read both see the old snapshot.
    getConfig.mockResolvedValue(structuredClone(baseline));
    const client = await openEditor();
    fireEvent.change(screen.getByTestId('cutoff-low'), { target: { value: '35' } });
    fireEvent.click(screen.getByTestId('runtime-save'));

    await waitFor(() => {
      const cached = client.getQueryData<PhishAgentConfig>(['phish-config', 9]);
      expect(cached?.risk_policy.cutoffs.low).toBe(35);
      expect(cached?.risk_policy.version).toBe(4);
      expect(cached?.runtime_policy.version).toBe(6);
    });
  });

  it('stores native observe without any mark addon', async () => {
    const user = userEvent.setup();
    await openEditor();
    await user.click(screen.getByTestId('run-mode-observe'));
    expect(screen.queryByTestId('observe-mark-enabled')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('runtime-save'));
    await waitFor(() => expect(putConfig).toHaveBeenCalled());
    expect(putConfig.mock.calls[0]?.[0].runtime_policy).toEqual(expect.objectContaining({
      run_mode: 'observe',
      observe_action: 'accept',
      observe_mark_enabled: false,
    }));
  });

  it('observe mode preserves editable policies and the shared timeout switch', async () => {
    const user = userEvent.setup();
    await openEditor();
    await user.click(screen.getByTestId('run-mode-observe'));
    const banner = screen.getByTestId('observe-mode-banner');
    expect(banner).not.toHaveTextContent('隐藏策略值');
    expect(banner).toHaveTextContent('下方处置策略仍可编辑并会保存，切回实时检测后执行');
    expect(banner).toHaveTextContent('「超时后后台续测」设置保持不变');
    expect(screen.getByTestId('disposition-high')).toBeEnabled();
    expect(screen.getByTestId('timeout-async-enabled')).toBeVisible();
    expect(screen.getByTestId('timeout-async-enabled')).toBeChecked();
    await user.click(screen.getByTestId('disposition-high'));
    await user.click(await screen.findByTestId('disposition-option-high-quarantine'));
    await user.click(screen.getByTestId('runtime-save'));
    await waitFor(() => expect(putConfig).toHaveBeenCalled());
    const submitted = putConfig.mock.calls[0]?.[0];
    expect(submitted.runtime_policy).toEqual(expect.objectContaining({ run_mode: 'observe', timeout_async_enabled: true }));
    expect(submitted.risk_policy.policies.high).toEqual({ base_disposition: 'quarantine' });
  });

  it('does not submit hidden mark settings after changing proceed to another disposition', async () => {
    const user = userEvent.setup();
    await openEditor();
    await user.click(screen.getByTestId('disposition-suspicious'));
    await user.click(await screen.findByRole('option', { name: '审核' }));
    await user.click(screen.getByTestId('runtime-save'));

    await waitFor(() => expect(putConfig).toHaveBeenCalled());
    expect(putConfig.mock.calls[0]?.[0].risk_policy.policies.suspicious).toEqual({
      base_disposition: 'audit',
    });
  });

  it('blocks save when an enabled mark has empty or overlong text', async () => {
    await openEditor();
    const markText = screen.getByPlaceholderText('标记文本');
    const save = screen.getByTestId('runtime-save');

    fireEvent.change(markText, { target: { value: '' } });
    expect(save).toBeDisabled();
    expect(screen.getByText('启用附加标记时，标记文本不能为空。')).toBeInTheDocument();

    fireEvent.change(markText, { target: { value: '这是一段明确超过二十个字符的标记文本用于验证' } });
    expect(save).toBeDisabled();
    expect(screen.getByText('标记文本不能超过 20 个字符。')).toBeInTheDocument();
    fireEvent.click(save);
    expect(putConfig).not.toHaveBeenCalled();
  });

  it('allows a background continuation shorter than the realtime wait', async () => {
    await openEditor();
    fireEvent.change(screen.getByTestId('timeout-minutes'), { target: { value: '300' } });
    fireEvent.change(screen.getByTestId('recheck-minutes'), { target: { value: '1' } });
    const save = screen.getByTestId('runtime-save');
    expect(save).toBeEnabled();
    fireEvent.click(save);
    await waitFor(() => expect(putConfig).toHaveBeenCalledWith(expect.objectContaining({
      runtime_policy: expect.objectContaining({ timeout_minutes: 300, max_recheck_minutes: 1 }),
    }), expect.any(Function)));
  });

  it('preserves the local draft on 409 and reloads only after explicit confirmation', async () => {
    const latest = structuredClone(baseline); latest.risk_policy.cutoffs.low = 45; latest.risk_policy.version = 4;
    putConfig.mockRejectedValue(new ApiError(409, 'conflict', { ...latest, error: { code: 'phishing_agent.config_version_conflict', message: 'conflict', params: { conflict_domains: ['risk_policy'] } } }));
    await openEditor();
    fireEvent.change(screen.getByTestId('cutoff-low'), { target: { value: '35' } });
    fireEvent.click(screen.getByTestId('runtime-save'));
    const alert = await screen.findByTestId('runtime-conflict-alert');
    expect(screen.getByTestId('cutoff-low')).toHaveValue(35);
    fireEvent.click(within(alert).getByRole('button', { name: '重载最新配置' }));
    expect(screen.getByTestId('cutoff-low')).toHaveValue(45);
  });

  it('does not treat an unrelated 409 body as a reloadable config conflict', async () => {
    putConfig.mockRejectedValue(new ApiError(409, 'conflict', { error: { code: 'another_conflict', message: 'conflict' } }));
    await openEditor();
    fireEvent.click(screen.getByTestId('runtime-save'));
    await waitFor(() => expect(putConfig).toHaveBeenCalled());
    expect(screen.queryByTestId('runtime-conflict-alert')).not.toBeInTheDocument();
  });
});
