import { readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
const [mode, ...args] = process.argv.slice(2);
switch (mode) {
  case 'argv':
    process.stdout.write(JSON.stringify(args));
    break;
  case 'env':
    process.stdout.write(JSON.stringify({ cwd: process.cwd(), env: process.env }));
    break;
  case 'echo':
    process.stdin.pipe(process.stdout);
    break;
  case 'none':
    process.stdout.write(String(readFileSync(0).length));
    break;
  case 'binary':
    process.stdout.write(Buffer.from([255, 97]));
    break;
  case 'unicode-split': {
    const bytes = Buffer.from('🪶');
    process.stdout.write(bytes.subarray(0, 2));
    setTimeout(() => process.stdout.write(bytes.subarray(2)), 20);
    break;
  }
  case 'unicode':
    process.stdout.write('🪶');
    break;
  case 'exit':
    process.stdout.write('out');
    process.stderr.write('err');
    process.exitCode = Number(args[0]);
    break;
  case 'signal':
    process.kill(process.pid, 'SIGTERM');
    break;
  case 'large': {
    const size = Number(args[0]);
    process.stdout.write(Buffer.alloc(size, 97));
    process.stderr.write(Buffer.alloc(size, 98));
    break;
  }
  case 'descendant': {
    const child = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], {
      stdio: ['ignore', 1, 2],
    });
    writeFileSync(args[0], String(child.pid));
    child.unref();
    break;
  }
  case 'early-input':
    process.stdin.destroy();
    process.exit(0);
    break;
  case 'wait':
  case 'ignore-term':
  case 'graceful': {
    if (mode === 'ignore-term') process.on('SIGTERM', () => {});
    if (mode === 'graceful') process.on('SIGTERM', () => setTimeout(() => process.exit(0), 10));
    process.stdout.write('ready');
    writeFileSync(args[0], String(process.pid));
    setInterval(() => {}, 1000);
    break;
  }
  default:
    throw Error('Unknown fixture mode');
}
