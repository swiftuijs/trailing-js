import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function screenshot(page: Page, info: TestInfo, name: string) {
  const path = info.outputPath(name + '.png');
  await page.screenshot({ path, fullPage: true });
  await info.attach(name, { path, contentType: 'image/png' });
}
async function editor(page: Page) {
  const source = page.getByRole('textbox', { name: 'Twill source', exact: true });
  await expect(source).toHaveAttribute('contenteditable', 'true');
  return source;
}
const generated = (page: Page) =>
  page.getByRole('textbox', { name: 'Generated TypeScript / TSX', exact: true });

test('English documentation navigation, search, highlighting and responsive layout', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('./');
  await expect(page).toHaveTitle(/Twill/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Clearer flow.Same TypeScript.');
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  await expect(page.locator('div.language-twill code span[style]')).not.toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await screenshot(page, info, 'home');
  if (info.project.name === 'docs-mobile') {
    await page.getByRole('button', { name: 'mobile navigation' }).click();
    await page.getByRole('link', { name: 'Guide', exact: true }).last().click();
  } else await page.getByRole('link', { name: 'Get started', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Getting started');
  await page.getByRole('button', { name: 'Search' }).click();
  await page.getByRole('searchbox').fill('defer');
  await expect(page.locator('.VPLocalSearchBox .result')).not.toHaveCount(0);
  await page.keyboard.press('Escape');
  const sitemap = await page.request.get('sitemap.xml');
  expect(sitemap.ok()).toBe(true);
  expect(await sitemap.text()).not.toContain('/zh/');
  expect(errors).toEqual([]);
});

test('user tooling guides and search exclude repository maintenance', async ({ page }, info) => {
  await page.goto('tooling');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Editor and tooling');
  await expect(page.locator('.vp-doc')).toContainText('your application root');
  await expect(page.locator('.vp-doc')).toContainText('twill check -p tsconfig.json');
  await expect(page.locator('.vp-doc')).not.toContainText('pnpm editor:package');
  await expect(page.locator('.VPSidebar a[href*="/contributing/"]')).toHaveCount(0);
  await expect(page.locator('.VPSidebar a[href*="/rfcs/"]')).toHaveCount(0);
  await page.locator('.vp-doc').getByRole('link', { name: 'build tools', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Build tools');
  await page.locator('.vp-doc').getByRole('link', { name: 'declaration emission' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Libraries and declarations');
  await page.locator('.vp-doc').getByRole('link', { name: 'CLI options' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('CLI reference');
  const sitemap = await (await page.request.get('sitemap.xml')).text();
  for (const path of ['tooling', 'build-tools', 'libraries', 'cli'])
    expect(sitemap).toContain('/' + path);
  for (const path of ['/contributing/', '/rfcs/', '/architecture', '/releasing'])
    expect(sitemap).not.toContain(path);
  await page.getByRole('button', { name: 'Search' }).click();
  await page.getByRole('searchbox').fill('Repository development');
  await expect(page.locator('.VPLocalSearchBox .result')).not.toHaveCount(0);
  await expect(
    page.locator(
      '.VPLocalSearchBox a[href*="/contributing/"], .VPLocalSearchBox a[href*="/rfcs/"]',
    ),
  ).toHaveCount(0);
  await expect(page.locator('.VPLocalSearchBox')).not.toContainText('Repository development');
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await screenshot(page, info, 'user-cli');
});

test('product comparisons, adoption links and readiness stay usable', async ({ page }, info) => {
  const errors: string[] = [];
  const requested: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => requested.push(request.url()));
  await page.goto('./');
  await expect(page.getByRole('tab', { name: 'Validation', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByRole('tabpanel')).toContainText('guard const user');
  await page.getByRole('tab', { name: 'Cleanup', exact: true }).click();
  await expect(page.getByRole('tabpanel')).toContainText('defer');
  await expect(page.getByRole('tabpanel')).toContainText('callbacks allocate');
  await page.getByRole('tab', { name: 'Cleanup', exact: true }).press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Business states', exact: true })).toBeFocused();
  await expect(page.getByRole('tabpanel')).toContainText('satisfies never');
  await expect(page.getByRole('tabpanel')).toContainText('twill check');
  await page.getByRole('tab', { name: 'Business states', exact: true }).press('End');
  await expect(page.getByRole('tab', { name: 'Callbacks', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByRole('tabpanel')).toContainText(/\.filter \{ user in\s+user\.active/);
  await page.getByRole('tab', { name: 'Callbacks', exact: true }).press('Home');
  await expect(page.getByRole('tab', { name: 'Validation', exact: true })).toBeFocused();
  expect(
    requested.filter((url) =>
      /(?:compiler\.worker|\/editor[.-][^/]+\.js|\/Playground[.-][^/]+\.js)/.test(url),
    ),
  ).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await screenshot(page, info, 'comparison');
  await page.getByRole('link', { name: 'Read why Twill', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Why Twill?');
  await expect(
    page.getByRole('heading', { name: /Put cleanup next to acquisition/ }),
  ).toBeVisible();
  await page.goto('readiness');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Readiness and support');
  await expect(page.locator('.vp-doc')).toContainText(
    'A broad production-ready claim would go beyond the current evidence.',
  );
  expect(errors).toEqual([]);
});

test('live compilation, highlighted examples, located errors and recovery', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('playground');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Playground');
  const source = await editor(page);
  await expect(page.getByRole('status')).toContainText('Compiled in');
  await expect(generated(page)).toContainText('=>');
  await expect(source.locator('.twill-token-keyword')).not.toHaveCount(0);
  await expect(generated(page).locator('.twill-token-keyword')).not.toHaveCount(0);
  await screenshot(page, info, 'playground');
  await page.getByLabel('Example', { exact: true }).selectOption('cleanup');
  await expect(page.getByRole('status')).toContainText('1 guard · 1 defer');
  await expect(generated(page)).toContainText('finally');
  await expect(generated(page)).not.toContainText('__twillDefers');
  await expect(generated(page)).toContainText('__twillCleanup');
  await expect(source.locator('.twill-contextual-keyword')).toHaveText(['defer', 'guard']);
  await page.getByLabel('Example', { exact: true }).selectOption('branching');
  await expect(page.getByRole('status')).toContainText('1 guard · 1 switch expression');
  await expect(generated(page)).toContainText('satisfies never');
  await expect(generated(page)).toContainText('case \"ok\"');
  await page.getByLabel('Example', { exact: true }).selectOption('react');
  await expect(generated(page)).toContainText('<Panel>');
  await expect(page.getByRole('status')).toContainText('Compiled in');
  if (info.project.name === 'docs-mobile')
    await page.getByRole('button', { name: 'mobile navigation' }).click();
  await page.getByRole('switch', { name: 'Switch to dark theme' }).click();
  if (info.project.name === 'docs-mobile')
    await page.getByRole('button', { name: 'mobile navigation' }).click();
  await screenshot(page, info, 'playground-dark-react');
  await page.getByLabel('Example', { exact: true }).selectOption('vue');
  await expect(generated(page)).toContainText(/default\s*:\s*\(/);
  await source.fill('fn {');
  await expect(page.getByRole('alert')).toContainText('Unable to compile');
  await expect(page.getByRole('button', { name: 'Copy output' })).toBeDisabled();
  await expect(page.getByText('Last valid output')).toBeVisible();
  await page.getByRole('button', { name: /Go to error/ }).click();
  await expect(source).toBeFocused();
  await expect(page.locator('.cm-lintPoint-error, .cm-lintRange-error')).not.toHaveCount(0);
  await screenshot(page, info, 'playground-error');
  await source.fill('export const result = [1].map { n in n + 42 };');
  await source.press('Control+Enter');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(generated(page)).toContainText('n + 42');
  await expect(page.getByRole('button', { name: 'Copy output' })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await expect(page.getByRole('link', { name: 'Read the syntax guide →' })).toHaveAttribute(
    'href',
    '/twill/syntax',
  );
  expect(errors).toEqual([]);
});

test('drafts, reset, output export and keyboard editing', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('playground');
  const source = await editor(page);
  const draft = 'const greeting: string = "Hello Twill";\nconst result = [1].map { n in n + 7 };';
  await source.fill(draft);
  await expect(generated(page)).toContainText('n + 7');
  await page.reload();
  await editor(page);
  await expect(source).toContainText('Hello Twill');
  await expect(generated(page)).toContainText('n + 7');
  await page.getByRole('button', { name: 'Copy output' }).click();
  await expect(page.getByText('Output copied', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('n + 7');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  const artifact = await download;
  expect(artifact.suggestedFilename()).toBe('example.ts');
  expect(await readFile((await artifact.path())!, 'utf8')).toContain('n + 7');
  await source.press('Control+Home');
  await source.press('Tab');
  await expect(source.locator('.cm-line').first()).toHaveText(/^\s+const greeting/);
  await source.press('Control+z');
  await expect(source.locator('.cm-line')).toHaveText(draft.split('\n'));
  await expect
    .poll(() =>
      page.evaluate(() => JSON.parse(localStorage.getItem('twill.playground.draft')!).source),
    )
    .toBe(draft);
  await source.press('Escape');
  await source.press('Tab');
  await expect(source).not.toBeFocused();
  await page.getByRole('button', { name: 'Reset example' }).click();
  await expect(source).toContainText('greaterThanFour');
  await expect(generated(page)).toContainText('greaterThanFour');
  await expect(page.getByRole('button', { name: 'Reset example' })).toBeDisabled();
  await source.fill(
    '// defer { and guard const are comments\nconst text = "defer { guard const";\nconst result = [1].map { n in n };',
  );
  await expect(page.getByRole('status')).toContainText('Compiled in');
  await expect(source.locator('.twill-contextual-keyword')).toHaveCount(0);
});

test('obsolete worker results are ignored and normal edits reuse one worker', async ({ page }) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    let count = 0;
    Object.defineProperty(window, '__twillWorkerCount', { get: () => count });
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        count++;
        let handler: ((event: MessageEvent) => void) | null = null;
        Object.defineProperty(this, 'onmessage', {
          get: () => handler,
          set: (value) => {
            handler = value;
          },
        });
        this.addEventListener('message', (event) => {
          const delay = event.data.result?.code.includes('slowValue') ? 650 : 0;
          setTimeout(() => handler?.call(this, event), delay);
        });
      }
    };
  });
  await page.goto('playground');
  const source = await editor(page);
  await expect(page.getByRole('status')).toContainText('Compiled in');
  await source.fill('const slowValue = [1].map { n in n + 1 };');
  await expect(page.getByRole('status')).toHaveText('Compiling…');
  await source.fill('const latestValue = [1].map { n in n + 99 };');
  const published: string[] = [];
  await page.exposeFunction('captureOutput', (value: string) => published.push(value));
  await page.evaluate(() => {
    const output = document.querySelector('[aria-label="Generated TypeScript / TSX"]')!;
    new MutationObserver(() => {
      (window as unknown as { captureOutput(value: string): void }).captureOutput(
        output.textContent ?? '',
      );
    }).observe(output, { subtree: true, childList: true, characterData: true });
  });
  await expect(generated(page)).toContainText('latestValue');
  expect(published.every((value) => !value.includes('slowValue'))).toBe(true);
  await page.getByLabel('Example', { exact: true }).selectOption('react');
  await expect(generated(page)).toContainText('<Panel>');
  expect(
    await page.evaluate(
      () => (window as unknown as { __twillWorkerCount: number }).__twillWorkerCount,
    ),
  ).toBe(1);
});

test('a failed compiler download can be retried without reloading the page', async ({ page }) => {
  let fail = true;
  await page.route('**/compiler.worker-*.js', (route) =>
    fail ? route.abort('failed') : route.continue(),
  );
  await page.goto('playground');
  await editor(page);
  await expect(page.getByRole('alert')).toContainText('Unable to compile');
  await expect(page.getByRole('button', { name: 'Copy output' })).toBeDisabled();
  fail = false;
  await page.getByRole('button', { name: 'Retry compilation' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(generated(page)).toContainText('greaterThanFour');
  await expect(page.getByRole('status')).toContainText('Compiled in');
});
