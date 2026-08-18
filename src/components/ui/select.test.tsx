import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './select';

describe('Select test id passthrough', () => {
  it('forwards data-testid from SelectItem to the rendered option', async () => {
    render(
      <Select defaultValue="range">
        <SelectTrigger data-testid="ip-config-type">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="single" data-testid="ip-config-type-option-single">
            Single
          </SelectItem>
          <SelectItem value="range" data-testid="ip-config-type-option-range">
            Range
          </SelectItem>
        </SelectContent>
      </Select>,
    );

    fireEvent.click(screen.getByTestId('ip-config-type'));

    expect(await screen.findByTestId('ip-config-type-option-single')).toHaveAttribute('role', 'option');
  });
});
