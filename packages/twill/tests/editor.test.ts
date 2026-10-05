import { expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TwillProject, virtualFilename } from '../src/project';

it('offers members while the user is typing an incomplete closure', () => {
  const root = mkdtempSync(join(tmpdir(), 'twill-editor-'));
  const source = 'const values = [1].map() { value in value. }';
  const filename = join(root, 'main.twill');
  writeFileSync(filename, source);
  const project = new TwillProject(
    join(root, 'tsconfig.json'),
    {},
    { inferred: true, recover: true },
  );
  try {
    project.update(filename, source);
    const offset = source.indexOf('value.') + 'value.'.length;
    const completions = project.service.getCompletionsAtPosition(
      virtualFilename(filename),
      project.toGeneratedOffset(filename, offset),
      {},
    );
    expect(completions?.entries.map((entry) => entry.name)).toContain('toFixed');
    expect(project.diagnostics(filename).some((item) => item.code === 90001)).toBe(true);
    project.update(filename, 'const values = [1].map() { value in value.toFixed(2)');
    const generated = project.transformed(filename)!;
    expect(generated.code).toContain('toFixed(2)');
  } finally {
    project.dispose();
    rmSync(root, { recursive: true, force: true });
  }
});
