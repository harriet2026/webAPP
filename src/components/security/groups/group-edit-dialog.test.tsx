import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { GroupEditDialog } from './group-edit-dialog';

// identity translator —— 断言锚在 testid 和 key 上，不依赖译文
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

function renderDialog() {
  return render(
    <GroupEditDialog
      open
      onOpenChange={() => {}}
      initialGroup={null}
      initialType="recipient"
      allowedTypes={['ip', 'sender', 'recipient', 'content']}
      existingNames={[]}
      onSubmit={vi.fn()}
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
