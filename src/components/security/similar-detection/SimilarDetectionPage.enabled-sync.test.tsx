import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { defaultConfig } from './defaults';
import { SimilarDetectionPage } from './SimilarDetectionPage';

const mocks = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  getSimilarDetection: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('sonner', () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess },
}));

vi.mock('@/lib/api/client', async (orig) => {
  const actual = await orig<typeof import('@/lib/api/client')>();
  return {
    ...actual,
    useApiRequest: () => ({ apiRequest: mocks.apiRequest }),
  };
});

vi.mock('@/lib/api/use-api-error-message', () => ({
  useApiErrorMessage: () => (_error: unknown, fallback: string) => fallback,
}));

vi.mock('@/lib/api/similar-detection', async (orig) => {
  const actual = await orig<typeof import('@/lib/api/similar-detection')>();
  return {
    ...actual,
    getSimilarDetection: mocks.getSimilarDetection,
  };
});

vi.mock('./DirectionCard', () => ({
  DirectionCard: ({
    direction,
    onChange,
  }: {
    direction: string;
    onChange: (patch: Record<string, unknown>) => void;
  }) => (
    <button
      data-testid={`test-direction-${direction}-accept-without-tags`}
      onClick={() => onChange({
        action: 'accept',
        observe_mode: false,
        tag_subject_enabled: false,
        tag_header_enabled: false,
        tag_body_enabled: false,
      })}
    >
      accept without tags
    </button>
  ),
}));
vi.mock('./AggregateCard', () => ({
  AggregateCard: ({
    detectionType,
    onChange,
  }: {
    detectionType: 'similar_email' | 'same_subject';
    onChange: (patch: Record<string, unknown>) => void;
  }) => (
    <button
      data-testid={`test-aggregate-${detectionType}`}
      onClick={() => onChange({
        window_minutes: detectionType === 'similar_email' ? 15 : 120,
        min_count: detectionType === 'similar_email' ? 3 : 50,
        action: detectionType === 'similar_email' ? 'audit' : 'discard',
      })}
    >
      update aggregate
    </button>
  ),
}));

vi.mock('@/components/security/ModuleMasterSwitch', () => ({
  ModuleMasterSwitch: ({
    children,
    onEnabledChange,
  }: {
    children: React.ReactNode;
    onEnabledChange?: (enabled: boolean) => void;
  }) => (
    <div>
      <button
        data-testid="similar-detection-master-toggle"
        onClick={() => onEnabledChange?.(false)}
      >
        toggle
      </button>
      {children}
    </div>
  ),
}));

beforeEach(() => {
  mocks.apiRequest.mockReset();
  mocks.getSimilarDetection.mockReset();
  mocks.toastError.mockReset();
  mocks.toastSuccess.mockReset();
  mocks.getSimilarDetection.mockResolvedValue(defaultConfig());
});

describe('SimilarDetectionPage', () => {
  it('reports module switch changes to the policy-pipeline host', async () => {
    const onEnabledChange = vi.fn();
    render(<SimilarDetectionPage embedded onEnabledChange={onEnabledChange} />);

    await waitFor(() => expect(mocks.getSimilarDetection).toHaveBeenCalled());
    fireEvent.click(await screen.findByTestId('similar-detection-master-toggle'));

    expect(onEnabledChange).toHaveBeenCalledWith(false);
  });

  it('shows the localized save-success message after the configuration is committed (GT-14248)', async () => {
    mocks.apiRequest.mockResolvedValue({ ...defaultConfig(), mode: 'aggregate', version: 1 });
    render(<SimilarDetectionPage embedded />);

    await waitFor(() => expect(mocks.getSimilarDetection).toHaveBeenCalled());
    fireEvent.click(await screen.findByTestId('similar-detection-mode-aggregate'));
    fireEvent.click(screen.getByTestId('similar-detection-save'));

    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith('saveSuccess'));
  });

  it('allows saving accept with all optional tags disabled (GT-14250)', async () => {
    mocks.apiRequest.mockResolvedValue({ ...defaultConfig(), version: 1 });
    render(<SimilarDetectionPage embedded />);

    await waitFor(() => expect(mocks.getSimilarDetection).toHaveBeenCalled());
    fireEvent.click(
      await screen.findByTestId('test-direction-receive-accept-without-tags'),
    );
    fireEvent.click(screen.getByTestId('similar-detection-save'));

    await waitFor(() => expect(mocks.apiRequest).toHaveBeenCalled());
    const [, request] = mocks.apiRequest.mock.calls[0];
    expect(request.body.similar_email.receive).toMatchObject({
      action: 'accept',
      observe_mode: false,
      tag_subject_enabled: false,
      tag_header_enabled: false,
      tag_body_enabled: false,
    });
    expect(mocks.toastError).not.toHaveBeenCalled();
    expect(mocks.toastSuccess).toHaveBeenCalledWith('saveSuccess');
  });

  it('saves independent aggregate config for both detection tabs (GT-14271)', async () => {
    mocks.apiRequest.mockResolvedValue({ ...defaultConfig(), mode: 'aggregate', version: 1 });
    render(<SimilarDetectionPage embedded />);

    await waitFor(() => expect(mocks.getSimilarDetection).toHaveBeenCalled());
    fireEvent.click(await screen.findByTestId('similar-detection-mode-aggregate'));
    fireEvent.click(screen.getByTestId('test-aggregate-similar_email'));
    fireEvent.click(screen.getByTestId('similar-detection-tab-same-subject'));
    fireEvent.click(await screen.findByTestId('test-aggregate-same_subject'));
    fireEvent.click(screen.getByTestId('similar-detection-save'));

    await waitFor(() => expect(mocks.apiRequest).toHaveBeenCalled());
    const [, request] = mocks.apiRequest.mock.calls[0];
    expect(request.body.similar_email.aggregate).toMatchObject({
      window_minutes: 15,
      min_count: 3,
      action: 'audit',
    });
    expect(request.body.same_subject.aggregate).toMatchObject({
      window_minutes: 120,
      min_count: 50,
      action: 'discard',
    });
    expect(request.body.aggregate).toEqual(request.body.similar_email.aggregate);
    expect(mocks.toastError).not.toHaveBeenCalled();
  });
});
