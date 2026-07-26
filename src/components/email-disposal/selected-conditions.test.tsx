import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import type { DisposalQuickFilter } from '@/types/email-disposal';
import type { AdvancedFilter } from '@/types/log';
import { SelectedConditions } from './selected-conditions';

// Identity translator: chip assertions key off the translated label text, so
// this returns the raw i18n key (namespace-qualified) rather than resolving
// real zh/en/th/ru copy — keeps the test decoupled from messages/*.json content.
vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) => `${namespace}.${key}`,
  useLocale: () => 'zh',
}));

const emptyAdvanced: AdvancedFilter = { operator: 'AND', groups: [] };

function baseQuick(overrides: Partial<DisposalQuickFilter> = {}): DisposalQuickFilter {
  return { ...overrides };
}

describe('SelectedConditions - multi-value quick filter chips (review finding 3/7)', () => {
  it('renders one chip per selected mail type', () => {
    render(
      <SelectedConditions
        quick={baseQuick({ emailTypes: ['spam', 'phishing'] })}
        advanced={emptyAdvanced}
        aiConditions={[]}
        onClearAll={vi.fn()}
        onRemoveChip={vi.fn()}
      />,
    );
    expect(screen.getByText(/emailDisposal\.filters\.mailTypes\.spam/)).toBeInTheDocument();
    expect(screen.getByText(/emailDisposal\.filters\.mailTypes\.phishing/)).toBeInTheDocument();
  });

  it('renders one chip per selected disposal policy key with the module name', () => {
    render(
      <SelectedConditions
        quick={baseQuick({ disposalPolicyKeys: ['IPBL', 'CR'] })}
        advanced={emptyAdvanced}
        aiConditions={[]}
        onClearAll={vi.fn()}
        onRemoveChip={vi.fn()}
      />,
    );
    expect(screen.getByText(/IP黑白名单/)).toBeInTheDocument();
    expect(screen.getByText(/内容规则/)).toBeInTheDocument();
  });

  it('removing one mail-type chip calls onRemoveChip with a per-value key, leaving the other value alone', async () => {
    const onRemoveChip = vi.fn();
    render(
      <SelectedConditions
        quick={baseQuick({ emailTypes: ['spam', 'phishing'] })}
        advanced={emptyAdvanced}
        aiConditions={[]}
        onClearAll={vi.fn()}
        onRemoveChip={onRemoveChip}
      />,
    );
    const removeButtons = screen.getAllByRole('button', {
      name: /emailDisposal\.search\.clearAll:/,
    });
    await userEvent.click(removeButtons[0]);
    expect(onRemoveChip).toHaveBeenCalledWith('q-emailTypes:spam');
  });

  it('removing one disposal-policy-key chip calls onRemoveChip with a per-value key', async () => {
    const onRemoveChip = vi.fn();
    render(
      <SelectedConditions
        quick={baseQuick({ disposalPolicyKeys: ['IPBL', 'CR'] })}
        advanced={emptyAdvanced}
        aiConditions={[]}
        onClearAll={vi.fn()}
        onRemoveChip={onRemoveChip}
      />,
    );
    const removeButtons = screen.getAllByRole('button', {
      name: /emailDisposal\.search\.clearAll:/,
    });
    await userEvent.click(removeButtons[1]);
    expect(onRemoveChip).toHaveBeenCalledWith('q-disposalPolicyKeys:CR');
  });

  it('renders nothing when there are no conditions', () => {
    const { container } = render(
      <SelectedConditions
        quick={baseQuick()}
        advanced={emptyAdvanced}
        aiConditions={[]}
        onClearAll={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('uses shared pointer feedback for removable condition controls', () => {
    render(
      <SelectedConditions
        quick={baseQuick({ emailTypes: ['spam'] })}
        advanced={emptyAdvanced}
        aiConditions={[]}
        onClearAll={vi.fn()}
        onRemoveChip={vi.fn()}
      />,
    );
    const remove = screen.getByRole('button', {
      name: /emailDisposal\.search\.clearAll:/,
    });

    fireEvent.pointerEnter(remove, { pointerType: 'mouse' });
    expect(remove).toHaveAttribute('data-hovered', 'true');
    fireEvent.pointerLeave(remove, { pointerType: 'mouse' });
    expect(remove).not.toHaveAttribute('data-hovered');
  });
});
