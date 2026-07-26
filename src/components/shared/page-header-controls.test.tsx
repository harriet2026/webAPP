import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Select, SelectValue } from '@/components/ui/select';
import {
  PageHeaderActionButton,
  PageHeaderSelectTrigger,
} from './page-header-controls';

describe('page header controls', () => {
  it('uses the demo action-button typography and surface treatment', () => {
    render(<PageHeaderActionButton>刷新</PageHeaderActionButton>);

    expect(screen.getByRole('button', { name: '刷新' })).toHaveClass(
      'h-8',
      'border',
      'rounded-lg',
      'px-2.5',
      'text-sm',
      'leading-5',
      'font-medium',
      'transition-all',
      'duration-150',
      'ease-in-out',
    );
  });

  it('uses the demo select-trigger spacing, shadow, and dimensions', () => {
    render(
      <Select defaultValue="today">
        <PageHeaderSelectTrigger>
          <SelectValue />
        </PageHeaderSelectTrigger>
      </Select>,
    );

    expect(screen.getByRole('combobox')).toHaveClass(
      'w-32',
      'gap-2',
      'rounded-lg',
      'px-3',
      'shadow-xs',
      'data-[size=default]:h-9',
      'duration-150',
      'ease-in-out',
    );
  });
});
