import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { transform } from './compiler.js';
import { transpile } from './transpile.js';
import { loadConfig } from './config.js';
import { TwillProject } from './project.js';
import { inspectProject } from './doctor.js';
import { emitDeclarations } from './declarations.js';

export async function main(args = process.argv.slice(2)): Promise<number> {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      out: { type: 'string', short: 'o' },
      project: { type: 'string', short: 'p' },
      js: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h' },
      json: { type: 'boolean', default: false },
      build: { type: 'boolean', default: false },
    },
  });
  const [command, input, ...extra] = positionals;
  if (values.help || !command) {
    console.log(
      'twill compile <file> [-o output.ts] [--js]\ntwill check [-p tsconfig.json] [--json]\ntwill doctor [-p tsconfig.json] [--json]\ntwill declarations [-p tsconfig.json] [-o dist] [--build] [--json]\n\ncompile keeps TypeScript types by default; --js erases types and lowers JSX.\nCommands use the optional twill.config.json from the project root.',
    );
    return 0;
  }
  if (extra.length) throw new Error('Unexpected arguments: ' + extra.join(' '));
  if (command === 'declarations') {
    if (input) throw new Error('Use --project <tsconfig.json> with declarations');
    const result = emitDeclarations(resolve(values.project ?? 'tsconfig.json'), {
      outDir: values.out,
      build: values.build,
    });
    if (values.json) console.log(JSON.stringify(result, null, 2));
    else {
      for (const diagnostic of result.diagnostics)
        console.error(
          `${diagnostic.filename ?? 'tsconfig'}:${diagnostic.line}:${diagnostic.column + 1} TS${diagnostic.code}: ${diagnostic.message}`,
        );
      if (!result.diagnostics.some((item) => item.category === 'error'))
        console.log(
          `Emitted ${result.files.length} declaration/map files from ${result.projects.length} projects.`,
        );
    }
    return result.diagnostics.some((item) => item.category === 'error') ? 1 : 0;
  }
  if (command === 'check' || command === 'doctor') {
    if (input) throw new Error('Use --project <tsconfig.json> with ' + command);
    const project = new TwillProject(resolve(values.project ?? 'tsconfig.json'));
    try {
      if (command === 'doctor') {
        const report = inspectProject(project);
        if (values.json) console.log(JSON.stringify(report, null, 2));
        else {
          console.log(
            `Twill ${report.twillVersion} / TypeScript ${report.typescriptVersion} / Node ${report.nodeVersion}`,
          );
          console.log(
            `Project: ${report.root}\nSources: ${report.files.twill} Twill, ${report.files.native} native\nDiagnostics: ${report.diagnostics.length} (${report.diagnosticTimeMs.toFixed(1)} ms)`,
          );
          for (const diagnostic of report.diagnostics)
            console.log(
              `${diagnostic.filename ?? 'tsconfig'}:${diagnostic.line}:${diagnostic.column + 1} TS${diagnostic.code}: ${diagnostic.message}`,
            );
          console.log('Use --json to save the complete project report.');
        }
        return report.ok ? 0 : 1;
      }
      const diagnostics = project.diagnostics();
      if (values.json) console.log(JSON.stringify(diagnostics, null, 2));
      else
        for (const diagnostic of diagnostics)
          console.error(
            `${diagnostic.filename ?? 'tsconfig'}:${diagnostic.line}:${diagnostic.column + 1} TS${diagnostic.code}: ${diagnostic.message}`,
          );
      return diagnostics.some((diagnostic) => diagnostic.category === 'error') ? 1 : 0;
    } finally {
      project.dispose();
    }
  }
  if (command !== 'compile' || !input)
    throw new Error('Expected compile <file> or check. Use --help for usage.');
  const filename = resolve(input);
  const root = values.project ? dirname(resolve(values.project)) : process.cwd();
  const options = {
    ...loadConfig(root, values.project ? resolve(values.project) : undefined),
    filename,
  };
  const source = readFileSync(filename, 'utf8');
  const result = values.js ? transpile(source, options) : transform(source, options);
  if (values.out) {
    const output = resolve(values.out);
    if (output === filename) throw new Error('Output must differ from input');
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(
      output,
      result.code + `\n//# sourceMappingURL=${output.split(/[\\/]/).at(-1)}.map\n`,
    );
    const map = JSON.parse(result.map.toString());
    map.file = output.split(/[\\/]/).at(-1);
    writeFileSync(output + '.map', JSON.stringify(map));
  } else process.stdout.write(result.code + '\n');
  return 0;
}
