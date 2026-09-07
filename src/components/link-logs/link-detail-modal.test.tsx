import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { LinkClickLog } from '@/lib/api/link-clicks';
import { LinkDetailModal } from './link-detail-modal';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

const log: LinkClickLog = {
  id: 1,
  message_id: 'message-1',
  occurred_at: '2026-08-31T10:00:00+08:00',
  clicker: 'user@example.com',
  sender: 'sender@example.com',
  subject: 'subject',
  original_url: 'https://example.com/path',
  rewritten_url: 'https://gateway.example/r/1',
  trigger_stage: 'cloud_intel',
  verdict: 'malicious',
  final_result: 'alerted',
  user_action: 'abandoned',
};

describe('LinkDetailModal drawer', () => {
  it('renders a right-side responsive drawer with fixed chrome and a scrolling body', () => {
    render(<LinkDetailModal log={log} open onOpenChange={vi.fn()} />);

    const drawer = screen.getByTestId('link-logs-detail-modal');
    expect(drawer).toHaveAttribute('data-slot', 'sheet-content');
    expect(drawer).toHaveAttribute('data-side', 'right');
    expect(drawer).toHaveClass(
      'flex',
      'flex-col',
      'gap-0',
      'p-0',
      'data-[side=right]:w-full',
      'data-[side=right]:sm:max-w-2xl',
    );
    expect(drawer).not.toHaveClass('overflow-y-auto');

    expect(drawer.querySelector('[data-slot="sheet-header"]')).toHaveClass('shrink-0');

    expect(screen.getByTestId('link-logs-detail-body')).toHaveClass(
      'min-h-0',
      'flex-1',
      'overflow-y-auto',
    );

    expect(drawer.querySelector('[data-slot="sheet-footer"]')).toHaveClass('shrink-0');
  });

  it('closes from the footer action using the existing translated label', () => {
    const onOpenChange = vi.fn();
    render(<LinkDetailModal log={log} open onOpenChange={onOpenChange} />);

    const closeButton = screen.getByTestId('link-logs-detail-close');
    expect(closeButton).toHaveTextContent('linkLogs.close');
    fireEvent.click(closeButton);

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
