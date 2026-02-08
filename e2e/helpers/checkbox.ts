import { expect, type Locator } from '@playwright/test';

/** Read Radix Checkbox state via data-state attribute. */
export async function isRadixChecked(locator: Locator): Promise<boolean> {
  return (await locator.getAttribute('data-state')) === 'checked';
}

/**
 * Toggle a Radix checkbox and assert the state flipped.
 * Returns the previous checked state.
 * The checkbox is controlled — data-state only updates after the API call + SWR refetch.
 */
export async function toggleAndVerify(checkbox: Locator): Promise<boolean> {
  const wasChecked = await isRadixChecked(checkbox);
  const expectedState = wasChecked ? 'unchecked' : 'checked';
  await checkbox.click();
  await expect(checkbox).toHaveAttribute('data-state', expectedState, { timeout: 10000 });
  return wasChecked;
}
