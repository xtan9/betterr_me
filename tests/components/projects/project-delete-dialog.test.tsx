import { beforeEach, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import * as matchers from 'vitest-axe/matchers';
import { ProjectDeleteDialog } from '@/components/projects/project-delete-dialog';
import { ReviewedDeleteDialog } from '@/components/tasks/reviewed-delete-dialog';

expect.extend(matchers);
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ rpc }) }));
vi.mock('next-intl', () => ({ useLocale: () => 'en', useTranslations: () => (key: string) => key }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const preview = { status: 'complete', kind: 'project', id: 'p', title: 'My Project', version: 'v', children: [{ id: 'child', version: 'v2' }], plan: [], retained: [], reminders: [], eventVersions: [] };
beforeEach(() => {
  rpc.mockReset();
  rpc.mockImplementation(async (name: string) => ({ data: name === 'item_deletion_preview' ? preview : { status: 'complete' }, error: null }));
});
async function readyProject() {
  const onOpenChange = vi.fn(), onSuccess = vi.fn();
  const view = render(<ProjectDeleteDialog open onOpenChange={onOpenChange} onSuccess={onSuccess} projectId="p" projectName="My Project" />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Delete Project' })).toBeEnabled());
  return { ...view, onOpenChange, onSuccess };
}
it('shows preserved children and cancel performs no mutation', async () => {
  const { onOpenChange, baseElement } = await readyProject();
  expect(screen.getByText('Tasks kept: 1')).toBeInTheDocument();
  expect(screen.getByRole('alertdialog')).toHaveFocus();
  expect(await axe(baseElement)).toHaveNoViolations();
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(onOpenChange).toHaveBeenCalledWith(false);
  expect(rpc.mock.calls.filter(([name]) => name === 'item_delete_command')).toHaveLength(0);
});
it('submits the exact reviewed impact and closes only after success', async () => {
  const { onSuccess, onOpenChange } = await readyProject();
  await userEvent.click(screen.getByRole('button', { name: 'Delete Project' }));
  expect(rpc).toHaveBeenLastCalledWith('item_delete_command', { p_operation_id: expect.any(String), p_preview: preview });
  expect(onSuccess).toHaveBeenCalledOnce();
  expect(onOpenChange).toHaveBeenCalledWith(false);
});
it('uncertain deletion stays open and retries with the same immutable request', async () => {
  const { onSuccess, onOpenChange } = await readyProject();
  rpc.mockResolvedValueOnce({ data: null, error: { message: 'Network failure' } });
  await userEvent.click(screen.getByRole('button', { name: 'Delete Project' }));
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  expect(onOpenChange).not.toHaveBeenCalled();
  const request = rpc.mock.calls[1][1];
  await userEvent.click(screen.getByRole('button', { name: 'Retry deletion' }));
  expect(rpc.mock.calls[2][1]).toEqual(request);
  expect(onSuccess).toHaveBeenCalledOnce();
});
it('stale impact requires another preview before confirmation', async () => {
  await readyProject();
  rpc.mockResolvedValueOnce({ data: { status: 'conflict' }, error: null });
  await userEvent.click(screen.getByRole('button', { name: 'Delete Project' }));
  expect(screen.getByRole('button', { name: 'Delete Project' })).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: 'Review latest details' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Delete Project' })).toBeEnabled());
  expect(rpc.mock.calls.filter(([name]) => name === 'item_deletion_preview')).toHaveLength(2);
});
it('lists protected blocks, reminder details and retained commitments', async () => {
  const task = { ...preview, kind: 'task', plan: [{ id: 'e', title: 'Future work', start_date: '2026-10-20', start_time: '09:00', end_date: '2026-10-20', end_time: '10:00', timezone: 'UTC', is_protected: true }], reminders: [{ id: 'r', fire_at: '2026-10-20T08:45:00Z', channels: ['email'] }], retained: [{ id: 'kept', title: 'Confirmed booking' }] };
  rpc.mockResolvedValueOnce({ data: task, error: null });
  render(<ReviewedDeleteDialog open onOpenChange={vi.fn()} kind="task" id="p" title="Task" />);
  expect(await screen.findByText('Protected block — included in deletion')).toBeInTheDocument();
  expect(screen.getByText(/2026-10-20 09:00/)).toBeInTheDocument();
  expect(screen.getByText(/\(Email\)/)).toBeInTheDocument();
  expect(screen.getByText('Commitments kept: Confirmed booking')).toBeInTheDocument();
});
it('does not fetch or render the closed confirmation', () => {
  render(<ProjectDeleteDialog open={false} onOpenChange={vi.fn()} projectId="p" projectName="My Project" />);
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  expect(rpc).not.toHaveBeenCalled();
});
it('returns keyboard focus to the opener after cancellation', async () => {
  function Harness() {
    const [open, setOpen] = useState(false);
    return <><button onClick={() => setOpen(true)}>Open delete</button><ProjectDeleteDialog open={open} onOpenChange={setOpen} projectId="p" projectName="My Project" /></>;
  }
  render(<Harness />);
  const opener = screen.getByRole('button', { name: 'Open delete' });
  await userEvent.click(opener);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled());
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(opener).toHaveFocus());
});
