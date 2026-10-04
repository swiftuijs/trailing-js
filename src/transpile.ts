import ts from 'typescript';
import remapping from '@ampproject/remapping';
import { transform, inferLanguage, type TransformOptions } from './compiler';

export function transpile(source: string, options: TransformOptions = {}) {
  const filename = options.filename ?? 'input.tts';
  const result = transform(source, options);
  const language = options.language ?? inferLanguage(filename);
  // Plain JavaScript needs no type erasure or JSX transform. Leave modern JS
  // (including comments and import attributes) to the host's target pipeline.
  if (language === 'js') return { code: result.code, map: result.map.toString() };
  const output = ts.transpileModule(result.code, {
    fileName: filename + (language.endsWith('x') ? '.tsx' : '.ts'),
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
  const map = remapping(
    [JSON.parse(output.sourceMapText!), JSON.parse(result.map.toString())],
    () => null,
  );
  return {
    code: output.outputText.replace(/^\/\/# sourceMappingURL=.*$/m, ''),
    map: map.toString(),
  };
}
