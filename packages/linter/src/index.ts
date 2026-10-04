import {
  transform,
  originalPosition,
  generatedPosition,
  type TransformResult,
} from '@swiftuijs/twill';
import { TwillProject, virtualFilename, sourceFilename } from '@swiftuijs/twill/project';
import * as parser from '@typescript-eslint/parser';
import typescriptPlugin from '@typescript-eslint/eslint-plugin';
import js from '@eslint/js';
import ts from 'typescript';
import { loadConfig } from '@swiftuijs/twill/config';
import { dirname, resolve } from 'node:path';
import { statSync } from 'node:fs';
import type { ESLint, Linter, Rule } from 'eslint';

type State = {
  source: string;
  filename: string;
  result?: TransformResult;
  error?: any;
  original: ts.SourceFile;
  generated?: ts.SourceFile;
  project?: TwillProject;
};
const pending = new Map<string, State>();
const projects = new Map<string, { project: TwillProject; times: Map<string, number> }>();
const normalize = (filename: string) => filename.replaceAll('\\', '/');
const stamp = (filename: string) => {
  try {
    return statSync(filename).mtimeMs;
  } catch {
    return -1;
  }
};

function projectFor(filename: string) {
  const config = ts.findConfigFile(dirname(filename), ts.sys.fileExists);
  if (!config) throw new Error('Typed Twill linting requires a tsconfig.json.');
  let cached = projects.get(config);
  if (
    cached &&
    cached.project.configFiles.some((file) => cached!.times.get(file) !== stamp(file))
  ) {
    cached.project.dispose();
    projects.delete(config);
    cached = undefined;
  }
  if (!cached) {
    cached = { project: new TwillProject(config), times: new Map() };
    for (const file of cached.project.configFiles) cached.times.set(file, stamp(file));
    if (projects.size >= 8) {
      const oldest = projects.keys().next().value!;
      projects.get(oldest)!.project.dispose();
      projects.delete(oldest);
    }
    projects.set(config, cached);
  }
  for (const file of cached.project.sourceFiles()) {
    const time = stamp(file);
    if (cached.times.has(file) && cached.times.get(file) !== time) cached.project.refresh(file);
    cached.times.set(file, time);
  }
  return cached.project;
}

// MagicString maps use LF lines; ESLint/TypeScript also count CR and Unicode
// separators. Convert absolute offsets at that boundary, not reported lines.
const lfPosition = (text: string, offset: number) => {
  const prefix = text.slice(0, offset);
  return { line: prefix.split('\n').length, column: offset - prefix.lastIndexOf('\n') - 1 };
};
const lfOffset = (text: string, line: number, column: number) => {
  let start = 0;
  for (let index = 1; index < line; index++) start = text.indexOf('\n', start) + 1;
  return start + column;
};
function originalOffset(state: State, offset: number) {
  const position = lfPosition(state.result!.code, offset);
  const point = originalPosition(state.result!, position.line, position.column);
  return point.line == null || point.column == null
    ? undefined
    : lfOffset(state.source, point.line, point.column);
}
function fix(state: State, value: Rule.Fix | undefined): Rule.Fix | undefined {
  if (!value) return undefined;
  const [start, end] = value.range;
  const offset = originalOffset(state, start);
  if (offset === undefined) return undefined;
  const position = lfPosition(state.source, offset);
  const generated = generatedPosition(state.result!, position.line, position.column);
  if (
    generated.line == null ||
    generated.column == null ||
    lfOffset(state.result!.code, generated.line, generated.column) !== start ||
    state.source.slice(offset, offset + end - start) !== state.result!.code.slice(start, end)
  )
    return undefined;
  return { range: [offset, offset + end - start], text: value.text };
}

