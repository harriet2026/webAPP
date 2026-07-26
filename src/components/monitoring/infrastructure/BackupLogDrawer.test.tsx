import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BackupLogDrawer } from './BackupLogDrawer';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('./hooks', () => ({
  useBackupDetail: (_node: string, _id: string, enabled: boolean) => ({
    data: enabled
      ? {
          id: 'run-1',
          node: 'node-1',
          name: 'database-daily',
          exec_time: '2026-07-23T02:00:00Z',
          duration: 4,
          size: 1024,
          status: 'success',
          log: 'backup completed successfully',
        }
      : undefined,
    isLoading: false,
    isError: false,
  }),
}));

describe('BackupLogDrawer', () => {
  it('loads and renders the backend-provided execution log when opened', async () => {
    const user = userEvent.setup();
    render(
      <BackupLogDrawer
        node="node-1"
        task={{
          id: 'run-1',
          name: 'database-daily',
          exec_time: '2026-07-23T02:00:00Z',
          duration: 4,
          size: 1024,
          status: 'success',
        }}
      />,
    );

    await user.click(screen.getByTestId('monitor-infrastructure-backup-log-run-1'));

    expect(await screen.findByTestId('monitor-infrastructure-backup-log-drawer')).toBeInTheDocument();
    expect(screen.getByTestId('monitor-infrastructure-backup-log-content')).toHaveTextContent(
      'backup completed successfully',
    );
  });
});
