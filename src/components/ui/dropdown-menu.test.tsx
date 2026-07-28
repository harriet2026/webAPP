import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './dropdown-menu';

describe('DropdownMenu interaction feedback', () => {
  it('uses pointer-compatible feedback for enabled items only', async () => {
    render(
      <DropdownMenu>
        <DropdownMenuTrigger render={<button type="button" />}>
          Open
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem data-testid="enabled-item">Enabled</DropdownMenuItem>
          <DropdownMenuItem data-testid="disabled-item" disabled>
            Disabled
          </DropdownMenuItem>
          <DropdownMenuItem data-testid="destructive-item" variant="destructive">
            Destructive
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );

    const trigger = screen.getByRole('button', { name: 'Open' });

    fireEvent.pointerEnter(trigger, { pointerType: 'mouse' });
    expect(trigger).toHaveAttribute('data-hovered', 'true');

    fireEvent.pointerLeave(trigger, { pointerType: 'mouse' });
    expect(trigger).not.toHaveAttribute('data-hovered');

    fireEvent.pointerEnter(trigger, { pointerType: 'touch' });
    expect(trigger).not.toHaveAttribute('data-hovered');

    fireEvent.click(trigger);
    const content = await screen.findByRole('menu');
    const enabled = await screen.findByTestId('enabled-item');
    const disabled = await screen.findByTestId('disabled-item');
    const destructive = await screen.findByTestId('destructive-item');

    expect(content).toHaveClass(
      'duration-[160ms]',
      'motion-reduce:data-open:animate-none',
      'motion-reduce:data-closed:animate-none',
      'data-open:zoom-in-95',
    );
    expect(content.className).not.toContain('slide-in-from');

    expect(enabled).toHaveClass(
      'duration-[180ms]',
      'motion-reduce:transition-none',
      'data-[hovered=true]:bg-accent/70',
    );

    fireEvent.pointerEnter(enabled, { pointerType: 'mouse' });
    expect(enabled).toHaveAttribute('data-hovered', 'true');

    fireEvent.pointerLeave(enabled, { pointerType: 'mouse' });
    expect(enabled).not.toHaveAttribute('data-hovered');

    fireEvent.pointerEnter(enabled, { pointerType: 'touch' });
    expect(enabled).not.toHaveAttribute('data-hovered');

    fireEvent.pointerEnter(disabled, { pointerType: 'mouse' });
    expect(disabled).not.toHaveAttribute('data-hovered');

    expect(destructive).toHaveClass(
      'data-[variant=destructive]:text-danger',
      'data-[variant=destructive]:*:[svg]:text-danger',
    );
  });
});