const processor: Linter.Processor = {
  supportsAutofix: true,
  preprocess(source, filename) {
    filename = normalize(filename);
    const state: State = {
      source,
      filename,
      original: ts.createSourceFile(filename, source, ts.ScriptTarget.Latest),
    };
    pending.set(filename, state);
    try {
      // A project supplies the same inherited JSX settings as builds/checking.
      const config = ts.findConfigFile(dirname(filename), ts.sys.fileExists);
      state.result = transform(source, {
        ...loadConfig(config ? dirname(config) : dirname(filename)),
        filename,
      });
      state.generated = ts.createSourceFile(
        filename + '.ts',
        state.result.code,
        ts.ScriptTarget.Latest,
      );
      return [
        {
          text: state.result.code,
          filename: filename.endsWith('.twillx') ? 'source.tsx' : 'source.ts',
        },
      ];
    } catch (error) {
      state.error = error;
      return [];
    }
  },
  postprocess(lists, filename) {
    filename = normalize(filename);
    const state = pending.get(filename)!;
    pending.delete(filename);
    state.project?.update(filename);
    if (state.error)
      return [
        {
          ruleId: null,
          severity: 2,
          fatal: true,
          message: state.error.message,
          line: state.error.line ?? 1,
          column: (state.error.column ?? 0) + 1,
        },
      ];
    return lists.flat().flatMap((message) => {
      if (!message.line || !message.column) return [message];
      const generated = state.generated!;
      const start = generated.getPositionOfLineAndCharacter(message.line - 1, message.column - 1);
      const offset = originalOffset(state, start);
      if (
        offset === undefined ||
        (start < state.result!.code.length && state.result!.code[start] !== state.source[offset])
      )
        return [];
      const position = state.original.getLineAndCharacterOfPosition(offset);
      const endOffset =
        message.endLine && message.endColumn
          ? originalOffset(
              state,
              generated.getPositionOfLineAndCharacter(message.endLine - 1, message.endColumn - 1),
            )
          : undefined;
      const end =
        endOffset === undefined
          ? undefined
          : state.original.getLineAndCharacterOfPosition(endOffset);
      return [
        {
          ...message,
          line: position.line + 1,
          column: position.character + 1,
          endLine: end && end.line + 1,
          endColumn: end && end.character + 1,
          fix: fix(state, message.fix),
          suggestions: message.suggestions?.flatMap((suggestion) => {
            const mapped = fix(state, suggestion.fix);
            return mapped ? [{ ...suggestion, fix: mapped }] : [];
          }),
        },
      ];
    });
  },
};

const virtualParser = {
  meta: { name: '@swiftuijs/twill-linter/parser', version: '0.7.0' },
  parseForESLint(code: string, options: any) {
    const original = normalize(options.filePath ?? '').replace(/\/(?:\d+_)?source\.tsx?$/, '');
    const state = pending.get(original);
    if (!state) return parser.parseForESLint(code, options);
    const typed = options.projectService || options.project || options.programs;
    if (!typed) return parser.parseForESLint(code, options);
    const project = projectFor(original);
    project.update(original, state.source);
    state.project = project;
    return parser.parseForESLint(code, {
      ...options,
      filePath: virtualFilename(original),
      projectService: false,
      project: undefined,
      programs: [project.service.getProgram()!],
    });
  },
};

const plugin: ESLint.Plugin & { configs: Record<string, Linter.Config[]> } = {
  meta: { name: '@swiftuijs/twill-linter', version: '0.7.0' },
  processors: { twill: processor },
  configs: {} as Record<string, Linter.Config[]>,
};
const files = ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts'];
function configuration(typed: boolean): Linter.Config[] {
  const recommended = typescriptPlugin.configs[
    typed ? 'flat/recommended-type-checked' : 'flat/recommended'
  ] as Linter.Config[];
  return [
    js.configs.recommended,
    { files: ['**/*.twill', '**/*.twillx'], plugins: { twill: plugin }, processor: 'twill/twill' },
    ...recommended.map((config) => ({
      ...config,
      files,
      languageOptions: {
        ...config.languageOptions,
        parser: virtualParser,
        ...(typed ? { parserOptions: { projectService: true } } : {}),
      },
    })),
  ];
}
plugin.configs.recommended = configuration(false);
plugin.configs.recommendedTypeChecked = configuration(true);
export const configs: Record<string, Linter.Config[]> = plugin.configs;
export const processors: Record<string, Linter.Processor> = { twill: processor };
export function disposeProjects() {
  for (const { project } of projects.values()) project.dispose();
  projects.clear();
  pending.clear();
}
export default plugin;
