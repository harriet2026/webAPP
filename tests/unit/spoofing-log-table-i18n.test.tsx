import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import zh from '../../messages/zh.json';

// jsdom has no ResizeObserver; OverflowCell uses it.
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

// Resolve against the REAL messages, mimicking next-intl's behavior of
// returning the full "namespace.key" path when a key is missing. This catches
// the P1-4 class of bug: the component referencing a key path that does not
// exist in the message catalog (e.g. `method.*` instead of `spoofMethod.*`),
// which leaks a raw key string into the UI instead of the localized label.
vi.mock('next-intl', () => ({
  useTranslations: (ns: string) => (key: string) => {
    const root = (zh as Record<string, unknown>)[ns] ?? {};
    const val = key
      .split('.')
      .reduce<unknown>((o, k) => (o == null ? undefined : (o as Record<string, unknown>)[k]), root);
    return typeof val === 'string' ? val : `${ns}.${key}`;
  },
}));

import { SpoofingLogTable } from '@/components/spoofing-detection/spoofing-log-table';
import type { SpoofingLogItem } from '@/types/spoofing-detection';

const row: SpoofingLogItem = {
  id: 'sideline:1',
  kind: 'sideline',
  message_id: 'm1',
  sender: 'attacker@evil.com',
  subject: 'wire transfer',
  recipients: ['victim@example.com'],
  direction: 'receive',
  sidelined_at: '2026-06-22T00:00:00Z',
  confidence: 0.9,
  disposition: 'mark',
  actionable: true,
  target_name: 'CEO',
  target_type: 'person',
  spoof_methods: ['display_name_spoof'],
};

describe('SpoofingLogTable i18n', () => {
  it('resolves spoof method + target type labels without leaking raw key paths', () => {
    render(
      <SpoofingLogTable
        data={[row]}
        canEdit
        onOpenDetail={() => {}}
        onBlock={() => {}}
        onExempt={() => {}}
      />,
    );

    // spoofMethod.display_name_spoof and target.person both localize to this label.
    expect(screen.getAllByText('发信人名称仿冒').length).toBeGreaterThanOrEqual(2);

    // No raw key path must leak into the rendered table.
    const leaked = screen.queryByText(
      (t) => t.includes('method.') || t.includes('targetType.') || t.includes('spoofingDetection.'),
    );
    expect(leaked).toBeNull();
  });
});
