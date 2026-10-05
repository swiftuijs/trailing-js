import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { exportProject } from './index.js';

async function main() {
  const { values, positionals } = parseArgs({
    options: {
      project: { type: 'string', short: 'p' },
      out: { type: 'string', short: 'o' },
      'dry-run': { type: 'boolean', default: false },
      json: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help) {
    console.log(
      'twill-migrate -p tsconfig.json -o ../native-project [--dry-run] [--json]\nExports checked sources into a new directory outside the input project. Originals remain intact.',
    );
    return;
  }
  if (positionals.length || !values.out)
    throw new Error('Specify --out <new directory>. Use --help for usage.');
  const result = await exportProject(resolve(values.project ?? 'tsconfig.json'), {
    outDir: resolve(values.out),
    dryRun: values['dry-run'],
  });
  if (values.json) console.log(JSON.stringify(result, null, 2));
  else {
    for (const diagnostic of result.diagnostics)
      console.error(
        `${diagnostic.filename ?? 'tsconfig'}:${diagnostic.line}:${diagnostic.column + 1} TS${diagnostic.code}: ${diagnostic.message}`,
      );
    if (!result.diagnostics.some((item) => item.category === 'error'))
      console.log(
        `${result.written ? 'Exported' : 'Planned'} ${result.files.length} files; native config: ${result.tsconfig}`,
      );
  }
  if (result.diagnostics.some((item) => item.category === 'error')) process.exitCode = 1;
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
