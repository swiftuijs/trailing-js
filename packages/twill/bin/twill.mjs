#!/usr/bin/env node
const args = process.argv.slice(2);
const first = args[0];
const commands = new Set(['compile', 'check', 'doctor', 'declarations', 'export']);
if (
  first === 'run' ||
  first === '--' ||
  (first && !first.startsWith('-') && !commands.has(first))
) {
  const usage = 'Usage: twill [run] <script> [arguments...]';
  if (first === 'run' && (args[1] === '--help' || args[1] === '-h')) {
    console.log(usage);
  } else {
    let index = first === 'run' || first === '--' ? 1 : 0;
    if (first === 'run' && args[index] === '--') index++;
    if (!args[index]) {
      console.error(usage);
      process.exitCode = 1;
    } else {
      const { run } = await import('./run.mjs');
      await run(args[index], args.slice(index + 1));
    }
  }
} else {
  const { main } = await import('../dist/cli.js');
  main(args)
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(error.message);
      if (error.frame) console.error(error.frame);
      process.exitCode = 1;
    });
}
