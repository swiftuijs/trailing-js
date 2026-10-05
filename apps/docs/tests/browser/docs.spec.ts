import { test, expect } from '@playwright/test';

test('documentation navigation, search, highlighting and responsive layout', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('./');
  await expect(page).toHaveTitle(/Twill/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Twill');
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  await expect(page.locator('div.language-twill code span[style]')).not.toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  const home = info.outputPath('home.png');
  await page.screenshot({ path: home, fullPage: true });
  await info.attach('home', { path: home, contentType: 'image/png' });
  if (info.project.name === 'docs-mobile') {
    await page.getByRole('button', { name: 'mobile navigation' }).click();
    await page.getByRole('link', { name: 'Guide', exact: true }).last().click();
  } else await page.getByRole('link', { name: 'Get started', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Getting started');
  await page.getByRole('button', { name: 'Search' }).click();
  await page.getByRole('searchbox').fill('defer');
  await expect(page.locator('.VPLocalSearchBox .result')).not.toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.goto('zh/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Twill');
  await page.getByRole('link', { name: '开始使用', exact: true }).last().click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('开始使用');
  expect(errors).toEqual([]);
});

test('actual compiler worker handles examples, errors and keyboard compilation', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('playground');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Playground');
  await page.getByRole('button', { name: 'Compile', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Compiled');
  const playground = info.outputPath('playground.png');
  await page.screenshot({ path: playground, fullPage: true });
  await info.attach('playground', { path: playground, contentType: 'image/png' });
  await expect(page.getByLabel('Generated TypeScript / TSX')).toHaveValue(/=>/);
  await page.getByLabel('Example', { exact: true }).selectOption('cleanup');
  await page.getByRole('button', { name: 'Compile', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('1 guard(s), 1 defer(s)');
  await expect(page.getByLabel('Generated TypeScript / TSX')).toHaveValue(/finally/);
  await page.getByLabel('Example', { exact: true }).selectOption('react');
  await page.getByRole('button', { name: 'Compile', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Compiled');
  await expect(page.getByLabel('Generated TypeScript / TSX')).toHaveValue(/<Panel>/);
  await page.getByLabel('Example', { exact: true }).selectOption('vue');
  await page.getByRole('button', { name: 'Compile', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Compiled');
  await expect(page.getByLabel('Generated TypeScript / TSX')).toHaveValue(/default\s*:\s*\(/);
  await page.getByLabel(/Twill source/).fill('fn {');
  await page.getByRole('button', { name: 'Compile', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Compilation failed');
  await expect(page.getByLabel('Generated TypeScript / TSX')).toHaveValue(/example.twillx/);
  await page.getByLabel(/Twill source/).fill('export const result=[1].map { n in n+1 };');
  await page.getByLabel(/Twill source/).press('Control+Enter');
  await expect(page.getByRole('status')).toContainText('Compiled');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  expect(errors).toEqual([]);
});
