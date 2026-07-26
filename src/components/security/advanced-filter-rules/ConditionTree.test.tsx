import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConditionTree } from './ConditionTree';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => ({
    'v3Conditions.category_mailBasic': '邮件基础信息',
    'v3Conditions.category_attachment': '附件相关',
    'v3Conditions.category_security': '安全检测',
    'v3Conditions.conditions.sender': '发件人 (From)',
    'v3Conditions.conditions.subject': '主题',
  }[key] ?? key),
}));

function renderTree() {
  return render(
    <ConditionTree
      groups={{ any: [], all: [] }}
      fieldDefs={{}}
      activeGroup="any"
      onActiveGroupChange={vi.fn()}
      selectedLeafId={null}
      onSelectLeaf={vi.fn()}
      onRemoveLeaf={vi.fn()}
      onAddCondition={vi.fn()}
    />,
  );
}

describe('ConditionTree catalogue navigation', () => {
  it('allows the initially open mail-basic category to collapse and reopen', () => {
    renderTree();
    const trigger = screen.getByTestId('condition-category-mailBasic');
    const subject = screen.getByTestId('condition-button-subject');

    expect(subject).toBeVisible();
    fireEvent.click(trigger);
    expect(subject).not.toBeVisible();
    fireEvent.click(trigger);
    expect(screen.getByTestId('condition-button-subject')).toBeVisible();
  });

  it('returns only conditions in a matching category when searching by its visible name', () => {
    renderTree();
    fireEvent.change(screen.getByTestId('condition-search'), {
      target: { value: '邮件基础信息' },
    });

    expect(screen.getByTestId('condition-button-subject')).toBeVisible();
    expect(screen.getByTestId('condition-button-sender')).toBeVisible();
    expect(screen.queryByTestId('condition-category-attachment')).not.toBeInTheDocument();
    expect(screen.queryByTestId('condition-category-security')).not.toBeInTheDocument();
  });

  it('shows an empty-result hint instead of empty category headings', () => {
    renderTree();
    fireEvent.change(screen.getByTestId('condition-search'), {
      target: { value: '不存在的条件' },
    });

    expect(screen.getByTestId('condition-search-empty')).toBeVisible();
    expect(screen.queryByTestId('condition-category-mailBasic')).not.toBeInTheDocument();
  });
});
