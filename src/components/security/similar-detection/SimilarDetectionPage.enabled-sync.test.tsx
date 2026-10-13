import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { defaultConfig } from './defaults';
import { SimilarDetectionPage } from './SimilarDetectionPage';
import type { SimilarDetectionConfig, SimilarDetectionDirectionConfig } from './types';

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
    value,
    onChange,
  }: {
    direction: string;
    value: SimilarDetectionDirectionConfig;
    onChange: (patch: Record<string, unknown>) => void;
  }) => (
    <div>
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
      <button
        data-testid={`test-direction-${direction}-toggle-subject-tag`}
        onClick={() => onChange({
          action: 'accept',
          observe_mode: false,
          tag_subject_enabled: !value.tag_subject_enabled,
          tag_subject_position: 'prefix',
          tag_subject_content: '[GT-14250]',
          tag_header_enabled: false,
          tag_body_enabled: false,
        })}
      >
        toggle subject tag
      </button>
      <span data-testid={`test-direction-${direction}-subject-tag-state`}>
        {value.tag_subject_enabled ? 'on' : 'off'}
      </span>
    </div>
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
  it('preserves the untouched detection type null directions on save (GT-14442)', async () => {
    const config = {
      ...defaultConfig(),
      direction_settings: {
        similar_email: { mode: 'separate' as const, enabled_directions: ['receive' as const] },
        same_subject: { mode: 'aggregate' as const, enabled_directions: null },
      },
    };
    mocks.getSimilarDetection.mockResolvedValue(config);
    mocks.apiRequest.mockResolvedValue({ ...config, version: 1 });
    render(<SimilarDetectionPage embedded />);
    fireEvent.click(await screen.findByTestId('similar-detection-mode-aggregate'));
    fireEvent.click(screen.getByTestId('similar-detection-save'));
    await waitFor(() => expect(mocks.apiRequest).toHaveBeenCalled());
    expect(mocks.apiRequest.mock.calls[0][1].body.direction_settings.same_subject).toEqual({
      mode: 'aggregate', enabled_directions: null,
    });
  });

  it('keeps the other detection tab mode and directions unchanged (GT-14442)', async () => {
    mocks.apiRequest.mockResolvedValue({ ...defaultConfig(), version: 1 });
    render(<SimilarDetectionPage embedded />);
    fireEvent.click(await screen.findByTestId('similar-detection-mode-aggregate'));
    fireEvent.click(screen.getByTestId('similar-detection-tab-same-subject'));
    expect(await screen.findByTestId('similar-detection-mode-separate')).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByTestId('similar-detection-dir-receive'));
    fireEvent.click(screen.getByTestId('similar-detection-dir-internal'));
    fireEvent.click(screen.getByTestId('similar-detection-tab-similar-email'));
    expect(await screen.findByTestId('similar-detection-mode-aggregate')).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByTestId('similar-detection-save'));
    await waitFor(() => expect(mocks.apiRequest).toHaveBeenCalled());
    expect(mocks.apiRequest.mock.calls[0][1].body.direction_settings).toEqual({
      similar_email: { mode: 'aggregate', enabled_directions: ['receive', 'send', 'internal'] },
      same_subject: { mode: 'separate', enabled_directions: ['send'] },
    });
  });

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

  it('preserves a newer tag edit when the previous save response arrives late (GT-14250)', async () => {
    const initial = defaultConfig();
    initial.enabled_directions = ['receive'];
    initial.similar_email.receive = {
      ...initial.similar_email.receive,
      action: 'accept',
      observe_mode: false,
      tag_subject_enabled: false,
      tag_header_enabled: false,
      tag_body_enabled: false,
    };
    mocks.getSimilarDetection.mockResolvedValue(initial);

    let resolveFirstSave!: (value: SimilarDetectionConfig) => void;
    const taggedSaved: SimilarDetectionConfig = {
      ...initial,
      version: 1,
      similar_email: {
        ...initial.similar_email,
        receive: {
          ...initial.similar_email.receive,
          tag_subject_enabled: true,
          tag_subject_position: 'prefix',
          tag_subject_content: '[GT-14250]',
        },
      },
    };
    const untaggedSaved: SimilarDetectionConfig = {
      ...taggedSaved,
      version: 2,
      similar_email: {
        ...taggedSaved.similar_email,
        receive: {
          ...taggedSaved.similar_email.receive,
          tag_subject_enabled: false,
        },
      },
    };
    mocks.apiRequest
      .mockImplementationOnce(() => new Promise<SimilarDetectionConfig>((resolve) => {
        resolveFirstSave = resolve;
      }))
      .mockResolvedValueOnce(untaggedSaved);

    render(<SimilarDetectionPage embedded />);
    const toggle = await screen.findByTestId('test-direction-receive-toggle-subject-tag');
    fireEvent.click(toggle);
    fireEvent.click(screen.getByTestId('similar-detection-save'));
    await waitFor(() => expect(mocks.apiRequest).toHaveBeenCalledTimes(1));
    expect(mocks.apiRequest.mock.calls[0][1].body.similar_email.receive.tag_subject_enabled).toBe(true);

    // Reproduce the real UI sequence: the administrator disables the last tag
    // while the first save response is still in flight.
    fireEvent.click(toggle);
    expect(screen.getByTestId('test-direction-receive-subject-tag-state')).toHaveTextContent('off');
    resolveFirstSave(taggedSaved);

    await waitFor(() => expect(screen.getByTestId('similar-detection-save')).toBeEnabled());
    expect(screen.getByTestId('test-direction-receive-subject-tag-state')).toHaveTextContent('off');
    fireEvent.click(screen.getByTestId('similar-detection-save'));

    await waitFor(() => expect(mocks.apiRequest).toHaveBeenCalledTimes(2));
    expect(mocks.apiRequest.mock.calls[1][1].body).toMatchObject({
      expected_version: 1,
      similar_email: {
        receive: {
          action: 'accept',
          tag_subject_enabled: false,
          tag_header_enabled: false,
          tag_body_enabled: false,
        },
      },
    });
  });

  it('does not restore a tag from a late publication refresh after a newer edit (GT-14250)', async () => {
    const initial = defaultConfig();
    initial.enabled_directions = ['receive'];
    initial.similar_email.receive = {
      ...initial.similar_email.receive,
      action: 'accept',
      observe_mode: false,
      tag_subject_enabled: false,
      tag_header_enabled: false,
      tag_body_enabled: false,
    };
    const taggedSaved: SimilarDetectionConfig = {
      ...initial,
      version: 1,
      similar_email: {
        ...initial.similar_email,
        receive: {
          ...initial.similar_email.receive,
          tag_subject_enabled: true,
          tag_subject_position: 'prefix',
          tag_subject_content: '[GT-14250]',
        },
      },
    };
    let resolvePublicationRefresh!: (value: SimilarDetectionConfig) => void;
    mocks.getSimilarDetection
      .mockResolvedValueOnce(initial)
      .mockImplementationOnce(() => new Promise<SimilarDetectionConfig>((resolve) => {
        resolvePublicationRefresh = resolve;
      }));
    mocks.apiRequest.mockResolvedValueOnce({
      committed: true,
      published: false,
      status: 'publication_pending',
    });

    render(<SimilarDetectionPage embedded />);
    const toggle = await screen.findByTestId('test-direction-receive-toggle-subject-tag');
    fireEvent.click(toggle);
    fireEvent.click(screen.getByTestId('similar-detection-save'));
    await waitFor(() => expect(mocks.getSimilarDetection).toHaveBeenCalledTimes(2));

    fireEvent.click(toggle);
    expect(screen.getByTestId('test-direction-receive-subject-tag-state')).toHaveTextContent('off');
    resolvePublicationRefresh(taggedSaved);

    await waitFor(() => expect(screen.getByTestId('similar-detection-save')).toBeEnabled());
    expect(screen.getByTestId('test-direction-receive-subject-tag-state')).toHaveTextContent('off');
  });

  it('saves independent aggregate config for both detection tabs (GT-14271)', async () => {
    mocks.apiRequest.mockResolvedValue({ ...defaultConfig(), mode: 'aggregate', version: 1 });
    render(<SimilarDetectionPage embedded />);

    await waitFor(() => expect(mocks.getSimilarDetection).toHaveBeenCalled());
    fireEvent.click(await screen.findByTestId('similar-detection-mode-aggregate'));
    fireEvent.click(screen.getByTestId('test-aggregate-similar_email'));
    fireEvent.click(screen.getByTestId('similar-detection-tab-same-subject'));
    // Each detection tab now owns its mode; select aggregate on this tab too.
    fireEvent.click(await screen.findByTestId('similar-detection-mode-aggregate'));
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
