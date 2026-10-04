import ts from 'typescript';
import metadata from '../package.json';
import { TwillProject } from './project';
import { isTwillFile } from './compiler';

/** Shareable diagnostics without source contents or environment-variable values. */
export function inspectProject(project: TwillProject, filename?: string) {
  const started = performance.now();
  const diagnostics = project.diagnostics(filename);
  const files = project.sourceFiles();
  return {
    twillVersion: metadata.version,
    typescriptVersion: ts.version,
    nodeVersion: process.version,
    root: project.root,
    configFiles: project.configFiles,
    compilerOptions: project.compilerOptions,
    files: {
      total: files.length,
      twill: files.filter(isTwillFile).length,
      native: files.filter((file) => !isTwillFile(file)).length,
    },
    sourceFiles: files,
    diagnostics,
    diagnosticTimeMs: performance.now() - started,
    ok: !diagnostics.some((diagnostic) => diagnostic.category === 'error'),
  };
}
