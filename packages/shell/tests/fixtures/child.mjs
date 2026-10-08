import { readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { spawn } from 'node:child_process';
const [mode, ...args] = process.argv.slice(2);
function writePid(path) {
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, String(process.pid));
  renameSync(temporary, path);
}
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
    // Detached processes escape Windows' native kill-on-parent-exit job.
    // Wait for actual child startup before letting the parent exit.
    const child = spawn(
      process.execPath,
      [
        '-e',
        `
      const {writeFileSync,renameSync}=require('node:fs');
      void process.stdout;void process.stderr;
      setInterval(()=>{},1000);
      const temporary=process.argv[1]+'.'+process.pid+'.tmp';writeFileSync(temporary,String(process.pid));renameSync(temporary,process.argv[1]);
    `,
        '--',
        args[0],
      ],
      { detached: true, stdio: ['ignore', 1, 2] },
    );
    child.unref();
    await new Promise((resolve, reject) => {
      const interval = setInterval(() => {
        if (existsSync(args[0])) {
          clearInterval(interval);
          resolve();
        }
      }, 5);
      child.once('error', (error) => {
        clearInterval(interval);
        reject(error);
      });
      child.once('exit', () => {
        clearInterval(interval);
        reject(Error('Descendant exited before parent'));
      });
    });
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
    writePid(args[0]);
    setInterval(() => {}, 1000);
    break;
  }
  default:
    throw Error('Unknown fixture mode');
}
