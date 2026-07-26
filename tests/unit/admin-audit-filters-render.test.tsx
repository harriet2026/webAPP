import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

import { AdminAuditFilters, EMPTY_ADMIN_FILTERS } from '@/components/admin-audit/admin-audit-filters';

// next-intl key-passthrough: t('common.all') renders the key string 'common.all',
// which lets us assert *which* i18n key each control is wired to without needing
// the full message catalogue.
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({
    hasPermission: () => true,
    isSystemAdmin: true,
    showAdvancedRules: true,
    canSeeRoute: () => true,
  }),
}));

vi.mock('@/contexts/product-form-context', () => ({
  useProductForm: () => ({ capabilities: null, registry: {}, viewer: 'platform', grants: {} }),
}));

// The visibility helpers depend on the product-form registry; stub them so the
// filter renders its module groups deterministically (empty groups are fine —
// this test only cares about the three category dropdowns' default state).
vi.mock('@/components/layout/sidebar-visibility', () => ({
  visibleNavIds: () => [],
  isNavItemAllowed: () => true,
}));

const noop = () => {};

function renderFilters() {
  return render(
    <AdminAuditFilters value={EMPTY_ADMIN_FILTERS} onChange={noop} onReset={noop} />,
  );
}

describe('AdminAuditFilters — html_spec §2.3 alignment', () => {
  it('GT-12439: the three category dropdowns default to the "全部" placeholder (common.all), not the field name', () => {
    const { container } = renderFilters();
    // Base UI renders the placeholder inside the trigger when no value is selected.
    // With EMPTY_ADMIN_FILTERS every category filter is unselected, so each trigger
    // must show the common.all key — never adminAudit.filter.module/opType/result.
    const triggers = container.querySelectorAll('[data-slot="select-value"]');
    const texts = Array.from(triggers).map((el) => el.textContent);
    expect(texts).toContain('common.all');
    expect(texts).not.toContain('adminAudit.filter.module');
    expect(texts).not.toContain('adminAudit.filter.opType');
    expect(texts).not.toContain('adminAudit.filter.result');
  });

  it('GT-12439: each filter control carries a field label above it (prototype label-above structure)', () => {
    const { container } = renderFilters();
    const labels = Array.from(container.querySelectorAll('label')).map((l) => l.textContent);
    expect(labels).toEqual(
      expect.arrayContaining([
        'adminAudit.filter.keyword',
        'adminAudit.filter.module',
        'adminAudit.filter.opType',
        'adminAudit.filter.result',
      ]),
    );
  });

  it('GT-12440: the reset button is text-only (no RotateCcw icon)', () => {
    const { container } = renderFilters();
    // The reset button is the only <button> that is not a select trigger.
    const resetBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'adminAudit.filter.reset',
    );
    expect(resetBtn).toBeTruthy();
    // A lucide RotateCcw would render an <svg> child; the prototype button has none.
    expect(resetBtn?.querySelector('svg')).toBeNull();
  });
});
