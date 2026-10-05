import { expect, it, vi } from 'vitest';
import { register } from 'node:module';
vi.mock('node:module', async (original) => ({
  ...(await original<typeof import('node:module')>()),
  register: vi.fn(),
}));
it('registers the Node loader relative to its own module rather than the working directory', async () => {
  await import('../src/register');
  expect(register).toHaveBeenCalledOnce();
  expect(register).toHaveBeenCalledWith(
    './loader.js',
    expect.stringMatching(/\/src\/register\.ts$/),
  );
});
