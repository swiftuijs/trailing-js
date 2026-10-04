import ts from 'typescript';
import MagicString from 'magic-string';
import remapping from '@ampproject/remapping';
import { resolve, dirname, basename, relative } from 'node:path';
import { mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { TwillProject, type ProjectDiagnostic, sourceFilename } from './project.js';

export interface DeclarationOptions {
  outDir?: string;
  build?: boolean;
  declarationMap?: boolean;
}
export interface DeclarationBuild {
  projects: string[];
  files: string[];
  diagnostics: ProjectDiagnostic[];
}

const moduleName = (value: string) =>
  value
    .replace(/\.twillx?(?:\.tsx?)?$/, '.js')
    .replace(/\.(?:tsx?|jsx)$/, '.js')
    .replace(/\.(m|c)ts$/, '.$1js');
const outputName = (filename: string) => filename.replace(/\.twillx?\.d\.ts(?=\.map$|$)/, '.d.ts');
function moduleEdits(
  text: string,
  filename: string,
  source: string | undefined,
  redirects: ReadonlyMap<string, string>,
) {
  const file = ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true);
  const edits = new MagicString(text);
  const visit = (node: ts.Node) => {
    if (ts.isStringLiteral(node)) {
      const parent = node.parent;
      if (
        ((ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) &&
          parent.moduleSpecifier === node) ||
        ts.isExternalModuleReference(parent) ||
        (ts.isLiteralTypeNode(parent) && ts.isImportTypeNode(parent.parent))
      ) {
        let value = moduleName(node.text);
        if (source && node.text.startsWith('.')) {
          const base = sourceFilename(resolve(dirname(source), node.text));
          const target = [
            base,
            ...['.twill', '.twillx', '.ts', '.tsx', '.mts', '.cts', '.js'].map((ext) => base + ext),
          ]
            .map((candidate) => redirects.get(candidate))
            .find(Boolean);
          if (target) {
            value = relative(dirname(filename), target)
              .replaceAll('\\', '/')
              .replace(/\.d\.(ts|mts|cts)$/, (_, extension: string) =>
                extension === 'ts' ? '.js' : extension === 'mts' ? '.mjs' : '.cjs',
              );
            if (!value.startsWith('.')) value = './' + value;
          }
        }
        if (value !== node.text) edits.overwrite(node.getStart() + 1, node.end - 1, value);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return edits;
}

/** Emits ordinary declaration files; a reference build visits dependencies first.
 * No output is written for a project with syntax, type or emit errors. */
export function emitDeclarations(
  tsconfig: string,
  options: DeclarationOptions = {},
): DeclarationBuild {
  const result: DeclarationBuild = { projects: [], files: [], diagnostics: [] };
  const visited = new Set<string>();
  const active = new Set<string>();
  const redirects = new Map<string, string>();
  const build = (config: string, root: boolean) => {
    config = sourceFilename(resolve(config));
    if (active.has(config)) throw new Error(`Circular project reference: ${config}`);
    if (visited.has(config)) return;
    active.add(config);
    const parsed = ts.getParsedCommandLineOfConfigFile(
      config,
      {},
      {
        ...ts.sys,
        getCurrentDirectory: () => dirname(config),
        onUnRecoverableConfigFileDiagnostic() {},
      },
    );
    if (options.build)
      for (const reference of parsed?.projectReferences ?? [])
        build(ts.resolveProjectReferencePath(reference), false);
    active.delete(config);
    visited.add(config);
    if (result.diagnostics.some((item) => item.category === 'error')) return;
    const project = new TwillProject(config, {}, { declarationRedirects: redirects });
    try {
      const outDir = resolve(
        (root && options.outDir) ||
          parsed?.options.declarationDir ||
          parsed?.options.outDir ||
          resolve(project.root, 'dist'),
      );
      const emitted = project.declarationOutput(outDir, options.declarationMap ?? true);
      result.diagnostics.push(...emitted.diagnostics);
      if (emitted.diagnostics.some((item) => item.category === 'error')) return;
      const inputs = new Set(
        project
          .sourceFiles()
          .map((file) => (ts.sys.useCaseSensitiveFileNames ? file : file.toLowerCase())),
      );
      const files = new Map<string, { text: string; sources: string[] }>();
      const edits = new Map<string, MagicString>();
      const projectRedirects = new Map(redirects);
      const outputKeys = new Set<string>();
      for (const file of emitted.files)
        if (!file.filename.endsWith('.map'))
          for (const source of file.sources)
            projectRedirects.set(source, outputName(file.filename));
      for (const file of emitted.files) {
        const filename = outputName(file.filename);
        const key = ts.sys.useCaseSensitiveFileNames ? filename : filename.toLowerCase();
        if (inputs.has(key))
          throw new Error(`Declaration output would overwrite source: ${filename}`);
        if (outputKeys.has(key)) throw new Error(`Declaration output collision: ${filename}`);
        outputKeys.add(key);
        if (!filename.endsWith('.map')) {
          const changed = moduleEdits(file.text, filename, file.sources[0], projectRedirects);
          edits.set(filename, changed);
          files.set(filename, {
            text: changed
              .toString()
              .replace(/(sourceMappingURL=.*)\.twillx?\.d\.ts\.map/g, '$1.d.ts.map'),
            sources: file.sources,
          });
        } else files.set(filename, { text: file.text, sources: file.sources });
      }
      for (const [filename, file] of files)
        if (filename.endsWith('.map')) {
          const declaration = filename.slice(0, -4);
          const originalMap = JSON.parse(file.text);
          const source = sourceFilename(
            resolve(
              dirname(filename),
              originalMap.sourceRoot ?? '',
              decodeURIComponent(originalMap.sources[0] ?? ''),
            ),
          );
          const transformed = project.transformed(source);
          const changed = edits.get(declaration)!;
          const maps: any[] = [
            changed.generateMap({ source: declaration, hires: true, includeContent: true }),
            originalMap,
          ];
          if (transformed) maps.push(transformed.map);
          const combined = remapping(maps as any, () => null);
          combined.file = basename(declaration);
          combined.sources = combined.sources.map(() =>
            relative(dirname(filename), source).replaceAll('\\', '/'),
          );
          file.text = JSON.stringify(combined);
        }
      for (const [filename, file] of files) {
        mkdirSync(dirname(filename), { recursive: true });
        const staging = filename + '.twill-tmp';
        writeFileSync(staging, file.text);
        renameSync(staging, filename);
        result.files.push(filename);
        if (!filename.endsWith('.map'))
          for (const source of file.sources) redirects.set(source, filename);
      }
      result.projects.push(config);
    } finally {
      project.dispose();
    }
  };
  build(tsconfig, true);
  return result;
}
