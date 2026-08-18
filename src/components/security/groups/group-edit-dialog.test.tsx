import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { GroupEditDialog } from './group-edit-dialog';

// identity translator —— 断言锚在 testid 和 key 上，不依赖译文
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

function renderDialog(overrides: Partial<Parameters<typeof GroupEditDialog>[0]> = {}) {
  return render(
    <GroupEditDialog
      open
      onOpenChange={() => {}}
      initialGroup={null}
      initialType="recipient"
      allowedTypes={['ip', 'sender', 'recipient', 'content']}
      existingNames={[]}
      onSubmit={vi.fn()}
      {...overrides}
    />,
  );
}

// GT-12259：成员是必填项，但保存按钮此前只看名称是否合法。
describe('GroupEditDialog member requirement (GT-12259)', () => {
  it('keeps save disabled when only the name is filled', async () => {
    renderDialog();
    await userEvent.type(screen.getByTestId('group-edit-name'), 'vipgroup');

    expect(screen.getByTestId('group-edit-save')).toBeDisabled();
  });

  it('shows the members-required hint once the form has been touched', async () => {
    renderDialog();
    await userEvent.type(screen.getByTestId('group-edit-name'), 'vipgroup');

    expect(screen.getByTestId('group-edit-members-error')).toHaveTextContent('noMembers');
  });

  it('enables save after a member is entered and clears the hint', async () => {
    renderDialog();
    await userEvent.type(screen.getByTestId('group-edit-name'), 'vipgroup');
    await userEvent.type(screen.getByTestId('group-edit-members'), 'a@corp.com');

    expect(screen.getByTestId('group-edit-save')).toBeEnabled();
    expect(screen.queryByTestId('group-edit-members-error')).not.toBeInTheDocument();
  });

  it('treats whitespace-only members as empty', async () => {
    renderDialog();
    await userEvent.type(screen.getByTestId('group-edit-name'), 'vipgroup');
    await userEvent.type(screen.getByTestId('group-edit-members'), '   ');

    expect(screen.getByTestId('group-edit-save')).toBeDisabled();
    expect(screen.getByTestId('group-edit-members-error')).toBeInTheDocument();
  });
});

// GT-12802：内容组类型下显示匹配范围 (scopes) 选择器，至少要选一个 scope。
// checkbox-checked 辅助：base-ui 的 Checkbox 在选中时挂 data-checked，
// 未选中时挂 data-unchecked；getByTestId 拿到的是包装的 Root 元素。
const isChecked = (el: HTMLElement): boolean => el.hasAttribute('data-checked');

describe('GroupEditDialog content scopes (GT-12802)', () => {
  it('shows scope checkboxes for content type with defaults checked', () => {
    renderDialog({ initialType: 'content' });
    expect(screen.getByTestId('group-edit-content-scopes')).toBeInTheDocument();
    expect(isChecked(screen.getByTestId('group-edit-scope-subject'))).toBe(true);
    expect(isChecked(screen.getByTestId('group-edit-scope-text_body'))).toBe(true);
    expect(isChecked(screen.getByTestId('group-edit-scope-html_body'))).toBe(true);
    expect(screen.getByTestId('group-edit-scope-header')).toBeInTheDocument();
  });

  it('does not show scope checkboxes for non-content types', () => {
    renderDialog({ initialType: 'sender' });
    expect(screen.queryByTestId('group-edit-content-scopes')).not.toBeInTheDocument();
  });

  it('keeps save disabled until at least one scope is chosen', async () => {
    renderDialog({ initialType: 'content' });
    await userEvent.type(screen.getByTestId('group-edit-name'), 'fingroup');
    await userEvent.type(screen.getByTestId('group-edit-members'), 'invoice');
    // 取消全部三个默认 scope
    await userEvent.click(screen.getByTestId('group-edit-scope-subject'));
    await userEvent.click(screen.getByTestId('group-edit-scope-text_body'));
    await userEvent.click(screen.getByTestId('group-edit-scope-html_body'));

    expect(screen.getByTestId('group-edit-save')).toBeDisabled();
    expect(screen.getByTestId('group-edit-scopes-error')).toHaveTextContent('noScopes');

    // 勾回一个，按钮恢复可用
    await userEvent.click(screen.getByTestId('group-edit-scope-subject'));
    expect(screen.getByTestId('group-edit-save')).toBeEnabled();
  });

  it('passes scopes in onSubmit payload', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderDialog({ initialType: 'content', onSubmit });
    await userEvent.type(screen.getByTestId('group-edit-name'), 'fingroup');
    await userEvent.type(screen.getByTestId('group-edit-members'), 'invoice');
    await userEvent.click(screen.getByTestId('group-edit-scope-text_body'));
    await userEvent.click(screen.getByTestId('group-edit-scope-html_body'));
    await userEvent.click(screen.getByTestId('group-edit-save'));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const payload = onSubmit.mock.calls[0][0];
    expect(payload.scopes).toEqual(['subject']);
  });

  it('restores scopes from initialGroup on edit', () => {
    renderDialog({
      initialType: 'content',
      initialGroup: {
        ruleId: 9, name: 'fin', type: 'content', members: ['invoice'],
        scopes: ['header', 'urls'], memberCount: 1, referenceCount: 0,
        isActive: true, createdAt: '', updatedAt: '',
      },
    });
    expect(isChecked(screen.getByTestId('group-edit-scope-header'))).toBe(true);
    expect(isChecked(screen.getByTestId('group-edit-scope-urls'))).toBe(true);
    expect(isChecked(screen.getByTestId('group-edit-scope-subject'))).toBe(false);
  });
});
