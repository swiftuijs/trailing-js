import ts from 'typescript';
import MagicString from 'magic-string';
import { TwillProject, isDependency, sourceFilename } from '@swiftuijs/twill/project';
import { isTwillFile } from '@swiftuijs/twill';
import { formatGenerated } from '@swiftuijs/twill-formatter';
import type { ProjectDiagnostic } from '@swiftuijs/twill/project';
import {
  readFileSync,
  realpathSync,
  lstatSync,
  statSync,
  mkdirSync,
  writeFileSync,
  rmSync,
} from 'node:fs';
import { resolve, relative, dirname, isAbsolute, basename, join } from 'node:path';

export interface ExportOptions {
  outDir: string;
  dryRun?: boolean;
}
export interface ExportFile {
  source: string;
  output: string;
  kind: 'dialect' | 'native' | 'asset';
}
export interface ExportResult {
  sourceRoot: string;
  outDir: string;
  tsconfig: string;
  files: ExportFile[];
  diagnostics: ProjectDiagnostic[];
  written: boolean;
}
const nativeName = (name: string) => name.replace(/\.twillx$/, '.tsx').replace(/\.twill$/, '.ts');
const portable = (path: string) => path.replaceAll('\\', '/');
const inside = (root: string, path: string) => {
  const name = relative(root, path);
  return (
    !isAbsolute(name) &&
    name !== '..' &&
    !name.startsWith('..' + (process.platform === 'win32' ? '\\' : '/'))
  );
};
function exists(path: string) {
  try {
    lstatSync(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}
function canonical(path: string): string {
  return exists(path) ? realpathSync(path) : join(canonical(dirname(path)), basename(path));
}

/** Export checked source files, not application dependencies or bundler configuration.
 * Preflight finishes before creating an exclusively owned destination directory. */
export async function exportProject(
  tsconfig: string,
  options: ExportOptions,
): Promise<ExportResult> {
  tsconfig = resolve(tsconfig);
  const root = dirname(tsconfig);
  const out = resolve(options.outDir);
  const realRoot = realpathSync(root);
  const realOut = canonical(out);
  if (
    inside(root, out) ||
    inside(out, root) ||
    inside(realRoot, realOut) ||
    inside(realOut, realRoot)
  )
    throw new Error('Export directory must be outside the source project and cannot contain it.');
  if (exists(out)) throw new Error(`Export directory already exists: ${out}`);
  const result: ExportResult = {
    sourceRoot: root,
    outDir: out,
    tsconfig: join(out, 'tsconfig.json'),
    files: [],
    diagnostics: [],
    written: false,
  };
  const project = new TwillProject(tsconfig);
  try {
    result.diagnostics = project.diagnostics();
    if (result.diagnostics.some((item) => item.category === 'error')) return result;
    const parsed = ts.getParsedCommandLineOfConfigFile(
      tsconfig,
      {},
      { ...ts.sys, onUnRecoverableConfigFileDiagnostic() {} },
    );
    const raw = ts.readConfigFile(tsconfig, ts.sys.readFile).config;
    if (!parsed || !raw) throw new Error(`Could not read export configuration: ${tsconfig}`);
    if (parsed.options.paths && !parsed.options.baseUrl && !raw.compilerOptions?.paths)
      throw new Error('Inherited path aliases need an explicit baseUrl for source export.');
    const content = new Map<string, string | Buffer>();
    const targets = new Map<string, string>();
    const names = new Set<string>(['tsconfig.json']);
    const moduleSources = new Map<string, string>();
    const sources = new Set([
      ...project.sourceFiles(),
      ...(project.service.getProgram()?.getSourceFiles() ?? [])
        .filter(
          (file) => !isDependency(file.fileName) && inside(root, sourceFilename(file.fileName)),
        )
        .map((file) => sourceFilename(file.fileName)),
    ]);
    const register = (source: string, kind: ExportFile['kind']) => {
      source = resolve(source);
      if (!inside(root, source) || !inside(realRoot, realpathSync(source)))
        throw new Error(`Source is outside the export project: ${source}`);
      const name = portable(nativeName(relative(root, source)));
      // Reject names that would collide on a case-insensitive filesystem too.
      const key = name.toLowerCase();
      const output = join(out, name);
      if (targets.has(source)) return targets.get(source)!;
      if (names.has(key)) throw new Error(`Native output filename collision: ${name}`);
      if (kind !== 'asset') {
        const stem = key.replace(/\.[cm]?[jt]sx?$/, '');
        const previous = moduleSources.get(stem);
        if (previous && (isTwillFile(source) || isTwillFile(previous)))
          throw new Error(`Native output module resolution collision: ${name}`);
        moduleSources.set(stem, source);
      }
      names.add(key);
      targets.set(source, output);
      result.files.push({ source, output, kind });
      return output;
    };
    for (const source of [...sources].sort())
      register(
        source,
        isTwillFile(source) ? 'dialect' : /\.[cm]?[jt]sx?$/.test(source) ? 'native' : 'asset',
      );
    for (let index = 0; index < result.files.length; index++) {
      const entry = result.files[index]!;
      if (entry.kind === 'asset') {
        content.set(entry.output, readFileSync(entry.source));
        continue;
      }
      const source = project.transformed(entry.source)?.code ?? project.text(entry.source)!;
      const file = ts.createSourceFile(entry.output, source, ts.ScriptTarget.Latest, true);
      const edits = new MagicString(source);
      const rewrite = (literal: ts.StringLiteralLike) => {
        const boundary = literal.text.search(/[?#]/);
        const path = boundary < 0 ? literal.text : literal.text.slice(0, boundary);
        const suffix = boundary < 0 ? '' : literal.text.slice(boundary);
        if (!path?.startsWith('.')) {
          if (isTwillFile(path))
            throw new Error(
              'Aliased dialect extension imports need relative paths before source export.',
            );
          return;
        }
        const target = resolve(dirname(entry.source), path);
        if (exists(target) && statSync(target).isFile() && !targets.has(target)) {
          if (/\.[cm]?[jt]sx?$|\.twillx?$/.test(target))
            throw new Error(`Imported source is missing from the checked graph: ${target}`);
          register(target, 'asset');
        }
        if (isTwillFile(path)) {
          const output = targets.get(target);
          if (!output)
            throw new Error(`Dialect import is missing from the export graph: ${literal.text}`);
          let value = portable(relative(dirname(entry.output), output));
          if (!value.startsWith('.')) value = './' + value;
          edits.overwrite(literal.getStart(file), literal.end, JSON.stringify(value + suffix));
        }
      };
      const visit = (node: ts.Node) => {
        if (
          (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
          node.moduleSpecifier &&
          ts.isStringLiteral(node.moduleSpecifier)
        )
          rewrite(node.moduleSpecifier);
        else if (
          ts.isImportTypeNode(node) &&
          ts.isLiteralTypeNode(node.argument) &&
          ts.isStringLiteral(node.argument.literal)
        )
          rewrite(node.argument.literal);
        else if (
          ts.isExternalModuleReference(node) &&
          node.expression &&
          ts.isStringLiteral(node.expression)
        )
          rewrite(node.expression);
        else if (
          ts.isCallExpression(node) &&
          node.expression.kind === ts.SyntaxKind.ImportKeyword
        ) {
          const argument = node.arguments[0];
          if (!argument || !ts.isStringLiteralLike(argument))
            throw new Error(
              'Computed dynamic imports need explicit module paths before source export.',
            );
          rewrite(argument);
        } else if (
          ts.isCallExpression(node) &&
          ts.isIdentifier(node.expression) &&
          node.expression.text === 'require' &&
          node.arguments.some(
            (argument) =>
              ts.isStringLiteralLike(argument) && /\.twillx?(?:[?#]|$)/.test(argument.text),
          )
        )
          throw new Error(
            'CommonJS dialect imports need conversion to ES module imports before source export.',
          );
        else if (
          ts.isCallExpression(node) &&
          ts.isPropertyAccessExpression(node.expression) &&
          ts.isMetaProperty(node.expression.expression) &&
          node.expression.name.text.startsWith('glob') &&
          node.arguments.some(
            (argument) => ts.isStringLiteralLike(argument) && argument.text.includes('.twill'),
          )
        )
          throw new Error('Dialect import globs need explicit module paths before source export.');
        ts.forEachChild(node, visit);
      };
      visit(file);
      content.set(
        entry.output,
        entry.kind === 'dialect'
          ? await formatGenerated(edits.toString(), { filepath: entry.output })
          : edits.toString(),
      );
    }
    const compilerOptions: Record<string, any> = {
      ...parsed.options,
      noEmit: true,
      allowJs: true,
      allowImportingTsExtensions: true,
    };
    for (const [key, values] of [
      ['target', ts.ScriptTarget],
      ['module', ts.ModuleKind],
      ['moduleResolution', ts.ModuleResolutionKind],
      ['moduleDetection', ts.ModuleDetectionKind],
      ['newLine', ts.NewLineKind],
    ] as const)
      if (typeof compilerOptions[key] === 'number')
        compilerOptions[key] = values[compilerOptions[key]];
    if (parsed.options.jsx !== undefined)
      compilerOptions.jsx = (
        {
          [ts.JsxEmit.Preserve]: 'preserve',
          [ts.JsxEmit.React]: 'react',
          [ts.JsxEmit.ReactNative]: 'react-native',
          [ts.JsxEmit.ReactJSX]: 'react-jsx',
          [ts.JsxEmit.ReactJSXDev]: 'react-jsxdev',
        } as Record<number, string>
      )[parsed.options.jsx];
    if (parsed.options.lib)
      compilerOptions.lib = parsed.options.lib.map((name) =>
        name.replace(/^lib\.(.*)\.d\.ts$/, '$1'),
      );
    if (parsed.options.newLine !== undefined)
      compilerOptions.newLine = parsed.options.newLine === ts.NewLineKind.LineFeed ? 'lf' : 'crlf';
    if (compilerOptions.plugins)
      compilerOptions.plugins = compilerOptions.plugins.filter(
        (plugin: { name: string }) =>
          !['@swiftuijs/twill', '@swiftuijs/twill-vscode-tsserver'].includes(plugin.name),
      );
    // The result is an independent checking config, with flattened inheritance.
    for (const key of [
      'configFile',
      'configFilePath',
      'pathsBasePath',
      'outDir',
      'declarationDir',
      'tsBuildInfoFile',
      'incremental',
      'composite',
    ])
      delete compilerOptions[key];
    for (const key of ['baseUrl', 'rootDir', 'rootDirs', 'typeRoots'] as const) {
      const value = parsed.options[key];
      if (value === undefined) continue;
      const rebase = (path: string) => {
        if (!inside(root, path))
          throw new Error(`Compiler option ${key} points outside the export project: ${path}`);
        return portable(relative(root, path)) || '.';
      };
      compilerOptions[key] = Array.isArray(value) ? value.map(rebase) : rebase(value);
    }
    if (compilerOptions.paths)
      compilerOptions.paths = Object.fromEntries(
        Object.entries(compilerOptions.paths as Record<string, string[]>).map(([key, values]) => [
          key,
          values.map(nativeName),
        ]),
      );
    const config = {
      compilerOptions,
      files: result.files
        .filter((file) => file.kind !== 'asset')
        .map((file) => portable(relative(out, file.output))),
    };
    content.set(result.tsconfig, JSON.stringify(config, null, 2) + '\n');
    if (!options.dryRun) {
      mkdirSync(dirname(out), { recursive: true });
      mkdirSync(out); // Exclusive claim: never overwrite another directory.
      try {
        for (const [filename, text] of content) {
          mkdirSync(dirname(filename), { recursive: true });
          writeFileSync(filename, text, { flag: 'wx' });
        }
      } catch (error) {
        rmSync(out, { recursive: true, force: true });
        throw error;
      }
      result.written = true;
    }
    return result;
  } finally {
    project.dispose();
  }
}
