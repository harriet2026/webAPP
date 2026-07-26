import { render, screen } from '@testing-library/react';
import { AlertTriangle, CheckCircle2, ShieldAlert } from 'lucide-react';
import { describe, expect, it } from 'vitest';

import { StatusBanner } from './status-banner';

describe('status banner', () => {
  it('uses the compact demo geometry without a floating-card shadow', () => {
    render(
      <StatusBanner tone="danger" icon={ShieldAlert}>
        检测到 3 项紧急事件待处理
      </StatusBanner>,
    );

    const banner = screen.getByRole('status');

    expect(banner).toHaveAttribute('data-slot', 'status-banner');
    expect(banner).toHaveClass(
      'gap-3',
      'rounded-lg',
      'border',
      'px-4',
      'py-3',
      'text-sm',
      'font-medium',
      'border-red-200',
      'bg-red-50',
      'text-red-600',
    );
    expect(banner).not.toHaveClass('rounded-2xl', 'px-5', 'py-4', 'shadow-sm');
    expect(banner.querySelector('svg')).toHaveClass('size-5', 'shrink-0');
    expect(screen.getByText('检测到 3 项紧急事件待处理')).toHaveClass('text-pretty');
  });

  it.each([
    ['warning', AlertTriangle, 'border-orange-200', 'bg-orange-50', 'text-orange-600'],
    ['success', CheckCircle2, 'border-green-200', 'bg-green-50', 'text-green-600'],
  ] as const)('provides the %s semantic treatment', (tone, icon, border, background, text) => {
    render(
      <StatusBanner tone={tone} icon={icon}>
        Status
      </StatusBanner>,
    );

    expect(screen.getByRole('status')).toHaveClass(border, background, text);
  });
});
