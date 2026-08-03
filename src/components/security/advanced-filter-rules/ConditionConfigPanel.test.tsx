import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { FieldDef } from '@/types/unified-rules';
import zhMessages from '../../../../messages/zh.json';
import { ConditionConfigPanel } from './ConditionConfigPanel';
import { createDefaultLeaf } from './ConditionTree';
import { CONDITIONS } from './catalogue';
import type { ConditionLeaf } from './serde';

// MapKeySelect fetches map objects over the network; stub it so the panel can
// mount for the map_number (similarDomain) step-guide case without any I/O.
vi.mock('@/components/rules/MapKeySelect', () => ({
  MapKeySelect: () => null,
}));

// OrgDepartmentSection (senderOrganization / orgDept panel) pulls department
// rows from the org address book via useApiRequest + react-query. Stub both so
// the panel mounts with a fixed 2-level tree and no network / provider.
vi.mock('@/lib/api/client', () => ({
  useApiRequest: () => ({ apiRequest: vi.fn() }),
}));
vi.mock('@/lib/api/contacts', () => ({
  listContactDepartments: vi.fn(),
}));
const ORG_DEPT_ROWS = [
  { path: '研发中心', member_count: 2, source_names: [] },
  { path: '研发中心 / 后端组', member_count: 3, source_names: [] },
  { path: '研发中心 / 前端组', member_count: 4, source_names: [] },
  { path: '市场部', member_count: 1, source_names: [] },
];
vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryFn }: { queryFn: () => unknown }) => {
    void queryFn;
    // Return the raw rows directly; buildDepartmentTree runs inside the panel.
    return { data: ORG_DEPT_ROWS };
  },
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

  // senderOrganization (orgDept panel) renders the org-address-book department
  // tree instead of a bare text box, proving the org-contacts联动 is wired.
  it('renders the org department tree for senderOrganization (发件组织)', () => {
    renderPanel(leaf({ conditionKey: 'senderOrganization', field: 'sender_dept_path', operator: 'within', value: '' }));

    expect(screen.getByTestId('config-orgdept')).toBeInTheDocument();
    expect(screen.getByTestId('config-orgdept-search')).toBeInTheDocument();
    // Root departments derived from the address book rows are shown.
    expect(screen.getByTestId('config-orgdept-node-研发中心')).toBeInTheDocument();
    expect(screen.getByTestId('config-orgdept-node-市场部')).toBeInTheDocument();
  });

  // Selecting a parent department writes the parent + all descendant paths into
  // the leaf via onChange with operator 'within' — the "选父含子孙" semantics.
  it('selecting a parent department cascades to all descendants (选父含子孙)', () => {
    const { onChange } = renderPanel(
      leaf({ conditionKey: 'senderOrganization', field: 'sender_dept_path', operator: 'within', value: '' }),
    );

    fireEvent.click(screen.getByTestId('config-orgdept-toggle-研发中心'));

    expect(onChange).toHaveBeenCalledTimes(1);
    const [, patch] = onChange.mock.calls[0];
    expect(patch.operator).toBe('within');
    // Compare as an unordered set: locale collation of 后/前 is irrelevant here,
    // what matters is the parent + both descendants are all present.
    const paths = new Set((patch.value as string).split('\n'));
    expect(paths).toEqual(new Set(['研发中心', '研发中心 / 后端组', '研发中心 / 前端组']));
  });

  // encryptedAttachment (加密附件) is a boolean select field: when its fieldDef
  // reports type 'boolean' the panel renders the 是/否 dropdown (not a text box),
  // and picking a value emits operator 'eq' with the raw boolean token.
  it('renders a 是/否 dropdown for the boolean 加密附件 field, not free text', () => {
    const { onChange } = renderPanel(
      leaf({ conditionKey: 'encryptedAttachment', field: 'is_encrypted_attachment', operator: 'eq', value: 'true' }),
      { is_encrypted_attachment: { type: 'boolean' } as FieldDef },
    );

    expect(screen.getByTestId('config-boolean-value')).toBeInTheDocument();
    // No free-text value box for this condition.
    expect(screen.queryByTestId('config-text-values')).not.toBeInTheDocument();
    expect(screen.getByTestId('config-boolean-value').textContent).toContain(
      zhMessages.advancedRulesFeature.v3Conditions.booleanTrue,
    );
  });

  // createDefaultLeaf pre-seeds boolean fields with operator 'eq' and value
  // 'true' so a freshly-added 加密附件 condition is complete and matches what the
  // 是/否 dropdown shows (no "shows 是 but data empty / marked incomplete" split).
  it('createDefaultLeaf seeds boolean fields with eq/true', () => {
    const def = CONDITIONS.find((c) => c.key === 'encryptedAttachment')!;
    const l = createDefaultLeaf(def, { is_encrypted_attachment: { type: 'boolean' } as FieldDef });
    expect(l.operator).toBe('eq');
    expect(l.value).toBe('true');
    expect(l.field).toBe('is_encrypted_attachment');
  });

  // imageQrCodeResult (二维码OCR结果) is a fixed-value enum: the panel renders an
  // enum dropdown (config-enum-single), never the free-text StringEqualsSection.
  it('renders an enum dropdown for 二维码OCR结果, not free text', () => {
    renderPanel(
      leaf({ conditionKey: 'imageQrCodeResult', field: 'image_qr_code_result', operator: 'eq', value: '' }),
      { image_qr_code_result: { type: 'enum' } as FieldDef },
    );

    expect(screen.getByTestId('config-enum-single')).toBeInTheDocument();
    expect(screen.queryByTestId('config-string-eq-value')).not.toBeInTheDocument();
  });

  // In multi (matchAny → within) mode the option labels render inline and are
  // localized via v3Conditions.qrResultValues.* (e.g. success → 成功),
  // proving the enum values go through the project i18n framework, not raw token.
  it('localizes 二维码OCR结果 enum labels through i18n', () => {
    renderPanel(
      leaf({ conditionKey: 'imageQrCodeResult', field: 'image_qr_code_result', operator: 'within', value: '' }),
      { image_qr_code_result: { type: 'enum' } as FieldDef },
    );

    const multi = screen.getByTestId('config-enum-multi');
    expect(multi.textContent).toContain(
      zhMessages.advancedRulesFeature.v3Conditions.qrResultValues.success,
    );
    expect(multi.textContent).toContain(
      zhMessages.advancedRulesFeature.v3Conditions.qrResultValues.fail,
    );
    // Raw token must not leak when a localized label exists.
    expect(multi.textContent).not.toContain('success');
  });

  // mailFromFromConsistency (信封-头 From 一致性) is a fixed-value enum: the panel
  // renders an enum dropdown, never the free-text StringEqualsSection.
  it('renders an enum dropdown for 信封-头 From 一致性, not free text', () => {
    renderPanel(
      leaf({ conditionKey: 'mailFromFromConsistency', field: 'envelope_header_mismatch', operator: 'eq', value: '' }),
      { envelope_header_mismatch: { type: 'enum' } as FieldDef },
    );

    expect(screen.getByTestId('config-enum-single')).toBeInTheDocument();
    expect(screen.queryByTestId('config-string-eq-value')).not.toBeInTheDocument();
  });

  // In multi (within) mode the labels render inline and are localized via
  // v3Conditions.envelopeHeaderConsistencyValues.* (match → 一致, mismatch →
  // 不一致), proving the values go through the project i18n framework.
  it('localizes 信封-头 From 一致性 enum labels through i18n (一致/不一致)', () => {
    renderPanel(
      leaf({ conditionKey: 'mailFromFromConsistency', field: 'envelope_header_mismatch', operator: 'within', value: '' }),
      { envelope_header_mismatch: { type: 'enum' } as FieldDef },
    );

    const multi = screen.getByTestId('config-enum-multi');
    expect(multi.textContent).toContain(
      zhMessages.advancedRulesFeature.v3Conditions.envelopeHeaderConsistencyValues.match,
    );
    expect(multi.textContent).toContain(
      zhMessages.advancedRulesFeature.v3Conditions.envelopeHeaderConsistencyValues.mismatch,
    );
    // Raw token must not leak when a localized label exists.
    expect(multi.textContent).not.toContain('mismatch');
  });
});
