import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Button } from './button';
import { InteractiveSurface } from './interactive-surface';

describe('InteractiveSurface', () => {
  it('tracks mouse and pen hover without relying on CSS hover media support', () => {
    render(<InteractiveSurface data-testid="surface">Surface</InteractiveSurface>);
    const surface = screen.getByTestId('surface');

    expect(surface).not.toHaveAttribute('data-hovered');

    fireEvent.pointerEnter(surface, { pointerType: 'mouse' });
    expect(surface).toHaveAttribute('data-hovered', 'true');

    fireEvent.pointerLeave(surface, { pointerType: 'mouse' });
    expect(surface).not.toHaveAttribute('data-hovered');

    fireEvent.pointerEnter(surface, { pointerType: 'pen' });
    expect(surface).toHaveAttribute('data-hovered', 'true');
  });

  it('ignores touch and clears hover when disabled', () => {
    const { rerender } = render(
      <InteractiveSurface data-testid="surface">Surface</InteractiveSurface>,
    );
    const surface = screen.getByTestId('surface');

    fireEvent.pointerEnter(surface, { pointerType: 'touch' });
    expect(surface).not.toHaveAttribute('data-hovered');

    fireEvent.pointerEnter(surface, { pointerType: 'mouse' });
    expect(surface).toHaveAttribute('data-hovered', 'true');

    rerender(
      <InteractiveSurface data-testid="surface" disabled>
        Surface
      </InteractiveSurface>,
    );
    expect(surface).not.toHaveAttribute('data-hovered');
    expect(surface).toHaveAttribute('aria-disabled', 'true');
  });

  it('preserves native semantics with asChild and composes caller handlers', () => {
    const onPointerEnter = vi.fn();
    render(
      <InteractiveSurface asChild variant="text" onPointerEnter={onPointerEnter}>
        <button type="button">Details</button>
      </InteractiveSurface>,
    );
    const button = screen.getByRole('button', { name: 'Details' });

    expect(button.parentElement?.querySelectorAll('button')).toHaveLength(1);
    expect(button).toHaveClass(
      'duration-[120ms]',
      'motion-reduce:transition-none',
      'focus-visible:ring-2',
    );

    fireEvent.pointerEnter(button, { pointerType: 'mouse' });
    expect(onPointerEnter).toHaveBeenCalledOnce();
    expect(button).toHaveAttribute('data-hovered', 'true');
  });

  it('gives shared buttons the same pointer compatibility without layout movement', () => {
    const { rerender } = render(
      <Button variant="outline">Refresh</Button>,
    );
    const button = screen.getByRole('button', { name: 'Refresh' });

    expect(button).not.toHaveClass('active:not-aria-[haspopup]:translate-y-px');
    fireEvent.pointerEnter(button, { pointerType: 'mouse' });
    expect(button).toHaveAttribute('data-hovered', 'true');

    rerender(
      <Button variant="outline" disabled>
        Refresh
      </Button>,
    );
    expect(button).not.toHaveAttribute('data-hovered');
  });
});
