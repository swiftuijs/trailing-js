import ts from 'typescript';
import { transpile, transpileNative } from './transpile.js';
import { loaderConfiguration } from './configuration.js';

export function compileModule(source: string, filename: string, dialect: boolean) {
  const { config, observations } = loaderConfiguration(filename);
  const result = dialect
    ? transpile(source, { ...config, filename }, ts.ScriptTarget.ES2022)
    : transpileNative(
        source,
        filename,
        undefined,
        undefined,
        config.jsxImportSource,
        ts.ScriptTarget.ES2022,
      );
  return {
    source:
      result.code +
      '\n//# sourceMappingURL=data:application/json;base64,' +
      Buffer.from(result.map).toString('base64'),
    observations,
  };
}
