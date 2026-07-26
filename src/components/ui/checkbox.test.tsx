import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Checkbox } from './checkbox';

describe('Checkbox', () => {
  it('renders CheckIcon and data-checked when checked (existing behavior unchanged)', () => {
    const { container } = render(<Checkbox checked readOnly />);
    const root = screen.getByRole('checkbox');
    expect(root).toHaveAttribute('data-checked');
    expect(container.querySelector('svg.lucide-check')).not.toBeNull();
    expect(container.querySelector('svg.lucide-minus')).toBeNull();
  });

  it('renders MinusIcon and data-indeterminate when indeterminate', () => {
    const { container } = render(<Checkbox indeterminate readOnly />);
    const root = screen.getByRole('checkbox');
    expect(root).toHaveAttribute('data-indeterminate');
    expect(container.querySelector('svg.lucide-minus')).not.toBeNull();
    expect(container.querySelector('svg.lucide-check')).toBeNull();
  });

  it('renders no indicator icon when unchecked and not indeterminate', () => {
    const { container } = render(<Checkbox readOnly />);
    const root = screen.getByRole('checkbox');
    expect(root).toHaveAttribute('data-unchecked');
    expect(container.querySelector('svg')).toBeNull();
  });
});
