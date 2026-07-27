import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SegmentedControl } from '@/components/shared/segmented-control';

describe('security overview segmented filters keyboard focus (GT-12479)', () => {
  it('exposes radio semantics and a stable focus-visible ring to keyboard users', async () => {
    const user = userEvent.setup();
    render(
      <SegmentedControl
        value="all"
        onChange={vi.fn()}
        options={[
          { value: 'all', label: '全部' },
          { value: 'receive', label: '接收' },
        ]}
      />,
    );

    const all = screen.getByRole('button', { name: '全部' });
    const receive = screen.getByRole('button', { name: '接收' });
    expect(all).toHaveAttribute('aria-pressed', 'true');
    expect(receive).toHaveClass('focus-visible:ring-2', 'focus-visible:ring-ring');
    await user.tab();
    expect(all).toHaveFocus();
  });
});
