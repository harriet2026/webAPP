import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Input } from './input';

describe('Input interaction feedback', () => {
  it('tracks mouse and pen hover, ignores touch, and composes handlers', () => {
    const onPointerEnter = vi.fn();
    render(<Input aria-label="Search" onPointerEnter={onPointerEnter} />);
    const input = screen.getByRole('textbox', { name: 'Search' });

    expect(input).not.toHaveAttribute('data-hovered');
    expect(input).toHaveClass(
      'duration-[180ms]',
      'motion-reduce:transition-none',
      'focus-visible:ring-3',
    );

    fireEvent.pointerEnter(input, { pointerType: 'mouse' });
    expect(onPointerEnter).toHaveBeenCalledOnce();
    expect(input).toHaveAttribute('data-hovered', 'true');

    fireEvent.pointerLeave(input, { pointerType: 'mouse' });
    expect(input).not.toHaveAttribute('data-hovered');

    fireEvent.pointerEnter(input, { pointerType: 'touch' });
    expect(input).not.toHaveAttribute('data-hovered');

    fireEvent.pointerEnter(input, { pointerType: 'pen' });
    expect(input).toHaveAttribute('data-hovered', 'true');
  });

  it('does not apply hover state while disabled', () => {
    render(<Input aria-label="Disabled search" disabled />);
    const input = screen.getByRole('textbox', { name: 'Disabled search' });

    fireEvent.pointerEnter(input, { pointerType: 'mouse' });
    expect(input).not.toHaveAttribute('data-hovered');
  });
});
