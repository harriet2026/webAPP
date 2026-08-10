import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import zh from '@/../messages/zh.json';
import type { PhishTenantEngineParams, PhishBand } from '@/types/phishing-config';
import type { DisposalSettings } from '@/types/disposal-settings';

const apiRequestMock = vi.fn();
const getEngineConfigMock = vi.fn();
const putEngineConfigMock = vi.fn();
const getBandsMock = vi.fn();
const putBandsMock = vi.fn();
const getDisposalSettingsMock = vi.fn();
const putDisposalSettingsMock = vi.fn();
const toastSuccess = vi.fn();
const toastError = vi.fn();

vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

vi.mock('@/lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/client')>();
  return {
    ...actual,
    useApiRequest: () => ({ apiRequest: apiRequestMock }),
  };
});

vi.mock('@/lib/api/phishing-config', () => ({
  getEngineConfig: (...args: unknown[]) => getEngineConfigMock(...args),
  putEngineConfig: (...args: unknown[]) => putEngineConfigMock(...args),
  getBands: (...args: unknown[]) => getBandsMock(...args),
  putBands: (...args: unknown[]) => putBandsMock(...args),
}));

vi.mock('@/lib/api/disposal-settings', () => ({
  getDisposalSettings: (...args: unknown[]) => getDisposalSettingsMock(...args),
  putDisposalSettings: (...args: unknown[]) => putDisposalSettingsMock(...args),
}));

import { DispositionPolicyCard } from './disposition-policy-card';

function makeEngine(overrides: Partial<PhishTenantEngineParams> = {}): PhishTenantEngineParams {
  return {
    netdisk_domain: true,
    netdisk_extract: true,
    netdisk_spoof: true,
    run_mode: 'realtime',
    observe_action: 'mark',
    protection_level: 'standard',
    ...overrides,
  };
}

function makeDisposal(overrides: Partial<DisposalSettings['review']> = {}): DisposalSettings {
  return {
    quarantine: {
      category_notify: {},
      notify_frequency: 'daily',
      custom_weekdays: [],
      notify_times: [],
      permissions: {},
      recipient_group_ids: [],
      department_paths: [],
    },
    review: {
      duration_mode: 'custom',
      custom_minutes: 10,
      max_recheck_minutes: 20,
      timeout_auto_deliver: true,
      sender_notify_on_queue: false,
      sender_notify_on_result: false,
      reviewer_emails: [],
      reviewer_notify_interval_minutes: 15,
      reviewer_active_start: '09:00',
      reviewer_active_end: '18:00',
      timeout_temp_disposal: 'deliver',
      timeout_mark_positions: [],
      timeout_mark_text: '',
      ...overrides,
    },
    recall: {
      task_timeout_seconds: 60,
      threat_intel: { read_policy: 'recall', unread_policy: 'recall' },
      ai_detection: { read_policy: 'recall', unread_policy: 'recall' },
      notify_emails: [],
      notify_frequency: 'realtime',
    },
  };
}

const STANDARD_BANDS: PhishBand[] = [
  { min: 0, max: 40, disposition: 'mark' },
  { min: 40, max: 70, disposition: 'mark', mark_positions: ['subject_prefix'], mark_text: '[可疑]' },
  { min: 70, max: 90, disposition: 'quarantine' },
  { min: 90, max: 100, disposition: 'quarantine' },
];

function renderCard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <NextIntlClientProvider locale="zh" messages={zh as never}>
      <QueryClientProvider client={client}>
        <DispositionPolicyCard />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getEngineConfigMock.mockResolvedValue({ engine: makeEngine(), version: 1 });
  getBandsMock.mockResolvedValue(STANDARD_BANDS);
  getDisposalSettingsMock.mockResolvedValue(makeDisposal());
  putEngineConfigMock.mockResolvedValue(undefined);
  putBandsMock.mockResolvedValue(undefined);
  putDisposalSettingsMock.mockResolvedValue(makeDisposal());
});

