import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { toast } from 'sonner';
import type { RecipientDisposition } from '@/types/email-disposal-detail';
import { RecipientStatus } from './recipient-status';

// Identity translator that keeps params visible in the rendered/returned
// string (as `namespace.key:{"a":1}`) instead of resolving to real zh/en/th/ru
// copy -- this test asserts on stable key+param shapes, not on translated
// text, so it stays decoupled from messages/*.json content (mirrors
// tenant-selector.test.tsx's simpler identity-mock, extended with param
// interpolation since recipientStatus.bulkResult/selected use {n}/{success}/
// {failed} placeholders).
// GT-12628: SenderActions/useRecipientDisposition 现从 useAuth 取角色决定
// 规则 priority（tenant_admin 上限 1000），测试按平台管理员形态 mock。
vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ isSystemAdmin: true }),
}));

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string, params?: Record<string, unknown>) => (
    params ? `${namespace}.${key}:${JSON.stringify(params)}` : `${namespace}.${key}`
  ),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

vi.mock('../lib/disposal-detail-api', () => ({
  // 真实实现（GT-12601/GT-12628）：按角色给 5000/1000，mock 同语义。
  disposalRulePriority: (isSystemAdmin: boolean) => (isSystemAdmin ? 5000 : 1000),
  addSenderFilterRule: vi.fn(),
  disposeByObject: vi.fn(),
  // RA-5: 隔离/阻断's own dispatch path (dispatchQuarantineOrBlock in
  // hooks/use-recipient-disposition.tsx) calls this instead of
  // disposeByObject.
  disposeObjectAction: vi.fn(),
  disposeOne: vi.fn(),
  notifyRecipient: vi.fn(),
}));

vi.mock('../lib/disposal-api', () => ({
  recallMails: vi.fn(),
}));

// Bypasses ReclassifyDialog's own Select-driven reclassify-type UI (untested
// here on purpose -- it has its own coverage, and its base-ui Select popup
// needs floating-ui positioning that jsdom doesn't implement) so this file
// can focus on recipient-status.tsx's OWN dispatch orchestration: which API
// calls fire, in what shape, and how success/failure is aggregated into
// toasts + the failures panel.
vi.mock('./reclassify-dialog', () => ({
  ReclassifyDialog: ({ open, onConfirm }: { open: boolean; onConfirm: (finalType: string | undefined) => void }) => (
    open ? <button type="button" onClick={() => onConfirm(undefined)}>mock-reclassify-confirm</button> : null
  ),
}));

import { disposeByObject, disposeObjectAction, notifyRecipient } from '../lib/disposal-detail-api';
import { recallMails } from '../lib/disposal-api';

const mockDisposeByObject = disposeByObject as unknown as ReturnType<typeof vi.fn>;
const mockDisposeObjectAction = disposeObjectAction as unknown as ReturnType<typeof vi.fn>;
const mockNotifyRecipient = notifyRecipient as unknown as ReturnType<typeof vi.fn>;
const mockRecallMails = recallMails as unknown as ReturnType<typeof vi.fn>;

function baseProps(dispositions: RecipientDisposition[]) {
  return {
    recipient_dispositions: dispositions,
    mailLogId: 42,
    sender: 'sender@example.com',
    apiRequest: vi.fn() as never,
    onDisposed: vi.fn(),
    readOnly: false,
  };
}

