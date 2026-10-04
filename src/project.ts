import ts from 'typescript';
import { resolve, dirname, extname } from 'node:path';
import {
  transform,
  extensions,
  isTrailingFile,
  inferLanguage,
  originalPosition,
  generatedPosition,
  type TransformOptions,
  type TransformResult,
} from './compiler';
import { loadConfig } from './config';
import { recoverTransform } from './recovery';

// TypeScript's config discovery accepts custom TS extensions only as Deferred;
// each virtual filename below supplies the actual script kind to the service.
const extraExtensions = extensions.map((extension) => ({
  extension,
  isMixedContent: false,
  scriptKind: ts.ScriptKind.Deferred,
}));
export function virtualFilename(filename: string): string {
  filename = filename.replaceAll('\\', '/');
  return isTrailingFile(filename)
    ? filename + { ts: '.ts', tsx: '.tsx', js: '.js', jsx: '.jsx' }[inferLanguage(filename)]
    : filename;
}
export function sourceFilename(filename: string): string {
  return filename.replaceAll('\\', '/').replace(/(\.(?:tts|tjs|ttsx|tjsx))\.(?:tsx?|jsx?)$/, '$1');
}

export interface ProjectDiagnostic {
  filename?: string;
  line: number;
  column: number;
  length: number;
  code: number;
  category: 'error' | 'warning' | 'message';
  message: string;
}

/** A virtual-source TypeScript project shared by the CLI and VS Code extension. */
export class TrailingProject {
  readonly root: string;
  readonly service: ts.LanguageService;
  readonly compilerOptions: ts.CompilerOptions;
  private files: string[];
  private overlays = new Map<string, string>();
  private results = new Map<string, { source: string; result: TransformResult }>();
  private version = 0;
  private configurationErrors: readonly ts.Diagnostic[];
  private options: TransformOptions;
  private readonly host: ts.LanguageServiceHost;
  private recover: boolean;