describe('DispositionPolicyCard summary + drawer (智能体调查与处置)', () => {
  it('renders the renamed title and a read-only realtime summary on the collapsed card', async () => {
    renderCard();

    expect(await screen.findByText('智能体调查与处置')).toBeInTheDocument();
    expect(await screen.findByTestId('run-mode-badge')).toHaveTextContent('实时检测');
    expect(screen.queryByTestId('disposition-edit-sheet')).not.toBeInTheDocument();
  });

  it('shows the observe-mode banner and observe-action summary when baseline is observe mode', async () => {
    getEngineConfigMock.mockResolvedValue({
      engine: makeEngine({ run_mode: 'observe', observe_action: 'mark' }),
      version: 1,
    });
    renderCard();

    expect(await screen.findByTestId('observe-mode-banner')).toBeInTheDocument();
    expect(screen.getByTestId('run-mode-badge')).toHaveTextContent('观察模式');
    expect(screen.getByTestId('run-mode-summary')).toHaveTextContent('观察动作：标记');
  });

  it('opens the drawer with a cloned draft and discards edits on Cancel without calling any PUT', async () => {
    renderCard();

    fireEvent.click(await screen.findByTestId('policy-edit'));
    expect(await screen.findByTestId('disposition-edit-sheet')).toBeInTheDocument();

    // Switch to observe mode inside the drawer draft only.
    fireEvent.click(screen.getByTestId('run-mode-observe'));
    expect(await screen.findByTestId('sheet-observe-banner')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('policy-cancel'));

    await waitFor(() => expect(screen.queryByTestId('disposition-edit-sheet')).not.toBeInTheDocument());
    expect(putEngineConfigMock).not.toHaveBeenCalled();
    expect(putBandsMock).not.toHaveBeenCalled();
    expect(putDisposalSettingsMock).not.toHaveBeenCalled();

    // Baseline summary is unchanged after discarding.
    expect(screen.getByTestId('run-mode-badge')).toHaveTextContent('实时检测');
  });

  it('submits engine, bands, and disposal drafts together when Save is clicked', async () => {
    renderCard();

    fireEvent.click(await screen.findByTestId('policy-edit'));
    await screen.findByTestId('disposition-edit-sheet');

    fireEvent.click(screen.getByTestId('policy-save'));

    await waitFor(() => expect(putEngineConfigMock).toHaveBeenCalledTimes(1));
    expect(putEngineConfigMock).toHaveBeenCalledWith(
      expect.objectContaining({ protection_level: 'standard' }),
      apiRequestMock,
    );
    expect(putBandsMock).toHaveBeenCalledTimes(1);
    expect(putDisposalSettingsMock).toHaveBeenCalledTimes(1);
    expect(toastSuccess).toHaveBeenCalled();

    await waitFor(() => expect(screen.queryByTestId('disposition-edit-sheet')).not.toBeInTheDocument());
  });

  it('only shows the "标记" action for timeout temp disposal (no picker, no deliver/by_result options)', async () => {
    renderCard();

    fireEvent.click(await screen.findByTestId('policy-edit'));
    await screen.findByTestId('disposition-edit-sheet');

    // The old Select is gone; the mark config (text + positions) is always shown.
    expect(screen.queryByTestId('timeout-temp-select')).not.toBeInTheDocument();
    expect(screen.queryByTestId('timeout-temp-deliver')).not.toBeInTheDocument();
    expect(screen.queryByTestId('timeout-temp-by_result')).not.toBeInTheDocument();
    expect(screen.getByTestId('timeout-temp-mark-config')).toBeInTheDocument();
    expect(screen.getByTestId('timeout-mark-text')).toBeInTheDocument();
    expect(screen.getByTestId('timeout-mark-pos-subject_prefix')).toBeInTheDocument();
    expect(screen.getByTestId('timeout-mark-pos-header')).toBeInTheDocument();
  });

  it('does not render a "正文" mark position option', async () => {
    renderCard();

    fireEvent.click(await screen.findByTestId('policy-edit'));
    await screen.findByTestId('disposition-edit-sheet');

    expect(screen.queryByTestId('timeout-mark-pos-body')).not.toBeInTheDocument();
  });

  it('hides "超时临时处置" when "启用超时异步处理" is off, and shows it when on', async () => {
    getDisposalSettingsMock.mockResolvedValue(makeDisposal({ timeout_auto_deliver: false }));
    renderCard();

    fireEvent.click(await screen.findByTestId('policy-edit'));
    await screen.findByTestId('disposition-edit-sheet');

    // Off by baseline: the section is hidden.
    expect(screen.queryByTestId('timeout-temp-disposal-section')).not.toBeInTheDocument();

    // Turning the switch on reveals it.
    fireEvent.click(screen.getByTestId('auto-deliver-switch'));
    expect(await screen.findByTestId('timeout-temp-disposal-section')).toBeInTheDocument();

    // Turning it back off prompts a confirmation; confirming hides the section again.
    fireEvent.click(screen.getByTestId('auto-deliver-switch'));
    fireEvent.click(await screen.findByTestId('timeout-close-confirm'));
    await waitFor(() => expect(screen.queryByTestId('timeout-temp-disposal-section')).not.toBeInTheDocument());
  });

  it('normalizes a legacy timeout_temp_disposal baseline (e.g. "deliver") to "mark" on save', async () => {
    getDisposalSettingsMock.mockResolvedValue(makeDisposal({ timeout_temp_disposal: 'deliver' }));
    renderCard();

    fireEvent.click(await screen.findByTestId('policy-edit'));
    await screen.findByTestId('disposition-edit-sheet');

    fireEvent.click(screen.getByTestId('policy-save'));

    await waitFor(() => expect(putDisposalSettingsMock).toHaveBeenCalledTimes(1));
    expect(putDisposalSettingsMock).toHaveBeenCalledWith(
      expect.objectContaining({ review: expect.objectContaining({ timeout_temp_disposal: 'mark' }) }),
      apiRequestMock,
    );
  });

  it('offers "进行下一步/审核/隔离/拒收/丢弃" as band disposition options, with no "放行" option', async () => {
    renderCard();

    fireEvent.click(await screen.findByTestId('policy-edit'));
    await screen.findByTestId('disposition-edit-sheet');

    const select = screen.getByTestId('band-disposition-0-native') as HTMLSelectElement;
    const optionTexts = Array.from(select.options).map((o) => o.text);
    expect(optionTexts).toEqual(['进行下一步', '审核', '隔离', '拒收', '丢弃']);
    expect(optionTexts).not.toContain('放行');
  });

  it('normalizes a legacy band disposition baseline (e.g. "accept") to "mark" on save', async () => {
    getBandsMock.mockResolvedValue([
      { min: 0, max: 40, disposition: 'accept' },
      { min: 40, max: 100, disposition: 'quarantine' },
    ]);
    renderCard();

    fireEvent.click(await screen.findByTestId('policy-edit'));
    await screen.findByTestId('disposition-edit-sheet');

    // The drawer's select for that band already reflects the normalized value.
    const select = screen.getByTestId('band-disposition-0-native') as HTMLSelectElement;
    expect(select.value).toBe('mark');

    fireEvent.click(screen.getByTestId('policy-save'));

    await waitFor(() => expect(putBandsMock).toHaveBeenCalledTimes(1));
    expect(putBandsMock).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ min: 0, max: 40, disposition: 'mark' })]),
      apiRequestMock,
    );
  });
});
