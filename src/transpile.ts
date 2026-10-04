import ts from 'typescript';
import remapping from '@ampproject/remapping';
import MagicString from 'magic-string';
import { transform, inferLanguage, type TransformOptions } from './compiler';

export function transpile(source: string, options: TransformOptions = {}) {
  const filename = options.filename ?? 'input.twill';
  const result = transform(source, options);
  const language = options.language ?? inferLanguage(filename);
  return transpileNative(result.code, filename, language, result.map.toString());
}

/** Native source never goes through Twill's parser or implicit-return rules. */
export function transpileNative(
  source: string,
  filename: string,
  language = inferLanguage(filename),
  syntaxMap?: string,
) {
  // Plain JavaScript needs no type erasure or JSX transform. Leave modern JS
  // (including comments and import attributes) to the host's target pipeline.
  if (language === 'js')
    return {
      code: source,
      map:
        syntaxMap ??
        new MagicString(source)
          .generateMap({ source: filename, includeContent: true, hires: true })
          .toString(),
    };
  const output = ts.transpileModule(source, {
    fileName: syntaxMap ? filename + (language.endsWith('x') ? '.tsx' : '.ts') : filename,
    compilerOptions: {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.ReactJSX,
      sourceMap: true,
      inlineSources: true,
      isolatedModules: true,
      verbatimModuleSyntax: true,
    },
    reportDiagnostics: true,
  });
  const errors = output.diagnostics?.filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  );
  if (errors?.length)
    throw new Error(
      ts.formatDiagnostics(errors, {
        getCanonicalFileName: (name) => name,
        getCurrentDirectory: () => '',
        getNewLine: () => '\n',
      }),
    );
  const map = syntaxMap
    ? remapping([JSON.parse(output.sourceMapText!), JSON.parse(syntaxMap)], () => null).toString()
    : output.sourceMapText!;
  return {
    code: output.outputText.replace(/^\/\/# sourceMappingURL=.*$/m, ''),
    map,
  };
}
