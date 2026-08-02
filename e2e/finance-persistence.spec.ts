import { expect, test } from '@playwright/test';
import { E2E_READ_ONLY } from './constants';

test.describe('Authenticated finance persistence', () => {
  test.skip(E2E_READ_ONLY, 'Finance persistence requires disposable E2E state');

  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== 'chromium',
      'Authenticated finance persistence is covered by the desktop Chromium project',
    );
  });

  test('saves a changed finance value and restores it after reload', async ({ page }) => {
    await page.goto('/finance/cushion');

    await expect(
      page.getByRole('heading', { name: 'Where does your household live?' }),
    ).toBeVisible();

    await page.getByRole('button', { name: 'United States', exact: true }).click();
    await page
      .getByRole('combobox', { name: 'State, province, or region' })
      .selectOption('CA');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();

    await page.getByRole('button', { name: 'I manage my finances alone' }).click();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();

    await page.getByRole('button', { name: 'Employed', exact: true }).click();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();

    await page.getByRole('button', { name: 'I know take-home pay' }).click();
    await page.getByRole('textbox', { name: 'Income amount' }).fill('7000');
    await page.getByRole('combobox', { name: 'Pay period' }).selectOption('monthly');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();

    await page.getByRole('button', { name: 'Skip for now', exact: true }).click();

    await page.getByRole('textbox', { name: 'Cash available now' }).fill('35000');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();

    await page.getByRole('button', { name: 'Skip for now', exact: true }).click();

    await page.getByRole('button', { name: 'I already know my totals' }).click();
    await page
      .getByRole('textbox', { name: 'Current total monthly spending' })
      .fill('6000');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();

    await page.getByRole('textbox', { name: 'After interruption' }).fill('6000');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByRole('button', { name: 'Show my runway' }).click();

    await expect(page.getByRole('button', { name: 'Save this runway' })).toBeVisible();
    const saveResponsePromise = page.waitForResponse((response) => (
      response.request().method() === 'POST'
      && new URL(response.url()).pathname === '/api/finance/cushion'
    ));
    await page.getByRole('button', { name: 'Save this runway' }).click();

    const saveResponse = await saveResponsePromise;
    expect(saveResponse.status(), await saveResponse.text()).toBe(200);
    const commitBody = saveResponse.request().postDataJSON();
    expect(commitBody).toMatchObject({
      status: 'completed',
      expected_revision: 0,
      snapshot_trigger: 'completed',
    });
    expect(commitBody.idempotency_key).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(commitBody.snapshot_action_id).toBe(commitBody.idempotency_key);
    expect(commitBody.adjustments).toEqual({
      expense_reduction_cents: 0,
      added_cash_cents: 0,
      added_monthly_income_cents: 0,
      expected_unconfirmed_funds_cents: 0,
      usable_illiquid_investments_cents: 0,
      usable_retirement_tax_deferred_cents: 0,
      usable_retirement_tax_free_cents: 0,
    });
    await expect(page.getByRole('button', { name: 'Saved', exact: true })).toBeVisible();
    await expect(page.getByText('Cash available now', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('main').getByText('$35,000', { exact: true }).first(),
    ).toBeVisible();

    await page.reload();

    await expect(page.getByRole('button', { name: 'Saved', exact: true })).toBeVisible();
    await expect(page.getByText('Cash available now', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('main').getByText('$35,000', { exact: true }).first(),
    ).toBeVisible();
  });
});