  constructor(
    tsconfig: string,
    options: TransformOptions = {},
    projectOptions: { inferred?: boolean; recover?: boolean } = {},
  ) {
    const configFile = sourceFilename(resolve(tsconfig));
    this.root = dirname(configFile);
    this.recover = projectOptions.recover ?? false;
    this.options = { ...loadConfig(this.root), ...options };
    const raw =
      projectOptions.inferred && !ts.sys.fileExists(configFile)
        ? {
            config: {
              compilerOptions: {
                strict: true,
                target: 'ES2022',
                module: 'ESNext',
                moduleResolution: 'Bundler',
                jsx: 'react-jsx',
              },
            },
          }
        : ts.readConfigFile(configFile, ts.sys.readFile);
    const parsed = ts.parseJsonConfigFileContent(
      raw.config ?? {},
      ts.sys,
      this.root,
      { allowJs: true, allowImportingTsExtensions: true, noEmit: true },
      configFile,
      undefined,
      extraExtensions,
    );
    this.configurationErrors = [...(raw.error ? [raw.error] : []), ...parsed.errors];
    if (parsed.projectReferences?.length)
      this.configurationErrors = [
        ...this.configurationErrors,
        {
          category: ts.DiagnosticCategory.Error,
          code: 90002,
          file: undefined,
          start: undefined,
          length: undefined,
          messageText:
            'TypeScript project references are not supported by trailing-js check. Check each referenced project separately.',
        },
      ];
    this.compilerOptions = parsed.options;
    this.files = parsed.fileNames.map(virtualFilename);
    const readFile = (name: string) => {
      const original = sourceFilename(name);
      const source = this.overlays.get(original) ?? ts.sys.readFile(original);
      if (source === undefined) return undefined;
      if (!isTrailingFile(original)) return source;
      // Syntax failures are reported separately, with original source positions.
      // Keep the service alive so other open documents still work.
      try {
        return this.result(original, source).code;
      } catch {
        return '';
      }
    };
    const fileExists = (name: string) =>
      this.overlays.has(sourceFilename(name)) || ts.sys.fileExists(sourceFilename(name));
    const resolutionHost: ts.ModuleResolutionHost = { ...ts.sys, readFile, fileExists };
    this.host = {
      ...ts.sys,
      getScriptFileNames: () => this.files,
      useCaseSensitiveFileNames: () => ts.sys.useCaseSensitiveFileNames,
      getScriptVersion: () => String(this.version),
      getProjectVersion: () => String(this.version),
      getScriptSnapshot: (name) => {
        const text = readFile(name);
        return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text);
      },
      getCurrentDirectory: () => this.root,
      getCompilationSettings: () => this.compilerOptions,
      getDefaultLibFileName: (opts) => ts.getDefaultLibFilePath(opts),
      readFile,
      fileExists,
      resolveModuleNames: (names, importer) =>
        names.map((name) => {
          const resolved = ts.resolveModuleName(
            name,
            importer,
            this.compilerOptions,
            resolutionHost,
          ).resolvedModule;
          if (resolved) return resolved;
          if (name.startsWith('.') || name.startsWith('/')) {
            const base = resolve(dirname(sourceFilename(importer)), name);
            const candidates = isTrailingFile(base)
              ? [base]
              : extensions.flatMap((extension) => [
                  base + extension,
                  resolve(base, 'index' + extension),
                ]);
            for (const candidate of candidates) {
              if (fileExists(candidate)) {
                const file = virtualFilename(candidate);
                const extension =
                  extname(file) === '.tsx'
                    ? ts.Extension.Tsx
                    : extname(file) === '.js'
                      ? ts.Extension.Js
                      : ts.Extension.Ts;
                return { resolvedFileName: file, extension, isExternalLibraryImport: false };
              }
            }
          }
          return undefined;
        }),
    };
    this.service = ts.createLanguageService(this.host);
  }

  private result(filename: string, source: string): TransformResult {
    const cached = this.results.get(filename);
    if (cached?.source === source) return cached.result;
    const result = (this.recover ? recoverTransform : transform)(source, {
      ...this.options,
      filename,
    });
    this.results.set(filename, { source, result });
    return result;
  }

  update(filename: string, text?: string) {
    filename = sourceFilename(resolve(filename));
    if (text === undefined) this.overlays.delete(filename);
    else this.overlays.set(filename, text);
    if (!this.files.includes(virtualFilename(filename))) this.files.push(virtualFilename(filename));
    this.results.delete(filename);
    this.version++;
  }

  invalidate() {
    this.version++;
    this.results.clear();
  }

  text(filename: string): string | undefined {
    filename = sourceFilename(resolve(filename));
    return this.overlays.get(filename) ?? ts.sys.readFile(filename);
  }

  transformed(filename: string): TransformResult | undefined {
    filename = sourceFilename(resolve(filename));
    const source = this.text(filename);
    return source !== undefined && isTrailingFile(filename)
      ? this.result(filename, source)
      : undefined;
  }

  toGeneratedOffset(filename: string, offset: number): number {
    const result = this.transformed(filename);
    if (!result) return offset;
    const source = this.text(filename)!;
    const before = source.slice(0, offset).split('\n');
    const position = generatedPosition(result, before.length, before.at(-1)!.length);
    if (position.line === null || position.column === null) return offset;
    return (
      result.code
        .split('\n')
        .slice(0, position.line - 1)
        .reduce((total, line) => total + line.length + 1, 0) + position.column
    );
  }

  toOriginalOffset(filename: string, offset: number): number {
    const result = this.transformed(filename);
    if (!result) return offset;
    const before = result.code.slice(0, offset).split('\n');
    const position = originalPosition(result, before.length, before.at(-1)!.length);
    if (position.line === null || position.column === null) return 0;
    return (
      this.text(filename)!
        .split('\n')
        .slice(0, position.line - 1)
        .reduce((total, line) => total + line.length + 1, 0) + position.column
    );
  }

  private diagnostic(diagnostic: ts.Diagnostic): ProjectDiagnostic {
    const filename = diagnostic.file ? sourceFilename(diagnostic.file.fileName) : undefined;
    const source = filename ? (this.text(filename) ?? '') : '';
    const start = filename ? this.toOriginalOffset(filename, diagnostic.start ?? 0) : 0;
    const end = filename
      ? this.toOriginalOffset(filename, (diagnostic.start ?? 0) + (diagnostic.length ?? 1))
      : start + 1;
    const before = source.slice(0, start).split('\n');
    return {
      filename,
      line: before.length,
      column: before.at(-1)!.length,
      length: Math.max(1, end - start),
      code: diagnostic.code,
      category:
        diagnostic.category === ts.DiagnosticCategory.Error
          ? 'error'
          : diagnostic.category === ts.DiagnosticCategory.Warning
            ? 'warning'
            : 'message',
      message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
    };
  }

  diagnostics(filename?: string): ProjectDiagnostic[] {
    const result = this.configurationErrors.map((error) => this.diagnostic(error));
    if (!filename)
      result.push(
        ...this.service.getCompilerOptionsDiagnostics().map((error) => this.diagnostic(error)),
      );
    const files = filename ? [virtualFilename(resolve(filename))] : this.files;
    for (const file of files) {
      if (/\.d\.[cm]?ts$/.test(file)) continue;
      try {
        if (this.recover && isTrailingFile(sourceFilename(file)))
          transform(this.text(file) ?? '', { ...this.options, filename: sourceFilename(file) });
        this.transformed(file);
        result.push(
          ...[
            ...this.service.getSyntacticDiagnostics(file),
            ...this.service.getSemanticDiagnostics(file),
          ].map((error) => this.diagnostic(error)),
        );
      } catch (error) {
        const syntax = error as { message: string; line?: number; column?: number };
        result.push({
          filename: sourceFilename(file),
          line: syntax.line ?? 1,
          column: syntax.column ?? 0,
          length: 1,
          code: 90001,
          category: 'error',
          message: syntax.message,
        });
      }
    }
    return result;
  }

  dispose() {
    this.service.dispose();
  }
}
