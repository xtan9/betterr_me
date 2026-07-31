import { expect, test } from '@playwright/test';
import {
  E2E_READ_ONLY,
  RUN_CONTEXT,
  SEED_HABIT_NAMES,
} from './constants';

test.describe('Journal autosave and linking', () => {
  test.skip(E2E_READ_ONLY, 'Journal persistence requires disposable E2E state');
  let createdEntryId: string | undefined;

  test.afterEach(async ({ page }) => {
    if (!createdEntryId) return;

    const response = await page.request.delete(`/api/journal/${createdEntryId}`);
    expect(response.ok(), await response.text()).toBe(true);
    createdEntryId = undefined;
  });

  test('autosaves content and a linked habit across reload', async ({ page }) => {
    const content = `Journal persistence check for ${RUN_CONTEXT.runId}`;
    const linkedHabit = SEED_HABIT_NAMES[0];

    await page.goto('/journal');
    await page.getByRole('button', { name: 'Write Today' }).click();

    const dialog = page.getByRole('dialog');
    const editor = dialog.locator('[contenteditable="true"]');
    const createResponsePromise = page.waitForResponse((response) => (
      response.request().method() === 'POST'
      && new URL(response.url()).pathname === '/api/journal'
    ));

    await editor.fill(content);

    const createResponse = await createResponsePromise;
    expect(createResponse.status(), await createResponse.text()).toBe(201);
    const created = await createResponse.json() as { entry: { id: string } };
    createdEntryId = created.entry.id;

    await expect(dialog.getByText('Saved', { exact: true })).toBeVisible();
    await dialog.getByTestId('link-selector-trigger').click();
    await page.getByTestId('link-search-input').fill(linkedHabit);

    const linkResponsePromise = page.waitForResponse((response) => (
      response.request().method() === 'POST'
      && new URL(response.url()).pathname === `/api/journal/${created.entry.id}/links`
    ));
    await page.getByText(linkedHabit, { exact: true }).click();
    const linkResponse = await linkResponsePromise;
    expect(linkResponse.status(), await linkResponse.text()).toBe(201);
    await expect(dialog.getByTestId('link-chip-habit')).toHaveText(linkedHabit);

    await page.reload();
    await page.getByRole('button', { name: 'Write Today' }).click();

    const reloadedDialog = page.getByRole('dialog');
    await expect(reloadedDialog.locator('[contenteditable="true"]')).toHaveText(content);
    await expect(reloadedDialog.getByTestId('link-chip-habit')).toHaveText(linkedHabit);
  });
});
