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
        </DropdownMenuContent>
      </DropdownMenu>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    const enabled = await screen.findByTestId('enabled-item');
    const disabled = await screen.findByTestId('disabled-item');

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
  });
});
