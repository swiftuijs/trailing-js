import { expect, test } from '@playwright/test';

declare global {
  interface Window {
    events: string[];
  }
}

test('native and Twill React framework builds behave identically with the existing ReactDOM renderer', async ({
  browser,
}) => {
  const outcomes: unknown[] = [];
  for (const port of [4178, 4179]) {
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${port}`);
    await expect(page.locator('output')).toHaveText('Count: 0; doubled: 0; context: provided');
    await page.getByRole('button', { name: 'Increment', exact: true }).click();
    await expect(page.locator('output')).toHaveText('Count: 1; doubled: 2; context: provided');
    await page.getByRole('button', { name: 'Transition', exact: true }).click();
    await expect(page.locator('output')).toHaveText('Count: 11; doubled: 22; context: provided');
    await page.getByRole('button', { name: 'Toggle child', exact: true }).click();
    await expect(page.getByText('Owned child')).toHaveCount(0);
    await page.getByRole('button', { name: 'Suspend', exact: true }).click();
    await expect(page.getByText('Loading resource')).toBeVisible();
    await page.getByRole('button', { name: 'Resolve', exact: true }).click();
    await expect(page.getByText('Resolved resource')).toBeVisible();
    outcomes.push({
      text: await page.locator('main').innerText(),
      events: await page.evaluate(() => window.events),
      errors,
    });
    expect(errors).toEqual([]);
    await page.close();
  }
  expect(outcomes[1]).toEqual(outcomes[0]);
});
