import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

test('React retains hook state across Twill and native TS edits without optional config files', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page).toHaveTitle('Twill refresh fixture');
  const button = page.getByRole('button');
  await expect(button).toHaveText('Count: 0');
  await button.click();
  await button.click();
  await expect(button).toHaveText('Count: 2');
  const file = resolve('.twill/browser-fixture/App.twillx');
  const original = readFileSync(file, 'utf8');
  const helper = resolve('.twill/browser-fixture/label.ts');
  try {
    writeFileSync(file, original.replace('{label}:', '{label} updated:'));
    await expect(button).toHaveText('Count updated: 2');
    writeFileSync(helper, 'export const label = "Counter";');
    await expect(button).toHaveText('Counter updated: 2');
    const transformed = await (await page.request.get('/App.twillx?import')).text();
    expect(transformed).toContain('$RefreshSig$');
    expect(transformed).toContain('/@react-refresh');
    expect(transformed).toContain('sourceMappingURL');
    expect(errors).toEqual([]);
  } finally {
    writeFileSync(file, original);
    writeFileSync(helper, 'export const label = "Count";');
  }
});

test('creating and deleting optional config reloads the module graph', async ({ page }) => {
  const config = resolve('.twill/browser-fixture/twill.config.json');
  await page.goto('/');
  await expect(page.locator('output')).toHaveText('Value: 42');
  try {
    writeFileSync(config, JSON.stringify({ implicitReturn: false }));
    await expect(page.locator('output')).toHaveText('Value: undefined');
  } finally {
    const { rmSync } = await import('node:fs');
    rmSync(config, { force: true });
  }
  await expect(page.locator('output')).toHaveText('Value: 42');
});

test('invalid live configuration reports an overlay and recovers after correction', async ({
  page,
}) => {
  const config = resolve('.twill/browser-fixture/twill.config.json');
  await page.goto('/');
  await expect(page.locator('output')).toHaveText('Value: 42');
  try {
    writeFileSync(config, '{ "implicitReturn": "invalid" }');
    await expect(page.locator('vite-error-overlay')).toBeVisible();
    writeFileSync(config, '{ "implicitReturn": true }');
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    await expect(page.locator('output')).toHaveText('Value: 42');
  } finally {
    const { rmSync } = await import('node:fs');
    rmSync(config, { force: true });
  }
});