describe('RecipientStatus dispatch flow', () => {
  beforeEach(() => {
    mockDisposeByObject.mockReset();
    mockDisposeObjectAction.mockReset();
    mockNotifyRecipient.mockReset();
    mockRecallMails.mockReset();
    (toast.success as ReturnType<typeof vi.fn>).mockReset();
    (toast.error as ReturnType<typeof vi.fn>).mockReset();
    (toast.warning as ReturnType<typeof vi.fn>).mockReset();
  });

  it('multi-object batch deliver: partial failure aggregates into "N succeeded / M failed" and lists the failed recipient', async () => {
    const user = userEvent.setup();
    const dispositions: RecipientDisposition[] = [
      { recipient: 'ok@test.local', final_action: 'sideline', status: 'quarantined', object_kind: 'quarantine', object_id: 'obj-ok' },
      { recipient: 'fail@test.local', final_action: 'sideline', status: 'quarantined', object_kind: 'quarantine', object_id: 'obj-fail' },
    ];
    mockDisposeByObject.mockImplementation(async (_id: number, objectId: string) => ({
      results: [{
        mail_log_id: 42,
        object_id: objectId,
        status: objectId === 'obj-fail' ? 'failed' : 'succeeded',
        reason: objectId === 'obj-fail' ? 'delivery_failed' : undefined,
      }],
    }));

    render(<RecipientStatus {...baseProps(dispositions)} />);

    await user.click(screen.getByRole('checkbox', { name: 'Select group obj-ok' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select group obj-fail' }));
    // Batch bar's "投递" (deliver) is the group action label, rendered via
    // the mocked translator as "emailDisposal.detail.overview.recipientStatus.action.deliver".
    const deliverButtons = screen.getAllByText('emailDisposal.detail.overview.recipientStatus.action.deliver');
    await user.click(deliverButtons[deliverButtons.length - 1]);

    await user.click(await screen.findByText('mock-reclassify-confirm'));

    await waitFor(() => expect(mockDisposeByObject).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    const [msg] = (toast.error as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(msg).toContain('bulkResult');
    expect(msg).toContain('"success":1');
    expect(msg).toContain('"failed":1');
    // G6: the failure is now reported in the batch-result "操作完成" modal
    // (recipient + prevStatus → reason), not the old inline failures block.
    const modal = await screen.findByTestId('email-disposal-recipient-batch-result');
    expect(within(modal).getByText('fail@test.local')).toBeInTheDocument();
    expect(modal.textContent).toContain('delivery_failed');
  });

  it('batch recall skips ineligible (non-delivered) groups instead of always firing a whole-message recall', async () => {
    const user = userEvent.setup();
    const dispositions: RecipientDisposition[] = [
      { recipient: 'delivered@test.local', final_action: 'deliver', status: 'delivered' },
      { recipient: 'quarantined@test.local', final_action: 'sideline', status: 'quarantined', object_kind: 'quarantine', object_id: 'obj-q' },
    ];
    mockRecallMails.mockResolvedValue({ succeeded: [42], failed: [] });

    render(<RecipientStatus {...baseProps(dispositions)} />);

    await user.click(screen.getByRole('checkbox', { name: /Select group __no_object/ }));
    await user.click(screen.getByRole('checkbox', { name: 'Select group obj-q' }));
    const recallButtons = screen.getAllByText('emailDisposal.detail.overview.recipientStatus.action.recall');
    await user.click(recallButtons[recallButtons.length - 1]);

    await user.click(await screen.findByText('mock-reclassify-confirm'));

    await waitFor(() => expect(mockRecallMails).toHaveBeenCalledTimes(1));
    expect(mockRecallMails).toHaveBeenCalledWith(
      expect.objectContaining({ mail_log_ids: [42] }),
      expect.anything(),
    );
    // The quarantined group is not recall-eligible -- it must be reported as
    // a failure (not_applicable) in the batch-result modal, not silently
    // swallowed or, worse, allowed to somehow narrow/alter the recall call.
    const modal = await screen.findByTestId('email-disposal-recipient-batch-result');
    expect(within(modal).getByText('quarantined@test.local')).toBeInTheDocument();
    expect(modal.textContent).toContain('recipientStatus.notApplicable');
  });

  it('surfaces reclassify_failed as a distinct warning toast without turning a successful dispose into a failure', async () => {
    const user = userEvent.setup();
    const dispositions: RecipientDisposition[] = [
      { recipient: 'rcpt@test.local', final_action: 'sideline', status: 'quarantined', object_kind: 'quarantine', object_id: 'obj-1' },
    ];
    mockDisposeByObject.mockResolvedValue({
      results: [{ mail_log_id: 42, object_id: 'obj-1', status: 'succeeded', reclassify_failed: true }],
    });

    render(<RecipientStatus {...baseProps(dispositions)} />);

    await user.click(screen.getByText('emailDisposal.detail.overview.recipientStatus.action.deliver'));
    await user.click(await screen.findByText('mock-reclassify-confirm'));

    await waitFor(() => expect(mockDisposeByObject).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(toast.warning).toHaveBeenCalledWith('emailDisposal.detail.overview.reclassifyPartialFail'));
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('notify: dispatches notifyRecipient per recipient in the group and reports success', async () => {
    const user = userEvent.setup();
    const dispositions: RecipientDisposition[] = [
      { recipient: 'notify-me@test.local', final_action: 'deliver', status: 'delivered' },
    ];
    mockNotifyRecipient.mockResolvedValue(undefined);

    render(<RecipientStatus {...baseProps(dispositions)} />);

    await user.click(screen.getByText('emailDisposal.detail.overview.recipientStatus.action.notify'));
    await user.click(await screen.findByText('emailDisposal.detail.overview.confirmBtn'));

    await waitFor(() => expect(mockNotifyRecipient).toHaveBeenCalledWith(42, 'notify-me@test.local', expect.anything()));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('emailDisposal.detail.overview.recipientStatus.actionSuccess'));
  });

  // review High-2: a quarantined/sidelined recipient with no object_id (the
  // real milter whole-message quarantine/sideline dispositions wrote this
  // before the milter fix, and any pre-existing row still can) must render
  // as not-operable -- no deliver/discard button, and no dispose call is
  // even reachable -- instead of silently falling back to a whole-message
  // dispose the operator never asked for.
  it('quarantined group with no object_id is not-operable and never disposes', () => {
    const dispositions: RecipientDisposition[] = [
      { recipient: 'no-object@test.local', final_action: 'sideline', status: 'quarantined' },
    ];

    render(<RecipientStatus {...baseProps(dispositions)} />);

    expect(screen.getByText('emailDisposal.detail.overview.recipientStatus.notOperable')).toBeInTheDocument();
    expect(screen.queryByText('emailDisposal.detail.overview.recipientStatus.action.deliver')).not.toBeInTheDocument();
    expect(screen.queryByText('emailDisposal.detail.overview.recipientStatus.action.discard')).not.toBeInTheDocument();
    expect(mockDisposeByObject).not.toHaveBeenCalled();
  });

  // review Medium-1: a real inbound_audit disposition (status="audited",
  // object_kind="inbound_audit") must be operable in the detail drawer --
  // deliver/discard must dispatch through disposeByObject exactly like a
  // quarantine/sideline object, not be treated as non-operable.
  it('audited group with an object_id exposes deliver and dispatches disposeByObject(release)', async () => {
    const user = userEvent.setup();
    const dispositions: RecipientDisposition[] = [
      { recipient: 'audited@test.local', final_action: 'audit', status: 'audited', object_kind: 'inbound_audit', object_id: 'inbound-audit/obj-1.eml' },
    ];
    mockDisposeByObject.mockResolvedValue({ results: [{ mail_log_id: 42, object_id: 'inbound-audit/obj-1.eml', status: 'succeeded' }] });

    render(<RecipientStatus {...baseProps(dispositions)} />);

    expect(screen.queryByText('emailDisposal.detail.overview.recipientStatus.notOperable')).not.toBeInTheDocument();
    await user.click(screen.getByText('emailDisposal.detail.overview.recipientStatus.action.deliver'));
    await user.click(await screen.findByText('mock-reclassify-confirm'));

    await waitFor(() => expect(mockDisposeByObject).toHaveBeenCalledWith(
      42, 'inbound-audit/obj-1.eml', 'release', undefined, expect.anything(),
    ));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('emailDisposal.detail.overview.recipientStatus.actionSuccess'));
  });

  // RA-5 (demo parity): a pending_review group's inline row action set
  // additionally exposes 隔离/阻断, and clicking either fires
  // dispatchQuarantineOrBlock IMMEDIATELY -- no ReclassifyDialog
  // ("mock-reclassify-confirm" mock) is ever shown for these two actions.
  it('RA-5: pending_review row renders 隔离/阻断 and clicking 隔离 dispatches disposeObjectAction(quarantine) immediately with no dialog', async () => {
    const user = userEvent.setup();
    const dispositions: RecipientDisposition[] = [
      { recipient: 'pending@test.local', final_action: 'sideline', status: 'pending_review', object_kind: 'quarantine', object_id: 'obj-pending' },
    ];
    mockDisposeObjectAction.mockResolvedValue({ results: [{ mail_log_id: 42, object_id: 'obj-pending', status: 'succeeded' }] });

    render(<RecipientStatus {...baseProps(dispositions)} />);

    expect(screen.getByText('emailDisposal.detail.overview.recipientStatus.action.quarantine')).toBeInTheDocument();
    expect(screen.getByText('emailDisposal.detail.overview.recipientStatus.action.block')).toBeInTheDocument();

    await user.click(screen.getByText('emailDisposal.detail.overview.recipientStatus.action.quarantine'));

    await waitFor(() => expect(mockDisposeObjectAction).toHaveBeenCalledWith(
      42, 'obj-pending', 'quarantine', expect.anything(),
    ));
    expect(screen.queryByText('mock-reclassify-confirm')).not.toBeInTheDocument();
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('emailDisposal.detail.overview.recipientStatus.actionSuccess'));
  });

  // Real-mode degrade: disposeObjectAction rejecting (the real backend's 400
  // for any non release/delete action) must never be silently swallowed --
  // it surfaces the explicit unsupported-action toast.
  it('RA-5: 阻断 surfaces the unsupported toast when disposeObjectAction rejects', async () => {
    const user = userEvent.setup();
    const dispositions: RecipientDisposition[] = [
      { recipient: 'pending@test.local', final_action: 'sideline', status: 'pending_review', object_kind: 'quarantine', object_id: 'obj-pending' },
    ];
    mockDisposeObjectAction.mockRejectedValue(new Error('action must be release or delete'));

    render(<RecipientStatus {...baseProps(dispositions)} />);
    await user.click(screen.getByText('emailDisposal.detail.overview.recipientStatus.action.block'));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(
      'emailDisposal.detail.overview.recipientStatus.quarantineBlockUnsupported',
    ));
  });

  // G6: a batch action that partially succeeds must open the "操作完成"
  // modal with one row per affected recipient -- success rows show
  // {prevStatus} → {newStatus} on a green background, failure rows show
  // {prevStatus} → {reason} on a red background.
  it('G6: batch-result modal renders per-recipient before→after rows (success green, failure red)', async () => {
    const user = userEvent.setup();
    const dispositions: RecipientDisposition[] = [
      { recipient: 'ok@test.local', final_action: 'sideline', status: 'quarantined', object_kind: 'quarantine', object_id: 'obj-ok' },
      { recipient: 'fail@test.local', final_action: 'sideline', status: 'quarantined', object_kind: 'quarantine', object_id: 'obj-fail' },
    ];
    mockDisposeByObject.mockImplementation(async (_id: number, objectId: string) => ({
      results: [{
        mail_log_id: 42,
        object_id: objectId,
        status: objectId === 'obj-fail' ? 'failed' : 'succeeded',
        reason: objectId === 'obj-fail' ? 'delivery_failed' : undefined,
      }],
    }));

    render(<RecipientStatus {...baseProps(dispositions)} />);

    await user.click(screen.getByRole('checkbox', { name: 'Select group obj-ok' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select group obj-fail' }));
    const deliverButtons = screen.getAllByText('emailDisposal.detail.overview.recipientStatus.action.deliver');
    await user.click(deliverButtons[deliverButtons.length - 1]);
    await user.click(await screen.findByText('mock-reclassify-confirm'));

    await waitFor(() => expect(mockDisposeByObject).toHaveBeenCalledTimes(2));
    const modal = await screen.findByTestId('email-disposal-recipient-batch-result');
    expect(within(modal).getByText('emailDisposal.detail.overview.recipientStatus.batchResultTitle')).toBeInTheDocument();

    const okRow = within(modal).getByText('ok@test.local').closest('div');
    expect(okRow?.className).toContain('bg-emerald-50');
    expect(okRow?.textContent).toContain('status.quarantined');
    expect(okRow?.textContent).toContain('status.delivered');

    const failRow = within(modal).getByText('fail@test.local').closest('div');
    expect(failRow?.className).toContain('bg-red-50');
    expect(failRow?.textContent).toContain('status.quarantined');
    expect(failRow?.textContent).toContain('delivery_failed');

    // 确定 closes the modal.
    await user.click(within(modal).getByText('emailDisposal.detail.overview.recipientStatus.confirmClose'));
    await waitFor(() => expect(screen.queryByTestId('email-disposal-recipient-batch-result')).not.toBeInTheDocument());
  });

  // Review Important fix: a mixed multi-select batch-discard must show the
  // red confirm info bar for ONLY the recipients that will actually be
  // discarded -- a co-selected delivered group (actions=['recall','notify'],
  // no 'discard') is a no-op for dispatch()'s discard branch and must not be
  // listed as if it were being discarded.
  it('mixed batch discard: red confirm info bar excludes a co-selected group without the discard action', async () => {
    const user = userEvent.setup();
    const dispositions: RecipientDisposition[] = [
      { recipient: 'delivered@test.local', final_action: 'deliver', status: 'delivered' },
      { recipient: 'quarantined@test.local', final_action: 'sideline', status: 'quarantined', object_kind: 'quarantine', object_id: 'obj-q' },
    ];

    render(<RecipientStatus {...baseProps(dispositions)} />);

    await user.click(screen.getByRole('checkbox', { name: /Select group __no_object/ }));
    await user.click(screen.getByRole('checkbox', { name: 'Select group obj-q' }));
    await user.click(screen.getByTestId('email-disposal-recipient-batch-discard'));

    const infoBar = await screen.findByTestId('email-disposal-discard-confirm-recipients');
    expect(infoBar.textContent).toContain('quarantined@test.local');
    expect(infoBar.textContent).not.toContain('delivered@test.local');
  });
});

describe('RecipientStatus matrix presentation (D1/D3/D4)', () => {
  // Alternating quarantined(+object_id)/delivered(no object_id) dispositions
  // -- each disposition lands in its own group (see groupRecipientDispositions),
  // so dispositionsOf(n) always yields exactly n distinct groups.
  function dispositionsOf(n: number): RecipientDisposition[] {
    return Array.from({ length: n }, (_, i) => (
      i % 2 === 0
        ? { recipient: `r${i}@test.local`, final_action: 'sideline', status: 'quarantined', object_kind: 'quarantine', object_id: `obj-${i}` }
        : { recipient: `r${i}@test.local`, final_action: 'deliver', status: 'delivered' }
    ));
  }

  it('renders the wrapper testid on the root element (Task 10 banner-link scroll target)', () => {
    render(<RecipientStatus {...baseProps(dispositionsOf(2))} />);
    expect(screen.getByTestId('email-disposal-recipient-status')).toBeInTheDocument();
  });

  it('D1: header shows the total recipient count and per-status distribution', () => {
    render(<RecipientStatus {...baseProps(dispositionsOf(4))} />);
    const header = screen.getByTestId('email-disposal-recipient-status-header');
    expect(header.textContent).toContain('recipientStatus.header:{"n":4}');
    expect(header.textContent).toContain('status.quarantined');
    expect(header.textContent).toContain('status.delivered');
  });

  it('D3: >5 groups renders only the first 5 by default with an expand control that reveals the rest', async () => {
    const user = userEvent.setup();
    render(<RecipientStatus {...baseProps(dispositionsOf(7))} />);

    // G10: matrix is sorted 隔离中(quarantined, r0/r2/r4/r6) before
    // 已投递(delivered, r1/r3/r5) -- with a stable sort, the first 5 shown
    // by default are r0,r2,r4,r6 (all 4 quarantined) then r1 (the first
    // delivered); r3/r5 are the two pushed behind the expand toggle.
    expect(screen.queryByText('r3@test.local')).not.toBeInTheDocument();
    expect(screen.queryByText('r5@test.local')).not.toBeInTheDocument();
    const expandBtn = screen.getByTestId('email-disposal-recipient-status-expand');
    expect(expandBtn.textContent).toContain('recipientStatus.expandAll:{"n":7}');

    await user.click(expandBtn);
    expect(screen.getByText('r3@test.local')).toBeInTheDocument();
    expect(screen.getByText('r5@test.local')).toBeInTheDocument();
    expect(expandBtn.textContent).toContain('emailDisposal.detail.overview.collapse');

    await user.click(expandBtn);
    expect(screen.queryByText('r3@test.local')).not.toBeInTheDocument();
  });

  it('D3: <=5 groups shows no expand control', () => {
    render(<RecipientStatus {...baseProps(dispositionsOf(3))} />);
    expect(screen.queryByTestId('email-disposal-recipient-status-expand')).not.toBeInTheDocument();
  });

  it('D4: batch bar and each batch action button carry stable testids', async () => {
    const user = userEvent.setup();
    render(<RecipientStatus {...baseProps(dispositionsOf(3))} />);
    const groupCheckboxes = screen.getAllByRole('checkbox').filter(
      (c) => (c.getAttribute('aria-label') || '').startsWith('Select group'),
    );
    await user.click(groupCheckboxes[0]);
    await user.click(groupCheckboxes[1]);

    expect(screen.getByTestId('email-disposal-recipient-batch-bar')).toBeInTheDocument();
    for (const action of ['deliver', 'discard', 'recall', 'notify']) {
      expect(screen.getByTestId(`email-disposal-recipient-batch-${action}`)).toBeInTheDocument();
    }
  });

  // RA-5 (demo parity): the batch bar always renders 批量隔离/批量阻断
  // buttons too (they're notApplicable-and-skipped for groups whose status
  // doesn't support them, same as any other batch action mixed into a
  // multi-status selection).
  it('RA-5: batch bar includes 批量隔离/批量阻断 buttons', async () => {
    const user = userEvent.setup();
    render(<RecipientStatus {...baseProps(dispositionsOf(3))} />);
    const groupCheckboxes = screen.getAllByRole('checkbox').filter(
      (c) => (c.getAttribute('aria-label') || '').startsWith('Select group'),
    );
    await user.click(groupCheckboxes[0]);

    expect(screen.getByTestId('email-disposal-recipient-batch-quarantine')).toBeInTheDocument();
    expect(screen.getByTestId('email-disposal-recipient-batch-block')).toBeInTheDocument();
  });

  // RA-5: clicking 批量隔离 dispatches disposeObjectAction(quarantine) for
  // every selected pending_review group, immediately (no dialog).
  it('RA-5: 批量隔离 dispatches disposeObjectAction(quarantine) for each selected pending_review group', async () => {
    const user = userEvent.setup();
    const dispositions: RecipientDisposition[] = [
      { recipient: 'p0@test.local', final_action: 'sideline', status: 'pending_review', object_kind: 'quarantine', object_id: 'obj-p0' },
      { recipient: 'p1@test.local', final_action: 'sideline', status: 'pending_review', object_kind: 'quarantine', object_id: 'obj-p1' },
    ];
    mockDisposeObjectAction.mockImplementation(async (_id: number, objectId: string) => ({
      results: [{ mail_log_id: 42, object_id: objectId, status: 'succeeded' }],
    }));

    render(<RecipientStatus {...baseProps(dispositions)} />);
    const groupCheckboxes = screen.getAllByRole('checkbox').filter(
      (c) => (c.getAttribute('aria-label') || '').startsWith('Select group'),
    );
    await user.click(groupCheckboxes[0]);
    await user.click(groupCheckboxes[1]);
    await user.click(screen.getByTestId('email-disposal-recipient-batch-quarantine'));

    await waitFor(() => expect(mockDisposeObjectAction).toHaveBeenCalledTimes(2));
    expect(mockDisposeObjectAction).toHaveBeenCalledWith(42, 'obj-p0', 'quarantine', expect.anything());
    expect(mockDisposeObjectAction).toHaveBeenCalledWith(42, 'obj-p1', 'quarantine', expect.anything());
    // No reclassify dialog for quarantine/block.
    expect(screen.queryByText('mock-reclassify-confirm')).not.toBeInTheDocument();
    // onSettled clears the selection, same as every other batch action.
    await waitFor(() => expect(screen.queryByTestId('email-disposal-recipient-batch-bar')).not.toBeInTheDocument());
  });

  // G8: the batch bar's threshold is >=1 selected (previously >1) --
  // selecting a single group must already surface it.
  it('G8: batch bar appears at exactly 1 selected group, with a 取消 button', async () => {
    const user = userEvent.setup();
    render(<RecipientStatus {...baseProps(dispositionsOf(3))} />);
    expect(screen.queryByTestId('email-disposal-recipient-batch-bar')).not.toBeInTheDocument();

    const groupCheckboxes = screen.getAllByRole('checkbox').filter(
      (c) => (c.getAttribute('aria-label') || '').startsWith('Select group'),
    );
    await user.click(groupCheckboxes[0]);

    const bar = await screen.findByTestId('email-disposal-recipient-batch-bar');
    expect(bar.textContent).toContain('recipientStatus.selected:{"n":1}');
    expect(screen.getByTestId('email-disposal-recipient-batch-cancel')).toBeInTheDocument();
  });

  // G9: 取消 clears the selection, which hides the bar again.
  it('G9: 取消 clears the selection and hides the batch bar', async () => {
    const user = userEvent.setup();
    render(<RecipientStatus {...baseProps(dispositionsOf(3))} />);
    const groupCheckboxes = screen.getAllByRole('checkbox').filter(
      (c) => (c.getAttribute('aria-label') || '').startsWith('Select group'),
    );
    await user.click(groupCheckboxes[0]);
    await screen.findByTestId('email-disposal-recipient-batch-bar');

    await user.click(screen.getByTestId('email-disposal-recipient-batch-cancel'));
    expect(screen.queryByTestId('email-disposal-recipient-batch-bar')).not.toBeInTheDocument();
  });

  // G7: a group with no available actions (blocked/discarded) renders no
  // checkbox at all (a spacer instead), the row reads muted, and the action
  // cell shows "(无原文)" -- while an operable sibling group keeps its
  // checkbox and action buttons untouched.
  it('G7: a non-operable group (blocked) renders no checkbox and shows "(无原文)"', () => {
    const dispositions: RecipientDisposition[] = [
      { recipient: 'blocked@test.local', final_action: 'reject', status: 'blocked' },
      { recipient: 'ok@test.local', final_action: 'sideline', status: 'quarantined', object_kind: 'quarantine', object_id: 'obj-ok' },
    ];

    render(<RecipientStatus {...baseProps(dispositions)} />);

    const blockedRow = screen.getByTestId('email-disposal-recipient-status-row-blocked@test.local');
    expect(within(blockedRow).queryByRole('checkbox')).not.toBeInTheDocument();
    expect(within(blockedRow).getByText('emailDisposal.detail.overview.recipientStatus.noContent')).toBeInTheDocument();

    const okRow = screen.getByTestId('email-disposal-recipient-status-row-ok@test.local');
    expect(within(okRow).getByRole('checkbox')).toBeInTheDocument();
  });
});
