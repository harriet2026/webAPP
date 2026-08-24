import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';
import type { ApiRequestFn } from '@/lib/api/client';
import type { DisposalBasis, DisposalBasisGroupSummary } from '@/types/email-disposal';
import { DisposalBasisCell } from './disposal-basis-cell';

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) =>
    (key: string, params?: Record<string, unknown>) =>
      params ? `${namespace}.${key}:${JSON.stringify(params)}` : `${namespace}.${key}`,
}));

vi.mock('@/contexts/product-form-context', () => ({
  useProductForm: () => ({ viewer: 'platform', capabilities: { multiTenant: true } }),
}));

const rootBasis: DisposalBasis = {
  policy_key: 'CR',
  rule_name: '正文规则',
  rule_id: 'CR-66',
  action: 'quarantine',
  hit_values: { match_position: 'subject', matched_content: '发票' },
};

const summaries: DisposalBasisGroupSummary[] = [
  {
    policy_key: 'CR',
    recipient_count: 2,
    effective_count: 1,
    effective_known: true,
    entries: [{
      rule_name: '正文规则', rule_id: 'CR-66', action: 'quarantine',
      recipient_count: 2, effective_count: 1, effective_known: true,
      hit_values: rootBasis.hit_values,
    }],
  },
  {
    policy_key: 'IPBL',
    recipient_count: 1,
    effective_count: 0,
    effective_known: true,
    entries: [{
      rule_name: '来源黑名单', rule_id: 'IPBL-11', action: 'reject',
      recipient_count: 1, effective_count: 0, effective_known: true,
      hit_values: { source_ip: '203.0.113.7' },
    }],
  },
  {
    policy_key: 'ACF',
    recipient_count: 1,
    effective_count: 1,
    effective_known: true,
    entries: [{
      rule_name: '财务审核', rule_id: 'ACF-2', action: 'audit',
      recipient_count: 1, effective_count: 1, effective_known: true,
    }],
  },
];

function renderCell(requestFn: ApiRequestFn) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <DisposalBasisCell
          mailLogId={42}
          basis={rootBasis}
          groups={summaries}
          reason="fallback"
          lang="zh"
          requestFn={requestFn}
          highlightRuleIds={['IPBL-11']}
        />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

describe('DisposalBasisCell (GT-12935)', () => {
  it('does not resurrect reason text when structured facts contain only proceed hits', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <TooltipProvider>
          <DisposalBasisCell
            mailLogId={99}
            basis={{
              modules: [{
                policy_key: 'AUTH', rule_id: 'AUTH-22', action: 'proceed',
                recipients: ['qfliu@dm163.cacter.com'], effective_for: [],
              }],
            }}
            groups={undefined}
            reason="accepted by rules: 22"
            lang="zh"
            requestFn={vi.fn() as unknown as ApiRequestFn}
          />
        </TooltipProvider>
      </QueryClientProvider>,
    );
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByText('accepted by rules: 22')).not.toBeInTheDocument();
  });

  it('renders from the lightweight summary and does not load details while closed', () => {
    const requestFn = vi.fn();
    renderCell(requestFn as unknown as ApiRequestFn);

    expect(screen.getByTestId('disposal-basis-42')).toHaveTextContent('内容规则');
    expect(requestFn).not.toHaveBeenCalled();
  });

  it('loads full modules only when opened and excludes hit-only rules from disposition basis', async () => {
    const requestFn = vi.fn().mockResolvedValue({
      id: 42,
      disposal_basis: {
        ...rootBasis,
        modules: [
          {
            ...rootBasis,
            recipients: ['a@example.com', 'b@example.com'],
            effective_for: ['b@example.com'],
          },
          {
            policy_key: 'IPBL',
            rule_name: '来源黑名单',
            rule_id: 'IPBL-11',
            action: 'reject',
            hit_values: { source_ip: '203.0.113.7' },
            recipients: ['a@example.com'],
            effective_for: [],
          },
          {
            policy_key: 'ACF',
            rule_name: '财务审核',
            rule_id: 'ACF-2',
            action: 'audit',
            recipients: ['c@example.com'],
            effective_for: ['c@example.com'],
          },
        ],
      },
    });
    renderCell(requestFn as unknown as ApiRequestFn);
    expect(requestFn).not.toHaveBeenCalled();

    fireEvent.focus(screen.getByTestId('disposal-basis-42'));

    await waitFor(() => expect(requestFn).toHaveBeenCalledWith('/mail-logs/42'));
    const hitOnlyLines = await screen.findAllByText(/a@example\.com/);
    expect(hitOnlyLines).toHaveLength(1);
    expect(hitOnlyLines.every((line) =>
      line.textContent?.includes('emailDisposal.table.disposalBasisState.hitOnly')))
      .toBe(true);
    expect(screen.getByText(/b@example\.com/)).toHaveTextContent(
      'emailDisposal.table.disposalBasisState.effective',
    );
    expect(screen.getByText(/c@example\.com/)).toHaveTextContent(
      'emailDisposal.table.disposalBasisState.effective',
    );
    expect(screen.queryByTestId('disposal-basis-group-IPBL')).not.toBeInTheDocument();
  });

  it('highlights a second rule in the same policy group and lazy-loads its details', async () => {
    const requestFn = vi.fn().mockResolvedValue({
      id: 42,
      disposal_basis: {
        ...rootBasis,
        modules: [
          { ...rootBasis, recipients: ['a@example.com'] },
          {
            policy_key: 'CR',
            rule_name: '付款规则',
            rule_id: 'CR-77',
            action: 'audit',
            recipients: ['b@example.com'],
            effective_for: ['b@example.com'],
          },
        ],
      },
    });
    const singlePolicySummaries: DisposalBasisGroupSummary[] = [{
      policy_key: 'CR',
      recipient_count: 2,
      effective_count: 1,
      effective_known: true,
      entries: [
        {
          rule_name: '正文规则', rule_id: 'CR-66', action: 'quarantine',
          recipient_count: 1, effective_count: 0, effective_known: false,
        },
        {
          rule_name: '付款规则', rule_id: 'CR-77', action: 'audit',
          recipient_count: 1, effective_count: 1, effective_known: true,
        },
      ],
    }];
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <TooltipProvider>
          <DisposalBasisCell
            mailLogId={42}
            basis={rootBasis}
            groups={singlePolicySummaries}
            reason="fallback"
            lang="zh"
            requestFn={requestFn as unknown as ApiRequestFn}
            highlightRuleIds={['CR-77']}
          />
        </TooltipProvider>
      </QueryClientProvider>,
    );

    expect(screen.getByTestId('disposal-basis-42')).toHaveTextContent('付款规则');
    expect(requestFn).not.toHaveBeenCalled();

    fireEvent.focus(screen.getByTestId('disposal-basis-42'));
    await waitFor(() => expect(requestFn).toHaveBeenCalledWith('/mail-logs/42'));
    expect(await screen.findByText(/b@example\.com/)).toHaveTextContent('CR-77');
  });
});
