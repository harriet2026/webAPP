import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { FieldDef } from '@/types/unified-rules';
import zhMessages from '../../../../messages/zh.json';
import { ConditionConfigPanel } from './ConditionConfigPanel';
import type { ConditionLeaf } from './serde';

// MapKeySelect fetches map objects over the network; stub it so the panel can
// mount for the map_number (similarDomain) step-guide case without any I/O.
vi.mock('@/components/rules/MapKeySelect', () => ({
  MapKeySelect: () => null,
}));

// Faithful next-intl stand-in backed by the REAL zh.json messages. This both
// renders the panel and proves every key the enriched DescriptionCard / number
// section reads actually resolves (dot-path lookup + {var} interpolation +
// .has() existence checks + .raw() array reads), mirroring next-intl semantics.
vi.mock('next-intl', () => {
  const get = (obj: unknown, path: string): unknown =>
    path.split('.').reduce<unknown>((o, k) => (o == null ? undefined : (o as Record<string, unknown>)[k]), obj);
  return {
    useTranslations: (ns: string) => {
      const base = get(zhMessages, ns);
      const fn = ((key: string, values?: Record<string, string | number>) => {
        let v = get(base, key);
        if (typeof v !== 'string') return key;
        if (values) for (const [k, val] of Object.entries(values)) v = (v as string).split(`{${k}}`).join(String(val));
        return v as string;
      }) as ((key: string, values?: Record<string, string | number>) => string) & {
        has: (key: string) => boolean;
        raw: (key: string) => unknown;
      };
      fn.has = (key: string) => get(base, key) != null;
      fn.raw = (key: string) => get(base, key);
      return fn;
    },
  };
});

function leaf(partial: Partial<ConditionLeaf> & { conditionKey: string; field: string }): ConditionLeaf {
  return { id: 'l1', operator: 'gt', value: '', exclude: false, ...partial };
}

function renderPanel(l: ConditionLeaf, fieldDefs: Record<string, FieldDef> = {}) {
  const onChange = vi.fn();
  render(<ConditionConfigPanel leaf={l} fieldDefs={fieldDefs} onChange={onChange} />);
  return { onChange };
}

describe('ConditionConfigPanel enriched guidance', () => {
  // Item 1 + 2: a numeric condition with no hand-written desc subkeys
  // (urlCount) auto-generates the operators hint + example/recommended rows
  // from meta.recommend, and shows the per-panel format row.
  it('auto-generates operators/example/recommended + format rows for numeric conditions', () => {
    renderPanel(leaf({ conditionKey: 'urlCount', field: 'url_count', operator: 'gt', value: '' }));

    expect(screen.getByTestId('desc-format-row')).toBeInTheDocument();
    expect(screen.getByTestId('desc-operators-row').textContent).toContain(
      zhMessages.advancedRulesFeature.v3Conditions.numericOperatorsHint,
    );
    // meta.recommend for urlCount is { mode: 'gt', value: '20' } → both rows carry 20.
    expect(screen.getByTestId('desc-example-row').textContent).toContain('20');
    expect(screen.getByTestId('desc-recommended-row').textContent).toContain('20');
  });

  // Item 3 (default template): the "Apply recommended" button fills the
  // language-invariant recommend template into the leaf via onChange.
  it('applies the recommended threshold when the button is clicked', () => {
    const { onChange } = renderPanel(leaf({ conditionKey: 'urlCount', field: 'url_count', operator: 'gt', value: '' }));

    const btn = screen.getByTestId('config-number-apply-recommended');
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onChange).toHaveBeenCalledWith('l1', { operator: 'gt', value: '20' });
  });

  // Item 2: non-numeric panels still get a format-and-example row, but no
  // auto numeric operators row.
  it('shows a format row for text panels without a numeric operators row', () => {
    renderPanel(leaf({ conditionKey: 'subject', field: 'subject', operator: 'contain', value: '' }));

    const formatRow = screen.getByTestId('desc-format-row');
    expect(formatRow.textContent).toContain(zhMessages.advancedRulesFeature.v3Conditions.formats.text);
    expect(screen.queryByTestId('desc-operators-row')).not.toBeInTheDocument();
  });

  // Item 3 (step guide): map_number conditions (similarDomain) render the
  // numbered "select object → choose comparison → enter threshold" guide.
  it('renders the step guide for map_number (similar domain) conditions', () => {
    renderPanel(
      leaf({ conditionKey: 'similarDomain', field: 'domain_imp', operator: 'le', value: '2', mapKey: '*' }),
      { domain_imp: { type: 'map_number' } as FieldDef },
    );

    const guide = screen.getByTestId('desc-step-guide');
    expect(guide).toBeInTheDocument();
    const steps = zhMessages.advancedRulesFeature.v3Conditions.stepGuideMapNumber;
    expect(guide.querySelectorAll('li')).toHaveLength(steps.length);
    expect(guide.textContent).toContain(steps[0]);
  });
});
