import { expect, test } from '@playwright/test';

declare global {
  interface Window {
    highlightAgain(): string;
  }
}

test('distributed highlighter renders safely in a browser without Node or compiler code', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('main pre code')).toHaveText(
    'const view = <div>{users.filter { .active }}</div>;',
  );
  await expect(page.locator('main pre')).toHaveClass(/shiki/);
  expect(await page.locator('main code span[style]').count()).toBeGreaterThan(2);
  expect(await page.evaluate(() => window.highlightAgain())).toContain('github-light');
  expect(await page.locator('main div').count()).toBe(0);
  expect(errors).toEqual([]);
});
