import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import zh from '@/../messages/zh.json';
import { ApiError } from '@/lib/api/client';
import { UnsavedGuardProvider } from '@/contexts/unsaved-guard-context';
import type { PhishAgentConfig } from '@/types/phishing-config';

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
}

async function openEditor() {
  renderSection();
  fireEvent.click(await screen.findByRole('button', { name: '编辑' }));
  return screen.findByTestId('runtime-risk-sheet');
}

describe('RuntimeRiskSection atomic draft', () => {
  beforeEach(() => { vi.clearAllMocks(); getConfig.mockResolvedValue(structuredClone(baseline)); putConfig.mockResolvedValue(structuredClone(baseline)); });

  it('renders four rows from three shared cutoffs and only shows mark settings for proceed', async () => {
    await openEditor();
    expect(screen.getByTestId('risk-row-suspicious')).toHaveTextContent('0–40');
    expect(screen.getByTestId('risk-row-low')).toHaveTextContent('40–70');
    expect(screen.getByTestId('risk-row-medium')).toHaveTextContent('70–90');
    expect(screen.getByTestId('risk-row-high')).toHaveTextContent('90–100');
    expect(screen.getByTestId('mark-addon-suspicious')).toBeInTheDocument();
    expect(screen.queryByTestId('mark-addon-low')).not.toBeInTheDocument();
    fireEvent.change(screen.getByTestId('cutoff-low'), { target: { value: '35' } });
    expect(screen.getByTestId('risk-row-suspicious')).toHaveTextContent('0–35');
    expect(screen.getByTestId('risk-row-low')).toHaveTextContent('35–70');
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

  it('stores observe delivery as accept and marking as an independent flag', async () => {
    const user = userEvent.setup();
    await openEditor();
    await user.click(screen.getByTestId('run-mode-observe'));
    await user.click(screen.getByTestId('observe-mark-enabled'));
    await user.click(screen.getByTestId('runtime-save'));
    await waitFor(() => expect(putConfig).toHaveBeenCalled());
    expect(putConfig.mock.calls[0]?.[0].runtime_policy).toEqual(expect.objectContaining({
      run_mode: 'observe',
      observe_action: 'accept',
      observe_mark_enabled: true,
    }));
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
