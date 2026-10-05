import { afterEach, expect, it, vi } from 'vitest';
import ts from 'typescript';
import { writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { TwillProject, virtualFilename } from '../src/project';
import { fixtureRoot } from './helpers/fixture';

// Preserve the real TypeScript backend; replace only its declaration-emit
// boundary when testing failures that a valid source file cannot provoke.
vi.mock('typescript', async (original) => {
  const module = await original<{ default: typeof ts }>();
  return { ...module, default: { ...module.default } };
});
const createProgram = ts.createProgram;
const cleanups: (() => void)[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  cleanups.splice(0).forEach((cleanup) => cleanup());
});
function fixture() {
  const root = fixtureRoot('declaration-backend-');
  const file = join(root, 'main.twill').replaceAll('\\', '/');
  writeFileSync(file, 'export const value=42;');
  writeFileSync(
    join(root, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        types: [],
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'Bundler',
      },
      include: ['*.twill'],
    }),
  );
  const project = new TwillProject(join(root, 'tsconfig.json'));
  cleanups.push(() => {
    project.dispose();
    rmSync(root, { recursive: true, force: true });
  });
  return { project, file, root };
}
it('discards partial output when the TypeScript emitter fails without source attribution', () => {
  const { project, root } = fixture();
  vi.spyOn(ts, 'createProgram').mockImplementation(((...args: Parameters<typeof createProgram>) => {
    const program = createProgram(...args);
    vi.spyOn(program, 'emit').mockImplementation((_source, writeFile) => {
      writeFile!(join(root, 'types/main.d.ts'), 'partial output', false);
      return {
        emitSkipped: true,
        diagnostics: [
          {
            category: ts.DiagnosticCategory.Error,
            code: 10001,
            messageText: 'Declaration emitter failed',
            file: undefined,
            start: undefined,
            length: undefined,
          },
        ],
      };
    });
    return program;
  }) as typeof createProgram);
  expect(project.declarationOutput(join(root, 'types'))).toEqual({
    files: [],
    diagnostics: [
      expect.objectContaining({
        code: 10001,
        category: 'error',
        message: 'Declaration emitter failed',
      }),
    ],
  });
});
it('reconstructs a missing cached source and handles a missing compiler-host file', () => {
  const { project, file, root } = fixture();
  expect(project.diagnostics()).toEqual([]);
  const previous = project.service.getProgram()!;
  const getSourceFile = previous.getSourceFile.bind(previous);
  vi.spyOn(previous, 'getSourceFile').mockImplementation((filename) =>
    filename === virtualFilename(file) ? undefined : getSourceFile(filename),
  );
  // Avoid another language-service synchronization replacing the cache under
  // test; the newly created declaration program still performs real checks.
  vi.spyOn(project, 'diagnostics').mockReturnValue([]);
  vi.spyOn(ts, 'createProgram').mockImplementation(((...args: Parameters<typeof createProgram>) => {
    const host = args[2]!;
    expect(host.getSourceFile(join(root, 'missing.ts'), ts.ScriptTarget.ES2022)).toBeUndefined();
    return createProgram(...args);
  }) as typeof createProgram);
  const result = project.declarationOutput(join(root, 'types'));
  expect(result.diagnostics).toEqual([]);
  expect(result.files.find((output) => output.filename.endsWith('.d.ts'))!.text).toContain(
    'value = 42',
  );
});
