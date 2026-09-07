import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_IMAGE_DETECT_ACTIONS,
  DEFAULT_IMAGE_DETECT_CONFIG,
  DEFAULT_QR_DEEP_ROUTES,
  ImageDetectTab,
} from './ImageDetectTab';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

describe('ImageDetectTab OCR mode select', () => {
  it('fills its field and opens an anchor-width, left-aligned menu', async () => {
    render(
      <ImageDetectTab
        config={DEFAULT_IMAGE_DETECT_CONFIG}
        routes={DEFAULT_QR_DEEP_ROUTES}
        actions={DEFAULT_IMAGE_DETECT_ACTIONS}
        onChange={vi.fn()}
        onRoutesChange={vi.fn()}
        onActionsChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId('ocr-detection-mode')).toHaveClass('w-full');
    fireEvent.click(screen.getByTestId('ocr-detection-mode'));

    const popup = await screen.findByTestId('ocr-detection-mode-options');
    expect(popup).toHaveClass('w-(--anchor-width)');
    expect(popup).not.toHaveClass('w-max');
    expect(popup.className).not.toContain('--radix-select-trigger-width');
    expect(popup.parentElement).toHaveAttribute('data-align', 'start');
  });
});
