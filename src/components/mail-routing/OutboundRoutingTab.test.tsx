import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import zh from '@/../messages/zh.json';
import { OutboundRoutingTab } from './OutboundRoutingTab';
import type { Rule, RuleNode } from '@/types/unified-rules';

// GT-12321: the tab used to force `is_outbound = true` into every saved rule and
// to silently drop whatever is_outbound condition the operator had written. A
// receive-direction rule was therefore impossible to express here, so inbound
// mail could never be routed through proxysvr. The direction condition is now
// entirely the operator's to write — the tab must submit the condition tree
// exactly as built.

const mockApiRequest = vi.fn();
// ConditionTreeBuilder pulls the field registry through useApiRequest.
const mockFieldRequest = vi.fn().mockResolvedValue({ fields: {} });
vi.mock('@/lib/api/client', () => ({
  useScopedApiRequest: () => ({ apiRequest: mockApiRequest }),
  useApiRequest: () => ({ apiRequest: mockFieldRequest }),
}));

const mockGetUnifiedRules = vi.fn();
vi.mock('@/lib/api/unified-rules', () => ({
  getUnifiedRules: (...args: unknown[]) => mockGetUnifiedRules(...args),
  deleteUnifiedRule: vi.fn(),
  toggleUnifiedRule: vi.fn(),
  getFieldDefinitions: vi.fn().mockResolvedValue({ fields: {} }),
}));

vi.mock('@/lib/api/proxysvr', () => ({
  listActiveProxysvrGroups: vi.fn().mockResolvedValue([{ id: 38, name: 'group-38' }]),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

/** A rule the operator wrote for the RECEIVE direction. */
const receiveDirectionTree: RuleNode = {
  type: 'AND',
  children: [
    { type: 'condition', field: 'is_outbound', operator: 'eq', value: 'false' },
    { type: 'condition', field: 'recipient_domain', operator: 'eq', value: 'osgateway.local' },
  ],
};

const inboundRule: Rule = {
  id: 5958,
  name: 'inbound to proxysvr',
  priority: 100,
  is_active: true,
  rule_class: 'route',
  stage: 'data',
  condition_tree: JSON.stringify(receiveDirectionTree),
  metadata: JSON.stringify({ channel: 'proxysvr', proxysvr_group_id: 38 }),
} as unknown as Rule;

function wrap(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={zh as unknown as Record<string, unknown>}>
        {ui}
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}

/** Collects every is_outbound condition anywhere in the submitted tree. */
function isOutboundValues(node: RuleNode): string[] {
  if (node.type === 'condition') {
    return node.field === 'is_outbound' ? [String(node.value)] : [];
  }
  return (node.children ?? []).flatMap(isOutboundValues);
}

describe('OutboundRoutingTab submit payload', () => {
  beforeEach(() => {
    mockApiRequest.mockReset().mockResolvedValue({});
    mockGetUnifiedRules.mockReset().mockResolvedValue([inboundRule]);
  });

  it('preserves a receive-direction rule instead of forcing is_outbound = true', async () => {
    const user = userEvent.setup();
    render(wrap(<OutboundRoutingTab tenantId={697} />));

    await screen.findByText('inbound to proxysvr');
    // The row's actions are [toggle, edit, delete]; the edit (pencil) is index 1.
    const rowButtons = screen.getAllByRole('button');
    const editButton = rowButtons.find((b) => b.querySelector('svg.lucide-pencil'))!;
    await user.click(editButton);

    await screen.findByRole('dialog');
    await user.click(screen.getByRole('button', { name: /保存|确定|提交/ }));

    await waitFor(() => expect(mockApiRequest).toHaveBeenCalled());
    const [url, opts] = mockApiRequest.mock.calls[0];
    expect(url).toBe('/unified-rules/5958');
    const submitted = (opts as { body: { condition_tree: RuleNode } }).body.condition_tree;

    // The operator wrote is_outbound = false. It must survive the round-trip,
    // and nothing may add an is_outbound = true alongside it.
    expect(isOutboundValues(submitted)).toEqual(['false']);
  });
});
