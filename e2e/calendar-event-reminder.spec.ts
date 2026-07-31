import { expect, test } from '@playwright/test';
import { getLocalDateString } from '@/lib/utils';
import { E2E_READ_ONLY, RUN_CONTEXT } from './constants';

function localDateOffset(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return getLocalDateString(date);
}

test.describe('Calendar event reminder journey', () => {
  test.skip(E2E_READ_ONLY, 'Calendar persistence requires disposable E2E state');

  test('creates, edits, reloads, and deletes an event with its reminder', async ({ page }) => {
    const eventDate = localDateOffset(1);
    const eventTitle = RUN_CONTEXT.ownedName('Calendar reminder flow');
    const editedTitle = RUN_CONTEXT.ownedName('Edited calendar reminder flow');
    let eventId: string | undefined;

    try {
      await page.goto(`/calendar?view=day&date=${eventDate}`);
      await page.getByRole('button', { name: '+ New Event', exact: true }).click();

      const createDialog = page.getByRole('dialog');
      await expect(createDialog).toBeVisible();
      await createDialog.locator('#event-title').fill(eventTitle);
      await createDialog.locator('#event-start-date').fill(eventDate);
      await createDialog.locator('#event-start-time').fill('10:00');
      await createDialog.locator('#event-end-date').fill(eventDate);
      await createDialog.locator('#event-end-time').fill('10:30');

      const createResponsePromise = page.waitForResponse((response) => (
        response.request().method() === 'POST'
        && new URL(response.url()).pathname === '/api/calendar-events'
      ));
      await createDialog.getByRole('button', { name: 'Save', exact: true }).click();

      const createResponse = await createResponsePromise;
      const created = await createResponse.json() as {
        event: { id: string; title: string; start_date: string; start_time: string };
        reminders: Array<{
          id: string;
          reminder_type: string;
          relative_minutes: number;
          channels: string[];
          fire_at: string;
        }>;
      };
      expect(createResponse.status(), JSON.stringify(created)).toBe(201);
      eventId = created.event.id;
      expect(created.event).toMatchObject({
        title: eventTitle,
        start_date: eventDate,
        start_time: '10:00:00',
      });
      expect(created.reminders).toHaveLength(1);
      expect(created.reminders[0]).toMatchObject({
        reminder_type: 'relative',
        relative_minutes: 15,
        channels: ['push'],
      });

      await expect(createDialog).toHaveCount(0);
      const createdEvent = page.getByRole('button', { name: eventTitle, exact: false });
      await expect(createdEvent).toBeVisible();

      await page.reload();
      await expect(createdEvent).toBeVisible();
      await createdEvent.click();

      const editDialog = page.getByRole('dialog');
      await expect(editDialog.locator('#event-title')).toHaveValue(eventTitle);
      await expect(
        editDialog.getByRole('combobox', { name: 'Reminder timing' }),
      ).toContainText('15 minutes before');

      await editDialog.locator('#event-title').fill(editedTitle);
      await editDialog.locator('#event-start-time').fill('11:00');
      await editDialog.locator('#event-end-time').fill('11:30');

      const updateResponsePromise = page.waitForResponse((response) => (
        response.request().method() === 'PATCH'
        && new URL(response.url()).pathname === `/api/calendar-events/${eventId}`
      ));
      await editDialog.getByRole('button', { name: 'Save', exact: true }).click();

      const updateResponse = await updateResponsePromise;
      const updated = await updateResponse.json() as {
        event: { id: string; title: string; start_time: string; end_time: string };
        reminders: Array<{
          id: string;
          reminder_type: string;
          relative_minutes: number;
          channels: string[];
          fire_at: string;
        }>;
      };
      expect(updateResponse.status(), JSON.stringify(updated)).toBe(200);
      expect(updated.event).toMatchObject({
        id: eventId,
        title: editedTitle,
        start_time: '11:00:00',
        end_time: '11:30:00',
      });
      expect(updated.reminders).toHaveLength(1);
      expect(updated.reminders[0]).toMatchObject({
        id: created.reminders[0].id,
        reminder_type: 'relative',
        relative_minutes: 15,
        channels: ['push'],
      });
      expect(updated.reminders[0].fire_at).not.toBe(created.reminders[0].fire_at);

      await page.reload();
      const reloadedEvent = page.getByRole('button', { name: editedTitle, exact: false });
      await expect(reloadedEvent).toBeVisible();
      await reloadedEvent.click();

      const reloadedDialog = page.getByRole('dialog');
      await expect(reloadedDialog.locator('#event-title')).toHaveValue(editedTitle);
      await expect(reloadedDialog.locator('#event-start-time')).toHaveValue('11:00');
      await expect(
        reloadedDialog.getByRole('combobox', { name: 'Reminder timing' }),
      ).toContainText('15 minutes before');

      page.once('dialog', async (dialog) => {
        expect(dialog.type()).toBe('confirm');
        await dialog.accept();
      });
      const deleteResponsePromise = page.waitForResponse((response) => (
        response.request().method() === 'DELETE'
        && new URL(response.url()).pathname === `/api/calendar-events/${eventId}`
      ));
      await reloadedDialog.getByRole('button', { name: 'Delete', exact: true }).click();

      const deleteResponse = await deleteResponsePromise;
      const deleted = await deleteResponse.json() as {
        event_id: string;
        deleted: boolean;
        reminders_deleted: number;
      };
      expect(deleteResponse.status(), JSON.stringify(deleted)).toBe(200);
      expect(deleted).toEqual({
        event_id: eventId,
        deleted: true,
        reminders_deleted: 1,
      });

      await expect(reloadedDialog).toHaveCount(0);
      await expect(reloadedEvent).toHaveCount(0);
      const deletedEventResponse = await page.request.get(`/api/calendar-events/${eventId}`);
      expect(deletedEventResponse.status()).toBe(404);
      const remindersResponse = await page.request.get(
        `/api/reminders?source_type=calendar_event&source_id=${eventId}`,
      );
      expect(remindersResponse.ok(), await remindersResponse.text()).toBe(true);
      expect(await remindersResponse.json()).toEqual({ reminders: [] });
    } finally {
      if (eventId) {
        const cleanupResponse = await page.request.delete(`/api/calendar-events/${eventId}`);
        expect(cleanupResponse.ok(), await cleanupResponse.text()).toBe(true);
      }
    }
  });
});
