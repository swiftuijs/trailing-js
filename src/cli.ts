#!/usr/bin/env node
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { transform } from './compiler';
import { transpile } from './transpile';
import { loadConfig } from './config';
import { TwillProject } from './project';

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
    },
  });
  const [command, input, ...extra] = positionals;
  if (values.help || !command) {
    console.log(
      'twill compile <file> [-o output.ts] [--js]\ntwill check [-p tsconfig.json] [--json]\n\ncompile keeps TypeScript types by default; --js erases types and lowers JSX.\nBoth commands read twill.config.json from the project root.',
    );
    return 0;
  }
  if (extra.length) throw new Error('Unexpected arguments: ' + extra.join(' '));
  if (command === 'check') {
    if (input) throw new Error('Use --project <tsconfig.json> with check');
    const project = new TwillProject(resolve(values.project ?? 'tsconfig.json'));
    try {
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
  const options = { ...loadConfig(root), filename };
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

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error(error.message);
    if (error.frame) console.error(error.frame);
    process.exitCode = 1;
  });
